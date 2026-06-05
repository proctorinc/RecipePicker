CREATE TABLE `boards` (
	`board_id` text PRIMARY KEY NOT NULL,
	`last_synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pins` (
	`pin_id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`board_section_id` text,
	`title` text,
	`description` text,
	`link` text,
	`alt_text` text,
	`dominant_color` text,
	`note` text,
	`created_at` text,
	`parent_pin_id` text,
	`media_json` text,
	`media_source_json` text,
	`creator_json` text,
	`board_owner_json` text,
	`raw_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`board_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pins_board_id` ON `pins` (`board_id`);