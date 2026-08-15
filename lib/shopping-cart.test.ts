import { describe, expect, it } from "vitest";
import { buildShoppingCartItems } from "@/lib/shopping-cart";

const meal = { eventId: "event-1", date: "2026-08-14", recipeId: "recipe-1", recipeTitle: "Dinner" };
const ingredient = (overrides: Partial<Parameters<typeof buildShoppingCartItems>[0][number]> = {}) => ({
  ingredientId: "ingredient-1", canonicalIngredientId: "salt", canonicalName: "Salt", originalText: "salt", ingredientText: "salt",
  amountText: "1", amountValue: 1, amountMaxValue: null, unit: "teaspoon", normalizationStatus: "confirmed", sourceMeal: meal, ...overrides,
});

describe("buildShoppingCartItems", () => {
  it("combines duplicate canonical ingredients and compatible volume units", () => {
    const items = buildShoppingCartItems([ingredient(), ingredient({ ingredientId: "ingredient-2", amountValue: 1, unit: "tablespoon", sourceMeal: { ...meal, eventId: "event-2" } })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ displayName: "Salt", amountText: "1.333333", unit: "tablespoon" });
    expect(items[0]!.sourceMeals).toHaveLength(2);
  });

  it("keeps incompatible units and unreviewed ingredients as separate lines", () => {
    const items = buildShoppingCartItems([ingredient({ unit: "pound" }), ingredient({ ingredientId: "ingredient-2", unit: "ounce" }), ingredient({ ingredientId: "ingredient-3", canonicalIngredientId: null, canonicalName: null, originalText: "a pinch of mystery spice", ingredientText: null, amountText: null, amountValue: null, unit: null })]);
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.displayName)).toContain("a pinch of mystery spice");
  });

  it("omits ingredients explicitly marked as not ingredients", () => {
    expect(buildShoppingCartItems([ingredient({ normalizationStatus: "not_ingredient" })])).toEqual([]);
  });
});
