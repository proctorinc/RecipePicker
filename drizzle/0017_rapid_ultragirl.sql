ALTER TABLE `household_pins` ADD `source_url_key` text;--> statement-breakpoint
CREATE INDEX `idx_household_pins_household_source_url_key` ON `household_pins` (`household_id`,`source_url_key`);