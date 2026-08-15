ALTER TABLE `household_recipe_ingredients` ADD `review_disposition` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `household_canonical_ingredients` ADD `catalog_status` text DEFAULT 'confirmed' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_household_disposition_status`
  ON `household_recipe_ingredients` (`household_id`, `review_disposition`, `normalization_status`);
