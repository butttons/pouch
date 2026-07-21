# pouch

A minimal, API-first headless CMS for Cloudflare Workers and D1. Define collections with standard JSON Schema, create content, and query it over HTTP. Built for AI agents and services.

For agent-specific conventions, see [AGENTS.md](./AGENTS.md).

## Deployment

### Service bindings

The worker needs the following bindings to run:

1. `DB` - [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database for collections, content, schema versions, and media metadata.
2. `MEDIA_BUCKET` - [Cloudflare R2](https://developers.cloudflare.com/r2/) - Object storage for uploaded media files.
3. `OAUTH_KV` - [Cloudflare KV](https://developers.cloudflare.com/kv/) - Token and grant storage for the OAuth provider. Separate from D1.
4. `JWT_SECRET` - [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) - The secret used to sign and verify API keys.
5. `MCP_ADMIN_PASSPHRASE` - [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) - Single shared passphrase for the OAuth consent screen login. Only the operator needs this.
6. `MEDIA_PUBLIC_URL` - [Var](https://developers.cloudflare.com/workers/configuration/environment-variables/) - Public URL for the R2 bucket (e.g. `https://pub-abc123.r2.dev`). Optional. Enables direct access to uploaded files without going through the worker.

### Quick deploy

The fastest way to deploy is through Cloudflare's GitHub integration.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/butttons/pouch)

This clones the repo into your GitHub account and deploys the worker. You can configure the project name, D1 binding, and secrets during setup. Keep note of `JWT_SECRET`; you will need it to generate API keys.

Migrations are applied automatically as part of the deploy step.

> **Note:** The cloned repo does not include the `.github/workflows/update.yml` file. To enable the GitHub Actions update workflow, run the **Manual update** steps once.

### Manual deploy

You need the following installed:

1. pnpm - https://pnpm.io/installation
2. wrangler - https://developers.cloudflare.com/workers/wrangler/install-and-update/
3. node - https://nodejs.org/en/download

Steps:

1. Clone the repository

```sh
git clone https://github.com/butttons/pouch
cd pouch
```

2. Login with wrangler

```sh
npx wrangler login
```

3. Create a D1 database

```sh
npx wrangler d1 create pouch
```

Copy the database ID from the output and update `wrangler.jsonc`:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "pouch",
    "database_id": "[DATABASE_ID]",
    "migrations_dir": "src/lib/db/migrations"
  }
]
```

4. Create an R2 bucket

```sh
npx wrangler r2 bucket create pouch-media
```

The bucket name must match the `bucket_name` in `wrangler.jsonc`:

```json
"r2_buckets": [
  {
    "binding": "MEDIA_BUCKET",
    "bucket_name": "pouch-media"
  }
]
```

5. Deploy the worker

```sh
pnpm run deploy
```

`pnpm run deploy` runs `db:migrate:prod` before deploying, so the D1 migrations are applied automatically.

6. Set the `JWT_SECRET` secret

```sh
npx wrangler secret put JWT_SECRET
```

Generate a strong secret and keep it safe. You will need it to create API keys.

7. Set the `MCP_ADMIN_PASSPHRASE` secret (optional — only needed for OAuth MCP)

```sh
npx wrangler secret put MCP_ADMIN_PASSPHRASE
```

This is the single shared passphrase used to log in to the OAuth consent screen at `/authorize`.

## Local development

1. Install dependencies

```sh
pnpm install
```

2. Create `.dev.vars` in the project root

```sh
JWT_SECRET='your-local-dev-secret-min-32-chars-long'
MCP_ADMIN_PASSPHRASE='your-local-dev-passphrase'
```

3. Generate an admin key (optional)

If you need an admin token for local scripts or remote management, post your `JWT_SECRET` to `/auth/keys` and store the token in `.env.local` (already ignored by git):

```sh
curl -X POST http://localhost:3200/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"secret": "[JWT_SECRET]", "name": "local-admin", "scopes": ["collection:read","collection:write","content:read","content:write","media:read","media:write","audit:read"]}' \
  | jq -r '.token' > .env.local
```

4. Run the local dev server

```sh
pnpm dev
```

The worker runs at `http://localhost:3200`.

5. Run tests

```sh
pnpm test
```

## Generating API keys

All API routes except `/auth/keys` require a Bearer token. Generate a key by posting your `JWT_SECRET`:

```sh
curl -X POST http://localhost:3200/auth/keys \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "[JWT_SECRET]",
    "name": "my-agent",
    "scopes": ["collection:read", "content:read", "content:write"],
    "collections": ["faqs", "pages"]
  }'
```

Response:

```json
{
  "token": "JWT_STRING",
  "jti": "key_...",
  "name": "my-agent",
  "scopes": ["collection:read", "content:read", "content:write"],
  "collections": ["faqs", "pages"],
  "exp": 1234567890
}
```

`name` and `scopes` are required — the name identifies the key holder in audit logs, and every key must declare its scopes explicitly. Use `expiresInSeconds` to override the default 180-day expiry.

### Scopes

Scopes mirror the endpoint groups:

| Scope | Endpoints |
| --- | --- |
| `collection:read` | `GET /collections*` |
| `collection:write` | `POST/PATCH/DELETE /collections*` |
| `content:read` | `GET /collections/:slug/content*` (also requires `collection:read`) |
| `content:write` | mutations under `/collections/:slug/content*` (also requires `collection:read`) |
| `media:read` | `GET /media*` |
| `media:write` | `POST/DELETE /media*` |
| `audit:read` | `GET /audit-logs*` |

### Per-collection keys

Pass `collections` (an array of slugs) when creating a key to confine it to those collections. Every route under a collection — content, schema, delete — responds 403 for any slug outside the list, and `GET /collections` only returns the permitted collections. Media and audit-log routes are not collection-scoped and are unaffected. Omit `collections` for a key that works across all collections.

## Read replication

pouch uses D1 [global read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) through the [Sessions API](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession) when a bookmark is provided.

- Send `x-d1-bookmark: first-unconstrained` to read from any replica.
- Send `x-d1-bookmark: first-primary` to read the latest data on the first read.
- Pass the bookmark from a previous response in the `x-d1-bookmark` header to keep sequential consistency across requests.
- If the header is missing, the request uses the primary D1 database directly and no session is created.
- The response includes an updated `x-d1-bookmark` header only when a bookmark was provided on the request.

Example:

```sh
curl -H "Authorization: Bearer [TOKEN]" \
  -H "x-d1-bookmark: first-unconstrained" \
  https://pouch-cms.[account].workers.dev/collections/faqs/content
```

The response will include `x-d1-bookmark`, which you can send on the next request to keep sequential consistency.

Note: `served_by_region` and `served_by_primary` are only returned by remote D1. They are `undefined` in local development.

## MCP server

pouch exposes its REST API as an MCP server at `/mcp`. Any MCP client (Cursor, Claude Code, Claude Desktop, etc.) can connect and use the API as tools without extra configuration.

Requirements:

- The worker needs the `nodejs_als` compatibility flag, which is already set in `wrangler.jsonc`.

Connect a client to:

```
https://pouch-cms.[account].workers.dev/mcp
```

For local development, use `http://localhost:3200/mcp`.

The MCP server reads `/openapi.json` on the first request and registers one tool per operation. Auth is passed through, so each tool call needs a valid `Authorization: Bearer [TOKEN]` header. The available tools depend on the token's scopes — read tools need the matching `:read` scope, write tools the matching `:write` scope (see the scope table above). A key restricted via `collections` only sees tools for its permitted collections; collection-level tools like `list_collections` stay visible and filter their results.

`/auth/keys` and other sensitive paths are excluded from the tool list.

### OAuth for MCP clients (Claude, ChatGPT)

Some MCP clients (the Claude chat app, ChatGPT connectors) only support OAuth and have no custom-headers option. pouch supports OAuth 2.1 authorization for the `/mcp` route specifically, while the REST API continues to use the existing bearer-token auth.

Clients self-register via RFC 7591 Dynamic Client Registration at `POST /register` — there is no operator-managed client registry. Registered clients are stored in `OAUTH_KV` and expire after 90 days; MCP clients re-register on demand. Clients are public (PKCE-only) — no client secrets are issued for `token_endpoint_auth_method: "none"` registrations.

Whichever client you connect, the flow ends at the pouch consent screen: enter the operator passphrase (`MCP_ADMIN_PASSPHRASE`), review the scope checkboxes, and approve. On successful grant, an `auth.oauth.grant` audit log entry is written with the client name and granted scopes. Grants and tokens are stored in `OAUTH_KV`, separate from D1.

#### Claude (claude.ai Custom Connectors)

1. Open Settings → Connectors → Add custom connector.
2. MCP server URL: `https://pouch-cms.[account].workers.dev/mcp`
3. Leave the OAuth client fields blank — Claude registers itself via DCR on first connect.
4. Click Connect and complete the pouch consent screen.

#### ChatGPT (Developer Mode connectors)

1. In ChatGPT, open Settings → Apps & Connectors → Advanced Settings and enable Developer Mode.
2. Click Create → New App. Set MCP server URL to `https://pouch-cms.[account].workers.dev/mcp` and Authentication to OAuth.
3. Leave client registration on the default (automatic) — ChatGPT registers itself via DCR using its per-connector callback URI.
4. Click Create, then Connect, and complete the pouch consent screen.

**Note:** Claude Code, Cursor, and other clients that support custom headers should keep using the existing bearer-token approach (e.g. `.mcp.json` with `Authorization: Bearer [TOKEN]`). OAuth is specifically for clients that require it and have no alternative.

### Discovery endpoints

The OAuth provider automatically serves RFC 8414 and RFC 9728 discovery metadata at:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

These are relative to the `/mcp` route (e.g. `https://pouch-cms.[account].workers.dev/.well-known/oauth-authorization-server`).

## Interactive API docs

pouch serves interactive API documentation at `/docs` using Scalar. The page is protected by HTTP Basic Auth with username `pouch` and password `DOCS_SECRET`:

```sh
open https://pouch:[DOCS_SECRET]@pouch-cms.[account].workers.dev/docs
```

The page is generated from the same OpenAPI spec as `/openapi.json`, so it reflects the current collections, scopes, error responses, and examples. For local development use `http://localhost:3200/docs`.

## Generating a typed client

pouch serves a live OpenAPI 3.1 spec at `/openapi.json`. Because the assembler expands `/collections/{slug}/content` into concrete paths per collection, the generated client uses those concrete paths directly and types query filters from each collection's JSON Schema.

Install the tooling in your consumer project:

```sh
npm install openapi-fetch
npm install -D openapi-typescript
```

Generate the types from your deployed pouch instance:

```sh
npx openapi-typescript https://pouch-cms.[account].workers.dev/openapi.json \
  --header "Authorization: Bearer [TOKEN]" \
  -o ./src/generated/pouch.ts
```

Then create a client:

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/pouch.js";

const client = createClient<paths>({
  baseUrl: "https://pouch-cms.[account].workers.dev",
  headers: { Authorization: `Bearer ${TOKEN}` },
});

const { data, error } = await client.GET("/collections/best_deals/content", {
  params: { query: { price: 58036 } },
});
```

## Using the client in Cloudflare Workers

If you are calling pouch from another Cloudflare Worker, do not go over the network. Use a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) instead.

Add the binding to your worker's `wrangler.jsonc`:

```json
"services": [
  {
    "binding": "POUCH_SERVICE",
    "service": "pouch"
  }
]
```

Then pass the service binding's `fetch` to `openapi-fetch`. The binding ignores the hostname, so `baseUrl` can be anything:

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/pouch.js";

export const createPouchClient = (env: Env) =>
  createClient<paths>({
    baseUrl: "http://pouch",
    headers: { Authorization: `Bearer ${TOKEN}` },
    fetch: (url, init) => env.POUCH_SERVICE.fetch(url, init),
  });
```

In your worker, use it like any other client:

```ts
const pouch = createPouchClient(env);

const { data, error } = await pouch.GET("/collections/faqs/content", {
  params: { query: { type: "faq", limit: 5 } },
});
```

## Updating

Update your worker when a new version is released. Your `wrangler.jsonc` is never overwritten; all D1 bindings, secrets, and other settings are preserved.

> **Note:** This will discard any local changes except `wrangler.jsonc`. Back up any custom modifications before updating.

### Using the GitHub Actions workflow (recommended)

1. Go to your worker repo on GitHub
2. Navigate to **Actions** > **Update Worker**
3. Click **Run workflow**
4. Optionally enter a specific version tag (e.g. `v0.0.2`), or leave empty for the latest release
5. The workflow downloads the latest worker code, preserves your `wrangler.jsonc`, and commits the update

### Manual update

The Deploy button creates a private repo from a snapshot, not a Git fork, so the first merge from upstream requires `--allow-unrelated-histories`.

1. Add the upstream remote (first time only)

```sh
git remote add upstream https://github.com/butttons/pouch.git
```

2. Backup config, fetch and merge upstream

```sh
cp wrangler.jsonc wrangler.jsonc.bak
git fetch upstream

# First update only: histories are unrelated, so allow the merge.
git merge -X theirs upstream/main --allow-unrelated-histories -m "Update from upstream"

# Subsequent updates can use:
# git merge -X theirs upstream/main -m "Update from upstream"
```

3. Restore your config

```sh
mv wrangler.jsonc.bak wrangler.jsonc
```

4. Deploy

```sh
pnpm run deploy
```

`pnpm run deploy` runs `db:migrate:prod` before deploying, so D1 migrations are applied automatically.

> **Note:** The `.github/workflows/update.yml` file is added after the first manual update. Once it is present, you can use the GitHub Actions workflow for future updates instead of merging locally.
