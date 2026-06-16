CREATE TABLE `household_recipe_parse_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_by_clerk_user_id` text NOT NULL,
	`mode` text NOT NULL,
	`rerun` integer DEFAULT true NOT NULL,
	`filters_json` text,
	`recipe_ids_json` text NOT NULL,
	`total_recipes` integer DEFAULT 0 NOT NULL,
	`processed_recipes` integer DEFAULT 0 NOT NULL,
	`succeeded_recipes` integer DEFAULT 0 NOT NULL,
	`review_needed_recipes` integer DEFAULT 0 NOT NULL,
	`failed_recipes` integer DEFAULT 0 NOT NULL,
	`cancel_requested_at` text,
	`started_at` text,
	`completed_at` text,
	`last_heartbeat_at` text,
	`last_error` text,
	`worker_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_jobs_household_created` ON `household_recipe_parse_jobs` (`household_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_jobs_household_status` ON `household_recipe_parse_jobs` (`household_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_jobs_household_completed` ON `household_recipe_parse_jobs` (`household_id`,`completed_at`);
--> statement-breakpoint
CREATE TABLE `household_recipe_parse_job_items` (
	`job_item_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`completed_at` text,
	`last_error` text,
	`last_extraction_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `household_recipe_parse_jobs`(`job_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_extraction_id`) REFERENCES `household_recipe_extractions`(`extraction_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_parse_job_items_job_position_unique` ON `household_recipe_parse_job_items` (`job_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_parse_job_items_job_recipe_unique` ON `household_recipe_parse_job_items` (`job_id`,`recipe_id`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_job_items_job_status` ON `household_recipe_parse_job_items` (`job_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_job_items_recipe_id` ON `household_recipe_parse_job_items` (`recipe_id`);
