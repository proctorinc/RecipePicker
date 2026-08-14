CREATE INDEX `idx_board_sync_subscriptions_household_enabled_board_name` ON `board_sync_subscriptions` (`household_id`,`sync_enabled`,`board_name`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_events_household_date_created` ON `household_recipe_events` (`household_id`,`date`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_extractions_pin_created` ON `household_recipe_extractions` (`pin_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_ingredients_household_normalization_recipe_position` ON `household_recipe_ingredients` (`household_id`,`normalization_status`,`recipe_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_job_items_job_status_position` ON `household_recipe_parse_job_items` (`job_id`,`status`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_job_items_job_status_updated` ON `household_recipe_parse_job_items` (`job_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_parse_jobs_household_status_created` ON `household_recipe_parse_jobs` (`household_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_reviews_recipe_created` ON `household_recipe_reviews` (`recipe_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_sources_pin_fetched` ON `household_recipe_sources` (`pin_id`,`fetched_at`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipes_household_updated` ON `household_recipes` (`household_id`,`updated_at`);
