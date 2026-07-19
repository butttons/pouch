export const AUDIT_LOG_ACTION = [
	"key.create",
	"collection.create",
	"collection.schema.update",
	"collection.delete",
	"content.create",
	"content.batch.create",
	"content.update",
	"content.batch.update",
	"content.delete",
	"content.batch.delete",
	"media.create",
	"media.delete",
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTION)[number];

export type AuditLogDiff = Record<string, unknown> | null;

export type AuditLogEvent = {
	action: AuditLogAction;
	actor: string;
	targetId: string;
	diff?: AuditLogDiff;
};
