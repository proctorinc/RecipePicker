import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/server/database";
import {
  applyPinterestSourceRemediation,
  planPinterestSourceRemediation,
} from "@/lib/server/pinterest-source-remediation";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function withTestDatabase(run: (sqlitePath: string) => Promise<void>) {
  vi.stubEnv("NODE_ENV", "development");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-pin-remediation-"));
  temporaryDirectories.push(directory);
  const sqlitePath = path.join(directory, "remediation.sqlite");
  fs.copyFileSync(path.join(process.cwd(), "data", "db.sqlite"), sqlitePath);
  const { db, sqlite } = await openDatabase(sqlitePath);
  try {
    const now = "2026-08-26T00:00:00.000Z";
    await db.run(sql`INSERT INTO households (household_id, name, created_at, updated_at) VALUES ('household-a', 'Kitchen', ${now}, ${now})`);
    for (const boardId of ["board-one", "board-two"]) {
      await db.run(sql`INSERT INTO household_boards (board_id, household_id, pinterest_board_id, raw_json, sync_enabled, last_synced_at) VALUES (${`household-a:${boardId}`}, 'household-a', ${boardId}, '{}', 1, ${now})`);
    }
  } finally {
    await sqlite.close();
  }
  await run(sqlitePath);
}

async function seedDuplicate(sqlitePath: string, duplicateCreatedAt = "2026-08-26T01:00:00.000Z") {
  const { db, sqlite } = await openDatabase(sqlitePath);
  try {
    const firstCreatedAt = "2026-08-26T00:00:00.000Z";
    await db.run(sql`
      INSERT INTO household_pins (pin_id, household_id, pinterest_pin_id, board_id, pinterest_board_id, link, raw_json, updated_at)
      VALUES ('household-a:pin-original', 'household-a', 'pin-original', 'household-a:board-one', 'board-one', 'https://Example.com/recipe/?utm_source=pinterest', '{}', ${firstCreatedAt}),
             ('household-a:pin-duplicate', 'household-a', 'pin-duplicate', 'household-a:board-two', 'board-two', 'https://example.com/recipe#pinterest', '{}', ${duplicateCreatedAt})
    `);
    await db.run(sql`
      INSERT INTO household_recipes (recipe_id, household_id, pin_id, created_at, updated_at)
      VALUES ('recipe-original', 'household-a', 'household-a:pin-original', ${firstCreatedAt}, ${firstCreatedAt}),
             ('recipe-duplicate', 'household-a', 'household-a:pin-duplicate', ${duplicateCreatedAt}, ${duplicateCreatedAt})
    `);
    await db.run(sql`INSERT INTO recipe_tags (tag_id, household_id, name, normalized_name, created_at, updated_at) VALUES ('tag-a', 'household-a', 'Dinner', 'dinner', ${firstCreatedAt}, ${firstCreatedAt})`);
    await db.run(sql`INSERT INTO recipe_tag_memberships (membership_id, household_id, recipe_id, tag_id, created_at, updated_at) VALUES ('duplicate-tag', 'household-a', 'recipe-duplicate', 'tag-a', ${duplicateCreatedAt}, ${duplicateCreatedAt})`);
  } finally {
    await sqlite.close();
  }
}

describe("Pinterest source URL remediation", () => {
  it("reports then removes later source duplicates while retaining the original", async () => {
    await withTestDatabase(async (sqlitePath) => {
      await seedDuplicate(sqlitePath);
      const report = await planPinterestSourceRemediation(sqlitePath);
      expect(report.groups).toHaveLength(1);
      expect(report.groups[0]).toMatchObject({
        survivorRecipeId: "recipe-original",
        duplicateRecipeIds: ["recipe-duplicate"],
        normalizedSourceUrl: "https://example.com/recipe",
      });

      await applyPinterestSourceRemediation({ reviewedReport: report, sqlitePath });
      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        expect(await db.all(sql`SELECT recipe_id, pin_id FROM household_recipes WHERE household_id = 'household-a' ORDER BY recipe_id`)).toEqual([
          { recipe_id: "recipe-original", pin_id: "household-a:pin-original" },
        ]);
        expect(await db.all(sql`SELECT pin_id, pinterest_pin_id, source_url_key FROM household_pins WHERE household_id = 'household-a'`)).toEqual([
          { pin_id: "household-a:pin-original", pinterest_pin_id: "pin-original", source_url_key: "https://example.com/recipe" },
        ]);
        expect(await db.all(sql`SELECT * FROM recipe_tag_memberships`)).toEqual([]);
        expect(await db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      } finally {
        await sqlite.close();
      }
      expect((await planPinterestSourceRemediation(sqlitePath)).groups).toEqual([]);
    });
  });

  it("blocks ambiguous original recipes without mutating either one", async () => {
    await withTestDatabase(async (sqlitePath) => {
      await seedDuplicate(sqlitePath, "2026-08-26T00:00:00.000Z");
      const report = await planPinterestSourceRemediation(sqlitePath);
      expect(report.blockingGroups).toHaveLength(1);
      await expect(applyPinterestSourceRemediation({ reviewedReport: report, sqlitePath })).rejects.toThrow("ambiguous earliest recipe");
      const { db, sqlite } = await openDatabase(sqlitePath);
      try {
        expect(await db.get(sql`SELECT count(*) AS count FROM household_recipes WHERE household_id = 'household-a'`)).toEqual({ count: 2 });
      } finally {
        await sqlite.close();
      }
    });
  });
});
