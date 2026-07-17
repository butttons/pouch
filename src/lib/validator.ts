import { validator } from "hono/validator";
import Schema from "typebox/schema";

import { AppHTTPException, ErrorCodes } from "./errors";

export const jsonValidator = <T>(schema: object) =>
	validator("json", (value, c) => {
		const compiled = Schema.Compile(schema);
		const [isValid, errors] = compiled.Errors(value);

		if (!isValid) {
			const firstError = errors[0];
			throw new AppHTTPException({
				code: ErrorCodes.VALIDATION_FAILED,
				message: firstError?.message ?? "Invalid request body",
				status: 400,
			});
		}

		return value as T;
	});
