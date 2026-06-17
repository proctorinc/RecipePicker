import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  runRecipeParseJobWorker,
  scheduleRecipeParseJobWorker,
} from "@/lib/server/recipe-parse-jobs";

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

describe("runRecipeParseJobWorker", () => {
  it("processes a 45-recipe job across three chunks", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { jobId, workerToken } = await seedRecipeParseJob(sqlitePath, 45);
      let extractionCount = 0;

      mockExtractSingleRecipe.mockImplementation(async ({ recipeId }: { recipeId: string }) => {
        extractionCount += 1;
        return {
          outcome: "extracted",
          extractionId: null,
        };
      });

      const first = await runRecipeParseJobWorker({
        jobId,
        workerToken,
      });
      const second = await runRecipeParseJobWorker({
        jobId,
        workerToken,
      });
      const third = await runRecipeParseJobWorker({
        jobId,
        workerToken,
      });

      expect(first).toEqual({
        status: "continued",
        remaining: 25,
      });
      expect(second).toEqual({
        status: "continued",
        remaining: 5,
      });
      expect(third).toEqual({
        status: "completed",
      });
      expect(extractionCount).toBe(45);

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
});

describe("scheduleRecipeParseJobWorker", () => {
  it("records a resumable scheduling error when the worker route cannot be enqueued", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const { jobId, workerToken } = await seedRecipeParseJob(sqlitePath, 1);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "upstream unavailable" }), {
          status: 503,
          headers: {
            "content-type": "application/json",
          },
        }),
      ));

      await expect(
        scheduleRecipeParseJobWorker({
          jobId,
          workerToken,
          origin: "https://food-picker.example.com",
        }),
      ).rejects.toThrow(/HTTP 503/i);

      const { db, sqlite } = await openDatabase(sqlitePath);

      try {
        const job = await db.query.householdRecipeParseJobs.findFirst({
          where: (table, { eq }) => eq(table.jobId, jobId),
        });

        expect(job?.status).toBe("queued");
        expect(job?.lastError).toMatch(/could not schedule the next one/i);
        expect(job?.lastError).toMatch(/HTTP 503/i);
      } finally {
        await sqlite.close();
      }
    });
  });
});
