import { describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUserAccess,
  mockRequireHouseholdRole,
  mockGetAiModelCatalog,
  mockGetStoredHouseholdAiKey,
  mockTestHouseholdAiConnection,
  mockUpsertHouseholdAiConnection,
} = vi.hoisted(() => ({
  mockGetCurrentUserAccess: vi.fn(),
  mockRequireHouseholdRole: vi.fn(),
  mockGetAiModelCatalog: vi.fn(),
  mockGetStoredHouseholdAiKey: vi.fn(),
  mockTestHouseholdAiConnection: vi.fn(),
  mockUpsertHouseholdAiConnection: vi.fn(),
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
  requireHouseholdContext: vi.fn(),
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

vi.mock("@/lib/server/database", () => ({
  openDatabase: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveAiConnectionAction } from "@/lib/actions/operations";

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
