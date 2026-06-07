import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createDatabase } from "@/lib/server/db";

export function openDatabase(sqlitePath?: string) {
  const handle = createDatabase(sqlitePath);
  migrate(handle.db, { migrationsFolder: "drizzle" });
  return handle;
}
