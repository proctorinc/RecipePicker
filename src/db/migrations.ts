import type Database from "better-sqlite3";

import { readMigrationFiles } from "drizzle-orm/migrator";

const MIGRATIONS_TABLE_NAME = "__drizzle_migrations";

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

  return Boolean(row);
}

function hasAppliedMigrations(sqlite: Database.Database): boolean {
  if (!tableExists(sqlite, MIGRATIONS_TABLE_NAME)) {
    return false;
  }

  const row = sqlite.prepare(`SELECT id FROM ${MIGRATIONS_TABLE_NAME} ORDER BY created_at DESC LIMIT 1`).get();
  return Boolean(row);
}

function hasLegacySchema(sqlite: Database.Database): boolean {
  return tableExists(sqlite, "boards") && tableExists(sqlite, "pins");
}

export function baselineLegacySchema(sqlite: Database.Database) {
  if (hasAppliedMigrations(sqlite) || !hasLegacySchema(sqlite)) {
    return;
  }

  const migrations = readMigrationFiles({
    migrationsFolder: "drizzle",
  });
  const latestMigration = migrations.at(-1);

  if (!latestMigration) {
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  sqlite
    .prepare(`INSERT INTO ${MIGRATIONS_TABLE_NAME} ("hash", "created_at") VALUES (?, ?)`)
    .run(latestMigration.hash, latestMigration.folderMillis);
}
