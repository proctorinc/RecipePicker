import process from "node:process";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createDatabase } from "./client.js";
import { baselineLegacySchema } from "./migrations.js";

async function main() {
  const { db, sqlite, sqlitePath } = createDatabase();

  try {
    baselineLegacySchema(sqlite);

    migrate(db, {
      migrationsFolder: "drizzle",
    });

    console.log(`Applied Drizzle migrations to ${sqlitePath}`);
  } finally {
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
