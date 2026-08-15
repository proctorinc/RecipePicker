import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/server/db";
import {
  householdBoards,
  householdRecipeIngredients,
  householdRecipeInstructions,
  householdPins,
  householdRecipes,
  householdRecipeReviews,
  households,
} from "@/lib/server/db";

const {
  mockGetCurrentUserAccess,
  mockOpenDatabase,
  mockRequireHouseholdContext,
} = vi.hoisted(
  () => ({
    mockGetCurrentUserAccess: vi.fn(),
    mockOpenDatabase: vi.fn(),
    mockRequireHouseholdContext: vi.fn(),
  }),
);

vi.mock("@/lib/server/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/access")>(
    "@/lib/server/access",
  );

  return {
    ...actual,
    getCurrentUserAccess: mockGetCurrentUserAccess,
  };
});

vi.mock("@/lib/server/auth", () => ({
  listHouseholdMembers: vi.fn(),
  requireHouseholdContext: mockRequireHouseholdContext,
}));

vi.mock("@/lib/server/database", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/database")>(
    "@/lib/server/database",
  );

  return {
    ...actual,
    openDatabase: mockOpenDatabase,
  };
});

import { getFeedPinsPage } from "@/lib/server/queries";
import { normalizeIngredientForHousehold } from "@/lib/server/ingredient-normalization";

let tempDir: string;
let sqlitePath: string;
let originalNodeEnv: string | undefined;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = value;
}

beforeEach(async () => {
  originalNodeEnv = process.env.NODE_ENV;
  setNodeEnv("development");
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-feed-"));
  sqlitePath = path.join(tempDir, "test.sqlite");
  process.env.SQLITE_PATH = sqlitePath;
  mockGetCurrentUserAccess.mockResolvedValue({ subscriptionTier: "free" });
  mockOpenDatabase.mockImplementation(async (pathOverride?: string) =>
    createTestDatabaseHandle(pathOverride ?? sqlitePath),
  );
  mockRequireHouseholdContext.mockResolvedValue({
    householdId: "household_1",
    householdName: "Kitchen",
    role: "member",
    clerkUserId: "user_123",
  });

  const { db, sqlite } = await createTestDatabaseHandle(sqlitePath);

  try {
    await db.insert(households)
      .values({
        householdId: "household_1",
        name: "Kitchen",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      })
      .run();
    await db.insert(householdBoards)
      .values({
        boardId: "board_1",
        householdId: "household_1",
        pinterestBoardId: "pinterest_board_1",
        name: "Dinner",
        rawJson: JSON.stringify({ id: "pinterest_board_1" }),
        lastSyncedAt: "2026-06-10T00:00:00.000Z",
      })
      .run();
    await seedFeedRecipe({
      db,
      recipeId: "recipe_a",
      pinId: "pin_a",
      pinterestPinId: "pinterest_a",
      title: "Scallion Pasta",
      updatedAt: "2026-06-11T10:00:00.000Z",
    });
    await seedFeedRecipe({
      db,
      recipeId: "recipe_b",
      pinId: "pin_b",
      pinterestPinId: "pinterest_b",
      title: "Weeknight Pasta",
      updatedAt: "2026-06-11T10:00:00.000Z",
    });
    await seedFeedRecipe({
      db,
      recipeId: "recipe_c",
      pinId: "pin_c",
      pinterestPinId: "pinterest_c",
      title: "Curry Soup",
      description: "Weeknight favorite",
      updatedAt: "2026-06-10T10:00:00.000Z",
    });
  } finally {
    await sqlite.close();
  }
});

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  delete process.env.SQLITE_PATH;
  vi.restoreAllMocks();
  mockGetCurrentUserAccess.mockReset();
  mockOpenDatabase.mockReset();
  mockRequireHouseholdContext.mockReset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("getFeedPinsPage", () => {
  it("returns the newest matching cards on the first page", async () => {
    const page = await getFeedPinsPage({
      pageSize: 2,
    });

    expect(page.items.map((item) => item.recipeId)).toEqual([
      "recipe_b",
      "recipe_a",
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it("resumes from the cursor without duplicates or gaps", async () => {
    const firstPage = await getFeedPinsPage({
      pageSize: 2,
    });
    const secondPage = await getFeedPinsPage({
      cursor: firstPage.nextCursor,
      pageSize: 2,
    });

    expect(secondPage.items.map((item) => item.recipeId)).toEqual(["recipe_c"]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("returns hasMore false at the end of the feed", async () => {
    const page = await getFeedPinsPage({
      pageSize: 5,
    });

    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("applies search filtering before pagination slicing", async () => {
    const page = await getFeedPinsPage({
      searchText: "pasta",
      pageSize: 1,
    });
    const nextPage = await getFeedPinsPage({
      searchText: "pasta",
      cursor: page.nextCursor,
      pageSize: 1,
    });

    expect(page.items.map((item) => item.recipeId)).toEqual(["recipe_b"]);
    expect(nextPage.items.map((item) => item.recipeId)).toEqual(["recipe_a"]);
    expect(nextPage.hasMore).toBe(false);
  });

  it("describes the fields that matched a search", async () => {
    const page = await getFeedPinsPage({
      searchText: "pasta",
      pageSize: 2,
    });

    expect(page.items.map((item) => item.searchMatches)).toEqual([
      [{ tier: 1, field: "title", matchedText: null, relatedText: null }],
      [{ tier: 1, field: "title", matchedText: null, relatedText: null }],
    ]);
  });

  it("ranks title matches above saved ingredient aliases and explains both", async () => {
    await seedRecipeIngredient({
      recipeId: "recipe_c",
      ingredientId: "ingredient_green_onion",
      originalText: "2 green onions",
      ingredientText: "green onion",
    });

    const page = await getFeedPinsPage({ searchText: "scallion", pageSize: 3 });
    const firstPage = await getFeedPinsPage({ searchText: "scallion", pageSize: 1 });
    const secondPage = await getFeedPinsPage({
      searchText: "scallion",
      cursor: firstPage.nextCursor,
      pageSize: 1,
    });

    expect(page.items.map((item) => item.recipeId)).toEqual([
      "recipe_a",
      "recipe_c",
    ]);
    expect(page.items[0]?.searchMatches[0]).toMatchObject({
      tier: 1,
      field: "title",
    });
    expect(page.items[1]?.searchMatches[0]).toEqual({
      tier: 2,
      field: "alias",
      matchedText: "scallion",
      relatedText: "green onion",
    });
    expect(firstPage.items.map((item) => item.recipeId)).toEqual(["recipe_a"]);
    expect(secondPage.items.map((item) => item.recipeId)).toEqual(["recipe_c"]);
  });

  it("expands family searches downward while keeping child searches specific", async () => {
    await seedRecipeIngredient({
      recipeId: "recipe_c",
      ingredientId: "ingredient_chicken_breast",
      originalText: "2 chicken breasts",
      ingredientText: "chicken breast",
    });

    const familyPage = await getFeedPinsPage({ searchText: "chicken", pageSize: 3 });
    const childPage = await getFeedPinsPage({ searchText: "chicken breast", pageSize: 3 });

    expect(familyPage.items).toHaveLength(1);
    expect(familyPage.items[0]?.searchMatches[0]).toEqual({
      tier: 3,
      field: "family",
      matchedText: "Chicken",
      relatedText: "chicken breast",
    });
    expect(childPage.items[0]?.searchMatches[0]).toEqual({
      tier: 1,
      field: "ingredient",
      matchedText: "chicken breast",
      relatedText: null,
    });
  });

  it("keeps supporting-text matches below exact title matches", async () => {
    const page = await getFeedPinsPage({ searchText: "weeknight", pageSize: 3 });

    expect(page.items.map((item) => item.recipeId)).toEqual([
      "recipe_b",
      "recipe_c",
    ]);
    expect(page.items[0]?.searchMatches[0]?.field).toBe("title");
    expect(page.items[1]?.searchMatches[0]?.field).toBe("description");
  });

  it("prefers rated recipes first, then higher average ratings, then unrated recipes", async () => {
    await seedRecipeReviews([
      createReview({
        reviewId: "review_1",
        recipeId: "recipe_a",
        ratingValue: 4,
        createdAt: "2026-06-12T10:00:00.000Z",
      }),
      createReview({
        reviewId: "review_2",
        recipeId: "recipe_b",
        ratingValue: 5,
        createdAt: "2026-06-12T11:00:00.000Z",
      }),
    ]);

    const page = await getFeedPinsPage({ pageSize: 3 });

    expect(page.items.map((item) => item.recipeId)).toEqual([
      "recipe_b",
      "recipe_a",
      "recipe_c",
    ]);
  });

  it("keeps pagination stable when rating-based ordering is applied", async () => {
    await seedRecipeReviews([
      createReview({
        reviewId: "review_1",
        recipeId: "recipe_a",
        ratingValue: 4,
        createdAt: "2026-06-12T10:00:00.000Z",
      }),
      createReview({
        reviewId: "review_2",
        recipeId: "recipe_b",
        ratingValue: 5,
        createdAt: "2026-06-12T11:00:00.000Z",
      }),
    ]);

    const firstPage = await getFeedPinsPage({ pageSize: 1 });
    const secondPage = await getFeedPinsPage({
      cursor: firstPage.nextCursor,
      pageSize: 2,
    });

    expect(firstPage.items.map((item) => item.recipeId)).toEqual(["recipe_b"]);
    expect(secondPage.items.map((item) => item.recipeId)).toEqual([
      "recipe_a",
      "recipe_c",
    ]);
    expect(secondPage.hasMore).toBe(false);
  });
});

async function seedFeedRecipe({
  db,
  recipeId,
  pinId,
  pinterestPinId,
  title,
  description,
  updatedAt,
}: {
  db: ReturnType<typeof drizzle<typeof schema>>;
  recipeId: string;
  pinId: string;
  pinterestPinId: string;
  title: string;
  description?: string;
  updatedAt: string;
}) {
  await db.insert(householdPins)
    .values({
      pinId,
      householdId: "household_1",
      pinterestPinId,
      boardId: "board_1",
      pinterestBoardId: "pinterest_board_1",
      title,
      description,
      rawJson: JSON.stringify({
        images: {
          "236x": {
            url: `https://images.example.com/${pinId}-236.jpg`,
          },
          "564x": {
            url: `https://images.example.com/${pinId}-564.jpg`,
          },
        },
      }),
      updatedAt,
    })
    .run();

  await db.insert(householdRecipes)
    .values({
      recipeId,
      householdId: "household_1",
      pinId,
      title,
      description,
      createdAt: updatedAt,
      updatedAt,
    })
    .run();
}

async function seedRecipeIngredient({
  recipeId,
  ingredientId,
  originalText,
  ingredientText,
}: {
  recipeId: string;
  ingredientId: string;
  originalText: string;
  ingredientText: string;
}) {
  const { db, sqlite } = await createTestDatabaseHandle(sqlitePath);
  const timestamp = "2026-06-12T10:00:00.000Z";

  try {
    const normalized = await normalizeIngredientForHousehold(db, "household_1", {
      originalText,
      ingredientText,
    });
    await db.insert(householdRecipeInstructions)
      .values({
        recipeId,
        householdId: "household_1",
        title: null,
        rawRecipeJson: "{}",
        updatedAt: timestamp,
        createdAt: timestamp,
      })
      .run();
    await db.insert(householdRecipeIngredients)
      .values({
        ingredientId,
        householdId: "household_1",
        recipeId,
        position: 0,
        originalText,
        ingredientText,
        normalizedIngredientPhrase: normalized.normalizedIngredientPhrase,
        canonicalIngredientId: normalized.canonicalIngredientId,
        attributesJson: JSON.stringify(normalized.attributes),
        matchConfidence: normalized.matchConfidence,
        matchedBy: normalized.matchedBy,
        normalizationStatus: normalized.normalizationStatus,
      })
      .run();
  } finally {
    await sqlite.close();
  }
}

async function seedRecipeReviews(
  reviews: Array<{
    reviewId: string;
    householdId: string;
    recipeId: string;
    eventId: null;
    reviewedByClerkUserId: string;
    ratingValue: number;
    eatenOn: null;
    note: null;
    createdAt: string;
    updatedAt: string;
  }>,
) {
  const { db, sqlite } = await createTestDatabaseHandle(sqlitePath);

  try {
    await db.insert(householdRecipeReviews).values(reviews).run();
  } finally {
    await sqlite.close();
  }
}

function createReview({
  reviewId,
  recipeId,
  ratingValue,
  createdAt,
}: {
  reviewId: string;
  recipeId: string;
  ratingValue: number;
  createdAt: string;
}) {
  return {
    reviewId,
    householdId: "household_1",
    recipeId,
    eventId: null,
    reviewedByClerkUserId: "user_123",
    ratingValue,
    eatenOn: null,
    note: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function createTestDatabaseHandle(targetPath: string) {
  const sqlite = new BetterSqlite3(targetPath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });

  return {
    db,
    driver: "sqlite" as const,
    sqlite: {
      async close() {
        sqlite.close();
      },
      async transaction<T>(work: (tx: never) => T) {
        return db.transaction((tx) => work(tx as never));
      },
    },
    targetLabel: targetPath,
  };
}
