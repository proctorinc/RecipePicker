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
  householdPins,
  householdRecipes,
  households,
  recipeFolderMemberships,
  recipeFolders,
} from "@/lib/server/db";

const {
  mockOpenDatabase,
  mockRequireHouseholdContext,
} = vi.hoisted(() => ({
  mockOpenDatabase: vi.fn(),
  mockRequireHouseholdContext: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  listHouseholdMembers: vi.fn().mockResolvedValue([]),
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

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: vi.fn(),
    },
  }),
}));

import {
  getPinterestRecipeFolderTree,
  getPublicRecipeDetail,
  getRecipeDetail,
} from "@/lib/server/queries";

let tempDir: string;
let sqlitePath: string;
let originalNodeEnv: string | undefined;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    vi.unstubAllEnvs();
    return;
  }

  vi.stubEnv("NODE_ENV", value);
}

beforeEach(async () => {
  originalNodeEnv = process.env.NODE_ENV;
  setNodeEnv("development");
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-folders-"));
  sqlitePath = path.join(tempDir, "test.sqlite");
  const seededSqlitePath = path.join(process.cwd(), "data", "db.sqlite");
  fs.copyFileSync(seededSqlitePath, sqlitePath);
  process.env.SQLITE_PATH = sqlitePath;
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
    const now = "2026-06-17T00:00:00.000Z";
    await db.insert(households)
      .values({
        householdId: "household_1",
        name: "Kitchen",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db.insert(householdBoards)
      .values({
        boardId: "board_1",
        householdId: "household_1",
        pinterestBoardId: "pinterest_board_1",
        name: "Dinner",
        rawJson: JSON.stringify({ id: "pinterest_board_1", name: "Dinner" }),
        lastSyncedAt: now,
      })
      .run();
    await db.insert(householdPins)
      .values([
        {
          pinId: "pin_board",
          householdId: "household_1",
          pinterestPinId: "pinterest_pin_board",
          boardId: "board_1",
          pinterestBoardId: "pinterest_board_1",
          title: "Board meal",
          rawJson: "{}",
          updatedAt: now,
        },
        {
          pinId: "pin_section",
          householdId: "household_1",
          pinterestPinId: "pinterest_pin_section",
          boardId: "board_1",
          pinterestBoardId: "pinterest_board_1",
          boardSectionId: "section_1",
          title: "Section meal",
          rawJson: "{}",
          updatedAt: now,
        },
      ])
      .run();
    await db.insert(householdRecipes)
      .values([
        {
          recipeId: "recipe_board",
          householdId: "household_1",
          pinId: "pin_board",
          title: "Board meal",
          createdAt: now,
          updatedAt: now,
        },
        {
          recipeId: "recipe_section",
          householdId: "household_1",
          pinId: "pin_section",
          title: "Section meal",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    await db.insert(recipeFolders)
      .values([
        {
          folderId: "folder_board",
          householdId: "household_1",
          parentFolderId: null,
          source: "pinterest",
          sourceType: "board",
          pinterestBoardId: "pinterest_board_1",
          pinterestSectionId: null,
          name: "Dinner",
          rawJson: JSON.stringify({ id: "pinterest_board_1", name: "Dinner" }),
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          folderId: "folder_section",
          householdId: "household_1",
          parentFolderId: "folder_board",
          source: "pinterest",
          sourceType: "section",
          pinterestBoardId: "pinterest_board_1",
          pinterestSectionId: "section_1",
          name: "Desserts",
          rawJson: JSON.stringify({ id: "section_1", name: "Desserts" }),
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    await db.insert(recipeFolderMemberships)
      .values([
        {
          membershipId: "membership_board",
          householdId: "household_1",
          recipeId: "recipe_board",
          folderId: "folder_board",
          source: "pinterest",
          createdAt: now,
          updatedAt: now,
        },
        {
          membershipId: "membership_section",
          householdId: "household_1",
          recipeId: "recipe_section",
          folderId: "folder_section",
          source: "pinterest",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  } finally {
    await sqlite.close();
  }
});

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  delete process.env.SQLITE_PATH;
  vi.clearAllMocks();
  mockOpenDatabase.mockReset();
  mockRequireHouseholdContext.mockReset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("getPinterestRecipeFolderTree", () => {
  it("returns board folders with nested section folders and direct recipe counts", async () => {
    const tree = await getPinterestRecipeFolderTree();

    expect(tree).toEqual([
      {
        folderId: "folder_board",
        name: "Dinner",
        parentFolderId: null,
        sourceType: "board",
        pinterestBoardId: "pinterest_board_1",
        pinterestSectionId: null,
        recipeCount: 1,
        children: [
          {
            folderId: "folder_section",
            name: "Desserts",
            parentFolderId: "folder_board",
            sourceType: "section",
            pinterestBoardId: "pinterest_board_1",
            pinterestSectionId: "section_1",
            recipeCount: 1,
            children: [],
          },
        ],
      },
    ]);
  });
});

describe("getRecipeDetail", () => {
  it("includes the imported folder path when a recipe belongs to a Pinterest section", async () => {
    const detail = await getRecipeDetail("recipe_section");

    expect(detail?.folderPath).toEqual([
      {
        folderId: "folder_board",
        name: "Dinner",
        sourceType: "board",
      },
      {
        folderId: "folder_section",
        name: "Desserts",
        sourceType: "section",
      },
    ]);
  });
});

describe("getPublicRecipeDetail", () => {
  it("loads safe recipe content without resolving a household", async () => {
    mockRequireHouseholdContext.mockRejectedValueOnce(new Error("must not be called"));

    await expect(getPublicRecipeDetail("recipe_section")).resolves.toMatchObject({
      recipeId: "recipe_section",
      title: "Section meal",
      ingredients: [],
      steps: [],
    });
  });

  it("returns null for a recipe that does not exist", async () => {
    await expect(getPublicRecipeDetail("missing_recipe")).resolves.toBeNull();
  });
});

function createTestDatabaseHandle(targetPath: string) {
  const sqlite = new BetterSqlite3(targetPath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });

  return {
    db,
    driver: "sqlite" as const,
    sqlite: {
      close: async () => {
        sqlite.close();
      },
      transaction: async <T>(work: (tx: typeof db) => T) => db.transaction(work),
    },
    targetLabel: targetPath,
  };
}
