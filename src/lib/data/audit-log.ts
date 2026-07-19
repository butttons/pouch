import { fromPromise } from "neverthrow";

import { type AuditLogEvent } from "@/lib/audit-log";
import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";
import { typedId } from "@/lib/typed-id";

import { BaseDataLayer } from "./_base";

const parseDiff = (diff: unknown): Record<string, unknown> | null => {
	if (diff === null || diff === undefined) return null;
	if (typeof diff === "string") {
		try {
			return JSON.parse(diff) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	if (typeof diff === "object") return diff as Record<string, unknown>;
	return null;
};

export class AuditLogDataLayer extends BaseDataLayer {
	constructor(
		private db: Database,
		private batch: Batcher<DatabaseSchema>,
	) {
		super();
		this.entity = "audit_log";
	}

	get auditLogQuery() {
		return this.db
			.selectFrom("audit_log")
			.select([
				"id",
				"actor",
				"action",
				"target_id as targetId",
				"diff",
				"created_at as createdAt",
			]);
	}

	listAuditLogs(input: {
		limit: number;
		cursor?: string;
		actor?: string;
		action?: string;
		targetId?: string;
	}) {
		const pageSize = input.limit;

		return fromPromise(
			this.auditLogQuery
				.$if(input.cursor !== undefined, (q) =>
					q.where("id", "<", input.cursor!),
				)
				.$if(input.actor !== undefined, (q) =>
					q.where("actor", "=", input.actor!),
				)
				.$if(input.action !== undefined, (q) =>
					q.where("action", "=", input.action!),
				)
				.$if(input.targetId !== undefined, (q) =>
					q.where("target_id", "=", input.targetId!),
				)
				.orderBy("id", "desc")
				.limit(pageSize + 1)
				.execute(),
			this.passThroughError({
				message: "Failed to list audit logs",
				code: "GET_FAILED",
				source: "DL.auditLog.listAuditLogs",
				input,
			}),
		).map((rows) => {
			const hasMore = rows.length > pageSize;
			const data = hasMore ? rows.slice(0, pageSize) : rows;
			const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
			return {
				rows: data.map((row) => ({
					...row,
					diff: parseDiff(row.diff),
				})),
				nextCursor,
			};
		});
	}

	getAuditLogById(input: { id: string }) {
		return fromPromise(
			this.auditLogQuery
				.where("id", "=", input.id)
				.executeTakeFirst()
				.then((row) =>
					row
						? {
								...row,
								diff: parseDiff(row.diff),
							}
						: null,
				),
			this.passThroughError({
				message: "Failed to get audit log by ID",
				code: "GET_FAILED",
				source: "DL.auditLog.getAuditLogById",
				input,
			}),
		);
	}

	static createInsert = (db: Database, event: AuditLogEvent) => {
		return db
			.insertInto("audit_log")
			.values({
				id: typedId("audit_log"),
				actor: event.actor,
				action: event.action,
				target_id: event.targetId,
				diff:
					event.diff === undefined || event.diff === null
						? null
						: JSON.stringify(event.diff),
				created_at: Date.now(),
			})
			.returning(["id"]);
	};

	insert(event: AuditLogEvent) {
		return fromPromise(
			AuditLogDataLayer.createInsert(this.db, event).execute(),
			this.passThroughError({
				message: "Failed to insert audit log",
				code: "CREATE_FAILED",
				source: "DL.auditLog.insert",
				input: event,
			}),
		);
	}
}
