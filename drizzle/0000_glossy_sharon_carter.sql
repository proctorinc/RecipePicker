CREATE TABLE `board_sync_subscriptions` (
	`subscription_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pinterest_board_id` text NOT NULL,
	`board_name` text,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_board_sync_subscriptions_household_board_unique` ON `board_sync_subscriptions` (`household_id`,`pinterest_board_id`);--> statement-breakpoint
CREATE TABLE `household_ai_connections` (
	`ai_connection_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`connected_by_clerk_user_id` text NOT NULL,
	`connection_status` text DEFAULT 'active' NOT NULL,
	`last_tested_at` text,
	`last_test_status` text,
	`last_test_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_ai_connections_household_unique` ON `household_ai_connections` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_household_ai_connections_provider` ON `household_ai_connections` (`provider`);--> statement-breakpoint
CREATE TABLE `household_boards` (
	`board_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pinterest_board_id` text NOT NULL,
	`name` text,
	`description` text,
	`privacy` text,
	`owner_json` text,
	`raw_json` text NOT NULL,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`last_synced_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_boards_household_board_unique` ON `household_boards` (`household_id`,`pinterest_board_id`);--> statement-breakpoint
CREATE INDEX `idx_household_boards_household_id` ON `household_boards` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_canonical_ingredients` (
	`canonical_ingredient_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`parent_canonical_ingredient_id` text,
	`ingredient_kind` text DEFAULT 'leaf' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_canonical_ingredients_household_key_unique` ON `household_canonical_ingredients` (`household_id`,`normalized_key`);--> statement-breakpoint
CREATE INDEX `idx_household_canonical_ingredients_household_id` ON `household_canonical_ingredients` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_household_canonical_ingredients_parent_canonical_ingredient_id` ON `household_canonical_ingredients` (`parent_canonical_ingredient_id`);--> statement-breakpoint
CREATE TABLE `household_ingredient_aliases` (
	`alias_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`alias_text` text NOT NULL,
	`normalized_alias` text NOT NULL,
	`canonical_ingredient_id` text NOT NULL,
	`alias_type` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_ingredient_aliases_household_alias_unique` ON `household_ingredient_aliases` (`household_id`,`normalized_alias`);--> statement-breakpoint
CREATE INDEX `idx_household_ingredient_aliases_canonical_ingredient_id` ON `household_ingredient_aliases` (`canonical_ingredient_id`);--> statement-breakpoint
CREATE TABLE `household_ingredient_phrase_mappings` (
	`mapping_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`normalized_phrase` text NOT NULL,
	`canonical_ingredient_id` text,
	`attributes_json` text,
	`match_confidence` integer,
	`normalization_status` text NOT NULL,
	`match_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_ingredient_phrase_mappings_household_phrase_unique` ON `household_ingredient_phrase_mappings` (`household_id`,`normalized_phrase`);--> statement-breakpoint
CREATE INDEX `idx_household_ingredient_phrase_mappings_canonical_ingredient_id` ON `household_ingredient_phrase_mappings` (`canonical_ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_household_ingredient_phrase_mappings_status` ON `household_ingredient_phrase_mappings` (`normalization_status`);--> statement-breakpoint
CREATE TABLE `household_invites` (
	`invite_token` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_clerk_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_by_clerk_user_id` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_invites_household_id` ON `household_invites` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_members_household_user_unique` ON `household_members` (`household_id`,`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `idx_household_members_clerk_user_id` ON `household_members` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `household_pins` (
	`pin_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pinterest_pin_id` text NOT NULL,
	`board_id` text NOT NULL,
	`pinterest_board_id` text NOT NULL,
	`board_section_id` text,
	`title` text,
	`description` text,
	`link` text,
	`alt_text` text,
	`dominant_color` text,
	`note` text,
	`created_at` text,
	`parent_pin_id` text,
	`media_json` text,
	`media_source_json` text,
	`creator_json` text,
	`board_owner_json` text,
	`raw_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `household_boards`(`board_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_pins_household_pin_unique` ON `household_pins` (`household_id`,`pinterest_pin_id`);--> statement-breakpoint
CREATE INDEX `idx_household_pins_board_id` ON `household_pins` (`board_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_extraction_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`extraction_id` text NOT NULL,
	`household_id` text NOT NULL,
	`pin_id` text NOT NULL,
	`source_id` text,
	`status` text NOT NULL,
	`method` text,
	`fetch_strategy` text NOT NULL,
	`content_variant` text,
	`extraction_strategy` text,
	`quality_score` integer,
	`confidence` text,
	`selected` integer DEFAULT false NOT NULL,
	`failure_reason` text,
	`warnings_json` text,
	`quality_signals_json` text,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`extraction_id`) REFERENCES `household_recipe_extractions`(`extraction_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pin_id`) REFERENCES `household_pins`(`pin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `household_recipe_sources`(`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_attempts_extraction_id` ON `household_recipe_extraction_attempts` (`extraction_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_attempts_pin_id` ON `household_recipe_extraction_attempts` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_attempts_selected` ON `household_recipe_extraction_attempts` (`selected`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_attempts_created_at` ON `household_recipe_extraction_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `household_recipe_extraction_feedback` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`extraction_id` text,
	`category` text NOT NULL,
	`note` text NOT NULL,
	`created_by_clerk_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `household_recipe_extractions`(`extraction_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_feedback_recipe_id` ON `household_recipe_extraction_feedback` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_feedback_extraction_id` ON `household_recipe_extraction_feedback` (`extraction_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extraction_feedback_household_recipe` ON `household_recipe_extraction_feedback` (`household_id`,`recipe_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_extractions` (
	`extraction_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pin_id` text NOT NULL,
	`source_id` text,
	`status` text NOT NULL,
	`method` text,
	`fetch_strategy` text,
	`content_variant` text,
	`extraction_strategy` text,
	`quality_score` integer,
	`confidence` text,
	`selected` integer DEFAULT false NOT NULL,
	`low_confidence` integer DEFAULT false NOT NULL,
	`failure_reason` text,
	`warnings_json` text,
	`quality_signals_json` text,
	`candidate_count` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pin_id`) REFERENCES `household_pins`(`pin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `household_recipe_sources`(`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extractions_pin_id` ON `household_recipe_extractions` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extractions_status` ON `household_recipe_extractions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extractions_created_at` ON `household_recipe_extractions` (`created_at`);--> statement-breakpoint
CREATE TABLE `household_recipe_feedback` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`summary` text,
	`note` text,
	`created_by_clerk_user_id` text,
	`updated_by_clerk_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_feedback_recipe_unique` ON `household_recipe_feedback` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_feedback_household_recipe` ON `household_recipe_feedback` (`household_id`,`recipe_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_ingredients` (
	`ingredient_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`original_text` text NOT NULL,
	`amount_text` text,
	`amount_value` real,
	`amount_max_value` real,
	`unit` text,
	`ingredient_text` text,
	`notes` text,
	`normalized_ingredient_phrase` text,
	`canonical_ingredient_id` text,
	`attributes_json` text,
	`match_confidence` integer,
	`matched_by` text,
	`ai_suggestions_json` text,
	`normalization_status` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipe_instructions`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_instruction_id` ON `household_recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_instruction_position` ON `household_recipe_ingredients` (`recipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_normalization_status` ON `household_recipe_ingredients` (`normalization_status`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_canonical_ingredient_id` ON `household_recipe_ingredients` (`canonical_ingredient_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_instructions` (
	`recipe_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text,
	`title` text,
	`description` text,
	`author` text,
	`canonical_url` text,
	`site_name` text,
	`image_url` text,
	`yield_text` text,
	`prep_time` text,
	`cook_time` text,
	`total_time` text,
	`categories_json` text,
	`cuisine` text,
	`keywords_json` text,
	`nutrition_json` text,
	`raw_recipe_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `household_recipe_sources`(`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_instructions_source_id` ON `household_recipe_instructions` (`source_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_picker_conversations` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_clerk_user_id` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_message_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_conversations_household_updated` ON `household_recipe_picker_conversations` (`household_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_conversations_household_last_message` ON `household_recipe_picker_conversations` (`household_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `household_recipe_picker_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`household_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	`body_text` text NOT NULL,
	`intent` text,
	`inline_recipe_refs_json` text,
	`recipe_snapshot_json` text,
	`pinned_recipe_ids_json` text NOT NULL,
	`active_recipe_id` text,
	`suggested_prompts_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `household_recipe_picker_conversations`(`conversation_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_picker_messages_conversation_position_unique` ON `household_recipe_picker_messages` (`conversation_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_messages_household_conversation` ON `household_recipe_picker_messages` (`household_id`,`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_messages_conversation_created_at` ON `household_recipe_picker_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `household_recipe_reviews` (
	`review_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`reviewed_by_clerk_user_id` text,
	`rating_value` real NOT NULL,
	`eaten_on` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_recipe_id` ON `household_recipe_reviews` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_eaten_on` ON `household_recipe_reviews` (`eaten_on`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_reviewer` ON `household_recipe_reviews` (`reviewed_by_clerk_user_id`);--> statement-breakpoint
CREATE TABLE `household_recipe_sources` (
	`source_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pin_id` text NOT NULL,
	`original_url` text NOT NULL,
	`final_url` text,
	`fetch_status` text NOT NULL,
	`content_type` text,
	`page_preview_data_url` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pin_id`) REFERENCES `household_pins`(`pin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_sources_pin_id` ON `household_recipe_sources` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_sources_fetched_at` ON `household_recipe_sources` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `household_recipe_steps` (
	`step_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`section` text,
	`raw_text` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipe_instructions`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_steps_instruction_id` ON `household_recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_steps_instruction_position` ON `household_recipe_steps` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `household_recipes` (
	`recipe_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pin_id` text NOT NULL,
	`title` text,
	`description` text,
	`image_url` text,
	`title_overridden` integer DEFAULT false NOT NULL,
	`description_overridden` integer DEFAULT false NOT NULL,
	`image_url_overridden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pin_id`) REFERENCES `household_pins`(`pin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipes_pin_id_unique` ON `household_recipes` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipes_household_id` ON `household_recipes` (`household_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`household_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`household_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`return_to` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_household_provider` ON `oauth_states` (`household_id`,`provider`);--> statement-breakpoint
CREATE TABLE `pinterest_accounts` (
	`pinterest_account_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`provider` text DEFAULT 'pinterest' NOT NULL,
	`connected_by_clerk_user_id` text NOT NULL,
	`pinterest_user_id` text,
	`account_label` text,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text,
	`scope` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`last_refresh_attempt_at` text,
	`last_refresh_succeeded_at` text,
	`last_sync_at` text,
	`last_sync_status` text,
	`last_sync_error` text,
	`connection_status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pinterest_accounts_household_provider_unique` ON `pinterest_accounts` (`household_id`,`provider`);--> statement-breakpoint
CREATE TABLE `user_access_tiers` (
	`clerk_user_id` text PRIMARY KEY NOT NULL,
	`subscription_tier` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
