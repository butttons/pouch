import { err, ok, type Result } from "neverthrow";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { validateContentData } from "@/lib/schema";

export const validateContentOrFail = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
}): Result<void, AppHTTPException> => {
	const validation = validateContentData({
		data: input.data,
		schema: input.schema,
	});

	if (validation.isErr()) {
		return err(
			new AppHTTPException({
				code: ErrorCodes.VALIDATION_FAILED,
				message: "Content validation failed",
				status: 400,
				cause: validation.error,
			}),
		);
	}

	return ok(undefined);
};
