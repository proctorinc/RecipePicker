import { describe, expect, it } from "vitest";

import { normalizeRecipeSourceUrl } from "@/lib/recipe-source-url";

describe("normalizeRecipeSourceUrl", () => {
  it("normalizes web URLs and removes only known tracking parameters", () => {
    expect(normalizeRecipeSourceUrl("HTTPS://Example.COM:443/recipe/?b=2&utm_source=pinterest&a=1#saved"))
      .toBe("https://example.com/recipe?a=1&b=2");
  });

  it("keeps meaningful query parameters distinct", () => {
    expect(normalizeRecipeSourceUrl("https://example.com/recipe?servings=2"))
      .not.toBe(normalizeRecipeSourceUrl("https://example.com/recipe?servings=4"));
  });

  it("rejects missing and non-web URLs", () => {
    expect(normalizeRecipeSourceUrl(null)).toBeNull();
    expect(normalizeRecipeSourceUrl("pinterest://pin/123")).toBeNull();
  });
});
