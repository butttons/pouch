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

  // Get FAQ items.
  const { data: faqItems, error: faqError } = await client.GET(
    "/collections/faq/content",
  );
  if (faqError) throw faqError;
  const generalFaqItems = faqItems.filter(
    (item) => item.data.scope === "general",
  );
  console.log(`\nFAQ items: ${faqItems.length}`);
  console.log(`  General FAQ items: ${generalFaqItems.length}`);
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
