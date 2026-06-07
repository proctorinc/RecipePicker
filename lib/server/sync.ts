import { sql } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdPins,
  householdRecipes,
} from "@/lib/server/db";
import { getPinImageUrl } from "@/lib/server/media";
import { fetchAllPins, getValidPinterestAccessToken, listRemotePinterestBoards, updatePinterestConnectionSyncStatus } from "@/lib/server/pinterest";

type SyncBoardOptions = {
  householdId: string;
  sqlitePath?: string;
  boardName?: string | null;
  syncEnabled?: boolean;
};

export async function syncBoard(pinterestBoardId: string, options: SyncBoardOptions) {
  const accessToken = await getValidPinterestAccessToken(options.householdId);
  const pinRecords = await fetchAllPins(pinterestBoardId, accessToken);
  const syncNow = new Date().toISOString();
  const boardKey = toBoardKey(options.householdId, pinterestBoardId);
  const { db, sqlite, sqlitePath: resolvedSqlitePath } = openDatabase(options.sqlitePath);

  try {
    sqlite.transaction(() => {
      if (options.syncEnabled !== undefined || options.boardName !== undefined) {
        db.insert(boardSyncSubscriptions)
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

      db.insert(householdBoards)
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

        db.insert(householdPins)
          .values(pinValues)
          .onConflictDoUpdate({
            target: householdPins.pinId,
            set: pinValues,
          })
          .run();

        const recipeSeed = {
          householdId: options.householdId,
          pinId: pinKey,
          title: pin.title ?? null,
          description: pin.description ?? null,
          imageUrl: getPinImageUrl(pinValues.mediaJson, pinValues.rawJson),
          createdAt: syncNow,
          updatedAt: syncNow,
        };

        db.insert(householdRecipes)
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
    })();

    await updatePinterestConnectionSyncStatus({
      householdId: options.householdId,
      status: "success",
    });

    return {
      boardId: pinterestBoardId,
      syncedPins: pinRecords.length,
      sqlitePath: resolvedSqlitePath,
    };
  } catch (error) {
    await updatePinterestConnectionSyncStatus({
      householdId: options.householdId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    sqlite.close();
  }
}

export async function syncAllBoards(options: { householdId: string; sqlitePath?: string }) {
  const boardRecords = await listRemotePinterestBoards(options.householdId);
  const selectedBoardIds = getSelectedBoardIds(options.householdId, options.sqlitePath);
  const results = [];

  for (const board of boardRecords.filter((record) => selectedBoardIds.has(record.id))) {
    results.push(
      await syncBoard(board.id, {
        householdId: options.householdId,
        sqlitePath: options.sqlitePath,
        boardName: board.name ?? null,
        syncEnabled: true,
      }),
    );
  }

  return results;
}

function getSelectedBoardIds(householdId: string, sqlitePath?: string) {
  const { db, sqlite } = openDatabase(sqlitePath);

  try {
    return new Set(
      db
        .select({ boardId: boardSyncSubscriptions.pinterestBoardId })
        .from(boardSyncSubscriptions)
        .where(
          sql`${boardSyncSubscriptions.householdId} = ${householdId} and ${boardSyncSubscriptions.syncEnabled} = 1`,
        )
        .all()
        .map((row) => row.boardId),
    );
  } finally {
    sqlite.close();
  }
}

export function toBoardKey(householdId: string, pinterestBoardId: string) {
  return `${householdId}:${pinterestBoardId}`;
}

export function toPinKey(householdId: string, pinterestPinId: string) {
  return `${householdId}:${pinterestPinId}`;
}
