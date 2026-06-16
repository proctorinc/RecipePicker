import crypto from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import {
  householdRecipeParseJobItems,
  householdRecipeParseJobs,
} from "@/lib/server/db";
import { extractSingleRecipe } from "@/lib/server/extract";

const ACTIVE_JOB_STATUSES = ["queued", "running", "cancelling"] as const;
const TERMINAL_JOB_STATUSES = ["completed", "cancelled"] as const;
const RECIPE_PARSE_CHUNK_SIZE = 20;
const RECIPE_PARSE_CONCURRENCY = 3;
const RECIPE_PARSE_LEASE_MS = 90 * 1000;
const RECIPE_PARSE_STALE_HEARTBEAT_MS = 2 * 60 * 1000;

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
    };

export async function createRecipeParseJob(input: {
  householdId: string;
  requestedByClerkUserId: string;
  recipeIds: string[];
  rerun: boolean;
  filters?: Record<string, unknown> | null;
  mode?: string;
}) : Promise<CreateRecipeParseJobResult> {
  const { db, sqlite } = await openDatabase();

  try {
    const existingActiveJob = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { and, eq, inArray }) =>
        and(eq(table.householdId, input.householdId), inArray(table.status, [...ACTIVE_JOB_STATUSES])),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      columns: {
        jobId: true,
      },
    });

    if (existingActiveJob) {
      return {
        ok: false,
        message: "A bulk parse job is already running for this household.",
        activeJobId: existingActiveJob.jobId,
      };
    }

    const normalizedIds = Array.from(
      new Set(input.recipeIds.map((recipeId) => recipeId.trim()).filter((recipeId) => recipeId.length > 0)),
    );

    if (normalizedIds.length === 0) {
      return {
        ok: false,
        message: "Choose at least one recipe to re-parse.",
      };
    }

    const recipes = await db.query.householdRecipes.findMany({
      where: (table, { and, eq, inArray }) =>
        and(eq(table.householdId, input.householdId), inArray(table.recipeId, normalizedIds)),
      columns: {
        recipeId: true,
      },
    });
    const allowedIds = normalizedIds.filter((recipeId) => recipes.some((recipe) => recipe.recipeId === recipeId));

    if (allowedIds.length === 0) {
      return {
        ok: false,
        message: "No matching recipes were found.",
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

    return {
      ok: true,
      jobId,
      workerToken,
      totalRecipes: allowedIds.length,
      status: "queued",
      createdAt,
    };
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
      return {
        ok: false,
        message: "The parse job was not found.",
      };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      return {
        ok: false,
        message: "This parse job has already finished.",
      };
    }

    const now = new Date().toISOString();
    await db.update(householdRecipeParseJobs)
      .set({
        status: "cancelling",
        cancelRequestedAt: job.cancelRequestedAt ?? now,
        updatedAt: now,
      })
      .where(eq(householdRecipeParseJobs.jobId, input.jobId))
      .run();

    return {
      ok: true,
      message: "Cancellation requested. The current chunk will finish before the job stops.",
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
      return {
        ok: false,
        message: "The parse job was not found.",
      };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
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

    return {
      ok: true,
      message: "Resume requested. The next parse chunk is starting.",
      workerToken: job.workerToken,
    };
  } finally {
    await sqlite.close();
  }
}

export async function runRecipeParseJobWorker(input: {
  jobId: string;
  workerToken: string;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const job = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { eq }) => eq(table.jobId, input.jobId),
    });

    if (!job || job.workerToken !== input.workerToken) {
      return { status: "unauthorized" as const };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      return { status: "already_finished" as const };
    }

    const now = new Date();
    await requeueStaleProcessingItems(db, job.jobId, now);

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
      return { status: "busy" as const };
    }

    if (job.cancelRequestedAt) {
      await finalizeCancelledJob(db, job.jobId, now.toISOString());
      return { status: "cancelled" as const };
    }

    const claimedItems = await claimNextJobItems(db, job.jobId, now.toISOString());

    if (claimedItems.length === 0) {
      await finalizeCompletedJob(db, job.jobId, now.toISOString());
      return { status: "completed" as const };
    }

    await markJobHeartbeat(db, job.jobId, "running", now.toISOString());

    await runWithConcurrency(claimedItems, RECIPE_PARSE_CONCURRENCY, async (item) => {
      try {
        const result = await extractSingleRecipe({
          householdId: job.householdId,
          recipeId: item.recipeId,
          rerun: job.rerun,
        });
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
              : "Recipe parsing did not complete successfully."
            : null,
          lastExtractionId: result.extractionId,
        });
      } catch (error) {
        await completeJobItem(db, {
          jobItemId: item.jobItemId,
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
          lastExtractionId: null,
        });
      } finally {
        await markJobHeartbeat(db, job.jobId, job.cancelRequestedAt ? "cancelling" : "running", new Date().toISOString());
      }
    });

    const counts = await rollupJobProgress(db, job.jobId, new Date().toISOString());

    if (counts.queued === 0 && counts.processing === 0) {
      if (job.cancelRequestedAt) {
        await finalizeCancelledJob(db, job.jobId, new Date().toISOString());
        return { status: "cancelled" as const };
      }

      await finalizeCompletedJob(db, job.jobId, new Date().toISOString());
      return { status: "completed" as const };
    }

    const refreshedJob = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { eq }) => eq(table.jobId, job.jobId),
      columns: {
        cancelRequestedAt: true,
      },
    });

    if (refreshedJob?.cancelRequestedAt) {
      await finalizeCancelledJob(db, job.jobId, new Date().toISOString());
      return { status: "cancelled" as const };
    }

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
    .where(eq(householdRecipeParseJobItems.jobItemId, input.jobItemId))
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
    .where(eq(householdRecipeParseJobs.jobId, jobId))
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
    .where(eq(householdRecipeParseJobs.jobId, jobId))
    .run();
}

async function finalizeCancelledJob(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  jobId: string,
  now: string,
) {
  await db.update(householdRecipeParseJobItems)
    .set({
      status: "cancelled",
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(householdRecipeParseJobItems.jobId, jobId), eq(householdRecipeParseJobItems.status, "queued")))
    .run();

  await rollupJobProgress(db, jobId, now);
  await db.update(householdRecipeParseJobs)
    .set({
      status: "cancelled",
      completedAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(householdRecipeParseJobs.jobId, jobId))
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
