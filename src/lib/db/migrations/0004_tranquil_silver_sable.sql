CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`diff` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_target` ON `audit_log` (`target_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_log` (`actor`,`created_at`);