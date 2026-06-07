"use server";

import { after } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import { boardSyncSubscriptions } from "@/lib/server/db";
import { extractRecipes } from "@/lib/server/extract";
import { syncAllBoards, syncBoard as syncSingleBoard } from "@/lib/server/sync";
import {
  revalidateAll,
  recipeScopedPaths,
  toErrorState,
  toOptionalString,
} from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/actions/types";

export async function syncBoardAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const boardId = String(formData.get("boardId") ?? "").trim();
  const boardName = toOptionalString(formData.get("boardName"));

  if (!boardId) {
    return { status: "error", message: "Board ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
    const result = await syncSingleBoard(boardId, {
      householdId: context.householdId,
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
}

export async function syncAllBoardsAction(
  _: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireHouseholdContext();
    const results = await syncAllBoards({ householdId: context.householdId });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message:
        results.length > 0
          ? `Synced ${results.length} selected boards.`
          : "No boards are selected for sync yet.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to sync all boards.");
  }
}

export async function setBoardSyncEnabledAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const boardId = String(formData.get("boardId") ?? "").trim();
  const boardName = toOptionalString(formData.get("boardName"));
  const syncEnabled =
    String(formData.get("syncEnabled") ?? "").trim() === "true";

  if (!boardId) {
    return { status: "error", message: "Board ID is required." };
  }

  const context = await requireHouseholdContext();
  const { db, sqlite } = openDatabase();

  try {
    const now = new Date().toISOString();

    db.insert(boardSyncSubscriptions)
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
        try {
          await syncSingleBoard(boardId, {
            householdId: context.householdId,
            boardName,
            syncEnabled: true,
          });

          await extractRecipes({
            householdId: context.householdId,
            boardId,
          });

          revalidateAll(recipeScopedPaths(boardId));
        } catch (error) {
          console.error(`Background sync failed for board ${boardId}`, error);
        }
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
    sqlite.close();
  }
}

export async function extractPendingAction(
  _: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireHouseholdContext();
    const result = await extractRecipes({ householdId: context.householdId });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: `Processed ${result.processed} pins. Extracted ${result.extracted}.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to extract recipes.");
  }
}

export async function rerunBoardExtractionAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const boardId = String(formData.get("boardId") ?? "").trim();

  if (!boardId) {
    return { status: "error", message: "Board ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
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
}
