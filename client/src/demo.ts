import createClient from "openapi-fetch";

import type { paths } from "./generated/feedr.js";

const API_URL = "http://localhost:3200";
const TOKEN = process.env.FEEDR_TOKEN;

if (!TOKEN) {
  console.error("Set FEEDR_TOKEN env var");
  process.exit(1);
}

const client = createClient<paths>({
  baseUrl: API_URL,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

async function main() {
  // List all collections.
  const { data: collections, error: collectionsError } = await client.GET(
    "/collections",
  );
  if (collectionsError) throw collectionsError;
  console.log("Collections:");
  for (const collection of collections) {
    console.log(`  - ${collection.slug} (${collection.name})`);
  }

  // Get general FAQ items using a typed query filter.
  const { data: faqItems, error: faqError } = await client.GET(
    "/collections/faq/content",
    {
      params: {
        query: { scope: "general" },
      },
    },
  );
  if (faqError) throw faqError;
  console.log(`\nGeneral FAQ items: ${faqItems.length}`);
  console.log(`  First question: ${faqItems[0]?.data.question}`);

  // Get best deals.
  const { data: bestDeals, error: dealsError } = await client.GET(
    "/collections/best_deals/content",
    {
      params: {},
    },
  );
  if (dealsError) throw dealsError;
  console.log(`\nBest deals: ${bestDeals.length}`);
  console.log(
    `  Cheapest deal: ${bestDeals[0]?.data.destination} @ ₹${bestDeals[0]?.data.price}`,
  );

  // Resolve a relation field in the demo_articles collection.
  const { data: articles, error: articlesError } = await client.GET(
    "/collections/demo_articles/content",
    {
      params: {
        query: { resolve: "author" },
      },
    },
  );
  if (articlesError) throw articlesError;

  const firstArticle = articles[0];
  if (firstArticle) {
    console.log("\nResolved demo article:");
    if (typeof firstArticle.data.author === "string") {
      console.log(`  Unresolved author ID: ${firstArticle.data.author}`);
    } else {
      console.log(
        `  Resolved author: ${firstArticle.data.author.data.name} (${firstArticle.data.author.id})`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
