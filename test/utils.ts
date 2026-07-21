import { sign } from "hono/jwt";

import { typedId } from "@/lib/typed-id";

import type { Scope } from "@/middleware/auth";

import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import worker from "@/index.js";

export const makeRequest = (path: string, init: RequestInit = {}) => {
	const isFormData = init.body instanceof FormData;

	return new Request(`http://example.com${path}`, {
		...init,
		headers: {
			...(!isFormData ? { "Content-Type": "application/json" } : {}),
			...init.headers,
		},
	});
};

export async function createToken(input: {
	scopes: Scope[];
	collections?: string[];
}) {
	const jti = typedId("key");
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + 3600;

	return sign(
		{
			jti,
			scopes: input.scopes,
			...(input.collections ? { collections: input.collections } : {}),
			iat,
			exp,
		},
		env.JWT_SECRET,
	);
}

export const adminToken = () =>
	createToken({
		scopes: [
			"content:read",
			"content:write",
			"collection:read",
			"collection:write",
			"media:read",
			"media:write",
			"audit:read",
		],
	});
export const writerToken = () =>
	createToken({ scopes: ["collection:read", "content:write", "media:write"] });
export const readerToken = () =>
	createToken({ scopes: ["collection:read", "content:read", "media:read"] });

export async function fetchWorker(
	path: string,
	init: RequestInit = {},
	token?: string,
) {
	const request = makeRequest(path, {
		...init,
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...init.headers,
		},
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

export async function createCollection(input: {
	slug: string;
	name: string;
	schema: Record<string, unknown>;
	titleField?: string;
}) {
	const token = await createToken({ scopes: ["collection:write"] });
	const response = await fetchWorker(
		"/collections",
		{
			method: "POST",
			body: JSON.stringify(input),
		},
		token,
	);

	if (response.status !== 201) {
		throw new Error(
			`createCollection failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as {
		id: string;
		slug: string;
		name: string;
		titleField: string | null;
		currentSchemaVersionId: string;
		schema: Record<string, unknown>;
	};
}

export async function createContent(
	slug: string,
	input: { data: Record<string, unknown>; status?: string },
) {
	const token = await createToken({
		scopes: ["collection:read", "content:write"],
	});
	const response = await fetchWorker(
		`/collections/${slug}/content`,
		{
			method: "POST",
			body: JSON.stringify(input),
		},
		token,
	);

	if (response.status !== 201) {
		throw new Error(
			`createContent failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as {
		id: string;
		collectionId: string;
		data: Record<string, unknown>;
		status: string;
		schemaVersionId: string;
		createdAt: number;
		updatedAt: number;
	};
}

export async function createContentBatch(
	slug: string,
	items: Array<{ data: Record<string, unknown>; status?: string }>,
) {
	const token = await createToken({
		scopes: ["collection:read", "content:write"],
	});
	const response = await fetchWorker(
		`/collections/${slug}/content/batch`,
		{
			method: "POST",
			body: JSON.stringify({ items }),
		},
		token,
	);

	if (response.status !== 201) {
		throw new Error(
			`createContentBatch failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as {
		data: Array<{
			id: string;
			collectionId: string;
			data: Record<string, unknown>;
			status: string;
			schemaVersionId: string;
			createdAt: number;
			updatedAt: number;
		}>;
	};
}

export async function updateContentBatch(
	slug: string,
	items: Array<{
		id: string;
		data?: Record<string, unknown>;
		status?: string;
	}>,
) {
	const token = await createToken({
		scopes: ["collection:read", "content:write"],
	});
	const response = await fetchWorker(
		`/collections/${slug}/content/batch`,
		{
			method: "PATCH",
			body: JSON.stringify({ items }),
		},
		token,
	);

	if (response.status !== 200) {
		throw new Error(
			`updateContentBatch failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as {
		data: Array<{
			id: string;
			collectionId: string;
			data: Record<string, unknown>;
			status: string;
			schemaVersionId: string;
			createdAt: number;
			updatedAt: number;
		}>;
	};
}

export async function deleteContentBatch(slug: string, ids: string[]) {
	const token = await createToken({
		scopes: ["collection:read", "content:write"],
	});
	const response = await fetchWorker(
		`/collections/${slug}/content/batch`,
		{
			method: "DELETE",
			body: JSON.stringify({ ids }),
		},
		token,
	);

	if (response.status !== 204) {
		throw new Error(
			`deleteContentBatch failed: ${response.status} ${await response.text()}`,
		);
	}
}

export async function createMedia(file: File) {
	const token = await createToken({ scopes: ["media:write"] });
	const formData = new FormData();
	formData.append("file", file);

	const response = await fetchWorker(
		"/media",
		{
			method: "POST",
			body: formData,
		},
		token,
	);

	if (response.status !== 201) {
		throw new Error(
			`createMedia failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as {
		id: string;
		r2Key: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
		status: string;
		createdAt: number;
		updatedAt: number;
	};
}
