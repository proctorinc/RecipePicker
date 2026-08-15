CREATE TABLE `household_recipe_versions` (
  `recipe_version_id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL REFERENCES `households`(`household_id`),
  `recipe_id` text NOT NULL REFERENCES `household_recipes`(`recipe_id`),
  `version_number` integer NOT NULL,
  `ingredients_json` text NOT NULL,
  `steps_json` text NOT NULL,
  `note` text,
  `created_by_clerk_user_id` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_versions_recipe_version_unique` ON `household_recipe_versions` (`recipe_id`,`version_number`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_versions_household_recipe_version` ON `household_recipe_versions` (`household_id`,`recipe_id`,`version_number`);
--> statement-breakpoint
ALTER TABLE `household_recipe_reviews` ADD `recipe_version_id` text REFERENCES `household_recipe_versions`(`recipe_version_id`);
