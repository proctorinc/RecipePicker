import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("recipe events migration", () => {
  it("creates the event table and backfills dated reviews", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/0002_recipe_events.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE TABLE `household_recipe_events`");
    expect(sql).toContain("ALTER TABLE `household_recipe_reviews` ADD `event_id`");
    expect(sql).toContain("INSERT INTO `household_recipe_events`");
    expect(sql).toContain("UPDATE `household_recipe_reviews`");
    expect(sql).toContain("WHERE `eaten_on` IS NOT NULL");
  });
});
