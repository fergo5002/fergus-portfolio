import { describe, expect, it } from "vitest";
import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../next.config";
import { articles, articleBySlug } from "./articles";
import { GET as feed } from "@/app/feed.xml/route";
import { GET as llms } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";
import { ARTICLE_PATH } from "@/app/tools/headline-check/state";
import { blogSchema } from "@/lib/seo";
import { referenceDocuments } from "@/lib/tools/drift/corpus";
import { toPlainText } from "@/lib/markdown";

// These pages were withdrawn in the September editorial review. Keeping their
// source files for reference must not publish them through a secondary surface.
const withdrawn = [
  "shipping-with-ai-agents",
  "agents-will-tell-you-it-works",
  "what-an-accelerator-is-for",
  "multi-tenant-shopify-apps",
  "one-webhook-secret-two-tenants",
  "split-text-is-costing-you-search",
];

describe("the edited writing collection", () => {
  it("publishes the five retained stories", () => {
    expect(articles.map((article) => article.slug).sort()).toEqual([
      "a-crt-that-behaves-like-a-crt",
      "a-qualcomm-overlay-appeared-in-our-dungeon",
      "split-text-audit-2026",
      "the-test-passed-because-the-uuids-agreed",
      "why-presterly-wound-down",
    ]);
  });

  it("withdraws articles from lookup, sitemap, RSS, agent discovery and blog metadata", async () => {
    const discovery = [
      JSON.stringify(sitemap()),
      await feed().text(),
      await llms().text(),
      JSON.stringify(blogSchema(articles)),
    ];
    for (const slug of withdrawn) {
      expect(articleBySlug(slug), slug).toBeUndefined();
      for (const surface of discovery) expect(surface).not.toContain(`/writing/${slug}`);
    }
  });

  it("uses only published prose for the Drift example", () => {
    expect(referenceDocuments()).toEqual(articles.map((article) => toPlainText(article.body)));
    expect(referenceDocuments()).toHaveLength(5);
  });

  it("sends the merged explainer to the corrected survey and preserves query parameters", async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: "https://fergusoreilly.dev/writing/split-text-is-costing-you-search?from=bookmark",
      nextConfig,
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(
      "https://fergusoreilly.dev/writing/split-text-audit-2026?from=bookmark",
    );
  });

  it("links the headline checker directly to the published explanation", () => {
    expect(ARTICLE_PATH).toBe("/writing/split-text-audit-2026");
    expect(articleBySlug(ARTICLE_PATH.split("/").pop()!)?.body).toContain("after mount");
  });
});
