export const d1BookmarkParam = {
	name: "x-d1-bookmark",
	in: "header",
	required: false,
	schema: { type: "string" },
	description:
		"D1 read-replication bookmark from a previous response. When provided, the request is anchored to a D1 session at this bookmark and the response will include the next bookmark.",
};

export const d1BookmarkHeader = {
	description:
		"Next D1 read-replication bookmark. Pass this value in the x-d1-bookmark header of subsequent read requests to maintain read-after-write consistency. Only returned when an x-d1-bookmark request header was provided.",
	schema: { type: "string" },
};

export const errorSchema = {
	type: "object",
	properties: {
		code: {
			type: "string",
			description:
				"Machine-readable error code. Common values: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_FAILED, CONFLICT, INTERNAL_ERROR.",
		},
		message: {
			type: "string",
			description: "Human-readable error description.",
		},
		status: {
			type: "number",
			description: "HTTP status code for the error.",
		},
	},
	required: ["code", "message", "status"],
	additionalProperties: false,
};

export const errorSchemaRef = "Error";

const statusTexts: Record<number, string> = {
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	409: "Conflict",
	422: "Unprocessable Entity",
	500: "Internal Server Error",
};

export const errorResponse = (
	status: number,
	description?: string,
): Record<string, unknown> => ({
	description: description ?? statusTexts[status] ?? "Error",
	content: {
		"application/json": {
			schema: { $ref: `#/components/schemas/${errorSchemaRef}` },
		},
	},
});

export const withErrorResponses = (
	operation: Record<string, unknown>,
): Record<string, unknown> => {
	const responses: Record<string, unknown> = {
		...(operation.responses as Record<string, unknown>),
		"401": errorResponse(401, "Invalid or missing Bearer token"),
		"403": errorResponse(403, "Missing required scopes"),
		"500": errorResponse(500, "Unknown error"),
	};
	return { ...operation, responses };
};

export const withD1Bookmark = (
	operation: Record<string, unknown>,
): Record<string, unknown> => {
	const parameters = [
		...(Array.isArray(operation.parameters) ? operation.parameters : []),
		{ $ref: "#/components/parameters/d1Bookmark" },
	];

	const responses: Record<string, unknown> = {};
	for (const [code, response] of Object.entries(
		operation.responses as Record<string, unknown>,
	)) {
		const responseObj =
			typeof response === "object" && response !== null
				? { ...(response as Record<string, unknown>) }
				: {};
		const headers: Record<string, unknown> = {
			...((responseObj.headers as Record<string, unknown> | undefined) ?? {}),
			"x-d1-bookmark": { $ref: "#/components/headers/d1Bookmark" },
		};
		responses[code] = { ...responseObj, headers };
	}

	return { ...operation, parameters, responses };
};

export const withScopes = (
	operation: Record<string, unknown>,
	scopes: string[],
): Record<string, unknown> => {
	const scopeText =
		scopes.length === 1
			? `Requires scope: ${scopes[0]}.`
			: `Requires scopes: ${scopes.join(", ")}.`;
	const description = operation.description
		? `${operation.description} ${scopeText}`
		: scopeText;

	return {
		...operation,
		description,
		"x-required-scopes": scopes,
	};
};

export const withOperation = (
	operation: Record<string, unknown>,
	scopes: string[],
): Record<string, unknown> =>
	withErrorResponses(withScopes(withD1Bookmark(operation), scopes));
