CREATE TABLE `recipe_folders` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`parent_folder_id` text,
	`source` text NOT NULL,
	`source_type` text NOT NULL,
	`pinterest_board_id` text NOT NULL,
	`pinterest_section_id` text,
	`name` text,
	`raw_json` text NOT NULL,
	`last_synced_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_folder_id`) REFERENCES `recipe_folders`(`folder_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_folders_household_id` ON `recipe_folders` (`household_id`);
--> statement-breakpoint
CREATE INDEX `idx_recipe_folders_parent_folder_id` ON `recipe_folders` (`parent_folder_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_folders_household_source_board_unique` ON `recipe_folders` (`household_id`,`source`,`source_type`,`pinterest_board_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_folders_household_source_section_unique` ON `recipe_folders` (`household_id`,`source`,`source_type`,`pinterest_section_id`);
--> statement-breakpoint
CREATE TABLE `recipe_folder_memberships` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`) REFERENCES `recipe_folders`(`folder_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_folder_memberships_folder_id` ON `recipe_folder_memberships` (`folder_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_folder_memberships_household_recipe_source_unique` ON `recipe_folder_memberships` (`household_id`,`recipe_id`,`source`);
