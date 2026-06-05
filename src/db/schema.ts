import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const boards = sqliteTable("boards", {
  boardId: text("board_id").primaryKey(),
  lastSyncedAt: text("last_synced_at").notNull(),
});

export const pins = sqliteTable(
  "pins",
  {
    pinId: text("pin_id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.boardId),
    boardSectionId: text("board_section_id"),
    title: text("title"),
    description: text("description"),
    link: text("link"),
    altText: text("alt_text"),
    dominantColor: text("dominant_color"),
    note: text("note"),
    createdAt: text("created_at"),
    parentPinId: text("parent_pin_id"),
    mediaJson: text("media_json"),
    mediaSourceJson: text("media_source_json"),
    creatorJson: text("creator_json"),
    boardOwnerJson: text("board_owner_json"),
    rawJson: text("raw_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    boardIdIdx: index("idx_pins_board_id").on(table.boardId),
  }),
);
