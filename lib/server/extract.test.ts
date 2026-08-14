import { afterEach, describe, expect, it, vi } from "vitest";

const { mockOpenDatabase } = vi.hoisted(() => ({
  mockOpenDatabase: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
  openDatabase: mockOpenDatabase,
}));

import { extractSingleRecipe } from "@/lib/server/extract";

describe("extractSingleRecipe database ownership", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
