import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/lib/server/errors";

const {
  mockRequireHouseholdContext,
  mockRequirePremiumSubscription,
  mockRunRecipePicker,
} = vi.hoisted(() => ({
  mockRequireHouseholdContext: vi.fn(),
  mockRequirePremiumSubscription: vi.fn(),
  mockRunRecipePicker: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireHouseholdContext: mockRequireHouseholdContext,
}));

vi.mock("@/lib/server/access", () => ({
  requirePremiumSubscription: mockRequirePremiumSubscription,
}));

vi.mock("@/lib/server/recipe-picker", () => ({
  runRecipePicker: mockRunRecipePicker,
}));

import { POST } from "@/app/api/recipe-picker/route";

describe("POST /api/recipe-picker", () => {
  it("returns 403 for authenticated free-tier users", async () => {
    mockRequirePremiumSubscription.mockRejectedValue(
      new AuthorizationError("Premium is required for this action."),
    );
    mockRequireHouseholdContext.mockResolvedValue({
      householdId: "household_1",
      householdName: "Kitchen",
      role: "member",
      clerkUserId: "user_123",
    });

    const request = new Request("http://localhost/api/recipe-picker", {
      method: "POST",
      body: JSON.stringify({
        mode: "v1",
        prompt: "Show pasta",
        currentSetRecipeIds: [],
        pinnedRecipeIds: [],
        activeRecipeId: null,
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      message: "You do not have permission for this action.",
    });
    expect(mockRunRecipePicker).not.toHaveBeenCalled();
  });
});
