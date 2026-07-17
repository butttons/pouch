import { err, Result } from "neverthrow";
import Schema from "typebox/schema";

import { AppHTTPException, ErrorCodes } from "./errors";

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

const getDepth = (obj: unknown, currentDepth = 0): number => {
	if (currentDepth > MAX_DEPTH) return currentDepth;
	if (typeof obj !== "object" || obj === null) return currentDepth;
	if (Array.isArray(obj)) {
		return obj.reduce(
			(max, item) => Math.max(max, getDepth(item, currentDepth + 1)),
			currentDepth,
		);
	}
	const values = Object.values(obj);
	if (values.length === 0) return currentDepth;
	return values.reduce(
		(max, value) => Math.max(max, getDepth(value, currentDepth + 1)),
		currentDepth,
	);
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

	const depth = getDepth(schema);
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

export const validateCollectionSchema = (
	schema: Record<string, unknown>,
): Result<void, AppHTTPException> => {
	const structuralError = validateSchemaStructure(schema);
	if (structuralError) {
		return err(structuralError);
	}

	const compileResult = Result.fromThrowable(
		() => Schema.Compile(schema),
		(error) => {
			const message =
				error instanceof Error ? error.message : "Invalid schema";
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
