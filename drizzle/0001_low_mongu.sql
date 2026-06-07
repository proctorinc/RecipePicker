PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_household_recipe_reviews` (
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
INSERT INTO `__new_household_recipe_reviews`("review_id", "household_id", "recipe_id", "reviewed_by_clerk_user_id", "rating_value", "eaten_on", "note", "created_at", "updated_at") SELECT "review_id", "household_id", "recipe_id", "reviewed_by_clerk_user_id", "rating_value", "eaten_on", "note", "created_at", "updated_at" FROM `household_recipe_reviews`;--> statement-breakpoint
DROP TABLE `household_recipe_reviews`;--> statement-breakpoint
ALTER TABLE `__new_household_recipe_reviews` RENAME TO `household_recipe_reviews`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_recipe_id` ON `household_recipe_reviews` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_eaten_on` ON `household_recipe_reviews` (`eaten_on`);--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_reviewer` ON `household_recipe_reviews` (`reviewed_by_clerk_user_id`);