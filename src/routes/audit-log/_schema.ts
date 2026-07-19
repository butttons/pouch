import { Type } from "typebox";

import { AUDIT_LOG_ACTION } from "@/lib/audit-log";

export const auditLogIdParamSchema = Type.Object(
	{
		id: Type.String({ pattern: "^aud_" }),
	},
	{ additionalProperties: false },
);

export type AuditLogIdParam = Type.Static<typeof auditLogIdParamSchema>;

export const auditLogQuerySchema = Type.Object(
	{
		limit: Type.Optional(Type.String()),
		cursor: Type.Optional(Type.String({ pattern: "^aud_" })),
		actor: Type.Optional(Type.String()),
		action: Type.Optional(Type.String()),
		targetId: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export type AuditLogQuery = Type.Static<typeof auditLogQuerySchema>;

export const auditLogResponseSchema = Type.Object(
	{
		id: Type.String(),
		actor: Type.String(),
		action: Type.String(),
		targetId: Type.String(),
		diff: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
		createdAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export type AuditLog = Type.Static<typeof auditLogResponseSchema>;

export const auditLogListResponseSchema = Type.Object(
	{
		data: Type.Array(auditLogResponseSchema),
		nextCursor: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type AuditLogListResponse = Type.Static<typeof auditLogListResponseSchema>;
