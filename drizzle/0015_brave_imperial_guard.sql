ALTER TABLE `household_recipes` ADD `removed_at` text;--> statement-breakpoint
CREATE INDEX `idx_household_recipes_household_removed` ON `household_recipes` (`household_id`,`removed_at`);