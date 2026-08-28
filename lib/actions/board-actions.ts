"use server";

import { and, eq } from "drizzle-orm";

import { requireHouseholdRole } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import { boardSyncSubscriptions, pinterestSyncJobs } from "@/lib/server/db";
import { extractRecipes } from "@/lib/server/extract";
import { withActionLogging } from "@/lib/server/logger";
import {
  markPinterestSyncJobFailure,
  requestPinterestSync,
} from "@/lib/server/sync";
import { sendPinterestSyncRequestedEvent } from "@/src/inngest/events";
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
      const result = await requestPinterestSync({ householdId: context.householdId, trigger: "manual", requestedByClerkUserId: context.clerkUserId, boardId, boardName });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: `Sync queued for ${boardName ?? boardId}.`,
        data: { redirectTo: `/settings/pinterest/syncs/${result.syncRunId}` },
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
      const result = await requestPinterestSync({ householdId: context.householdId, trigger: "manual", requestedByClerkUserId: context.clerkUserId });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: "Pinterest sync queued.",
        data: { redirectTo: `/settings/pinterest/syncs/${result.syncRunId}` },
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
      const result = await requestPinterestSync({ householdId: context.householdId, trigger: "force", requestedByClerkUserId: context.clerkUserId });
      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: "Force resync queued.",
        data: { redirectTo: `/settings/pinterest/syncs/${result.syncRunId}` },
      };
    } catch (error) {
      return toErrorState(error, "Unable to force Pinterest resync.");
    }
  },
);

export const retryPinterestSyncAction = withActionLogging(
  "action.retry_pinterest_sync",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const syncRunId = String(formData.get("syncRunId") ?? "").trim();
    if (!syncRunId) return { status: "error", message: "Sync run is required." };
    try {
      const context = await requireHouseholdRole("owner");
      const { db, sqlite } = await openDatabase();
      try {
        const job = await db.query.pinterestSyncJobs.findFirst({
          where: (table, { and, eq }) => and(eq(table.syncRunId, syncRunId), eq(table.householdId, context.householdId)),
        });
        if (!job || job.status !== "error") return { status: "error", message: "This sync cannot be retried." };
        const now = new Date().toISOString();
        await db.update(pinterestSyncJobs).set({ status: "queued", lastError: null, completedAt: null, updatedAt: now }).where(eq(pinterestSyncJobs.jobId, job.jobId)).run();
        try {
          await sendPinterestSyncRequestedEvent({ jobId: job.jobId, householdId: context.householdId });
        } catch (error) {
          await markPinterestSyncJobFailure(job.jobId, error);
          throw error;
        }
      } finally { await sqlite.close(); }
      revalidateAll(recipeScopedPaths());
      return { status: "success", message: "Pinterest sync retry queued." };
    } catch (error) { return toErrorState(error, "Unable to retry Pinterest sync."); }
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
        const result = await requestPinterestSync({ householdId: context.householdId, trigger: "manual", requestedByClerkUserId: context.clerkUserId, boardId, boardName, parseNewRecipes: true });

        revalidateAll(recipeScopedPaths(boardId));
        return {
          status: "success",
          message: `Added ${boardName ?? boardId} to synced boards. Sync and recipe parsing are queued.`,
          data: { redirectTo: `/settings/pinterest/syncs/${result.syncRunId}` },
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
