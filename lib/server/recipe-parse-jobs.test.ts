import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/server/database";
import {
  householdBoards,
  householdPins,
  householdRecipeParseJobItems,
  householdRecipeParseJobs,
  householdRecipes,
  households,
} from "@/lib/server/db";
import {
  cancelRecipeParseJob,
  createRecipeParseJob,
  findStalledRecipeParseJobs,
  markRecipeParseJobQueueingFailure,
  processRecipeParseJobChunk,
} from "@/lib/server/recipe-parse-jobs";
import { runRecipeParseJobWorkflow } from "@/src/inngest/functions/recipe-parse";

const { mockExtractSingleRecipe } = vi.hoisted(() => ({
  mockExtractSingleRecipe: vi.fn(),
}));

vi.mock("@/lib/server/extract", () => ({
  extractSingleRecipe: mockExtractSingleRecipe,
}));

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

async function withTestDatabase(
  run: (args: { sqlitePath: string }) => Promise<void>,
) {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSqlitePath = process.env.SQLITE_PATH;
  setNodeEnv("development");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-"));
  const sqlitePath = path.join(tempDir, "recipe-parse-jobs.sqlite");
  const seededSqlitePath = path.join(process.cwd(), "data", "db.sqlite");
  fs.copyFileSync(seededSqlitePath, sqlitePath);
  process.env.SQLITE_PATH = sqlitePath;

  try {
    await run({ sqlitePath });
  } finally {
    setNodeEnv(originalNodeEnv);
    if (originalSqlitePath == null) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seedRecipeParseJob(sqlitePath: string, totalRecipes: number) {
  const { db, sqlite } = await openDatabase(sqlitePath);
  const householdId = "household-test";
  const boardId = "board-test";
  const jobId = "job-test";
  const workerToken = "worker-token";
  const now = "2026-06-17T00:00:00.000Z";

  try {
    await db.insert(households)
      .values({
        householdId,
        name: "Test kitchen",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await db.insert(householdBoards)
      .values({
        boardId,
        householdId,
        pinterestBoardId: "pboard-test",
        name: "Weeknight",
        description: null,
        privacy: null,
        ownerJson: null,
        rawJson: "{}",
        syncEnabled: true,
        lastSyncedAt: now,
      })
      .run();

    for (let index = 0; index < totalRecipes; index += 1) {
      const recipeId = `recipe-${index + 1}`;
      const pinId = `pin-${index + 1}`;

      await db.insert(householdPins)
        .values({
          pinId,
          householdId,
          pinterestPinId: `ppin-${index + 1}`,
          boardId,
          pinterestBoardId: "pboard-test",
          boardSectionId: null,
          title: `Recipe ${index + 1}`,
          description: null,
          link: `https://example.com/recipes/${index + 1}`,
          altText: null,
          dominantColor: null,
          note: null,
          createdAt: now,
          parentPinId: null,
          mediaJson: null,
          mediaSourceJson: null,
          creatorJson: null,
          boardOwnerJson: null,
          rawJson: "{}",
          updatedAt: now,
        })
        .run();

      await db.insert(householdRecipes)
        .values({
          recipeId,
          householdId,
          pinId,
          title: `Recipe ${index + 1}`,
          description: null,
          imageUrl: null,
          titleOverridden: false,
          descriptionOverridden: false,
          imageUrlOverridden: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    await db.insert(householdRecipeParseJobs)
      .values({
        jobId,
        householdId,
        status: "queued",
        requestedByClerkUserId: "user_123",
        mode: "bulk_rerun_selection",
        rerun: true,
        filtersJson: null,
        recipeIdsJson: JSON.stringify(
          Array.from({ length: totalRecipes }, (_, index) => `recipe-${index + 1}`),
        ),
        totalRecipes,
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
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await db.insert(householdRecipeParseJobItems)
      .values(
        Array.from({ length: totalRecipes }, (_, index) => ({
          jobItemId: `job-item-${index + 1}`,
          jobId,
          recipeId: `recipe-${index + 1}`,
          position: index + 1,
          status: "queued" as const,
          attemptCount: 0,
          startedAt: null,
          completedAt: null,
          lastError: null,
          lastExtractionId: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();

    return {
      householdId,
      jobId,
      workerToken,
    };
  } finally {
    await sqlite.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockExtractSingleRecipe.mockReset();
});

describe("processRecipeParseJobChunk", () => {
  it("processes a 45-recipe job across twelve chunks", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { jobId } = await seedRecipeParseJob(sqlitePath, 45);
      let extractionCount = 0;

      const databaseContexts = new Set<unknown>();
      mockExtractSingleRecipe.mockImplementation(async ({ recipeId, database }: { recipeId: string; database?: unknown }) => {
        extractionCount += 1;
        databaseContexts.add(database);
        return {
          outcome: "extracted",
          extractionId: null,
        };
      });

      for (let remaining = 41; remaining > 0; remaining -= 4) {
        await expect(processRecipeParseJobChunk({ jobId })).resolves.toEqual({
          status: "continued",
          remaining,
        });
      }
      await expect(processRecipeParseJobChunk({ jobId })).resolves.toEqual({ status: "completed" });
      expect(extractionCount).toBe(45);
      expect(databaseContexts.size).toBe(12);

      const { db, sqlite } = await openDatabase(sqlitePath);

      try {
        const job = await db.query.householdRecipeParseJobs.findFirst({
          where: (table, { eq }) => eq(table.jobId, jobId),
        });

        expect(job).toMatchObject({
          status: "completed",
          totalRecipes: 45,
          processedRecipes: 45,
          succeededRecipes: 45,
          reviewNeededRecipes: 0,
          failedRecipes: 0,
        });
      } finally {
        await sqlite.close();
      }
    });
  });

  it("stops an active chunk immediately when the job is cancelled", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { householdId, jobId } = await seedRecipeParseJob(sqlitePath, 25);
      let started = 0;
      let aborted = 0;

      mockExtractSingleRecipe.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
        started += 1;
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            aborted += 1;
            reject(new DOMException("Cancelled", "AbortError"));
          }, { once: true });
        });
      });

      const chunk = processRecipeParseJobChunk({ jobId });
      while (started < 2) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await expect(cancelRecipeParseJob({ householdId, jobId })).resolves.toMatchObject({
        ok: true,
        message: "Job cancelled immediately.",
      });
      await expect(chunk).resolves.toEqual({ status: "cancelled" });
      expect(started).toBe(2);
      expect(aborted).toBe(2);

      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        const job = await db.query.householdRecipeParseJobs.findFirst({
          where: (table, { eq }) => eq(table.jobId, jobId),
        });
        const items = await db.query.householdRecipeParseJobItems.findMany({
          where: (table, { eq }) => eq(table.jobId, jobId),
        });

        expect(job?.status).toBe("cancelled");
        expect(items).toHaveLength(25);
        expect(items.every((item) => item.status === "cancelled")).toBe(true);
      } finally {
        await sqlite.close();
      }
    });
  });

  it("cancels a queued job without starting extraction", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { householdId, jobId } = await seedRecipeParseJob(sqlitePath, 2);

      await expect(cancelRecipeParseJob({ householdId, jobId })).resolves.toMatchObject({
        ok: true,
        message: "Job cancelled immediately.",
      });
      await expect(processRecipeParseJobChunk({ jobId })).resolves.toEqual({ status: "cancelled" });
      expect(mockExtractSingleRecipe).not.toHaveBeenCalled();
    });
  });
});

describe("markRecipeParseJobQueueingFailure", () => {
  it("records a resumable queueing error when dispatch to Inngest fails", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { jobId } = await seedRecipeParseJob(sqlitePath, 1);

      await markRecipeParseJobQueueingFailure({
        jobId,
        error: new Error("Inngest dispatch failed"),
      });

      const { db, sqlite } = await openDatabase(sqlitePath);

      try {
        const job = await db.query.householdRecipeParseJobs.findFirst({
          where: (table, { eq }) => eq(table.jobId, jobId),
        });

        expect(job?.status).toBe("queued");
        expect(job?.lastError).toMatch(/could not be queued in inngest/i);
        expect(job?.lastError).toMatch(/dispatch failed/i);
      } finally {
        await sqlite.close();
      }
    });
  });
});

describe("runRecipeParseJobWorkflow", () => {
  it("loops chunks through step.run until the job completes", async () => {
    const step = {
      sleep: vi.fn(),
      run: vi.fn()
        .mockResolvedValueOnce({ status: "continued", remaining: 25 })
        .mockResolvedValueOnce({ status: "continued", remaining: 5 })
        .mockResolvedValueOnce({ status: "completed" }),
    };

    const result = await runRecipeParseJobWorkflow({
      jobId: "job_123",
      householdId: "household_123",
      step,
    });

    expect(result).toEqual({ status: "completed" });
    expect(step.run).toHaveBeenNthCalledWith(1, "chunk-1", expect.any(Function));
    expect(step.run).toHaveBeenNthCalledWith(2, "chunk-2", expect.any(Function));
    expect(step.run).toHaveBeenNthCalledWith(3, "chunk-3", expect.any(Function));
  });

  it("does not schedule another chunk after cancellation", async () => {
    const step = {
      sleep: vi.fn(),
      run: vi.fn().mockResolvedValue({ status: "cancelled" }),
    };

    await expect(runRecipeParseJobWorkflow({
      jobId: "job_123",
      householdId: "household_123",
      step,
    })).resolves.toEqual({ status: "cancelled" });
    expect(step.run).toHaveBeenCalledTimes(1);
  });
});


describe("queue eligibility and recovery", () => {
  it("queues only unreserved recipes and creates no empty job on repeat sync", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { householdId } = await seedRecipeParseJob(sqlitePath, 2);
      const { db, sqlite } = await openDatabase(sqlitePath);
      await db.delete(householdRecipeParseJobItems).where(eq(householdRecipeParseJobItems.recipeId, "recipe-2")).run();
      await sqlite.close();
      const input = { householdId, requestedByClerkUserId: "user_123", recipeIds: ["recipe-1", "recipe-2", "recipe-2"], rerun: false, mode: "pinterest_sync" };
      const first = await createRecipeParseJob(input);
      expect(first).toMatchObject({ ok: true, totalRecipes: 1 });
      expect(await createRecipeParseJob(input)).toMatchObject({ ok: false, reason: "no_new_recipes" });
      const handle = await openDatabase(sqlitePath);
      try {
        const jobs = await handle.db.query.householdRecipeParseJobs.findMany({ where: (table, { eq }) => eq(table.householdId, householdId) });
        expect(jobs).toHaveLength(2);
        expect(jobs.find((job) => job.jobId !== "job-test")?.recipeIdsJson).toBe('["recipe-2"]');
      } finally { await handle.sqlite.close(); }
    });
  });

  it("does not automatically queue previously attempted recipes but permits an explicit reparse", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { householdId, jobId } = await seedRecipeParseJob(sqlitePath, 1);
      mockExtractSingleRecipe.mockResolvedValue({ outcome: "failed", extractionId: null });
      await processRecipeParseJobChunk({ jobId });
      const input = { householdId, requestedByClerkUserId: "user_123", recipeIds: ["recipe-1"], mode: "pinterest_sync" };
      expect(await createRecipeParseJob({ ...input, rerun: false })).toMatchObject({ ok: false, reason: "no_new_recipes" });
      expect(await createRecipeParseJob({ ...input, mode: "bulk_rerun_selection", rerun: true })).toMatchObject({ ok: true, totalRecipes: 1 });
      expect(await findStalledRecipeParseJobs()).toHaveLength(0);
    });
  });

  it("records abort failures and advances instead of leaving items processing", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { jobId } = await seedRecipeParseJob(sqlitePath, 2);
      mockExtractSingleRecipe.mockRejectedValue(new DOMException("Timed out", "AbortError"));
      expect(await processRecipeParseJobChunk({ jobId })).toEqual({ status: "completed" });
      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        const job = await db.query.householdRecipeParseJobs.findFirst({ where: (table, { eq }) => eq(table.jobId, jobId) });
        expect(job).toMatchObject({ processedRecipes: 2, failedRecipes: 2 });
      } finally { await sqlite.close(); }
    });
  });

  it("retires legacy duplicate sync jobs without extracting again", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { householdId, jobId } = await seedRecipeParseJob(sqlitePath, 1);
      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        const original = await db.query.householdRecipeParseJobs.findFirst({ where: (table, { eq }) => eq(table.jobId, jobId) });
        await db.insert(householdRecipeParseJobs).values({ ...original!, jobId: "duplicate-job", mode: "pinterest_sync", createdAt: "2026-06-18T00:00:00.000Z" }).run();
        await db.insert(householdRecipeParseJobItems).values({ jobItemId: "duplicate-item", jobId: "duplicate-job", recipeId: "recipe-1", position: 1, status: "queued", attemptCount: 0, createdAt: "2026-06-18T00:00:00.000Z", updatedAt: "2026-06-18T00:00:00.000Z" }).run();
      } finally { await sqlite.close(); }
      expect(await findStalledRecipeParseJobs(new Date("2026-06-19T00:00:00Z"))).toContainEqual({ householdId, jobId });
      expect((await findStalledRecipeParseJobs(new Date("2026-06-19T00:00:00Z")))).toHaveLength(1);
      expect(await processRecipeParseJobChunk({ jobId: "duplicate-job" })).toEqual({ status: "completed" });
      expect(mockExtractSingleRecipe).not.toHaveBeenCalled();
    });
  });

  it("waits and retries a busy chunk", async () => {
    const step = { sleep: vi.fn(), run: vi.fn().mockResolvedValueOnce({ status: "busy" }).mockResolvedValueOnce({ status: "completed" }) };
    expect(await runRecipeParseJobWorkflow({ jobId: "job", householdId: "household", step })).toEqual({ status: "completed" });
    expect(step.sleep).toHaveBeenCalledWith("wait-1", "30s");
    expect(step.run).toHaveBeenNthCalledWith(2, "chunk-2", expect.any(Function));
  });
});
