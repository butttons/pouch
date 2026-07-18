import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { typedId } from "@/lib/typed-id";

import type { Media } from "./_schema";

type CreateMediaInput = {
	file: File;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const createMedia = (
	input: CreateMediaInput,
	deps: Deps,
): ResultAsync<Media, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const { file } = input;

		if (file.size > MAX_FILE_SIZE) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: "File exceeds maximum size of 100MB",
					status: 413,
				}),
			);
		}

		const id = typedId("media");
		const r2Key = `media/${id}/${file.name}`;

		const putResult = await deps.bucket.put(r2Key, file, {
			httpMetadata: {
				contentType: file.type || "application/octet-stream",
				contentDisposition: `inline; filename="${file.name}"`,
			},
		}).catch((error) => {
			console.error("Failed to upload file to R2", error);
			return null;
		});

		if (!putResult) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.INTERNAL_ERROR,
					message: "Failed to upload file to storage",
					status: 500,
				}),
			);
		}

		const created = yield* deps.DL.media.createMedia({
			r2Key,
			filename: file.name,
			mimeType: file.type || "application/octet-stream",
			sizeBytes: file.size,
		});

		return ok(created);
	});
