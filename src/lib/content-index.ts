const COLLECTION_HASH_LENGTH = 12;
const INDEX_PREFIX = "idx";
const MAX_IDENTIFIER_LENGTH = 63;

export const INDEXED_FIELD_MAX_KEY_LENGTH =
	MAX_IDENTIFIER_LENGTH - INDEX_PREFIX.length - 1 - COLLECTION_HASH_LENGTH - 1;

type JsonSchemaProperty = {
	type?: string | string[];
	"x-index"?: unknown;
};

const getProperties = (
	schema: Record<string, unknown>,
): Record<string, JsonSchemaProperty> => {
	if (
		!schema.properties ||
		typeof schema.properties !== "object" ||
		Array.isArray(schema.properties)
	) {
		return {};
	}

	return schema.properties as Record<string, JsonSchemaProperty>;
};

const fnv1a48 = (input: string): string => {
	let hash = 0xcbf29ce484222325n;
	const prime = 0x100000001b3n;

	for (let i = 0; i < input.length; i++) {
		hash ^= BigInt(input.charCodeAt(i));
		hash = (hash * prime) & 0xffffffffffffffffn;
	}

	const lower48 = hash & 0xffffffffffffn;
	return lower48.toString(16).padStart(COLLECTION_HASH_LENGTH, "0");
};

/**
 * Computes a 48-bit FNV-1a hash of a collection ID for stable identifier suffixes.
 */
export const computeCollectionHash = (collectionId: string): string =>
	fnv1a48(collectionId);

/**
 * Builds the SQLite index name for an indexed field.
 */
export const computeIndexName = (input: {
	collectionId: string;
	field: string;
}): string => {
	const hash = computeCollectionHash(input.collectionId);
	return `${INDEX_PREFIX}_${hash}_${input.field}`;
};

/**
 * Builds the SQLite json_extract expression for a content data field.
 * The path is inlined as a literal so expression indexes match syntactically.
 */
export const buildJsonExtractExpression = (input: {
	field: string;
	column?: string;
}): string => {
	const column = input.column ?? "data";
	const path = `$.${input.field}`;
	return `json_extract(${column}, '${path.replace(/'/g, "''")}')`;
};

/**
 * Builds the SQLite index expression for a collection field index.
 * The expression is a composite of collection_id and the inlined json_extract.
 */
export const buildIndexExpression = (input: {
	collectionId: string;
	field: string;
}): string => {
	const extract = buildJsonExtractExpression({ field: input.field });
	return `collection_id, ${extract}`;
};

/**
 * Returns the keys of all properties marked with x-index.
 */
export const getIndexedFields = (schema: Record<string, unknown>): string[] => {
	const properties = getProperties(schema);

	return Object.entries(properties)
		.filter(([, property]) => property["x-index"] === true)
		.map(([key]) => key);
};

export type IndexDiff = {
	added: string[];
	removed: string[];
};

/**
 * Compares old and new schemas to find added or removed indexed fields.
 */
export const diffIndexedFields = (
	oldSchema: Record<string, unknown>,
	newSchema: Record<string, unknown>,
): IndexDiff => {
	const oldFields = new Set(getIndexedFields(oldSchema));
	const newFields = new Set(getIndexedFields(newSchema));

	const added: string[] = [];
	const removed: string[] = [];

	for (const field of newFields) {
		if (!oldFields.has(field)) {
			added.push(field);
		}
	}

	for (const field of oldFields) {
		if (!newFields.has(field)) {
			removed.push(field);
		}
	}

	return { added, removed };
};

/**
 * Validates that x-index fields are scalar and within the key length limit.
 */
export const validateIndexedFields = (
	schema: Record<string, unknown>,
): { field: string; message: string }[] => {
	const properties = getProperties(schema);
	const errors: { field: string; message: string }[] = [];

	for (const [field, property] of Object.entries(properties)) {
		if (property["x-index"] !== true) {
			continue;
		}

		if (field.length > INDEXED_FIELD_MAX_KEY_LENGTH) {
			errors.push({
				field,
				message: `Indexed field key exceeds maximum length of ${INDEXED_FIELD_MAX_KEY_LENGTH}`,
			});
		}

		if (property.type === "array" || property.type === "object") {
			errors.push({
				field,
				message: "x-index is only supported on scalar fields",
			});
		}

		if (
			property.type !== "string" &&
			property.type !== "integer" &&
			property.type !== "number" &&
			property.type !== "boolean"
		) {
			errors.push({
				field,
				message:
					"x-index requires a scalar type (string, integer, number, or boolean)",
			});
		}
	}

	return errors;
};
