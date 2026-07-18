import { err, errAsync, ok, okAsync, type Result, type ResultAsync } from "neverthrow";

import type { DataLayer, DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { collectMediaIds, getMediaFields, isValidMediaObject, validateContentData } from "@/lib/schema";

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

export const validateMediaFieldsOrFail = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
	DL: DataLayer;
}): ResultAsync<void, AppHTTPException | DataLayerError> => {
	const mediaFields = getMediaFields({ schema: input.schema });

	if (mediaFields.length === 0) {
		return okAsync(undefined);
	}

	const invalidFields: string[] = [];

	for (const { field } of mediaFields) {
		const value = input.data[field];
		if (value === undefined) {
			continue;
		}

		if (!isValidMediaObject({ value })) {
			invalidFields.push(field);
		}
	}

	if (invalidFields.length > 0) {
		return errAsync(
			new AppHTTPException({
				code: ErrorCodes.VALIDATION_FAILED,
				message: `Media fields must be objects with { id: "med_...", path: string }: ${invalidFields.join(", ")}`,
				status: 400,
			}),
		);
	}

	const mediaIds = collectMediaIds({
		data: input.data,
		schema: input.schema,
	});

	return input.DL.media.getMediaByIds({ ids: mediaIds }).andThen((rows) => {
		const foundIds = new Set(rows.map((r) => r.id));
		const missing = mediaIds.filter((id) => !foundIds.has(id));

		if (missing.length > 0) {
			return errAsync(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: `Media not found: ${missing.join(", ")}`,
					status: 400,
				}),
			);
		}

		return okAsync(undefined);
	});
};
