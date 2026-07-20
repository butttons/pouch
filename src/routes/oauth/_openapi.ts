import { errorResponse, withOperation } from "@/lib/openapi-helpers";

import {
	createOAuthClientInputSchema,
	oauthClientListResponseSchema,
	oauthClientResponseSchema,
	updateOAuthClientInputSchema,
} from "./_schema";

export const oauthClientSchemaRef = "__OAuthClient";
export const oauthClientListResponseSchemaRef = "__OAuthClientListResponse";
export const createOAuthClientInputSchemaRef = "__CreateOAuthClientInput";
export const updateOAuthClientInputSchemaRef = "__UpdateOAuthClientInput";

export const oauthClientSchemas = {
	[oauthClientSchemaRef]: oauthClientResponseSchema,
	[oauthClientListResponseSchemaRef]: oauthClientListResponseSchema,
	[createOAuthClientInputSchemaRef]: createOAuthClientInputSchema,
	[updateOAuthClientInputSchemaRef]: updateOAuthClientInputSchema,
};

const oauthClientTags = ["OAuth"];

const clientIdParameter = {
	name: "id",
	in: "path",
	required: true,
	schema: { type: "string" },
	description: "OAuth client ID (caller-supplied or generated `ocl_` ID).",
};

export const oauthClientPaths = {
	"/oauth/clients": {
		get: withOperation(
			{
				summary: "List OAuth clients",
				description:
					"Lists registered OAuth clients from the KV registry. These are the clients allowed to request authorization grants for the /mcp endpoint.",
				operationId: "list_oauth_clients",
				tags: oauthClientTags,
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						name: "limit",
						in: "query",
						required: false,
						schema: {
							type: "integer",
							minimum: 1,
							maximum: 100,
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
							description: "Pagination cursor from the previous page.",
						},
					},
				],
				responses: {
					"200": {
						description: "List of OAuth clients",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${oauthClientListResponseSchemaRef}`,
								},
							},
						},
					},
				},
			},
			["schema:admin"],
		),
		post: withOperation(
			{
				summary: "Register OAuth client",
				description:
					"Registers a new public (PKCE-only) OAuth client allowed to request grants for the /mcp endpoint. Pass a stable clientId (e.g. `claude-ai`) or omit it to get a generated `ocl_` ID. `maxScopes` is the ceiling of scopes this client may ever be granted; the consent screen shows only the intersection of requested scopes and `maxScopes`.",
				operationId: "create_oauth_client",
				tags: oauthClientTags,
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${createOAuthClientInputSchemaRef}`,
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Registered OAuth client",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${oauthClientSchemaRef}`,
								},
							},
						},
					},
					"409": errorResponse(409, "OAuth client already exists"),
				},
			},
			["schema:admin"],
		),
	},
	"/oauth/clients/{id}": {
		get: withOperation(
			{
				summary: "Get OAuth client by ID",
				description: "Returns a single registered OAuth client.",
				operationId: "get_oauth_client_by_id",
				tags: oauthClientTags,
				security: [{ bearerAuth: [] }],
				parameters: [clientIdParameter],
				responses: {
					"200": {
						description: "OAuth client details",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${oauthClientSchemaRef}`,
								},
							},
						},
					},
					"404": errorResponse(404, "OAuth client not found"),
				},
			},
			["schema:admin"],
		),
		patch: withOperation(
			{
				summary: "Update OAuth client",
				description:
					"Updates an OAuth client's name, redirect URIs, or scope ceiling.",
				operationId: "update_oauth_client",
				tags: oauthClientTags,
				security: [{ bearerAuth: [] }],
				parameters: [clientIdParameter],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${updateOAuthClientInputSchemaRef}`,
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Updated OAuth client",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${oauthClientSchemaRef}`,
								},
							},
						},
					},
					"404": errorResponse(404, "OAuth client not found"),
				},
			},
			["schema:admin"],
		),
		delete: withOperation(
			{
				summary: "Delete OAuth client",
				description:
					"Deletes an OAuth client and revokes all grants issued to it.",
				operationId: "delete_oauth_client",
				tags: oauthClientTags,
				security: [{ bearerAuth: [] }],
				parameters: [clientIdParameter],
				responses: {
					"204": { description: "OAuth client deleted" },
					"404": errorResponse(404, "OAuth client not found"),
				},
			},
			["schema:admin"],
		),
	},
};
