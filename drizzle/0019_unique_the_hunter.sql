ALTER TABLE `pinterest_sync_runs` ADD `sync_scope_key` text;--> statement-breakpoint
ALTER TABLE `pinterest_sync_runs` ADD `expected_pin_count` integer;--> statement-breakpoint
ALTER TABLE `pinterest_sync_runs` ADD `processed_pin_count` integer DEFAULT 0 NOT NULL;