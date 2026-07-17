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
