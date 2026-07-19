import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";

import type { AuditLog, AuditLogIdParam } from "./_schema";
import { requireAuditLogById } from "./_util.require-audit-log";
import type { Deps } from "@/deps";

export const getAuditLogById = (
	input: AuditLogIdParam,
	deps: Deps,
): ResultAsync<AuditLog, DataLayerError | Error> =>
	safeTry(async function* () {
		const auditLog = yield* requireAuditLogById({ id: input.id, DL: deps.DL });
		return ok(auditLog);
	});
