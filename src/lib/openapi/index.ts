import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import {
	d1BookmarkHeader,
	d1BookmarkParam,
	errorSchema,
	errorSchemaRef,
} from "@/lib/openapi/helpers";

import { auditLogPaths, auditLogSchemas } from "@/routes/audit-log/_openapi";
import { authPaths } from "@/routes/auth/_openapi";
import {
	collectionPaths,
	collectionSchemas,
} from "@/routes/collection/_openapi";
import {
	buildContentPaths,
	buildContentSchemas,
	contentBatchDeleteInputSchema,
	contentBatchDeleteInputSchemaRef,
} from "@/routes/content/_openapi";
import { mediaPaths, mediaSchemas } from "@/routes/media/_openapi";

import packageJson from "../../../package.json";
import type { Deps } from "@/deps";

const baseInfo = {
	title: "pouch",
	version: packageJson.version,
	description:
		"API-first headless CMS backed by Cloudflare D1. All endpoints except /auth/keys require a Bearer token with the appropriate scope. Read-after-write consistency across D1 replicas is supported via the x-d1-bookmark header. Collection schemas are standard JSON Schema with five CMS extensions: x-label (display name), x-widget (authoring hint, e.g. richtext), x-relation (target collection slug), x-index (filterable generated column), and x-media (media reference).",
};

const tags = [
	{ name: "Auth", description: "API key management" },
	{ name: "Collections", description: "Collection and schema management" },
	{ name: "Media", description: "File uploads and media records" },
	{ name: "Audit Log", description: "Audit log entries" },
	{ name: "OAuth", description: "OAuth client registry for the MCP endpoint" },
];

const securitySchemes = {
	bearerAuth: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"JWT API key. Create a key via POST /auth/keys using the worker JWT_SECRET, then send it as `Authorization: Bearer <token>`. Tokens carry scopes that determine which endpoints are accessible. See each operation's x-required-scopes extension for the required scope.",
	},
};

/**
 * Builds the full OpenAPI document. Static path/schema pieces are colocated
 * with their routes (`_openapi.ts`); this only assembles them plus the
 * per-collection content pieces derived from live collection schemas.
 */
export const assembleOpenAPIDocument = (
	deps: Deps,
	baseUrl?: string,
): ResultAsync<Record<string, unknown>, DataLayerError> =>
	safeTry(async function* () {
		const collections = yield* deps.DL.collection.listCollectionsWithSchema();

		const dynamicSchemas: Record<string, unknown> = {};
		const dynamicPaths: Record<string, unknown> = {};

		for (const collection of collections) {
			Object.assign(
				dynamicSchemas,
				buildContentSchemas({
					slug: collection.slug,
					schema: collection.schema,
				}),
			);
			Object.assign(
				dynamicPaths,
				buildContentPaths({
					slug: collection.slug,
					schema: collection.schema,
				}),
			);
		}

		const collectionSlugs = collections.map((c) => c.slug);
		const servers = baseUrl ? [{ url: baseUrl }] : undefined;

		return ok({
			openapi: "3.1.0",
			info: baseInfo,
			tags,
			"x-tagGroups": [
				{
					name: "Management",
					tags: ["Auth", "Collections", "Media", "Audit Log"],
				},
				{ name: "Content", tags: collectionSlugs },
			],
			servers,
			paths: {
				...authPaths,
				...collectionPaths,
				...mediaPaths,
				...auditLogPaths,
				...dynamicPaths,
			},
			components: {
				securitySchemes,
				parameters: {
					d1Bookmark: d1BookmarkParam,
				},
				headers: {
					d1Bookmark: d1BookmarkHeader,
				},
				schemas: {
					[errorSchemaRef]: errorSchema,
					[contentBatchDeleteInputSchemaRef]: contentBatchDeleteInputSchema,
					...collectionSchemas,
					...mediaSchemas,
					...auditLogSchemas,
					...dynamicSchemas,
				},
			},
		});
	});
