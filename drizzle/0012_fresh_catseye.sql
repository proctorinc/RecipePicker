CREATE TABLE `household_shopping_cart_item_states` (
	`cart_item_state_id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`item_id` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`sort_position` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `household_shopping_carts`(`cart_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shopping_cart_item_states_cart_item_unique` ON `household_shopping_cart_item_states` (`cart_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_shopping_cart_item_states_cart_sort` ON `household_shopping_cart_item_states` (`cart_id`,`checked`,`sort_position`);--> statement-breakpoint
CREATE TABLE `household_shopping_carts` (
	`cart_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_shopping_carts_household_status` ON `household_shopping_carts` (`household_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_shopping_carts_household_created` ON `household_shopping_carts` (`household_id`,`created_at`);