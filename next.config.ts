import type { NextConfig } from "next";
import { ingestRewrites } from "./lib/analytics";

/**
 * Was `next.config.mjs` until 2026-08-21.
 *
 * It became TypeScript so that the PostHog proxy rules could be imported from
 * `lib/analytics.ts` rather than retyped here. The alternative was a second
 * copy of three host names in a file no test can import, which is precisely the
 * arrangement that lets a host drift and take analytics down silently. Next 15
 * loads `next.config.ts` natively; there is no build step to add.
 */
/**
 * Slugs that were published and are no longer. Kept as a named export so the
 * test can hold it against the live article list.
 */
export const RETIRED_ARTICLES = [
  "shipping-with-ai-agents",
  "agents-will-tell-you-it-works",
  "one-webhook-secret-two-tenants",
  "split-text-is-costing-you-search",
  "split-text-audit-2026",
  "the-test-passed-because-the-uuids-agreed",
  "a-qualcomm-overlay-appeared-in-our-dungeon",
] as const;

const nextConfig: NextConfig = {
  // Managed Windows worktrees sit below an unrelated user-level lockfile.
  outputFileTracingRoot: process.cwd(),
  // ESLint is not configured in this project; skip it during builds.
  eslint: { ignoreDuringBuilds: true },
  // OGL publishes raw ES modules from `src/` rather than a built bundle, so Next
  // has to compile it like first-party code.
  transpilePackages: ["ogl"],

  /**
   * The PostHog reverse proxy.
   *
   * Why the site pays to proxy its own analytics is argued in `lib/analytics.ts`
   * (short version: this audience runs blockers, so the unproxied numbers would
   * not be low, they would be biased). The rules are ordered there, and the
   * order is the part that matters.
   */
  async rewrites() {
    return ingestRewrites();
  },

  /**
   * The seven articles retired on 2026-09-13.
   *
   * They were published, linked from each other and indexed, so deleting the
   * files is only half the job: the other half is deciding what the URLs do
   * next. A 404 throws away whatever they had accumulated and breaks anybody
   * holding a link. A permanent redirect to the index hands both the reader and
   * the crawler somewhere real.
   *
   * The index rather than a nearest-surviving-article guess, because a redirect
   * that lands on an unrelated page reads as a bait and switch and gets treated
   * as a soft 404 anyway.
   *
   * `RETIRED_ARTICLES` is exported so `next.config.test.ts` can assert that no
   * slug here is also a live article, which is the one way this list can rot:
   * a slug gets reused later and the redirect quietly shadows the new page.
   */
  async redirects() {
    return RETIRED_ARTICLES.map((slug) => ({
      source: `/writing/${slug}`,
      destination: "/writing",
      permanent: true,
    }));
  },

  /**
   * **This line is why `middleware.ts` exists.**
   *
   * PostHog's endpoints end in a slash. Next's default trailing-slash redirect
   * fires ahead of the rewrites above, so without this switch every event is
   * 308'd to a path the proxy no longer matches and nothing is recorded, with no
   * error anywhere to say so.
   *
   * The switch is global, so it also stops `/writing/` being normalised to
   * `/writing`. That would leave the site serving one page on two URLs, which is
   * a duplicate-content problem this project deliberately does not have.
   * `middleware.ts` reimplements the redirect for every path except the proxy.
   * Do not remove one without removing the other.
   */
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
