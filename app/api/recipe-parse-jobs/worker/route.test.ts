import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveRecipeParseJobWorkerOrigin,
  mockRunRecipeParseJobWorker,
  mockScheduleRecipeParseJobWorker,
} = vi.hoisted(() => ({
  mockResolveRecipeParseJobWorkerOrigin: vi.fn(),
  mockRunRecipeParseJobWorker: vi.fn(),
  mockScheduleRecipeParseJobWorker: vi.fn(),
}));

vi.mock("@/lib/server/recipe-parse-jobs", () => ({
  resolveRecipeParseJobWorkerOrigin: mockResolveRecipeParseJobWorkerOrigin,
  runRecipeParseJobWorker: mockRunRecipeParseJobWorker,
  scheduleRecipeParseJobWorker: mockScheduleRecipeParseJobWorker,
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

import { POST } from "@/app/api/recipe-parse-jobs/worker/route";

describe("/api/recipe-parse-jobs/worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRecipeParseJobWorkerOrigin.mockReturnValue("http://localhost");
    mockScheduleRecipeParseJobWorker.mockResolvedValue(undefined);
  });

  it("schedules another worker invocation when a chunk continues", async () => {
    mockRunRecipeParseJobWorker.mockResolvedValue({
      status: "continued",
      remaining: 25,
    });

    const request = new Request("http://localhost/api/recipe-parse-jobs/worker", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-recipe-parse-job-token": "worker_token",
      },
      body: JSON.stringify({
        jobId: "job_123",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "continued",
      remaining: 25,
    });
    expect(mockRunRecipeParseJobWorker).toHaveBeenCalledWith({
      jobId: "job_123",
      workerToken: "worker_token",
    });
    expect(mockResolveRecipeParseJobWorkerOrigin).toHaveBeenCalledWith({
      requestUrl: "http://localhost/api/recipe-parse-jobs/worker",
    });
    expect(mockScheduleRecipeParseJobWorker).toHaveBeenCalledWith({
      jobId: "job_123",
      workerToken: "worker_token",
      origin: "http://localhost",
    });
  });
});
