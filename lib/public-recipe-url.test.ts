import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicRecipeUrl } from "@/lib/public-recipe-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicRecipeUrl", () => {
  it("uses the configured deployed origin", () => {
    vi.stubEnv("APP_URL", "https://recipes.example.com/app/");
    expect(getPublicRecipeUrl("recipe_abc")).toBe("https://recipes.example.com/r/recipe_abc");
  });

  it("uses localhost during development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getPublicRecipeUrl("recipe_abc")).toBe("http://localhost:3000/r/recipe_abc");
  });
});
