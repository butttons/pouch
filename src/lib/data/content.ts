import { fromPromise } from "neverthrow";
import { sql } from "kysely";

import type { Database } from "../db/client";

import { BaseDataLayer } from "./_base";

export type ContentStatus = "draft" | "published" | "archived";

export type ContentFilter = {
	field: string;
	op: "eq" | "gt" | "gte" | "lt" | "lte" | "ne";
	value: string | number | boolean;
};

const OP_MAP: Record<ContentFilter["op"], string> = {
	eq: "=",
	gt: ">",
	gte: ">=",
	lt: "<",
	lte: "<=",
	ne: "!=",
};

export class ContentDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "content";
	}

	listContent(input: { collectionId: string; filters: ContentFilter[] }) {
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
				.$if(input.filters.length > 0, (q) => {
					let filtered = q;

					for (const filter of input.filters) {
						const path = "$." + filter.field;
						const op = OP_MAP[filter.op];
						filtered = filtered.where(
							sql<boolean>`json_extract(data, ${path}) ${sql.raw(op)} ${filter.value}`,
						);
					}

					return filtered;
				})
				.orderBy("created_at", "desc")
				.execute(),
			this.passThroughError({
				message: "Failed to list content",
				code: "GET_FAILED",
				source: "DL.content.listContent",
				input,
			}),
		);
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
}
