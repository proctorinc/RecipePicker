CREATE TABLE `ratings` (
	`rating_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pin_id` text NOT NULL,
	`rating` integer NOT NULL,
	`rated_at` text NOT NULL,
	FOREIGN KEY (`pin_id`) REFERENCES `pins`(`pin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ratings_pin_id` ON `ratings` (`pin_id`);--> statement-breakpoint
CREATE INDEX `idx_ratings_rated_at` ON `ratings` (`rated_at`);