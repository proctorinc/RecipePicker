import { afterEach, describe, expect, it, vi } from "vitest";

const { mockOpenDatabase, mockExtractRecipeWithFallbacks } = vi.hoisted(() => ({
  mockOpenDatabase: vi.fn(),
  mockExtractRecipeWithFallbacks: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
  openDatabase: mockOpenDatabase,
}));

vi.mock("@/lib/server/recipe-parser", () => ({ extractRecipeWithFallbacks: mockExtractRecipeWithFallbacks }));

import { extractSingleRecipe } from "@/lib/server/extract";

describe("extractSingleRecipe database ownership", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("uses a caller-owned database without opening or closing another client", async () => {
    const database = {
      query: {
        householdRecipes: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    const result = await extractSingleRecipe({
      householdId: "household_123",
      recipeId: "recipe_123",
      database: database as never,
      databaseOwner: "parse_job_chunk",
    });

    expect(result.outcome).toBe("failed");
    expect(mockOpenDatabase).not.toHaveBeenCalled();
  });

  it("opens and closes its own database for a manual parse", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mockOpenDatabase.mockResolvedValue({
      db: {
        query: {
          householdRecipes: {
            findFirst: vi.fn().mockResolvedValue(undefined),
          },
        },
      },
      sqlite: { close },
    });

    await extractSingleRecipe({
      householdId: "household_123",
      recipeId: "recipe_123",
    });

    expect(mockOpenDatabase).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});


it("awaits extraction so deadline failures reach the timeout handler before closing the database", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const close = vi.fn();
  const db = { query: { householdRecipes: { findFirst: vi.fn().mockResolvedValue({
    recipeId: "recipe", pinId: "pin", recipeInstructions: null,
    pin: { link: "https://example.com/recipe" },
  }) } } };
  mockOpenDatabase.mockResolvedValue({ db, sqlite: { close } });
  mockExtractRecipeWithFallbacks.mockImplementation(async () => {
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    deadline.abort();
    throw new DOMException("Timed out", "AbortError");
  });
  await expect(extractSingleRecipe({ householdId: "household", recipeId: "recipe" })).resolves.toMatchObject({
    outcome: "failed", failureReason: "extract: Recipe extraction timed out after 75 seconds.",
  });
  expect(close).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});
