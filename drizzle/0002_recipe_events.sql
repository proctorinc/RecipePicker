CREATE TABLE `household_recipe_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`date` text NOT NULL,
	`created_by_clerk_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `household_recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_events_household_date` ON `household_recipe_events` (`household_id`,`date`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_events_recipe_id` ON `household_recipe_events` (`recipe_id`);
--> statement-breakpoint
CREATE INDEX `idx_household_recipe_events_created_by` ON `household_recipe_events` (`created_by_clerk_user_id`);
--> statement-breakpoint
ALTER TABLE `household_recipe_reviews` ADD `event_id` text REFERENCES household_recipe_events(event_id);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_recipe_reviews_event_unique` ON `household_recipe_reviews` (`event_id`);
--> statement-breakpoint
INSERT INTO `household_recipe_events` (
	`event_id`,
	`household_id`,
	`recipe_id`,
	`date`,
	`created_by_clerk_user_id`,
	`created_at`,
	`updated_at`
)
SELECT
	lower(hex(randomblob(12))),
	`household_id`,
	`recipe_id`,
	`eaten_on`,
	`reviewed_by_clerk_user_id`,
	`created_at`,
	`updated_at`
FROM `household_recipe_reviews`
WHERE `eaten_on` IS NOT NULL AND trim(`eaten_on`) <> '';
--> statement-breakpoint
UPDATE `household_recipe_reviews`
SET `event_id` = (
	SELECT `household_recipe_events`.`event_id`
	FROM `household_recipe_events`
	WHERE `household_recipe_events`.`household_id` = `household_recipe_reviews`.`household_id`
	  AND `household_recipe_events`.`recipe_id` = `household_recipe_reviews`.`recipe_id`
	  AND `household_recipe_events`.`date` = `household_recipe_reviews`.`eaten_on`
	  AND `household_recipe_events`.`created_at` = `household_recipe_reviews`.`created_at`
	LIMIT 1
)
WHERE `eaten_on` IS NOT NULL AND trim(`eaten_on`) <> '';
