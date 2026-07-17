export const createCollectionInputSchema = {
	type: "object",
	properties: {
		slug: { type: "string", minLength: 1 },
		name: { type: "string", minLength: 1 },
		schema: { type: "object" },
		titleField: { type: "string" },
	},
	required: ["slug", "name", "schema"],
	additionalProperties: false,
} as const;

export type CreateCollectionInput = {
	slug: string;
	name: string;
	schema: Record<string, unknown>;
	titleField?: string;
};
