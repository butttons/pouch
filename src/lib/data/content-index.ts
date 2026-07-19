import { sql } from "kysely";
import { fromPromise } from "neverthrow";

import { buildIndexExpression, computeIndexName } from "@/lib/content-index";
import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";
import { typedId } from "@/lib/typed-id";

import { BaseDataLayer } from "./_base";

export class ContentIndexDataLayer extends BaseDataLayer {
	constructor(
		private db: Database,
		private batch: Batcher<DatabaseSchema>,
	) {
		super();
		this.entity = "content_index";
	}

	public contentIndexColumns = [
		"id",
		"collection_id as collectionId",
		"field",
		"index_name as indexName",
		"schema_version_id as schemaVersionId",
		"created_at as createdAt",
		"deleted_at as deletedAt",
	] as const;

	createIndex(input: {
		collectionId: string;
		field: string;
		schemaVersionId: string;
	}) {
		const indexName = computeIndexName({
			collectionId: input.collectionId,
			field: input.field,
		});
		const expression = buildIndexExpression({
			collectionId: input.collectionId,
			field: input.field,
		});

		return fromPromise(
			(async () => {
				const [_, indexes] = await this.batch([
					sql`
						CREATE INDEX IF NOT EXISTS ${sql.ref(indexName)}
						ON content (${sql.raw(expression)})
					`,
					this.db
						.insertInto("content_indexes")
						.values({
							id: typedId("content_index"),
							collection_id: input.collectionId,
							field: input.field,
							index_name: indexName,
							schema_version_id: input.schemaVersionId,
							created_at: Date.now(),
						})
						.returning(this.contentIndexColumns),
				] as const);

				const index = indexes[0];
				if (index === undefined) {
					throw new Error("Failed to create content index");
				}

				return index;
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
		const indexName = computeIndexName({
			collectionId: input.collectionId,
			field: input.field,
		});

		return fromPromise(
			(async () => {
				const [_, indexes] = await this.batch([
					sql`DROP INDEX IF EXISTS ${sql.ref(indexName)}`,
					this.db
						.updateTable("content_indexes")
						.set({ deleted_at: Date.now() })
						.where("collection_id", "=", input.collectionId)
						.where("field", "=", input.field)
						.where("deleted_at", "is", null)
						.returning(this.contentIndexColumns),
				] as const);

				const index = indexes[0];
				if (index === undefined) {
					throw new Error("Failed to drop content index");
				}

				return index;
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
				.select(this.contentIndexColumns)
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
