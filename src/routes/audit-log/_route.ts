import { unwrapResult } from "@/lib/errors";
import { paramValidator, queryValidator } from "@/lib/validator";

import { requireScopes } from "@/middleware/auth";
import { createRouter } from "@/utils";

import {
	type AuditLogIdParam,
	type AuditLogQuery,
	auditLogIdParamSchema,
	auditLogQuerySchema,
} from "./_schema";
import { listAuditLogs } from "./_service.get";
import { getAuditLogById } from "./_service.get-by-id";

export const auditLogRouter = createRouter()
	.get(
		"/",
		requireScopes("schema:admin"),
		queryValidator<AuditLogQuery>(auditLogQuerySchema),
		async (c) => {
			const query = c.req.valid("query");
			const result = await listAuditLogs({ query }, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.get(
		"/:id",
		requireScopes("schema:admin"),
		paramValidator<AuditLogIdParam>(auditLogIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await getAuditLogById(params, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	);
