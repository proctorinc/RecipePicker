import process from "node:process";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";

import { logInfo, maybeWithSqliteTarget, runScriptWithLogging } from "@/lib/server/logger";
import type { DatabaseClient } from "./client.js";
import { createDatabase } from "./client.js";

async function main() {
  const { db, driver, sqlite, targetLabel } = createDatabase();

  try {
    logInfo("db.manual_migration.started", {
      result: {
        driver,
      },
      ...maybeWithSqliteTarget(targetLabel),
    });
    if (driver === "sqlite") {
      migrate(db as DatabaseClient & Parameters<typeof migrate>[0], {
        migrationsFolder: "drizzle",
      });
    } else {
      await migrateLibsql(
        db as DatabaseClient & Parameters<typeof migrateLibsql>[0],
        {
          migrationsFolder: "drizzle",
        },
      );
    }

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
