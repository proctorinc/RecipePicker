import process from "node:process";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";

import type { DatabaseClient } from "./client.js";
import { createDatabase } from "./client.js";

async function main() {
  const { db, driver, sqlite, targetLabel } = createDatabase();

  try {
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

    console.log(`Applied Drizzle migrations to ${targetLabel}`);
  } finally {
    await sqlite.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
