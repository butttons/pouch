import { fromPromise } from "neverthrow";

import type { Database } from "@/lib/db/client";
import { createAuditLogInsert, type AuditLogEvent } from "@/lib/audit-log";

import { BaseDataLayer } from "./_base";

export class AuditLogDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "audit_log";
	}

	buildInsert(event: AuditLogEvent) {
		return createAuditLogInsert(this.db, event);
	}

	insert(event: AuditLogEvent) {
		return fromPromise(
			this.buildInsert(event).execute(),
			this.passThroughError({
				message: "Failed to insert audit log",
				code: "CREATE_FAILED",
				source: "DL.auditLog.insert",
				input: event,
			}),
		);
	}
}
