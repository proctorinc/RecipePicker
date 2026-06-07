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
CREATE INDEX `idx_household_recipe_picker_conversations_household_updated` ON `household_recipe_picker_conversations` (`household_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_conversations_household_last_message` ON `household_recipe_picker_conversations` (`household_id`,`last_message_at`);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_household_recipe_picker_messages_conversation_position_unique` ON `household_recipe_picker_messages` (`conversation_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_messages_household_conversation` ON `household_recipe_picker_messages` (`household_id`,`conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_picker_messages_conversation_created_at` ON `household_recipe_picker_messages` (`conversation_id`,`created_at`);
