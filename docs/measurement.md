# How this site measures itself

Standing reference, written 2026-08-21 when PostHog went in. Read it before adding an event,
building an insight, or believing a number.

## The one-paragraph version

Four instruments, none of which can see what the others see. **Vercel Analytics** counts visits
and is the control reading. **PostHog** carries everything else: pageviews, answer-engine
arrivals, AI crawler visits, Core Web Vitals and MCP tool calls. **IndexNow**
(`scripts/indexnow.mjs`) pushes new URLs into Bing, which is the index behind Copilot and
ChatGPT browsing. **Share of Model** (`scripts/share-of-model/`) is the only one that sees a
citation nobody clicked, and it is run by hand.

## The chain, and which instrument sees which link

A person reading about Fergus in an answer engine is the end of a four-step chain. This site can
observe three of the steps, and each observation has a different lag and a different blind spot.

| Step | Instrument | Lag | Blind to |
|---|---|---|---|
| Crawl | `middleware.ts` → `ai_crawler_visit` | Hours | Whether anything was ever done with the page |
| Index | Not observable from here | | Everything |
| Cite | `scripts/share-of-model/` | Manual, whenever it is run | Anything the operator did not ask |
| Click | `ai_referral` event | Real time | Every citation nobody clicked |

**The gaps between them are the finding, not a nuisance.** Crawled but never cited is a content
problem. Cited but never clicked is a snippet or a positioning problem. Neither shows up in a
single number, which is why there are three.

`scripts/share-of-model/publish.mjs` sends runs into PostHog so all three sit in one place.

## Events

| Event | Fired by | Distinct id | Notes |
|---|---|---|---|
| `$pageview` | posthog-js, `capture_pageview: "history_change"` | server-side hash | Client-side navigation included, which it would not be by default |
| `ai_referral` | `PostHogAnalytics.tsx`, once per page load | server-side hash | `ai_engine`, `ai_via` (`referrer` or `utm`), `landing_path` |
| `ai_crawler_visit` | `middleware.ts` | `crawler:<name>` | `crawler`, `vendor`, `purpose`, `path` |
| `web_vital` | `useReportWebVitals` | server-side hash | `metric`, `value`, `rating`, `path` |
| `mcp_tool_call` | `app/api/mcp/route.ts` | `mcp:<client>` | `tool`, `status`, `ok`, `client` |
| `mcp_request` | same | same | Everything that is not a `tools/call` |
| `share_of_model` | `publish.mjs`, by hand | `share-of-model:<surface>` | `citation_share`, `bands`, `instrument_verdict` |

## Things that will mislead you

**`purpose: "user-fetch"` is the number worth watching.** `ChatGPT-User`, `Claude-User`,
`Perplexity-User` and `MistralAI-User` mean a person asked a question seconds ago and the model
came here to answer it. `GPTBot` and `ClaudeBot` are training crawls and mean almost nothing
about whether anyone will ever read a word of it.

**A `share_of_model` row with `instrument_verdict: "index-absent"` is not a score.** It means the
probes could not find the site in that backend at all, so the zero is evidence about the index
rather than about the writing. Charting those together with real zeroes would turn "we could not
measure" into "we measured badly", which is the exact error the harness was built to prevent.
Filter on `instrument_verdict = "clear"` before drawing a trend.

**Cookieless means every page load is a new visitor to anything that counts by distinct id.**
PostHog computes a privacy-preserving hash server-side, so its own unique counts are better than
that, but nothing else is. Do not build a "returning visitors" insight; it cannot be right.

**`ai_referral` is a floor, not a count.** Engines that strip the referrer and do not tag the URL
are invisible. A rise is real, an absence is not evidence.

**The Docker parity container does report, and it should be filtered out.** `Dockerfile.parity`
takes the project token as a build arg so the parity build exercises the same code path production
will, which means running the container sends real events. They are easy to spot: `$current_url`
and `path` point at `localhost:3000`. Exclude `$current_url` containing `localhost` from anything
you chart. The alternative was a parity build that compiles different code from the one that
ships, which is worse.

**Development does not report, and it is the code that makes that true.**
`components/analytics/PostHogAnalytics.tsx` reads the key only when `NODE_ENV === "production"`.
The key still sits in `.env.local` because `scripts/share-of-model/publish.mjs` needs it on disk,
and an earlier draft of this file claimed development was silent while nothing enforced it. It was
not: every `npm run dev` was posting real pageviews and web vitals into project 569350 beside
genuine visitor data. Review caught the contradiction between these two sentences.

## Insights worth building

Definitions rather than screenshots, so they can be rebuilt after any UI change.

1. **AI crawl volume by purpose.** `ai_crawler_visit`, trend, breakdown by `purpose`. The
   `user-fetch` line is the one to watch.
2. **Which pages the engines read.** `ai_crawler_visit`, breakdown by `path`, last 30 days. Tells
   you what the site is known for, as opposed to what it thinks it is about.
3. **Crawler coverage.** `ai_crawler_visit`, breakdown by `crawler`. An engine missing from this
   list is not crawling the site at all, which is a robots or a discovery problem, not a content
   one.
4. **Answer-engine arrivals.** `ai_referral`, trend, breakdown by `ai_engine`.
5. **Landing pages from AI.** `ai_referral`, breakdown by `landing_path`.
6. **Crawl-to-click ratio.** `ai_crawler_visit` (purpose = `user-fetch`) against `ai_referral`,
   same window. The gap is the citations nobody clicked.
7. **Core Web Vitals.** `web_vital`, breakdown by `metric`, filtered to `rating = good`, as a
   percentage. Use the 75th percentile of `value` for the number Google actually uses.
8. **MCP tool usage.** `mcp_tool_call`, breakdown by `tool`. Six tools shipped on the argument
   that agents would use them; this is what finds out.
9. **Citation share over time.** `share_of_model`, `citation_share` as a numeric property,
   filtered to `instrument_verdict = "clear"`, breakdown by `surface`.

## Running things

```bash
npm run indexnow              # push every sitemap URL to Bing/IndexNow. After publishing.
npm run indexnow -- --dry-run
npm run som:report            # read the recorded share-of-model runs
npm run som:publish -- results/2026-08-21.json --dry-run
npm run som:publish -- results/2026-08-21.json
```

The `--` is not optional on the publish line: without it npm swallows `--dry-run` as its own flag
and the script sends for real. The token is read from the environment, falling back to `.env.local`,
because a plain `node` script sees nothing Next loads.

## Ownership proofs

`public/google9622a76d3e2fd7ba.html` and `public/1e1c07d6835b43b5ae97096bb927a1ee.txt` are both
committed on purpose. Neither is a secret: the first proves Search Console ownership, the second
proves IndexNow ownership, and both work precisely by being publicly fetchable.

`GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` in `app/layout.tsx` are the meta-tag
route to the same thing, read from the environment so that a token which changes when a property
is removed and re-added cannot go stale in the source.
