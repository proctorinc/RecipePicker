import { createId } from "@paralleldrive/cuid2";
import { sql, and, eq, isNull } from "drizzle-orm";

import { type SubscriptionTier } from "@/lib/server/access";
import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdPins,
  householdRecipes,
  pinterestAccounts,
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

type SyncBoardOptions = {
  householdId: string;
  sqlitePath?: string;
  boardName?: string | null;
  syncEnabled?: boolean;
};

export type PinterestSyncTrigger = "manual" | "auto_feed_load";

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
  sqlitePath: string;
};

type SyncAllBoardsResult = {
  boards: SyncBoardResult[];
  newRecipeIds: string[];
};

export function getPinterestAutoSyncCooldownMs(tier: SubscriptionTier) {
  return tier === "premium" ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export function formatPinterestAutoSyncFrequency(tier: SubscriptionTier) {
  return tier === "premium" ? "every 10m" : "every 24h";
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
  try {
    const syncResult = await syncAllBoards({
      householdId: args.householdId,
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

  try {
    const result = await syncBoard(args.boardId, {
      householdId: args.householdId,
      boardName: args.boardName,
      syncEnabled: args.syncEnabled,
    });

    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "success",
    });

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
}) {
  const claim = await claimPinterestSyncRun({
    householdId: args.householdId,
    trigger: "manual",
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

  try {
    const result = await syncAllBoards({
      householdId: args.householdId,
    });

    await updatePinterestConnectionSyncStatus({
      householdId: args.householdId,
      status: "success",
    });

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
  const syncNow = new Date().toISOString();
  const boardKey = toBoardKey(options.householdId, pinterestBoardId);
  const { db, sqlite, targetLabel } = await openDatabase(options.sqlitePath);

  try {
    const existingRecipes = await db.query.householdRecipes.findMany({
      where: (table, { eq: whereEq }) =>
        whereEq(table.householdId, options.householdId),
      columns: {
        pinId: true,
      },
    });
    const existingRecipePinIds = new Set(existingRecipes.map((row) => row.pinId));
    const newRecipeIds: string[] = [];

    if (options.syncEnabled !== undefined || options.boardName !== undefined) {
      await db.insert(boardSyncSubscriptions)
        .values({
          householdId: options.householdId,
          pinterestBoardId,
          boardName: options.boardName ?? null,
          syncEnabled: options.syncEnabled ?? true,
          createdAt: syncNow,
          updatedAt: syncNow,
        })
        .onConflictDoUpdate({
          target: [boardSyncSubscriptions.householdId, boardSyncSubscriptions.pinterestBoardId],
          set: {
            boardName: options.boardName ?? null,
            syncEnabled: options.syncEnabled ?? true,
            updatedAt: syncNow,
          },
        })
        .run();
    }

    await db.insert(householdBoards)
      .values({
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
      })
      .onConflictDoUpdate({
        target: householdBoards.boardId,
        set: {
          name: options.boardName ?? householdBoards.name,
          syncEnabled: options.syncEnabled ?? true,
          lastSyncedAt: syncNow,
        },
      })
      .run();

    for (const pin of pinRecords) {
      const pinKey = toPinKey(options.householdId, pin.id);
      const recipeExists = existingRecipePinIds.has(pinKey);
      const pinValues = {
        pinId: pinKey,
        householdId: options.householdId,
        pinterestPinId: pin.id,
        boardId: boardKey,
        pinterestBoardId,
        boardSectionId: pin.board_section_id ?? null,
        title: pin.title ?? null,
        description: pin.description ?? null,
        link: pin.link ?? null,
        altText: pin.alt_text ?? null,
        dominantColor: pin.dominant_color ?? null,
        note: pin.note ?? null,
        createdAt: pin.created_at ?? null,
        parentPinId: pin.parent_pin_id ?? null,
        mediaJson: pin.media ? JSON.stringify(pin.media) : null,
        mediaSourceJson: pin.media_source ? JSON.stringify(pin.media_source) : null,
        creatorJson: pin.creator ? JSON.stringify(pin.creator) : null,
        boardOwnerJson: pin.board_owner ? JSON.stringify(pin.board_owner) : null,
        rawJson: JSON.stringify(pin),
        updatedAt: syncNow,
      };

      await db.insert(householdPins)
        .values(pinValues)
        .onConflictDoUpdate({
          target: householdPins.pinId,
          set: pinValues,
        })
        .run();

      if (!recipeExists) {
        const recipeId = createId();
        const recipeSeed = {
          recipeId,
          householdId: options.householdId,
          pinId: pinKey,
          title: pin.title ?? null,
          description: pin.description ?? null,
          imageUrl: getPinImageUrl(pinValues.mediaJson, pinValues.rawJson),
          createdAt: syncNow,
          updatedAt: syncNow,
        };

        const insertedRecipe = await db.insert(householdRecipes)
          .values(recipeSeed)
          .returning()
          .get();

        if (insertedRecipe?.recipeId) {
          newRecipeIds.push(insertedRecipe.recipeId);
          existingRecipePinIds.add(pinKey);
        }
      } else {
        const recipeSeed = {
          householdId: options.householdId,
          pinId: pinKey,
          title: pin.title ?? null,
          description: pin.description ?? null,
          imageUrl: getPinImageUrl(pinValues.mediaJson, pinValues.rawJson),
          createdAt: syncNow,
          updatedAt: syncNow,
        };

        await db.insert(householdRecipes)
          .values(recipeSeed)
          .onConflictDoUpdate({
            target: householdRecipes.pinId,
            set: {
              title: sql`case when ${householdRecipes.titleOverridden} then ${householdRecipes.title} else excluded.title end`,
              description: sql`case when ${householdRecipes.descriptionOverridden} then ${householdRecipes.description} else excluded.description end`,
              imageUrl: sql`case when ${householdRecipes.imageUrlOverridden} then ${householdRecipes.imageUrl} else excluded.image_url end`,
              updatedAt: sql`excluded.updated_at`,
            },
          })
          .run();
      }

    }

    return {
      boardId: pinterestBoardId,
      syncedPins: pinRecords.length,
      newRecipeIds,
      sqlitePath: targetLabel,
    };
  } finally {
    await sqlite.close();
  }
}

export async function syncAllBoards(options: {
  householdId: string;
  sqlitePath?: string;
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
      }),
    );
  }

  return {
    boards,
    newRecipeIds: boards.flatMap((board) => board.newRecipeIds),
  };
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
