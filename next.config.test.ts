import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig, { RETIRED_ARTICLES } from "./next.config";
import { articles } from "./content/articles";

describe("Next.js workspace root", () => {
  it("traces from the active checkout, including a Codex worktree", () => {
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
    expect(path.isAbsolute(nextConfig.outputFileTracingRoot ?? "")).toBe(true);
  });
});

/**
 * The retired articles from 2026-09-13 and 2026-10-27.
 *
 * Two ways this list can rot, and one test each. It can lose a redirect, which
 * turns a published URL back into a 404. Or a slug can be reused by a new
 * article later, in which case the redirect would shadow the live page and the
 * post would be unreachable at its own address with nothing failing anywhere.
 */
describe("retired article redirects", () => {
  it("never shadows a live article", () => {
    const live = new Set(articles.map((a) => a.slug));
    for (const slug of RETIRED_ARTICLES) {
      expect(live.has(slug), `${slug} is redirected and also published`).toBe(false);
    }
  });

  it("sends every retired slug to the writing index, permanently", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toHaveLength(RETIRED_ARTICLES.length);
    for (const slug of RETIRED_ARTICLES) {
      const rule = redirects?.find((r) => r.source === `/writing/${slug}`);
      expect(rule, `no redirect for ${slug}`).toBeDefined();
      expect(rule?.destination).toBe("/writing");
      expect(rule?.permanent).toBe(true);
    }
  });
});

/**
 * 2026-11-28: the site sent HSTS (Vercel's) and nothing else, a finding that
 * had been open since the August baseline. No Content-Security-Policy yet: the
 * boot script and the JSON-LD are inline, so that one needs nonces and its own
 * change.
 */
describe("security headers", () => {
  it("sends the three that cost nothing on every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const sent = Object.fromEntries(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(sent["x-content-type-options"]).toBe("nosniff");
    expect(sent["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(sent["x-frame-options"]).toBe("SAMEORIGIN");
  });
});
