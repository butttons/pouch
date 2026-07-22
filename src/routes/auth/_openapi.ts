import {
	errorResponse,
	withD1Bookmark,
	withErrorResponses,
} from "@/lib/openapi/helpers";

export const authPaths = {
	"/auth/keys": {
		post: withErrorResponses(
			withD1Bookmark({
				summary: "Create API key",
				description:
					"Creates a new JWT API key. Requires the JWT_SECRET configured on the worker.",
				operationId: "create_api_key",
				tags: ["Auth"],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									secret: {
										type: "string",
										description:
											"The JWT_SECRET value from the worker environment.",
										example: "a1b2c3d4e5f6...",
									},
									name: {
										type: "string",
										description:
											"Human-readable name identifying the key holder. Recorded in audit logs.",
										example: "my-agent",
									},
									scopes: {
										type: "array",
										items: {
											type: "string",
											enum: [
												"content:read",
												"content:write",
												"collection:read",
												"collection:write",
												"media:read",
												"media:write",
												"audit:read",
											],
										},
										minItems: 1,
										description: "Scopes for the new key.",
										example: ["content:read", "content:write"],
									},
									collections: {
										type: "array",
										items: { type: "string" },
										minItems: 1,
										description:
											"Restricts the key to these collection slugs. Every collection-scoped route (content, schema, delete) 403s for other collections. Omit for access to all collections.",
										example: ["faqs", "pages"],
									},
									expiresInSeconds: {
										type: "number",
										minimum: 60,
										description:
											"Key lifetime in seconds. Defaults to 180 days.",
										example: 86400,
									},
								},
								required: ["secret", "name", "scopes"],
								additionalProperties: false,
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created API key",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: {
											type: "string",
											description:
												"JWT token to use as `Authorization: Bearer <token>`.",
										},
										jti: {
											type: "string",
											description: "Unique key identifier.",
										},
										name: {
											type: "string",
											description: "Name identifying the key holder.",
										},
										scopes: {
											type: "array",
											items: { type: "string" },
											description: "Scopes granted to the key.",
										},
										collections: {
											type: "array",
											items: { type: "string" },
											description:
												"Collection slugs the key is restricted to. Absent when unrestricted.",
										},
										exp: {
											type: "number",
											description: "Unix timestamp when the key expires.",
										},
									},
									required: ["token", "jti", "name", "scopes", "exp"],
									additionalProperties: false,
								},
							},
						},
					},
					"401": errorResponse(401, "Invalid secret"),
				},
			}),
		),
	},
};
