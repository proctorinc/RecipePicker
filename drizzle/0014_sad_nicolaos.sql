CREATE TABLE `recipe_tag_memberships` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `recipe_tags`(`tag_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_tag_memberships_household_recipe_tag_unique` ON `recipe_tag_memberships` (`household_id`,`recipe_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_tag_memberships_tag_id` ON `recipe_tag_memberships` (`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_tag_memberships_household_recipe` ON `recipe_tag_memberships` (`household_id`,`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_tags_household_normalized_name_unique` ON `recipe_tags` (`household_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_recipe_tags_household_name` ON `recipe_tags` (`household_id`,`name`);