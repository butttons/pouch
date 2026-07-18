import { validator } from "hono/validator";
import Schema from "typebox/schema";

import { AppHTTPException, ErrorCodes } from "./errors";

const validate = <T>(value: unknown, schema: object, message: string): T => {
	const compiled = Schema.Compile(schema);
	const [isValid, errors] = compiled.Errors(value);

	if (!isValid) {
		const firstError = errors[0];
		throw new AppHTTPException({
			code: ErrorCodes.VALIDATION_FAILED,
			message: firstError?.message ?? message,
			status: 400,
		});
	}

	return value as T;
};

export const jsonValidator = <T>(schema: object) =>
	validator("json", (value, c) =>
		validate<T>(value, schema, "Invalid request body"),
	);

export const paramValidator = <T>(schema: object) =>
	validator("param", (value, c) =>
		validate<T>(value, schema, "Invalid path parameters"),
	);

export const queryValidator = <T>(schema: object) =>
	validator("query", (value, c) =>
		validate<T>(value, schema, "Invalid query parameters"),
	);
