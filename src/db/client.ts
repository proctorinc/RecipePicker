import { createClient } from "@libsql/client";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";

import { ensureSqliteParentDirectory, getDatabaseConfig } from "./config";
import * as schema from "./schema";

type BetterSqliteDatabase = ReturnType<typeof drizzle<typeof schema>>;
type LibsqlDatabase = ReturnType<typeof drizzleLibsql<typeof schema>>;

export type DatabaseClient = BetterSqliteDatabase | LibsqlDatabase;

type DatabaseTransactionClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export type DatabaseHandle = {
  db: DatabaseClient;
  driver: "sqlite" | "turso";
  sqlite: {
    close: () => Promise<void>;
    transaction: <T>(work: (tx: DatabaseTransactionClient) => T) => Promise<T>;
  };
  targetLabel: string;
};

export function createDatabase(sqlitePath?: string): DatabaseHandle {
  const config = getDatabaseConfig(sqlitePath);

  if (config.kind === "sqlite") {
    ensureSqliteParentDirectory(config.sqlitePath);

    const sqlite = new BetterSqlite3(config.sqlitePath);
    sqlite.pragma("journal_mode = WAL");

    const db = drizzle(sqlite, { schema });

    return {
      db,
      driver: "sqlite",
      sqlite: {
        async close() {
          sqlite.close();
        },
        async transaction<T>(work: (tx: DatabaseTransactionClient) => T) {
          return db.transaction((tx) => work(tx as DatabaseTransactionClient));
        },
      },
      targetLabel: config.targetLabel,
    };
  }

  const client = createClient({
    url: config.url,
    authToken: config.authToken,
  });
  const db = drizzleLibsql(client, { schema });

  return {
    db,
    driver: "turso",
    sqlite: {
      async close() {
        client.close();
      },
      async transaction<T>(work: (tx: DatabaseTransactionClient) => T) {
        return db.transaction(async (tx) => work(tx as DatabaseTransactionClient));
      },
    },
    targetLabel: config.targetLabel,
  };
}
