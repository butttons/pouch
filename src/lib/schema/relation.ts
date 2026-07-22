/**
 * Returns the unique target collection slugs referenced by x-relation fields.
 */
export const getRelationTargets = (
	schema: Record<string, unknown>,
): string[] => {
	const properties =
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, Record<string, unknown>>)
			: {};

	const targets = new Set<string>();

	for (const property of Object.values(properties)) {
		const targetSlug = property["x-relation"];
		if (typeof targetSlug === "string" && targetSlug.length > 0) {
			targets.add(targetSlug);
		}
	}

	return Array.from(targets);
};
