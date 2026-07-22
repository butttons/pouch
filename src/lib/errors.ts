import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Result } from "neverthrow";

import { DataLayerError } from "@/lib/data";

export const ErrorCodes = {
	INTERNAL_ERROR: "INTERNAL_ERROR",
	VALIDATION_FAILED: "VALIDATION_FAILED",
	UNAUTHORIZED: "UNAUTHORIZED",
	NOT_FOUND: "NOT_FOUND",
	RATE_LIMITED: "RATE_LIMITED",

	COLLECTION_CREATE_FAILED: "COLLECTION_CREATE_FAILED",
	COLLECTION_DELETE_FAILED: "COLLECTION_DELETE_FAILED",
	COLLECTION_SLUG_EXISTS: "COLLECTION_SLUG_EXISTS",
	COLLECTION_SCHEMA_INVALID: "COLLECTION_SCHEMA_INVALID",
	COLLECTION_SCHEMA_FORCE_REQUIRED: "COLLECTION_SCHEMA_FORCE_REQUIRED",
	MEDIA_IN_USE: "MEDIA_IN_USE",
	OAUTH_CLIENT_EXISTS: "OAUTH_CLIENT_EXISTS",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type AppError = {
	code: ErrorCode;
	message: string;
};

type AppHTTPExceptionInput = {
	code: ErrorCode;
	message: string;
	status?: ContentfulStatusCode;
	cause?: unknown;
};

export class AppHTTPException extends HTTPException {
	code: ErrorCode;

	constructor(input: AppHTTPExceptionInput) {
		super(input.status ?? 500, {
			message: input.message,
			cause: input.cause,
		});
		this.code = input.code;
	}

	toJSON() {
		const serialize = (value: unknown): unknown => {
			if (value instanceof AppHTTPException) {
				return value.toJSON();
			}

			if (value instanceof HTTPException) {
				return {
					status: value.status,
					message: value.message,
					...(value.cause !== undefined
						? { cause: serialize(value.cause) }
						: {}),
				};
			}

			if (value instanceof Error) {
				return {
					name: value.name,
					message: value.message,
					stack: value.stack,
					...(value.cause !== undefined
						? { cause: serialize(value.cause) }
						: {}),
				};
			}

			return value;
		};

		return {
			code: this.code,
			message: this.message,
			status: this.status,
			...(this.cause !== undefined ? { cause: serialize(this.cause) } : {}),
		};
	}
}

export const unwrapResult = <T>(result: Result<T, Error>): T => {
	if (result.isErr()) {
		if (result.error instanceof AppHTTPException) {
			throw result.error;
		}

		const message =
			result.error instanceof DataLayerError
				? result.error.message
				: "Unknown error";

		throw new AppHTTPException({
			code: ErrorCodes.INTERNAL_ERROR,
			message,
			status: 500,
			cause: result.error,
		});
	}

	return result.value;
};
