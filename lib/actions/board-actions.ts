"use server";

import { after } from "next/server";

import { requireHouseholdRole } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import { boardSyncSubscriptions } from "@/lib/server/db";
import { extractRecipes } from "@/lib/server/extract";
import { runBackgroundJob, withActionLogging } from "@/lib/server/logger";
import {
  runManualBoardSync,
  runManualSyncAllBoards,
  runForcePinterestResync,
} from "@/lib/server/sync";
import {
  revalidateAll,
  recipeScopedPaths,
  toErrorState,
  toOptionalString,
} from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/actions/types";

export const syncBoardAction = withActionLogging(
  "action.sync_board",
  async (
    _: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const boardId = String(formData.get("boardId") ?? "").trim();
    const boardName = toOptionalString(formData.get("boardName"));

    if (!boardId) {
      return { status: "error", message: "Board ID is required." };
    }

    try {
      const context = await requireHouseholdRole("owner");
      const result = await runManualBoardSync({
        householdId: context.householdId,
        boardId,
        boardName,
      });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: `Synced ${result.syncedPins} pins from ${boardName ?? boardId}.`,
      };
    } catch (error) {
      return toErrorState(error, `Unable to sync board ${boardId}.`);
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        boardId: String(formData.get("boardId") ?? "").trim() || null,
      },
    }),
  },
);

export const syncAllBoardsAction = withActionLogging(
  "action.sync_all_boards",
  async (
    _: ActionState,
    _formData: FormData,
  ): Promise<ActionState> => {
    try {
      const context = await requireHouseholdRole("owner");
      const results = await runManualSyncAllBoards({
        householdId: context.householdId,
      });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message:
          results.boards.length > 0
            ? `Synced ${results.boards.length} selected boards.`
            : "No boards are selected for sync yet.",
      };
    } catch (error) {
      return toErrorState(error, "Unable to sync all boards.");
    }
  },
);

export const forcePinterestResyncAction = withActionLogging(
  "action.force_pinterest_resync",
  async (_: ActionState, _formData: FormData): Promise<ActionState> => {
    try {
      const context = await requireHouseholdRole("owner");
      const result = await runForcePinterestResync({ householdId: context.householdId });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: result.boards.length > 0
          ? `Force resynced ${result.boards.length} selected boards.`
          : "No boards are selected for sync yet.",
      };
    } catch (error) {
      return toErrorState(error, "Unable to force Pinterest resync.");
    }
  },
);

export const setBoardSyncEnabledAction = withActionLogging(
  "action.set_board_sync_enabled",
  async (
    _: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const boardId = String(formData.get("boardId") ?? "").trim();
    const boardName = toOptionalString(formData.get("boardName"));
    const syncEnabled =
      String(formData.get("syncEnabled") ?? "").trim() === "true";

    if (!boardId) {
      return { status: "error", message: "Board ID is required." };
    }

    const context = await requireHouseholdRole("owner");
    const { db, sqlite } = await openDatabase();

    try {
      const now = new Date().toISOString();

      await db.insert(boardSyncSubscriptions)
        .values({
          householdId: context.householdId,
          pinterestBoardId: boardId,
          boardName,
          syncEnabled,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            boardSyncSubscriptions.householdId,
            boardSyncSubscriptions.pinterestBoardId,
          ],
          set: {
            boardName,
            syncEnabled,
            updatedAt: now,
          },
        })
        .run();

      if (syncEnabled) {
        after(async () => {
          await runBackgroundJob({
            name: "background.board_enable_sync",
            target: {
              boardId,
              householdId: context.householdId,
            },
            fn: async () => {
              await runManualBoardSync({
                householdId: context.householdId,
                boardId,
                boardName,
                syncEnabled: true,
              });

              await extractRecipes({
                householdId: context.householdId,
                boardId,
              });

              revalidateAll(recipeScopedPaths(boardId));
            },
          });
        });

        revalidateAll(recipeScopedPaths(boardId));
        return {
          status: "success",
          message: `Added ${boardName ?? boardId} to synced boards. Sync and recipe parsing are running in the background.`,
        };
      }

      revalidateAll(recipeScopedPaths(boardId));
      return {
        status: "success",
        message: syncEnabled
          ? `Added ${boardName ?? boardId} to synced boards.`
          : `Paused sync for ${boardName ?? boardId}.`,
      };
    } catch (error) {
      return toErrorState(error, "Unable to update board sync selection.");
    } finally {
      await sqlite.close();
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        boardId: String(formData.get("boardId") ?? "").trim() || null,
      },
      result: {
        syncEnabled: String(formData.get("syncEnabled") ?? "").trim() === "true",
      },
    }),
  },
);

export const extractPendingAction = withActionLogging(
  "action.extract_pending",
  async (
    _: ActionState,
    _formData: FormData,
  ): Promise<ActionState> => {
    try {
      const context = await requireHouseholdRole("owner");
      const result = await extractRecipes({ householdId: context.householdId });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: `Processed ${result.processed} pins. Extracted ${result.extracted}.`,
      };
    } catch (error) {
      return toErrorState(error, "Unable to extract recipes.");
    }
  },
);

export const rerunBoardExtractionAction = withActionLogging(
  "action.rerun_board_extraction",
  async (
    _: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const boardId = String(formData.get("boardId") ?? "").trim();

    if (!boardId) {
      return { status: "error", message: "Board ID is required." };
    }

    try {
      const context = await requireHouseholdRole("owner");
      const result = await extractRecipes({
        householdId: context.householdId,
        boardId,
        rerun: true,
      });
      revalidateAll(recipeScopedPaths(boardId));
      return {
        status: "success",
        message: `Re-ran recipe parsing. ${result.extracted} extracted, ${result.reviewNeeded} need review.`,
      };
    } catch (error) {
      return toErrorState(
        error,
        `Unable to rerun extraction for board ${boardId}.`,
      );
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        boardId: String(formData.get("boardId") ?? "").trim() || null,
      },
    }),
  },
);
