import { sql } from "kysely";
import { fromPromise, Result } from "neverthrow";

import { type AuditLogEvent } from "@/lib/audit-log";
import { buildJsonExtractExpression } from "@/lib/content-index";
import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";

import { BaseDataLayer } from "./_base";
import { AuditLogDataLayer } from "./audit-log";

export type ContentStatus = "draft" | "published" | "archived";

export type ContentFilter = {
	field: string;
	op: "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "ne" | "nin";
	value: string | number | boolean | (string | number | boolean)[];
	/** When set, the filter targets a top-level content column instead of `data`. */
	column?: "status";
};

export type ContentSort = {
	/** Public field name (createdAt, updatedAt, or a data field). */
	field: "createdAt" | "updatedAt" | string;
	/** SQL ordering expression: a real column for built-ins, json_extract for data fields. */
	expression: string;
	direction: "asc" | "desc";
};

export type SortCursor = { value: number | string; id: string };

const encodeSortCursor = (cursor: SortCursor): string =>
	btoa(JSON.stringify([cursor.value, cursor.id]))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Decodes a composite sort cursor. Returns null when the cursor is malformed.
 */
export const decodeSortCursor = (cursor: string): SortCursor | null => {
	if (!BASE64URL_REGEX.test(cursor)) {
		return null;
	}

	const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64.padEnd(
		base64.length + ((4 - (base64.length % 4)) % 4),
		"=",
	);
	const parsed = Result.fromThrowable(
		() => JSON.parse(atob(padded)) as unknown,
		() => null,
	)();

	if (parsed.isErr()) {
		return null;
	}

	const value = parsed.value;

	if (
		!Array.isArray(value) ||
		value.length !== 2 ||
		(typeof value[0] !== "number" && typeof value[0] !== "string") ||
		typeof value[1] !== "string"
	) {
		return null;
	}

	return { value: value[0], id: value[1] };
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
	const expression =
		filter.column === "status"
			? "status"
			: buildJsonExtractExpression({ field: filter.field });

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

	public contentColumns = [
		"id",
		"collection_id as collectionId",
		sql<Record<string, unknown>>`data`.as("data"),
		sql<ContentStatus>`status`.as("status"),
		"schema_version_id as schemaVersionId",
		"created_at as createdAt",
		"updated_at as updatedAt",
	] as const;

	get contentQuery() {
		return this.db.selectFrom("content").select(this.contentColumns);
	}

	listContent(input: {
		collectionId: string;
		filters: ContentFilter[];
		limit: number;
		cursor?: string;
		sort?: ContentSort;
		sortCursor?: SortCursor;
		direction?: "forward" | "backward";
	}) {
		const pageSize = input.limit;
		const sort = input.sort;
		const sortCursor = input.sortCursor;
		const direction = input.direction ?? "forward";
		const backward = direction === "backward";

		return fromPromise(
			this.contentQuery
				.where("collection_id", "=", input.collectionId)
				.$if(input.cursor !== undefined && sort === undefined, (q) =>
					q.where("id", backward ? ">" : "<", input.cursor!),
				)
				.$if(sort !== undefined && sortCursor !== undefined, (q) => {
					const { expression, direction: sortDirection } = sort!;
					const asc = sortDirection === "asc";
					const cmp = backward ? (asc ? "<" : ">") : asc ? ">" : "<";

					return q.where(
						sql<boolean>`(${sql.raw(expression)} ${sql.raw(cmp)} ${sortCursor!.value}) OR (${sql.raw(expression)} = ${sortCursor!.value} AND id ${sql.raw(cmp)} ${sortCursor!.id})`,
					);
				})
				.$if(input.filters.length > 0, (q) => {
					let filtered = q;

					for (const filter of input.filters) {
						filtered = filtered.where(getFilterExpression(filter));
					}

					return filtered;
				})
				.$if(sort === undefined, (q) =>
					q.orderBy("id", backward ? "asc" : "desc"),
				)
				.$if(sort !== undefined, (q) => {
					const order = backward
						? sort!.direction === "asc"
							? "desc"
							: "asc"
						: sort!.direction;

					return q
						.orderBy(sql.raw(sort!.expression), order)
						.orderBy("id", order);
				})
				.limit(pageSize + 1)
				.execute(),
			this.passThroughError({
				message: "Failed to list content",
				code: "GET_FAILED",
				source: "DL.content.listContent",
				input,
			}),
		).map((fetched) => {
			const hasMore = fetched.length > pageSize;
			const page = hasMore ? fetched.slice(0, pageSize) : fetched;
			const rows = backward ? page.reverse() : page;

			const sortValueOf = (
				row: (typeof rows)[number],
				sort: ContentSort,
			): number | string => {
				if (sort.field === "createdAt") {
					return row.createdAt;
				}

				if (sort.field === "updatedAt") {
					return row.updatedAt;
				}

				// Indexed scalar data fields hold a number or string value; coerce
				// anything unexpected (e.g. a missing field) to the empty string so
				// the cursor stays well-formed rather than throwing mid-pagination.
				const value = row.data[sort.field];
				return typeof value === "number" || typeof value === "string"
					? value
					: "";
			};

			const cursorOf = (row: (typeof rows)[number]) =>
				sort
					? encodeSortCursor({ value: sortValueOf(row, sort), id: row.id })
					: row.id;

			const first = rows[0];
			const last = rows[rows.length - 1];

			if (backward) {
				return {
					rows,
					nextCursor: last ? cursorOf(last) : null,
					prevCursor: hasMore && first ? cursorOf(first) : null,
				};
			}

			const hasCursor = sort
				? sortCursor !== undefined
				: input.cursor !== undefined;

			return {
				rows,
				nextCursor: hasMore && last ? cursorOf(last) : null,
				prevCursor: hasCursor && first ? cursorOf(first) : null,
			};
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
		audit: AuditLogEvent,
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
					.returning(this.contentColumns);

				const results = await this.batch([
					mutation,
					AuditLogDataLayer.createInsert(this.db, audit),
				] as const);

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
		audit: AuditLogEvent,
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
						.returning(this.contentColumns),
				);

				const results = await this.batch(contentStatements, [
					AuditLogDataLayer.createInsert(this.db, audit),
				]);

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
		audit: AuditLogEvent,
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
					.returning(this.contentColumns);

				const results = await this.batch([
					mutation,
					AuditLogDataLayer.createInsert(this.db, audit),
				] as const);

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
		audit: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const contentStatements = input.items.map((item) =>
					this.db
						.updateTable("content")
						.set(
							this.forUpdate({
								data: item.data,
								...(item.status !== undefined ? { status: item.status } : {}),
							}),
						)
						.where("id", "=", item.id)
						.returning(this.contentColumns),
				);

				const results = await this.batch(contentStatements, [
					AuditLogDataLayer.createInsert(this.db, audit),
				]);

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

	deleteContentById(input: { id: string }, audit: AuditLogEvent) {
		return fromPromise(
			(async () => {
				const mutation = this.db
					.deleteFrom("content")
					.where("id", "=", input.id);

				await this.batch([
					mutation,
					AuditLogDataLayer.createInsert(this.db, audit),
				] as const);
			})(),
			this.passThroughError({
				message: "Failed to delete content",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentById",
				input,
			}),
		);
	}

	deleteContentBatch(input: { ids: string[] }, audit: AuditLogEvent) {
		return fromPromise(
			(async () => {
				const mutation = this.db
					.deleteFrom("content")
					.where("id", "in", input.ids);

				await this.batch([
					mutation,
					AuditLogDataLayer.createInsert(this.db, audit),
				] as const);
			})(),
			this.passThroughError({
				message: "Failed to delete content batch",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentBatch",
				input,
			}),
		);
	}

	deleteContentByCollectionId(
		input: { collectionId: string },
		audit: AuditLogEvent,
	) {
		return fromPromise(
			(async () => {
				const mutation = this.db
					.deleteFrom("content")
					.where("collection_id", "=", input.collectionId);

				await this.batch([
					mutation,
					AuditLogDataLayer.createInsert(this.db, audit),
				] as const);
			})(),
			this.passThroughError({
				message: "Failed to delete content by collection ID",
				code: "DELETE_FAILED",
				source: "DL.content.deleteContentByCollectionId",
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
