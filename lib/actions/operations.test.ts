import { beforeEach, describe, expect, it, vi } from "vitest";

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
  mockRunRecipeParseJobWorker,
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
  mockRunRecipeParseJobWorker: vi.fn(),
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
  runRecipeParseJobWorker: mockRunRecipeParseJobWorker,
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

import { rerunRecipesAction, saveAiConnectionAction } from "@/lib/actions/operations";

beforeEach(() => {
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
    mockRunRecipeParseJobWorker.mockResolvedValue({ status: "continued" });

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
    expect(mockRunRecipeParseJobWorker).not.toHaveBeenCalled();
  });
});
