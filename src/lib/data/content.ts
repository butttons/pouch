import { fromPromise } from "neverthrow";
import { sql } from "kysely";

import type { Database } from "@/lib/db/client";

import { BaseDataLayer } from "./_base";

export type ContentStatus = "draft" | "published" | "archived";

export type ContentFilter = {
	field: string;
	op: "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "ne";
	value: string | number | boolean | (string | number | boolean)[];
	indexedColumn?: string;
};

const OP_MAP: Record<Exclude<ContentFilter["op"], "in">, string> = {
	eq: "=",
	gt: ">",
	gte: ">=",
	lt: "<",
	lte: "<=",
	ne: "!=",
};

const getFilterExpression = (filter: ContentFilter) => {
	if (filter.op === "in") {
		const values = Array.isArray(filter.value) ? filter.value : [filter.value];

		if (filter.indexedColumn) {
			return sql<boolean>`${sql.ref(filter.indexedColumn)} IN (${sql.join(values)})`;
		}

		const path = "$." + filter.field;
		return sql<boolean>`json_extract(data, ${path}) IN (${sql.join(values)})`;
	}

	const op = OP_MAP[filter.op];

	if (filter.indexedColumn) {
		return sql<boolean>`${sql.ref(filter.indexedColumn)} ${sql.raw(op)} ${filter.value}`;
	}

	const path = "$." + filter.field;
	return sql<boolean>`json_extract(data, ${path}) ${sql.raw(op)} ${filter.value}`;
};

export class ContentDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "content";
	}

	listContent(input: {
		collectionId: string;
		filters: ContentFilter[];
		limit: number;
		cursor?: string;
	}) {
		const pageSize = input.limit;

		return fromPromise(
			this.db
				.selectFrom("content")
				.select([
					"id",
					"collection_id as collectionId",
					sql<Record<string, unknown>>`data`.as("data"),
					sql<ContentStatus>`status`.as("status"),
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.where("collection_id", "=", input.collectionId)
				.$if(input.cursor !== undefined, (q) =>
					q.where("id", "<", input.cursor!),
				)
				.$if(input.filters.length > 0, (q) => {
					let filtered = q;

					for (const filter of input.filters) {
						filtered = filtered.where(getFilterExpression(filter));
					}

					return filtered;
				})
				.orderBy("id", "desc")
				.limit(pageSize + 1)
				.execute(),
			this.passThroughError({
				message: "Failed to list content",
				code: "GET_FAILED",
				source: "DL.content.listContent",
				input,
			}),
		).map((rows) => {
			const hasMore = rows.length > pageSize;
			const data = hasMore ? rows.slice(0, pageSize) : rows;
			const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
			return { rows: data, nextCursor };
		});
	}

	getContentById(input: { id: string }) {
		return fromPromise(
			this.db
				.selectFrom("content")
				.select([
					"id",
					"collection_id as collectionId",
					sql<Record<string, unknown>>`data`.as("data"),
					sql<ContentStatus>`status`.as("status"),
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.where("id", "=", input.id)
				.executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get content by ID",
				code: "GET_FAILED",
				source: "DL.content.getContentById",
				input,
			}),
		);
	}

	getContentByIds(input: { ids: string[] }) {
		return fromPromise(
			this.db
				.selectFrom("content")
				.select([
					"id",
					"collection_id as collectionId",
					sql<Record<string, unknown>>`data`.as("data"),
					sql<ContentStatus>`status`.as("status"),
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.where("id", "in", input.ids)
				.execute(),
			this.passThroughError({
				message: "Failed to get content by IDs",
				code: "GET_FAILED",
				source: "DL.content.getContentByIds",
				input,
			}),
		);
	}

	createContent(input: {
		collectionId: string;
		data: string;
		schemaVersionId: string;
		status: string;
	}) {
		return fromPromise(
			this.db
				.insertInto("content")
				.values(
					this.forInsert({
						collection_id: input.collectionId,
						data: input.data,
						schema_version_id: input.schemaVersionId,
						status: input.status,
					}),
				)
				.returning([
					"id",
					"collection_id as collectionId",
					sql<Record<string, unknown>>`data`.as("data"),
					sql<ContentStatus>`status`.as("status"),
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.executeTakeFirstOrThrow(),
			this.passThroughError({
				message: "Failed to create content",
				code: "CREATE_FAILED",
				source: "DL.content.createContent",
				input,
			}),
		);
	}

	updateContent(input: {
		id: string;
		data: string;
		status?: string;
	}) {
		return fromPromise(
			this.db
				.updateTable("content")
				.set(
					this.forUpdate({
						data: input.data,
						...(input.status !== undefined ? { status: input.status } : {}),
					}),
				)
				.where("id", "=", input.id)
				.returning([
					"id",
					"collection_id as collectionId",
					sql<Record<string, unknown>>`data`.as("data"),
					sql<ContentStatus>`status`.as("status"),
					"schema_version_id as schemaVersionId",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.executeTakeFirstOrThrow(),
			this.passThroughError({
				message: "Failed to update content",
				code: "UPDATE_FAILED",
				source: "DL.content.updateContent",
				input,
			}),
		);
	}

	deleteContentById(input: { id: string }) {
		return fromPromise(
			this.db.deleteFrom("content").where("id", "=", input.id).execute(),
			this.passThroughError({
				message: "Failed to delete content",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentById",
				input,
			}),
		);
	}

	countContentByMediaId(input: { mediaId: string }) {
		const quotedId = JSON.stringify(input.mediaId);
		return fromPromise(
			this.db
				.selectFrom("content")
				.select(sql<number>`count(*)`.as("count"))
				.where(sql<boolean>`json_extract(data, '$') LIKE ${"%" + quotedId + "%"}`)
				.executeTakeFirst(),
			this.passThroughError({
				message: "Failed to count content by media ID",
				code: "GET_FAILED",
				source: "DL.content.countContentByMediaId",
				input,
			}),
		);
	}
}
