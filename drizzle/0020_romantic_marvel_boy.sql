CREATE TABLE `pinterest_sync_job_seen_recipes` (
	`job_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`board_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `pinterest_sync_jobs`(`job_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pinterest_sync_job_seen_unique` ON `pinterest_sync_job_seen_recipes` (`job_id`,`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_pinterest_sync_job_seen_board` ON `pinterest_sync_job_seen_recipes` (`job_id`,`board_id`);--> statement-breakpoint
CREATE TABLE `pinterest_sync_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`sync_run_id` text NOT NULL,
	`household_id` text NOT NULL,
	`requested_by_clerk_user_id` text,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`selected_board_ids_json` text NOT NULL,
	`current_board_id` text,
	`next_bookmark` text,
	`last_heartbeat_at` text,
	`last_error` text,
	`parse_new_recipes` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`sync_run_id`) REFERENCES `pinterest_sync_runs`(`sync_run_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pinterest_sync_jobs_run_unique` ON `pinterest_sync_jobs` (`sync_run_id`);--> statement-breakpoint
CREATE INDEX `idx_pinterest_sync_jobs_household_status` ON `pinterest_sync_jobs` (`household_id`,`status`);