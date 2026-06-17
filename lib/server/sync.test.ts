import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/server/database";
import {
  households,
} from "@/lib/server/db";
import { syncBoard } from "@/lib/server/sync";

const {
  mockFetchAllPins,
  mockGetValidPinterestAccessToken,
} = vi.hoisted(() => ({
  mockFetchAllPins: vi.fn(),
  mockGetValidPinterestAccessToken: vi.fn(),
}));

vi.mock("@/src/env", async () => {
  const actual = await vi.importActual<typeof import("@/src/env")>("@/src/env");

  return {
    ...actual,
    resolveAppEnvironment: vi.fn(() => "development"),
    loadAppEnvironment: vi.fn(() => "development"),
  };
});

vi.mock("@/lib/server/pinterest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/pinterest")>(
    "@/lib/server/pinterest",
  );

  return {
    ...actual,
    fetchAllPins: mockFetchAllPins,
    getValidPinterestAccessToken: mockGetValidPinterestAccessToken,
  };
});

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    vi.unstubAllEnvs();
    return;
  }

  vi.stubEnv("NODE_ENV", value);
}

async function withTestDatabase(
  run: (args: { sqlitePath: string }) => Promise<void>,
) {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSqlitePath = process.env.SQLITE_PATH;
  setNodeEnv("development");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-sync-"));
  const sqlitePath = path.join(tempDir, "sync.sqlite");
  const seededSqlitePath = path.join(process.cwd(), "data", "db.sqlite");
  fs.copyFileSync(seededSqlitePath, sqlitePath);
  process.env.SQLITE_PATH = sqlitePath;

  try {
    await run({ sqlitePath });
  } finally {
    setNodeEnv(originalNodeEnv);
    if (originalSqlitePath == null) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockFetchAllPins.mockReset();
  mockGetValidPinterestAccessToken.mockReset();
});

describe("syncBoard", () => {
  it("creates Pinterest board and section folders and assigns recipe memberships", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const now = "2026-06-17T00:00:00.000Z";
      const householdId = "household-sync";
      mockGetValidPinterestAccessToken.mockResolvedValue("token");
      mockFetchAllPins.mockResolvedValue([
        {
          id: "pin-board",
          title: "Board recipe",
          link: "https://example.com/board",
          created_at: now,
        },
        {
          id: "pin-section-a",
          title: "Section recipe A",
          board_section_id: "section-a",
          board_section_name: "Desserts",
          link: "https://example.com/section-a",
          created_at: now,
        },
        {
          id: "pin-section-b",
          title: "Section recipe B",
          board_section_id: "section-a",
          board_section_name: "Desserts",
          link: "https://example.com/section-b",
          created_at: now,
        },
      ]);

      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        await db.insert(households)
          .values({
            householdId,
            name: "Sync Kitchen",
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } finally {
        await sqlite.close();
      }

      await syncBoard("board-1", {
        householdId,
        sqlitePath,
        boardName: "Weeknight",
      });

      const reopened = await openDatabase(sqlitePath);
      try {
        const folders = await reopened.db.query.recipeFolders.findMany({
          where: (table, { eq }) => eq(table.householdId, householdId),
          orderBy: (table, { asc }) => [asc(table.sourceType), asc(table.name)],
        });
        const memberships = await reopened.db.query.recipeFolderMemberships.findMany({
          where: (table, { eq }) => eq(table.householdId, householdId),
          with: {
            recipe: {
              with: {
                pin: true,
              },
            },
            folder: true,
          },
          orderBy: (table, { asc }) => [asc(table.recipeId)],
        });

        expect(folders).toHaveLength(2);
        const boardFolder = folders.find((folder) => folder.sourceType === "board");
        const sectionFolder = folders.find((folder) => folder.sourceType === "section");

        expect(boardFolder?.name).toBe("Weeknight");
        expect(sectionFolder?.name).toBe("Desserts");
        expect(sectionFolder?.parentFolderId).toBe(boardFolder?.folderId ?? null);

        expect(memberships).toHaveLength(3);
        expect(
          memberships
            .map((membership) => ({
              pinId: membership.recipe.pin.pinterestPinId,
              folderName: membership.folder.name,
              sourceType: membership.folder.sourceType,
            }))
            .sort((left, right) => left.pinId.localeCompare(right.pinId)),
        ).toEqual([
          {
            pinId: "pin-board",
            folderName: "Weeknight",
            sourceType: "board",
          },
          {
            pinId: "pin-section-a",
            folderName: "Desserts",
            sourceType: "section",
          },
          {
            pinId: "pin-section-b",
            folderName: "Desserts",
            sourceType: "section",
          },
        ]);
      } finally {
        await reopened.sqlite.close();
      }
    });
  });

  it("updates folder membership and section name when a pin moves sections", async () => {
    await withTestDatabase(async ({ sqlitePath }) => {
      const now = "2026-06-17T00:00:00.000Z";
      const householdId = "household-moves";
      mockGetValidPinterestAccessToken.mockResolvedValue("token");

      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        await db.insert(households)
          .values({
            householdId,
            name: "Move Kitchen",
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } finally {
        await sqlite.close();
      }

      mockFetchAllPins.mockResolvedValueOnce([
        {
          id: "pin-1",
          title: "Recipe one",
          link: "https://example.com/one",
          created_at: now,
        },
      ]);

      await syncBoard("board-2", {
        householdId,
        sqlitePath,
        boardName: "Dinner",
      });

      mockFetchAllPins.mockResolvedValueOnce([
        {
          id: "pin-1",
          title: "Recipe one",
          board_section_id: "section-new",
          board_section_name: "Favorites",
          link: "https://example.com/one",
          created_at: now,
        },
      ]);

      await syncBoard("board-2", {
        householdId,
        sqlitePath,
        boardName: "Dinner ideas",
      });

      mockFetchAllPins.mockResolvedValueOnce([
        {
          id: "pin-1",
          title: "Recipe one",
          board_section_id: "section-new",
          board_section_name: "Top picks",
          link: "https://example.com/one",
          created_at: now,
        },
      ]);

      await syncBoard("board-2", {
        householdId,
        sqlitePath,
        boardName: "Dinner ideas",
      });

      const reopened = await openDatabase(sqlitePath);
      try {
        const folders = await reopened.db.query.recipeFolders.findMany({
          where: (table, { eq }) => eq(table.householdId, householdId),
        });
        const memberships = await reopened.db.query.recipeFolderMemberships.findMany({
          where: (table, { eq }) => eq(table.householdId, householdId),
          with: {
            folder: true,
          },
        });

        const boardFolder = folders.find((folder) => folder.sourceType === "board");
        const sectionFolder = folders.find((folder) => folder.sourceType === "section");

        expect(boardFolder?.name).toBe("Dinner ideas");
        expect(sectionFolder?.name).toBe("Top picks");
        expect(memberships).toHaveLength(1);
        expect(memberships[0]?.folder.folderId).toBe(sectionFolder?.folderId);
      } finally {
        await reopened.sqlite.close();
      }
    });
  });
});
