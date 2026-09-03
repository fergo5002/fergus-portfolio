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
const nextConfig: NextConfig = {
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

  // S2 spike only. Keeps the two browser packages out of the webpack bundle so
  // they resolve their binaries from node_modules by __dirname, and tells the
  // tracer to carry the binaries into the function.
  //
  // Phase B change (2026-09-03 23:4x UTC). Phase A is finished: WebKit's Linux
  // build is in the bundle on dpl_GnVkrWKmdvWE1YvcmNwCJFHypcG6 and it will not
  // load (libatk-1.0.so.0). Carrying it on costs 298 MB, pushed the function to
  // 374.72 MB uncompressed, and got dpl_3uMDk3fXxsd1hj6FiBUAEB78NBWX refused at
  // the 250 MB limit. Phase B therefore ships Chromium only, which is also the
  // bundle T5 would actually ship, so the cold start measured here is the one
  // the tool would pay. `webkit` stays imported in the route; on this build its
  // binary is absent, so engine=webkit now fails on a missing executable rather
  // than a missing library, and the library evidence stays with deployment 1.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/spike-render": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;
