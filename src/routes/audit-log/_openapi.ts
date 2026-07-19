import { errorResponse, withOperation } from "@/lib/openapi-helpers";

import { auditLogListResponseSchema, auditLogResponseSchema } from "./_schema";

export const SYSTEM_SCHEMA_PREFIX = "__";

export const auditLogSchemaRef = `${SYSTEM_SCHEMA_PREFIX}AuditLog`;
export const auditLogListResponseSchemaRef = `${SYSTEM_SCHEMA_PREFIX}AuditLogListResponse`;

export const auditLogSchemas = {
  [auditLogSchemaRef]: auditLogResponseSchema,
  [auditLogListResponseSchemaRef]: auditLogListResponseSchema,
};

const auditLogTags = ["Audit Log"];

export const auditLogPaths = {
  "/audit-logs": {
    get: withOperation(
      {
        summary: "List audit logs",
        description: "Lists audit log entries with optional filtering.",
        operationId: "listAuditLogs",
        tags: auditLogTags,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              default: 50,
              description: "Maximum number of items to return.",
            },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: {
              type: "string",
              pattern: "^aud_",
              description: "ID of the last item from the previous page.",
            },
          },
          {
            name: "actor",
            in: "query",
            required: false,
            schema: {
              type: "string",
              description: "Filter by actor name or identifier.",
            },
          },
          {
            name: "action",
            in: "query",
            required: false,
            schema: {
              type: "string",
              description: "Filter by action type.",
            },
          },
          {
            name: "targetId",
            in: "query",
            required: false,
            schema: {
              type: "string",
              description: "Filter by target ID.",
            },
          },
        ],
        responses: {
          "200": {
            description: "List of audit logs",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${auditLogListResponseSchemaRef}`,
                },
              },
            },
          },
        },
      },
      ["schema:admin"],
    ),
  },
  "/audit-logs/{id}": {
    get: withOperation(
      {
        summary: "Get audit log by ID",
        description: "Returns a single audit log entry.",
        operationId: "getAuditLogById",
        tags: auditLogTags,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Audit log details",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${auditLogSchemaRef}`,
                },
              },
            },
          },
          "404": errorResponse(404, "Audit log not found"),
        },
      },
      ["schema:admin"],
    ),
  },
};
