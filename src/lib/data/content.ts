import { sql } from "kysely";
import { fromPromise } from "neverthrow";

import { createAuditLogInsert, type AuditLogEvent } from "@/lib/audit-log";
import { buildJsonExtractExpression } from "@/lib/content-index";
import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";

import { BaseDataLayer } from "./_base";

export type ContentStatus = "draft" | "published" | "archived";

export type ContentFilter = {
	field: string;
	op: "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "ne" | "nin";
	value: string | number | boolean | (string | number | boolean)[];
};

const OP_MAP: Record<Exclude<ContentFilter["op"], "in" | "nin">, string> = {
	eq: "=",
	gt: ">",
	gte: ">=",
	lt: "<",
	lte: "<=",
	ne: "!=",
};

const getFilterExpression = (filter: ContentFilter) => {
	const expression = buildJsonExtractExpression({ field: filter.field });

	if (filter.op === "in" || filter.op === "nin") {
		const values = Array.isArray(filter.value) ? filter.value : [filter.value];
		const not = filter.op === "nin" ? "NOT" : "";

		return sql<boolean>`${sql.raw(expression)} ${sql.raw(not)} IN (${sql.join(values)})`;
	}

	const op = OP_MAP[filter.op];

	return sql<boolean>`${sql.raw(expression)} ${sql.raw(op)} ${filter.value}`;
};

export class ContentDataLayer extends BaseDataLayer {
	constructor(
		private db: Database,
		private batch: Batcher<DatabaseSchema>,
	) {
		super();
		this.entity = "content";
	}

	get contentQuery() {
		return this.db
			.selectFrom("content")
			.select([
				"id",
				"collection_id as collectionId",
				sql<Record<string, unknown>>`data`.as("data"),
				sql<ContentStatus>`status`.as("status"),
				"schema_version_id as schemaVersionId",
				"created_at as createdAt",
				"updated_at as updatedAt",
			]);
	}

	listContent(input: {
		collectionId: string;
		filters: ContentFilter[];
		limit: number;
		cursor?: string;
	}) {
		const pageSize = input.limit;

		return fromPromise(
			this.contentQuery
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
			this.contentQuery.where("id", "=", input.id).executeTakeFirst(),
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
			this.contentQuery.where("id", "in", input.ids).execute(),
			this.passThroughError({
				message: "Failed to get content by IDs",
				code: "GET_FAILED",
				source: "DL.content.getContentByIds",
				input,
			}),
		);
	}

	createContent(
		input: {
			id: string;
			collectionId: string;
			data: string;
			schemaVersionId: string;
			status: string;
		},
		audit?: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const mutation = this.db
					.insertInto("content")
					.values(
						this.forInsert({
							id: input.id,
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
					]);

				const results = await this.batch(
					audit
						? ([mutation, createAuditLogInsert(this.db, audit)] as const)
						: ([mutation] as const),
				);

				const rows = results[0]!;
				const row = rows[0];

				if (row === undefined) {
					throw new Error("Failed to create content");
				}

				return row;
			})(),
			this.passThroughError({
				message: "Failed to create content",
				code: "CREATE_FAILED",
				source: "DL.content.createContent",
				input,
			}),
		);
	}

	createContentBatch(
		input: {
			items: Array<{
				id: string;
				collectionId: string;
				data: string;
				schemaVersionId: string;
				status: string;
			}>;
		},
		audit?: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const contentStatements = input.items.map((item) =>
					this.db
						.insertInto("content")
						.values(
							this.forInsert({
								id: item.id,
								collection_id: item.collectionId,
								data: item.data,
								schema_version_id: item.schemaVersionId,
								status: item.status,
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
						]),
				);

				const results = await this.batch(
					contentStatements,
					audit ? [createAuditLogInsert(this.db, audit)] : undefined,
				);

				return results.flat();
			})(),
			this.passThroughError({
				message: "Failed to create content batch",
				code: "CREATE_FAILED",
				source: "DL.content.createContentBatch",
				input,
			}),
		);
	}

	updateContent(
		input: { id: string; data: string; status?: string },
		audit?: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const mutation = this.db
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
					]);

				const results = await this.batch(
					audit
						? ([mutation, createAuditLogInsert(this.db, audit)] as const)
						: ([mutation] as const),
				);

				const rows = results[0]!;
				const row = rows[0];

				if (row === undefined) {
					throw new Error("Failed to update content");
				}

				return row;
			})(),
			this.passThroughError({
				message: "Failed to update content",
				code: "UPDATE_FAILED",
				source: "DL.content.updateContent",
				input,
			}),
		);
	}

	updateContentBatch(
		input: {
			items: Array<{ id: string; data: string; status?: string }>;
		},
		audit?: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const contentStatements = input.items.map((item) =>
					this.db
						.updateTable("content")
						.set(
							this.forUpdate({
								data: item.data,
								...(item.status !== undefined
									? { status: item.status }
									: {}),
							}),
						)
						.where("id", "=", item.id)
						.returning([
							"id",
							"collection_id as collectionId",
							sql<Record<string, unknown>>`data`.as("data"),
							sql<ContentStatus>`status`.as("status"),
							"schema_version_id as schemaVersionId",
							"created_at as createdAt",
							"updated_at as updatedAt",
						]),
				);

				const results = await this.batch(
					contentStatements,
					audit ? [createAuditLogInsert(this.db, audit)] : undefined,
				);

				return results.flat();
			})(),
			this.passThroughError({
				message: "Failed to update content batch",
				code: "UPDATE_FAILED",
				source: "DL.content.updateContentBatch",
				input,
			}),
		);
	}

	deleteContentById(input: { id: string }, audit?: AuditLogEvent) {
		return fromPromise(
			(async () => {
				const mutation = this.db.deleteFrom("content").where("id", "=", input.id);

				await this.batch(
					audit
						? ([mutation, createAuditLogInsert(this.db, audit)] as const)
						: ([mutation] as const),
				);
			})(),
			this.passThroughError({
				message: "Failed to delete content",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentById",
				input,
			}),
		);
	}

	deleteContentBatch(input: { ids: string[] }, audit?: AuditLogEvent) {
		return fromPromise(
			(async () => {
				const mutation = this.db
					.deleteFrom("content")
					.where("id", "in", input.ids);

				await this.batch(
					audit
						? ([mutation, createAuditLogInsert(this.db, audit)] as const)
						: ([mutation] as const),
				);
			})(),
			this.passThroughError({
				message: "Failed to delete content batch",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentBatch",
				input,
			}),
		);
	}

	countContentByMediaId(input: { mediaId: string }) {
		const quotedId = JSON.stringify(input.mediaId);
		return fromPromise(
			this.db
				.selectFrom("content")
				.select((eb) => eb.fn.countAll<number>().as("count"))
				.where(
					sql<boolean>`json_extract(data, '$') LIKE ${"%" + quotedId + "%"}`,
				)
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
