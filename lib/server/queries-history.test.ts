import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClerkClient,
  mockListHouseholdMembers,
  mockOpenDatabase,
  mockRequireHouseholdContext,
} = vi.hoisted(() => ({
  mockClerkClient: vi.fn(),
  mockListHouseholdMembers: vi.fn(),
  mockOpenDatabase: vi.fn(),
  mockRequireHouseholdContext: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mockClerkClient,
}));

vi.mock("@/lib/server/auth", () => ({
  listHouseholdMembers: mockListHouseholdMembers,
  requireHouseholdContext: mockRequireHouseholdContext,
}));

vi.mock("@/lib/server/database", () => ({
  openDatabase: mockOpenDatabase,
}));

import { getRecipeHistoryPage } from "@/lib/server/queries";

beforeEach(() => {
  vi.clearAllMocks();
  mockClerkClient.mockResolvedValue({
    users: {
      getUser: vi.fn(),
    },
  });
  mockListHouseholdMembers.mockResolvedValue([]);
  mockRequireHouseholdContext.mockResolvedValue({
    householdId: "household_1",
    householdName: "Kitchen",
    role: "member",
    clerkUserId: "user_123",
  });
});

describe("getRecipeHistoryPage", () => {
  it("includes the selected recipe when the recipe query matches a household recipe", async () => {
    mockOpenDatabase.mockResolvedValue(createDatabaseHandle());

    const page = await getRecipeHistoryPage("2026-06", "recipe_b");

    expect(page.selectedRecipe).toEqual({
      recipeId: "recipe_b",
      recipeTitle: "Basil Soup",
      recipeImageUrl: "https://images.example.com/pin_b-564.jpg",
    });
    expect(page.recipeOptions.map((recipe) => recipe.recipeId)).toEqual([
      "recipe_a",
      "recipe_b",
    ]);
  });

  it("falls back to normal history mode when the recipe query is invalid", async () => {
    mockOpenDatabase.mockResolvedValue(createDatabaseHandle());

    const page = await getRecipeHistoryPage("2026-06", "recipe_missing");

    expect(page.selectedRecipe).toBeNull();
    expect(page.recipeOptions).toHaveLength(2);
  });
});

function createDatabaseHandle() {
  return {
    db: {
      query: {
        householdRecipeEvents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        householdRecipes: {
          findMany: vi.fn().mockResolvedValue([
            {
              recipeId: "recipe_a",
              title: "Aardvark Pasta",
              imageUrl: "https://images.example.com/pin_a-564.jpg",
              pin: {
                title: "Aardvark Pasta",
                rawJson: JSON.stringify({
                  images: {
                    "564x": {
                      url: "https://images.example.com/pin_a-564.jpg",
                    },
                  },
                }),
                mediaJson: null,
              },
              recipeInstructions: null,
              updatedAt: "2026-06-11T10:00:00.000Z",
            },
            {
              recipeId: "recipe_b",
              title: "Basil Soup",
              imageUrl: "https://images.example.com/pin_b-564.jpg",
              pin: {
                title: "Basil Soup",
                rawJson: JSON.stringify({
                  images: {
                    "564x": {
                      url: "https://images.example.com/pin_b-564.jpg",
                    },
                  },
                }),
                mediaJson: null,
              },
              recipeInstructions: null,
              updatedAt: "2026-06-12T10:00:00.000Z",
            },
          ]),
        },
      },
    },
    sqlite: {
      close: vi.fn().mockResolvedValue(undefined),
    },
  };
}
