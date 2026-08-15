CREATE TABLE `household_always_have_ingredients` (
	`always_have_ingredient_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`canonical_ingredient_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_ingredient_id`) REFERENCES `household_canonical_ingredients`(`canonical_ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_always_have_household_canonical_unique` ON `household_always_have_ingredients` (`household_id`,`canonical_ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_always_have_household_id` ON `household_always_have_ingredients` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_review_queue` ON `household_recipe_ingredients` (`household_id`,`review_disposition`,`normalization_status`,`recipe_id`,`position`);