import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";

import { type SubscriptionTier } from "@/lib/server/access";
import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdPins,
  householdRecipes,
  pinterestAccounts,
  pinterestSyncRecipeChanges,
  pinterestSyncRuns,
  recipeFolderMemberships,
  recipeFolders,
} from "@/lib/server/db";
import { extractRecipes } from "@/lib/server/extract";
import { logError, logInfo, logWarn } from "@/lib/server/logger";
import { getPinImageUrl } from "@/lib/server/media";
import {
  fetchAllPins,
  getValidPinterestAccessToken,
  listRemotePinterestBoards,
  updatePinterestConnectionSyncStatus,
} from "@/lib/server/pinterest";

export const PINTEREST_SYNC_LEASE_MS = 10 * 60 * 1000;
const PINTEREST_FOLDER_SOURCE = "pinterest";

type SyncBoardOptions = {
  householdId: string;
  sqlitePath?: string;
  boardName?: string | null;
  syncEnabled?: boolean;
  reconcile?: boolean;
  syncRun?: PinterestSyncRunContext;
};

export type PinterestSyncTrigger = "manual" | "auto_feed_load" | "force";

type PinterestSyncRunContext = {
  syncRunId: string;
  trigger: PinterestSyncTrigger;
  changes: Record<"created" | "removed" | "restored", number>;
};

type SyncClaimOptions = {
  householdId: string;
  trigger: PinterestSyncTrigger;
  cooldownMs?: number;
  requireEnabledBoards: boolean;
};

type SyncClaimResult =
  | { status: "claimed"; startedAt: string }
  | { status: "skipped_not_connected" | "skipped_no_boards" | "skipped_cooldown" | "skipped_locked" | "skipped_disabled" };

type SyncBoardResult = {
  boardId: string;
  syncedPins: number;
  newRecipeIds: string[];
  seenPinterestPinIds: string[];
  sqlitePath: string;
};

type SyncAllBoardsResult = {
  boards: SyncBoardResult[];
  newRecipeIds: string[];
};

type PinterestSectionSummary = {
  id: string;
  name: string | null;
  rawJson: string;
};

export function getPinterestAutoSyncCooldownMs(_tier: SubscriptionTier) {
  return 60 * 60 * 1000;
}

export function formatPinterestAutoSyncFrequency(_tier: SubscriptionTier) {
  return "every 1h";
}

function getPinterestSectionName(pin: Awaited<ReturnType<typeof fetchAllPins>>[number]) {
  const sectionCandidate = pin.board_section;

  if (sectionCandidate && typeof sectionCandidate === "object" && "name" in sectionCandidate) {
    const name = sectionCandidate.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }

  const fallbackCandidates = [
    pin.board_section_name,
    pin.section_name,
    pin.board_section_title,
  ];

  for (const candidate of fallbackCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function collectPinterestSections(pinRecords: Awaited<ReturnType<typeof fetchAllPins>>) {
  const sections = new Map<string, PinterestSectionSummary>();

  for (const pin of pinRecords) {
    const sectionId = pin.board_section_id?.trim();
    if (!sectionId) {
      continue;
    }

    if (sections.has(sectionId)) {
      continue;
    }

    const name = getPinterestSectionName(pin);
    sections.set(sectionId, {
      id: sectionId,
      name: name ?? sectionId,
      rawJson: JSON.stringify({
        id: sectionId,
        name: name ?? sectionId,
      }),
    });
  }

  return [...sections.values()];
}

export function getNextPinterestAutoSyncEligibleAt(args: {
  autoSyncEnabled: boolean;
  lastSyncAttemptAt: string | null | undefined;
  subscriptionTier: SubscriptionTier;
}) {
  if (!args.autoSyncEnabled || !args.lastSyncAttemptAt) {
    return null;
  }

  const lastAttemptMs = new Date(args.lastSyncAttemptAt).getTime();
  if (Number.isNaN(lastAttemptMs)) {
    return null;
  }

  return new Date(
    lastAttemptMs + getPinterestAutoSyncCooldownMs(args.subscriptionTier),
  ).toISOString();
}

export function isPinterestSyncLeaseActive(
  syncInProgressAt: string | null | undefined,
  now = Date.now(),
) {
  if (!syncInProgressAt) {
    return false;
  }

  const startedAt = new Date(syncInProgressAt).getTime();
  if (Number.isNaN(startedAt)) {
    return false;
  }

  return now - startedAt < PINTEREST_SYNC_LEASE_MS;
}

export async function planPinterestAutoSync(args: {
  householdId: string;
  subscriptionTier: SubscriptionTier;
}): Promise<SyncClaimResult> {
  return claimPinterestSyncRun({
    householdId: args.householdId,
    trigger: "auto_feed_load",
    cooldownMs: getPinterestAutoSyncCooldownMs(args.subscriptionTier),
    requireEnabledBoards: true,
  });
}

export async function runClaimedPinterestAutoSync(args: {
  householdId: string;
}) {
  logInfo("pinterest.sync.auto.started", {
    target: {
      householdId: args.householdId,
    },
  });
  const syncRun = await startPinterestSyncRun({ householdId: args.householdId, trigger: "auto_feed_load" });
  try {
    const syncResult = await syncAllBoards({
      householdId: args.householdId,
      syncRun,
    });

    if (syncResult.newRecipeIds.length > 0) {
      await extractRecipes({
        householdId: args.householdId,
        recipeIds: syncResult.newRecipeIds,
      });
    }

    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "success",
    });
    await completePinterestSyncRun({ syncRun, status: "success", result: syncResult });

    logInfo("pinterest.sync.auto.completed", {
      target: {
        householdId: args.householdId,
      },
      result: {
        boardCount: syncResult.boards.length,
        newRecipeCount: syncResult.newRecipeIds.length,
      },
    });

    return syncResult;
  } catch (error) {
    await completePinterestSyncRun({ syncRun, status: "error", error });
    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    logError("pinterest.sync.auto.failed", error, {
      target: {
        householdId: args.householdId,
      },
    });
    throw error;
  }
}

export async function runManualBoardSync(args: {
  householdId: string;
  boardId: string;
  boardName?: string | null;
  syncEnabled?: boolean;
}) {
  const claim = await claimPinterestSyncRun({
    householdId: args.householdId,
    trigger: "manual",
    requireEnabledBoards: false,
  });

  if (claim.status !== "claimed") {
    logWarn("pinterest.sync.manual_board.skipped", {
      target: {
        householdId: args.householdId,
        boardId: args.boardId,
      },
      result: {
        status: claim.status,
      },
    });
    throw toSyncClaimError(claim.status);
  }

  const syncRun = await startPinterestSyncRun({ householdId: args.householdId, trigger: "manual" });
  try {
    const result = await syncBoard(args.boardId, {
      householdId: args.householdId,
      boardName: args.boardName,
      syncEnabled: args.syncEnabled,
      syncRun,
    });

    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "success",
    });
    await completePinterestSyncRun({ syncRun, status: "success", result });

    logInfo("pinterest.sync.manual_board.completed", {
      target: {
        householdId: args.householdId,
        boardId: args.boardId,
      },
      result: {
        syncedPins: result.syncedPins,
        newRecipeCount: result.newRecipeIds.length,
      },
    });

    return result;
  } catch (error) {
    await completePinterestSyncRun({ syncRun, status: "error", error });
    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    logError("pinterest.sync.manual_board.failed", error, {
      target: {
        householdId: args.householdId,
        boardId: args.boardId,
      },
    });
    throw error;
  }
}

export async function runManualSyncAllBoards(args: {
  householdId: string;
  trigger?: "manual" | "force";
}) {
  const trigger = args.trigger ?? "manual";
  const claim = await claimPinterestSyncRun({
    householdId: args.householdId,
    trigger,
    requireEnabledBoards: true,
  });

  if (claim.status === "skipped_no_boards") {
    logWarn("pinterest.sync.manual_all.skipped", {
      target: {
        householdId: args.householdId,
      },
      result: {
        status: claim.status,
      },
    });
    return {
      boards: [],
      newRecipeIds: [],
    } satisfies SyncAllBoardsResult;
  }

  if (claim.status !== "claimed") {
    logWarn("pinterest.sync.manual_all.skipped", {
      target: {
        householdId: args.householdId,
      },
      result: {
        status: claim.status,
      },
    });
    throw toSyncClaimError(claim.status);
  }

  const syncRun = await startPinterestSyncRun({ householdId: args.householdId, trigger });
  try {
    const result = await syncAllBoards({
      householdId: args.householdId,
      syncRun,
    });

    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "success",
    });
    await completePinterestSyncRun({ syncRun, status: "success", result });

    logInfo("pinterest.sync.manual_all.completed", {
      target: {
        householdId: args.householdId,
      },
      result: {
        boardCount: result.boards.length,
        newRecipeCount: result.newRecipeIds.length,
      },
    });

    return result;
  } catch (error) {
    await completePinterestSyncRun({ syncRun, status: "error", error });
    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    logError("pinterest.sync.manual_all.failed", error, {
      target: {
        householdId: args.householdId,
      },
    });
    throw error;
  }
}

export async function runForcePinterestResync(args: { householdId: string }) {
  const result = await runManualSyncAllBoards({ ...args, trigger: "force" });
  if (result.newRecipeIds.length > 0) {
    await extractRecipes({
      householdId: args.householdId,
      recipeIds: result.newRecipeIds,
    });
  }
  return result;
}

export async function syncBoard(
  pinterestBoardId: string,
  options: SyncBoardOptions,
): Promise<SyncBoardResult> {
  logInfo("pinterest.sync.board.started", {
    target: {
      householdId: options.householdId,
      boardId: pinterestBoardId,
    },
  });
  const accessToken = await getValidPinterestAccessToken(options.householdId);
  const pinRecords = await fetchAllPins(pinterestBoardId, accessToken);
  const { db, sqlite, targetLabel } = await openDatabase(options.sqlitePath);

  try {
    const syncNow = new Date().toISOString();
    const boardKey = toBoardKey(options.householdId, pinterestBoardId);
    const existingRecipes = await db.query.householdRecipes.findMany({
      where: (table, { eq: whereEq }) => whereEq(table.householdId, options.householdId),
      columns: { pinId: true, recipeId: true },
    });
    const existingRecipeIdsByPinId = new Map(existingRecipes.map((row) => [row.pinId, row.recipeId]));
    const newRecipeIds: string[] = [];

    if (options.syncEnabled !== undefined || options.boardName !== undefined) {
      await db.insert(boardSyncSubscriptions).values({
        householdId: options.householdId,
        pinterestBoardId,
        boardName: options.boardName ?? null,
        syncEnabled: options.syncEnabled ?? true,
        createdAt: syncNow,
        updatedAt: syncNow,
      }).onConflictDoNothing().run();
    }

    await db.insert(householdBoards).values({
      boardId: boardKey,
      householdId: options.householdId,
      pinterestBoardId,
      name: options.boardName ?? null,
      description: null,
      privacy: null,
      ownerJson: null,
      rawJson: JSON.stringify({ id: pinterestBoardId, name: options.boardName ?? null }),
      syncEnabled: options.syncEnabled ?? true,
      lastSyncedAt: syncNow,
    }).onConflictDoNothing().run();

    const boardFolder = await ensurePinterestBoardFolder({
      db,
      householdId: options.householdId,
      pinterestBoardId,
      boardName: options.boardName ?? null,
      syncNow,
    });
    const folderIdsBySectionId = await ensurePinterestSectionFolders({
      db,
      householdId: options.householdId,
      pinterestBoardId,
      boardFolderId: boardFolder.folderId,
      sections: collectPinterestSections(pinRecords),
      syncNow,
    });

    for (const pin of pinRecords) {
      const pinKey = toPinKey(options.householdId, pin.id);
      if (existingRecipeIdsByPinId.has(pinKey)) continue;

      const pinValues = {
        pinId: pinKey, householdId: options.householdId, pinterestPinId: pin.id,
        boardId: boardKey, pinterestBoardId, boardSectionId: pin.board_section_id ?? null,
        title: pin.title ?? null, description: pin.description ?? null, link: pin.link ?? null,
        altText: pin.alt_text ?? null, dominantColor: pin.dominant_color ?? null,
        note: pin.note ?? null, createdAt: pin.created_at ?? null, parentPinId: pin.parent_pin_id ?? null,
        mediaJson: pin.media ? JSON.stringify(pin.media) : null,
        mediaSourceJson: pin.media_source ? JSON.stringify(pin.media_source) : null,
        creatorJson: pin.creator ? JSON.stringify(pin.creator) : null,
        boardOwnerJson: pin.board_owner ? JSON.stringify(pin.board_owner) : null,
        rawJson: JSON.stringify(pin), updatedAt: syncNow,
      };
      await db.insert(householdPins).values(pinValues).onConflictDoNothing().run();

      const recipeId = createId();
      const insertedRecipe = await db.insert(householdRecipes).values({
        recipeId, householdId: options.householdId, pinId: pinKey,
        title: pin.title ?? null, description: pin.description ?? null,
        imageUrl: getPinImageUrl(pinValues.mediaJson, pinValues.rawJson),
        removedAt: null, createdAt: syncNow, updatedAt: syncNow,
      }).onConflictDoNothing().returning().get();
      if (!insertedRecipe) continue;

      newRecipeIds.push(recipeId);
      existingRecipeIdsByPinId.set(pinKey, recipeId);
      const folderId = pin.board_section_id
        ? folderIdsBySectionId.get(pin.board_section_id) ?? boardFolder.folderId
        : boardFolder.folderId;
      await db.insert(recipeFolderMemberships).values({
        householdId: options.householdId, recipeId, folderId,
        source: PINTEREST_FOLDER_SOURCE, createdAt: syncNow, updatedAt: syncNow,
      }).onConflictDoNothing().run();
      await recordPinterestSyncRecipeChange(options.syncRun, recipeId, "created", syncNow);
    }

    if (options.reconcile !== false) {
      await reconcileRemovedRecipes({
        db,
        householdId: options.householdId,
        boardIds: new Set([pinterestBoardId]),
        seenPinterestPinIds: new Set(pinRecords.map((pin) => pin.id)),
        syncNow,
        syncRun: options.syncRun,
      });
    }

    return {
      boardId: pinterestBoardId,
      syncedPins: pinRecords.length,
      newRecipeIds,
      seenPinterestPinIds: pinRecords.map((pin) => pin.id),
      sqlitePath: targetLabel,
    };
  } finally {
    await sqlite.close();
  }
}

export async function syncAllBoards(options: {
  householdId: string;
  sqlitePath?: string;
  syncRun?: PinterestSyncRunContext;
}): Promise<SyncAllBoardsResult> {
  logInfo("pinterest.sync.all_boards.started", {
    target: {
      householdId: options.householdId,
    },
  });
  const boardRecords = await listRemotePinterestBoards(options.householdId);
  const selectedBoardIds = await getSelectedBoardIds(
    options.householdId,
    options.sqlitePath,
  );
  const boards: SyncBoardResult[] = [];

  for (const board of boardRecords.filter((record) => selectedBoardIds.has(record.id))) {
    boards.push(
      await syncBoard(board.id, {
        householdId: options.householdId,
        sqlitePath: options.sqlitePath,
        boardName: board.name ?? null,
        syncEnabled: true,
        reconcile: false,
        syncRun: options.syncRun,
      }),
    );
  }

  const { db, sqlite } = await openDatabase(options.sqlitePath);
  try {
    await reconcileRemovedRecipes({
      db,
      householdId: options.householdId,
      boardIds: selectedBoardIds,
      seenPinterestPinIds: new Set(boards.flatMap((board) => board.seenPinterestPinIds)),
      syncNow: new Date().toISOString(),
      syncRun: options.syncRun,
    });
  } finally {
    await sqlite.close();
  }

  return {
    boards,
    newRecipeIds: boards.flatMap((board) => board.newRecipeIds),
  };
}

async function ensurePinterestBoardFolder(args: {
  db: Awaited<ReturnType<typeof openDatabase>>["db"];
  householdId: string;
  pinterestBoardId: string;
  boardName: string | null;
  syncNow: string;
}) {
  await args.db.insert(recipeFolders).values({
    householdId: args.householdId,
    parentFolderId: null,
    source: PINTEREST_FOLDER_SOURCE,
    sourceType: "board",
    pinterestBoardId: args.pinterestBoardId,
    pinterestSectionId: null,
    name: args.boardName,
    rawJson: JSON.stringify({ id: args.pinterestBoardId, name: args.boardName }),
    lastSyncedAt: args.syncNow,
    createdAt: args.syncNow,
    updatedAt: args.syncNow,
  }).onConflictDoNothing().run();

  const folder = await args.db.query.recipeFolders.findFirst({
    where: (table, { and: whereAnd, eq: whereEq }) => whereAnd(
      whereEq(table.householdId, args.householdId),
      whereEq(table.source, PINTEREST_FOLDER_SOURCE),
      whereEq(table.sourceType, "board"),
      whereEq(table.pinterestBoardId, args.pinterestBoardId),
    ),
  });
  if (!folder) throw new Error(`Failed to create Pinterest board folder for ${args.pinterestBoardId}.`);
  return folder;
}

async function ensurePinterestSectionFolders(args: {
  db: Awaited<ReturnType<typeof openDatabase>>["db"];
  householdId: string;
  pinterestBoardId: string;
  boardFolderId: string;
  sections: PinterestSectionSummary[];
  syncNow: string;
}) {
  const folderIdsBySectionId = new Map<string, string>();
  for (const section of args.sections) {
    await args.db.insert(recipeFolders).values({
      householdId: args.householdId,
      parentFolderId: args.boardFolderId,
      source: PINTEREST_FOLDER_SOURCE,
      sourceType: "section",
      pinterestBoardId: args.pinterestBoardId,
      pinterestSectionId: section.id,
      name: section.name,
      rawJson: section.rawJson,
      lastSyncedAt: args.syncNow,
      createdAt: args.syncNow,
      updatedAt: args.syncNow,
    }).onConflictDoNothing().run();
    const folder = await args.db.query.recipeFolders.findFirst({
      where: (table, { and: whereAnd, eq: whereEq }) => whereAnd(
        whereEq(table.householdId, args.householdId),
        whereEq(table.source, PINTEREST_FOLDER_SOURCE),
        whereEq(table.sourceType, "section"),
        whereEq(table.pinterestSectionId, section.id),
      ),
    });
    if (!folder) throw new Error(`Failed to create Pinterest section folder for ${section.id}.`);
    folderIdsBySectionId.set(section.id, folder.folderId);
  }
  return folderIdsBySectionId;
}

async function reconcileRemovedRecipes(args: {
  db: Awaited<ReturnType<typeof openDatabase>>["db"];
  householdId: string;
  boardIds: Set<string>;
  seenPinterestPinIds: Set<string>;
  syncNow: string;
  syncRun?: PinterestSyncRunContext;
}) {
  if (args.boardIds.size === 0) return;
  const recipes = await args.db.query.householdRecipes.findMany({
    where: (table, { eq: whereEq }) => whereEq(table.householdId, args.householdId),
    columns: { recipeId: true, removedAt: true },
    with: { pin: { columns: { pinterestBoardId: true, pinterestPinId: true } } },
  });
  for (const recipe of recipes) {
    if (!args.boardIds.has(recipe.pin.pinterestBoardId)) continue;
    const shouldBeRemoved = !args.seenPinterestPinIds.has(recipe.pin.pinterestPinId);
    if (shouldBeRemoved === Boolean(recipe.removedAt)) continue;
    await args.db.update(householdRecipes).set({
      removedAt: shouldBeRemoved ? args.syncNow : null,
      updatedAt: args.syncNow,
    }).where(eq(householdRecipes.recipeId, recipe.recipeId)).run();
    await recordPinterestSyncRecipeChange(
      args.syncRun,
      recipe.recipeId,
      shouldBeRemoved ? "removed" : "restored",
      args.syncNow,
    );
  }
}

async function startPinterestSyncRun(args: {
  householdId: string;
  trigger: PinterestSyncTrigger;
}): Promise<PinterestSyncRunContext> {
  const { db, sqlite } = await openDatabase();
  try {
    const startedAt = new Date().toISOString();
    const run = await db.insert(pinterestSyncRuns).values({
      householdId: args.householdId,
      trigger: args.trigger,
      status: "running",
      startedAt,
      completedAt: null,
      boardCount: 0,
      pinCount: 0,
      createdRecipeCount: 0,
      removedRecipeCount: 0,
      restoredRecipeCount: 0,
      message: null,
    }).returning().get();
    if (!run) throw new Error("Unable to create Pinterest sync history record.");
    return {
      syncRunId: run.syncRunId,
      trigger: args.trigger,
      changes: { created: 0, removed: 0, restored: 0 },
    };
  } finally {
    await sqlite.close();
  }
}

async function recordPinterestSyncRecipeChange(
  syncRun: PinterestSyncRunContext | undefined,
  recipeId: string,
  changeType: "created" | "removed" | "restored",
  createdAt: string,
) {
  if (!syncRun) return;
  const { db, sqlite } = await openDatabase();
  try {
    await db.insert(pinterestSyncRecipeChanges).values({
      syncRunId: syncRun.syncRunId,
      recipeId,
      changeType,
      createdAt,
    }).onConflictDoNothing().run();
    syncRun.changes[changeType] += 1;
  } finally {
    await sqlite.close();
  }
}

async function completePinterestSyncRun(args: {
  syncRun: PinterestSyncRunContext;
  status: "success" | "error";
  result?: SyncAllBoardsResult | SyncBoardResult;
  error?: unknown;
}) {
  const { db, sqlite } = await openDatabase();
  try {
    const result = args.result;
    const boards = result && "boards" in result ? result.boards : result ? [result] : [];
    await db.update(pinterestSyncRuns).set({
      status: args.status,
      completedAt: new Date().toISOString(),
      boardCount: boards.length,
      pinCount: boards.reduce((count, board) => count + board.syncedPins, 0),
      createdRecipeCount: args.syncRun.changes.created,
      removedRecipeCount: args.syncRun.changes.removed,
      restoredRecipeCount: args.syncRun.changes.restored,
      message: args.status === "error"
        ? args.error instanceof Error ? args.error.message : String(args.error)
        : null,
    }).where(eq(pinterestSyncRuns.syncRunId, args.syncRun.syncRunId)).run();
  } finally {
    await sqlite.close();
  }
}

async function claimPinterestSyncRun(
  options: SyncClaimOptions,
): Promise<SyncClaimResult> {
  const { db, sqlite } = await openDatabase();
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const connection = await db.query.pinterestAccounts.findFirst({
      where: (table, { and: whereAnd, eq: whereEq }) =>
        whereAnd(
          whereEq(table.householdId, options.householdId),
          whereEq(table.provider, "pinterest"),
        ),
    });

    if (!connection) {
      logWarn("pinterest.sync.claim_skipped", {
        target: {
          householdId: options.householdId,
        },
        result: {
          status: "skipped_not_connected",
        },
      });
      return { status: "skipped_not_connected" };
    }

    if (options.requireEnabledBoards) {
      if (options.trigger === "auto_feed_load" && !connection.autoSyncEnabled) {
        logWarn("pinterest.sync.claim_skipped", {
          target: {
            householdId: options.householdId,
          },
          result: {
            status: "skipped_disabled",
          },
        });
        return { status: "skipped_disabled" };
      }

      const enabledBoard = await db.query.boardSyncSubscriptions.findFirst({
        where: (table, { and: whereAnd, eq: whereEq }) =>
          whereAnd(
            whereEq(table.householdId, options.householdId),
            whereEq(table.syncEnabled, true),
          ),
        columns: {
          subscriptionId: true,
        },
      });

      if (!enabledBoard) {
        logWarn("pinterest.sync.claim_skipped", {
          target: {
            householdId: options.householdId,
          },
          result: {
            status: "skipped_no_boards",
          },
        });
        return { status: "skipped_no_boards" };
      }
    }

    if (isPinterestSyncLeaseActive(connection.syncInProgressAt, now.getTime())) {
      logWarn("pinterest.sync.claim_skipped", {
        target: {
          householdId: options.householdId,
        },
        result: {
          status: "skipped_locked",
        },
      });
      return { status: "skipped_locked" };
    }

    if (options.cooldownMs && isWithinCooldown(connection.lastSyncAttemptAt, options.cooldownMs, now.getTime())) {
      logWarn("pinterest.sync.claim_skipped", {
        target: {
          householdId: options.householdId,
        },
        result: {
          status: "skipped_cooldown",
        },
      });
      return { status: "skipped_cooldown" };
    }

    const syncLeaseCondition = connection.syncInProgressAt
      ? eq(pinterestAccounts.syncInProgressAt, connection.syncInProgressAt)
      : isNull(pinterestAccounts.syncInProgressAt);

    const result = await db.update(pinterestAccounts)
      .set({
        lastSyncAttemptAt: nowIso,
        lastSyncTrigger: options.trigger,
        syncInProgressAt: nowIso,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(pinterestAccounts.householdId, options.householdId),
          eq(pinterestAccounts.provider, "pinterest"),
          syncLeaseCondition,
        ),
      )
      .run();

    const affectedRows = "changes" in result
      ? result.changes
      : Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, count) => sum + count, 0)
        : result.rowsAffected;

    if ((affectedRows ?? 0) === 0) {
      logWarn("pinterest.sync.claim_skipped", {
        target: {
          householdId: options.householdId,
        },
        result: {
          status: "skipped_locked",
        },
      });
      return { status: "skipped_locked" };
    }

    logInfo("pinterest.sync.claimed", {
      target: {
        householdId: options.householdId,
      },
      result: {
        trigger: options.trigger,
        startedAt: nowIso,
      },
    });
    return {
      status: "claimed",
      startedAt: nowIso,
    };
  } finally {
    await sqlite.close();
  }
}

async function getSelectedBoardIds(householdId: string, sqlitePath?: string) {
  const { db, sqlite } = await openDatabase(sqlitePath);

  try {
    return new Set(
      (
        await db.query.boardSyncSubscriptions.findMany({
          where: (table, { and, eq }) =>
            and(
              eq(table.householdId, householdId),
              eq(table.syncEnabled, true),
            ),
          columns: {
            pinterestBoardId: true,
          },
        })
      ).map((row) => row.pinterestBoardId),
    );
  } finally {
    await sqlite.close();
  }
}

function isWithinCooldown(
  lastSyncAttemptAt: string | null | undefined,
  cooldownMs: number,
  nowMs: number,
) {
  if (!lastSyncAttemptAt) {
    return false;
  }

  const attemptMs = new Date(lastSyncAttemptAt).getTime();
  if (Number.isNaN(attemptMs)) {
    return false;
  }

  return nowMs - attemptMs < cooldownMs;
}

function toSyncClaimError(status: SyncClaimResult["status"]) {
  switch (status) {
    case "skipped_locked":
      return new Error("Pinterest sync is already running.");
    case "skipped_not_connected":
      return new Error("Pinterest is not connected for this household.");
    case "skipped_no_boards":
      return new Error("No boards are selected for sync yet.");
    case "skipped_cooldown":
      return new Error("Pinterest sync is cooling down.");
    case "skipped_disabled":
      return new Error("Pinterest auto-sync is disabled.");
    case "claimed":
      return new Error("Pinterest sync is already running.");
  }
}

export function toBoardKey(householdId: string, pinterestBoardId: string) {
  return `${householdId}:${pinterestBoardId}`;
}

export function toPinKey(householdId: string, pinterestPinId: string) {
  return `${householdId}:${pinterestPinId}`;
}
