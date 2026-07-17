# @feedr/client

Typed API client for feedr, generated from the live OpenAPI spec.

## Setup

```bash
pnpm install
```

## Regenerate types

The `openapi.json` snapshot is checked into git. Refresh it from the running feedr dev server, then regenerate TypeScript types:

```bash
FEEDR_TOKEN=<your-token> pnpm typegen
```

The script fetches the live spec automatically. To update the snapshot manually:

```bash
curl -H "Authorization: Bearer $FEEDR_TOKEN" http://localhost:3200/openapi.json > ./openapi.json
pnpm typegen
```

## Type check

```bash
pnpm type-check
```

## Demo

```bash
FEEDR_TOKEN=<your-token> pnpm demo
```

## Usage

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/feedr.js";

const client = createClient<paths>({
  baseUrl: "http://localhost:3200",
  headers: { Authorization: `Bearer ${TOKEN}` },
});

const { data, error } = await client.GET("/collections/faq/content");
```

Because the feedr assembler expands `/collections/{slug}/content` into concrete paths per collection (`/collections/faq/content`, `/collections/best_deals/content`, etc.), the generated client uses those concrete paths directly.
