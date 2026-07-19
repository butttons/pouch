import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";

import type { AuditLogListResponse, AuditLogQuery } from "./_schema";
import type { Deps } from "@/deps";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export const listAuditLogs = (
	input: { query: AuditLogQuery },
	deps: Deps,
): ResultAsync<AuditLogListResponse, DataLayerError> =>
	safeTry(async function* () {
		const rawLimit = input.query.limit
			? Number.parseInt(input.query.limit, 10)
			: DEFAULT_LIMIT;
		const limit = Number.isNaN(rawLimit)
			? DEFAULT_LIMIT
			: Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

		const result = yield* deps.DL.auditLog.listAuditLogs({
			limit,
			cursor: input.query.cursor,
			actor: input.query.actor,
			action: input.query.action,
			targetId: input.query.targetId,
		});

		return ok({
			data: result.rows,
			nextCursor: result.nextCursor,
		});
	});
