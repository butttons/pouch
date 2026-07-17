import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";

import worker from "@/index.js";

export const makeRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://example.com${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

export async function fetchWorker(path: string, init: RequestInit = {}) {
  const request = makeRequest(path, init);
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
  const response = await fetchWorker("/collections", {
    method: "POST",
    body: JSON.stringify(input),
  });

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
  const response = await fetchWorker(`/collections/${slug}/content`, {
    method: "POST",
    body: JSON.stringify(input),
  });

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
