import { err, ok, Result } from "neverthrow";
import { atomizeChangeset, diff, type IAtomicChange } from "json-diff-ts";
import Schema from "typebox/schema";

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

const PROPERTY_REMOVE_REGEX = /^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)$/;
const PROPERTY_TYPE_CHANGE_REGEX = /^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)\.type$/;

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

export const validateContentData = (
	input: {
		data: Record<string, unknown>;
		schema: Record<string, unknown>;
	},
): Result<void, { errors: ContentValidationError[] }> => {
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

export const diffCollectionSchemas = (
	oldSchema: Record<string, unknown>,
	newSchema: Record<string, unknown>,
): Result<
	{ diff: unknown; destructiveChanges: string[] },
	AppHTTPException
> =>
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
