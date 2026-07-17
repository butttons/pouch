import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { sign } from "hono/jwt";

import worker from "@/index.js";
import { typedId } from "@/lib/typed-id";
import type { Scope } from "@/middleware/auth";

export const makeRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://example.com${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

export async function createToken(scopes: Scope[]) {
  const jti = typedId("key");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  return sign({ jti, scopes, iat, exp }, env.JWT_SECRET);
}

export const adminToken = () => createToken(["schema:admin"]);
export const writerToken = () => createToken(["content:write"]);
export const readerToken = () => createToken(["content:read"]);

export async function fetchWorker(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const request = makeRequest(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  const token = await createToken(["schema:admin"]);
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
  const token = await createToken(["content:write"]);
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
