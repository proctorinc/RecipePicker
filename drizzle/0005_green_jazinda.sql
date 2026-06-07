CREATE TABLE `user_access_tiers` (
	`clerk_user_id` text PRIMARY KEY NOT NULL,
	`subscription_tier` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
