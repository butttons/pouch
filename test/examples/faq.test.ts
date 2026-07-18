import { describe, expect, it } from "vitest";

import {
  createCollection,
  createContent,
  fetchWorker,
  readerToken,
} from "../utils.js";

/**
 * A simple FAQ/help center with categories and questions.
 *
 * Demonstrates:
 * - Single relations (faq -> category)
 * - Filtering by relation
 * - Basic text search via slug field
 */

describe("example: faq", () => {
  it("creates an FAQ and groups questions by category", async () => {
    const categorySchema = {
      type: "object",
      properties: {
        label: { type: "string" },
      },
      required: ["label"],
      additionalProperties: false,
    };

    const faqSchema = {
      type: "object",
      properties: {
        question: { type: "string" },
        answer: { type: "string", "x-widget": "richtext" },
        category: { type: "string", "x-relation": "faqCategories" },
      },
      required: ["question", "answer", "category"],
      additionalProperties: false,
    };

    await createCollection({
      slug: "faqCategories",
      name: "FAQ Categories",
      schema: categorySchema,
    });
    await createCollection({
      slug: "faqs",
      name: "FAQs",
      schema: faqSchema,
    });

    const billing = await createContent("faqCategories", {
      data: { label: "Billing" },
    });
    const general = await createContent("faqCategories", {
      data: { label: "General" },
    });

    await createContent("faqs", {
      data: {
        question: "How do I change my plan?",
        answer: "Go to settings and click change plan.",
        category: billing.id,
      },
    });
    await createContent("faqs", {
      data: {
        question: "What is this service?",
        answer: "An API-first headless CMS.",
        category: general.id,
      },
    });

    const token = await readerToken();

    // Filter FAQs by billing category
    const billingResponse = await fetchWorker(
      `/collections/faqs/content?category=${billing.id}`,
      {},
      token,
    );
    expect(billingResponse.status).toBe(200);
    const billingBody = (await billingResponse.json()) as {
      data: Array<{ data: Record<string, unknown> }>;
    };
    expect(billingBody.data).toHaveLength(1);
    expect(billingBody.data[0]!.data.question).toBe(
      "How do I change my plan?",
    );

    // Resolve category
    const allFaqs = await fetchWorker(
      "/collections/faqs/content?resolve=category",
      {},
      token,
    );
    expect(allFaqs.status).toBe(200);
    const allBody = (await allFaqs.json()) as {
      data: Array<{ data: Record<string, unknown> }>;
    };
    expect(allBody.data).toHaveLength(2);

    const first = allBody.data[0]!.data.category as {
      id: string;
      data: Record<string, unknown>;
    };
    expect(first.data.label).toBeOneOf(["Billing", "General"]);
  });
});
