import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";

import { logError, logInfo, maybeWithSqliteTarget } from "@/lib/server/logger";
import { createDatabase } from "@/lib/server/db";
import type { DatabaseClient } from "@/src/db/client";

const migratedTargets = new Set<string>();

function shouldRunRuntimeMigrations() {
  const override = process.env.DB_AUTO_MIGRATE?.trim().toLowerCase();

  if (override === "true") {
    return true;
  }

  if (override === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export async function openDatabase(sqlitePath?: string) {
  const handle = createDatabase(sqlitePath);

  if (
    shouldRunRuntimeMigrations() &&
    !migratedTargets.has(`${handle.driver}:${handle.targetLabel}`)
  ) {
    logInfo("db.runtime_migration.started", {
      result: {
        driver: handle.driver,
      },
      ...maybeWithSqliteTarget(handle.targetLabel),
    });

    try {
      await migrateByHash(handle.db, handle.driver);

      migratedTargets.add(`${handle.driver}:${handle.targetLabel}`);
      logInfo("db.runtime_migration.completed", {
        result: {
          driver: handle.driver,
          status: "success",
        },
        ...maybeWithSqliteTarget(handle.targetLabel),
      });
    } catch (error) {
      logError("db.runtime_migration.failed", error, {
        result: {
          driver: handle.driver,
          status: "error",
        },
        ...maybeWithSqliteTarget(handle.targetLabel),
      });
      throw error;
    }
  }

  return handle;
}

async function migrateByHash(db: DatabaseClient, driver: "sqlite" | "turso") {
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  const applied = await db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
  const appliedHashes = new Set(applied.map((migration) => migration.hash));

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;
    if (driver === "sqlite") {
      (db as DatabaseClient & { transaction: (fn: (tx: DatabaseClient) => void) => void }).transaction((tx) => {
        for (const statement of migration.sql) tx.run(sql.raw(statement));
        tx.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`);
      });
    } else {
      const tursoDb = db as {
        transaction: (fn: (tx: { run: (query: ReturnType<typeof sql.raw> | ReturnType<typeof sql>) => Promise<unknown> }) => Promise<void>) => Promise<void>;
      };
      await tursoDb.transaction(async (tx) => {
        for (const statement of migration.sql) await tx.run(sql.raw(statement));
        await tx.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`);
      });
    }
  }
}
