import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import Database from "better-sqlite3";
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

function ensureParentDirectory(filePath: string) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      board_id TEXT PRIMARY KEY,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pins (
      pin_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      board_section_id TEXT,
      title TEXT,
      description TEXT,
      link TEXT,
      alt_text TEXT,
      dominant_color TEXT,
      note TEXT,
      created_at TEXT,
      parent_pin_id TEXT,
      media_json TEXT,
      media_source_json TEXT,
      creator_json TEXT,
      board_owner_json TEXT,
      raw_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(board_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pins_board_id ON pins (board_id);
  `);
}

function upsertPins(db: Database.Database, boardId: string, pins: PinterestPin[]) {
  const upsertBoard = db.prepare(`
    INSERT INTO boards (board_id, last_synced_at)
    VALUES (@board_id, @last_synced_at)
    ON CONFLICT(board_id) DO UPDATE SET
      last_synced_at = excluded.last_synced_at
  `);

  const upsertPin = db.prepare(`
    INSERT INTO pins (
      pin_id,
      board_id,
      board_section_id,
      title,
      description,
      link,
      alt_text,
      dominant_color,
      note,
      created_at,
      parent_pin_id,
      media_json,
      media_source_json,
      creator_json,
      board_owner_json,
      raw_json,
      updated_at
    ) VALUES (
      @pin_id,
      @board_id,
      @board_section_id,
      @title,
      @description,
      @link,
      @alt_text,
      @dominant_color,
      @note,
      @created_at,
      @parent_pin_id,
      @media_json,
      @media_source_json,
      @creator_json,
      @board_owner_json,
      @raw_json,
      @updated_at
    )
    ON CONFLICT(pin_id) DO UPDATE SET
      board_id = excluded.board_id,
      board_section_id = excluded.board_section_id,
      title = excluded.title,
      description = excluded.description,
      link = excluded.link,
      alt_text = excluded.alt_text,
      dominant_color = excluded.dominant_color,
      note = excluded.note,
      created_at = excluded.created_at,
      parent_pin_id = excluded.parent_pin_id,
      media_json = excluded.media_json,
      media_source_json = excluded.media_source_json,
      creator_json = excluded.creator_json,
      board_owner_json = excluded.board_owner_json,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);

  const syncNow = new Date().toISOString();

  const transaction = db.transaction((records: PinterestPin[]) => {
    upsertBoard.run({
      board_id: boardId,
      last_synced_at: syncNow,
    });

    for (const pin of records) {
      upsertPin.run({
        pin_id: pin.id,
        board_id: pin.board_id ?? boardId,
        board_section_id: pin.board_section_id ?? null,
        title: pin.title ?? null,
        description: pin.description ?? null,
        link: pin.link ?? null,
        alt_text: pin.alt_text ?? null,
        dominant_color: pin.dominant_color ?? null,
        note: pin.note ?? null,
        created_at: pin.created_at ?? null,
        parent_pin_id: pin.parent_pin_id ?? null,
        media_json: pin.media ? JSON.stringify(pin.media) : null,
        media_source_json: pin.media_source ? JSON.stringify(pin.media_source) : null,
        creator_json: pin.creator ? JSON.stringify(pin.creator) : null,
        board_owner_json: pin.board_owner ? JSON.stringify(pin.board_owner) : null,
        raw_json: JSON.stringify(pin),
        updated_at: syncNow,
      });
    }
  });

  transaction(pins);
}

async function main() {
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN");
  const { boardId, sqlitePath } = parseArgs(process.argv.slice(2));
  const resolvedSqlitePath = path.resolve(sqlitePath);

  ensureParentDirectory(resolvedSqlitePath);

  const pins = await fetchAllPins(boardId, accessToken);

  const db = new Database(resolvedSqlitePath);
  createSchema(db);
  upsertPins(db, boardId, pins);
  db.close();

  console.log(`Synced ${pins.length} pins from board ${boardId} into ${resolvedSqlitePath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
