import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGenerateIngredientParsesWithHouseholdAi } = vi.hoisted(() => ({
  mockGenerateIngredientParsesWithHouseholdAi: vi.fn(),
}));

vi.mock("@/lib/server/ai-provider", () => ({
  generateIngredientParsesWithHouseholdAi: mockGenerateIngredientParsesWithHouseholdAi,
  generateIngredientSuggestionsWithHouseholdAi: vi.fn(),
}));

import { getIngredientAiParses } from "@/lib/server/ingredient-ai";

afterEach(() => {
  mockGenerateIngredientParsesWithHouseholdAi.mockReset();
});

describe("getIngredientAiParses", () => {
  it("keeps only one valid result for requested ingredients", async () => {
    mockGenerateIngredientParsesWithHouseholdAi.mockResolvedValue({
      results: [
        {
          ingredientId: "ingredient-1",
          outcome: "parsed",
          ingredientText: " yellow onion ",
          amountText: " 2 ",
          unit: null,
          notes: " chopped ",
        },
        {
          ingredientId: "ingredient-1",
          outcome: "unresolved",
          ingredientText: null,
          amountText: null,
          unit: null,
          notes: null,
          reason: "duplicate",
        },
        {
          ingredientId: "unknown",
          outcome: "not_ingredient",
          ingredientText: null,
          amountText: null,
          unit: null,
          notes: null,
          reason: "A section heading.",
        },
      ],
    });

    await expect(getIngredientAiParses({
      householdId: "household-1",
      ingredients: [{ ingredientId: "ingredient-1", originalText: "2 yellow onions, chopped" }],
    })).resolves.toEqual([{
      ingredientId: "ingredient-1",
      outcome: "parsed",
      ingredientText: "yellow onion",
      amountText: "2",
      unit: null,
      notes: "chopped",
      reason: null,
    }]);
  });

  it("rejects malformed model output and preserves the caller's rows", async () => {
    mockGenerateIngredientParsesWithHouseholdAi.mockResolvedValue({
      results: [{ ingredientId: "ingredient-1", outcome: "unresolved", reason: "" }],
    });

    await expect(getIngredientAiParses({
      householdId: "household-1",
      ingredients: [{ ingredientId: "ingredient-1", originalText: "For garnish" }],
    })).resolves.toBeNull();
  });
});
