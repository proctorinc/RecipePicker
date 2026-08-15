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
    expect(items[0]).toMatchObject({ displayName: "Salt", amountText: "1⅓", unit: "tablespoon" });
    expect(items[0]!.sourceMeals).toHaveLength(2);
  });

  it("keeps the largest original volume unit and formats neat fractions", () => {
    const items = buildShoppingCartItems([
      ingredient({ amountText: "1/2", amountValue: 0.5, unit: "cup" }),
      ingredient({ ingredientId: "ingredient-2", amountText: "1/4", amountValue: 0.25, unit: "cup", sourceMeal: { ...meal, eventId: "event-2" } }),
    ]);

    expect(items[0]).toMatchObject({ displayName: "Salt", amountText: "¾", unit: "cup" });
  });

  it("does not demote a half cup to tablespoons", () => {
    const items = buildShoppingCartItems([ingredient({ amountText: "1/2", amountValue: 0.5, unit: "cup" })]);

    expect(items[0]).toMatchObject({ amountText: "½", unit: "cup" });
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
