DROP INDEX `idx_recipe_folders_household_source_board_unique`;
--> statement-breakpoint
DROP INDEX `idx_recipe_folders_household_source_section_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_folders_household_source_board_unique`
  ON `recipe_folders` (`household_id`, `source`, `pinterest_board_id`)
  WHERE `source_type` = 'board';
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipe_folders_household_source_section_unique`
  ON `recipe_folders` (`household_id`, `source`, `pinterest_section_id`)
  WHERE `source_type` = 'section';
