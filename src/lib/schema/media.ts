export type MediaFieldInfo = {
	field: string;
	isMany: boolean;
};

/**
 * Returns all fields marked with x-media: true.
 */
export const getMediaFields = (input: {
	schema: Record<string, unknown>;
}): MediaFieldInfo[] => {
	const schema = input.schema;
	const properties =
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, Record<string, unknown>>)
			: {};

	const fields: MediaFieldInfo[] = [];

	for (const [field, property] of Object.entries(properties)) {
		if (property["x-media"] === true) {
			fields.push({ field, isMany: property.type === "array" });
		}
	}

	return fields;
};

/**
 * Validates that a value is a valid MediaObject { id, path }.
 */
export const isValidMediaObject = (input: {
	value: unknown;
}): input is { value: { id: string; path: string } } => {
	const value = input.value;

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj.id === "string" &&
		obj.id.startsWith("med_") &&
		typeof obj.path === "string"
	);
};

/**
 * Validates that a value is an array of valid MediaObjects.
 */
export const isValidMediaArray = (input: {
	value: unknown;
}): input is { value: Array<{ id: string; path: string }> } => {
	const value = input.value;

	if (!Array.isArray(value)) {
		return false;
	}

	return value.every((item) => isValidMediaObject({ value: item }));
};

/**
 * Returns media IDs from a single media object or an array of media objects.
 */
export const getMediaIdsFromValue = (input: { value: unknown }): string[] => {
	const mediaObject = { value: input.value };
	if (isValidMediaObject(mediaObject)) {
		return [mediaObject.value.id];
	}

	const mediaArray = { value: input.value };
	if (isValidMediaArray(mediaArray)) {
		return mediaArray.value.map((item) => item.id);
	}

	return [];
};

const joinMediaUrl = (baseUrl: string, path: string): string => {
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
	return `${normalizedBase}/${normalizedPath}`;
};

/**
 * Mutates media references in content data so the `path` field becomes a full public URL.
 * No-op when MEDIA_PUBLIC_URL is empty.
 */
export const enrichMediaPaths = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
	mediaPublicUrl: string;
}): Record<string, unknown> => {
	if (input.mediaPublicUrl.length === 0) {
		return input.data;
	}

	const mediaFields = getMediaFields({ schema: input.schema });
	if (mediaFields.length === 0) {
		return input.data;
	}

	const enriched: Record<string, unknown> = { ...input.data };

	for (const { field, isMany } of mediaFields) {
		const value = enriched[field];
		if (value === undefined || value === null) {
			continue;
		}

		if (isMany) {
			const mediaArray = { value };
			if (!isValidMediaArray(mediaArray)) continue;
			enriched[field] = mediaArray.value.map((item) => ({
				...item,
				path: joinMediaUrl(input.mediaPublicUrl, item.path),
			}));
		} else {
			const mediaObject = { value };
			if (!isValidMediaObject(mediaObject)) continue;
			enriched[field] = {
				...mediaObject.value,
				path: joinMediaUrl(input.mediaPublicUrl, mediaObject.value.path),
			};
		}
	}

	return enriched;
};

/**
 * Returns media object IDs from content data for x-media fields.
 */
export const collectMediaIds = (input: {
	data: Record<string, unknown>;
	schema: Record<string, unknown>;
}): string[] => {
	const mediaFields = getMediaFields({ schema: input.schema });
	const ids: string[] = [];

	for (const { field } of mediaFields) {
		ids.push(...getMediaIdsFromValue({ value: input.data[field] }));
	}

	return ids;
};
