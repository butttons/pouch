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
