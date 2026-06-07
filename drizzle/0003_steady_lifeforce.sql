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
CREATE INDEX `idx_household_recipe_extraction_feedback_household_recipe` ON `household_recipe_extraction_feedback` (`household_id`,`recipe_id`);
