import path from "node:path";

import * as nextEnvModule from "@next/env";

export type AppEnvironment = "development" | "test" | "production";

let loadedEnvKey: string | null = null;
const nextEnvCompat = nextEnvModule as typeof nextEnvModule & {
  default?: {
    loadEnvConfig?: typeof nextEnvModule.loadEnvConfig;
  };
};
const loadEnvConfig =
  nextEnvCompat.loadEnvConfig ??
  nextEnvCompat.default?.loadEnvConfig;

if (!loadEnvConfig) {
  throw new Error("Unable to load loadEnvConfig from @next/env.");
}

export function resolveAppEnvironment(value = process.env.NODE_ENV): AppEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

export function getEnvFileName(environment = resolveAppEnvironment()) {
  return `.env.${environment}`;
}

export function getEnvFilePath(projectDir = process.cwd(), environment = resolveAppEnvironment()) {
  return path.resolve(projectDir, getEnvFileName(environment));
}

export function loadAppEnvironment(projectDir = process.cwd()) {
  const resolvedProjectDir = path.resolve(projectDir);
  const environment = resolveAppEnvironment();
  const nextKey = `${resolvedProjectDir}:${environment}`;

  if (loadedEnvKey !== nextKey) {
    loadEnvConfig(
      resolvedProjectDir,
      environment === "development",
      console,
      true,
    );
    loadedEnvKey = nextKey;
  }

  return environment;
}
