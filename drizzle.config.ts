import { defineConfig } from "drizzle-kit";

const sqlitePath = process.env.SQLITE_PATH?.trim() || "./data/pinterest.sqlite";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: sqlitePath,
  },
});
