import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const ratings = sqliteTable(
  "ratings",
  {
    ratingId: integer("rating_id").primaryKey({ autoIncrement: true }),
    pinId: text("pin_id")
      .notNull()
      .references(() => pins.pinId),
    rating: integer("rating").notNull(),
    ratedAt: text("rated_at").notNull(),
  },
  (table) => ({
    pinIdIdx: index("idx_ratings_pin_id").on(table.pinId),
    ratedAtIdx: index("idx_ratings_rated_at").on(table.ratedAt),
  }),
);

export const recipeSources = sqliteTable(
  "recipe_sources",
  {
    sourceId: integer("source_id").primaryKey({ autoIncrement: true }),
    pinId: text("pin_id")
      .notNull()
      .references(() => pins.pinId),
    originalUrl: text("original_url").notNull(),
    finalUrl: text("final_url"),
    fetchStatus: text("fetch_status").notNull(),
    contentType: text("content_type"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => ({
    pinIdIdx: index("idx_recipe_sources_pin_id").on(table.pinId),
    fetchedAtIdx: index("idx_recipe_sources_fetched_at").on(table.fetchedAt),
  }),
);

export const recipes = sqliteTable(
  "recipes",
  {
    recipeId: integer("recipe_id").primaryKey({ autoIncrement: true }),
    pinId: text("pin_id")
      .notNull()
      .unique()
      .references(() => pins.pinId),
    sourceId: integer("source_id").references(() => recipeSources.sourceId),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    canonicalUrl: text("canonical_url"),
    siteName: text("site_name"),
    imageUrl: text("image_url"),
    yieldText: text("yield_text"),
    prepTime: text("prep_time"),
    cookTime: text("cook_time"),
    totalTime: text("total_time"),
    categoriesJson: text("categories_json"),
    cuisine: text("cuisine"),
    keywordsJson: text("keywords_json"),
    nutritionJson: text("nutrition_json"),
    rawRecipeJson: text("raw_recipe_json").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    sourceIdIdx: index("idx_recipes_source_id").on(table.sourceId),
  }),
);

export const recipeExtractions = sqliteTable(
  "recipe_extractions",
  {
    extractionId: integer("extraction_id").primaryKey({ autoIncrement: true }),
    pinId: text("pin_id")
      .notNull()
      .references(() => pins.pinId),
    sourceId: integer("source_id").references(() => recipeSources.sourceId),
    status: text("status").notNull(),
    method: text("method"),
    warningsJson: text("warnings_json"),
    candidateCount: integer("candidate_count").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    pinIdIdx: index("idx_recipe_extractions_pin_id").on(table.pinId),
    statusIdx: index("idx_recipe_extractions_status").on(table.status),
    createdAtIdx: index("idx_recipe_extractions_created_at").on(table.createdAt),
  }),
);

export const recipeSteps = sqliteTable(
  "recipe_steps",
  {
    stepId: integer("step_id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.recipeId),
    position: integer("position").notNull(),
    section: text("section"),
    rawText: text("raw_text").notNull(),
    text: text("text").notNull(),
  },
  (table) => ({
    recipeIdIdx: index("idx_recipe_steps_recipe_id").on(table.recipeId),
    recipePositionIdx: index("idx_recipe_steps_recipe_position").on(table.recipeId, table.position),
  }),
);

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    ingredientId: integer("ingredient_id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.recipeId),
    position: integer("position").notNull(),
    originalText: text("original_text").notNull(),
    amountText: text("amount_text"),
    unit: text("unit"),
    ingredientText: text("ingredient_text"),
    notes: text("notes"),
    normalizationStatus: text("normalization_status").notNull(),
  },
  (table) => ({
    recipeIdIdx: index("idx_recipe_ingredients_recipe_id").on(table.recipeId),
    recipePositionIdx: index("idx_recipe_ingredients_recipe_position").on(table.recipeId, table.position),
    normalizationStatusIdx: index("idx_recipe_ingredients_normalization_status").on(table.normalizationStatus),
  }),
);
