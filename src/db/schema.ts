import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

function generatedId(columnName: string) {
  return text(columnName).notNull().primaryKey().$defaultFn(() => createId());
}

export const households = sqliteTable("households", {
  householdId: text("household_id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userAccessTiers = sqliteTable("user_access_tiers", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  subscriptionTier: text("subscription_tier").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    membershipId: generatedId("membership_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    clerkUserId: text("clerk_user_id").notNull(),
    role: text("role").notNull(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => ({
    householdUserUniqueIdx: uniqueIndex("idx_household_members_household_user_unique").on(table.householdId, table.clerkUserId),
    clerkUserIdx: index("idx_household_members_clerk_user_id").on(table.clerkUserId),
  }),
);

export const householdInvites = sqliteTable(
  "household_invites",
  {
    inviteToken: text("invite_token").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    consumedByClerkUserId: text("consumed_by_clerk_user_id"),
  },
  (table) => ({
    householdIdx: index("idx_household_invites_household_id").on(table.householdId),
  }),
);

export const oauthStates = sqliteTable(
  "oauth_states",
  {
    state: text("state").primaryKey(),
    provider: text("provider").notNull(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    clerkUserId: text("clerk_user_id").notNull(),
    returnTo: text("return_to"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => ({
    householdProviderIdx: index("idx_oauth_states_household_provider").on(table.householdId, table.provider),
  }),
);

export const pinterestAccounts = sqliteTable(
  "pinterest_accounts",
  {
    pinterestAccountId: text("pinterest_account_id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    provider: text("provider").notNull().default("pinterest"),
    connectedByClerkUserId: text("connected_by_clerk_user_id").notNull(),
    pinterestUserId: text("pinterest_user_id"),
    accountLabel: text("account_label"),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    scope: text("scope"),
    accessTokenExpiresAt: text("access_token_expires_at"),
    refreshTokenExpiresAt: text("refresh_token_expires_at"),
    lastRefreshAttemptAt: text("last_refresh_attempt_at"),
    lastRefreshSucceededAt: text("last_refresh_succeeded_at"),
    lastSyncAttemptAt: text("last_sync_attempt_at"),
    lastSyncTrigger: text("last_sync_trigger"),
    lastSyncAt: text("last_sync_at"),
    lastSyncStatus: text("last_sync_status"),
    lastSyncError: text("last_sync_error"),
    autoSyncEnabled: integer("auto_sync_enabled", { mode: "boolean" }).notNull().default(true),
    syncInProgressAt: text("sync_in_progress_at"),
    connectionStatus: text("connection_status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdProviderUniqueIdx: uniqueIndex("idx_pinterest_accounts_household_provider_unique").on(table.householdId, table.provider),
  }),
);

export const householdAiConnections = sqliteTable(
  "household_ai_connections",
  {
    aiConnectionId: text("ai_connection_id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    connectedByClerkUserId: text("connected_by_clerk_user_id").notNull(),
    connectionStatus: text("connection_status").notNull().default("active"),
    lastTestedAt: text("last_tested_at"),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdUniqueIdx: uniqueIndex("idx_household_ai_connections_household_unique").on(table.householdId),
    householdProviderIdx: index("idx_household_ai_connections_provider").on(table.provider),
  }),
);

export const boardSyncSubscriptions = sqliteTable(
  "board_sync_subscriptions",
  {
    subscriptionId: generatedId("subscription_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinterestBoardId: text("pinterest_board_id").notNull(),
    boardName: text("board_name"),
    syncEnabled: integer("sync_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdBoardUniqueIdx: uniqueIndex("idx_board_sync_subscriptions_household_board_unique").on(table.householdId, table.pinterestBoardId),
    householdEnabledBoardNameIdx: index("idx_board_sync_subscriptions_household_enabled_board_name").on(
      table.householdId,
      table.syncEnabled,
      table.boardName,
    ),
  }),
);

export const householdBoards = sqliteTable(
  "household_boards",
  {
    boardId: text("board_id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinterestBoardId: text("pinterest_board_id").notNull(),
    name: text("name"),
    description: text("description"),
    privacy: text("privacy"),
    ownerJson: text("owner_json"),
    rawJson: text("raw_json").notNull(),
    syncEnabled: integer("sync_enabled", { mode: "boolean" }).notNull().default(true),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (table) => ({
    householdPinterestBoardUniqueIdx: uniqueIndex("idx_household_boards_household_board_unique").on(table.householdId, table.pinterestBoardId),
    householdIdx: index("idx_household_boards_household_id").on(table.householdId),
  }),
);

export const householdPins = sqliteTable(
  "household_pins",
  {
    pinId: text("pin_id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinterestPinId: text("pinterest_pin_id").notNull(),
    boardId: text("board_id")
      .notNull()
      .references(() => householdBoards.boardId),
    pinterestBoardId: text("pinterest_board_id").notNull(),
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
    householdPinterestPinUniqueIdx: uniqueIndex("idx_household_pins_household_pin_unique").on(table.householdId, table.pinterestPinId),
    boardIdIdx: index("idx_household_pins_board_id").on(table.boardId),
  }),
);

export const householdRecipeReviews = sqliteTable(
  "household_recipe_reviews",
  {
    reviewId: generatedId("review_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    eventId: text("event_id").references(() => householdRecipeEvents.eventId),
    reviewedByClerkUserId: text("reviewed_by_clerk_user_id"),
    ratingValue: real("rating_value").notNull(),
    eatenOn: text("eaten_on"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    recipeIdIdx: index("idx_household_recipe_reviews_recipe_id").on(table.recipeId),
    recipeCreatedIdx: index("idx_household_recipe_reviews_recipe_created").on(table.recipeId, table.createdAt),
    eventIdUniqueIdx: uniqueIndex("idx_household_recipe_reviews_event_unique").on(table.eventId),
    eatenOnIdx: index("idx_household_recipe_reviews_eaten_on").on(table.eatenOn),
    reviewerIdx: index("idx_household_recipe_reviews_reviewer").on(table.reviewedByClerkUserId),
  }),
);

export const householdRecipeEvents = sqliteTable(
  "household_recipe_events",
  {
    eventId: generatedId("event_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    date: text("date").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdDateIdx: index("idx_household_recipe_events_household_date").on(table.householdId, table.date),
    householdDateCreatedIdx: index("idx_household_recipe_events_household_date_created").on(
      table.householdId,
      table.date,
      table.createdAt,
    ),
    recipeIdIdx: index("idx_household_recipe_events_recipe_id").on(table.recipeId),
    createdByIdx: index("idx_household_recipe_events_created_by").on(table.createdByClerkUserId),
  }),
);

export const householdRecipeFeedback = sqliteTable(
  "household_recipe_feedback",
  {
    feedbackId: generatedId("feedback_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    summary: text("summary"),
    note: text("note"),
    createdByClerkUserId: text("created_by_clerk_user_id"),
    updatedByClerkUserId: text("updated_by_clerk_user_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    recipeUniqueIdx: uniqueIndex("idx_household_recipe_feedback_recipe_unique").on(table.recipeId),
    householdRecipeIdx: index("idx_household_recipe_feedback_household_recipe").on(table.householdId, table.recipeId),
  }),
);

export const householdRecipePickerConversations = sqliteTable(
  "household_recipe_picker_conversations",
  {
    conversationId: generatedId("conversation_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    title: text("title"),
    status: text("status").notNull().default("active"),
    lastMessageAt: text("last_message_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdUpdatedIdx: index("idx_household_recipe_picker_conversations_household_updated").on(table.householdId, table.updatedAt),
    householdLastMessageIdx: index("idx_household_recipe_picker_conversations_household_last_message").on(table.householdId, table.lastMessageAt),
  }),
);

export const householdRecipePickerMessages = sqliteTable(
  "household_recipe_picker_messages",
  {
    messageId: generatedId("message_id"),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => householdRecipePickerConversations.conversationId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    role: text("role").notNull(),
    position: integer("position").notNull(),
    bodyText: text("body_text").notNull(),
    intent: text("intent"),
    inlineRecipeRefsJson: text("inline_recipe_refs_json"),
    recipeSnapshotJson: text("recipe_snapshot_json"),
    pinnedRecipeIdsJson: text("pinned_recipe_ids_json").notNull(),
    activeRecipeId: text("active_recipe_id"),
    suggestedPromptsJson: text("suggested_prompts_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    conversationPositionUniqueIdx: uniqueIndex("idx_household_recipe_picker_messages_conversation_position_unique").on(
      table.conversationId,
      table.position,
    ),
    householdConversationIdx: index("idx_household_recipe_picker_messages_household_conversation").on(table.householdId, table.conversationId),
    conversationCreatedAtIdx: index("idx_household_recipe_picker_messages_conversation_created_at").on(table.conversationId, table.createdAt),
  }),
);

export const householdRecipes = sqliteTable(
  "household_recipes",
  {
    recipeId: generatedId("recipe_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinId: text("pin_id")
      .notNull()
      .references(() => householdPins.pinId),
    title: text("title"),
    description: text("description"),
    imageUrl: text("image_url"),
    titleOverridden: integer("title_overridden", { mode: "boolean" }).notNull().default(false),
    descriptionOverridden: integer("description_overridden", { mode: "boolean" }).notNull().default(false),
    imageUrlOverridden: integer("image_url_overridden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pinIdUniqueIdx: uniqueIndex("idx_household_recipes_pin_id_unique").on(table.pinId),
    householdIdx: index("idx_household_recipes_household_id").on(table.householdId),
    householdUpdatedIdx: index("idx_household_recipes_household_updated").on(table.householdId, table.updatedAt),
  }),
);

export const recipeFolders = sqliteTable(
  "recipe_folders",
  {
    folderId: generatedId("folder_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    parentFolderId: text("parent_folder_id").references((): AnySQLiteColumn => recipeFolders.folderId),
    source: text("source").notNull(),
    sourceType: text("source_type").notNull(),
    pinterestBoardId: text("pinterest_board_id").notNull(),
    pinterestSectionId: text("pinterest_section_id"),
    name: text("name"),
    rawJson: text("raw_json").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdIdx: index("idx_recipe_folders_household_id").on(table.householdId),
    parentFolderIdx: index("idx_recipe_folders_parent_folder_id").on(table.parentFolderId),
    householdBoardUniqueIdx: uniqueIndex("idx_recipe_folders_household_source_board_unique").on(
      table.householdId,
      table.source,
      table.sourceType,
      table.pinterestBoardId,
    ),
    householdSectionUniqueIdx: uniqueIndex("idx_recipe_folders_household_source_section_unique").on(
      table.householdId,
      table.source,
      table.sourceType,
      table.pinterestSectionId,
    ),
  }),
);

export const recipeFolderMemberships = sqliteTable(
  "recipe_folder_memberships",
  {
    membershipId: generatedId("membership_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    folderId: text("folder_id")
      .notNull()
      .references(() => recipeFolders.folderId),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    folderIdIdx: index("idx_recipe_folder_memberships_folder_id").on(table.folderId),
    householdRecipeSourceUniqueIdx: uniqueIndex("idx_recipe_folder_memberships_household_recipe_source_unique").on(
      table.householdId,
      table.recipeId,
      table.source,
    ),
  }),
);

export const householdRecipeSources = sqliteTable(
  "household_recipe_sources",
  {
    sourceId: generatedId("source_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinId: text("pin_id")
      .notNull()
      .references(() => householdPins.pinId),
    originalUrl: text("original_url").notNull(),
    finalUrl: text("final_url"),
    fetchStatus: text("fetch_status").notNull(),
    contentType: text("content_type"),
    pagePreviewDataUrl: text("page_preview_data_url"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => ({
    pinIdIdx: index("idx_household_recipe_sources_pin_id").on(table.pinId),
    pinFetchedIdx: index("idx_household_recipe_sources_pin_fetched").on(table.pinId, table.fetchedAt),
    fetchedAtIdx: index("idx_household_recipe_sources_fetched_at").on(table.fetchedAt),
  }),
);

export const householdRecipeInstructions = sqliteTable(
  "household_recipe_instructions",
  {
    recipeId: text("recipe_id")
      .primaryKey()
      .references(() => householdRecipes.recipeId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    sourceId: text("source_id").references(() => householdRecipeSources.sourceId),
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
    sourceIdIdx: index("idx_household_recipe_instructions_source_id").on(table.sourceId),
  }),
);

export const householdRecipeExtractions = sqliteTable(
  "household_recipe_extractions",
  {
    extractionId: generatedId("extraction_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinId: text("pin_id")
      .notNull()
      .references(() => householdPins.pinId),
    sourceId: text("source_id").references(() => householdRecipeSources.sourceId),
    status: text("status").notNull(),
    method: text("method"),
    fetchStrategy: text("fetch_strategy"),
    contentVariant: text("content_variant"),
    extractionStrategy: text("extraction_strategy"),
    qualityScore: integer("quality_score"),
    confidence: text("confidence"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    lowConfidence: integer("low_confidence", { mode: "boolean" }).notNull().default(false),
    failureReason: text("failure_reason"),
    warningsJson: text("warnings_json"),
    qualitySignalsJson: text("quality_signals_json"),
    candidateCount: integer("candidate_count").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    pinIdIdx: index("idx_household_recipe_extractions_pin_id").on(table.pinId),
    pinCreatedIdx: index("idx_household_recipe_extractions_pin_created").on(table.pinId, table.createdAt),
    statusIdx: index("idx_household_recipe_extractions_status").on(table.status),
    createdAtIdx: index("idx_household_recipe_extractions_created_at").on(table.createdAt),
  }),
);

export const householdRecipeParseJobs = sqliteTable(
  "household_recipe_parse_jobs",
  {
    jobId: generatedId("job_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    status: text("status").notNull(),
    requestedByClerkUserId: text("requested_by_clerk_user_id").notNull(),
    mode: text("mode").notNull(),
    rerun: integer("rerun", { mode: "boolean" }).notNull().default(true),
    filtersJson: text("filters_json"),
    recipeIdsJson: text("recipe_ids_json").notNull(),
    totalRecipes: integer("total_recipes").notNull().default(0),
    processedRecipes: integer("processed_recipes").notNull().default(0),
    succeededRecipes: integer("succeeded_recipes").notNull().default(0),
    reviewNeededRecipes: integer("review_needed_recipes").notNull().default(0),
    failedRecipes: integer("failed_recipes").notNull().default(0),
    cancelRequestedAt: text("cancel_requested_at"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    lastHeartbeatAt: text("last_heartbeat_at"),
    lastError: text("last_error"),
    workerToken: text("worker_token").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdCreatedIdx: index("idx_household_recipe_parse_jobs_household_created").on(table.householdId, table.createdAt),
    householdStatusIdx: index("idx_household_recipe_parse_jobs_household_status").on(table.householdId, table.status),
    householdStatusCreatedIdx: index("idx_household_recipe_parse_jobs_household_status_created").on(
      table.householdId,
      table.status,
      table.createdAt,
    ),
    householdCompletedIdx: index("idx_household_recipe_parse_jobs_household_completed").on(table.householdId, table.completedAt),
  }),
);

export const householdRecipeParseJobItems = sqliteTable(
  "household_recipe_parse_job_items",
  {
    jobItemId: generatedId("job_item_id"),
    jobId: text("job_id")
      .notNull()
      .references(() => householdRecipeParseJobs.jobId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    position: integer("position").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    lastError: text("last_error"),
    lastExtractionId: text("last_extraction_id").references(() => householdRecipeExtractions.extractionId),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    jobPositionUniqueIdx: uniqueIndex("idx_household_recipe_parse_job_items_job_position_unique").on(table.jobId, table.position),
    jobRecipeUniqueIdx: uniqueIndex("idx_household_recipe_parse_job_items_job_recipe_unique").on(table.jobId, table.recipeId),
    jobStatusIdx: index("idx_household_recipe_parse_job_items_job_status").on(table.jobId, table.status),
    jobStatusPositionIdx: index("idx_household_recipe_parse_job_items_job_status_position").on(
      table.jobId,
      table.status,
      table.position,
    ),
    jobStatusUpdatedIdx: index("idx_household_recipe_parse_job_items_job_status_updated").on(
      table.jobId,
      table.status,
      table.updatedAt,
    ),
    recipeIdx: index("idx_household_recipe_parse_job_items_recipe_id").on(table.recipeId),
  }),
);

export const householdRecipeExtractionFeedback = sqliteTable(
  "household_recipe_extraction_feedback",
  {
    feedbackId: generatedId("feedback_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipes.recipeId),
    extractionId: text("extraction_id").references(() => householdRecipeExtractions.extractionId),
    category: text("category").notNull(),
    note: text("note").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    recipeIdx: index("idx_household_recipe_extraction_feedback_recipe_id").on(table.recipeId),
    extractionIdx: index("idx_household_recipe_extraction_feedback_extraction_id").on(table.extractionId),
    householdRecipeIdx: index("idx_household_recipe_extraction_feedback_household_recipe").on(table.householdId, table.recipeId),
  }),
);

export const householdRecipeExtractionAttempts = sqliteTable(
  "household_recipe_extraction_attempts",
  {
    attemptId: generatedId("attempt_id"),
    extractionId: text("extraction_id")
      .notNull()
      .references(() => householdRecipeExtractions.extractionId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    pinId: text("pin_id")
      .notNull()
      .references(() => householdPins.pinId),
    sourceId: text("source_id").references(() => householdRecipeSources.sourceId),
    status: text("status").notNull(),
    method: text("method"),
    fetchStrategy: text("fetch_strategy").notNull(),
    contentVariant: text("content_variant"),
    extractionStrategy: text("extraction_strategy"),
    qualityScore: integer("quality_score"),
    confidence: text("confidence"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    failureReason: text("failure_reason"),
    warningsJson: text("warnings_json"),
    qualitySignalsJson: text("quality_signals_json"),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    extractionIdIdx: index("idx_household_recipe_extraction_attempts_extraction_id").on(table.extractionId),
    pinIdIdx: index("idx_household_recipe_extraction_attempts_pin_id").on(table.pinId),
    selectedIdx: index("idx_household_recipe_extraction_attempts_selected").on(table.selected),
    createdAtIdx: index("idx_household_recipe_extraction_attempts_created_at").on(table.createdAt),
  }),
);

export const householdRecipeSteps = sqliteTable(
  "household_recipe_steps",
  {
    stepId: generatedId("step_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipeInstructions.recipeId),
    position: integer("position").notNull(),
    section: text("section"),
    rawText: text("raw_text").notNull(),
    text: text("text").notNull(),
  },
  (table) => ({
    recipeIdIdx: index("idx_household_recipe_steps_instruction_id").on(table.recipeId),
    recipePositionIdx: index("idx_household_recipe_steps_instruction_position").on(table.recipeId, table.position),
  }),
);

export const householdRecipeIngredients = sqliteTable(
  "household_recipe_ingredients",
  {
    ingredientId: generatedId("ingredient_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => householdRecipeInstructions.recipeId),
    position: integer("position").notNull(),
    originalText: text("original_text").notNull(),
    amountText: text("amount_text"),
    amountValue: real("amount_value"),
    amountMaxValue: real("amount_max_value"),
    unit: text("unit"),
    ingredientText: text("ingredient_text"),
    notes: text("notes"),
    normalizedIngredientPhrase: text("normalized_ingredient_phrase"),
    canonicalIngredientId: text("canonical_ingredient_id").references(() => householdCanonicalIngredients.canonicalIngredientId),
    attributesJson: text("attributes_json"),
    matchConfidence: integer("match_confidence"),
    matchedBy: text("matched_by"),
    aiSuggestionsJson: text("ai_suggestions_json"),
    normalizationStatus: text("normalization_status").notNull(),
  },
  (table) => ({
    recipeIdIdx: index("idx_household_recipe_ingredients_instruction_id").on(table.recipeId),
    recipePositionIdx: index("idx_household_recipe_ingredients_instruction_position").on(table.recipeId, table.position),
    normalizationStatusIdx: index("idx_household_recipe_ingredients_normalization_status").on(table.normalizationStatus),
    householdNormalizationRecipePositionIdx: index("idx_household_recipe_ingredients_household_normalization_recipe_position").on(
      table.householdId,
      table.normalizationStatus,
      table.recipeId,
      table.position,
    ),
    canonicalIngredientIdx: index("idx_household_recipe_ingredients_canonical_ingredient_id").on(table.canonicalIngredientId),
  }),
);

export const householdCanonicalIngredients = sqliteTable(
  "household_canonical_ingredients",
  {
    canonicalIngredientId: generatedId("canonical_ingredient_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    displayName: text("display_name").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    parentCanonicalIngredientId: text("parent_canonical_ingredient_id").references(
      (): AnySQLiteColumn => householdCanonicalIngredients.canonicalIngredientId,
    ),
    ingredientKind: text("ingredient_kind").notNull().default("leaf"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdKeyUniqueIdx: uniqueIndex("idx_household_canonical_ingredients_household_key_unique").on(
      table.householdId,
      table.normalizedKey,
    ),
    householdIdx: index("idx_household_canonical_ingredients_household_id").on(table.householdId),
    parentCanonicalIngredientIdx: index("idx_household_canonical_ingredients_parent_canonical_ingredient_id").on(
      table.parentCanonicalIngredientId,
    ),
  }),
);

export const householdIngredientAliases = sqliteTable(
  "household_ingredient_aliases",
  {
    aliasId: generatedId("alias_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    aliasText: text("alias_text").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    canonicalIngredientId: text("canonical_ingredient_id")
      .notNull()
      .references(() => householdCanonicalIngredients.canonicalIngredientId),
    aliasType: text("alias_type").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdAliasUniqueIdx: uniqueIndex("idx_household_ingredient_aliases_household_alias_unique").on(
      table.householdId,
      table.normalizedAlias,
    ),
    canonicalIngredientIdx: index("idx_household_ingredient_aliases_canonical_ingredient_id").on(table.canonicalIngredientId),
  }),
);

export const householdIngredientPhraseMappings = sqliteTable(
  "household_ingredient_phrase_mappings",
  {
    mappingId: generatedId("mapping_id"),
    householdId: text("household_id")
      .notNull()
      .references(() => households.householdId),
    normalizedPhrase: text("normalized_phrase").notNull(),
    canonicalIngredientId: text("canonical_ingredient_id").references(() => householdCanonicalIngredients.canonicalIngredientId),
    attributesJson: text("attributes_json"),
    matchConfidence: integer("match_confidence"),
    normalizationStatus: text("normalization_status").notNull(),
    matchSource: text("match_source"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    householdPhraseUniqueIdx: uniqueIndex("idx_household_ingredient_phrase_mappings_household_phrase_unique").on(
      table.householdId,
      table.normalizedPhrase,
    ),
    canonicalIngredientIdx: index("idx_household_ingredient_phrase_mappings_canonical_ingredient_id").on(table.canonicalIngredientId),
    statusIdx: index("idx_household_ingredient_phrase_mappings_status").on(table.normalizationStatus),
  }),
);

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  invites: many(householdInvites),
  pinterestAccounts: many(pinterestAccounts),
  aiConnections: many(householdAiConnections),
  boards: many(householdBoards),
  recipePickerConversations: many(householdRecipePickerConversations),
  recipePickerMessages: many(householdRecipePickerMessages),
  recipeFeedback: many(householdRecipeFeedback),
  extractionFeedback: many(householdRecipeExtractionFeedback),
  canonicalIngredients: many(householdCanonicalIngredients),
  ingredientAliases: many(householdIngredientAliases),
  ingredientPhraseMappings: many(householdIngredientPhraseMappings),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.householdId],
  }),
}));

export const householdInvitesRelations = relations(householdInvites, ({ one }) => ({
  household: one(households, {
    fields: [householdInvites.householdId],
    references: [households.householdId],
  }),
}));

export const pinterestAccountsRelations = relations(pinterestAccounts, ({ one }) => ({
  household: one(households, {
    fields: [pinterestAccounts.householdId],
    references: [households.householdId],
  }),
}));

export const householdAiConnectionsRelations = relations(householdAiConnections, ({ one }) => ({
  household: one(households, {
    fields: [householdAiConnections.householdId],
    references: [households.householdId],
  }),
}));

export const boardSyncSubscriptionsRelations = relations(boardSyncSubscriptions, ({ one }) => ({
  household: one(households, {
    fields: [boardSyncSubscriptions.householdId],
    references: [households.householdId],
  }),
}));

export const householdBoardsRelations = relations(householdBoards, ({ one, many }) => ({
  household: one(households, {
    fields: [householdBoards.householdId],
    references: [households.householdId],
  }),
  pins: many(householdPins),
}));

export const householdPinsRelations = relations(householdPins, ({ one, many }) => ({
  household: one(households, {
    fields: [householdPins.householdId],
    references: [households.householdId],
  }),
  board: one(householdBoards, {
    fields: [householdPins.boardId],
    references: [householdBoards.boardId],
  }),
  recipe: one(householdRecipes),
  recipeSources: many(householdRecipeSources),
  recipeExtractions: many(householdRecipeExtractions),
}));

export const householdRecipesRelations = relations(householdRecipes, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipes.householdId],
    references: [households.householdId],
  }),
  pin: one(householdPins, {
    fields: [householdRecipes.pinId],
    references: [householdPins.pinId],
  }),
  recipeInstructions: one(householdRecipeInstructions, {
    fields: [householdRecipes.recipeId],
    references: [householdRecipeInstructions.recipeId],
  }),
  events: many(householdRecipeEvents),
  reviews: many(householdRecipeReviews),
  feedback: one(householdRecipeFeedback, {
    fields: [householdRecipes.recipeId],
    references: [householdRecipeFeedback.recipeId],
  }),
  extractionFeedback: many(householdRecipeExtractionFeedback),
  folderMemberships: many(recipeFolderMemberships),
}));

export const recipeFoldersRelations = relations(recipeFolders, ({ one, many }) => ({
  household: one(households, {
    fields: [recipeFolders.householdId],
    references: [households.householdId],
  }),
  parentFolder: one(recipeFolders, {
    fields: [recipeFolders.parentFolderId],
    references: [recipeFolders.folderId],
    relationName: "recipe_folder_parent",
  }),
  childFolders: many(recipeFolders, {
    relationName: "recipe_folder_parent",
  }),
  memberships: many(recipeFolderMemberships),
}));

export const recipeFolderMembershipsRelations = relations(recipeFolderMemberships, ({ one }) => ({
  household: one(households, {
    fields: [recipeFolderMemberships.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [recipeFolderMemberships.recipeId],
    references: [householdRecipes.recipeId],
  }),
  folder: one(recipeFolders, {
    fields: [recipeFolderMemberships.folderId],
    references: [recipeFolders.folderId],
  }),
}));

export const householdRecipeEventsRelations = relations(householdRecipeEvents, ({ one }) => ({
  household: one(households, {
    fields: [householdRecipeEvents.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeEvents.recipeId],
    references: [householdRecipes.recipeId],
  }),
  review: one(householdRecipeReviews, {
    fields: [householdRecipeEvents.eventId],
    references: [householdRecipeReviews.eventId],
  }),
}));

export const householdRecipeReviewsRelations = relations(householdRecipeReviews, ({ one }) => ({
  household: one(households, {
    fields: [householdRecipeReviews.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeReviews.recipeId],
    references: [householdRecipes.recipeId],
  }),
  event: one(householdRecipeEvents, {
    fields: [householdRecipeReviews.eventId],
    references: [householdRecipeEvents.eventId],
  }),
}));

export const householdRecipeFeedbackRelations = relations(householdRecipeFeedback, ({ one }) => ({
  household: one(households, {
    fields: [householdRecipeFeedback.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeFeedback.recipeId],
    references: [householdRecipes.recipeId],
  }),
}));

export const householdRecipePickerConversationsRelations = relations(householdRecipePickerConversations, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipePickerConversations.householdId],
    references: [households.householdId],
  }),
  messages: many(householdRecipePickerMessages),
}));

export const householdRecipePickerMessagesRelations = relations(householdRecipePickerMessages, ({ one }) => ({
  household: one(households, {
    fields: [householdRecipePickerMessages.householdId],
    references: [households.householdId],
  }),
  conversation: one(householdRecipePickerConversations, {
    fields: [householdRecipePickerMessages.conversationId],
    references: [householdRecipePickerConversations.conversationId],
  }),
}));

export const householdRecipeSourcesRelations = relations(householdRecipeSources, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipeSources.householdId],
    references: [households.householdId],
  }),
  pin: one(householdPins, {
    fields: [householdRecipeSources.pinId],
    references: [householdPins.pinId],
  }),
  recipeInstructions: many(householdRecipeInstructions),
  recipeExtractions: many(householdRecipeExtractions),
  recipeExtractionAttempts: many(householdRecipeExtractionAttempts),
}));

export const householdRecipeInstructionsRelations = relations(householdRecipeInstructions, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipeInstructions.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeInstructions.recipeId],
    references: [householdRecipes.recipeId],
  }),
  source: one(householdRecipeSources, {
    fields: [householdRecipeInstructions.sourceId],
    references: [householdRecipeSources.sourceId],
  }),
  steps: many(householdRecipeSteps),
  ingredients: many(householdRecipeIngredients),
}));

export const householdRecipeExtractionsRelations = relations(householdRecipeExtractions, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipeExtractions.householdId],
    references: [households.householdId],
  }),
  pin: one(householdPins, {
    fields: [householdRecipeExtractions.pinId],
    references: [householdPins.pinId],
  }),
  source: one(householdRecipeSources, {
    fields: [householdRecipeExtractions.sourceId],
    references: [householdRecipeSources.sourceId],
  }),
  attempts: many(householdRecipeExtractionAttempts),
  feedback: many(householdRecipeExtractionFeedback),
  parseJobItems: many(householdRecipeParseJobItems),
}));

export const householdRecipeParseJobsRelations = relations(householdRecipeParseJobs, ({ one, many }) => ({
  household: one(households, {
    fields: [householdRecipeParseJobs.householdId],
    references: [households.householdId],
  }),
  items: many(householdRecipeParseJobItems),
}));

export const householdRecipeParseJobItemsRelations = relations(householdRecipeParseJobItems, ({ one }) => ({
  job: one(householdRecipeParseJobs, {
    fields: [householdRecipeParseJobItems.jobId],
    references: [householdRecipeParseJobs.jobId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeParseJobItems.recipeId],
    references: [householdRecipes.recipeId],
  }),
  extraction: one(householdRecipeExtractions, {
    fields: [householdRecipeParseJobItems.lastExtractionId],
    references: [householdRecipeExtractions.extractionId],
  }),
}));

export const householdRecipeExtractionFeedbackRelations = relations(householdRecipeExtractionFeedback, ({ one }) => ({
  household: one(households, {
    fields: [householdRecipeExtractionFeedback.householdId],
    references: [households.householdId],
  }),
  recipe: one(householdRecipes, {
    fields: [householdRecipeExtractionFeedback.recipeId],
    references: [householdRecipes.recipeId],
  }),
  extraction: one(householdRecipeExtractions, {
    fields: [householdRecipeExtractionFeedback.extractionId],
    references: [householdRecipeExtractions.extractionId],
  }),
}));

export const householdRecipeExtractionAttemptsRelations = relations(householdRecipeExtractionAttempts, ({ one }) => ({
  extraction: one(householdRecipeExtractions, {
    fields: [householdRecipeExtractionAttempts.extractionId],
    references: [householdRecipeExtractions.extractionId],
  }),
  household: one(households, {
    fields: [householdRecipeExtractionAttempts.householdId],
    references: [households.householdId],
  }),
  pin: one(householdPins, {
    fields: [householdRecipeExtractionAttempts.pinId],
    references: [householdPins.pinId],
  }),
  source: one(householdRecipeSources, {
    fields: [householdRecipeExtractionAttempts.sourceId],
    references: [householdRecipeSources.sourceId],
  }),
}));

export const householdRecipeStepsRelations = relations(householdRecipeSteps, ({ one }) => ({
  recipeInstructions: one(householdRecipeInstructions, {
    fields: [householdRecipeSteps.recipeId],
    references: [householdRecipeInstructions.recipeId],
  }),
}));

export const householdRecipeIngredientsRelations = relations(householdRecipeIngredients, ({ one }) => ({
  recipeInstructions: one(householdRecipeInstructions, {
    fields: [householdRecipeIngredients.recipeId],
    references: [householdRecipeInstructions.recipeId],
  }),
  canonicalIngredient: one(householdCanonicalIngredients, {
    fields: [householdRecipeIngredients.canonicalIngredientId],
    references: [householdCanonicalIngredients.canonicalIngredientId],
  }),
}));

export const householdCanonicalIngredientsRelations = relations(householdCanonicalIngredients, ({ one, many }) => ({
  household: one(households, {
    fields: [householdCanonicalIngredients.householdId],
    references: [households.householdId],
  }),
  parentCanonicalIngredient: one(householdCanonicalIngredients, {
    fields: [householdCanonicalIngredients.parentCanonicalIngredientId],
    references: [householdCanonicalIngredients.canonicalIngredientId],
    relationName: "ingredient_hierarchy",
  }),
  childCanonicalIngredients: many(householdCanonicalIngredients, {
    relationName: "ingredient_hierarchy",
  }),
  aliases: many(householdIngredientAliases),
  phraseMappings: many(householdIngredientPhraseMappings),
  recipeIngredients: many(householdRecipeIngredients),
}));

export const householdIngredientAliasesRelations = relations(householdIngredientAliases, ({ one }) => ({
  household: one(households, {
    fields: [householdIngredientAliases.householdId],
    references: [households.householdId],
  }),
  canonicalIngredient: one(householdCanonicalIngredients, {
    fields: [householdIngredientAliases.canonicalIngredientId],
    references: [householdCanonicalIngredients.canonicalIngredientId],
  }),
}));

export const householdIngredientPhraseMappingsRelations = relations(householdIngredientPhraseMappings, ({ one }) => ({
  household: one(households, {
    fields: [householdIngredientPhraseMappings.householdId],
    references: [households.householdId],
  }),
  canonicalIngredient: one(householdCanonicalIngredients, {
    fields: [householdIngredientPhraseMappings.canonicalIngredientId],
    references: [householdCanonicalIngredients.canonicalIngredientId],
  }),
}));
