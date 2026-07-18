import { err, ok, type ResultAsync } from "neverthrow";

import type { DataLayer, DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { Media } from "./_schema";

export const requireMediaById = (input: {
	id: string;
	DL: DataLayer;
}): ResultAsync<Media, AppHTTPException | DataLayerError> => {
	const { id, DL } = input;

	return DL.media.getMediaById({ id }).andThen((row) => {
		if (!row) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "Media not found",
					status: 404,
				}),
			);
		}

		return ok(row);
	});
};
