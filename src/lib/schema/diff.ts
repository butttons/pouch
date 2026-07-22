import { atomizeChangeset, diff, type IAtomicChange } from "json-diff-ts";
import { Result } from "neverthrow";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";

const PROPERTY_REMOVE_REGEX = /^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)$/;
const PROPERTY_TYPE_CHANGE_REGEX =
	/^\$\.properties\.([a-zA-Z_][a-zA-Z0-9_]*)\.type$/;

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

/**
 * Diffs two schemas and returns the changeset plus any destructive property changes.
 */
export const diffCollectionSchemas = (
	oldSchema: Record<string, unknown>,
	newSchema: Record<string, unknown>,
): Result<{ diff: unknown; destructiveChanges: string[] }, AppHTTPException> =>
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
