# feedr

A headless, API-first CMS for Cloudflare Workers and D1. Define collections with standard JSON Schema, create content, and query it over HTTP. Built for agents and services, not dashboards.

## Deployment

### Service bindings

The worker needs the following bindings to run:

1. `DB` - [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database for collections, content, and schema versions.
2. `JWT_SECRET` - [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) - The secret used to sign and verify API keys.

### Manual deploy

You need the following installed:

1. pnpm - https://pnpm.io/installation
2. wrangler - https://developers.cloudflare.com/workers/wrangler/install-and-update/
3. node - https://nodejs.org/en/download

Steps:

1. Clone the repository

```sh
git clone https://github.com/[your-org]/feedr
cd feedr
```

2. Login with wrangler

```sh
npx wrangler login
```

3. Create a D1 database

```sh
npx wrangler d1 create feedr
```

Copy the database ID from the output and update `wrangler.jsonc`:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "feedr",
    "database_id": "[DATABASE_ID]",
    "migrations_dir": "src/lib/db/migrations"
  }
]
```

4. Deploy the worker

```sh
pnpm run deploy
```

5. Apply database migrations

```sh
npx wrangler d1 migrations apply feedr --remote
```

6. Set the `JWT_SECRET` secret

```sh
npx wrangler secret put JWT_SECRET
```

Generate a strong secret and keep it safe. You will need it to create API keys.

## Local development

1. Install dependencies

```sh
pnpm install
```

2. Create `.dev.vars` in the project root

```sh
JWT_SECRET='your-local-dev-secret-min-32-chars-long'
```

3. Run the local dev server

```sh
pnpm dev
```

The worker runs at `http://localhost:3200`.

4. Run tests

```sh
pnpm test
```

## Generating API keys

All API routes except `/auth/keys` require a Bearer token. Generate a key by posting your `JWT_SECRET`:

```sh
curl -X POST https://feedr.[ACCOUNT].workers.dev/auth/keys \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "[JWT_SECRET]",
    "scopes": ["schema:admin", "content:write", "content:read"]
  }'
```

Response:

```json
{
  "token": "JWT_STRING",
  "jti": "key_...",
  "scopes": ["schema:admin", "content:write", "content:read"],
  "exp": 1234567890
}
```

If `scopes` is omitted, the key gets all scopes. Use `expiresInSeconds` to override the default 180-day expiry.

## Scopes

- `schema:admin` - Create, update, and delete collections and schemas.
- `content:write` - Create, update, and delete content.
- `content:read` - Read collections, schemas, and content.

A key should only have the scopes it needs. For example, a content-writing agent should never get `schema:admin`.

## API overview

```
POST   /auth/keys

GET    /openapi.json

POST   /collections                          schema:admin
GET    /collections                          content:read
GET    /collections/:slug                    content:read
GET    /collections/:slug/schema             content:read
PATCH  /collections/:slug/schema             schema:admin
DELETE /collections/:slug                    schema:admin

GET    /collections/:slug/content            content:read
POST   /collections/:slug/content            content:write
POST   /collections/:slug/content:validate   content:write
GET    /collections/:slug/content/:id        content:read
PATCH  /collections/:slug/content/:id        content:write
DELETE /collections/:slug/content/:id        content:write
```

All authenticated requests need an `Authorization` header:

```sh
Authorization: Bearer [TOKEN]
```

### Example: create a collection

```sh
curl -X POST https://feedr.[ACCOUNT].workers.dev/collections \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "posts",
    "name": "Posts",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body": { "type": "string" }
      },
      "required": ["title"],
      "additionalProperties": false
    }
  }'
```

### Schema keywords

Collection schemas are standard JSON Schema (draft 2020-12). Add `x-` prefixed keywords for CMS-specific behavior. All four are optional.

A simple collection only needs property names and types. The keywords below are there when you need them.

#### `x-label`

Sets a human-readable display name for the field. The property key itself stays immutable; the label can change any time.

```json
{
  "title": { "type": "string", "x-label": "Headline" }
}
```

#### `x-widget`

Hints at how the field should be rendered for authoring. Only `"richtext"` is supported today. It does not affect validation.

```json
{
  "body": { "type": "string", "x-widget": "richtext" }
}
```

#### `x-relation`

Marks the field as a relation to another collection. Use `type: "string"` for a single relation and `type: "array"` with `items: { "type": "string" }` for many.

```json
{
  "author": { "type": "string", "x-relation": "authors" },
  "tags": {
    "type": "array",
    "items": { "type": "string" },
    "x-relation": "tags"
  }
}
```

Relations are stored as plain IDs. Use `?resolve=author,tags` to embed the related content in responses.

#### `x-index`

When `true`, creates a generated column + SQLite index for that field on the shared `content` table, scoped to the collection. This makes equality and comparison filters fast. Only scalar fields can be indexed: `string`, `integer`, `number`, or `boolean`.

```json
{
  "published": { "type": "boolean", "x-index": true },
  "price": { "type": "number", "x-index": true }
}
```

Indexed fields can then be queried with operators:

```sh
curl "https://feedr.[ACCOUNT].workers.dev/collections/products/content?published=true&price[gt]=100" \
  -H "Authorization: Bearer [TOKEN]"
```

`x-index` is applied automatically when a collection is created or its schema is patched, and removed when the field is removed.

### Example: create content

```sh
curl -X POST https://feedr.[ACCOUNT].workers.dev/collections/posts/content \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "data": { "title": "Hello world", "body": "First post" }
  }'
```

### Example: list content with a filter

```sh
curl "https://feedr.[ACCOUNT].workers.dev/collections/posts/content?title=Hello%20world" \
  -H "Authorization: Bearer [TOKEN]"
```

### Resolving relations

Relations defined with `x-relation` are stored and returned as plain IDs by default. To embed the related content in a single request, pass the `resolve` query parameter with a comma-separated list of relation field names:

```sh
curl "https://feedr.[ACCOUNT].workers.dev/collections/posts/content?resolve=author,tags" \
  -H "Authorization: Bearer [TOKEN]"
```

The response replaces the relation ID(s) with the full content wrapper of the target collection. The `resolve` parameter is also available on `GET /collections/:slug/content/:id`.

The live OpenAPI spec exposes the `resolve` option for collections that have relation fields, and the generated client types the response as either the plain wrapper or the resolved wrapper.

## Generating a client

feedr exposes a live OpenAPI 3.1 spec at `/openapi.json`. Use `openapi-typescript` and `openapi-fetch` to generate a fully typed client:

```sh
# In your consumer project
npm install openapi-fetch
npm install -D openapi-typescript

npx openapi-typescript https://feedr.[ACCOUNT].workers.dev/openapi.json \
  --header "Authorization: Bearer [TOKEN]" \
  -o ./src/generated/feedr.ts
```

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/feedr.js";

const client = createClient<paths>({
  baseUrl: "https://feedr.[ACCOUNT].workers.dev",
  headers: { Authorization: `Bearer ${TOKEN}` },
});

const { data, error } = await client.GET("/collections/posts/content", {
  params: { query: { title: "Hello world" } },
});
```

Because feedr expands `/collections/:slug/content` into concrete paths per collection (`/collections/posts/content`, `/collections/faq/content`, etc.), the generated client uses those concrete paths directly. Query filters are typed from each collection's JSON Schema, including comparison operators like `price[gt]=20000`.

## MCP server

feedr also exposes its REST API as a Model Context Protocol (MCP) server at `/mcp`. Any MCP client (Cursor, Claude Code, Claude Desktop, etc.) can connect and call existing endpoints as tools without any extra configuration.

The MCP layer reads the live OpenAPI spec at `/openapi.json` and registers one tool per operation. Tool calls are dispatched internally through the same Hono handlers, so auth, scopes, validation, and response formatting stay identical to the REST API.

### Enable the MCP endpoint

The MCP endpoint uses AsyncLocalStorage to forward the request context to tool handlers. Cloudflare Workers needs the `nodejs_als` compatibility flag, which is already set in `wrangler.jsonc`.

Install the dependencies:

```sh
pnpm add @hono/mcp @modelcontextprotocol/sdk zod
```

Then restart the dev server:

```sh
pnpm dev
```

The MCP server is available at:

```
http://localhost:3200/mcp
```

Tools are generated from `/openapi.json` on the first `/mcp` request. New collections added after the worker starts will not appear as tools until the next worker restart.

### Connect an MCP client

Most MCP clients accept a server configuration like this:

```json
{
  "mcpServers": {
    "feedr": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "https://feedr.[ACCOUNT].workers.dev/mcp"
      ],
      "env": {
        "OPENAPI_BASE_URL": "https://feedr.[ACCOUNT].workers.dev"
      }
    }
  }
}
```

For local development, point the client at `http://localhost:3200/mcp`.

The client must send a valid `Authorization` header with each tool call. The simplest pattern is to include the token in the request path or to configure the client to forward a static Bearer token. In practice, most MCP clients pass headers on the initial connection; those headers are forwarded to the REST handlers.

### Scopes and security

The MCP endpoint itself does not introduce a new auth layer. Each tool call is forwarded to the REST API with the same `Authorization: Bearer [TOKEN]` header, so the existing scope checks apply:

- Read tools (`GET`) require `content:read`.
- Write tools (`POST`, `PATCH`, `DELETE`) require `content:write` or `schema:admin` depending on the route.

`/auth/keys` and any other sensitive operations are excluded from the MCP tool list.

### Tool naming

Tools are named from the OpenAPI `operationId` when available. For example:

- `listCollections`
- `getPostsContentById`
- `createPostsContent`
- `patchCollectionsSlugSchema`

If an operation has no `operationId`, a name is generated from the method and path. Tool names longer than 48 characters are hashed to stay within MCP limits.

### Testing the MCP server

1. Start the local dev server:

```sh
pnpm dev
```

2. Generate an API key:

```sh
curl -X POST http://localhost:3200/auth/keys \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your-local-dev-secret-min-32-chars-long",
    "scopes": ["schema:admin", "content:write", "content:read"]
  }'
```

3. Use the MCP Inspector to list and call tools:

```sh
npx -y @modelcontextprotocol/inspector \
  --header "Authorization: Bearer [TOKEN]" \
  http://localhost:3200/mcp
```

4. Or test with `curl` directly:

```sh
curl -X POST http://localhost:3200/mcp \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

For Claude Code or Cursor, add the MCP server URL to the client's MCP settings and provide a token with the scopes you want to test.

## Updating

When a new version is released, update your worker while preserving your `wrangler.jsonc` bindings.

### Manual update

1. Add the upstream remote (first time only)

```sh
git remote add upstream https://github.com/[your-org]/feedr.git
```

2. Backup your config, fetch, and merge

```sh
cp wrangler.jsonc wrangler.jsonc.bak
git fetch upstream
git merge -X theirs upstream/main -m "Update from upstream"
cp wrangler.jsonc.bak wrangler.jsonc
rm wrangler.jsonc.bak
```

3. Apply any new database migrations

```sh
npx wrangler d1 migrations apply feedr --remote
```

4. Deploy

```sh
pnpm run deploy
```

## Architecture

- [Hono](https://hono.dev) on Cloudflare Workers for the HTTP layer.
- [D1](https://developers.cloudflare.com/d1/) for SQLite storage.
- [Drizzle ORM](https://orm.drizzle.team) for schema definitions and migrations.
- [Kysely](https://kysely.dev) for runtime query construction.
- [TypeBox](https://github.com/sinclairzx81/typebox) for JSON Schema validation.
- [hono/jwt](https://hono.dev/docs/middleware/builtin/jwt) for API key signing and verification.
