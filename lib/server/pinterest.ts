import crypto from "node:crypto";

import { and, eq } from "drizzle-orm";

import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";
import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  oauthStates,
  pinterestAccounts,
  type pinterestAccounts as pinterestAccountsTable,
} from "@/lib/server/db";
import { AuthorizationError } from "@/lib/server/errors";
import { logError } from "@/lib/server/logger";
import { decryptSecret, encryptSecret } from "@/lib/server/security";
import {
  fetchAllBoards,
  fetchAllPins,
  createPinterestPin,
  getApiBaseUrl,
  requireEnv,
  type PinterestBoard,
  type PinterestPin,
} from "@/src/pinterest-api";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

const PINTEREST_OAUTH_FAILURE_MESSAGE =
  "Pinterest could not complete the connection. Please try again.";
const PINTEREST_REFRESH_FAILURE_MESSAGE =
  "Pinterest could not refresh the connection. Please reconnect Pinterest.";

type ConnectionRow = typeof pinterestAccountsTable.$inferSelect;

export type PinterestConnectionStatus =
  | "not_connected"
  | "active"
  | "expiring_soon"
  | "expired"
  | "reauthorization_required"
  | "revoked";

export type PinterestConnectionSummary = {
  status: PinterestConnectionStatus;
  accountLabel: string | null;
  scope: string[];
  autoSyncEnabled: boolean;
  lastSyncAttemptAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncTrigger: string | null;
  syncInProgressAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  connectedByClerkUserId: string | null;
};

export { fetchAllBoards, fetchAllPins, createPinterestPin, getApiBaseUrl, requireEnv, type PinterestBoard, type PinterestPin };

export function getPinterestOauthScopes() {
  return process.env.PINTEREST_OAUTH_SCOPES?.trim() || "boards:read,boards:write,pins:read,pins:write";
}

export function buildPinterestAuthorizeUrl(state: string) {
  const clientId = requireEnv("PINTEREST_APP_ID");
  const redirectUri = requireEnv("PINTEREST_REDIRECT_URI");
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getPinterestOauthScopes());
  url.searchParams.set("state", state);
  return url.toString();
}

export async function createPinterestOauthState(args: {
  householdId: string;
  clerkUserId: string;
  returnTo?: string;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const state = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await db.insert(oauthStates)
      .values({
        state,
        provider: "pinterest",
        householdId: args.householdId,
        clerkUserId: args.clerkUserId,
        returnTo: args.returnTo ?? "/settings",
        createdAt: now.toISOString(),
        expiresAt,
      })
      .run();

    return state;
  } finally {
    await sqlite.close();
  }
}

export async function consumePinterestOauthState(state: string) {
  const { db, sqlite } = await openDatabase();

  try {
    const record = await db.query.oauthStates.findFirst({
      where: (table, { eq }) => eq(table.state, state),
    });

    if (!record) {
      throw new Error("OAuth state was not found.");
    }

    await db.delete(oauthStates).where(eq(oauthStates.state, state)).run();

    if (record.provider !== "pinterest") {
      throw new Error("OAuth state provider mismatch.");
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      throw new Error("OAuth state expired. Please try connecting Pinterest again.");
    }

    return record;
  } finally {
    await sqlite.close();
  }
}

export async function exchangePinterestCode(code: string) {
  const clientId = requireEnv("PINTEREST_APP_ID");
  const clientSecret = requireEnv("PINTEREST_APP_SECRET");
  const redirectUri = requireEnv("PINTEREST_REDIRECT_URI");
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);

  const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    logError(
      "pinterest.oauth.exchange_failed",
      new Error(
        `Pinterest token exchange failed (${response.status} ${response.statusText}): ${raw}`,
      ),
    );
    throw new Error(PINTEREST_OAUTH_FAILURE_MESSAGE);
  }

  return JSON.parse(raw) as TokenResponse;
}

export async function upsertPinterestConnection(args: {
  householdId: string;
  connectedByClerkUserId: string;
  token: TokenResponse;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date();
    const boards = await fetchAllBoards(args.token.access_token).catch(() => [] as PinterestBoard[]);
    const accountLabel = deriveAccountLabel(boards);

    const values = {
      pinterestAccountId: `pinterest:${args.householdId}`,
      householdId: args.householdId,
      provider: "pinterest",
      connectedByClerkUserId: args.connectedByClerkUserId,
      pinterestUserId: null,
      accountLabel,
      accessTokenEncrypted: encryptSecret(args.token.access_token),
      refreshTokenEncrypted: args.token.refresh_token ? encryptSecret(args.token.refresh_token) : null,
      scope: args.token.scope ?? getPinterestOauthScopes(),
      accessTokenExpiresAt: expiresAtFromSeconds(args.token.expires_in),
      refreshTokenExpiresAt: expiresAtFromSeconds(args.token.refresh_token_expires_in),
      lastRefreshAttemptAt: null,
      lastRefreshSucceededAt: null,
      lastSyncAttemptAt: null,
      lastSyncTrigger: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      autoSyncEnabled: true,
      syncInProgressAt: null,
      connectionStatus: "active",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies ConnectionRow;

    await db.insert(pinterestAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: [pinterestAccounts.householdId, pinterestAccounts.provider],
        set: {
          connectedByClerkUserId: values.connectedByClerkUserId,
          accountLabel: values.accountLabel,
          accessTokenEncrypted: values.accessTokenEncrypted,
          refreshTokenEncrypted: values.refreshTokenEncrypted,
          scope: values.scope,
          accessTokenExpiresAt: values.accessTokenExpiresAt,
          refreshTokenExpiresAt: values.refreshTokenExpiresAt,
          connectionStatus: "active",
          updatedAt: values.updatedAt,
        },
      })
      .run();

    if (boards.length > 0) {
      await ensureBoardSubscriptions(args.householdId, boards);
    }
  } finally {
    await sqlite.close();
  }
}

export async function disconnectPinterestConnection(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    await db.delete(pinterestAccounts)
      .where(and(eq(pinterestAccounts.householdId, householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();
  } finally {
    await sqlite.close();
  }
}

export async function getPinterestConnectionSummary(householdId: string): Promise<PinterestConnectionSummary> {
  const { household, access } = await requireOwnerOrAdminIntegrationAccess();

  if (household.householdId !== householdId && !access.isActualAdmin) {
    throw new AuthorizationError(
      "You do not have permission to view this integration.",
    );
  }

  const { db, sqlite } = await openDatabase();

  try {
    const connection = await db.query.pinterestAccounts.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, householdId), eq(table.provider, "pinterest")),
    });

    if (!connection) {
      return {
        status: "not_connected",
        accountLabel: null,
        scope: [],
        autoSyncEnabled: false,
        lastSyncAttemptAt: null,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        lastSyncTrigger: null,
        syncInProgressAt: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        connectedByClerkUserId: null,
      };
    }

    return {
      status: deriveConnectionStatus(connection),
      accountLabel: connection.accountLabel,
      scope: connection.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [],
      autoSyncEnabled: connection.autoSyncEnabled,
      lastSyncAttemptAt: connection.lastSyncAttemptAt,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
      lastSyncError: connection.lastSyncError,
      lastSyncTrigger: connection.lastSyncTrigger,
      syncInProgressAt: connection.syncInProgressAt,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
      connectedByClerkUserId: connection.connectedByClerkUserId,
    };
  } finally {
    await sqlite.close();
  }
}

export async function listRemotePinterestBoards(householdId: string) {
  const accessToken = await getValidPinterestAccessToken(householdId);
  const boards = await fetchAllBoards(accessToken);
  await ensureBoardSubscriptions(householdId, boards);
  return boards;
}

export async function ensureBoardSubscriptions(householdId: string, boards: PinterestBoard[]) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();

    for (const board of boards) {
      await db.insert(boardSyncSubscriptions)
        .values({
          householdId,
          pinterestBoardId: board.id,
          boardName: board.name ?? null,
          syncEnabled: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [boardSyncSubscriptions.householdId, boardSyncSubscriptions.pinterestBoardId],
          set: {
            boardName: board.name ?? null,
            updatedAt: now,
          },
        })
        .run();
    }
  } finally {
    await sqlite.close();
  }
}

export async function updatePinterestConnectionSyncStatus(args: {
  householdId: string;
  status: "success" | "error";
  errorMessage?: string | null;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    await db.update(pinterestAccounts)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: args.status,
        lastSyncError: args.errorMessage ?? null,
        syncInProgressAt: null,
        connectionStatus: args.status === "success" ? "active" : "reauthorization_required",
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(pinterestAccounts.householdId, args.householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();
  } finally {
    await sqlite.close();
  }
}

export async function setPinterestConnectionAutoSyncEnabled(args: {
  householdId: string;
  enabled: boolean;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();
    const result = await db.update(pinterestAccounts)
      .set({
        autoSyncEnabled: args.enabled,
        updatedAt: now,
      })
      .where(and(eq(pinterestAccounts.householdId, args.householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();

    const affectedRows = "changes" in result
      ? result.changes
      : Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, count) => sum + count, 0)
        : result.rowsAffected;

    if ((affectedRows ?? 0) === 0) {
      throw new Error("Pinterest is not connected for this household.");
    }
  } finally {
    await sqlite.close();
  }
}

export async function markPinterestConnectionHealthy(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    await db.update(pinterestAccounts)
      .set({
        connectionStatus: "active",
        lastSyncError: null,
        syncInProgressAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(pinterestAccounts.householdId, householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();
  } finally {
    await sqlite.close();
  }
}

export async function getValidPinterestAccessToken(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    const connection = await db.query.pinterestAccounts.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, householdId), eq(table.provider, "pinterest")),
    });

    if (!connection) {
      throw new Error("Pinterest is not connected for this household.");
    }

    if (!shouldRefreshConnection(connection)) {
      return decryptSecret(connection.accessTokenEncrypted);
    }

    if (!connection.refreshTokenEncrypted) {
      await markConnectionStatus(householdId, "reauthorization_required", "Missing refresh token.");
      throw new Error("Pinterest needs to be reconnected.");
    }

    const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
    const refreshed = await refreshPinterestToken(refreshToken).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await markConnectionStatus(householdId, "reauthorization_required", message);
      throw error;
    });

    const accessTokenEncrypted = encryptSecret(refreshed.access_token);
    const refreshTokenEncrypted = refreshed.refresh_token
      ? encryptSecret(refreshed.refresh_token)
      : connection.refreshTokenEncrypted;
    const now = new Date().toISOString();

    await db.update(pinterestAccounts)
      .set({
        accessTokenEncrypted,
        refreshTokenEncrypted,
        scope: refreshed.scope ?? connection.scope,
        accessTokenExpiresAt: expiresAtFromSeconds(refreshed.expires_in),
        refreshTokenExpiresAt: refreshed.refresh_token_expires_in
          ? expiresAtFromSeconds(refreshed.refresh_token_expires_in)
          : connection.refreshTokenExpiresAt,
        lastRefreshAttemptAt: now,
        lastRefreshSucceededAt: now,
        connectionStatus: "active",
        lastSyncError: null,
        updatedAt: now,
      })
      .where(and(eq(pinterestAccounts.householdId, householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();

    return refreshed.access_token;
  } finally {
    await sqlite.close();
  }
}

async function refreshPinterestToken(refreshToken: string) {
  const clientId = requireEnv("PINTEREST_APP_ID");
  const clientSecret = requireEnv("PINTEREST_APP_SECRET");
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    logError(
      "pinterest.oauth.refresh_failed",
      new Error(
        `Pinterest token refresh failed (${response.status} ${response.statusText}): ${raw}`,
      ),
    );
    throw new Error(PINTEREST_REFRESH_FAILURE_MESSAGE);
  }

  return JSON.parse(raw) as TokenResponse;
}

async function markConnectionStatus(householdId: string, status: ConnectionRow["connectionStatus"], errorMessage: string) {
  const { db, sqlite } = await openDatabase();

  try {
    await db.update(pinterestAccounts)
      .set({
        connectionStatus: status,
        lastSyncError: errorMessage,
        syncInProgressAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(pinterestAccounts.householdId, householdId), eq(pinterestAccounts.provider, "pinterest")))
      .run();
  } finally {
    await sqlite.close();
  }
}

function deriveAccountLabel(boards: PinterestBoard[]) {
  for (const board of boards) {
    const owner = typeof board.owner === "object" && board.owner ? (board.owner as Record<string, unknown>) : null;

    if (owner) {
      const username = asString(owner.username);
      const fullName = asString(owner.full_name);
      return fullName ?? username ?? null;
    }
  }

  return null;
}

function deriveConnectionStatus(connection: ConnectionRow): PinterestConnectionStatus {
  if (connection.connectionStatus === "reauthorization_required") {
    return "reauthorization_required";
  }

  if (connection.connectionStatus === "revoked") {
    return "revoked";
  }

  if (!connection.accessTokenExpiresAt) {
    return "active";
  }

  const expirationMs = new Date(connection.accessTokenExpiresAt).getTime();

  if (Number.isNaN(expirationMs)) {
    return "active";
  }

  if (expirationMs <= Date.now()) {
    return "expired";
  }

  if (expirationMs - Date.now() <= 15 * 60 * 1000) {
    return "expiring_soon";
  }

  return "active";
}

function shouldRefreshConnection(connection: ConnectionRow) {
  if (!connection.accessTokenExpiresAt) {
    return false;
  }

  const expirationMs = new Date(connection.accessTokenExpiresAt).getTime();

  if (Number.isNaN(expirationMs)) {
    return false;
  }

  return expirationMs - Date.now() <= 5 * 60 * 1000;
}

function expiresAtFromSeconds(seconds: number | undefined) {
  if (!seconds) {
    return null;
  }

  return new Date(Date.now() + seconds * 1000).toISOString();
}

function buildBasicAuthHeader(clientId: string, clientSecret: string) {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
