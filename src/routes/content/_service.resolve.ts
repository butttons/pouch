import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import {
	getMediaFields,
	getMediaIdsFromValue,
	isValidMediaArray,
	isValidMediaObject,
} from "@/lib/schema";

import type { Content } from "@/routes/content/_schema";

import type { Deps } from "@/deps";

type RelationField = {
	field: string;
	targetSlug: string;
	isMany: boolean;
};

export type ResolvedContent = Content & {
	data: Record<string, unknown>;
};

const getRelationFields = (
	schema: Record<string, unknown>,
): RelationField[] => {
	const properties =
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, Record<string, unknown>>)
			: {};

	const relations: RelationField[] = [];

	for (const [field, property] of Object.entries(properties)) {
		const targetSlug = property["x-relation"];
		if (typeof targetSlug !== "string" || targetSlug.length === 0) {
			continue;
		}

		const isMany = property.type === "array";
		relations.push({ field, targetSlug, isMany });
	}

	return relations;
};

const parseResolveFields = (resolve: string): string[] =>
	resolve
		.split(",")
		.map((field) => field.trim())
		.filter((field) => field.length > 0);

const resolveMediaRecord = (record: {
	id: string;
	r2Key: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
}): {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
} => ({
	id: record.id,
	url: record.r2Key,
	filename: record.filename,
	mimeType: record.mimeType,
	sizeBytes: record.sizeBytes,
});

/**
 * Resolves media fields by fetching media records and returning full objects.
 */
const resolveMediaFields = (input: {
	rows: Content[];
	schema: Record<string, unknown>;
	requestedFields: readonly string[];
	deps: Deps;
}): ResultAsync<Content[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const mediaFields = getMediaFields({ schema: input.schema });
		const mediaFieldByName = new Map(mediaFields.map((f) => [f.field, f]));
		const requestedMediaFields = input.requestedFields.filter((f) =>
			mediaFieldByName.has(f),
		);

		if (requestedMediaFields.length === 0) {
			return ok(input.rows);
		}

		// Collect all media IDs from all rows for requested fields
		const allMediaIds = new Set<string>();
		for (const row of input.rows) {
			for (const field of requestedMediaFields) {
				for (const id of getMediaIdsFromValue({ value: row.data[field] })) {
					allMediaIds.add(id);
				}
			}
		}

		if (allMediaIds.size === 0) {
			return ok(input.rows);
		}

		// Fetch all media records in one query
		const mediaRecords = yield* input.deps.DL.media.getMediaByIds({
			ids: Array.from(allMediaIds),
		});

		const mediaById = new Map(mediaRecords.map((r) => [r.id, r]));

		// Replace media objects with full records
		const resolvedRows = input.rows.map((row) => {
			const resolvedData: Record<string, unknown> = { ...row.data };

			for (const field of requestedMediaFields) {
				const value = resolvedData[field];
				const fieldInfo = mediaFieldByName.get(field);
				if (!fieldInfo) continue;

				if (fieldInfo.isMany) {
					const mediaArray = { value };
					if (!isValidMediaArray(mediaArray)) continue;
					resolvedData[field] = mediaArray.value
						.map((item) => mediaById.get(item.id))
						.filter(
							(record): record is NonNullable<typeof record> =>
								record !== undefined,
						)
						.map((record) => resolveMediaRecord(record));
				} else {
					const mediaObject = { value };
					if (!isValidMediaObject(mediaObject)) continue;

					const record = mediaById.get(mediaObject.value.id);
					if (!record) continue;

					resolvedData[field] = resolveMediaRecord(record);
				}
			}

			return { ...row, data: resolvedData };
		});

		return ok(resolvedRows);
	});

const collectTargetIds = (
	rows: Content[],
	relationByField: ReadonlyMap<string, RelationField>,
	requestedFields: readonly string[],
): Map<string, Set<string>> => {
	const targetIdsByField = new Map<string, Set<string>>();

	for (const field of requestedFields) {
		targetIdsByField.set(field, new Set());
	}

	for (const row of rows) {
		for (const field of requestedFields) {
			const relation = relationByField.get(field);
			if (!relation) continue;

			const value = row.data[field];
			if (value === undefined || value === null) continue;

			const targetIds = targetIdsByField.get(field);
			if (!targetIds) continue;

			if (relation.isMany) {
				if (!Array.isArray(value)) continue;
				for (const id of value) {
					if (typeof id === "string") {
						targetIds.add(id);
					}
				}
			} else {
				if (typeof value === "string") {
					targetIds.add(value);
				}
			}
		}
	}

	return targetIdsByField;
};

/**
 * Resolves relation and media fields by fetching referenced content and media records.
 */
export const resolveRelations = (
	input: {
		rows: Content[];
		resolve: string;
		schema: Record<string, unknown>;
	},
	deps: Deps,
): ResultAsync<ResolvedContent[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const requestedFields = parseResolveFields(input.resolve);

		if (requestedFields.length === 0) {
			return ok(input.rows as ResolvedContent[]);
		}

		const relationFields = getRelationFields(input.schema);
		const relationByField = new Map(
			relationFields.map((relation) => [relation.field, relation]),
		);

		const mediaFields = getMediaFields({ schema: input.schema });
		const mediaFieldSet = new Set(mediaFields.map((f) => f.field));

		// Validate that all requested fields are either relations or media
		for (const field of requestedFields) {
			if (!relationByField.has(field) && !mediaFieldSet.has(field)) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Cannot resolve unknown or non-relation/non-media field: ${field}`,
						status: 400,
					}),
				);
			}
		}

		// Resolve media fields first
		let currentRows = input.rows;
		const requestedMediaFields = requestedFields.filter((f) =>
			mediaFieldSet.has(f),
		);
		if (requestedMediaFields.length > 0) {
			currentRows = yield* resolveMediaFields({
				rows: currentRows,
				schema: input.schema,
				requestedFields: requestedMediaFields,
				deps,
			});
		}

		// Resolve relation fields
		const requestedRelationFields = requestedFields.filter((f) =>
			relationByField.has(f),
		);
		if (requestedRelationFields.length === 0) {
			return ok(currentRows as ResolvedContent[]);
		}

		const targetIdsByField = collectTargetIds(
			currentRows,
			relationByField,
			requestedRelationFields,
		);

		const relationSlugs = new Set<string>();

		for (const [field, targetIds] of targetIdsByField.entries()) {
			const relation = relationByField.get(field);
			if (!relation || targetIds.size === 0) continue;

			relationSlugs.add(relation.targetSlug);
		}

		const targetCollections =
			relationSlugs.size > 0
				? yield* deps.DL.collection.getCollectionsBySlugs({
						slugs: Array.from(relationSlugs),
					})
				: [];

		const targetCollectionIds = new Map<string, string>();
		const allTargetIds = new Set<string>();

		for (const [field, targetIds] of targetIdsByField.entries()) {
			const relation = relationByField.get(field);
			if (!relation) continue;

			const targetCollection = targetCollections.find(
				(collection) => collection.slug === relation.targetSlug,
			);

			if (!targetCollection) {
				continue;
			}

			targetCollectionIds.set(field, targetCollection.id);

			for (const id of targetIds) {
				allTargetIds.add(id);
			}
		}

		if (allTargetIds.size === 0) {
			return ok(currentRows as ResolvedContent[]);
		}

		const relatedRows = yield* deps.DL.content.getContentByIds({
			ids: Array.from(allTargetIds),
		});

		const relatedById = new Map(relatedRows.map((row) => [row.id, row]));

		const resolvedRows = currentRows.map((row) => {
			const resolvedData: Record<string, unknown> = { ...row.data };

			for (const [field, targetCollectionId] of targetCollectionIds.entries()) {
				const relation = relationByField.get(field);
				if (!relation) continue;

				const value = row.data[field];
				if (value === undefined || value === null) continue;

				const resolveId = (id: string): unknown => {
					const related = relatedById.get(id);
					if (!related || related.collectionId !== targetCollectionId) {
						return id;
					}
					return related;
				};

				if (relation.isMany) {
					if (Array.isArray(value)) {
						resolvedData[field] = value.map((id) =>
							typeof id === "string" ? resolveId(id) : id,
						);
					}
				} else {
					if (typeof value === "string") {
						resolvedData[field] = resolveId(value);
					}
				}
			}

			return { ...row, data: resolvedData };
		});

		return ok(resolvedRows);
	});
