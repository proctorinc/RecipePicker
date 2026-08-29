ALTER TABLE `households` ADD `time_zone` text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE `pinterest_accounts` ADD `last_new_pin_sync_attempt_at` text;--> statement-breakpoint
ALTER TABLE `pinterest_accounts` ADD `last_nightly_full_sync_local_date` text;