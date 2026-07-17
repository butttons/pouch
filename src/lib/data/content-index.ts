import { fromPromise } from "neverthrow";
import { sql } from "kysely";

import type { Database } from "../db/client";
import {
	computeIndexColumnName,
	computeIndexName,
	getIndexColumnType,
} from "../content-index";
import { typedId } from "../typed-id";

import { BaseDataLayer } from "./_base";

export class ContentIndexDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "content_index";
	}

	createIndex(input: {
		collectionId: string;
		field: string;
		schemaVersionId: string;
		columnType: string;
	}) {
		const columnName = computeIndexColumnName({
			collectionId: input.collectionId,
			field: input.field,
		});
		const indexName = computeIndexName({
			collectionId: input.collectionId,
			field: input.field,
		});
		const path = `'$.${input.field}'`;

		return fromPromise(
			(async () => {
				await sql`
					ALTER TABLE content
					ADD COLUMN ${sql.ref(columnName)} ${sql.raw(input.columnType)}
					GENERATED ALWAYS AS (json_extract(data, ${sql.raw(path)})) VIRTUAL
				`.execute(this.db);

				await sql`
					CREATE INDEX ${sql.ref(indexName)}
					ON content (${sql.ref(columnName)})
				`.execute(this.db);

				return this.db
					.insertInto("content_indexes")
					.values({
						id: typedId("content_index"),
						collection_id: input.collectionId,
						field: input.field,
						index_name: indexName,
						column_name: columnName,
						column_type: input.columnType,
						schema_version_id: input.schemaVersionId,
						created_at: Date.now(),
					})
					.returning([
						"id",
						"collection_id as collectionId",
						"field",
						"index_name as indexName",
						"column_name as columnName",
						"column_type as columnType",
						"schema_version_id as schemaVersionId",
						"created_at as createdAt",
						"deleted_at as deletedAt",
					])
					.executeTakeFirstOrThrow();
			})(),
			this.passThroughError({
				message: "Failed to create content index",
				code: "CREATE_FAILED",
				source: "DL.contentIndex.createIndex",
				input,
			}),
		);
	}

	dropIndex(input: { collectionId: string; field: string }) {
		const columnName = computeIndexColumnName({
			collectionId: input.collectionId,
			field: input.field,
		});
		const indexName = computeIndexName({
			collectionId: input.collectionId,
			field: input.field,
		});

		return fromPromise(
			(async () => {
				await sql`DROP INDEX IF EXISTS ${sql.ref(indexName)}`.execute(this.db);
				await sql`
					ALTER TABLE content
					DROP COLUMN ${sql.ref(columnName)}
				`.execute(this.db);

				return this.db
					.updateTable("content_indexes")
					.set({ deleted_at: Date.now() })
					.where("collection_id", "=", input.collectionId)
					.where("field", "=", input.field)
					.where("deleted_at", "is", null)
					.returning([
						"id",
						"collection_id as collectionId",
						"field",
						"index_name as indexName",
						"column_name as columnName",
						"column_type as columnType",
						"schema_version_id as schemaVersionId",
						"created_at as createdAt",
						"deleted_at as deletedAt",
					])
					.executeTakeFirstOrThrow();
			})(),
			this.passThroughError({
				message: "Failed to drop content index",
				code: "DELETE_FAILED",
				source: "DL.contentIndex.dropIndex",
				input,
			}),
		);
	}

	listActiveIndexesByCollectionId(input: { collectionId: string }) {
		return fromPromise(
			this.db
				.selectFrom("content_indexes")
				.select([
					"id",
					"collection_id as collectionId",
					"field",
					"index_name as indexName",
					"column_name as columnName",
					"column_type as columnType",
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"deleted_at as deletedAt",
				])
				.where("collection_id", "=", input.collectionId)
				.where("deleted_at", "is", null)
				.execute(),
			this.passThroughError({
				message: "Failed to list active content indexes",
				code: "GET_FAILED",
				source: "DL.contentIndex.listActiveIndexesByCollectionId",
				input,
			}),
		);
	}
}

export { getIndexColumnType };
