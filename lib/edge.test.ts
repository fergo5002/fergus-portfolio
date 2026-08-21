import { describe, it, expect } from "vitest";
import { isIngestPath, trailingSlashTarget, crawlerVisitProperties } from "./edge";

/**
 * The rules `middleware.ts` runs on, kept here because a middleware cannot be
 * imported by vitest without a request object and a runtime to put it in, and
 * because the trailing-slash rule below is a piece of SEO behaviour that this
 * project deliberately preserved rather than a piece of plumbing.
 */

describe("isIngestPath", () => {
  it("recognises the analytics proxy", () => {
    expect(isIngestPath("/ingest/e/")).toBe(true);
    expect(isIngestPath("/ingest/static/array.js")).toBe(true);
    expect(isIngestPath("/ingest")).toBe(true);
  });

  it("does not swallow ordinary routes that merely start with the letters", () => {
    expect(isIngestPath("/ingested")).toBe(false);
    expect(isIngestPath("/writing/ingest")).toBe(false);
    expect(isIngestPath("/")).toBe(false);
  });
});

/**
 * ## Why this function exists at all
 *
 * PostHog's API paths end in a slash (`/ingest/e/`, `/ingest/flags/`), and
 * Next.js's default behaviour is to 308 any URL with a trailing slash to the
 * version without one. That redirect fires before the rewrite, so the events
 * never reach PostHog. The documented fix is `skipTrailingSlashRedirect: true`
 * in the Next config.
 *
 * That switch is global. Turning it on to make analytics work also turns off
 * the normalisation for every real route on the site, and `/writing/` quietly
 * starts serving a second copy of `/writing` on a second URL. Canonical tags
 * would probably get Google to consolidate them, but "probably consolidated by
 * a third party" is a worse position than "one URL, 308, done", and this site
 * spent yesterday making its canonical story tidy.
 *
 * So the redirect is reimplemented here for everything except the proxy. This
 * is the mechanism restored, not a new feature: the behaviour a visitor and a
 * crawler see is exactly what it was before PostHog arrived.
 */
describe("trailingSlashTarget", () => {
  it("strips a trailing slash from a real route", () => {
    expect(trailingSlashTarget("/writing/")).toBe("/writing");
    expect(trailingSlashTarget("/writing/split-text-audit-2026/")).toBe("/writing/split-text-audit-2026");
  });

  it("leaves the root alone", () => {
    // `/` is the one path whose trailing slash is the path.
    expect(trailingSlashTarget("/")).toBeNull();
  });

  it("leaves paths without a trailing slash alone", () => {
    expect(trailingSlashTarget("/writing")).toBeNull();
    expect(trailingSlashTarget("/")).toBeNull();
  });

  it("never touches the analytics proxy", () => {
    // The whole reason the global switch had to be turned off.
    expect(trailingSlashTarget("/ingest/e/")).toBeNull();
    expect(trailingSlashTarget("/ingest/flags/")).toBeNull();
  });

  it("collapses a run of trailing slashes to one clean path", () => {
    expect(trailingSlashTarget("/writing///")).toBe("/writing");
  });

  it("does not produce an empty path", () => {
    // `"//"` stripped naively is `""`, which is not a legal Location and would
    // be interpreted by a browser as "the current page", i.e. a redirect loop.
    expect(trailingSlashTarget("//")).toBe("/");
  });
});

describe("crawlerVisitProperties", () => {
  const props = crawlerVisitProperties({
    crawler: { name: "ChatGPT-User", token: "ChatGPT-User", vendor: "openai", purpose: "user-fetch" },
    pathname: "/writing/why-presterly-wound-down",
    search: "?utm_source=x",
    host: "fergusoreilly.dev",
    userAgent: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  });

  it("records who, what and why", () => {
    expect(props.crawler).toBe("ChatGPT-User");
    expect(props.vendor).toBe("openai");
    expect(props.purpose).toBe("user-fetch");
    expect(props.path).toBe("/writing/why-presterly-wound-down");
  });

  it("sets $current_url so PostHog's own path reports work", () => {
    // Without this the events exist but land outside every built-in insight,
    // which is the kind of thing that reads as "no data" for a month.
    expect(props.$current_url).toBe("https://fergusoreilly.dev/writing/why-presterly-wound-down");
  });

  /**
   * Query strings are dropped on purpose.
   *
   * A crawler's URL is not private, but it is attacker-controlled and it is the
   * one field here that a stranger can put arbitrary text into. Nothing good
   * comes of forwarding it verbatim into an analytics store, and nothing is
   * lost: the path is the unit of interest for "which pages get crawled".
   */
  it("does not forward the query string", () => {
    expect(JSON.stringify(props)).not.toContain("utm_source=x");
  });

  it("keeps the user agent, truncated", () => {
    const long = crawlerVisitProperties({
      crawler: { name: "GPTBot", token: "GPTBot", vendor: "openai", purpose: "training" },
      pathname: "/",
      search: "",
      host: "fergusoreilly.dev",
      userAgent: `GPTBot ${"x".repeat(2000)}`,
    });
    expect((long.user_agent as string).length).toBeLessThanOrEqual(256);
  });
});
