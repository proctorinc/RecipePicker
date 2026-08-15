CREATE TABLE `household_recipe_ingredient_alternatives` (
	`alternative_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`position` integer NOT NULL,
	`ingredient_text` text NOT NULL,
	`normalized_ingredient_phrase` text,
	`canonical_ingredient_id` text,
	`attributes_json` text,
	`match_confidence` integer,
	`matched_by` text,
	`ai_suggestions_json` text,
	`normalization_status` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipe_instructions`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `household_recipe_ingredients`(`ingredient_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_ingredient_alternatives_ingredient_position` ON `household_recipe_ingredient_alternatives` (`ingredient_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredient_alternatives_household_normalization` ON `household_recipe_ingredient_alternatives` (`household_id`,`normalization_status`);