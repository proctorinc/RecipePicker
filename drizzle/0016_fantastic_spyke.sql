CREATE TABLE `pinterest_sync_recipe_changes` (
	`sync_recipe_change_id` text PRIMARY KEY NOT NULL,
	`sync_run_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`change_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sync_run_id`) REFERENCES `pinterest_sync_runs`(`sync_run_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pinterest_sync_recipe_changes_run` ON `pinterest_sync_recipe_changes` (`sync_run_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pinterest_sync_recipe_changes_run_recipe_unique` ON `pinterest_sync_recipe_changes` (`sync_run_id`,`recipe_id`);--> statement-breakpoint
CREATE TABLE `pinterest_sync_runs` (
	`sync_run_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`board_count` integer DEFAULT 0 NOT NULL,
	`pin_count` integer DEFAULT 0 NOT NULL,
	`created_recipe_count` integer DEFAULT 0 NOT NULL,
	`removed_recipe_count` integer DEFAULT 0 NOT NULL,
	`restored_recipe_count` integer DEFAULT 0 NOT NULL,
	`message` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pinterest_sync_runs_household_started` ON `pinterest_sync_runs` (`household_id`,`started_at`);