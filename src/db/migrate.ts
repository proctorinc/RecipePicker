import process from "node:process";

import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { and, sql } from "drizzle-orm";

import { logInfo, maybeWithSqliteTarget, runScriptWithLogging } from "@/lib/server/logger";
import type { DatabaseClient } from "./client.js";
import { createDatabase } from "./client.js";
import { householdRecipeIngredientMeasurements, householdRecipeIngredients } from "./schema.js";

type AppliedMigration = {
  hash: string;
};

/**
 * Drizzle's SQLite migrators select only the greatest `created_at` value from
 * __drizzle_migrations. That makes a bad future journal timestamp skip every
 * later migration whose timestamp is lower, even if it has never been run.
 *
 * The migration content hash is the stable identity of a migration, so use it
 * to determine which files still need to run. Keep recording `created_at` for
 * compatibility with Drizzle tooling, but never use it to decide whether a
 * migration has been applied.
 */
async function migrateByHash(
  db: DatabaseClient,
  driver: "sqlite" | "turso",
) {
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const appliedMigrations = await db.all<AppliedMigration>(
    sql`SELECT hash FROM __drizzle_migrations`,
  );
  const appliedHashes = new Set(appliedMigrations.map(({ hash }) => hash));

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) {
      continue;
    }

    if (driver === "sqlite") {
      const sqliteDb = db as Parameters<typeof migrateSqlite>[0];
      sqliteDb.transaction((tx) => {
        for (const statement of migration.sql) {
          tx.run(sql.raw(statement));
        }

        tx.run(sql`
          INSERT INTO __drizzle_migrations (hash, created_at)
          VALUES (${migration.hash}, ${migration.folderMillis})
        `);
      });
    } else {
      const libsqlDb = db as Parameters<typeof migrateLibsql>[0];
      await libsqlDb.transaction(async (tx) => {
        for (const statement of migration.sql) {
          await tx.run(sql.raw(statement));
        }

        await tx.run(sql`
          INSERT INTO __drizzle_migrations (hash, created_at)
          VALUES (${migration.hash}, ${migration.folderMillis})
        `);
      });
    }
  }
}

async function backfillIngredientMeasurements(db: DatabaseClient) {
  const legacyIngredients = await db
    .select()
    .from(householdRecipeIngredients)
    .where(and(sql`${householdRecipeIngredients.amountText} IS NOT NULL`, sql`${householdRecipeIngredients.unit} IS NOT NULL`));

  for (const ingredient of legacyIngredients) {
    const existing = await db.query.householdRecipeIngredientMeasurements.findFirst({
      where: (table, { eq: equals }) => equals(table.ingredientId, ingredient.ingredientId),
      columns: { ingredientMeasurementId: true },
    });
    if (existing || !ingredient.amountText || !ingredient.unit) continue;
    await db.insert(householdRecipeIngredientMeasurements).values({
      householdId: ingredient.householdId,
      recipeId: ingredient.recipeId,
      ingredientId: ingredient.ingredientId,
      position: 1,
      amountText: ingredient.amountText,
      amountValue: ingredient.amountValue,
      amountMaxValue: ingredient.amountMaxValue,
      unit: ingredient.unit,
    }).onConflictDoNothing().run();
  }
}

async function main() {
  const { db, driver, sqlite, targetLabel } = createDatabase();

  try {
    logInfo("db.manual_migration.started", {
      result: {
        driver,
      },
      ...maybeWithSqliteTarget(targetLabel),
    });
    await migrateByHash(db, driver);
    await backfillIngredientMeasurements(db);

    logInfo("db.manual_migration.completed", {
      result: {
        driver,
        status: "success",
      },
      ...maybeWithSqliteTarget(targetLabel),
    });
    process.stdout.write(`Applied Drizzle migrations to ${targetLabel}\n`);
  } finally {
    await sqlite.close();
  }
}

runScriptWithLogging({
  scriptName: "script.db_migrate",
  fn: main,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
