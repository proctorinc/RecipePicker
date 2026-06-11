import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";

import { createDatabase } from "@/lib/server/db";
import type { DatabaseClient } from "@/src/db/client";

const migratedTargets = new Set<string>();

export async function openDatabase(sqlitePath?: string) {
  const handle = createDatabase(sqlitePath);

  if (!migratedTargets.has(`${handle.driver}:${handle.targetLabel}`)) {
    if (handle.driver === "sqlite") {
      migrate(handle.db as DatabaseClient & Parameters<typeof migrate>[0], {
        migrationsFolder: "drizzle",
      });
    } else {
      await migrateLibsql(
        handle.db as DatabaseClient & Parameters<typeof migrateLibsql>[0],
        { migrationsFolder: "drizzle" },
      );
    }

    migratedTargets.add(`${handle.driver}:${handle.targetLabel}`);
  }

  return handle;
}
