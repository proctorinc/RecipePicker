import { defineConfig } from "drizzle-kit";

import { getDatabaseConfig } from "@/src/db/config";

const databaseConfig = getDatabaseConfig();

export default defineConfig(
  databaseConfig.kind === "sqlite"
    ? {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "sqlite",
        dbCredentials: {
          url: databaseConfig.sqlitePath,
        },
      }
    : {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "turso",
        dbCredentials: {
          url: databaseConfig.url,
          authToken: databaseConfig.authToken,
        },
      },
);
