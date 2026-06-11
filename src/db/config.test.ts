import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseConfig, resolveSqlitePath } from "@/src/db/config";
import { getEnvFileName, resolveAppEnvironment } from "@/src/env";

const originalEnv = { ...process.env };

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv);
});

describe("environment resolution", () => {
  it("defaults unknown environments to development", () => {
    expect(resolveAppEnvironment("staging" as NodeJS.ProcessEnv["NODE_ENV"])).toBe("development");
    expect(resolveAppEnvironment("" as NodeJS.ProcessEnv["NODE_ENV"])).toBe("development");
    expect(getEnvFileName("development")).toBe(".env.development");
  });

  it("preserves test and production", () => {
    expect(resolveAppEnvironment("test")).toBe("test");
    expect(resolveAppEnvironment("production")).toBe("production");
  });
});

describe("database config", () => {
  it("uses local sqlite in development", () => {
    setNodeEnv("development");
    process.env.SQLITE_PATH = "./data/dev.sqlite";

    const config = getDatabaseConfig();

    expect(config.kind).toBe("sqlite");
    if (config.kind !== "sqlite") {
      throw new Error("Expected sqlite config.");
    }
    expect(config.sqlitePath).toBe(resolveSqlitePath("./data/dev.sqlite"));
  });

  it("uses turso in test", () => {
    setNodeEnv("test");
    process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";

    const config = getDatabaseConfig();

    expect(config).toMatchObject({
      kind: "turso",
      url: "libsql://test-db.turso.io",
      authToken: "test-token",
      environment: "test",
    });
  });

  it("rejects sqlite overrides outside development", () => {
    setNodeEnv("production");
    process.env.TURSO_DATABASE_URL = "libsql://prod-db.turso.io";
    process.env.TURSO_AUTH_TOKEN = "prod-token";

    expect(() => getDatabaseConfig("./data/override.sqlite")).toThrow(
      /only supported in development/i,
    );
  });
});
