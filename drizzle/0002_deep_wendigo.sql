CREATE TABLE `household_ai_connections` (
	`ai_connection_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`connected_by_clerk_user_id` text NOT NULL,
	`connection_status` text DEFAULT 'active' NOT NULL,
	`last_tested_at` text,
	`last_test_status` text,
	`last_test_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_ai_connections_household_unique` ON `household_ai_connections` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_household_ai_connections_provider` ON `household_ai_connections` (`provider`);