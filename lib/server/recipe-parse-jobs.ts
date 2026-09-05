import crypto from "node:crypto";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "@/src/db/schema";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import {
  householdRecipeParseJobItems,
  householdRecipeParseJobs,
  householdRecipeInstructions,
} from "@/lib/server/db";
import { extractSingleRecipe } from "@/lib/server/extract";
import {
  logAudit,
  logError,
  logInfo,
  logWarn,
  sanitizeForLogging,
} from "@/lib/server/logger";

const ACTIVE_JOB_STATUSES = ["queued", "running", "cancelling"] as const;
const TERMINAL_JOB_STATUSES = ["completed", "cancelled"] as const;
const RECIPE_PARSE_CHUNK_SIZE = 4;
const RECIPE_PARSE_CONCURRENCY = 2;
const RECIPE_PARSE_LEASE_MS = 4 * 60 * 1000;
const RECIPE_PARSE_STALE_HEARTBEAT_MS = 2 * 60 * 1000;
const RECIPE_PARSE_JOB_QUEUEING_ERROR =
  "The parse job could not be queued in Inngest. Resume to continue parsing.";
const RECIPE_PARSE_JOB_WORKFLOW_ERROR =
  "The parse job stopped unexpectedly. Resume to continue parsing.";

function logRecipeParseJobEvent(
  level: "info" | "warn" | "error" | "audit",
  event: string,
  input: {
    householdId?: string | null;
    jobId?: string | null;
    data?: Record<string, unknown>;
    error?: unknown;
  },
) {
  const sanitizedData = sanitizeForLogging(input.data ?? {});
  const payload = {
    target: {
      householdId: input.householdId ?? null,
      jobId: input.jobId ?? null,
    },
    ...(sanitizedData && typeof sanitizedData === "object" && !Array.isArray(sanitizedData)
      ? sanitizedData
      : {}),
  };

  if (level === "audit") {
    logAudit(event, payload);
    return;
  }

  if (level === "warn") {
    logWarn(event, payload);
    return;
  }

  if (level === "error") {
    logError(event, input.error ?? new Error(event), payload);
    return;
  }

  logInfo(event, payload);
}

export type RecipeParseJobStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled";

export type RecipeParseJobItemStatus =
  | "queued"
  | "processing"
  | "extracted"
  | "review_needed"
  | "failed"
  | "cancelled";

export type CreateRecipeParseJobResult =
  | {
      ok: true;
      jobId: string;
      workerToken: string;
      totalRecipes: number;
      status: RecipeParseJobStatus;
      createdAt: string;
    }
  | {
      ok: false;
      message: string;
      activeJobId?: string;
      reason?: "no_new_recipes";
    };

// Serialize eligibility checks and inserts across requests, including Turso workers.
async function withQueueTransaction<T>(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  driver: "sqlite" | "turso",
  work: (tx: Awaited<ReturnType<typeof openDatabase>>["db"]) => Promise<T>,
): Promise<T> {
  if (driver === "turso") {
    return (db as LibSQLDatabase<typeof schema>).transaction(async (tx) => work(tx as unknown as typeof db));
  }
  // better-sqlite3's callback transaction cannot contain async work.
  await db.run(sql`BEGIN IMMEDIATE`);
  try {
    const result = await work(db);
    await db.run(sql`COMMIT`);
    return result;
  } catch (error) {
    await db.run(sql`ROLLBACK`);
    throw error;
  }
}

export async function createRecipeParseJob(input: {
  householdId: string;
  requestedByClerkUserId: string;
  recipeIds: string[];
  rerun: boolean;
  filters?: Record<string, unknown> | null;
  mode?: string;
}) : Promise<CreateRecipeParseJobResult> {
  const { db, sqlite, driver } = await openDatabase();

  try {
    return await withQueueTransaction(db, driver, async (db) => {
      const existingActiveJob = await db.query.householdRecipeParseJobs.findFirst({
        where: (table, { and, eq, inArray }) =>
          and(eq(table.householdId, input.householdId), inArray(table.status, [...ACTIVE_JOB_STATUSES])),
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
        columns: {
          jobId: true,
        },
      });

      // Pinterest syncs must not drop newly discovered recipes merely because a
      // prior parse job is still active. Inngest serializes household workers,
      // so this job will wait its turn without competing for extraction work.
      if (existingActiveJob && input.mode !== "pinterest_sync") {
        logRecipeParseJobEvent("warn", "recipe_parse_job.create_conflict", {
          householdId: input.householdId,
          jobId: existingActiveJob.jobId,
          data: {
            result: {
              status: "conflict",
            },
          },
        });
        return {
          ok: false,
          message: "A bulk parse job is already running for this kitchen.",
          activeJobId: existingActiveJob.jobId,
        };
      }

      const normalizedIds = Array.from(
        new Set(input.recipeIds.map((recipeId) => recipeId.trim()).filter((recipeId) => recipeId.length > 0)),
      );

      if (normalizedIds.length === 0) {
        logRecipeParseJobEvent("warn", "recipe_parse_job.create_rejected", {
          householdId: input.householdId,
          data: {
            reason: "empty_selection",
          },
        });
        return {
          ok: false,
          message: "Choose at least one recipe to re-parse.",
        };
      }

      const recipes = await db.query.householdRecipes.findMany({
        where: (table, { and, eq, inArray, isNull }) =>
          and(
            eq(table.householdId, input.householdId),
            inArray(table.recipeId, normalizedIds),
            isNull(table.removedAt),
          ),
        columns: {
          recipeId: true,
        },
        with: { recipeInstructions: { columns: { recipeId: true } } },
      });
      const existingItems = await db.select()
        .from(householdRecipeParseJobItems)
        .innerJoin(householdRecipeParseJobs, eq(householdRecipeParseJobs.jobId, householdRecipeParseJobItems.jobId))
        .where(and(
          eq(householdRecipeParseJobs.householdId, input.householdId),
          inArray(householdRecipeParseJobItems.recipeId, normalizedIds),
          input.rerun
            ? inArray(householdRecipeParseJobs.status, [...ACTIVE_JOB_STATUSES])
            : ne(householdRecipeParseJobItems.status, "cancelled"),
        ));
      const reservedIds = new Set(existingItems.map((item) => item.household_recipe_parse_job_items.recipeId));
      const allowedIds = recipes.filter((recipe) =>
        !reservedIds.has(recipe.recipeId) && (input.rerun || !recipe.recipeInstructions),
      ).map((recipe) => recipe.recipeId);

      if (allowedIds.length === 0) {
        logRecipeParseJobEvent("warn", "recipe_parse_job.create_rejected", {
          householdId: input.householdId,
          data: {
            reason: "no_matching_recipes",
            requestedRecipeCount: normalizedIds.length,
          },
        });
        return {
          ok: false,
          message: "No new recipes need parsing.",
          reason: "no_new_recipes",
        };
      }

      const createdAt = new Date().toISOString();
      const workerToken = crypto.randomUUID();
      const jobId = crypto.randomUUID();

      await db.insert(householdRecipeParseJobs)
        .values({
          jobId,
          householdId: input.householdId,
          status: "queued",
          requestedByClerkUserId: input.requestedByClerkUserId,
          mode: input.mode ?? "bulk_rerun_selection",
          rerun: input.rerun,
          filtersJson: input.filters ? JSON.stringify(input.filters) : null,
          recipeIdsJson: JSON.stringify(allowedIds),
          totalRecipes: allowedIds.length,
          processedRecipes: 0,
          succeededRecipes: 0,
          reviewNeededRecipes: 0,
          failedRecipes: 0,
          cancelRequestedAt: null,
          startedAt: null,
          completedAt: null,
          lastHeartbeatAt: null,
          lastError: null,
          workerToken,
          createdAt,
          updatedAt: createdAt,
        })
        .run();

      try {
        await db.insert(householdRecipeParseJobItems)
          .values(
            allowedIds.map((recipeId, index) => ({
              jobItemId: crypto.randomUUID(),
              jobId,
              recipeId,
              position: index + 1,
              status: "queued",
              attemptCount: 0,
              startedAt: null,
              completedAt: null,
              lastError: null,
              lastExtractionId: null,
              createdAt,
              updatedAt: createdAt,
            })),
          )
          .run();
      } catch (error) {
        await db.delete(householdRecipeParseJobs)
          .where(eq(householdRecipeParseJobs.jobId, jobId))
          .run();
        throw error;
      }

      logRecipeParseJobEvent("audit", "recipe_parse_job.created", {
        householdId: input.householdId,
        jobId,
        data: {
          requestedRecipeCount: normalizedIds.length,
          acceptedRecipeCount: allowedIds.length,
          rerun: input.rerun,
          mode: input.mode ?? "bulk_rerun_selection",
          result: {
            status: "queued",
          },
        },
      });

      return {
        ok: true,
        jobId,
        workerToken,
        totalRecipes: allowedIds.length,
        status: "queued",
        createdAt,
      };
    });
  } finally {
    await sqlite.close();
  }
}

export async function cancelRecipeParseJob(input: {
  householdId: string;
  jobId: string;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const job = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, input.householdId), eq(table.jobId, input.jobId)),
    });

    if (!job) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.cancel_rejected", {
        householdId: input.householdId,
        jobId: input.jobId,
        data: {
          reason: "not_found",
        },
      });
      return {
        ok: false,
        message: "The parse job was not found.",
      };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.cancel_rejected", {
        householdId: input.householdId,
        jobId: input.jobId,
        data: {
          reason: "already_finished",
          jobStatus: job.status,
        },
      });
      return {
        ok: false,
        message: "This parse job has already finished.",
      };
    }

    const now = new Date().toISOString();
    await db.update(householdRecipeParseJobItems)
      .set({
        status: "cancelled",
        completedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(householdRecipeParseJobItems.jobId, input.jobId),
        inArray(householdRecipeParseJobItems.status, ["queued", "processing"]),
      ))
      .run();

    await rollupJobProgress(db, input.jobId, now);
    await db.update(householdRecipeParseJobs)
      .set({
        status: "cancelled",
        cancelRequestedAt: job.cancelRequestedAt ?? now,
        completedAt: now,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(householdRecipeParseJobs.jobId, input.jobId))
      .run();

    logRecipeParseJobEvent("audit", "recipe_parse_job.cancel_requested", {
      householdId: input.householdId,
      jobId: input.jobId,
      data: {
        previousStatus: job.status,
        nextStatus: "cancelled",
      },
    });

    return {
      ok: true,
      message: "Job cancelled immediately.",
    };
  } finally {
    await sqlite.close();
  }
}

export async function resumeRecipeParseJob(input: {
  householdId: string;
  jobId: string;
}): Promise<
  | { ok: true; message: string; workerToken: string }
  | { ok: false; message: string }
> {
  const { db, sqlite } = await openDatabase();

  try {
    const job = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, input.householdId), eq(table.jobId, input.jobId)),
    });

    if (!job) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.resume_rejected", {
        householdId: input.householdId,
        jobId: input.jobId,
        data: {
          reason: "not_found",
        },
      });
      return {
        ok: false,
        message: "The parse job was not found.",
      };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.resume_rejected", {
        householdId: input.householdId,
        jobId: input.jobId,
        data: {
          reason: "already_finished",
          jobStatus: job.status,
        },
      });
      return {
        ok: false,
        message: "This parse job has already finished.",
      };
    }

    const now = new Date();
    await requeueStaleProcessingItems(db, job.jobId, now);

    const activeProcessingItems = await db.query.householdRecipeParseJobItems.findMany({
      where: (table, { and, eq }) => and(eq(table.jobId, job.jobId), eq(table.status, "processing")),
      columns: {
        jobItemId: true,
      },
    });

    if (activeProcessingItems.length > 0 && !isJobHeartbeatStale(job.lastHeartbeatAt, now)) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.resume_rejected", {
        householdId: input.householdId,
        jobId: input.jobId,
        data: {
          reason: "already_processing",
          activeProcessingItems: activeProcessingItems.length,
        },
      });
      return {
        ok: false,
        message: "This parse job is already actively processing.",
      };
    }

    await db.update(householdRecipeParseJobs)
      .set({
        status: job.cancelRequestedAt ? "cancelling" : "queued",
        lastError: null,
        updatedAt: now.toISOString(),
      })
      .where(eq(householdRecipeParseJobs.jobId, job.jobId))
      .run();

    logRecipeParseJobEvent("audit", "recipe_parse_job.resume_requested", {
      householdId: input.householdId,
      jobId: input.jobId,
      data: {
        previousStatus: job.status,
        nextStatus: job.cancelRequestedAt ? "cancelling" : "queued",
      },
    });

    return {
      ok: true,
      message: "Resume requested. The next parse chunk is starting.",
      workerToken: job.workerToken,
    };
  } finally {
    await sqlite.close();
  }
}

export async function markRecipeParseJobQueueingFailure(input: {
  jobId: string;
  error: unknown;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();
    const detail = input.error instanceof Error ? input.error.message : String(input.error);
    const nextError = `${RECIPE_PARSE_JOB_QUEUEING_ERROR} ${detail}`.trim();

    await db.update(householdRecipeParseJobs)
      .set({
        status: "queued",
        lastError: nextError,
        updatedAt: now,
      })
      .where(and(
        eq(householdRecipeParseJobs.jobId, input.jobId),
        ne(householdRecipeParseJobs.status, "cancelled"),
      ))
      .run();

    logRecipeParseJobEvent("error", "recipe_parse_job.queue_failed", {
      jobId: input.jobId,
      error: input.error,
      data: {
        result: {
          status: "error",
        },
        lastError: nextError,
      },
    });
  } finally {
    await sqlite.close();
  }
}

export async function markRecipeParseJobWorkflowFailure(input: {
  jobId: string;
  error: unknown;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();
    const detail = input.error instanceof Error ? input.error.message : String(input.error);
    const nextError = `${RECIPE_PARSE_JOB_WORKFLOW_ERROR} ${detail}`.trim();

    await db.update(householdRecipeParseJobs)
      .set({
        lastError: nextError,
        updatedAt: now,
      })
      .where(eq(householdRecipeParseJobs.jobId, input.jobId))
      .run();

    logRecipeParseJobEvent("error", "recipe_parse_job.workflow_failed", {
      jobId: input.jobId,
      error: input.error,
      data: {
        result: {
          status: "error",
        },
        lastError: nextError,
      },
    });
  } finally {
    await sqlite.close();
  }
}

/** Recover the oldest outstanding job per kitchen without flooding Inngest. */
export async function findStalledRecipeParseJobs(now = new Date()) {
  const { db, sqlite } = await openDatabase();
  try {
    const jobs = await db.query.householdRecipeParseJobs.findMany({
      where: (table, { inArray }) => inArray(table.status, [...ACTIVE_JOB_STATUSES]),
      orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.jobId)],
    });
    const seen = new Set<string>();
    return jobs.filter((job) => {
      if (seen.has(job.householdId)) return false;
      seen.add(job.householdId);
      const lastActivity = job.lastHeartbeatAt ?? job.updatedAt;
      return now.getTime() - new Date(lastActivity).getTime() >= 5 * 60 * 1000;
    }).map(({ jobId, householdId }) => ({ jobId, householdId }));
  } finally {
    await sqlite.close();
  }
}

// Old sync jobs may already contain the same recipe many times. Keep the first
// reservation, and retire later copies before they can start paid extraction.
async function discardDuplicateSyncItems(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  job: typeof householdRecipeParseJobs.$inferSelect,
) {
  if (job.mode !== "pinterest_sync") return;
  await db.run(sql`
    UPDATE household_recipe_parse_job_items SET status = 'cancelled',
      completed_at = ${new Date().toISOString()}, updated_at = ${new Date().toISOString()},
      last_error = 'Skipped: recipe already parsed or reserved by an earlier job.'
    WHERE job_id = ${job.jobId} AND status = 'queued' AND (
      EXISTS (SELECT 1 FROM ${householdRecipeInstructions} AS instructions
        WHERE instructions.recipe_id = household_recipe_parse_job_items.recipe_id)
      OR EXISTS (
        SELECT 1 FROM ${householdRecipeParseJobItems} AS prior
        JOIN ${householdRecipeParseJobs} AS prior_job ON prior_job.job_id = prior.job_id
        WHERE prior.recipe_id = household_recipe_parse_job_items.recipe_id
          AND prior_job.household_id = ${job.householdId}
          AND prior.status != 'cancelled'
          AND (prior_job.created_at < ${job.createdAt}
            OR (prior_job.created_at = ${job.createdAt} AND prior_job.job_id < ${job.jobId}))
      )
    )
  `);
}

export async function processRecipeParseJobChunk(input: {
  jobId: string;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const job = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { eq }) => eq(table.jobId, input.jobId),
    });

    if (!job) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.chunk_skipped", {
        jobId: input.jobId,
        data: {
          reason: "job_not_found",
        },
      });
      return { status: "not_found" as const };
    }

    logRecipeParseJobEvent("info", "recipe_parse_job.chunk_started", {
      householdId: job.householdId,
      jobId: job.jobId,
      data: {
        jobStatus: job.status,
      },
    });

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      logRecipeParseJobEvent("info", "recipe_parse_job.chunk_skipped", {
        householdId: job.householdId,
        jobId: job.jobId,
        data: {
          reason: "already_finished",
          jobStatus: job.status,
        },
      });
      return { status: job.status === "cancelled" ? "cancelled" as const : "already_finished" as const };
    }

    const now = new Date();
    const staleItemCount = await requeueStaleProcessingItems(db, job.jobId, now);

    if (staleItemCount > 0) {
      logRecipeParseJobEvent("warn", "recipe_parse_job.stale_items_requeued", {
        householdId: job.householdId,
        jobId: job.jobId,
        data: {
          staleItemCount,
        },
      });
    }

    const activeProcessingItems = await db.query.householdRecipeParseJobItems.findMany({
      where: (table, { and, eq }) => and(eq(table.jobId, job.jobId), eq(table.status, "processing")),
      columns: {
        jobItemId: true,
      },
    });

    if (activeProcessingItems.length > 0) {
      await markJobHeartbeat(
        db,
        job.jobId,
        job.status === "queued" ? "running" : normalizeRecipeParseJobStatus(job.status),
        now.toISOString(),
      );
      logRecipeParseJobEvent("warn", "recipe_parse_job.chunk_busy", {
        householdId: job.householdId,
        jobId: job.jobId,
        data: {
          activeProcessingItems: activeProcessingItems.length,
        },
      });
      return { status: "busy" as const };
    }

    await discardDuplicateSyncItems(db, job);
    const claimedItems = await claimNextJobItems(db, job.jobId, now.toISOString());

    if (claimedItems.length === 0) {
      const refreshedJob = await db.query.householdRecipeParseJobs.findFirst({
        where: (table, { eq }) => eq(table.jobId, job.jobId),
        columns: { status: true },
      });
      if (refreshedJob?.status === "cancelled") {
        return { status: "cancelled" as const };
      }
      await finalizeCompletedJob(db, job.jobId, now.toISOString());
      logRecipeParseJobEvent("info", "recipe_parse_job.completed", {
        householdId: job.householdId,
        jobId: job.jobId,
        data: {
          reason: "no_remaining_items",
        },
      });
      return { status: "completed" as const };
    }

    await markJobHeartbeat(db, job.jobId, "running", now.toISOString());

    logRecipeParseJobEvent("info", "recipe_parse_job.items_claimed", {
      householdId: job.householdId,
      jobId: job.jobId,
      data: {
        claimedItemCount: claimedItems.length,
        chunkSize: RECIPE_PARSE_CHUNK_SIZE,
        concurrency: RECIPE_PARSE_CONCURRENCY,
        firstPosition: claimedItems[0]?.position ?? null,
        lastPosition: claimedItems.at(-1)?.position ?? null,
      },
    });

    const cancellationMonitor = createJobCancellationMonitor(db, job.jobId);
    try {
      await runWithConcurrency(claimedItems, RECIPE_PARSE_CONCURRENCY, async (item) => {
        if (await cancellationMonitor.isCancelled()) {
          return;
        }

      try {
        const result = await extractSingleRecipe({
          householdId: job.householdId,
          recipeId: item.recipeId,
          rerun: job.rerun,
          signal: cancellationMonitor.signal,
          database: db,
          databaseOwner: "parse_job_chunk",
          jobId: job.jobId,
          queuePosition: item.position,
        });
        if (cancellationMonitor.signal.aborted) {
          return;
        }
        const itemStatus = result.outcome === "extracted"
          ? "extracted"
          : result.outcome === "review_needed"
            ? "review_needed"
            : "failed";

        await completeJobItem(db, {
          jobItemId: item.jobItemId,
          status: itemStatus,
          lastError: itemStatus === "failed"
            ? result.outcome === "skipped"
              ? "Recipe could not be processed because no recipe source URL was available."
              : result.failureReason ?? "extract: Recipe parsing did not complete successfully."
            : null,
          lastExtractionId: result.extractionId,
        });

        logRecipeParseJobEvent("info", "recipe_parse_job.item_completed", {
          householdId: job.householdId,
          jobId: job.jobId,
          data: {
            jobItemId: item.jobItemId,
            recipeId: item.recipeId,
            position: item.position,
            itemStatus,
            attemptCount: item.attemptCount,
          },
        });
      } catch (error) {
        if (cancellationMonitor.signal.aborted) {
          return;
        }
        await completeJobItem(db, {
          jobItemId: item.jobItemId,
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
          lastExtractionId: null,
        });

        logRecipeParseJobEvent("error", "recipe_parse_job.item_failed", {
          householdId: job.householdId,
          jobId: job.jobId,
          error,
          data: {
            jobItemId: item.jobItemId,
            recipeId: item.recipeId,
            position: item.position,
            attemptCount: item.attemptCount,
          },
        });
      } finally {
        if (!cancellationMonitor.signal.aborted) {
          await rollupJobProgress(db, job.jobId, new Date().toISOString());
        }
      }
      });
    } finally {
      await cancellationMonitor.stop();
    }

    const counts = await rollupJobProgress(db, job.jobId, new Date().toISOString());

    logRecipeParseJobEvent("info", "recipe_parse_job.chunk_completed", {
      householdId: job.householdId,
      jobId: job.jobId,
      data: {
        claimedItemCount: claimedItems.length,
        remainingQueuedItems: counts.queued,
        processingItems: counts.processing,
        extractedItems: counts.extracted,
        reviewNeededItems: counts.reviewNeeded,
        failedItems: counts.failed,
        cancelledItems: counts.cancelled,
      },
    });

    if (counts.queued === 0 && counts.processing === 0) {
      const refreshedJob = await db.query.householdRecipeParseJobs.findFirst({
        where: (table, { eq }) => eq(table.jobId, job.jobId),
        columns: { status: true },
      });
      if (refreshedJob?.status === "cancelled") {
        return { status: "cancelled" as const };
      }
      await finalizeCompletedJob(db, job.jobId, new Date().toISOString());
      logRecipeParseJobEvent("info", "recipe_parse_job.completed", {
        householdId: job.householdId,
        jobId: job.jobId,
        data: counts,
      });
      return { status: "completed" as const };
    }

    const refreshedJob = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { eq }) => eq(table.jobId, job.jobId),
      columns: { status: true },
    });

    if (refreshedJob?.status === "cancelled") {
      return { status: "cancelled" as const };
    }

    logRecipeParseJobEvent("info", "recipe_parse_job.chunk_continued", {
      householdId: job.householdId,
      jobId: job.jobId,
      data: {
        remainingQueuedItems: counts.queued,
      },
    });

    return {
      status: "continued" as const,
      remaining: counts.queued,
    };
  } finally {
    await sqlite.close();
  }
}

async function claimNextJobItems(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  now: string,
) {
  const items = await db.query.householdRecipeParseJobItems.findMany({
    where: (table, { and, eq }) => and(eq(table.jobId, jobId), eq(table.status, "queued")),
    orderBy: (table, { asc: orderAsc }) => [orderAsc(table.position)],
    limit: RECIPE_PARSE_CHUNK_SIZE,
  });

  for (const item of items) {
    await db.update(householdRecipeParseJobItems)
      .set({
        status: "processing",
        attemptCount: item.attemptCount + 1,
        startedAt: item.startedAt ?? now,
        updatedAt: now,
      })
      .where(and(eq(householdRecipeParseJobItems.jobItemId, item.jobItemId), eq(householdRecipeParseJobItems.status, "queued")))
      .run();
  }

  return db.query.householdRecipeParseJobItems.findMany({
    where: (table, { and, eq }) => and(eq(table.jobId, jobId), eq(table.status, "processing"), eq(table.updatedAt, now)),
    orderBy: (table, { asc: orderAsc }) => [orderAsc(table.position)],
  });
}

async function completeJobItem(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  input: {
    jobItemId: string;
    status: Extract<RecipeParseJobItemStatus, "extracted" | "review_needed" | "failed">;
    lastError: string | null;
    lastExtractionId: string | null;
  },
) {
  const now = new Date().toISOString();

  await db.update(householdRecipeParseJobItems)
    .set({
      status: input.status,
      lastError: input.lastError,
      lastExtractionId: input.lastExtractionId,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(householdRecipeParseJobItems.jobItemId, input.jobItemId),
      eq(householdRecipeParseJobItems.status, "processing"),
    ))
    .run();
}

async function markJobHeartbeat(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  status: RecipeParseJobStatus,
  now: string,
) {
  await db.update(householdRecipeParseJobs)
    .set({
      status,
      startedAt: status === "running" ? sql`coalesce(${householdRecipeParseJobs.startedAt}, ${now})` : householdRecipeParseJobs.startedAt,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(householdRecipeParseJobs.jobId, jobId),
      ne(householdRecipeParseJobs.status, "cancelled"),
    ))
    .run();
}

async function finalizeCompletedJob(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  now: string,
) {
  await rollupJobProgress(db, jobId, now);
  await db.update(householdRecipeParseJobs)
    .set({
      status: "completed",
      completedAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(householdRecipeParseJobs.jobId, jobId),
      ne(householdRecipeParseJobs.status, "cancelled"),
    ))
    .run();
}

async function rollupJobProgress(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  now: string,
) {
  const items = await db.query.householdRecipeParseJobItems.findMany({
    where: (table, { eq }) => eq(table.jobId, jobId),
    columns: {
      status: true,
    },
  });

  const counts = {
    queued: 0,
    processing: 0,
    extracted: 0,
    reviewNeeded: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const item of items) {
    if (item.status === "queued") {
      counts.queued += 1;
    } else if (item.status === "processing") {
      counts.processing += 1;
    } else if (item.status === "extracted") {
      counts.extracted += 1;
    } else if (item.status === "review_needed") {
      counts.reviewNeeded += 1;
    } else if (item.status === "failed") {
      counts.failed += 1;
    } else if (item.status === "cancelled") {
      counts.cancelled += 1;
    }
  }

  await db.update(householdRecipeParseJobs)
    .set({
      processedRecipes: counts.extracted + counts.reviewNeeded + counts.failed,
      succeededRecipes: counts.extracted,
      reviewNeededRecipes: counts.reviewNeeded,
      failedRecipes: counts.failed,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(householdRecipeParseJobs.jobId, jobId))
    .run();

  return counts;
}

async function requeueStaleProcessingItems(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  now: Date,
) {
  const staleBefore = new Date(now.getTime() - RECIPE_PARSE_LEASE_MS).toISOString();
  const staleItems = await db.query.householdRecipeParseJobItems.findMany({
    where: (table, { and, eq, lt }) =>
      and(eq(table.jobId, jobId), eq(table.status, "processing"), lt(table.updatedAt, staleBefore)),
    columns: {
      jobItemId: true,
      lastError: true,
    },
  });

  for (const item of staleItems) {
    await db.update(householdRecipeParseJobItems)
      .set({
        status: "queued",
        lastError: item.lastError ?? "This item was re-queued after a stale worker lease expired.",
        updatedAt: now.toISOString(),
      })
      .where(eq(householdRecipeParseJobItems.jobItemId, item.jobItemId))
      .run();
  }

  return staleItems.length;
}

function normalizeRecipeParseJobStatus(status: string): RecipeParseJobStatus {
  return status === "queued"
    || status === "running"
    || status === "cancelling"
    || status === "completed"
    || status === "cancelled"
    ? status
    : "running";
}

function isJobHeartbeatStale(lastHeartbeatAt: string | null, now: Date) {
  if (!lastHeartbeatAt) {
    return true;
  }

  const heartbeatMs = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(heartbeatMs)) {
    return true;
  }

  return now.getTime() - heartbeatMs >= RECIPE_PARSE_STALE_HEARTBEAT_MS;
}

function createJobCancellationMonitor(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
) {
  const controller = new AbortController();
  let checking: Promise<boolean> | null = null;

  const isCancelled = async () => {
    if (controller.signal.aborted) {
      return true;
    }
    if (!checking) {
      checking = db.query.householdRecipeParseJobs.findFirst({
        where: (table, { eq }) => eq(table.jobId, jobId),
        columns: { status: true },
      }).then((job) => {
        const cancelled = !job || job.status === "cancelled";
        if (cancelled) {
          controller.abort();
        }
        return cancelled;
      }).catch((error) => {
        logError("recipe_parse_job.cancellation_check_failed", error, {
          target: { jobId },
          action: "cancellation_check",
        });
        return false;
      }).finally(() => {
        checking = null;
      });
    }
    return checking;
  };

  const interval = setInterval(() => {
    void isCancelled().catch((error) => {
      logError("recipe_parse_job.cancellation_check_failed", error, {
        target: { jobId },
        action: "cancellation_check",
      });
    });
  }, 1000);

  return {
    signal: controller.signal,
    isCancelled,
    stop: async () => {
      clearInterval(interval);
      try {
        await checking;
      } catch (error) {
        logError("recipe_parse_job.cancellation_check_failed", error, {
          target: { jobId },
          action: "cancellation_check_shutdown",
        });
      }
    },
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await worker(next);
    }
  });

  await Promise.all(runners);
}
