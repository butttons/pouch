// Generated from src/lib/db/migrations/*.sql
// Do not edit manually. Run: pnpm generate-test-migrations

export const pouchMigrations = [
  {
    "name": "0000_strange_diamondback.sql",
    "queries": [
      "CREATE TABLE `collections` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`slug` text NOT NULL,\n\t`name` text NOT NULL,\n\t`schema` text NOT NULL,\n\t`current_schema_version_id` text,\n\t`title_field` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `content_indexes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`collection_id` text NOT NULL,\n\t`field` text NOT NULL,\n\t`index_name` text NOT NULL,\n\t`column_name` text NOT NULL,\n\t`column_type` text NOT NULL,\n\t`schema_version_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `content` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`collection_id` text NOT NULL,\n\t`data` text NOT NULL,\n\t`status` text DEFAULT 'draft' NOT NULL,\n\t`schema_version_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `media` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`r2_key` text NOT NULL,\n\t`filename` text NOT NULL,\n\t`mime_type` text NOT NULL,\n\t`size_bytes` integer NOT NULL,\n\t`created_at` integer NOT NULL\n);",
      "CREATE TABLE `schema_versions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`collection_id` text NOT NULL,\n\t`schema` text NOT NULL,\n\t`change_diff` text,\n\t`applied_by` text,\n\t`created_at` integer NOT NULL\n);",
      "CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);",
      "CREATE INDEX `idx_content_collection_status` ON `content` (`collection_id`,`status`);"
    ]
  },
  {
    "name": "0001_neat_lehman.sql",
    "queries": [
      "ALTER TABLE `media` ADD COLUMN `status` text DEFAULT 'ready' NOT NULL;",
      "ALTER TABLE `media` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;"
    ]
  },
  {
    "name": "0002_overjoyed_norrin_radd.sql",
    "queries": [
      "CREATE INDEX `idx_content_indexes_collection_id_deleted_at` ON `content_indexes` (`collection_id`,`deleted_at`);",
      "CREATE INDEX `idx_content_collection_id` ON `content` (`collection_id`,`id`);"
    ]
  },
  {
    "name": "0003_sharp_agent_zero.sql",
    "queries": [
      "ALTER TABLE `content_indexes` DROP COLUMN `column_name`;",
      "ALTER TABLE `content_indexes` DROP COLUMN `column_type`;"
    ]
  },
  {
    "name": "0004_tranquil_silver_sable.sql",
    "queries": [
      "CREATE TABLE `audit_log` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actor` text NOT NULL,\n\t`action` text NOT NULL,\n\t`target_id` text NOT NULL,\n\t`diff` text,\n\t`created_at` text NOT NULL\n);",
      "CREATE INDEX `idx_audit_target` ON `audit_log` (`target_id`);",
      "CREATE INDEX `idx_audit_actor` ON `audit_log` (`actor`,`created_at`);"
    ]
  }
];
