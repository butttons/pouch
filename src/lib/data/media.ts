import { fromPromise } from "neverthrow";

import type { Database } from "@/lib/db/client";

import { BaseDataLayer } from "./_base";

export class MediaDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "media";
	}

	get mediaQuery() {
		return this.db
			.selectFrom("media")
			.select([
				"id",
				"r2_key as r2Key",
				"filename",
				"mime_type as mimeType",
				"size_bytes as sizeBytes",
				"status",
				"created_at as createdAt",
				"updated_at as updatedAt",
			]);
	}

	listMedia(input: { limit: number; cursor?: string }) {
		const pageSize = input.limit;

		return fromPromise(
			this.mediaQuery
				.$if(input.cursor !== undefined, (q) =>
					q.where("id", "<", input.cursor!),
				)
				.orderBy("id", "desc")
				.limit(pageSize + 1)
				.execute(),
			this.passThroughError({
				message: "Failed to list media",
				code: "GET_FAILED",
				source: "DL.media.listMedia",
				input,
			}),
		).map((rows) => {
			const hasMore = rows.length > pageSize;
			const data = hasMore ? rows.slice(0, pageSize) : rows;
			const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
			return { rows: data, nextCursor };
		});
	}

	getMediaById(input: { id: string }) {
		return fromPromise(
			this.mediaQuery.where("id", "=", input.id).executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get media by ID",
				code: "GET_FAILED",
				source: "DL.media.getMediaById",
				input,
			}),
		);
	}

	getMediaByIds(input: { ids: string[] }) {
		return fromPromise(
			this.mediaQuery.where("id", "in", input.ids).execute(),
			this.passThroughError({
				message: "Failed to get media by IDs",
				code: "GET_FAILED",
				source: "DL.media.getMediaByIds",
				input,
			}),
		);
	}

	createMedia(input: {
		id?: string;
		r2Key: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
	}) {
		const base = this.forInsert({
			r2_key: input.r2Key,
			filename: input.filename,
			mime_type: input.mimeType,
			size_bytes: input.sizeBytes,
			status: "ready",
		});

		const values = input.id ? { ...base, id: input.id } : base;

		return fromPromise(
			this.db
				.insertInto("media")
				.values(values)
				.returning([
					"id",
					"r2_key as r2Key",
					"filename",
					"mime_type as mimeType",
					"size_bytes as sizeBytes",
					"status",
					"created_at as createdAt",
					"updated_at as updatedAt",
				])
				.executeTakeFirstOrThrow(),
			this.passThroughError({
				message: "Failed to create media",
				code: "CREATE_FAILED",
				source: "DL.media.createMedia",
				input,
			}),
		);
	}

	deleteMediaById(input: { id: string }) {
		return fromPromise(
			this.db.deleteFrom("media").where("id", "=", input.id).execute(),
			this.passThroughError({
				message: "Failed to delete media",
				code: "DELETE_FAILED",
				source: "DL.media.deleteMediaById",
				input,
			}),
		);
	}
}
