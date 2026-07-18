ALTER TABLE `media` ADD COLUMN `status` text DEFAULT 'ready' NOT NULL;
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;
