CREATE TABLE `household_recipe_ingredient_measurements` (
	`ingredient_measurement_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`position` integer NOT NULL,
	`amount_text` text NOT NULL,
	`amount_value` real,
	`amount_max_value` real,
	`unit` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipe_instructions`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `household_recipe_ingredients`(`ingredient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_ingredient_measurements_ingredient_position` ON `household_recipe_ingredient_measurements` (`ingredient_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredient_measurements_recipe_ingredient` ON `household_recipe_ingredient_measurements` (`recipe_id`,`ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredient_measurements_household_unit` ON `household_recipe_ingredient_measurements` (`household_id`,`unit`);