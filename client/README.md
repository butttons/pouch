# @feedr/client

Typed API client for feedr, generated from the live OpenAPI spec.

## Generate a client

feedr exposes a live OpenAPI 3.1 spec at `/openapi.json`. You can generate a typed client in any project using `openapi-typescript` + `openapi-fetch`:

```bash
# 1. Install the tooling
npm install openapi-fetch
npm install -D openapi-typescript

# 2. Generate types from the live spec (requires a read-scoped token)
npx openapi-typescript https://your-cms.workers.dev/openapi.json \
  --header "Authorization: Bearer $FEEDR_TOKEN" \
  -o ./src/generated/feedr.ts

# 3. Use the generated types with openapi-fetch
```

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/feedr.js";

const client = createClient<paths>({
  baseUrl: "https://your-cms.workers.dev",
  headers: { Authorization: `Bearer ${FEEDR_TOKEN}` },
});

const { data, error } = await client.GET("/collections/faq/content", {
  params: { query: { scope: "general" } },
});
```

Because the feedr assembler expands `/collections/{slug}/content` into concrete paths per collection (`/collections/faq/content`, `/collections/best_deals/content`, etc.), the generated client uses those concrete paths directly. Query filters are typed per collection schema, e.g. `?scope=general` or `?price[gt]=20000`.

## This package

This folder is a small internal demo of the same workflow. It checks the spec snapshot into git and regenerates types locally.

### Setup

```bash
pnpm install
```

### Regenerate types

Refresh the local `openapi.json` snapshot from the running feedr dev server, then regenerate TypeScript types:

```bash
FEEDR_TOKEN=<your-token> pnpm typegen
```

The script fetches the live spec automatically. To update the snapshot manually:

```bash
curl -H "Authorization: Bearer $FEEDR_TOKEN" http://localhost:3200/openapi.json > ./openapi.json
pnpm typegen
```

### Type check

```bash
pnpm type-check
```

### Demo

```bash
FEEDR_TOKEN=<your-token> pnpm demo
```
