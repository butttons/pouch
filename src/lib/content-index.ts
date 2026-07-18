const COLLECTION_HASH_LENGTH = 12;
const COLUMN_PREFIX = "idx";
const INDEX_SUFFIX = "idx";
const MAX_IDENTIFIER_LENGTH = 63;

export const INDEXED_FIELD_MAX_KEY_LENGTH =
	MAX_IDENTIFIER_LENGTH -
	COLUMN_PREFIX.length -
	1 -
	COLLECTION_HASH_LENGTH -
	1 -
	INDEX_SUFFIX.length -
	1;

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
 * Builds the SQLite generated column name for an indexed field.
 */
export const computeIndexColumnName = (input: {
	collectionId: string;
	field: string;
}): string => {
	const hash = computeCollectionHash(input.collectionId);
	return `${COLUMN_PREFIX}_${hash}_${input.field}`;
};

/**
 * Builds the SQLite index name for an indexed field.
 */
export const computeIndexName = (input: {
	collectionId: string;
	field: string;
}): string => {
	const hash = computeCollectionHash(input.collectionId);
	return `${COLUMN_PREFIX}_${hash}_${input.field}_${INDEX_SUFFIX}`;
};

/**
 * Maps a JSON schema property type to its SQLite column type.
 */
export const getIndexColumnType = (property: JsonSchemaProperty): string => {
	if (property.type === "integer") {
		return "INTEGER";
	}

	if (property.type === "number") {
		return "REAL";
	}

	if (property.type === "boolean") {
		return "INTEGER";
	}

	return "TEXT";
};

/**
 * Returns the keys of all properties marked with x-index.
 */
export const getIndexedFields = (
	schema: Record<string, unknown>,
): string[] => {
	const properties = getProperties(schema);

	return Object.entries(properties)
		.filter(([, property]) => property["x-index"] === true)
		.map(([key]) => key);
};

type IndexedFieldInfo = {
	field: string;
	type: string;
};

/**
 * Returns indexed fields with their SQLite column types.
 */
export const getIndexedFieldsWithTypes = (
	schema: Record<string, unknown>,
): IndexedFieldInfo[] => {
	const properties = getProperties(schema);

	return Object.entries(properties)
		.filter(([, property]) => property["x-index"] === true)
		.map(([field, property]) => ({
			field,
			type: getIndexColumnType(property),
		}));
};

export type IndexDiff = {
	added: IndexedFieldInfo[];
	removed: IndexedFieldInfo[];
	changed: IndexedFieldInfo[];
};

/**
 * Compares old and new schemas to find added, removed, and changed indexed fields.
 */
export const diffIndexedFields = (
	oldSchema: Record<string, unknown>,
	newSchema: Record<string, unknown>,
): IndexDiff => {
	const oldFields = new Map(
		getIndexedFieldsWithTypes(oldSchema).map((info) => [info.field, info]),
	);
	const newFields = new Map(
		getIndexedFieldsWithTypes(newSchema).map((info) => [info.field, info]),
	);

	const added: IndexedFieldInfo[] = [];
	const removed: IndexedFieldInfo[] = [];
	const changed: IndexedFieldInfo[] = [];

	for (const [field, info] of newFields) {
		const old = oldFields.get(field);

		if (!old) {
			added.push(info);
		} else if (old.type !== info.type) {
			changed.push(info);
		}
	}

	for (const [field, info] of oldFields) {
		if (!newFields.has(field)) {
			removed.push(info);
		}
	}

	return { added, removed, changed };
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
