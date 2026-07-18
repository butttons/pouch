import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestampColumns = {
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const collectionsTable = sqliteTable("collections", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	schema: text("schema").notNull(),
	currentSchemaVersionId: text("current_schema_version_id"),
	titleField: text("title_field"),
	...timestampColumns,
});

export const schemaVersionsTable = sqliteTable("schema_versions", {
	id: text("id").primaryKey(),
	collectionId: text("collection_id").notNull(),
	schema: text("schema").notNull(),
	changeDiff: text("change_diff"),
	appliedBy: text("applied_by"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const contentIndexesTable = sqliteTable(
	"content_indexes",
	{
		id: text("id").primaryKey(),
		collectionId: text("collection_id").notNull(),
		field: text("field").notNull(),
		indexName: text("index_name").notNull(),
		schemaVersionId: text("schema_version_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
	},
	(t) => ({
		collectionDeletedAtIndex: index(
			"idx_content_indexes_collection_id_deleted_at",
		).on(t.collectionId, t.deletedAt),
	}),
);

export const contentTable = sqliteTable(
	"content",
	{
		id: text("id").primaryKey(),
		collectionId: text("collection_id").notNull(),
		data: text("data").notNull(),
		status: text("status").notNull().default("draft"),
		schemaVersionId: text("schema_version_id").notNull(),
		...timestampColumns,
	},
	(t) => ({
		collectionStatusIndex: index("idx_content_collection_status").on(
			t.collectionId,
			t.status,
		),
		collectionIdIndex: index("idx_content_collection_id").on(
			t.collectionId,
			t.id,
		),
	}),
);

export const mediaTable = sqliteTable("media", {
	id: text("id").primaryKey(),
	r2Key: text("r2_key").notNull(),
	filename: text("filename").notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	status: text("status").notNull().default("ready"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
