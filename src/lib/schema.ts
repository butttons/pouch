import { atomizeChangeset, diff, type IAtomicChange } from "json-diff-ts";
import { err, ok, Result } from "neverthrow";
import Schema from "typebox/schema";

import { validateIndexedFields } from "./content-index";
import { AppHTTPException, ErrorCodes } from "./errors";

export type ContentValidationError = {
	field: string;
	constraint: string;
	expected: unknown;
	received: unknown;
};

const RESERVED_KEYS = new Set([
	"id",
	"collection_id",
	"data",
	"status",
	"created_at",
	"updated_at",
	"schema_version_id",
]);

const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const MAX_PROPERTIES = 50;
const MAX_DEPTH = 3;

const getDataDepth = (schema: unknown): number => {
	if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
		return 0;
	}

	const schemaObj = schema as Record<string, unknown>;
	const type = schemaObj.type;

	if (type === "object") {
		const properties = schemaObj.properties;
		if (
			properties &&
			typeof properties === "object" &&
			!Array.isArray(properties)
		) {
			const childDepths = Object.values(
				properties as Record<string, unknown>,
			).map(getDataDepth);
			const maxChildDepth =
				childDepths.length > 0 ? Math.max(...childDepths) : 0;
			return 1 + maxChildDepth;
		}
		return 1;
	}

	if (type === "array") {
		const items = schemaObj.items;
		if (items && typeof items === "object" && !Array.isArray(items)) {
			return getDataDepth(items);
		}
		return 0;
	}

	return 0;
};

const validateSchemaStructure = (
	schema: Record<string, unknown>,
): AppHTTPException | null => {
	if (typeof schema !== "object" || schema === null) {
		return new AppHTTPException({
			code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
			message: "Schema must be an object",
			status: 400,
		});
	}

	const depth = getDataDepth(schema);
	if (depth > MAX_DEPTH) {
		return new AppHTTPException({
			code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
			message: `Schema depth exceeds maximum of ${MAX_DEPTH}`,
			status: 400,
		});
	}

	const properties = schema.properties;
	if (properties && typeof properties === "object") {
		const keys = Object.keys(properties);
		if (keys.length > MAX_PROPERTIES) {
			return new AppHTTPException({
				code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
				message: `Schema exceeds maximum of ${MAX_PROPERTIES} properties`,
				status: 400,
			});
		}

		for (const key of keys) {
			if (!KEY_PATTERN.test(key)) {
				return new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
					message: `Invalid property key: ${key}`,
					status: 400,
				});
			}
			if (RESERVED_KEYS.has(key)) {
				return new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
					message: `Reserved property key: ${key}`,
					status: 400,
				});
			}
		}
	}

	return null;
};

const validateIndexConstraints = (
	schema: Record<string, unknown>,
): AppHTTPException | null => {
	const errors = validateIndexedFields(schema);

	if (errors.length === 0) {
		return null;
	}

	const details = errors
		.map((error) => `${error.field}: ${error.message}`)
		.join("; ");

	return new AppHTTPException({
		code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
		message: `Invalid x-index usage: ${details}`,
		status: 400,
	});
};

/**
 * Validates a collection schema's structure, indexes, and compilability.
 */
export const validateCollectionSchema = (
	schema: Record<string, unknown>,
): Result<void, AppHTTPException> => {
	const structuralError = validateSchemaStructure(schema);
	if (structuralError) {
		return err(structuralError);
	}

	const indexError = validateIndexConstraints(schema);
	if (indexError) {
		return err(indexError);
	}

	const compileResult = Result.fromThrowable(
		() => Schema.Compile(schema),
		(error) => {
			const message = error instanceof Error ? error.message : "Invalid schema";
			return new AppHTTPException({
				code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
				message,
				status: 400,
				cause: error,
			});
		},
	)();

	return compileResult.map(() => undefined);
};

const PROPERTY_REMOVE_REGEX = /^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)$/;
const PROPERTY_TYPE_CHANGE_REGEX =
	/^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)\.type$/;

const getDestructiveChangeKeys = (changeset: unknown): string[] => {
	const atomic = atomizeChangeset(changeset as never) as IAtomicChange[];
	const keys: string[] = [];

	for (const change of atomic) {
		const removeMatch = PROPERTY_REMOVE_REGEX.exec(change.path);
		const typeMatch = PROPERTY_TYPE_CHANGE_REGEX.exec(change.path);

		if (
			(change.type === "REMOVE" && removeMatch) ||
			(change.type === "UPDATE" && typeMatch)
		) {
			const key = removeMatch?.[1] ?? typeMatch?.[1];
			if (key && !keys.includes(key)) {
				keys.push(key);
			}
		}
	}

	return keys;
};

type TypeBoxValidationError = {
	path: string;
	type: string;
	schema: unknown;
	value: unknown;
};

/**
 * Validates content data against a collection schema.
 */
export const validateContentData = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
}): Result<void, { errors: ContentValidationError[] }> => {
	const compileResult = Result.fromThrowable(
		() => Schema.Compile(input.schema),
		() => ({ errors: [] as ContentValidationError[] }),
	)();

	return compileResult.andThen((compiled) => {
		const [isValid, errors] = compiled.Errors(input.data);

		if (isValid) {
			return ok(undefined);
		}

		const typedErrors = errors as unknown as TypeBoxValidationError[];

		return err({
			errors: typedErrors.map((error) => ({
				field: error.path || "(root)",
				constraint: error.type,
				expected: error.schema,
				received: error.value,
			})),
		});
	});
};

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

export type MediaFieldInfo = {
	field: string;
	isMany: boolean;
};

/**
 * Returns all fields marked with x-media: true.
 */
export const getMediaFields = (input: {
	schema: Record<string, unknown>;
}): MediaFieldInfo[] => {
	const schema = input.schema;
	const properties =
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, Record<string, unknown>>)
			: {};

	const fields: MediaFieldInfo[] = [];

	for (const [field, property] of Object.entries(properties)) {
		if (property["x-media"] === true) {
			fields.push({ field, isMany: property.type === "array" });
		}
	}

	return fields;
};

/**
 * Validates that a value is a valid MediaObject { id, path }.
 */
export const isValidMediaObject = (input: {
	value: unknown;
}): input is { value: { id: string; path: string } } => {
	const value = input.value;

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj.id === "string" &&
		obj.id.startsWith("med_") &&
		typeof obj.path === "string"
	);
};

/**
 * Validates that a value is an array of valid MediaObjects.
 */
export const isValidMediaArray = (input: {
	value: unknown;
}): input is { value: Array<{ id: string; path: string }> } => {
	const value = input.value;

	if (!Array.isArray(value)) {
		return false;
	}

	return value.every((item) => isValidMediaObject({ value: item }));
};

/**
 * Returns media IDs from a single media object or an array of media objects.
 */
export const getMediaIdsFromValue = (input: { value: unknown }): string[] => {
	const mediaObject = { value: input.value };
	if (isValidMediaObject(mediaObject)) {
		return [mediaObject.value.id];
	}

	const mediaArray = { value: input.value };
	if (isValidMediaArray(mediaArray)) {
		return mediaArray.value.map((item) => item.id);
	}

	return [];
};

/**
 * Returns media object IDs from content data for x-media fields.
 */
export const collectMediaIds = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
}): string[] => {
	const mediaFields = getMediaFields({ schema: input.schema });
	const ids: string[] = [];

	for (const { field } of mediaFields) {
		ids.push(...getMediaIdsFromValue({ value: input.data[field] }));
	}

	return ids;
};

/**
 * Diffs two schemas and returns the changeset plus any destructive property changes.
 */
export const diffCollectionSchemas = (
	oldSchema: Record<string, unknown>,
	newSchema: Record<string, unknown>,
): Result<{ diff: unknown; destructiveChanges: string[] }, AppHTTPException> =>
	Result.fromThrowable(
		() => {
			const changeset = diff(oldSchema, newSchema);
			return {
				diff: changeset,
				destructiveChanges: getDestructiveChangeKeys(changeset),
			};
		},
		(error) =>
			new AppHTTPException({
				code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
				message:
					error instanceof Error ? error.message : "Failed to diff schemas",
				status: 400,
				cause: error,
			}),
	)();
