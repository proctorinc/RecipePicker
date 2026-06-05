CREATE TABLE `recipe_extractions` (
	`extraction_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pin_id` text NOT NULL,
	`source_id` integer,
	`status` text NOT NULL,
	`method` text,
	`warnings_json` text,
	`candidate_count` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`pin_id`) REFERENCES `pins`(`pin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `recipe_sources`(`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_extractions_pin_id` ON `recipe_extractions` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_extractions_status` ON `recipe_extractions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_recipe_extractions_created_at` ON `recipe_extractions` (`created_at`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`ingredient_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`original_text` text NOT NULL,
	`amount_text` text,
	`unit` text,
	`ingredient_text` text,
	`notes` text,
	`normalization_status` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredients_recipe_id` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredients_recipe_position` ON `recipe_ingredients` (`recipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredients_normalization_status` ON `recipe_ingredients` (`normalization_status`);--> statement-breakpoint
CREATE TABLE `recipe_sources` (
	`source_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pin_id` text NOT NULL,
	`original_url` text NOT NULL,
	`final_url` text,
	`fetch_status` text NOT NULL,
	`content_type` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`pin_id`) REFERENCES `pins`(`pin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_sources_pin_id` ON `recipe_sources` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_sources_fetched_at` ON `recipe_sources` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`step_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`section` text,
	`raw_text` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_steps_recipe_id` ON `recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_steps_recipe_position` ON `recipe_steps` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`recipe_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pin_id` text NOT NULL,
	`source_id` integer,
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
	FOREIGN KEY (`pin_id`) REFERENCES `pins`(`pin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `recipe_sources`(`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_pin_id_unique` ON `recipes` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_recipes_source_id` ON `recipes` (`source_id`);