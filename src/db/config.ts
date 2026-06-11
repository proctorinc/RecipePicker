import fs from "node:fs";
import path from "node:path";

import { loadAppEnvironment, resolveAppEnvironment, type AppEnvironment } from "@/src/env";

export type SqliteDatabaseConfig = {
  environment: AppEnvironment;
  kind: "sqlite";
  sqlitePath: string;
  targetLabel: string;
};

export type TursoDatabaseConfig = {
  environment: AppEnvironment;
  kind: "turso";
  authToken: string;
  url: string;
  targetLabel: string;
};

export type DatabaseConfig = SqliteDatabaseConfig | TursoDatabaseConfig;

export function resolveSqlitePath(sqlitePath?: string): string {
  return path.resolve(
    sqlitePath ?? process.env.SQLITE_PATH ?? "./data/db.sqlite",
  );
}

export function ensureSqliteParentDirectory(sqlitePath: string) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

export function requireEnvValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseConfig(sqlitePath?: string): DatabaseConfig {
  const environment = resolveAppEnvironment(process.env.NODE_ENV);
  const explicitSqlitePath = process.env.SQLITE_PATH?.trim();
  const explicitTursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const explicitTursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
  loadAppEnvironment();

  if (environment === "development") {
    const resolvedPath = resolveSqlitePath(sqlitePath ?? explicitSqlitePath);

    return {
      environment,
      kind: "sqlite",
      sqlitePath: resolvedPath,
      targetLabel: resolvedPath,
    };
  }

  if (sqlitePath) {
    throw new Error(
      `A sqlite path override is only supported in development. Current environment: ${environment}.`,
    );
  }

  const url = explicitTursoUrl ?? requireEnvValue("TURSO_DATABASE_URL");
  const authToken =
    explicitTursoAuthToken ?? requireEnvValue("TURSO_AUTH_TOKEN");

  return {
    environment,
    kind: "turso",
    authToken,
    url,
    targetLabel: url,
  };
}
