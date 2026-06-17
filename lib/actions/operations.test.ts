import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUserAccess,
  mockRequireHouseholdContext,
  mockRequireHouseholdRole,
  mockGetAiModelCatalog,
  mockGetStoredHouseholdAiKey,
  mockTestHouseholdAiConnection,
  mockUpsertHouseholdAiConnection,
  mockCreateRecipeParseJob,
  mockCancelRecipeParseJob,
  mockMarkRecipeParseJobQueueingFailure,
  mockSendRecipeParseJobRequestedEvent,
} = vi.hoisted(() => ({
  mockGetCurrentUserAccess: vi.fn(),
  mockRequireHouseholdContext: vi.fn(),
  mockRequireHouseholdRole: vi.fn(),
  mockGetAiModelCatalog: vi.fn(),
  mockGetStoredHouseholdAiKey: vi.fn(),
  mockTestHouseholdAiConnection: vi.fn(),
  mockUpsertHouseholdAiConnection: vi.fn(),
  mockCreateRecipeParseJob: vi.fn(),
  mockCancelRecipeParseJob: vi.fn(),
  mockMarkRecipeParseJobQueueingFailure: vi.fn(),
  mockSendRecipeParseJobRequestedEvent: vi.fn(),
}));

vi.mock("@/lib/server/access", () => ({
  ADMIN_ROLE_OVERRIDE_COOKIE: "food-picker-admin-role-override",
  getCurrentUserAccess: mockGetCurrentUserAccess,
  normalizeRoleOverride: (value: unknown) =>
    value === "admin" || value === "owner" || value === "user" ? value : null,
  requireAdminAccess: vi.fn(),
  normalizeSubscriptionTier: (value: unknown) =>
    value === "premium" ? "premium" : "free",
  upsertUserSubscriptionTier: vi.fn(),
  canConfigureAi: ({ subscriptionTier, householdRole }: { subscriptionTier: string; householdRole: string }) =>
    subscriptionTier === "premium" && householdRole === "owner",
}));

vi.mock("@/lib/server/auth", () => ({
  addMemberToHousehold: vi.fn(),
  requireHouseholdContext: mockRequireHouseholdContext,
  requireHouseholdRole: mockRequireHouseholdRole,
}));

vi.mock("@/lib/server/ai-provider", () => ({
  disconnectHouseholdAiConnection: vi.fn(),
  getAiModelCatalog: mockGetAiModelCatalog,
  getStoredHouseholdAiKey: mockGetStoredHouseholdAiKey,
  testHouseholdAiConnection: mockTestHouseholdAiConnection,
  upsertHouseholdAiConnection: mockUpsertHouseholdAiConnection,
}));

vi.mock("@/lib/server/pinterest", () => ({
  disconnectPinterestConnection: vi.fn(),
}));

vi.mock("@/lib/server/queries", () => ({
  getRecipeHouseholdPinId: vi.fn(),
}));

vi.mock("@/lib/server/extract", () => ({
  extractRecipes: vi.fn(),
}));

vi.mock("@/lib/server/recipe-parse-jobs", () => ({
  createRecipeParseJob: mockCreateRecipeParseJob,
  cancelRecipeParseJob: mockCancelRecipeParseJob,
  markRecipeParseJobQueueingFailure: mockMarkRecipeParseJobQueueingFailure,
  resumeRecipeParseJob: vi.fn(),
}));

vi.mock("@/src/inngest/events", () => ({
  sendRecipeParseJobRequestedEvent: mockSendRecipeParseJobRequestedEvent,
}));

vi.mock("@/lib/server/database", () => ({
  openDatabase: vi.fn(),
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createRecipeEventAction,
  createRecipeEventsAction,
  rerunRecipesAction,
  resumeRecipeParseJobAction,
  saveAiConnectionAction,
} from "@/lib/actions/operations";
import { openDatabase } from "@/lib/server/database";
import { resumeRecipeParseJob } from "@/lib/server/recipe-parse-jobs";

beforeEach(() => {
  vi.clearAllMocks();
  mockSendRecipeParseJobRequestedEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveAiConnectionAction", () => {
  it("rejects free-tier users before attempting AI configuration", async () => {
    mockGetCurrentUserAccess.mockResolvedValue({
      clerkUserId: "user_123",
      appRole: "user",
      subscriptionTier: "free",
      isAdmin: false,
      isFree: true,
      isPremium: false,
      isUser: true,
    });
    mockRequireHouseholdRole.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    const formData = new FormData();
    formData.set("provider", "openai");
    formData.set("model", "gpt-4o-mini");
    formData.set("apiKey", "sk-test");

    const result = await saveAiConnectionAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Premium is required to configure the shared AI connection.",
    });
    expect(mockGetAiModelCatalog).not.toHaveBeenCalled();
    expect(mockGetStoredHouseholdAiKey).not.toHaveBeenCalled();
    expect(mockTestHouseholdAiConnection).not.toHaveBeenCalled();
    expect(mockUpsertHouseholdAiConnection).not.toHaveBeenCalled();
  });
});

describe("rerunRecipesAction", () => {
  it("creates a background parse job and returns immediately", async () => {
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
      totalRecipes: 2,
      status: "queued",
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const formData = new FormData();
    formData.set("recipeIds", JSON.stringify(["recipe_1", "recipe_2"]));

    const result = await rerunRecipesAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Started a background parse job for 2 recipes.",
    });
    expect(mockCreateRecipeParseJob).toHaveBeenCalledWith({
      householdId: "household_123",
      requestedByClerkUserId: "user_123",
      recipeIds: ["recipe_1", "recipe_2"],
      rerun: true,
      mode: "bulk_rerun_selection",
    });
    expect(mockSendRecipeParseJobRequestedEvent).toHaveBeenCalledWith({
      jobId: "job_123",
      householdId: "household_123",
      trigger: "create",
    });
  });

  it("surfaces active-job conflicts without starting work", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });
    mockCreateRecipeParseJob.mockResolvedValue({
      ok: false,
      message: "A bulk parse job is already running for this household.",
      activeJobId: "job_existing",
    });

    const formData = new FormData();
    formData.set("recipeIds", JSON.stringify(["recipe_1"]));

    const result = await rerunRecipesAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "A bulk parse job is already running for this household.",
    });
    expect(mockSendRecipeParseJobRequestedEvent).not.toHaveBeenCalled();
  });
});

describe("resumeRecipeParseJobAction", () => {
  it("sends a new Inngest event when a job is resumed", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });
    vi.mocked(resumeRecipeParseJob).mockResolvedValue({
      ok: true,
      message: "Resume requested. The next parse chunk is starting.",
      workerToken: "worker_token",
    });

    const formData = new FormData();
    formData.set("jobId", "job_123");

    const result = await resumeRecipeParseJobAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Resume requested. The next parse chunk is starting.",
    });
    expect(mockSendRecipeParseJobRequestedEvent).toHaveBeenCalledWith({
      jobId: "job_123",
      householdId: "household_123",
      trigger: "resume",
    });
  });
});

describe("createRecipeEventsAction", () => {
  it("creates one event per unique valid date and returns the earliest reviewable event", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    const recipeLookup = vi.fn().mockResolvedValue({
      recipeId: "recipe_1",
      pinId: "pin_1",
    });
    const insertValues: Array<Record<string, unknown>> = [];
    const insertRun = vi.fn()
      .mockResolvedValueOnce([{ eventId: "event_today" }])
      .mockResolvedValueOnce([{ eventId: "event_future" }]);
    const close = vi.fn().mockResolvedValue(undefined);

    vi.mocked(openDatabase).mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: recipeLookup,
          },
          householdRecipeEvents: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        insert: vi.fn().mockImplementation(() => ({
          values: (value: Record<string, unknown>) => {
            insertValues.push(value);
            return {
              returning: insertRun,
            };
          },
        })),
      },
      sqlite: {
        close,
      },
    } as unknown as Awaited<ReturnType<typeof openDatabase>>);

    const formData = new FormData();
    formData.set("recipeId", "recipe_1");
    formData.set("dates", JSON.stringify(["2099-01-03", "2026-06-17", "2099-01-03"]));

    const result = await createRecipeEventsAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Recipe added to 2 days.",
      data: {
        firstEventId: "event_today",
        firstEventDate: "2026-06-17",
        dayCount: 2,
      },
    });
    expect(recipeLookup).toHaveBeenCalled();
    expect(insertValues.map((value) => value.date)).toEqual([
      "2026-06-17",
      "2099-01-03",
    ]);
    expect(close).toHaveBeenCalled();
  });

  it("skips auto-review metadata when every selected day is in the future", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    vi.mocked(openDatabase).mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: vi.fn().mockResolvedValue({
              recipeId: "recipe_1",
              pinId: "pin_1",
            }),
          },
          householdRecipeEvents: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        insert: vi.fn().mockImplementation(() => ({
          values: () => ({
            returning: vi.fn().mockResolvedValue([{ eventId: "event_future" }]),
          }),
        })),
      },
      sqlite: {
        close: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Awaited<ReturnType<typeof openDatabase>>);

    const formData = new FormData();
    formData.set("recipeId", "recipe_1");
    formData.set("dates", JSON.stringify(["2099-01-03"]));

    const result = await createRecipeEventsAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Planned recipe added to the calendar.",
      data: {
        firstEventId: null,
        firstEventDate: null,
        dayCount: 1,
      },
    });
  });

  it("rejects invalid or empty date payloads", async () => {
    const invalidFormData = new FormData();
    invalidFormData.set("recipeId", "recipe_1");
    invalidFormData.set("dates", "not-json");

    await expect(
      createRecipeEventsAction({ status: "idle", message: "" }, invalidFormData),
    ).resolves.toEqual({
      status: "error",
      message: "Choose valid dates for this meal.",
    });

    const emptyFormData = new FormData();
    emptyFormData.set("recipeId", "recipe_1");
    emptyFormData.set("dates", JSON.stringify(["bad-date"]));

    await expect(
      createRecipeEventsAction({ status: "idle", message: "" }, emptyFormData),
    ).resolves.toEqual({
      status: "error",
      message: "Choose at least one day.",
    });
  });

  it("skips duplicate existing days and only creates missing ones", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    const insertValues: Array<Record<string, unknown>> = [];

    vi.mocked(openDatabase).mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: vi.fn().mockResolvedValue({
              recipeId: "recipe_1",
              pinId: "pin_1",
            }),
          },
          householdRecipeEvents: {
            findMany: vi.fn().mockResolvedValue([{ date: "2026-06-17" }]),
          },
        },
        insert: vi.fn().mockImplementation(() => ({
          values: (value: Record<string, unknown>) => {
            insertValues.push(value);
            return {
              returning: vi.fn().mockResolvedValue([{ eventId: "event_new" }]),
            };
          },
        })),
      },
      sqlite: {
        close: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Awaited<ReturnType<typeof openDatabase>>);

    const formData = new FormData();
    formData.set("recipeId", "recipe_1");
    formData.set("dates", JSON.stringify(["2026-06-16", "2026-06-17"]));

    const result = await createRecipeEventsAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Meal added to history.",
      data: {
        firstEventId: "event_new",
        firstEventDate: "2026-06-16",
        dayCount: 1,
      },
    });
    expect(insertValues.map((value) => value.date)).toEqual(["2026-06-16"]);
  });

  it("rejects a batch add when every selected day already has that recipe", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    vi.mocked(openDatabase).mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: vi.fn().mockResolvedValue({
              recipeId: "recipe_1",
              pinId: "pin_1",
            }),
          },
          householdRecipeEvents: {
            findMany: vi.fn().mockResolvedValue([
              { date: "2026-06-17" },
              { date: "2026-06-18" },
            ]),
          },
        },
      },
      sqlite: {
        close: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Awaited<ReturnType<typeof openDatabase>>);

    const formData = new FormData();
    formData.set("recipeId", "recipe_1");
    formData.set("dates", JSON.stringify(["2026-06-17", "2026-06-18"]));

    await expect(
      createRecipeEventsAction({ status: "idle", message: "" }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "This recipe is already on all of those days.",
    });
  });
});

describe("createRecipeEventAction", () => {
  it("rejects a single-day duplicate", async () => {
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_123",
      householdName: "Test kitchen",
      role: "owner",
      clerkUserId: "user_123",
    });

    vi.mocked(openDatabase).mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: vi.fn().mockResolvedValue({
              recipeId: "recipe_1",
              pinId: "pin_1",
            }),
          },
          householdRecipeEvents: {
            findFirst: vi.fn().mockResolvedValue({
              eventId: "event_existing",
            }),
          },
        },
      },
      sqlite: {
        close: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Awaited<ReturnType<typeof openDatabase>>);

    const formData = new FormData();
    formData.set("recipeId", "recipe_1");
    formData.set("date", "2026-06-17");

    await expect(
      createRecipeEventAction({ status: "idle", message: "" }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "This recipe is already on that day.",
    });
  });
});
