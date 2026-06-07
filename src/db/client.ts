import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export function resolveSqlitePath(sqlitePath?: string): string {
  return path.resolve(
    sqlitePath ?? process.env.SQLITE_PATH ?? "./data/db.sqlite",
  );
}

export function ensureSqliteParentDirectory(sqlitePath: string) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

export function createDatabase(sqlitePath?: string) {
  const resolvedPath = resolveSqlitePath(sqlitePath);
  ensureSqliteParentDirectory(resolvedPath);

  const sqlite = new BetterSqlite3(resolvedPath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    sqlitePath: resolvedPath,
  };
}
