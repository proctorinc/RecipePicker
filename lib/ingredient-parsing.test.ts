import { describe, expect, it } from "vitest";

import { parseIngredientLine, parseIngredientLines } from "@/lib/ingredient-parsing";

describe("ingredient parsing", () => {
  it("parses quantities, units, and notes", () => {
    expect(parseIngredientLine("1 1/2 cups flour, sifted")).toMatchObject({
      amountText: "1 1/2", amountValue: 1.5, amountMaxValue: null,
      unit: "cup", ingredientText: "flour", notes: "sifted",
    });
  });

  it("parses amount ranges and leaves plain labels intact", () => {
    expect(parseIngredientLine("1-2 tsp salt")).toMatchObject({ amountValue: 1, amountMaxValue: 2, unit: "teaspoon", ingredientText: "salt" });
    expect(parseIngredientLine("Fresh basil")).toMatchObject({ amountText: null, unit: null, ingredientText: "Fresh basil" });
  });

  it("splits a multiline paste into nonblank ingredients", () => {
    expect(parseIngredientLines("2 cups flour\n\n1 tsp salt\n")).toHaveLength(2);
  });

  it("parses parenthesized and slash-separated equivalent measurements", () => {
    expect(parseIngredientLine("1 cup (120 g) flour").measurements).toMatchObject([
      { amountText: "1", amountValue: 1, unit: "cup" },
      { amountText: "120", amountValue: 120, unit: "gram" },
    ]);
    expect(parseIngredientLine("120 g / 1 cup flour")).toMatchObject({
      ingredientText: "flour",
      measurements: [{ unit: "gram" }, { unit: "cup" }],
    });
  });
});
