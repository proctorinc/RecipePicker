import { describe, expect, it } from "vitest";

import { formatScaledIngredient, type ScalableIngredient } from "@/lib/ingredient-scaling";

const ingredient = (overrides: Partial<ScalableIngredient> = {}): ScalableIngredient => ({
  originalText: "1 teaspoon vanilla extract",
  amount: "1",
  amountValue: 1,
  amountMaxValue: null,
  unit: "teaspoon",
  parsedText: "vanilla extract",
  notes: null,
  ...overrides,
});

describe("formatScaledIngredient", () => {
  it("uses abbreviated units at the base scale", () => {
    expect(formatScaledIngredient(ingredient({ originalText: "1 teaspoon vanilla" }), 1)).toBe("1 tsp vanilla extract");
  });

  it("scales amounts and promotes teaspoons to tablespoons", () => {
    expect(formatScaledIngredient(ingredient(), 3)).toBe("1 tbsp vanilla extract");
    expect(formatScaledIngredient(ingredient({ amountValue: 2, originalText: "2 tsp vanilla extract" }), 2)).toBe("1⅓ tbsp vanilla extract");
  });

  it("promotes tablespoons to cups and formats common fractions", () => {
    expect(formatScaledIngredient(ingredient({ amountValue: 8, unit: "tablespoon", originalText: "8 tablespoons oil", parsedText: "oil" }), 2)).toBe("1 cup oil");
    expect(formatScaledIngredient(ingredient({ amountValue: 0.5, originalText: "1/2 teaspoon salt", parsedText: "salt" }), 3)).toBe("1½ tsp salt");
    expect(formatScaledIngredient(ingredient({ amountValue: 0.25, unit: "cup", originalText: "1/4 cup milk", parsedText: "milk" }), 2)).toBe("½ cup milk");
  });

  it("scales both values in a range without changing to an inconsistent unit", () => {
    expect(formatScaledIngredient(ingredient({ originalText: "1-2 teaspoons pepper", amount: "1-2", amountMaxValue: 2, parsedText: "pepper" }), 2)).toBe("2–4 tsp pepper");
    expect(formatScaledIngredient(ingredient({ originalText: "1-2 teaspoons pepper", amount: "1-2", amountMaxValue: 2, parsedText: "pepper" }), 3)).toBe("1–2 tbsp pepper");
  });

  it("keeps precise decimals, non-volume units, notes, and unparseable lines safe", () => {
    expect(formatScaledIngredient(ingredient({ originalText: "0.2 pound mushrooms", amountValue: 0.2, unit: "pound", parsedText: "mushrooms" }), 3)).toBe("0.6 lb mushrooms");
    expect(formatScaledIngredient(ingredient({ originalText: "1 clove garlic, minced", unit: "clove", parsedText: "garlic", notes: "minced" }), 2)).toBe("2 cloves garlic, minced");
    expect(formatScaledIngredient(ingredient({ originalText: "Salt, to taste", amountValue: null, amount: null, unit: null, parsedText: "Salt", notes: "to taste" }), 3)).toBe("Salt, to taste");
  });
});
