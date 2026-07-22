import { err, Result } from "neverthrow";
import Schema from "typebox/schema";

import { validateIndexedFields } from "@/lib/content-index";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

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
