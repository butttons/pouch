# pouch

A minimal, API-first headless CMS for Cloudflare Workers and D1. Define collections with standard JSON Schema, create content, and query it over HTTP. Built for AI agents and services.

For agent-specific conventions, see [AGENTS.md](./AGENTS.md).

## Deployment

### Service bindings

The worker needs the following bindings to run:

1. `DB` - [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database for collections, content, and schema versions.
2. `JWT_SECRET` - [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) - The secret used to sign and verify API keys.

### Quick deploy

The fastest way to deploy is through Cloudflare's GitHub integration.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/butttons/pouch)

This clones the repo into your GitHub account and deploys the worker. You can configure the project name, D1 binding, and secrets during setup. Keep note of `JWT_SECRET`; you will need it to generate API keys.

After the worker deploys, apply the D1 migrations:

```sh
npx wrangler d1 migrations apply pouch --remote
```

The deploy button creates the D1 binding but does not run the migration files automatically.

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

4. Deploy the worker

```sh
pnpm run deploy
```

5. Apply database migrations

```sh
npx wrangler d1 migrations apply pouch --remote
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

3. Generate an admin key (optional)

If you need an admin token for local scripts or remote management, post your `JWT_SECRET` to `/auth/keys` and store the token in `.env.local` (already ignored by git):

```sh
curl -X POST http://localhost:3200/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"secret": "[JWT_SECRET]", "scopes": ["schema:admin","content:write","content:read"]}' \
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

1. Add the upstream remote (first time only)

```sh
git remote add upstream https://github.com/butttons/pouch.git
```

2. Backup config, fetch and merge upstream

```sh
cp wrangler.jsonc wrangler.jsonc.bak
git fetch upstream
git merge -X theirs upstream/main -m "Update from upstream"
```

3. Restore your config

```sh
mv wrangler.jsonc.bak wrangler.jsonc
```

4. Apply any new database migrations

```sh
npx wrangler d1 migrations apply pouch --remote
```

5. Deploy

```sh
pnpm run deploy
```
