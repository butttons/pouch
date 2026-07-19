import { err, ok, type ResultAsync } from "neverthrow";

import type { DataLayer, DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { AuditLog } from "./_schema";

export const requireAuditLogById = (input: {
	id: string;
	DL: DataLayer;
}): ResultAsync<AuditLog, AppHTTPException | DataLayerError> => {
	const { id, DL } = input;

	return DL.auditLog.getAuditLogById({ id }).andThen((row) => {
		if (!row) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "Audit log not found",
					status: 404,
				}),
			);
		}

		return ok(row);
	});
};
