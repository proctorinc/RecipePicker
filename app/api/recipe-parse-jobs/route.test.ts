import { describe, expect, it, vi } from "vitest";

const {
  mockRequireHouseholdContext,
  mockGetRecipeParseJobSummaries,
  mockCreateRecipeParseJob,
  mockRunRecipeParseJobWorker,
} = vi.hoisted(() => ({
  mockRequireHouseholdContext: vi.fn(),
  mockGetRecipeParseJobSummaries: vi.fn(),
  mockCreateRecipeParseJob: vi.fn(),
  mockRunRecipeParseJobWorker: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireHouseholdContext: mockRequireHouseholdContext,
}));

vi.mock("@/lib/server/queries", () => ({
  getRecipeParseJobSummaries: mockGetRecipeParseJobSummaries,
}));

vi.mock("@/lib/server/recipe-parse-jobs", () => ({
  createRecipeParseJob: mockCreateRecipeParseJob,
  runRecipeParseJobWorker: mockRunRecipeParseJobWorker,
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      void fn();
    },
  };
});

import { GET, POST } from "@/app/api/recipe-parse-jobs/route";

describe("/api/recipe-parse-jobs", () => {
  it("lists recent jobs", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });
    mockGetRecipeParseJobSummaries.mockResolvedValue([
      {
        jobId: "job_123",
        status: "running",
        requestedByLabel: "You",
        totalRecipes: 10,
        processedRecipes: 2,
        succeededRecipes: 1,
        reviewNeededRecipes: 1,
        failedRecipes: 0,
        cancelledRecipes: 0,
        percentComplete: 20,
        rerun: true,
        createdAt: "2026-06-16T00:00:00.000Z",
        startedAt: "2026-06-16T00:00:10.000Z",
        completedAt: null,
        cancelRequestedAt: null,
        lastHeartbeatAt: "2026-06-16T00:01:00.000Z",
        lastError: null,
        currentPhase: "Parsing 2 of 10",
        canCancel: true,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/recipe-parse-jobs"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].jobId).toBe("job_123");
  });

  it("creates a job and responds with 202", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });
    mockCreateRecipeParseJob.mockResolvedValue({
      ok: true,
      jobId: "job_123",
      workerToken: "worker_token",
      totalRecipes: 3,
      status: "queued",
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    mockRunRecipeParseJobWorker.mockResolvedValue({ status: "continued" });

    const request = new Request("http://localhost/api/recipe-parse-jobs", {
      method: "POST",
      body: JSON.stringify({
        recipeIds: ["recipe_1", "recipe_2", "recipe_3"],
        rerun: true,
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      jobId: "job_123",
      totalRecipes: 3,
      status: "queued",
      createdAt: "2026-06-16T00:00:00.000Z",
    });
  });
});
