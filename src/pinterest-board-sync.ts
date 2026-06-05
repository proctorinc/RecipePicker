import process from "node:process";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createDatabase } from "./db/client.js";
import { baselineLegacySchema } from "./db/migrations.js";
import { boards, pins as pinsTable } from "./db/schema.js";
import { fetchAllPins, PinterestPin, requireEnv } from "./pinterest-api.js";

function parseArgs(argv: string[]) {
  const [boardId, outputPathArg] = argv;

  if (!boardId) {
    throw new Error("Usage: npm run sync:board -- <board-id> [sqlite-path]");
  }

  const sqlitePath = outputPathArg ?? process.env.SQLITE_PATH ?? "./data/pinterest.sqlite";

  return {
    boardId,
    sqlitePath,
  };
}

async function upsertPins(boardId: string, records: PinterestPin[], sqlitePath?: string) {
  const syncNow = new Date().toISOString();
  const { db, sqlite, sqlitePath: resolvedSqlitePath } = createDatabase(sqlitePath);

  try {
    baselineLegacySchema(sqlite);

    migrate(db, {
      migrationsFolder: "drizzle",
    });

    sqlite.transaction(() => {
      db.insert(boards)
        .values({
          boardId,
          lastSyncedAt: syncNow,
        })
        .onConflictDoUpdate({
          target: boards.boardId,
          set: {
            lastSyncedAt: syncNow,
          },
        })
        .run();

      for (const pin of records) {
        const values = {
          pinId: pin.id,
          boardId: pin.board_id ?? boardId,
          boardSectionId: pin.board_section_id ?? null,
          title: pin.title ?? null,
          description: pin.description ?? null,
          link: pin.link ?? null,
          altText: pin.alt_text ?? null,
          dominantColor: pin.dominant_color ?? null,
          note: pin.note ?? null,
          createdAt: pin.created_at ?? null,
          parentPinId: pin.parent_pin_id ?? null,
          mediaJson: pin.media ? JSON.stringify(pin.media) : null,
          mediaSourceJson: pin.media_source ? JSON.stringify(pin.media_source) : null,
          creatorJson: pin.creator ? JSON.stringify(pin.creator) : null,
          boardOwnerJson: pin.board_owner ? JSON.stringify(pin.board_owner) : null,
          rawJson: JSON.stringify(pin),
          updatedAt: syncNow,
        };

        db.insert(pinsTable)
          .values(values)
          .onConflictDoUpdate({
            target: pinsTable.pinId,
            set: values,
          })
          .run();
      }
    })();

    return resolvedSqlitePath;
  } finally {
    sqlite.close();
  }
}

async function main() {
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN");
  const { boardId, sqlitePath } = parseArgs(process.argv.slice(2));
  const pins = await fetchAllPins(boardId, accessToken);
  const resolvedSqlitePath = await upsertPins(boardId, pins, sqlitePath);

  console.log(`Synced ${pins.length} pins from board ${boardId} into ${resolvedSqlitePath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
