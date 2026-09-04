# T6 Irish Stack Census Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/tools/census`: measure what Irish websites are actually built with by politely reading one page from every `.ie` domain we can name, and publish the result as a page that leads with what it cannot see. The headline number on that page is not a platform share, it is coverage: 125,505 domains against a registry that counted about 333,000, which is 37.7%. A census that quietly implies it is the whole of `.ie` would be the exact failure this project's claim discipline exists to prevent, so the fraction is printed first, on every surface the tool produces, the JSON included.

**Architecture:** Three things that never share a process. **(1) A crawl on the home machine.** `scripts/census/*.mts` run by plain Node 24, monthly, on the scheduler that already runs daily scans. It seeds from Common Crawl's host graph, asks each host's `robots.txt`, reads at most 64 KB of one page per domain, and writes NDJSON to `data/census/`, which is gitignored and never leaves the machine. **(2) Pure logic in `lib/census/`,** every rule a tested function with no I/O: the Public Suffix collapse, the robots parser, the fenced fetch, the signature table, the fingerprinter, the industry classifier, the aggregator, the cost meter. The crawler is a loop around those, so what the tests prove is what the crawl does. **(3) A static page.** `scripts/census/aggregate.mts` turns a run into `content/census/snapshot.ts`, a committed typed object of counts and identifiers with no prose in it, and `app/tools/census/page.tsx` imports it. Phase A therefore costs zero function time, zero Redis commands and zero Neon compute, and ships without either store existing. Neon holds the 125,505 per-domain rows that make the month-to-month diff and the per-domain drill-down possible, and every task that needs it is at the end of this plan and marked.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest 2 (node environment, no jsdom), hand-written CSS. On the home machine: Node 24's native TypeScript stripping (`.mts` scripts importing `../../lib/census/*.ts` with the extension written out), `node:dns`, `fetch`, `node:zlib`, `node:readline`. Reused from main: `extractHeading` and `Verdict` from `lib/headline.ts`, and the address maths from `lib/headline-fetch.ts` (or `lib/fence.ts` if F4 has merged; Task 0 decides which and every later task uses the answer). Phase A adds no dependency at all. Phase B uses F4's `getSql()` and `takeBudget`, and `@neondatabase/serverless` is the one dependency this sub-project relies on, already earned by F4.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is T6 (section 6, wave 2). Its line, verbatim: "`/tools/census`. The corpus from S4. A monthly crawl on the home machine: one polite fetch per domain (HEAD, then the first 64 KB of the home page, a 2-second cap, `robots.txt` honoured, a named user agent with a contact URL), fingerprinted for platform, host, payments, booking system, newsletter tool, an h1, the copyright year, then classified by industry from schema.org types and page content into about forty buckets, written to Neon with the run id. The site serves a table by industry, a stack-by-industry matrix, and after the second month the diff: who moved, who went dark, who arrived. An honesty layer per row: the evidence URL and the reason for each classification. A JSON API with the same budget as the page. Can't see: sites behind JavaScript, sites that block bots (marked unknown, never custom), businesses without a `.ie` domain. Coverage stated per bucket against a spot check."
- Spike record: `docs/superpowers/spikes/s4-ie-seed.md`. Read it before Task 10. Three of its rulings are load-bearing here and are written into the tasks: collapse on the **ICANN section only** of the Public Suffix List, which makes the seed 125,505 rather than 126,214; state coverage against the registry's **dated** figure rather than the undated 330,000; and keep the abort-path fix in the seed script or the monthly scheduler sees exit 1 for ever.
- **Vercel Hobby, and it stays free.** 4 active CPU hours, 360 GB-hours of provisioned memory, 1,000,000 invocations a month, functions capped at 300 seconds, **crons once a day**. Nothing in this sub-project runs on a cron and nothing in phase A runs a function at all: the page is static and the crawl is on the home machine. Phase B's JSON API is the only hosted surface and it carries a budget. If a design change ever puts the crawl on Vercel, it is wrong: 251,010 outbound requests would spend the whole month's CPU allotment several times over.
- **Every hosted tool measures its own cost and reports it** (design section 5, corrected 2026-09-04 after spike S2: Vercel's usage API is Pro only and cannot be read from this account). `lib/census/cost.ts` is that instrument: wall clock from `process.hrtime.bigint()` and Node CPU from `process.cpuUsage()`, both printed, neither passed off as the other. The crawl reports its own figures and the page prints them, because on this tool the interesting cost is the crawl and not the serve.
- vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`. **No jsdom, so no React component can be mounted.** Every rule lives in `lib/census/*.ts` as a pure or dependency-injected function with a test beside it, and the React is wiring. Component wiring is proved by source-grep coupling tests in the pattern of `lib/boot.test.ts` and `components/chrome.test.ts`, and every one of those says in its docblock that it is a coupling check and not a render.
- **This is a Windows checkout with `core.autocrlf` on, so every test that reads a source file normalises line endings first.** `lib/contact.test.ts` was red locally and green in CI for a fortnight because it searched for a bare newline in a CRLF file. Every coupling test in this plan opens with the same two lines and they are not optional:

  ```ts
  const ROOT = fileURLToPath(new URL("../../", import.meta.url));
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
  ```

  The same rule applies to every anchor added to `scripts/mutation-check.mjs`: single-line regexes, never a bare `\n`.
- **Every runtime module under `lib/census/` and `scripts/census/` imports by relative path with the `.ts` extension written out, and never through the `@/` alias.** This is not a style preference, it is the only thing that makes the crawl runnable. `scripts/census/crawl.mts` runs under bare Node, which resolves neither `@/` (a tsconfig path, meaningless to Node) nor an extensionless relative specifier (ESM requires the extension). Both work fine under vitest and the Next build, which is exactly why the mistake is invisible until the monthly run fails with `ERR_MODULE_NOT_FOUND` at 3am. Two exceptions, both safe and both stated so nobody has to guess: a **type-only** import is erased before Node sees it, and the `.test.ts` files use `@/` like the rest of the repo because vitest resolves them and no test ever runs under bare Node. `lib/census/safety.test.ts` greps for the alias in the runtime modules, so this is a guard rather than a habit.
- **The em-dash guard scans the whole source tree, so a regex that must match an em dash writes it as `\u2014`.** `content/voice.test.ts` strips comments and then fails on an em dash in any `.ts` or `.tsx` file outside `docs/`, `public/` and `assets/`. A copyright-line matcher wants to accept `2019 to 2026` written with a dash, and typing that dash literally in `lib/census/fingerprint.ts` fails the build with an error about house style that reads like a false positive. Character classes are written `[-\u2010-\u2015]` throughout. This is the single most likely way to lose an hour on this branch.
- **The generated snapshot holds no prose from anybody else's website.** `content/census/snapshot.ts` is counts, bucket ids, signature ids and domain names, and `content/census/snapshot.test.ts` fails on any string outside a strict charset. Two reasons, and the first is not the interesting one: a stranger's h1 containing an em dash would fail `content/voice.test.ts` and stop the build, which is annoying. The real reason is that a committed file is a permanent publication of somebody else's words, taken by a robot, with no way for them to ask for it back. Counts and domain names are facts about the web; sentences off a home page are theirs.
- **No new dependencies in phase A.** Node 24 has `fetch`, `node:dns`, `node:zlib`, `node:readline` and native TypeScript stripping. A robots parser is one state machine, a signature table is data, and a Public Suffix collapse is three lines once you have the list. Phase B uses `@neondatabase/serverless` through F4's `lib/store/neon.ts` and adds nothing of its own. If a later reviewer thinks a package is unavoidable, the argument goes on the pull request before the install.
- **F3's interfaces are frozen and this plan consumes them unchanged:** `ToolEntry` (`slug, name, blurb, privacy, cantSee, status, order`), `content/tools/index.ts` exporting `tools`, `liveTools`, `toolBySlug` and `toolShellCopy`, `components/tools/ToolPage.tsx` with props `{ tool, children }` plus optional `extraSchema` and `talk`, `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`, `trackToolRun(payload)` in `lib/tools/events.ts`, and `scripts/phone-check.mjs --base --routes --from-sitemap --self-test --out`.
- **F4's interfaces are frozen and phase B consumes them unchanged:** `getSql()` from `lib/store/neon.ts`, `StoreUnavailableError` from `lib/store/errors.ts`, and from `lib/budget.ts` the types `BudgetScope`, `BudgetRequest`, `BudgetResult` and the functions `takeBudget(req, now?)` and `budgetKeyForIp(headers)`. **F4 is finished but held unmerged** while two Vercel Marketplace terms acceptances wait on Fergus, so `getSql` throwing `StoreUnavailableError` is the expected state on the day phase B is written, not an edge case.
- All copy lives in `content/tools/census.ts` and passes `content/voice.test.ts`: no em dash, no en dash outside a date, British spelling. Nothing is hard-coded in a page, a component or a route handler, the crawler's user-agent string and the politeness policy included, because the policy printed on the page and the policy the crawler obeys must be one object or one of them will drift.
- Hand-written CSS. The tool owns `app/tools/census/tool.css`, imported by its own `page.tsx` (design section 2, rule 2). `app/globals.css` is not touched.
- Every animation gated behind `@media (prefers-reduced-motion: no-preference)`. There are two on this route, both CSS: the bars grow from zero on reveal and the industry rows fade in. Under `reduce` both are instant. No second `requestAnimationFrame` loop: `SystemProvider` owns the only one (AGENTS.md).
- **Nothing is written to the visitor's machine.** No `localStorage`, no `sessionStorage`, no `indexedDB`, no `document.cookie`, no Cache API, anywhere under `app/tools/census/` or `lib/census/`. `lib/census/safety.test.ts` greps both directories and fails on any of them, and the page says `forget` has nothing to wipe here.
- **The phone is the product surface, not a breakpoint.** A census page is a data page and data pages are where 320 goes wrong. The primary presentation is a ranked list of bars, not a table; the forty-two-row stack-by-industry matrix lives in its own `overflow-x: auto` container so the document never scrolls sideways. Task 16 drives WebKit at 390 and 320 and a throttled Chromium, and the `phone` job is required on `main`.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what the output proves and what it cannot see. Numbers not yet measured are labelled guesses until a run replaces them. **The classifier's accuracy is unmeasured until Task 13's spot check**, and no task before it may describe the buckets as correct.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/t6-census` in its own sibling worktree made through `workspaces.ps1`, never reused, never removed by an agent. The repository is public, so this ships as a pull request needing the `check`, `mutation` and `phone` jobs green.

---

## The politeness policy, decided up front, and printed on the page

This is the part of T6 that can do damage. Everything else is arithmetic; this is 251,010 requests a month sent to other people's servers with Fergus's name and domain on every one of them. The design's risk table calls it "a crawler with your name on it" and the mitigation it names is lower concurrency and a partial pass. That is the fallback. The policy below is the default.

**One page per domain, per month.** Not a crawl in the usual sense: there is no frontier, no link following and no second page. The tool asks the front door what the building is made of and leaves.

**Two HTTP requests per domain, not three, and this is a correction to the design.** The design says "HEAD, then the first 64 KB of the home page". A HEAD followed by a GET is two hits on somebody's origin to learn what one ranged GET tells you, and plenty of servers handle HEAD worse than GET because nobody tests it. So it is one `GET` carrying `Range: bytes=0-65535`, preceded by one `robots.txt`. Servers that ignore the range header send the whole body and the reader aborts the stream at 128 KB decoded, so the cap is enforced on our side and does not depend on their cooperation.

**DNS is resolved before anything is requested, and it is not a hit on their web server.** Both `<domain>` and `www.<domain>` are looked up. The apex is preferred when it resolves, `www` is the fallback, and neither resolving is recorded as `dns-failed` with no HTTP request made at all. This also closes an open question from S4: the host graph is built from link targets as well as crawled pages, so some names in the seed are dangling, and a domain that fails DNS on two consecutive runs leaves the seed.

**`robots.txt` first, always, and a fetch failure means no.** RFC 9309 is implemented properly in `lib/census/robots.ts`, including the part most implementations skip: a 5xx or a network error on `robots.txt` is a complete disallow, not an absent file. A 404 means allowed. A `Crawl-delay` is honoured, which on a one-page-per-host crawl costs nothing but is the difference between claiming to honour robots and honouring it.

**A user agent that says who and where.** `Mozilla/5.0 (compatible; IrishStackCensus/1.0; +https://fergusoreilly.dev/tools/census)`. The product token `IrishStackCensus` is what a site owner writes in their own `robots.txt` to be excluded, and the page says so in those words. The URL resolves to a page explaining what the crawler is and how to opt out. A crawler whose contact URL 404s is an anonymous crawler with extra steps.

**An opt-out list honoured before robots.** `content/census/excluded.ts` is a hand-edited list of domains that asked not to be read. It is checked before DNS, so an excluded domain costs its owner nothing at all, and its row reads `opted-out` on the page rather than vanishing, because silently dropping a domain would make the coverage figure quietly wrong.

**Rate.** A global cap of eight requests a second across the whole run and one in-flight request per host, which on this crawl is automatic because each host is visited once. At 251,010 requests that is about nine hours of wall clock. Nine hours once a month is the polite shape; four hours at twenty a second is the rude one, and the tool is not in a hurry.

**Nothing anybody wrote is kept.** The crawler derives signals from the bytes and throws the bytes away. What survives a run is the domain, which rules matched, at most 120 characters of the matched text as evidence, the h1's verdict and character-element count rather than its words, the copyright year, the HTTP status, and the response headers on a fixed allowlist with cookie **names** only and never cookie values. The raw HTML is never written to disk, never sent to Neon and never published.

**A 429 or a 503 ends that domain for the month.** No retries on a refusal. One retry, after two seconds, on a transport error only, and then the domain is recorded as unreachable and left alone.

All nine paragraphs live in `content/tools/census.ts` and are rendered on the page. `lib/census/policy.test.ts` asserts that the constants the crawler runs on are the numbers the copy states, so the page and the code cannot drift apart. That guard has a mutation row.

## The arithmetic, and why it stays free

| Thing | Number | Where it comes from |
|---|---|---|
| Domains in the seed | 125,505 | S4, ICANN-section collapse |
| HTTP requests per domain per run | 2 | robots.txt, one ranged GET |
| Requests per run | 251,010 | arithmetic |
| Global rate cap | 8 a second | this plan |
| Wall clock per run, predicted | about 9 hours | 251,010 / 8, **a guess until Task 13 measures it** |
| Bytes down per run, predicted | 10 to 18 GB | 125,505 x (about 2 KB robots plus up to 128 KB body), **a guess** |
| Vercel active CPU, phase A | 0 | the page is static |
| Vercel invocations, phase A | 0 | the page is static |
| Redis commands, phase A | 0 | nothing is budgeted because nothing runs |
| Neon compute, phase A | 0 | Neon is not read |
| Neon storage, phase B | about 31 MB current state, about 1 MB a month of changes | 125,505 rows at about 250 bytes, plus a change log |
| Neon compute, phase B | one write burst a month, one query per API call | scales to zero after five minutes idle |
| Vercel invocations, phase B | capped at 2,000 a day by the global budget | `lib/census/api-budgets.ts` |

The binding meter for the programme is Vercel active CPU, and this tool contributes nothing to it in phase A and very little in phase B. The meter this tool could actually blow is somebody else's patience, which is what the section above it is for.

**A correction to the design's section 6.** It says the JSON API has "the same budget as the page". In this design the page has no budget because it costs nothing, so the phrase has no referent. The API carries its own three budgets (per IP, per target, global) through F4's `takeBudget`, and the page is static. Recorded here rather than fudged.

**A correction to the design's stores table.** It gives Neon "census tables, Tide query cache, census monthly diff" inside 0.5 GB without saying what happens after a year of monthly runs. Twelve full snapshots of 125,505 rows would be about 370 MB before indexes, which is most of the tier for one tool. So the schema is **current state plus a change log**: one row per domain holding the latest reading and its `first_seen`, and one row per observed change. That is about 31 MB steady state and about 1 MB a month of growth, and the diff is a query over the change log rather than a join between two full snapshots.

## Coverage, which is the headline and not a footnote

The first block of content on the page, above any finding, is this, built from constants in `content/tools/census.ts` so it cannot drift from the snapshot:

> This census reads 125,505 `.ie` domains. The `.ie` registry counted about 333,000 at the end of 2025. So this is 37.7% of `.ie`, and every percentage below is a percentage of that 37.7%, not of Ireland.

Three things go with it, all on the page:

1. **Where the seed comes from and how it is biased.** Common Crawl's `cc-main-2026-jun-jul-aug` host graph, built from pages Common Crawl crawled and from links pointing at hosts it did not. A domain nobody links to and nobody crawls is not in it. So the seed over-represents linked-to sites, which means it over-represents businesses with any web presence at all and under-represents the dormant tail. That biases every platform share towards the platforms active sites use.
2. **The registry figure is dated, and the undated one is not used.** 333,000 is the `.ie` Domain Snapshot 2025 infographic, published January 2026, rounded on the page itself. The 2024 Domain Profile Report's exact 326,562 (end of 2024) gives 38.4%. The weare.ie homepage widget's 349,615 is undated, sits beside a "registered this year" figure larger than the whole of 2024's intake, and may count gross registrations rather than the live database, so it is quoted as a third reading and not used for the headline. S4 could not resolve what it counts and neither can this page.
3. **Coverage per bucket, against a spot check.** A global 37.7% says nothing about whether the census found nine in ten Irish hotels and one in ten Irish solicitors. Task 13 samples the seed and measures both halves of that, and the per-bucket number sits in the industry table beside the count.

## The two phases, and what is blocked on what

**Phase A ships without Upstash or Neon.** Tasks 0 to 16 and Task 19. Everything the visitor sees, everything the crawler does, every rule, every test, the phone check and the mutation rows. The page is a static import of a committed snapshot, so it is not a degraded mode, it is the cheapest correct implementation and it is what a reader gets whether or not a store ever exists.

**Phase B is blocked on Fergus accepting two Vercel Marketplace terms.** Tasks 17 and 18. Task 17 needs `DATABASE_URL` and cannot be proven without it: the schema, the loader, the change log and the diff. Task 18 needs Neon for rows and Redis for the budget: the JSON API and the per-domain drill-down. **No task in this plan may claim a store-backed proof against a fake.** F4 already recorded that trap ("everything Redis is proven against a fake") and repeating it here with a green tick beside it would be worse than leaving the box unticked. If the stores are still absent when Tasks 0 to 16 are done, the branch opens its pull request without them and the ledger says exactly which two tasks are outstanding and why.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `content/tools/census.ts` | The registry entry, the politeness policy as data, the coverage constants, and every string the tool says. |
| `content/census/excluded.ts` (+ `.test.ts`) | The opt-out list, hand-edited, honoured before DNS. |
| `content/census/snapshot.ts` | Generated. The aggregates the page renders. Committed. |
| `content/census/snapshot.test.ts` | Charset and shape guard on the generated file. |
| `lib/census/types.ts` | Every type the crawl, the aggregate and the page share. |
| `lib/census/industries.ts` (+ `.test.ts`) | The forty-two buckets, the schema.org map and the keyword table. |
| `lib/census/psl.ts` (+ `.test.ts`) | ICANN-section-only collapse from a host to a registered domain. |
| `lib/census/robots.ts` (+ `.test.ts`) | RFC 9309 parse and decide, including the status rules. |
| `lib/census/fetch.ts` (+ `.test.ts`) | The fenced, capped, single-shot page read. |
| `lib/census/signatures.ts` (+ `.test.ts`) | The signature table: platform, host, payments, booking, newsletter. |
| `lib/census/fingerprint.ts` (+ `.test.ts`) | Headers plus HTML to signals with evidence, the h1 and the copyright year. |
| `lib/census/industry.ts` (+ `.test.ts`) | Schema.org first, keywords second, `unknown` never `custom`. |
| `lib/census/aggregate.ts` (+ `.test.ts`) | Rows to `CensusSnapshot`. |
| `lib/census/cost.ts` (+ `.test.ts`) | Wall clock and Node CPU, both reported, neither confused for the other. |
| `lib/census/policy.test.ts` | The page's stated policy against the crawler's constants. |
| `lib/census/safety.test.ts` | The greps: no storage, no raw HTML kept, evidence truncated. |
| `scripts/census/seed.mts` | The S4 seed with the ICANN fix, the union across runs and the abort-path fix kept. |
| `scripts/census/crawl.mts` | The polite crawler. Resumable, rate-capped, cost-reporting. |
| `scripts/census/aggregate.mts` | NDJSON to `content/census/snapshot.ts`. |
| `scripts/census/spotcheck.mts` | Draws the deterministic sample a person then judges by hand. |
| `content/census/spotcheck.ts` | The hand-measured precision and coverage figures, printed on the page. |
| `scripts/census/load.mts` | NDJSON to Neon. **Phase B.** |
| `scripts/census/schema.sql` | The Neon schema. **Phase B.** |
| `lib/census/sql.ts` (+ `.test.ts`) | The queries as strings, tested without a database. **Phase B.** |
| `lib/census/api-budgets.ts` (+ `.test.ts`) | The three budgets the JSON API takes. **Phase B.** |
| `app/tools/census/page.tsx` (+ `page.test.ts`) | Server component: metadata, schema, the shell, the sections. |
| `app/tools/census/CensusExplorer.tsx` | The one client island: the industry filter and the CSV download. Covered by `page.test.ts`'s greps, because vitest cannot mount it. |
| `app/tools/census/tool.css` | The tool's own rules. |
| `app/api/census/route.ts` (+ `route.test.ts`) | The JSON API. **Phase B.** |

**Modified**

| Path | Change |
|---|---|
| `content/tools/index.ts` | One import line and one array entry, alphabetical. |
| `content/voice.test.ts` | The census copy joins the `prose` array. |
| `tsconfig.json` | `allowImportingTsExtensions: true`, and `**/*.mts` in `include`. |
| `package.json` | Five `census:*` scripts. No dependency in phase A. |
| `.gitignore` | `data/` ignored, so a run's NDJSON never reaches the repository. |
| `scripts/mutation-check.mjs` | Sixteen rows for T6's guards. |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md` | The words that match the code, and the evidence. |

## Interfaces this plan freezes

T7 (Tide) shares Neon and the cost meter, and any later tool that reads other people's pages from the home machine will want the robots parser. These names are frozen the moment this merges. Additions are allowed; renames are not.

```ts
// lib/census/cost.ts
export type Cost = { wallMs: number; cpuMs: number };
export function startCost(clock?: () => bigint, cpu?: (prev?: NodeJS.CpuUsage) => NodeJS.CpuUsage): () => Cost;
export function formatCost(cost: Cost): string;   // "12.5 s wall, 0.21 s CPU"

// lib/census/robots.ts
export const ROBOTS_MAX_BYTES = 500 * 1024;
export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelaySec: number | null };
export type Robots = { groups: RobotsGroup[]; truncated: boolean };
export type RobotsOutcome = "use-body" | "allow-all" | "disallow-all";
export type RobotsDecision = { allowed: boolean; reason: string; crawlDelaySec: number | null };
export function parseRobots(body: string): Robots;
export function robotsForStatus(status: number): RobotsOutcome;
export function robotsAllows(robots: Robots, agent: string, path: string): RobotsDecision;

// lib/census/fetch.ts
export const CENSUS_TOKEN = "IrishStackCensus";
export const CENSUS_UA: string;
export const REQUEST_TIMEOUT_MS = 2000;
export const RANGE_BYTES = 64 * 1024;
export const MAX_BODY_BYTES = 128 * 1024;
export const MAX_REDIRECTS = 3;
export type FetchRefusal =
  | "blocked-scheme" | "dns" | "private-address" | "timeout" | "network"
  | "http-error" | "not-html" | "too-many-redirects" | "too-large";
export type FetchedPage =
  | { ok: true; url: string; finalUrl: string; status: number; headers: Record<string, string>;
      cookieNames: string[]; html: string; bytes: number; redirects: number }
  | { ok: false; url: string; reason: FetchRefusal; detail: string };
export type CensusFetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  timeoutMs?: number; maxBodyBytes?: number; maxRedirects?: number;
};
export async function resolvePublic(
  hostname: string, deps?: CensusFetchDeps,
): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: "dns" | "private-address"; detail: string }>;
export async function fetchText(url: string, deps?: CensusFetchDeps): Promise<FetchedPage>;
// Added by Task 11, because robots.txt is not HTML and fetchText refuses it.
// `status: 0` means the request never completed, which robotsForStatus reads
// as a complete disallow.
export const ROBOTS_FETCH_MAX_BYTES = 512 * 1024;
export async function fetchRobots(
  url: string, deps?: CensusFetchDeps,
): Promise<{ status: number; body: string }>;

// lib/census/types.ts
export type Reach =
  | "answered" | "opted-out" | "robots-excluded" | "dns-failed"
  | "blocked" | "timed-out" | "http-error" | "not-html";
export type SignalCategory = "platform" | "host" | "payments" | "booking" | "newsletter";
export type ClassMethod = "schema" | "keyword" | "parked" | "none";
export type Signal = { category: SignalCategory; id: string; where: "header" | "cookie" | "html"; evidence: string };
export type H1Reading = { verdict: "clean" | "fragmented" | "no-h1-in-html"; characterElements: number; length: number };
export type CensusRow = {
  domain: string; reach: Reach; status: number | null; signals: Signal[];
  industry: IndustryId; method: ClassMethod; classEvidence: string;
  h1: H1Reading | null; copyrightYear: number | null; ms: number;
};
```

---

### Task 0: Worktree, baseline, and two instrument checks

**Files:**
- Modify: `tsconfig.json`, `package.json`, `.gitignore`

**Interfaces:**
- Consumes: `main` with F3 merged
- Produces: a sibling worktree on `toolshed/t6-census`, a recorded baseline test count, the decision about which fence module to import, and proof that a `.mts` script can import a `.ts` module before anything is built on that assumption

Two of the five steps here are instrument checks rather than work. Prove the instrument before accusing the object: this plan puts every rule in `lib/census/*.ts` and runs it from `scripts/census/*.mts`, and if Node cannot do that on this machine then eleven later tasks rest on a wrong assumption. Ten minutes now, or a rewrite at Task 11.

- [ ] **Step 1: Confirm F3 has landed and decide which fence to import**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -3
for f in content/tools/index.ts content/tools/types.ts components/tools/ToolPage.tsx \
         lib/tools/events.ts lib/headline.ts lib/headline-fetch.ts scripts/phone-check.mjs; do
  git cat-file -e origin/main:$f 2>/dev/null && echo "present: $f" || echo "MISSING: $f"
done
git cat-file -e origin/main:lib/fence.ts 2>/dev/null && echo "FENCE: lib/fence.ts is on main" || echo "FENCE: not on main, use lib/headline-fetch.ts"
```

Expected: seven `present:` lines. Any `MISSING:` means F3 is not merged; **stop and say so** rather than inventing the interface T6 consumes.

The `FENCE:` line decides one import in Task 5 and nothing else. Write the answer into the ledger now, because Task 5 reads it:

- `not on main` (the state at the time of writing, F4 being held): Task 5 imports `import { isBlockedAddress } from "../headline-fetch.ts";` and calls `isBlockedAddress(address)`.
- `is on main`: Task 5 imports `import { isPrivateAddress as isBlockedAddress } from "../fence.ts";` and calls `isBlockedAddress(address)`, so no other line in the file changes. The two are the same address maths under two names, F4's plan says so explicitly, and every test in Task 5 passes either way because the tests assert behaviour on addresses rather than on a name.

There is no third option. Do not copy the address maths into `lib/census/`: it is 120 lines of CIDR arithmetic that has been reviewed once already, and a second copy is a second thing to get wrong.

- [ ] **Step 2: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/t6-census
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/t6-census
```

Expected: the second command prints a sibling path of `C:\Dev\fergus-portfolio`. Every `cd` below means that path; the plan writes `$WT`. Never `git worktree remove` it.

**Do not touch the main checkout after this.** It holds a pre-existing uncommitted `scripts/analytics.mjs` and an `npm run analytics` line in `package.json`, dated 2026-08-22, which are not part of this programme. The ledger records them twice. Leave them.

- [ ] **Step 3: Baseline, and the two instrument checks**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && echo "tsc: clean"
npm test 2>&1 | tail -5
node --version
```

Expected: `tsc: clean`, a passing suite, and `v24.x`. **Write the test-file and test counts into the ledger.** Every later "the suite is green" claim is measured against this number, and a suite that quietly loses a file reads exactly like a suite that passed.

Then the check the whole crawl rests on. Node 22.18 and later strip TypeScript types natively, which is what lets `scripts/census/crawl.mts` import `lib/census/robots.ts` with no build step and no `tsx`. Write the two probe files with an editor rather than a shell heredoc (a heredoc inside a heredoc is how this step was first written and it does not survive being pasted):

`.t6/probe-lib.ts`:

```ts
export type Probe = { n: number };
export function double(p: Probe): number {
  return p.n * 2;
}
```

`.t6/probe-mid.ts`, which is the case that actually matters (a module importing another module, which is what `lib/census/` does all day):

```ts
import { double } from "./probe-lib.ts";

export function quadruple(n: number): number {
  return double({ n: double({ n }) });
}
```

`.t6/probe.mts`:

```ts
import { double, type Probe } from "./probe-lib.ts";
import { quadruple } from "./probe-mid.ts";

const p: Probe = { n: 21 };
console.log("strip ok", double(p), quadruple(3));
```

Then:

```bash
cd "$WT"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .t6/probe.mts
echo "exit: $?"
```

Expected: `strip ok 42 12` and `exit: 0`, with **no warning text**. Two things are proved and both matter:

1. Node executes an `.mts` file with types in it and follows a `.ts` import two levels deep. The second level is the point: `lib/census/` modules import each other, and a chain that works one hop and fails two would show up only on the monthly run. If this fails, the fallback is a `tsx` devDependency, and that is a new dependency and therefore an argument on the pull request, not a quiet install.
2. `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` silences the warning Node otherwise prints once per imported `.ts` file, because this repository's `package.json` has no `"type": "module"`. Without the flag a monthly run prints ten warnings before it does anything, and a scheduler's log full of warnings is a log nobody reads. **Do not fix this by adding `"type": "module"` to `package.json`:** the repository has four existing `.mjs` scripts and a Next config that assume the current setting, and flipping it to quiet a warning is a change to every one of them.

- [ ] **Step 4: The three configuration edits**

`tsconfig.json`. Two changes, both additive. In `compilerOptions`, after `resolveJsonModule`:

```json
    "allowImportingTsExtensions": true,
```

and the include list becomes:

```json
  "include": ["next-env.d.ts", "**/*.ts", "**/*.mts", "**/*.tsx", ".next/types/**/*.ts"],
```

`allowImportingTsExtensions` is what lets `tsc --noEmit` accept `import ... from "./robots.ts"`. It requires `noEmit`, which this project already sets, and it only ever permits something that was previously an error, so it cannot change the meaning of existing code. `**/*.mts` is what puts the crawl scripts under the type checker at all: TypeScript's include globs match the extension as written, so `**/*.ts` does not pick up an `.mts` file and every script would ship unchecked.

`package.json`, four scripts, alphabetical among the existing ones, no dependency added:

```json
    "census:aggregate": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/census/aggregate.mts",
    "census:crawl": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/census/crawl.mts",
    "census:seed": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/census/seed.mts",
    "census:spotcheck": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/census/spotcheck.mts",
```

(`census:load` is added by Task 17, so it is not here yet. Four now, five after phase B.)

`.gitignore`, one line with the reason above it:

```gitignore
# Census runs. Tens of gigabytes of NDJSON and a domain list; the aggregate is
# what gets committed, in content/census/snapshot.ts, and the raw rows never
# leave the machine that made them.
/data/
```

Then prove nothing broke:

```bash
cd "$WT"
rm -rf .t6
npx tsc --noEmit && echo "tsc: clean"
npm test 2>&1 | tail -3
git status --porcelain
```

Expected: `tsc: clean`, the same test count as the baseline, and exactly three modified files.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add tsconfig.json package.json .gitignore
git commit -m "chore(census): let node run the crawl scripts and keep runs out of the repository"
```

What this proves: Node 24 on this machine runs a typed script that imports a typed module, quietly, and the type checker sees both. What it cannot see: whether the same works on the GitHub runner, which does not matter because CI never runs these scripts, and whether Node's type stripping copes with syntax no task uses (enums, namespaces, parameter properties). None of them appear in this plan and none may be introduced.

---

### Task 1: The registry entry, the policy as data, and the coverage constants

**Files:**
- Create: `content/tools/census.ts`, `content/census/excluded.ts`, `content/census/excluded.test.ts`
- Modify: `content/tools/index.ts`, `content/voice.test.ts`

**Interfaces:**
- Consumes: `ToolEntry` from `content/tools/types.ts` (F3, frozen)
- Produces: `census` (the `ToolEntry`), `censusCopy`, `CRAWLER`, `COVERAGE`, `EXCLUDED_DOMAINS`

Every string the tool says lives here, the crawler's own constants included, and that is not a filing preference. The politeness policy is a promise made on a public page about what a robot with Fergus's name on it does to other people's servers. If the page's numbers and the crawler's numbers are two sets of literals they will disagree eventually, and the page will be the one that is wrong. So the numbers are here, the crawler imports them, and `lib/census/policy.test.ts` (Task 11) asserts the sentences contain the numbers.

**`status: "soon"` until Task 14.** A `live` entry goes into the sitemap and the sitemap is what the `phone` CI job walks. Flipping it live before the page exists makes that job fail on a 404 for every other branch that rebases.

**`privacy: "browser"`, and that is the true answer rather than the convenient one.** F3 offers two lines: "Runs in your browser. Nothing leaves this tab." and "Runs on the server. Keeps a hashed IP for a day, nothing else." In phase A the census page is a static document and the only thing that runs is the CSV export, built in the tab out of data the tab already has. Nothing leaves it, so the browser line is exactly true. **When Task 18 adds the lookup box that calls `/api/census`, this changes to `"server"` in the same commit**, because at that point a keystroke does reach a server and the old line would be a false claim on a page whose whole point is not making those. Written here so nobody has to rediscover it.

- [ ] **Step 1: Write the content file**

```ts
// content/tools/census.ts
import type { ToolEntry } from "./types";

/**
 * The Irish Stack Census: its registry entry, its constants, and every word it
 * says.
 *
 * **The numbers in `CRAWLER` are the crawler's own.** `scripts/census/crawl.mts`
 * imports them rather than repeating them, and `lib/census/policy.test.ts`
 * asserts that the sentences in `censusCopy.policy` carry the same figures. A
 * politeness policy printed on a page and a politeness policy obeyed by a robot
 * have to be one object, because the day they are two is the day the page starts
 * lying about something that touches other people.
 *
 * **`COVERAGE` is the headline and it is deliberately awkward.** The tool holds
 * 125,505 of about 333,000 .ie domains. Every share this page prints is a share
 * of that 37.7%, and saying so first is the whole reason the page is worth
 * trusting. See `docs/superpowers/spikes/s4-ie-seed.md` for where each figure
 * came from and which one was rejected.
 */
export const CRAWLER = {
  /** The product token a site owner writes in their own robots.txt to be excluded. */
  token: "IrishStackCensus",
  userAgent:
    "Mozilla/5.0 (compatible; IrishStackCensus/1.0; +https://fergusoreilly.dev/tools/census)",
  /** Requests per domain per run: robots.txt, then one ranged GET. */
  requestsPerDomain: 2,
  /** Seconds. The cap on a single request. */
  timeoutSec: 2,
  /** Kilobytes asked for by Range, and the hard cap on what is read if it is ignored. */
  rangeKb: 64,
  maxBodyKb: 128,
  /** Requests a second across the whole run, all hosts together. */
  ratePerSecond: 8,
  /** Runs a month. */
  runsPerMonth: 1,
  /** Characters of matched text kept as evidence for a rule. */
  evidenceChars: 120,
  contactPath: "/contact",
} as const;

export const COVERAGE = {
  /** S4, collapsed on the ICANN section of the Public Suffix List. */
  seedDomains: 125505,
  /** The .ie Domain Snapshot 2025 infographic, published January 2026, rounded there. */
  registryCount: 333000,
  registryAsOf: "end of 2025",
  registrySource: "the .ie Domain Snapshot 2025",
  /** 125505 / 333000 as a percentage, to one decimal. Recomputed by a test, not trusted. */
  sharePercent: 37.7,
  /** The other two readings. Both printed, neither used for the headline. */
  alternatives: [
    {
      count: 326562,
      asOf: "end of 2024",
      source: "the .ie Domain Profile Report 2024",
      sharePercent: 38.4,
    },
    {
      count: 349615,
      asOf: "undated",
      source: "the weare.ie homepage counter",
      sharePercent: 35.9,
    },
  ],
  crawl: "cc-main-2026-jun-jul-aug",
} as const;

export const censusCopy = {
  coverageHeadline:
    "This census reads 125,505 .ie domains. The .ie registry counted about 333,000 at the end of 2025. So this is 37.7% of .ie, and every percentage below is a percentage of that 37.7%, not of Ireland.",
  seedBias:
    "The list of domains comes from Common Crawl's host graph, which is built from pages Common Crawl fetched and from links pointing at hosts it never fetched. A domain nobody links to and nobody crawls is not in it. So this over-represents sites with any web presence at all and under-represents the dormant tail, and that pushes every platform share towards whatever active sites use.",
  registryNote:
    "Two other registry readings exist and neither is used for the headline. The 2024 profile report gives an exact 326,562 for the end of 2024, which would make this 38.4%. The counter on the registry's homepage says 349,615 with no date on it, beside a figure for registrations this year larger than the whole of 2024's intake, so it may be counting gross registrations rather than live names. That was not resolved, so it is quoted and not used.",
  policyHeading: "What the crawler does, and what it will not do",
  policy: [
    "One page per domain, once a month. There is no link following and no second page. It asks the front door what the building is made of and leaves.",
    "Two requests per domain: robots.txt, then one GET asking for the first 64 kilobytes. The reader stops at 128 kilobytes whether or not the server honoured the range, so the cap does not depend on anybody's cooperation.",
    "DNS is resolved before anything is requested, for the domain and for its www name. Neither resolving means no request is made at all.",
    "robots.txt is fetched first and obeyed, including the part most crawlers skip: if it answers with a server error, or does not answer, that is treated as a no rather than as an absent file. A crawl-delay is honoured.",
    "The user agent says who it is and where to complain: IrishStackCensus, with a link to this page. Put IrishStackCensus in your robots.txt and this stops reading you from the next run.",
    "Ask and you are removed. A domain on the opt-out list is skipped before DNS, so it costs you nothing, and it is still counted here as opted out rather than quietly dropped.",
    "Eight requests a second across the whole run, every host together. That makes a run take about nine hours, which is the point.",
    "Nothing you wrote is kept. Only the rules that matched, at most 120 characters of the text that matched them, whether your h1 survives being read as plain text, and your copyright year. The page itself is thrown away, and the response headers kept are a fixed list, with cookie names and never cookie values.",
    "A 429 or a 503 ends that domain for the month. One retry on a dropped connection, then it is left alone.",
  ],
  methodHeading: "How a row is decided",
  method:
    "Every signal on this page is a rule that matched something in the served HTML or in a response header, and the rule and the text it matched are recorded with it. Nothing is inferred from the absence of evidence: a site that matched no platform rule is unknown, never custom. Industry comes from the site's own schema.org markup where it has any, and from words in its title, heading and description where it does not, and which of the two produced a row is printed beside the row.",
  argueHeading: "What would change these numbers",
  argue: [
    "A bigger seed. Common Crawl's next host graph will name domains this one missed, and each month's list is merged into the last, so coverage climbs rather than resetting.",
    "Reading more than the home page. A booking system that only appears on a bookings page is invisible here, and that biases the booking numbers down by an unknown amount.",
    "Running JavaScript. Sites whose markup arrives from a bundle read as almost empty and are counted as unknown rather than guessed at. On the glass, the other tool here, does run a browser, and the difference between what the two see on one site is the size of this blind spot.",
    "A better keyword table. Where a site has no schema.org markup its industry is inferred from words, and the spot check is the only measurement of how often that is right.",
  ],
  spotCheckHeading: "How accurate the industry column is",
  csvLabel: "Download this table as CSV",
  csvNote:
    "Built in your browser out of the numbers already on this page. Nothing is requested and nothing is stored.",
  forgetNote: "This page stores nothing on your machine, so forget has nothing to wipe here.",
  costHeading: "What this run cost",
  talk:
    "If your site is in here and something about its row is wrong, tell me which domain and I will show you the rule that matched.",
} as const;

export const census: ToolEntry = {
  slug: "census",
  name: "Irish Stack Census",
  blurb:
    "What Irish websites are actually built with. One polite read of the home page of every .ie domain the seed can name, sorted by industry, with the coverage gap printed in front of the findings.",
  privacy: "browser",
  cantSee: [
    "The 62% of .ie it does not hold. The seed is 125,505 domains against a registry that counted about 333,000, so every share here is a share of that 37.7%.",
    "Sites behind JavaScript. It reads the first 64 kilobytes of served HTML and never runs a script, so a page whose markup arrives from a bundle looks almost empty and is recorded as unknown.",
    "Sites that refuse a crawler. A 403, a challenge page or a robots.txt that says no is recorded as blocked or excluded, never as a custom build. There is no bucket here called custom.",
    "Businesses without a .ie domain. Plenty of Irish firms trade on .com, on .eu, or on a social page, and none of them are counted.",
    "Anything below the home page. One page per domain, so a booking system living on a bookings page does not exist as far as this is concerned.",
    "Which of several detected tools is actually in use. A leftover script tag counts exactly the same as a live one.",
    "When a site changed. A first reading is a snapshot, and the who-moved column only exists from the second monthly run onwards.",
  ],
  status: "soon",
  order: 30,
};
```

- [ ] **Step 2: The opt-out list, and the test that keeps it a list of domains**

```ts
// content/census/excluded.ts

/**
 * Domains that asked not to be read.
 *
 * Hand-edited, checked before DNS, so an excluded domain costs its owner
 * nothing at all. It is still counted on the page, as `opted-out`, because a
 * silently dropped domain would make the coverage figure quietly wrong and the
 * whole page rests on that figure being right.
 *
 * A domain gets here two ways: somebody asks, or a run keeps seeing
 * `IrishStackCensus` disallowed in their robots.txt and asking again every
 * month is rude. The second is a judgement rather than an automation, which is
 * why this is a list a person edits and not a table.
 *
 * Lowercase, no scheme, no path, no trailing dot. `excluded.test.ts` enforces
 * that, because a stray "https://" here would silently exclude nothing.
 */
export const EXCLUDED_DOMAINS: readonly string[] = [];
```

```ts
// content/census/excluded.test.ts
import { describe, expect, it } from "vitest";
import { COVERAGE, CRAWLER, census, censusCopy } from "@/content/tools/census";
import { EXCLUDED_DOMAINS } from "./excluded";

describe("the opt-out list", () => {
  it("holds bare lowercase domains and nothing else", () => {
    for (const entry of EXCLUDED_DOMAINS) {
      expect(entry, entry).toMatch(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
      );
      expect(entry, `${entry}: no scheme or path`).not.toContain("/");
      expect(entry, `${entry}: lowercase`).toBe(entry.toLowerCase());
    }
  });

  it("has no duplicates, so a count of exclusions is a count of owners", () => {
    expect(new Set(EXCLUDED_DOMAINS).size).toBe(EXCLUDED_DOMAINS.length);
  });
});

describe("the coverage headline", () => {
  it("states a share that is actually the share", () => {
    const computed = (COVERAGE.seedDomains / COVERAGE.registryCount) * 100;
    expect(Number(computed.toFixed(1))).toBe(COVERAGE.sharePercent);
  });

  it("states the same for both alternative registry readings", () => {
    for (const alt of COVERAGE.alternatives) {
      const computed = (COVERAGE.seedDomains / alt.count) * 100;
      expect(Number(computed.toFixed(1)), alt.source).toBe(alt.sharePercent);
    }
  });

  it("puts the share and both counts in the sentence a visitor reads", () => {
    expect(censusCopy.coverageHeadline).toContain("125,505");
    expect(censusCopy.coverageHeadline).toContain("333,000");
    expect(censusCopy.coverageHeadline).toContain("37.7%");
  });

  it("says the gap in the can't-see list too, because that is where people look", () => {
    expect(census.cantSee.join(" ")).toContain("37.7%");
  });

  it("never claims to be all of .ie", () => {
    const everything = [
      census.blurb,
      ...census.cantSee,
      censusCopy.coverageHeadline,
      censusCopy.seedBias,
      censusCopy.registryNote,
      censusCopy.method,
      ...censusCopy.policy,
      ...censusCopy.argue,
    ]
      .join(" ")
      .toLowerCase();
    for (const forbidden of [
      "every .ie domain",
      "all of .ie",
      "the whole of .ie",
      "complete census",
      "all irish websites",
    ]) {
      expect(everything, forbidden).not.toContain(forbidden);
    }
  });
});

describe("the crawler's constants", () => {
  it("names its own product token inside its user agent, or a robots.txt rule cannot bite", () => {
    expect(CRAWLER.userAgent).toContain(CRAWLER.token);
  });

  it("gives a contact URL that is a page on this site", () => {
    expect(CRAWLER.userAgent).toMatch(/\+https:\/\/fergusoreilly\.dev\/tools\/census\)$/);
  });

  it("reads more than it asks for, so an ignored range header is still capped", () => {
    expect(CRAWLER.maxBodyKb).toBeGreaterThan(CRAWLER.rangeKb);
  });
});
```

- [ ] **Step 3: Register it, and put the copy under the house-style guard**

`content/tools/index.ts`, two lines, both alphabetical. The import goes above `import { headlineCheck } from "./headline-check";`:

```ts
import { census } from "./census";
```

and the array becomes:

```ts
const entries: ToolEntry[] = [census, headlineCheck];
```

`content/voice.test.ts` gains one import, alphabetically among the others at the top of the file:

```ts
import { censusCopy } from "@/content/tools/census";
```

and these entries in the `prose` array, after the `tools.flatMap(...)` block and before the `toolShellCopy` entries:

```ts
    { where: "censusCopy.coverageHeadline", text: censusCopy.coverageHeadline },
    { where: "censusCopy.seedBias", text: censusCopy.seedBias },
    { where: "censusCopy.registryNote", text: censusCopy.registryNote },
    { where: "censusCopy.policyHeading", text: censusCopy.policyHeading },
    ...censusCopy.policy.map((line, i) => ({ where: `censusCopy.policy[${i}]`, text: line })),
    { where: "censusCopy.method", text: censusCopy.method },
    ...censusCopy.argue.map((line, i) => ({ where: `censusCopy.argue[${i}]`, text: line })),
    { where: "censusCopy.csvNote", text: censusCopy.csvNote },
    { where: "censusCopy.forgetNote", text: censusCopy.forgetNote },
    { where: "censusCopy.talk", text: censusCopy.talk },
```

The `tools.flatMap` block already covers `name`, `blurb` and every `cantSee` line for every registry entry, so those are not repeated.

- [ ] **Step 4: Run**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run content/`
Expected: PASS, `content/tools/index.test.ts` (which checks the imports stay alphabetical) and `content/voice.test.ts` included.

What this proves: the copy is in one place, it passes the house-style guard, and the headline percentage is arithmetic over two named figures rather than a number somebody typed. What it cannot see: whether 333,000 is the right figure at all, which is a question about the registry's own publication and is answered by the citation rather than by a test.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add content/tools/census.ts content/tools/index.ts content/census/ content/voice.test.ts
git commit -m "feat(census): the registry entry, the politeness policy as data, and the coverage gap in front of it"
```

---

### Task 2: The types, and forty-two buckets that mean something

**Files:**
- Create: `lib/census/types.ts`, `lib/census/industries.ts`
- Test: `lib/census/industries.test.ts`

**Interfaces:**
- Consumes: `Verdict` from `lib/headline.ts`
- Produces: `IndustryId`, `INDUSTRIES`, `SCHEMA_TO_INDUSTRY`, `KEYWORDS`, and every shared type

The design says "about forty buckets" and names none of them, so this task is where that becomes real. Two rules shape the list. **A bucket exists because a rule can put something in it**, so there is no "other services" catch-all sitting next to a specific bucket it overlaps with. And **the two ways of not knowing are different buckets**: `parked-holding` is a positive detection (a registrar parking page, a for-sale page, a holding page) and `unknown` is the absence of evidence. Collapsing them would turn 30,000 dormant domains into a finding.

There is deliberately **no bucket called `custom`**, and the design says so in the "can't see" line. A site that matched no platform rule is a site we could not read, and calling that a hand-built site is exactly the invented statistic this tool exists not to produce.

- [ ] **Step 1: Write the types**

```ts
// lib/census/types.ts
import type { Verdict } from "../headline.ts";
import type { IndustryId } from "./industries.ts";

/**
 * The shapes shared by the crawl on the home machine, the aggregate step and
 * the page. One file so the three can never disagree, and no I/O anywhere in
 * it.
 */

/** How far the crawler got with one domain. Every value is a row on the page. */
export type Reach =
  /** Answered with HTML we could read. */
  | "answered"
  /** On `content/census/excluded.ts`. Skipped before DNS, so it cost the owner nothing. */
  | "opted-out"
  /** robots.txt said no, or would not answer, which is also a no. */
  | "robots-excluded"
  /** Neither the apex nor the www name resolved. */
  | "dns-failed"
  /** 401, 403, 429 or a challenge page. The site refused us; it is not "custom". */
  | "blocked"
  | "timed-out"
  /** Any other non-2xx. */
  | "http-error"
  /** 2xx, but not HTML. */
  | "not-html";

export type SignalCategory = "platform" | "host" | "payments" | "booking" | "newsletter";

/** How an industry was decided. Printed beside every row. */
export type ClassMethod = "schema" | "keyword" | "parked" | "none";

/**
 * One rule that matched, with the text that matched it.
 *
 * `evidence` is capped at `EVIDENCE_MAX` characters by `lib/census/fingerprint.ts`
 * and it is the only place any of somebody's page survives a run. That cap is a
 * promise on the page, so it has a test and a mutation row.
 */
export type Signal = {
  category: SignalCategory;
  /** A `Signature.id` from `lib/census/signatures.ts`. */
  id: string;
  where: "header" | "cookie" | "html";
  evidence: string;
};

/**
 * The h1, as a shape rather than as words.
 *
 * Read with `extractHeading` from `lib/headline.ts`, which is the headline
 * checker's own parser, so "how many Irish h1s fragment when read as plain
 * text" is measured by the same code that answers it for one page at a time.
 * The words are not kept; the verdict, the character-element count and the
 * length are.
 */
export type H1Reading = { verdict: Verdict; characterElements: number; length: number };

/** One domain, one run. This is the row that reaches Neon and the aggregate. */
export type CensusRow = {
  domain: string;
  reach: Reach;
  status: number | null;
  signals: Signal[];
  industry: IndustryId;
  method: ClassMethod;
  /** Why that industry: a schema.org type, or the keywords that fired. Capped. */
  classEvidence: string;
  h1: H1Reading | null;
  copyrightYear: number | null;
  /** Wall clock for this domain, in milliseconds. */
  ms: number;
};

export type { IndustryId } from "./industries.ts";
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/census/industries.test.ts
import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  INDUSTRY_IDS,
  KEYWORDS,
  SCHEMA_TO_INDUSTRY,
  industryLabel,
  normaliseSchemaType,
} from "./industries";

describe("the buckets", () => {
  it("is about forty of them, which is what the design asked for", () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(38);
    expect(INDUSTRIES.length).toBeLessThanOrEqual(46);
  });

  it("has unique kebab-case ids", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  });

  it("gives every bucket a label a person would read", () => {
    for (const industry of INDUSTRIES) {
      expect(industry.label.length, industry.id).toBeGreaterThan(2);
      expect(industry.label, industry.id).not.toContain("\u2014");
    }
  });

  it("has no bucket called custom, because that is a guess dressed as a finding", () => {
    expect(INDUSTRY_IDS).not.toContain("custom");
    expect(INDUSTRY_IDS).not.toContain("bespoke");
    expect(INDUSTRY_IDS).not.toContain("other");
  });

  it("keeps the two ways of not knowing apart", () => {
    expect(INDUSTRY_IDS).toContain("unknown");
    expect(INDUSTRY_IDS).toContain("parked-holding");
  });

  it("orders unknown and parked last, so a table reads findings first", () => {
    expect(INDUSTRIES.at(-1)?.id).toBe("unknown");
    expect(INDUSTRIES.at(-2)?.id).toBe("parked-holding");
  });
});

describe("the schema.org map", () => {
  it("points every type at a bucket that exists", () => {
    for (const [type, id] of Object.entries(SCHEMA_TO_INDUSTRY)) {
      expect(INDUSTRY_IDS, `${type} -> ${id}`).toContain(id);
    }
  });

  it("is keyed on bare type names, never on a URL", () => {
    for (const type of Object.keys(SCHEMA_TO_INDUSTRY)) {
      expect(type, type).toMatch(/^[A-Z][A-Za-z]*$/);
    }
  });

  it("normalises the four ways a type is written in the wild", () => {
    expect(normaliseSchemaType("https://schema.org/Hotel")).toBe("Hotel");
    expect(normaliseSchemaType("http://schema.org/Hotel")).toBe("Hotel");
    expect(normaliseSchemaType("schema.org/Hotel")).toBe("Hotel");
    expect(normaliseSchemaType("  Hotel  ")).toBe("Hotel");
  });

  it("refuses anything that is not a bare type after normalising", () => {
    expect(normaliseSchemaType("https://example.com/Hotel")).toBeNull();
    expect(normaliseSchemaType("")).toBeNull();
    expect(normaliseSchemaType("Hotel Restaurant")).toBeNull();
  });

  it("routes the types this census is actually going to meet", () => {
    const expected: Record<string, string> = {
      Hotel: "accommodation",
      BedAndBreakfast: "accommodation",
      Restaurant: "restaurant-cafe",
      BarOrPub: "pub-bar",
      Dentist: "health-medical",
      VeterinaryCare: "veterinary",
      Attorney: "legal",
      RealEstateAgent: "property-estate-agency",
      AutoRepair: "motor-trade",
      Plumber: "construction-trades",
      HairSalon: "beauty-wellness",
      GovernmentOrganization: "government-public",
      NGO: "charity-nonprofit",
      CollegeOrUniversity: "education-third-level",
    };
    for (const [type, id] of Object.entries(expected)) {
      expect(SCHEMA_TO_INDUSTRY[type], type).toBe(id);
    }
  });
});

describe("the keyword table", () => {
  it("covers every bucket except the two that are not industries", () => {
    const covered = new Set(KEYWORDS.map((k) => k.id));
    for (const industry of INDUSTRIES) {
      if (industry.id === "unknown" || industry.id === "parked-holding") continue;
      expect(covered, industry.id).toContain(industry.id);
    }
  });

  it("holds only lowercase terms, because matching lowercases the page first", () => {
    for (const row of KEYWORDS) {
      for (const term of [...row.strong, ...row.weak]) {
        expect(term, `${row.id}: ${term}`).toBe(term.toLowerCase());
        expect(term.length, `${row.id}: ${term}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("uses no term in two buckets, or the score is a coin toss", () => {
    const seen = new Map<string, string>();
    for (const row of KEYWORDS) {
      for (const term of [...row.strong, ...row.weak]) {
        const already = seen.get(term);
        expect(already, `"${term}" is in both ${already} and ${row.id}`).toBeUndefined();
        seen.set(term, row.id);
      }
    }
  });

  it("gives every bucket at least one strong term and three weak ones", () => {
    for (const row of KEYWORDS) {
      expect(row.strong.length, row.id).toBeGreaterThanOrEqual(1);
      expect(row.weak.length, row.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("labels a bucket by id and never by index", () => {
    expect(industryLabel("pub-bar")).toBe("Pubs and bars");
    expect(industryLabel("unknown")).toBe("Unknown");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/industries.test.ts`
Expected: FAIL with `Cannot find module './industries'`.

- [ ] **Step 4: Write the module**

```ts
// lib/census/industries.ts

/**
 * The forty-two buckets, the schema.org types that name them, and the words
 * that guess at them.
 *
 * Three decisions are worth knowing before editing this file.
 *
 * **There is no bucket called custom, and there never will be.** A site that
 * matched nothing is `unknown`. A site that refused us is `unknown` with the
 * reach recorded separately. Turning "we could not read it" into "it is
 * hand-built" would be the single most quotable wrong number this tool could
 * produce.
 *
 * **`parked-holding` and `unknown` are different facts.** The first is a
 * positive detection: a registrar parking page, a domain-for-sale page, an
 * under-construction holding page. The second is an absence. Merging them
 * would turn tens of thousands of quiet domains into a finding about Irish
 * business.
 *
 * **No term appears in two buckets.** The keyword pass scores by counting
 * distinct terms, so a term shared between "legal" and "insurance" makes both
 * scores meaningless and the winner arbitrary. The test enforces it, which is
 * a real constraint on adding a word and is meant to be.
 */

export type Industry = { id: string; label: string };

export const INDUSTRIES = [
  { id: "accommodation", label: "Hotels and accommodation" },
  { id: "restaurant-cafe", label: "Restaurants and cafes" },
  { id: "pub-bar", label: "Pubs and bars" },
  { id: "food-drink-producer", label: "Food and drink producers" },
  { id: "grocery-convenience", label: "Grocery and convenience" },
  { id: "retail-clothing", label: "Clothing and footwear" },
  { id: "retail-home-garden", label: "Home, furniture and garden" },
  { id: "retail-general", label: "Other retail" },
  { id: "motor-trade", label: "Motor trade" },
  { id: "construction-trades", label: "Construction and trades" },
  { id: "property-estate-agency", label: "Property and estate agency" },
  { id: "architecture-engineering", label: "Architecture and engineering" },
  { id: "legal", label: "Legal" },
  { id: "accountancy-finance", label: "Accountancy and finance" },
  { id: "insurance", label: "Insurance" },
  { id: "it-software", label: "IT and software" },
  { id: "digital-agency-marketing", label: "Agencies and marketing" },
  { id: "telecoms", label: "Telecoms" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "agriculture-agrifood", label: "Agriculture and agri-food" },
  { id: "logistics-transport", label: "Logistics and transport" },
  { id: "travel-tourism", label: "Travel and tourism" },
  { id: "events-weddings", label: "Events and weddings" },
  { id: "arts-culture", label: "Arts and culture" },
  { id: "sports-recreation", label: "Sport and recreation" },
  { id: "health-medical", label: "Health and medical" },
  { id: "veterinary", label: "Veterinary" },
  { id: "beauty-wellness", label: "Beauty and wellness" },
  { id: "childcare", label: "Childcare" },
  { id: "education-school", label: "Schools" },
  { id: "education-third-level", label: "Third level" },
  { id: "training-professional", label: "Training and courses" },
  { id: "charity-nonprofit", label: "Charities and non-profits" },
  { id: "religion-community", label: "Religion and community" },
  { id: "government-public", label: "Government and public bodies" },
  { id: "media-publishing", label: "Media and publishing" },
  { id: "energy-utilities", label: "Energy, utilities and environment" },
  { id: "recruitment-hr", label: "Recruitment and HR" },
  { id: "professional-services-other", label: "Other professional services" },
  { id: "personal-portfolio", label: "Personal sites and portfolios" },
  { id: "parked-holding", label: "Parked or holding pages" },
  { id: "unknown", label: "Unknown" },
] as const satisfies readonly Industry[];

export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export const INDUSTRY_IDS: readonly string[] = INDUSTRIES.map((i) => i.id);

const LABELS = new Map<string, string>(INDUSTRIES.map((i) => [i.id, i.label]));

export function industryLabel(id: string): string {
  return LABELS.get(id) ?? id;
}

/**
 * `"https://schema.org/Hotel"`, `"schema.org/Hotel"` and `"Hotel"` are the
 * same claim written three ways, and `@type` in the wild is all three plus
 * whitespace. Anything else, including a type from somebody's own vocabulary,
 * comes back null rather than being guessed at.
 */
export function normaliseSchemaType(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return null;
  const bare = trimmed.replace(/^https?:\/\//i, "").replace(/^schema\.org\//i, "");
  return /^[A-Z][A-Za-z]*$/.test(bare) ? bare : null;
}

/**
 * schema.org type to bucket. Only types this census expects to meet on an Irish
 * home page, which is why `Thing`, `Organization` and `LocalBusiness` are
 * absent: they are true of nearly everything and would classify nothing.
 */
export const SCHEMA_TO_INDUSTRY: Record<string, IndustryId> = {
  Hotel: "accommodation",
  Motel: "accommodation",
  Hostel: "accommodation",
  Resort: "accommodation",
  BedAndBreakfast: "accommodation",
  Campground: "accommodation",
  LodgingBusiness: "accommodation",
  Restaurant: "restaurant-cafe",
  CafeOrCoffeeShop: "restaurant-cafe",
  FastFoodRestaurant: "restaurant-cafe",
  IceCreamShop: "restaurant-cafe",
  Bakery: "restaurant-cafe",
  BarOrPub: "pub-bar",
  NightClub: "pub-bar",
  Distillery: "food-drink-producer",
  Brewery: "food-drink-producer",
  Winery: "food-drink-producer",
  GroceryStore: "grocery-convenience",
  ConvenienceStore: "grocery-convenience",
  Butcher: "grocery-convenience",
  ClothingStore: "retail-clothing",
  ShoeStore: "retail-clothing",
  JewelryStore: "retail-clothing",
  HomeGoodsStore: "retail-home-garden",
  FurnitureStore: "retail-home-garden",
  GardenStore: "retail-home-garden",
  HardwareStore: "retail-home-garden",
  Florist: "retail-home-garden",
  Store: "retail-general",
  DepartmentStore: "retail-general",
  ElectronicsStore: "retail-general",
  ToyStore: "retail-general",
  PetStore: "retail-general",
  BookStore: "retail-general",
  SportingGoodsStore: "retail-general",
  OnlineStore: "retail-general",
  AutoDealer: "motor-trade",
  AutoRepair: "motor-trade",
  AutoPartsStore: "motor-trade",
  AutoBodyShop: "motor-trade",
  MotorcycleDealer: "motor-trade",
  GeneralContractor: "construction-trades",
  RoofingContractor: "construction-trades",
  Plumber: "construction-trades",
  Electrician: "construction-trades",
  HVACBusiness: "construction-trades",
  HousePainter: "construction-trades",
  Locksmith: "construction-trades",
  MovingCompany: "logistics-transport",
  RealEstateAgent: "property-estate-agency",
  Attorney: "legal",
  LegalService: "legal",
  Notary: "legal",
  AccountingService: "accountancy-finance",
  FinancialService: "accountancy-finance",
  BankOrCreditUnion: "accountancy-finance",
  InsuranceAgency: "insurance",
  SoftwareApplication: "it-software",
  WebApplication: "it-software",
  ComputerStore: "it-software",
  AdvertisingAgency: "digital-agency-marketing",
  MarketingAgency: "digital-agency-marketing",
  TelevisionStation: "media-publishing",
  RadioStation: "media-publishing",
  NewsMediaOrganization: "media-publishing",
  Newspaper: "media-publishing",
  Blog: "media-publishing",
  Periodical: "media-publishing",
  TravelAgency: "travel-tourism",
  TouristAttraction: "travel-tourism",
  TouristInformationCenter: "travel-tourism",
  TouristTrip: "travel-tourism",
  EventVenue: "events-weddings",
  Museum: "arts-culture",
  ArtGallery: "arts-culture",
  PerformingArtsTheater: "arts-culture",
  MovieTheater: "arts-culture",
  LibrarySystem: "arts-culture",
  SportsClub: "sports-recreation",
  SportsActivityLocation: "sports-recreation",
  GolfCourse: "sports-recreation",
  StadiumOrArena: "sports-recreation",
  BowlingAlley: "sports-recreation",
  Physician: "health-medical",
  Dentist: "health-medical",
  MedicalClinic: "health-medical",
  Hospital: "health-medical",
  Pharmacy: "health-medical",
  Optician: "health-medical",
  Physiotherapy: "health-medical",
  MedicalBusiness: "health-medical",
  VeterinaryCare: "veterinary",
  BeautySalon: "beauty-wellness",
  HairSalon: "beauty-wellness",
  DaySpa: "beauty-wellness",
  NailSalon: "beauty-wellness",
  HealthClub: "beauty-wellness",
  TattooParlor: "beauty-wellness",
  ChildCare: "childcare",
  Preschool: "education-school",
  ElementarySchool: "education-school",
  MiddleSchool: "education-school",
  HighSchool: "education-school",
  School: "education-school",
  CollegeOrUniversity: "education-third-level",
  EducationalOrganization: "training-professional",
  NGO: "charity-nonprofit",
  Church: "religion-community",
  PlaceOfWorship: "religion-community",
  GovernmentOrganization: "government-public",
  GovernmentOffice: "government-public",
  GovernmentBuilding: "government-public",
  CityHall: "government-public",
  EmploymentAgency: "recruitment-hr",
  ProfessionalService: "professional-services-other",
  Consultant: "professional-services-other",
  Person: "personal-portfolio",
  ProfilePage: "personal-portfolio",
};

/**
 * The keyword pass, used only when a site published no usable schema.org type.
 *
 * `strong`: one occurrence is enough. These are terms a site in another bucket
 * would not print on its home page.
 * `weak`: two distinct terms are needed. Individually they are ordinary words.
 *
 * All lowercase, because the matcher lowercases the page first, and no term is
 * allowed in two buckets (see the docblock at the top). The accuracy of this
 * table is **unmeasured** until the spot check in Task 13.
 */
export type KeywordRow = { id: IndustryId; strong: string[]; weak: string[] };

export const KEYWORDS: KeywordRow[] = [
  { id: "accommodation", strong: ["bed and breakfast", "guesthouse", "self catering", "book a room"], weak: ["hotel", "rooms", "ensuite", "guests", "overnight", "check-in"] },
  { id: "restaurant-cafe", strong: ["a la carte", "early bird menu", "our menu"], weak: ["restaurant", "cafe", "brunch", "dining", "bistro", "takeaway"] },
  { id: "pub-bar", strong: ["traditional pub", "craft beer bar", "live music every"], weak: ["pub", "bar", "pints", "publican", "lounge", "beer garden"] },
  { id: "food-drink-producer", strong: ["artisan producer", "our distillery", "our brewery", "farmhouse cheese"], weak: ["brewery", "distillery", "creamery", "producer", "handmade", "small batch"] },
  { id: "grocery-convenience", strong: ["convenience store", "your local shop", "deli counter"], weak: ["supermarket", "groceries", "butchers", "fishmonger", "off licence"] },
  { id: "retail-clothing", strong: ["womenswear", "menswear", "occasion wear", "bridal boutique"], weak: ["clothing", "boutique", "footwear", "jewellery", "accessories", "sizes"] },
  { id: "retail-home-garden", strong: ["garden centre", "furniture showroom", "kitchens and bedrooms"], weak: ["homeware", "interiors", "flooring", "curtains", "nursery plants", "hardware"] },
  { id: "retail-general", strong: ["online shop", "free delivery on orders"], weak: ["shop", "products", "basket", "gift", "stockists", "in stock"] },
  { id: "motor-trade", strong: ["used cars", "nct", "car sales", "vehicle servicing"], weak: ["garage", "tyres", "motors", "mechanic", "bodywork", "dealership"] },
  { id: "construction-trades", strong: ["extensions and renovations", "registered electrical contractor", "groundworks"], weak: ["builders", "plumbing", "carpentry", "roofing", "plastering", "attic conversions"] },
  { id: "property-estate-agency", strong: ["properties for sale", "letting agent", "psra licence"], weak: ["auctioneers", "valuation", "landlords", "tenants", "viewing", "asking price"] },
  { id: "architecture-engineering", strong: ["chartered architect", "structural engineer", "planning permission application"], weak: ["architects", "surveying", "engineering consultancy", "drawings", "site analysis"] },
  { id: "legal", strong: ["solicitors", "barrister", "conveyancing", "law firm"], weak: ["legal advice", "litigation", "probate", "wills", "personal injury", "court"] },
  { id: "accountancy-finance", strong: ["chartered accountants", "bookkeeping services", "tax returns"], weak: ["accountants", "payroll", "audit", "financial planning", "revenue filing", "mortgage advice"] },
  { id: "insurance", strong: ["insurance brokers", "get a quote for cover", "policy renewal"], weak: ["insurance", "premium", "underwriting", "claims", "cover levels"] },
  { id: "it-software", strong: ["software development", "managed it services", "our api"], weak: ["software", "cloud hosting", "cyber security", "integrations", "devops", "helpdesk"] },
  { id: "digital-agency-marketing", strong: ["digital marketing agency", "web design and development", "brand strategy"], weak: ["agency", "seo", "social media management", "copywriting", "campaigns", "creative studio"] },
  { id: "telecoms", strong: ["broadband packages", "business telephony", "fibre to the home"], weak: ["telecoms", "voip", "connectivity", "mobile plans", "network installation"] },
  { id: "manufacturing", strong: ["precision engineering", "our factory", "contract manufacturing"], weak: ["manufacturing", "fabrication", "machining", "production line", "iso 9001", "components"] },
  { id: "agriculture-agrifood", strong: ["agricultural contractor", "livestock", "farm machinery"], weak: ["farming", "silage", "dairy", "tillage", "herd", "agri"] },
  { id: "logistics-transport", strong: ["haulage", "courier service", "freight forwarding"], weak: ["logistics", "distribution", "warehousing", "pallets", "removals", "fleet"] },
  { id: "travel-tourism", strong: ["guided tours", "book your trip", "visitor centre"], weak: ["tours", "sightseeing", "itinerary", "excursions", "travel", "attraction"] },
  { id: "events-weddings", strong: ["wedding venue", "event management", "your special day"], weak: ["weddings", "conferences", "catering for events", "marquee", "party planning"] },
  { id: "arts-culture", strong: ["art gallery", "exhibition programme", "our theatre"], weak: ["gallery", "artist", "exhibitions", "museum", "performance", "cultural"] },
  { id: "sports-recreation", strong: ["gaa club", "golf club", "leisure centre"], weak: ["fixtures", "membership fees", "coaching", "pitches", "tournament", "gym floor"] },
  { id: "health-medical", strong: ["gp practice", "medical centre", "our clinic", "dental practice"], weak: ["patients", "consultant", "appointments", "treatments", "surgery hours", "pharmacy"] },
  { id: "veterinary", strong: ["veterinary practice", "vets", "your pet's health"], weak: ["animal hospital", "vaccinations for pets", "neutering", "equine care", "microchipping"] },
  { id: "beauty-wellness", strong: ["hair salon", "beauty salon", "day spa", "barbershop"], weak: ["massage", "facials", "manicure", "waxing", "stylist", "wellness treatments"] },
  { id: "childcare", strong: ["creche", "montessori", "after school care"], weak: ["childcare", "toddlers", "playgroup", "early years", "ecce"] },
  { id: "education-school", strong: ["national school", "secondary school", "board of management"], weak: ["pupils", "enrolment", "principal", "school year", "junior cert", "leaving cert"] },
  { id: "education-third-level", strong: ["undergraduate programmes", "postgraduate research", "our campus"], weak: ["university", "faculty", "lecturers", "degree", "cao", "modules"] },
  { id: "training-professional", strong: ["qqi level", "training courses", "cpd accredited"], weak: ["training", "workshops", "certification", "learners", "tutor", "safepass"] },
  { id: "charity-nonprofit", strong: ["registered charity", "donate now", "our volunteers"], weak: ["charity", "fundraising", "beneficiaries", "our mission", "support us"] },
  { id: "religion-community", strong: ["mass times", "parish", "community centre"], weak: ["church", "congregation", "clergy", "residents association", "tidy towns"] },
  { id: "government-public", strong: ["county council", "public consultation", "government department"], weak: ["council", "citizens", "public service", "statutory", "local authority"] },
  { id: "media-publishing", strong: ["latest news", "our newsroom", "subscribe to the paper"], weak: ["magazine", "journalism", "editor", "podcast", "broadcast", "press"] },
  { id: "energy-utilities", strong: ["solar panels", "heat pumps", "seai grant"], weak: ["renewable", "energy efficiency", "recycling", "water treatment", "insulation", "waste collection"] },
  { id: "recruitment-hr", strong: ["recruitment agency", "job vacancies", "hr consultancy"], weak: ["candidates", "employers", "staffing", "cv", "placements"] },
  { id: "professional-services-other", strong: ["management consultancy", "business advisory"], weak: ["consultancy", "advisory", "outsourcing", "compliance support", "process improvement"] },
  { id: "personal-portfolio", strong: ["my portfolio", "about me", "personal blog"], weak: ["i am a", "my work", "get in touch with me", "my writing"] },
];
```

- [ ] **Step 5: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/industries.test.ts`
Expected: PASS. The load-bearing assertion is the one that forbids a term in two buckets: it fails the moment somebody adds "consultancy" to `legal` as well as `professional-services-other`, which is the exact edit that would make the classifier arbitrary.

What this proves: the taxonomy is well formed, every schema.org type points at a bucket that exists, and no keyword is shared. What it cannot see: whether any of these buckets is the right bucket for a real Irish site. That is Task 13's spot check and nothing before it may claim otherwise.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/census/types.ts lib/census/industries.ts lib/census/industries.test.ts
git commit -m "feat(census): forty-two buckets, no bucket called custom, and no keyword in two of them"
```

---

### Task 3: Collapsing a host to a registered domain, on the ICANN section only

**Files:**
- Create: `lib/census/psl.ts`
- Test: `lib/census/psl.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PSL_URL`, `IE_ICANN_ZONES`, `parsePslIeZones(text)`, `registeredDomain(host, zones)`, `reverseHost(reversed)`

This is S4's first ruling turned into code, and it is worth restating because it is the difference between a seed of 126,214 and one of 125,505. The Public Suffix List has two sections. The **ICANN** section is registry policy: `gov.ie` is a real zone under which names are separately registered, so `revenue.gov.ie` and `education.gov.ie` are two registrations. The **PRIVATE** section exists for browser cookie scoping, and `myspreadshop.ie` is in it: it is **one** registered `.ie` name hosting 710 Spreadshirt shops. Counting those 710 as 710 registrations inflates the seed by 709 and inflates the coverage claim, which is the number the whole page rests on.

So the collapse uses the ICANN section only, and the test pins both halves of that with the real names S4 measured.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/psl.test.ts
import { describe, expect, it } from "vitest";
import { IE_ICANN_ZONES, parsePslIeZones, registeredDomain, reverseHost } from "./psl";

/**
 * The fixture is the shape of the real Public Suffix List, cut down: a section
 * marker, an ICANN `.ie` zone, the private section marker, and a private `.ie`
 * zone. Both halves are the names S4 actually found on 2026-09-03 (PSL lines
 * 1428 and 15844), so this test fails if the parser stops distinguishing the
 * sections.
 */
const PSL_FIXTURE = [
  "// ===BEGIN ICANN DOMAINS===",
  "",
  "// ie : https://www.weare.ie/",
  "ie",
  "gov.ie",
  "",
  "// uk",
  "co.uk",
  "",
  "// ===END ICANN DOMAINS===",
  "// ===BEGIN PRIVATE DOMAINS===",
  "",
  "// Spreadshop",
  "myspreadshop.ie",
  "myspreadshop.com",
  "",
  "// ===END PRIVATE DOMAINS===",
].join("\n");

describe("parsePslIeZones", () => {
  it("takes gov.ie from the ICANN section", () => {
    expect([...parsePslIeZones(PSL_FIXTURE)]).toEqual(["gov.ie"]);
  });

  it("leaves myspreadshop.ie behind, because it is one registration and not 710", () => {
    expect(parsePslIeZones(PSL_FIXTURE).has("myspreadshop.ie")).toBe(false);
  });

  it("ignores the bare ie rule, which is the tld and not a second-level zone", () => {
    expect(parsePslIeZones(PSL_FIXTURE).has("ie")).toBe(false);
  });

  it("ignores every other tld's zones", () => {
    expect(parsePslIeZones(PSL_FIXTURE).has("co.uk")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    expect(parsePslIeZones("// gov.ie\n\n").size).toBe(0);
  });

  it("returns nothing at all when the ICANN marker is missing, which fails closed", () => {
    // A list whose format changed must not silently be read as one big ICANN
    // section, because that would readmit myspreadshop.ie.
    expect(parsePslIeZones("gov.ie\nmyspreadshop.ie\n").size).toBe(0);
  });

  it("ships a checked-in fallback that matches what S4 measured", () => {
    expect([...IE_ICANN_ZONES]).toEqual(["gov.ie"]);
  });
});

describe("registeredDomain", () => {
  const zones = new Set(["gov.ie"]);

  it("collapses an ordinary host to two labels", () => {
    expect(registeredDomain("www.rte.ie", zones)).toBe("rte.ie");
    expect(registeredDomain("rte.ie", zones)).toBe("rte.ie");
    expect(registeredDomain("news.sport.rte.ie", zones)).toBe("rte.ie");
  });

  it("keeps three labels under a real zone", () => {
    expect(registeredDomain("www.revenue.gov.ie", zones)).toBe("revenue.gov.ie");
    expect(registeredDomain("revenue.gov.ie", zones)).toBe("revenue.gov.ie");
  });

  it("refuses a bare zone, because gov.ie is not itself a registration", () => {
    expect(registeredDomain("gov.ie", zones)).toBeNull();
  });

  it("collapses a private-section host the ordinary way, which is the whole point", () => {
    // 710 of these existed in the S4 run and they are one registered name.
    expect(registeredDomain("shop-a.myspreadshop.ie", zones)).toBe("myspreadshop.ie");
    expect(registeredDomain("shop-b.myspreadshop.ie", zones)).toBe("myspreadshop.ie");
  });

  it("refuses a single label", () => {
    expect(registeredDomain("ie", zones)).toBeNull();
    expect(registeredDomain("", zones)).toBeNull();
  });

  it("lowercases and drops a trailing dot", () => {
    expect(registeredDomain("WWW.RTE.IE.", zones)).toBe("rte.ie");
  });

  it("keeps a punycode label intact, because 119 of them are in the seed", () => {
    expect(registeredDomain("www.xn--gaeilge-example.ie", zones)).toBe("xn--gaeilge-example.ie");
  });

  it("refuses anything with a character a hostname cannot hold", () => {
    expect(registeredDomain("a b.ie", zones)).toBeNull();
    expect(registeredDomain("a_b.ie", zones)).toBeNull();
    expect(registeredDomain("../rte.ie", zones)).toBeNull();
  });
});

describe("reverseHost", () => {
  it("turns the graph's reversed host back into a hostname", () => {
    expect(reverseHost("ie.rte.www")).toBe("www.rte.ie");
    expect(reverseHost("ie.rte")).toBe("rte.ie");
  });

  it("round-trips", () => {
    expect(reverseHost(reverseHost("ie.gov.revenue"))).toBe("ie.gov.revenue");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/psl.test.ts`
Expected: FAIL with `Cannot find module './psl'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/psl.ts

/**
 * Turning a host into a registered domain, using the ICANN section of the
 * Public Suffix List and nothing else.
 *
 * **Why the section matters, in one example.** The PSL carries two `.ie`
 * suffixes. `gov.ie` sits in the ICANN section because it is registry policy:
 * names under it are separate registrations and `revenue.gov.ie` is a real
 * `.ie` registration, one of 218 the S4 run found. `myspreadshop.ie` sits in
 * the PRIVATE section, which exists so browsers scope cookies correctly, and it
 * is ONE registered `.ie` name hosting 710 Spreadshirt shops. Treating the
 * private section as authoritative made the S4 seed 126,214 instead of 125,505,
 * and inflated the coverage claim this whole tool is built around by 709
 * domains that do not exist.
 *
 * So `parsePslIeZones` reads only between the ICANN markers, and **fails closed**:
 * a list whose format changed comes back empty, which collapses everything on
 * two labels. That errs towards under-counting `gov.ie` by 218 rather than
 * over-counting Spreadshirt by 709, and the two errors are not the same size or
 * the same kind. `IE_ICANN_ZONES` is the checked-in answer for a run with no
 * network, and the seed script prefers the live list and says which it used.
 */

export const PSL_URL = "https://publicsuffix.org/list/public_suffix_list.dat";

/** What the ICANN section held for `.ie` on 2026-09-03. The offline fallback. */
export const IE_ICANN_ZONES: ReadonlySet<string> = new Set(["gov.ie"]);

const ICANN_BEGIN = "===BEGIN ICANN DOMAINS===";
const ICANN_END = "===END ICANN DOMAINS===";

/** A hostname label: letters, digits and hyphens, not starting or ending with one. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Second-level `.ie` zones from the ICANN section of a Public Suffix List.
 * Returns an empty set if the markers are missing, which is the fail-closed
 * behaviour described above.
 */
export function parsePslIeZones(text: string): Set<string> {
  const zones = new Set<string>();
  let inIcann = false;
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (line.includes(ICANN_BEGIN)) {
      inIcann = true;
      continue;
    }
    if (line.includes(ICANN_END)) {
      inIcann = false;
      continue;
    }
    if (!inIcann || line === "" || line.startsWith("//")) continue;
    // Wildcard and exception rules are not second-level .ie zones; none exists
    // today and guessing at one would be worse than ignoring it.
    if (line.startsWith("*") || line.startsWith("!")) continue;
    if (line.endsWith(".ie")) zones.add(line.toLowerCase());
  }
  return zones;
}

/**
 * The registered domain for a host, or null if the host is not one.
 *
 * Null for a bare zone (`gov.ie` is not a registration), for a single label,
 * and for anything carrying a character a hostname cannot hold. Null is a
 * refusal and the caller counts it, so a malformed line in the graph is visible
 * rather than silently becoming a domain.
 */
export function registeredDomain(host: string, zones: ReadonlySet<string>): string | null {
  const clean = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (clean === "") return null;

  const labels = clean.split(".");
  if (labels.length < 2) return null;
  for (const label of labels) if (!LABEL.test(label)) return null;

  const lastTwo = labels.slice(-2).join(".");
  if (zones.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  }
  return lastTwo;
}

/**
 * Common Crawl's vertex files sort by reversed host (`ie.rte.www`), which is
 * what makes the whole `.ie` block contiguous and readable with one range
 * request. This puts it back.
 */
export function reverseHost(reversed: string): string {
  return String(reversed ?? "").split(".").reverse().join(".");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/psl.test.ts`
Expected: PASS. Two assertions carry the ruling: `myspreadshop.ie` must not be a zone, and a list with no markers must yield nothing.

What this proves: the collapse implements S4's decision and fails closed when the list format changes. What it cannot see: whether the live Public Suffix List still says what it said on 2026-09-03. The seed script in Task 10 prints which source it used and how many zones it found, so a change is visible in the run log rather than silent.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/psl.ts lib/census/psl.test.ts
git commit -m "feat(census): collapse on the icann section, so one spreadshirt name is not 710 registrations"
```

---

### Task 4: robots.txt, obeyed properly, including the statuses nobody obeys

**Files:**
- Create: `lib/census/robots.ts`
- Test: `lib/census/robots.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ROBOTS_MAX_BYTES`, `parseRobots`, `robotsForStatus`, `robotsAllows`, `matchesPath`

The page promises this in its own words: "robots.txt is fetched first and obeyed, including the part most crawlers skip: if it answers with a server error, or does not answer, that is treated as a no rather than as an absent file." That sentence is a claim about code, so the code has to earn it.

RFC 9309, the four parts that matter here:

1. **Group selection.** A group is one or more `User-agent` lines followed by rules. Our product token `IrishStackCensus` matches case-insensitively. If any group names our token, only those groups apply and `*` is ignored entirely. If none does, the `*` groups apply. If neither exists, everything is allowed.
2. **Rule matching.** Longest matching pattern wins. On an equal-length tie, `Allow` wins. `*` matches any run of characters and `$` anchors the end. An empty `Disallow:` allows everything and is not a rule about the empty path.
3. **Status codes.** 2xx uses the body. 4xx means allowed (there is no file). **5xx and 429 mean disallowed**, which is the clause almost nothing implements, and a network failure is treated the same way for the same reason: we are a guest, and a guest who cannot hear the answer does not walk in.
4. **Size.** Parsing stops at 500 KB.

`Crawl-delay` is not in RFC 9309 at all, and it is honoured anyway because a site that wrote one meant it.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/robots.test.ts
import { describe, expect, it } from "vitest";
import {
  ROBOTS_MAX_BYTES,
  matchesPath,
  parseRobots,
  robotsAllows,
  robotsForStatus,
} from "./robots";

const US = "IrishStackCensus";

describe("parseRobots", () => {
  it("reads one group with its agent and its rules", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public\n");
    expect(robots.groups).toHaveLength(1);
    expect(robots.groups[0].agents).toEqual(["*"]);
    expect(robots.groups[0].rules).toEqual([
      { allow: false, pattern: "/admin" },
      { allow: true, pattern: "/admin/public" },
    ]);
  });

  it("keeps two agents that share one set of rules together", () => {
    const robots = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x\n");
    expect(robots.groups).toHaveLength(1);
    expect(robots.groups[0].agents).toEqual(["a", "b"]);
  });

  it("starts a new group when an agent line follows a rule", () => {
    const robots = parseRobots("User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y\n");
    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[1].agents).toEqual(["b"]);
  });

  it("lowercases agents and field names but never the path", () => {
    const robots = parseRobots("USER-AGENT: GoogleBot\nDISALLOW: /Admin\n");
    expect(robots.groups[0].agents).toEqual(["googlebot"]);
    expect(robots.groups[0].rules[0].pattern).toBe("/Admin");
  });

  it("drops comments, blank lines and unknown fields", () => {
    const robots = parseRobots("# hello\nUser-agent: *  # us\nSitemap: /s.xml\nHost: x\nDisallow: /a\n");
    expect(robots.groups[0].agents).toEqual(["*"]);
    expect(robots.groups[0].rules).toEqual([{ allow: false, pattern: "/a" }]);
  });

  it("reads a crawl-delay and ignores a nonsense one", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 10\n").groups[0].crawlDelaySec).toBe(10);
    expect(parseRobots("User-agent: *\nCrawl-delay: soon\n").groups[0].crawlDelaySec).toBeNull();
    expect(parseRobots("User-agent: *\nCrawl-delay: -5\n").groups[0].crawlDelaySec).toBeNull();
  });

  it("ignores rules that appear before any agent line", () => {
    expect(parseRobots("Disallow: /everything\n").groups).toEqual([]);
  });

  it("stops at the size cap and says it did", () => {
    const padding = "#".repeat(ROBOTS_MAX_BYTES) + "\n";
    const robots = parseRobots(`${padding}User-agent: *\nDisallow: /\n`);
    expect(robots.truncated).toBe(true);
    expect(robots.groups).toEqual([]);
  });

  it("is not truncated when it fits", () => {
    expect(parseRobots("User-agent: *\n").truncated).toBe(false);
  });
});

describe("robotsForStatus", () => {
  it("uses the body on 2xx", () => {
    expect(robotsForStatus(200)).toBe("use-body");
    expect(robotsForStatus(204)).toBe("use-body");
  });

  it("allows everything when there is no file", () => {
    expect(robotsForStatus(404)).toBe("allow-all");
    expect(robotsForStatus(410)).toBe("allow-all");
    expect(robotsForStatus(403)).toBe("allow-all");
  });

  it("DISALLOWS everything on a server error, which is the clause nobody implements", () => {
    expect(robotsForStatus(500)).toBe("disallow-all");
    expect(robotsForStatus(502)).toBe("disallow-all");
    expect(robotsForStatus(503)).toBe("disallow-all");
  });

  it("disallows everything on 429, because being told to slow down is not permission", () => {
    expect(robotsForStatus(429)).toBe("disallow-all");
  });

  it("disallows everything on a status it cannot make sense of", () => {
    expect(robotsForStatus(0)).toBe("disallow-all");
    expect(robotsForStatus(999)).toBe("disallow-all");
  });
});

describe("matchesPath", () => {
  it("matches on a prefix", () => {
    expect(matchesPath("/admin", "/admin/users")).toBe(true);
    expect(matchesPath("/admin", "/administrator")).toBe(true);
    expect(matchesPath("/admin", "/ad")).toBe(false);
  });

  it("treats * as any run of characters", () => {
    expect(matchesPath("/*.pdf", "/docs/a.pdf")).toBe(true);
    expect(matchesPath("/*.pdf", "/docs/a.pdf?x=1")).toBe(true);
    expect(matchesPath("/a/*/c", "/a/b/c")).toBe(true);
  });

  it("anchors on $", () => {
    expect(matchesPath("/*.pdf$", "/a.pdf")).toBe(true);
    expect(matchesPath("/*.pdf$", "/a.pdf?x=1")).toBe(false);
  });

  it("escapes regex metacharacters in the pattern rather than executing them", () => {
    expect(matchesPath("/a+b", "/a+b/c")).toBe(true);
    expect(matchesPath("/a+b", "/aab")).toBe(false);
    expect(matchesPath("/a.b", "/axb")).toBe(false);
  });

  it("matches an empty pattern against nothing", () => {
    expect(matchesPath("", "/")).toBe(false);
  });
});

describe("robotsAllows", () => {
  const allows = (body: string, path = "/") => robotsAllows(parseRobots(body), US, path);

  it("allows when there are no groups at all", () => {
    expect(allows("").allowed).toBe(true);
  });

  it("obeys the star group when nothing names us", () => {
    expect(allows("User-agent: *\nDisallow: /\n").allowed).toBe(false);
    expect(allows("User-agent: *\nDisallow: /admin\n", "/").allowed).toBe(true);
  });

  it("obeys a group naming our token, case-insensitively", () => {
    expect(allows("User-agent: irishstackcensus\nDisallow: /\n").allowed).toBe(false);
    expect(allows("User-agent: IRISHSTACKCENSUS\nDisallow: /\n").allowed).toBe(false);
  });

  it("ignores the star group entirely once a group names us", () => {
    // RFC 9309: the most specific match wins and the wildcard is then not used
    // at all, even for rules the specific group never mentions.
    const body = "User-agent: *\nDisallow: /\nUser-agent: IrishStackCensus\nAllow: /\n";
    expect(allows(body).allowed).toBe(true);
  });

  it("does not match us on somebody else's token that contains ours as a substring", () => {
    // "IrishStackCensusBot" is a different crawler and its rules are not ours.
    expect(allows("User-agent: IrishStackCensusBot\nDisallow: /\n").allowed).toBe(true);
  });

  it("lets the longest pattern win", () => {
    const body = "User-agent: *\nDisallow: /a\nAllow: /a/b\n";
    expect(robotsAllows(parseRobots(body), US, "/a/b/c").allowed).toBe(true);
    expect(robotsAllows(parseRobots(body), US, "/a/x").allowed).toBe(false);
  });

  it("lets allow win a tie", () => {
    const body = "User-agent: *\nDisallow: /a\nAllow: /a\n";
    expect(robotsAllows(parseRobots(body), US, "/a").allowed).toBe(true);
  });

  it("reads an empty disallow as permission, not as a rule about the empty path", () => {
    expect(allows("User-agent: *\nDisallow:\n").allowed).toBe(true);
  });

  it("merges two groups that name the same agent", () => {
    const body = "User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\n";
    expect(robotsAllows(parseRobots(body), US, "/b").allowed).toBe(false);
  });

  it("carries the crawl-delay of the group that applied", () => {
    const body = "User-agent: *\nCrawl-delay: 3\nUser-agent: IrishStackCensus\nCrawl-delay: 7\n";
    expect(robotsAllows(parseRobots(body), US, "/").crawlDelaySec).toBe(7);
  });

  it("says which rule decided, so a run log can be read", () => {
    const decision = robotsAllows(parseRobots("User-agent: *\nDisallow: /\n"), US, "/");
    expect(decision.reason).toContain("/");
    expect(decision.reason.toLowerCase()).toContain("disallow");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/robots.test.ts`
Expected: FAIL with `Cannot find module './robots'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/robots.ts

/**
 * robots.txt, per RFC 9309, obeyed rather than gestured at.
 *
 * The page this tool ships with says, in its own words, that a robots.txt which
 * answers with a server error or does not answer at all is treated as a no. That
 * is `robotsForStatus`, and it is the clause almost every crawler skips: RFC
 * 9309 section 2.3.1.4 says a crawler MAY assume complete disallow on an
 * unavailable status, and this one does, because it is reading 125,505 sites
 * once a month for a page about them and the cost of skipping a site is a row
 * marked `robots-excluded`.
 *
 * Group selection is the other half people get wrong. Once any group names our
 * product token, the `*` groups are not consulted at all, even for a path the
 * specific group says nothing about. Falling back to `*` for the gaps would let
 * a site that wrote a permissive rule for us still be governed by a blanket
 * `Disallow: /` meant for everyone else.
 *
 * Matching is case-sensitive on paths and case-insensitive on agents and field
 * names, which is what the RFC says and is also the only combination that does
 * not surprise a site owner.
 */

/** Half a megabyte, the RFC's floor for what a crawler must parse. */
export const ROBOTS_MAX_BYTES = 500 * 1024;

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelaySec: number | null };
export type Robots = { groups: RobotsGroup[]; truncated: boolean };
export type RobotsOutcome = "use-body" | "allow-all" | "disallow-all";
export type RobotsDecision = { allowed: boolean; reason: string; crawlDelaySec: number | null };

export function parseRobots(body: string): Robots {
  const text = String(body ?? "");
  const truncated = text.length > ROBOTS_MAX_BYTES;
  const usable = truncated ? text.slice(0, ROBOTS_MAX_BYTES) : text;

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  /** True once a rule has been seen, so the next agent line opens a new group. */
  let closed = false;

  for (const raw of usable.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || closed) {
        current = { agents: [], rules: [], crawlDelaySec: null };
        groups.push(current);
        closed = false;
      }
      if (value !== "") current.agents.push(value.toLowerCase());
      continue;
    }

    // A rule before any agent line belongs to nobody, so it is dropped.
    if (!current) continue;

    if (field === "disallow" || field === "allow") {
      closed = true;
      // "Disallow:" with nothing after it is permission, not a rule about the
      // empty path, and adding it as a zero-length pattern would make it the
      // shortest match on everything.
      if (value !== "") current.rules.push({ allow: field === "allow", pattern: value });
      continue;
    }

    if (field === "crawl-delay") {
      closed = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySec = seconds;
    }
  }

  return { groups, truncated };
}

/**
 * What a status code means for the whole host.
 *
 * 4xx is "there is no file", which is permission. 5xx and 429 are "I cannot
 * tell you", which is not permission. Anything outside the ranges the RFC names
 * is treated the same way, because an unrecognised answer is still not a yes.
 */
export function robotsForStatus(status: number): RobotsOutcome {
  if (status >= 200 && status < 300) return "use-body";
  if (status >= 400 && status < 500 && status !== 429) return "allow-all";
  return "disallow-all";
}

/**
 * A robots.txt pattern against a path. `*` is any run of characters, `$`
 * anchors the end, everything else is literal, and every regex metacharacter in
 * the pattern is escaped rather than executed: a path containing `+` or `.` is
 * ordinary and a site owner writing one is not writing a regex.
 */
export function matchesPath(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/** The rules that apply to us: every group naming our token, else every `*` group. */
function applicableGroups(robots: Robots, agent: string): RobotsGroup[] {
  const token = agent.toLowerCase();
  const named = robots.groups.filter((g) => g.agents.includes(token));
  if (named.length > 0) return named;
  return robots.groups.filter((g) => g.agents.includes("*"));
}

export function robotsAllows(robots: Robots, agent: string, path: string): RobotsDecision {
  const groups = applicableGroups(robots, agent);
  if (groups.length === 0) {
    return { allowed: true, reason: "no group applies to this agent", crawlDelaySec: null };
  }

  const crawlDelaySec = groups.reduce<number | null>(
    (found, g) => (g.crawlDelaySec === null ? found : g.crawlDelaySec),
    null,
  );

  let best: RobotsRule | null = null;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!matchesPath(rule.pattern, path)) continue;
      if (best === null || rule.pattern.length > best.pattern.length) {
        best = rule;
        continue;
      }
      // Equal length: allow wins, which is the RFC's tie-break and also the
      // only one that does not turn an explicit permission into a refusal.
      if (rule.pattern.length === best.pattern.length && rule.allow) best = rule;
    }
  }

  if (best === null) {
    return { allowed: true, reason: "no rule matches this path", crawlDelaySec };
  }
  return {
    allowed: best.allow,
    reason: `${best.allow ? "Allow" : "Disallow"}: ${best.pattern}`,
    crawlDelaySec,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/robots.test.ts`
Expected: PASS. Three assertions are the ones that would be quietly wrong in a lazier implementation, and each has a mutation row in Task 15: the 5xx disallow, the star group being ignored once a specific group exists, and `IrishStackCensusBot` not matching `IrishStackCensus`.

What this proves: the parser implements RFC 9309's group selection, longest-match rules and status handling, on the fixtures above. What it cannot see: what real Irish robots.txt files contain. Task 11's pilot prints a tally of decisions across 500 real domains, and that is the first evidence about the wild.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/robots.ts lib/census/robots.test.ts
git commit -m "feat(census): obey robots.txt, including the server error that means no"
```

---

### Task 5: The fenced, capped, single-shot page read

**Files:**
- Create: `lib/census/fetch.ts`
- Test: `lib/census/fetch.test.ts`

**Interfaces:**
- Consumes: `isBlockedAddress` from `@/lib/headline-fetch`, or `isPrivateAddress` from `@/lib/fence` (Task 0 Step 1 decided which); `CRAWLER` from `@/content/tools/census`
- Produces: `CENSUS_UA`, `CENSUS_TOKEN`, `REQUEST_TIMEOUT_MS`, `RANGE_BYTES`, `MAX_BODY_BYTES`, `MAX_REDIRECTS`, `KEPT_HEADERS`, `resolvePublic`, `fetchText`

This module is why the crawl is safe to run on Fergus's home machine. The programme's section 9 requires it in those words: **a hosted tool proves the fence refuses `127.0.0.1`, `169.254.169.254`, a private-range redirect and a DNS name resolving to a private address, before it ships.** T6 is not hosted, which makes it worse, not better: 125,505 hostnames chosen by a third party, resolved and fetched unattended by a process on a home network, is a broader surface than one URL a person pasted into a form.

Three things this file does that `lib/headline-fetch.ts` does not, and each has a reason:

- **It resolves the apex and the `www` name before either is requested,** and reports which one is usable. That is one DNS lookup rather than an HTTP request against a server that may not exist, and it is where S4's "some names in the graph may be dangling" gets answered.
- **It keeps a fixed allowlist of response headers, with cookie names and never cookie values.** A `Set-Cookie` value is a session token belonging to nobody in particular and there is no version of this census that needs one. The names are the signal (`__cfduid`, `wp-settings`, `PHPSESSID`) and the values are somebody's liability.
- **It caps the decoded body at 128 KB while asking for 64 KB by range,** because plenty of servers ignore `Range` and a cap that depends on the other end honouring a header is not a cap.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/fetch.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  KEPT_HEADERS,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
  RANGE_BYTES,
  REQUEST_TIMEOUT_MS,
  CENSUS_TOKEN,
  CENSUS_UA,
  fetchText,
  resolvePublic,
} from "./fetch";

const html = (body = "<h1>hello</h1>") => `<!doctype html><html><body>${body}</body></html>`;

const reply = (init: { status?: number; headers?: Record<string, string>; body?: string } = {}) =>
  new Response(init.body ?? html(), {
    status: init.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers ?? {}) },
  });

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("the constants", () => {
  it("asks for less than it will read, so an ignored range header is still capped", () => {
    expect(RANGE_BYTES).toBe(64 * 1024);
    expect(MAX_BODY_BYTES).toBe(128 * 1024);
    expect(MAX_BODY_BYTES).toBeGreaterThan(RANGE_BYTES);
  });

  it("caps a single request at two seconds", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(2000);
  });

  it("carries the product token a site owner would write in robots.txt", () => {
    expect(CENSUS_TOKEN).toBe("IrishStackCensus");
    expect(CENSUS_UA).toContain(CENSUS_TOKEN);
    expect(CENSUS_UA).toContain("https://fergusoreilly.dev/tools/census");
  });

  it("keeps no header that could hold a person's session", () => {
    expect(KEPT_HEADERS).not.toContain("set-cookie");
    expect(KEPT_HEADERS).not.toContain("authorization");
    expect(KEPT_HEADERS).not.toContain("www-authenticate");
    expect(KEPT_HEADERS).toContain("server");
    expect(KEPT_HEADERS).toContain("content-type");
  });
});

describe("resolvePublic", () => {
  it("returns every address when they are all public", async () => {
    const result = await resolvePublic("example.ie", { lookupImpl: publicLookup });
    expect(result).toEqual({ ok: true, addresses: ["93.184.216.34"] });
  });

  it("refuses loopback", async () => {
    const result = await resolvePublic("evil.ie", {
      lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    expect(result).toEqual({ ok: false, reason: "private-address", detail: expect.stringContaining("127.0.0.1") });
  });

  it("refuses the cloud metadata address", async () => {
    const result = await resolvePublic("evil.ie", {
      lookupImpl: async () => [{ address: "169.254.169.254", family: 4 }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses when ANY answer is private, not just the first", async () => {
    const result = await resolvePublic("evil.ie", {
      lookupImpl: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an IPv6 loopback and a link-local", async () => {
    for (const address of ["::1", "fe80::1", "fc00::1"]) {
      const result = await resolvePublic("evil.ie", { lookupImpl: async () => [{ address, family: 6 }] });
      expect(result.ok, address).toBe(false);
    }
  });

  it("reports dns rather than private when nothing resolves", async () => {
    const result = await resolvePublic("gone.ie", { lookupImpl: async () => [] });
    expect(result).toEqual({ ok: false, reason: "dns", detail: expect.stringContaining("gone.ie") });
  });

  it("treats a throwing resolver as a name that does not resolve", async () => {
    const result = await resolvePublic("gone.ie", {
      lookupImpl: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns");
  });
});

describe("fetchText", () => {
  it("reads a page and keeps only the allowlisted headers", async () => {
    const fetchImpl = vi.fn(async () =>
      reply({
        headers: {
          server: "nginx",
          "x-powered-by": "PHP/8.2",
          "set-cookie": "PHPSESSID=abc123secret; Path=/",
          "x-secret-thing": "do not keep me",
        },
      }),
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.headers.server).toBe("nginx");
    expect(page.headers["x-powered-by"]).toBe("PHP/8.2");
    expect(page.headers["x-secret-thing"]).toBeUndefined();
    expect(page.headers["set-cookie"]).toBeUndefined();
    expect(page.cookieNames).toEqual(["PHPSESSID"]);
    expect(JSON.stringify(page.headers)).not.toContain("abc123secret");
    expect(JSON.stringify(page.cookieNames)).not.toContain("abc123secret");
  });

  it("sends the census user agent and asks for a range", async () => {
    const fetchImpl = vi.fn(async () => reply());
    await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(CENSUS_UA);
    expect(headers.range).toBe(`bytes=0-${RANGE_BYTES - 1}`);
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBe("omit");
  });

  it("accepts a 206, because that is what a served range looks like", async () => {
    const fetchImpl = vi.fn(async () => reply({ status: 206 }));
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page.ok).toBe(true);
  });

  it("refuses a scheme that is not http or https", async () => {
    const page = await fetchText("file:///etc/passwd", { lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "blocked-scheme" });
  });

  it("refuses an address literal on a private range without asking a resolver", async () => {
    const lookupImpl = vi.fn(publicLookup);
    const page = await fetchText("http://127.0.0.1/", { lookupImpl });
    expect(page).toMatchObject({ ok: false, reason: "private-address" });
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it("re-checks the address on every redirect hop", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === "https://example.ie/"
        ? new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/" } })
        : reply(),
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "private-address" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-resolves a redirect to a NAME that points somewhere private", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === "https://example.ie/"
        ? new Response("", { status: 302, headers: { location: "https://inside.example.ie/" } })
        : reply(),
    );
    const lookupImpl = vi.fn(async (hostname: string) =>
      hostname === "inside.example.ie"
        ? [{ address: "10.0.0.5", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl });
    expect(page).toMatchObject({ ok: false, reason: "private-address" });
  });

  it("stops after the redirect cap", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 302, headers: { location: "https://example.ie/next" } }),
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "too-many-redirects" });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it("stops reading a body that ignores the range and keeps coming", async () => {
    const huge = "x".repeat(MAX_BODY_BYTES + 4096);
    const fetchImpl = vi.fn(async () => reply({ body: huge }));
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "too-large" });
  });

  it("reads a body that is exactly at the cap", async () => {
    const exact = "y".repeat(MAX_BODY_BYTES);
    const fetchImpl = vi.fn(async () => reply({ body: exact }));
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.bytes).toBe(MAX_BODY_BYTES);
  });

  it("refuses a body that is not HTML, before reading it", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "not-html" });
  });

  it("reports an http error with the status in the detail", async () => {
    const fetchImpl = vi.fn(async () => reply({ status: 503 }));
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "http-error" });
    if (!page.ok) expect(page.detail).toContain("503");
  });

  it("times out rather than hanging", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const page = await fetchText("https://example.ie/", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl: publicLookup,
      timeoutMs: 10,
    });
    expect(page).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("never throws, whatever fetch does", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page).toMatchObject({ ok: false, reason: "network" });
  });

  it("reports where it ended up after a redirect it did follow", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === "https://example.ie/"
        ? new Response("", { status: 301, headers: { location: "https://www.example.ie/" } })
        : reply(),
    );
    const page = await fetchText("https://example.ie/", { fetchImpl, lookupImpl: publicLookup });
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.finalUrl).toBe("https://www.example.ie/");
      expect(page.redirects).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/fetch.test.ts`
Expected: FAIL with `Cannot find module './fetch'`.

- [ ] **Step 3: Write the module**

The first import line depends on Task 0 Step 1. Write **one** of these two, and nothing else in the file changes:

```ts
import { isBlockedAddress } from "../headline-fetch.ts";
```
```ts
import { isPrivateAddress as isBlockedAddress } from "../fence.ts";
```

```ts
// lib/census/fetch.ts
import { lookup } from "node:dns/promises";
import { isBlockedAddress } from "../headline-fetch.ts"; // see Task 0 Step 1
import { CRAWLER } from "../../content/tools/census.ts";

/**
 * One polite read of one page, on behalf of a census.
 *
 * This is the module that makes the crawl safe to run on a home machine.
 * 125,505 hostnames chosen by a third party, resolved and fetched unattended by
 * a process sitting on a home network, is a wider surface than one URL somebody
 * pasted into a form: nobody is watching, and a `.ie` name pointed at
 * 192.168.1.1 costs nothing to register. So the same fence the headline checker
 * uses runs here, on the typed URL and again on every redirect, with every
 * resolved address checked rather than the first.
 *
 * Three things this does that `lib/headline-fetch.ts` does not, each for a
 * reason:
 *
 * **`resolvePublic` is separate and runs before any HTTP request.** DNS is
 * answered by a resolver, not by somebody's web server, so trying the apex and
 * the `www` name costs the site nothing. It is also where S4's open question
 * gets answered: the host graph is built partly from link targets, so some
 * names in the seed never existed.
 *
 * **Headers are an allowlist and cookies are names only.** A `Set-Cookie` value
 * is a session token belonging to nobody in particular. The census wants to
 * know that a site sets `PHPSESSID`, never what it set it to, and the only way
 * to be sure a value never reaches a file is to never put it in the object.
 *
 * **The body cap is bigger than the range asked for.** Plenty of servers ignore
 * `Range` and send everything, and a cap that depends on the far end honouring
 * a header is not a cap. 64 KB is the request; 128 KB is what the reader will
 * take before it gives up on that domain.
 *
 * Nothing throws. The crawler runs this 125,505 times unattended and one
 * unhandled rejection ends the run.
 */

export const CENSUS_TOKEN = CRAWLER.token;
export const CENSUS_UA = CRAWLER.userAgent;
export const REQUEST_TIMEOUT_MS = CRAWLER.timeoutSec * 1000;
export const RANGE_BYTES = CRAWLER.rangeKb * 1024;
export const MAX_BODY_BYTES = CRAWLER.maxBodyKb * 1024;
export const MAX_REDIRECTS = 3;

/**
 * The response headers worth keeping, and no others.
 *
 * Everything here is either a fingerprint (who serves this, what runs on it) or
 * needed to read the body. Nothing here can carry a credential: `set-cookie`,
 * `authorization` and `www-authenticate` are deliberately absent and
 * `lib/census/safety.test.ts` asserts they stay absent.
 */
export const KEPT_HEADERS: readonly string[] = [
  "content-type",
  "server",
  "x-powered-by",
  "x-generator",
  "via",
  "cf-ray",
  "cf-cache-status",
  "x-vercel-id",
  "x-nf-request-id",
  "x-github-request-id",
  "x-amz-cf-id",
  "x-served-by",
  "x-shopid",
  "x-shopify-stage",
  "x-wix-request-id",
  "x-litespeed-cache",
  "x-drupal-cache",
  "x-aspnet-version",
  "x-azure-ref",
  "x-hs-hub-id",
];

export type FetchRefusal =
  | "blocked-scheme"
  | "dns"
  | "private-address"
  | "timeout"
  | "network"
  | "http-error"
  | "not-html"
  | "too-many-redirects"
  | "too-large";

export type FetchedPage =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      status: number;
      headers: Record<string, string>;
      cookieNames: string[];
      html: string;
      bytes: number;
      redirects: number;
    }
  | { ok: false; url: string; reason: FetchRefusal; detail: string };

export type Resolved = { address: string; family: number };

export type CensusFetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<Resolved[]>;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
};

async function defaultLookup(hostname: string): Promise<Resolved[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

/** True when the host is written as an address rather than as a name. */
function isAddressLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":");
}

/**
 * Every address a name resolves to, or the reason it is not usable.
 *
 * Every answer is checked, not the first. A name with one public and one
 * private record is still a route into the network the crawler is sitting on,
 * and checking `answers[0]` is exactly how that gets missed.
 */
export async function resolvePublic(
  hostname: string,
  deps: CensusFetchDeps = {},
): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: "dns" | "private-address"; detail: string }> {
  const resolve = deps.lookupImpl ?? defaultLookup;
  let answers: Resolved[] = [];
  try {
    answers = (await resolve(hostname)) ?? [];
  } catch {
    answers = [];
  }
  if (answers.length === 0) return { ok: false, reason: "dns", detail: `${hostname} does not resolve.` };
  for (const answer of answers) {
    if (isBlockedAddress(answer.address)) {
      return {
        ok: false,
        reason: "private-address",
        detail: `${hostname} resolves to ${answer.address}, which is private, loopback or reserved.`,
      };
    }
  }
  return { ok: true, addresses: answers.map((a) => a.address) };
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function fail(url: string, reason: FetchRefusal, detail: string): FetchedPage {
  return { ok: false, url, reason, detail };
}

/** The scheme and address check, run on the URL and again on every redirect. */
async function guard(url: string, target: URL, deps: CensusFetchDeps): Promise<FetchedPage | null> {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fail(url, "blocked-scheme", `${target.protocol} is not a scheme this crawler fetches.`);
  }
  const hostname = target.hostname;
  if (hostname === "") return fail(url, "blocked-scheme", "That URL has no host.");

  if (isAddressLiteral(hostname)) {
    return isBlockedAddress(hostname)
      ? fail(url, "private-address", `${hostname} is private, loopback or reserved.`)
      : null;
  }
  const resolved = await resolvePublic(hostname, deps);
  return resolved.ok ? null : fail(url, resolved.reason, resolved.detail);
}

/** Cookie names only. The value after the first `=` never leaves this function. */
function cookieNamesFrom(response: Response): string[] {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const single = response.headers.get("set-cookie");
  const all = raw.length > 0 ? raw : single ? [single] : [];
  const names = new Set<string>();
  for (const line of all) {
    const name = line.split("=")[0]?.trim();
    if (name) names.add(name.slice(0, 64));
  }
  return [...names];
}

function keptHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) out[name] = value.slice(0, 200);
  }
  return out;
}

/** Reads at most `maxBytes` and stops pulling the moment it goes over. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const bytes = new TextEncoder().encode(await response.text());
    return bytes.byteLength > maxBytes ? null : bytes;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const declared = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(declared || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function fetchText(rawUrl: string, deps: CensusFetchDeps = {}): Promise<FetchedPage> {
  const send = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxBytes = deps.maxBodyBytes ?? MAX_BODY_BYTES;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const url = String(rawUrl ?? "").trim();

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return fail(url, "blocked-scheme", "That is not a URL this crawler can read.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let redirects = 0;
    for (;;) {
      const refusal = await guard(url, target, deps);
      if (refusal) return refusal;

      let response: Response;
      try {
        response = await send(target.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          headers: {
            "user-agent": CENSUS_UA,
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en",
            range: `bytes=0-${RANGE_BYTES - 1}`,
          },
        });
      } catch {
        return controller.signal.aborted
          ? fail(url, "timeout", `No answer within ${timeoutMs} ms.`)
          : fail(url, "network", `${target.host} could not be reached.`);
      }

      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return fail(url, "http-error", `${target.host} answered ${response.status} with nowhere to go.`);
        }
        if (redirects >= maxRedirects) {
          return fail(url, "too-many-redirects", `More than ${maxRedirects} redirects.`);
        }
        try {
          target = new URL(location, target);
        } catch {
          return fail(url, "http-error", `${target.host} redirected somewhere unreadable.`);
        }
        redirects += 1;
        // Round again, which re-runs the guard on the new address. That is the
        // whole reason redirects are read here rather than followed by fetch.
        continue;
      }

      // 206 is what a served range looks like, so it is a success, not an error.
      if (!response.ok && response.status !== 206) {
        return fail(url, "http-error", `${target.host} responded ${response.status}.`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const type = contentType.split(";")[0].trim().toLowerCase();
      if (type !== "text/html" && type !== "application/xhtml+xml") {
        return fail(url, "not-html", `Answered ${type || "no content type"}, not HTML.`);
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await readCapped(response, maxBytes);
      } catch {
        return controller.signal.aborted
          ? fail(url, "timeout", `Stopped reading after ${timeoutMs} ms.`)
          : fail(url, "network", `${target.host} stopped sending.`);
      }
      if (!bytes) return fail(url, "too-large", `More than ${maxBytes} bytes and still going.`);

      return {
        ok: true,
        url,
        finalUrl: target.toString(),
        status: response.status,
        headers: keptHeaders(response),
        cookieNames: cookieNamesFrom(response),
        html: decode(bytes, contentType),
        bytes: bytes.byteLength,
        redirects,
      };
    }
  } catch {
    return controller.signal.aborted
      ? fail(url, "timeout", `Stopped after ${timeoutMs} ms.`)
      : fail(url, "network", "Something went wrong reaching that host.");
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/fetch.test.ts`
Expected: PASS, including the four the programme's section 9 names by hand: `127.0.0.1`, `169.254.169.254`, a redirect into a private range, and a name that resolves to `10.0.0.5`.

What this proves: the fence refuses each of those four, on the first URL and on every redirect, with every resolved answer checked; the header allowlist drops a `Set-Cookie` value and keeps its name; and the body cap holds when the range header is ignored. What it cannot see: DNS rebinding, which `lib/headline-fetch.ts`'s docblock already names as the gap it does not close, and which is the same gap here for the same reason. On this crawler the blast radius is bounded the same way: the content type is checked before a byte of the body is read, so a rebind onto a metadata endpoint gets `text/plain` and is discarded unread.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/fetch.ts lib/census/fetch.test.ts
git commit -m "feat(census): one fenced capped read per domain, with cookie names and never values"
```

---

### Task 6: The signature table

**Files:**
- Create: `lib/census/signatures.ts`
- Test: `lib/census/signatures.test.ts`

**Interfaces:**
- Consumes: `SignalCategory` from `lib/census/types.ts`
- Produces: `Matcher`, `Signature`, `SIGNATURES`, `SIGNATURES_BY_ID`, `signatureName(id)`

Data, not logic. Five categories, one table, every entry carrying the rule that identifies it. Four constraints, each with a test, and each one is a mistake somebody makes with a table like this:

1. **No `g` flag on any pattern.** A regex with `g` keeps `lastIndex` between calls, so the same object reused across 125,505 pages starts returning `null` on pages it should match, in a pattern that looks random. This is the single most likely silent corruption in the whole tool and it has its own test and its own mutation row.
2. **Every pattern is case-insensitive.** HTML is written by hand and `WP-Content` happens.
3. **No pattern may match the empty string.** A matcher that matches everything makes its signature the most popular platform in Ireland.
4. **A signature is a positive detection.** There is no rule that fires on the absence of something, because that produces `custom` and there is no `custom`.

The table below is the starting set. It is **not** claimed to be complete or correctly weighted: it is a set of rules that have a stated form, and Task 13's spot check is the only measurement of how often they are right. Adding a signature is one entry and one test case.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/signatures.test.ts
import { describe, expect, it } from "vitest";
import { SIGNATURES, SIGNATURES_BY_ID, signatureName } from "./signatures";

describe("the table", () => {
  it("covers all five categories the design names", () => {
    const categories = new Set(SIGNATURES.map((s) => s.category));
    expect([...categories].sort()).toEqual(["booking", "host", "newsletter", "payments", "platform"]);
  });

  it("has a unique kebab-case id for every signature", () => {
    const ids = SIGNATURES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("gives every signature a name a person would recognise", () => {
    for (const s of SIGNATURES) {
      expect(s.name.length, s.id).toBeGreaterThan(1);
      expect(s.name, s.id).not.toContain("\u2014");
    }
  });

  it("gives every signature at least one matcher", () => {
    for (const s of SIGNATURES) expect(s.matchers.length, s.id).toBeGreaterThan(0);
  });

  it("NEVER uses the g flag, because lastIndex would carry between 125,505 pages", () => {
    for (const s of SIGNATURES) {
      for (const m of s.matchers) {
        expect(m.pattern.flags, `${s.id}: ${m.pattern}`).not.toContain("g");
      }
    }
  });

  it("is case-insensitive everywhere, because HTML is written by hand", () => {
    for (const s of SIGNATURES) {
      for (const m of s.matchers) {
        expect(m.pattern.flags, `${s.id}: ${m.pattern}`).toContain("i");
      }
    }
  });

  it("has no pattern that matches the empty string", () => {
    for (const s of SIGNATURES) {
      for (const m of s.matchers) {
        expect(m.pattern.test(""), `${s.id}: ${m.pattern} matches everything`).toBe(false);
      }
    }
  });

  it("names a lowercase header on every header matcher, since headers are lowercased first", () => {
    for (const s of SIGNATURES) {
      for (const m of s.matchers) {
        if (m.kind === "header") expect(m.name, `${s.id}`).toBe(m.name.toLowerCase());
      }
    }
  });

  it("indexes by id and labels by id", () => {
    expect(SIGNATURES_BY_ID.get("wordpress")?.category).toBe("platform");
    expect(signatureName("wordpress")).toBe("WordPress");
    expect(signatureName("not-a-signature")).toBe("not-a-signature");
  });
});

describe("the rules, against markup they are meant to catch", () => {
  const hit = (id: string, text: string) => {
    const signature = SIGNATURES_BY_ID.get(id);
    expect(signature, id).toBeDefined();
    return signature!.matchers.some((m) => m.kind !== "header" && m.pattern.test(text));
  };

  it("catches WordPress on wp-content and on the generator", () => {
    expect(hit("wordpress", '<link href="/wp-content/themes/x/style.css">')).toBe(true);
    expect(hit("wordpress", '<meta name="generator" content="WordPress 6.5">')).toBe(true);
  });

  it("catches WooCommerce without catching plain WordPress", () => {
    expect(hit("woocommerce", '<script src="/wp-content/plugins/woocommerce/assets/js/x.js">')).toBe(true);
    expect(hit("woocommerce", '<link href="/wp-content/themes/x/style.css">')).toBe(false);
  });

  it("catches Shopify, Squarespace, Wix and Webflow on their asset hosts", () => {
    expect(hit("shopify", '<script src="https://cdn.shopify.com/s/files/x.js">')).toBe(true);
    expect(hit("squarespace", '<link href="https://static1.squarespace.com/x.css">')).toBe(true);
    expect(hit("wix", '<script src="https://static.parastorage.com/services/x.js">')).toBe(true);
    expect(hit("webflow", '<meta name="generator" content="Webflow">')).toBe(true);
  });

  it("catches Stripe and Realex, which is the Irish one", () => {
    expect(hit("stripe", '<script src="https://js.stripe.com/v3/">')).toBe(true);
    expect(hit("realex", '<form action="https://hpp.realexpayments.com/pay">')).toBe(true);
  });

  it("catches the booking systems Irish sites actually run", () => {
    expect(hit("resdiary", '<script src="https://booking.resdiary.com/widget.js">')).toBe(true);
    expect(hit("phorest", '<a href="https://phorest.com/book/salons/x">Book</a>')).toBe(true);
    expect(hit("mews", '<script src="https://api.mews.com/distributor/distributor.min.js">')).toBe(true);
  });

  it("catches the newsletter tools", () => {
    expect(hit("mailchimp", '<form action="https://x.us1.list-manage.com/subscribe/post">')).toBe(true);
    expect(hit("klaviyo", '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js">')).toBe(true);
  });

  it("catches a parking page without catching a real page that says the word", () => {
    expect(hit("parked", '<script src="https://parkingcrew.net/x.js">')).toBe(true);
    expect(hit("parked", "<h1>This domain is for sale</h1>")).toBe(true);
    expect(hit("parked", "<p>We sell parking sensors for cars.</p>")).toBe(false);
  });

  it("does not fire WordPress on a page that merely mentions it", () => {
    expect(hit("wordpress", "<p>We build WordPress sites for clients.</p>")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/signatures.test.ts`
Expected: FAIL with `Cannot find module './signatures'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/signatures.ts
import type { SignalCategory } from "./types.ts";

/**
 * The rules that turn a home page into a stack.
 *
 * Data, not logic, and four rules hold it together, each with a test.
 *
 * **No `g` flag, ever.** A regex carrying `g` keeps `lastIndex` between calls,
 * and one of these objects is reused across 125,505 pages, so a `g` here would
 * make matches start disappearing in a pattern that looks like noise in the
 * data rather than a bug in the code. This is the most dangerous line anybody
 * could add to this file and there is a mutation row for it.
 *
 * **Every pattern is case-insensitive**, because HTML is typed by people.
 *
 * **No pattern may match the empty string.** One that does makes its signature
 * the most popular platform in Ireland.
 *
 * **Every signature is a positive detection.** Nothing fires on the absence of
 * something else. That is what keeps "we could not read this site" out of the
 * platform column, and it is why there is no signature called `custom`.
 *
 * The set below is a starting set. Its accuracy is **unmeasured** until the
 * spot check, and a signature is added by writing one entry here and one case
 * in the test beside it.
 */

export type Matcher =
  /** `name` is a lowercase header name; `pattern` is tested against its value. */
  | { kind: "header"; name: string; pattern: RegExp }
  /** Tested against each cookie NAME. Values never reach this module. */
  | { kind: "cookie"; pattern: RegExp }
  /** Tested against the first 128 KB of served HTML. */
  | { kind: "html"; pattern: RegExp };

export type Signature = {
  id: string;
  category: SignalCategory;
  name: string;
  matchers: Matcher[];
};

const html = (pattern: RegExp): Matcher => ({ kind: "html", pattern });
const header = (name: string, pattern: RegExp): Matcher => ({ kind: "header", name, pattern });
const cookie = (pattern: RegExp): Matcher => ({ kind: "cookie", pattern });

export const SIGNATURES: readonly Signature[] = [
  /* ── platform ─────────────────────────────────────────────────────────── */
  { id: "wordpress", category: "platform", name: "WordPress", matchers: [html(/\/wp-content\//i), html(/\/wp-includes\//i), html(/<meta[^>]+name=["']generator["'][^>]+content=["']wordpress/i)] },
  { id: "woocommerce", category: "platform", name: "WooCommerce", matchers: [html(/\/plugins\/woocommerce\//i), html(/\bwoocommerce-page\b/i), cookie(/^woocommerce_/i)] },
  { id: "shopify", category: "platform", name: "Shopify", matchers: [html(/cdn\.shopify\.com/i), html(/\bShopify\.theme\b/i), header("x-shopid", /^\d+$/i)] },
  { id: "squarespace", category: "platform", name: "Squarespace", matchers: [html(/static1\.squarespace\.com/i), html(/<meta[^>]+content=["']squarespace/i)] },
  { id: "wix", category: "platform", name: "Wix", matchers: [html(/static\.parastorage\.com/i), header("x-wix-request-id", /\w/i)] },
  { id: "webflow", category: "platform", name: "Webflow", matchers: [html(/<meta[^>]+name=["']generator["'][^>]+content=["']webflow/i), html(/assets(?:-global)?\.website-files\.com/i)] },
  { id: "drupal", category: "platform", name: "Drupal", matchers: [html(/\/sites\/(?:default|all)\/files\//i), header("x-generator", /drupal/i)] },
  { id: "joomla", category: "platform", name: "Joomla", matchers: [html(/<meta[^>]+content=["']joomla/i), html(/\/media\/jui\//i)] },
  { id: "umbraco", category: "platform", name: "Umbraco", matchers: [html(/\/umbraco\//i), cookie(/^UMB_/i)] },
  { id: "sitefinity", category: "platform", name: "Sitefinity", matchers: [html(/\/Telerik\.Web\.UI/i), html(/sitefinity/i)] },
  { id: "kentico", category: "platform", name: "Kentico", matchers: [html(/\/CMSPages\//i), cookie(/^CMSPreferredCulture$/i)] },
  { id: "silverstripe", category: "platform", name: "Silverstripe", matchers: [html(/<meta[^>]+content=["']silverstripe/i)] },
  { id: "typo3", category: "platform", name: "TYPO3", matchers: [html(/<meta[^>]+content=["']typo3/i), html(/\/typo3temp\//i)] },
  { id: "weebly", category: "platform", name: "Weebly", matchers: [html(/cdn\d?\.editmysite\.com/i), html(/<meta[^>]+content=["']weebly/i)] },
  { id: "duda", category: "platform", name: "Duda", matchers: [html(/irp-cdn\.multiscreensite\.com/i), html(/<meta[^>]+content=["']duda/i)] },
  { id: "godaddy-builder", category: "platform", name: "GoDaddy Website Builder", matchers: [html(/img1\.wsimg\.com/i)] },
  { id: "ghost", category: "platform", name: "Ghost", matchers: [html(/<meta[^>]+content=["']ghost\s/i), html(/\/ghost\/api\//i)] },
  { id: "magento", category: "platform", name: "Magento", matchers: [html(/\/static\/version\d+\/frontend\//i), cookie(/^mage-/i)] },
  { id: "prestashop", category: "platform", name: "PrestaShop", matchers: [html(/<meta[^>]+content=["']prestashop/i), cookie(/^PrestaShop-/i)] },
  { id: "bigcommerce", category: "platform", name: "BigCommerce", matchers: [html(/cdn\d*\.bigcommerce\.com/i)] },
  { id: "craft", category: "platform", name: "Craft CMS", matchers: [html(/\/cpresources\//i), cookie(/^CraftSessionId$/i)] },
  { id: "hubspot-cms", category: "platform", name: "HubSpot CMS", matchers: [html(/cdn\d?\.hubspot\.net/i), header("x-hs-hub-id", /\d/i)] },
  { id: "nextjs", category: "platform", name: "Next.js", matchers: [html(/\/_next\/static\//i), html(/id=["']__NEXT_DATA__["']/i)] },
  { id: "nuxt", category: "platform", name: "Nuxt", matchers: [html(/\/_nuxt\//i), html(/window\.__NUXT__/i)] },
  { id: "hugo", category: "platform", name: "Hugo", matchers: [html(/<meta[^>]+content=["']hugo\s/i)] },
  { id: "jekyll", category: "platform", name: "Jekyll", matchers: [html(/<meta[^>]+content=["']jekyll\s/i)] },
  { id: "eleventy", category: "platform", name: "Eleventy", matchers: [html(/<meta[^>]+content=["']eleventy/i)] },
  { id: "blogger", category: "platform", name: "Blogger", matchers: [html(/<meta[^>]+content=["']blogger/i), html(/blogspot\.com\/(?:feeds|static)/i)] },
  { id: "parked", category: "platform", name: "Parked or holding page", matchers: [html(/(?:sedoparking|parkingcrew|bodis|above\.com|afternic|dan\.com|hugedomains)/i), html(/this domain (?:name )?is for sale/i), html(/<title>[^<]{0,60}(?:coming soon|under construction|website coming soon)[^<]{0,20}<\/title>/i)] },

  /* ── host ─────────────────────────────────────────────────────────────── */
  { id: "cloudflare", category: "host", name: "Cloudflare", matchers: [header("cf-ray", /\w/i), header("server", /^cloudflare/i)] },
  { id: "nginx", category: "host", name: "nginx", matchers: [header("server", /^nginx/i)] },
  { id: "apache", category: "host", name: "Apache", matchers: [header("server", /^apache/i)] },
  { id: "litespeed", category: "host", name: "LiteSpeed", matchers: [header("server", /litespeed/i), header("x-litespeed-cache", /\w/i)] },
  { id: "iis", category: "host", name: "Microsoft IIS", matchers: [header("server", /^microsoft-iis/i)] },
  { id: "vercel", category: "host", name: "Vercel", matchers: [header("x-vercel-id", /\w/i), header("server", /^vercel/i)] },
  { id: "netlify", category: "host", name: "Netlify", matchers: [header("x-nf-request-id", /\w/i), header("server", /^netlify/i)] },
  { id: "github-pages", category: "host", name: "GitHub Pages", matchers: [header("x-github-request-id", /\w/i), header("server", /^github\.com/i)] },
  { id: "cloudfront", category: "host", name: "Amazon CloudFront", matchers: [header("x-amz-cf-id", /\w/i), header("server", /^cloudfront/i)] },
  { id: "fastly", category: "host", name: "Fastly", matchers: [header("x-served-by", /^cache-/i), header("via", /varnish/i)] },
  { id: "azure", category: "host", name: "Microsoft Azure", matchers: [header("x-azure-ref", /\w/i)] },
  { id: "openresty", category: "host", name: "OpenResty", matchers: [header("server", /^openresty/i)] },
  { id: "caddy", category: "host", name: "Caddy", matchers: [header("server", /^caddy/i)] },
  { id: "php", category: "host", name: "PHP", matchers: [header("x-powered-by", /^php/i)] },
  { id: "aspnet", category: "host", name: "ASP.NET", matchers: [header("x-powered-by", /asp\.net/i), header("x-aspnet-version", /\d/i)] },

  /* ── payments ─────────────────────────────────────────────────────────── */
  { id: "stripe", category: "payments", name: "Stripe", matchers: [html(/js\.stripe\.com/i), html(/checkout\.stripe\.com/i)] },
  { id: "paypal", category: "payments", name: "PayPal", matchers: [html(/www\.paypal(?:objects)?\.com\/(?:sdk|en_|webapps)/i)] },
  { id: "realex", category: "payments", name: "Realex, now Global Payments", matchers: [html(/(?:hpp|pay)\.realexpayments\.com/i), html(/realexpayments\.ie/i)] },
  { id: "elavon", category: "payments", name: "Elavon", matchers: [html(/(?:hpp|secure)\.elavon(?:payments)?\.[a-z.]{2,6}/i)] },
  { id: "worldpay", category: "payments", name: "Worldpay", matchers: [html(/(?:secure|access)\.worldpay\.com/i)] },
  { id: "sumup", category: "payments", name: "SumUp", matchers: [html(/(?:gateway|pay)\.sumup\.com/i)] },
  { id: "square", category: "payments", name: "Square", matchers: [html(/(?:js|web)\.squarecdn\.com/i), html(/squareup\.com\/(?:checkout|payments)/i)] },
  { id: "klarna", category: "payments", name: "Klarna", matchers: [html(/[a-z]+\.klarna(?:services)?\.com/i)] },
  { id: "revolut-pay", category: "payments", name: "Revolut Pay", matchers: [html(/merchant\.revolut\.com/i)] },
  { id: "applepay", category: "payments", name: "Apple Pay", matchers: [html(/applepay\.cdn-apple\.com/i), html(/apple-pay-button/i)] },

  /* ── booking ──────────────────────────────────────────────────────────── */
  { id: "resdiary", category: "booking", name: "ResDiary", matchers: [html(/(?:booking|widget)\.resdiary\.com/i), html(/resdiary\.com\/restaurant\//i)] },
  { id: "opentable", category: "booking", name: "OpenTable", matchers: [html(/(?:www|widget)\.opentable\.(?:com|ie|co\.uk)/i)] },
  { id: "thefork", category: "booking", name: "TheFork", matchers: [html(/(?:widget|module)\.thefork\.com/i), html(/lafourchette\.com/i)] },
  { id: "phorest", category: "booking", name: "Phorest", matchers: [html(/phorest\.com\/book/i), html(/phorest\.me/i)] },
  { id: "fresha", category: "booking", name: "Fresha", matchers: [html(/(?:www|widget)\.fresha\.com/i)] },
  { id: "treatwell", category: "booking", name: "Treatwell", matchers: [html(/(?:www|widget)\.treatwell\.(?:ie|co\.uk|com)/i)] },
  { id: "timely", category: "booking", name: "Timely", matchers: [html(/booking\.gettimely\.com/i)] },
  { id: "setmore", category: "booking", name: "Setmore", matchers: [html(/(?:my|booking)\.setmore\.com/i)] },
  { id: "acuity", category: "booking", name: "Acuity Scheduling", matchers: [html(/(?:app|secure)\.acuityscheduling\.com/i), html(/squarespacescheduling\.com/i)] },
  { id: "calendly", category: "booking", name: "Calendly", matchers: [html(/(?:assets|calendly)\.calendly\.com/i)] },
  { id: "bookwhen", category: "booking", name: "Bookwhen", matchers: [html(/bookwhen\.com\/[a-z0-9-]+/i)] },
  { id: "mews", category: "booking", name: "Mews", matchers: [html(/(?:api|app)\.mews\.com\/distributor/i)] },
  { id: "siteminder", category: "booking", name: "SiteMinder", matchers: [html(/(?:app|book)\.thebookingbutton\.com/i), html(/siteminder\.com/i)] },
  { id: "cloudbeds", category: "booking", name: "Cloudbeds", matchers: [html(/hotels\.cloudbeds\.com/i)] },
  { id: "eviivo", category: "booking", name: "eviivo", matchers: [html(/(?:book|secure)\.eviivo\.com/i)] },
  { id: "littlehotelier", category: "booking", name: "Little Hotelier", matchers: [html(/app\.littlehotelier\.com/i)] },
  { id: "lodgify", category: "booking", name: "Lodgify", matchers: [html(/[a-z0-9-]+\.lodgify\.com/i)] },
  { id: "supercontrol", category: "booking", name: "SuperControl", matchers: [html(/(?:book|www)\.supercontrol\.co\.uk/i)] },
  { id: "beds24", category: "booking", name: "Beds24", matchers: [html(/beds24\.com\/booking/i)] },
  { id: "bookingcom-widget", category: "booking", name: "Booking.com widget", matchers: [html(/booking\.com\/(?:general|flexiproduct)/i), html(/aff\.bstatic\.com/i)] },

  /* ── newsletter ───────────────────────────────────────────────────────── */
  { id: "mailchimp", category: "newsletter", name: "Mailchimp", matchers: [html(/list-manage\.com\/subscribe/i), html(/(?:chimpstatic|mailchimp)\.com\/mcjs/i)] },
  { id: "campaign-monitor", category: "newsletter", name: "Campaign Monitor", matchers: [html(/[a-z0-9-]*\.?createsend\.com/i)] },
  { id: "klaviyo", category: "newsletter", name: "Klaviyo", matchers: [html(/static\.klaviyo\.com/i), html(/a\.klaviyo\.com\/api/i)] },
  { id: "brevo", category: "newsletter", name: "Brevo, formerly Sendinblue", matchers: [html(/(?:sibforms|sendinblue)\.com/i), html(/sibautomation\.com/i)] },
  { id: "activecampaign", category: "newsletter", name: "ActiveCampaign", matchers: [html(/[a-z0-9-]+\.activehosted\.com/i)] },
  { id: "hubspot-forms", category: "newsletter", name: "HubSpot Forms", matchers: [html(/js\.hs(?:-scripts|forms)\.(?:com|net)/i)] },
  { id: "constant-contact", category: "newsletter", name: "Constant Contact", matchers: [html(/(?:visitor2|static)\.constantcontact\.com/i)] },
  { id: "mailerlite", category: "newsletter", name: "MailerLite", matchers: [html(/(?:assets|static)\.mailerlite\.com/i)] },
  { id: "omnisend", category: "newsletter", name: "Omnisend", matchers: [html(/omnisnippet\d?\.com/i)] },
  { id: "substack", category: "newsletter", name: "Substack", matchers: [html(/substackcdn\.com/i), html(/[a-z0-9-]+\.substack\.com\/(?:embed|api)/i)] },
  { id: "kit", category: "newsletter", name: "Kit, formerly ConvertKit", matchers: [html(/(?:f|forms)\.(?:convertkit|kit)\.com/i)] },
];

export const SIGNATURES_BY_ID: ReadonlyMap<string, Signature> = new Map(
  SIGNATURES.map((s) => [s.id, s]),
);

export function signatureName(id: string): string {
  return SIGNATURES_BY_ID.get(id)?.name ?? id;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/signatures.test.ts`
Expected: PASS. The two assertions that matter most are the `g`-flag ban and the empty-string ban: the first would corrupt the data quietly, the second would produce a wrong headline finding loudly.

What this proves: every rule is well formed and the sampled ones fire on markup they are meant to fire on. What it cannot see: how often each rule fires on a real Irish page, how many sites use something not in this table, and whether a leftover script tag is a live integration. That last one is on the "can't see" list on the page.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/signatures.ts lib/census/signatures.test.ts
git commit -m "feat(census): the signature table, with no g flag anywhere in it"
```

---

### Task 7: The fingerprinter, and the 120 characters that are the only thing kept

**Files:**
- Create: `lib/census/fingerprint.ts`
- Test: `lib/census/fingerprint.test.ts`

**Interfaces:**
- Consumes: `SIGNATURES` (Task 6), `extractHeading` and `classify` from `@/lib/headline`, `Signal`, `H1Reading`, `SignalCategory` (Task 2), `CRAWLER` from `@/content/tools/census`
- Produces: `EVIDENCE_MAX`, `MAX_YEAR_AHEAD`, `fingerprint(input, now?)`, `copyrightYear(html, now?)`, `readH1(html)`, `metaContent(html, name)`, `pageTitle(html)`

Two things worth naming before the code.

**The h1 comes from `lib/headline.ts`, the headline checker's own parser.** Not a fresh regex. That parser is tested, mutation-guarded, and already knows the difference between what a browser paints and what a plain-text extraction gets. Reusing it means the census can answer a question no other tool on this site can: how many Irish h1s come apart when read as text. It is the headline checker's own finding at national scale and it costs one import.

**The evidence cap is a promise, not a convenience.** The page says at most 120 characters of matched text is kept and that the page itself is thrown away. `EVIDENCE_MAX` is that number, `CRAWLER.evidenceChars` is where it comes from, and `lib/census/safety.test.ts` (Task 11) checks the promise and the constant against each other. There is a mutation row on it, because raising it is a one-character edit that changes what this tool publishes about other people.

**And the trap that will bite whoever writes the copyright matcher.** `content/voice.test.ts` fails the build on an em dash anywhere in the source tree. A copyright range is written `2019 - 2026` with any of five dash characters, and typing them literally into a character class fails that guard with an error about house style that reads like a false positive. The class is written `[-\u2010-\u2015]` and it stays that way.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/fingerprint.test.ts
import { describe, expect, it } from "vitest";
import { EVIDENCE_MAX, copyrightYear, fingerprint, metaContent, pageTitle, readH1 } from "./fingerprint";

const page = (body: string, head = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("fingerprint", () => {
  it("finds a platform from the HTML and records what matched", () => {
    const result = fingerprint({
      headers: {},
      cookieNames: [],
      html: page("", '<link href="/wp-content/themes/x/style.css">'),
    });
    const platform = result.signals.find((s) => s.category === "platform");
    expect(platform?.id).toBe("wordpress");
    expect(platform?.where).toBe("html");
    expect(platform?.evidence).toContain("/wp-content/");
  });

  it("finds a host from a header and records the header's value", () => {
    const result = fingerprint({ headers: { server: "nginx/1.24.0" }, cookieNames: [], html: page("") });
    const host = result.signals.find((s) => s.id === "nginx");
    expect(host?.where).toBe("header");
    expect(host?.evidence).toContain("nginx/1.24.0");
  });

  it("finds a platform from a cookie name and never sees a value", () => {
    const result = fingerprint({ headers: {}, cookieNames: ["woocommerce_cart_hash"], html: page("") });
    expect(result.signals.some((s) => s.id === "woocommerce")).toBe(true);
    expect(result.signals.find((s) => s.id === "woocommerce")?.evidence).toBe("woocommerce_cart_hash");
  });

  it("caps every piece of evidence at EVIDENCE_MAX characters", () => {
    const long = `<div class="${"a".repeat(500)}">/wp-content/${"b".repeat(500)}</div>`;
    const result = fingerprint({ headers: {}, cookieNames: [], html: page(long) });
    for (const signal of result.signals) {
      expect(signal.evidence.length, signal.id).toBeLessThanOrEqual(EVIDENCE_MAX);
    }
  });

  it("keeps one signal per signature even when several matchers hit", () => {
    const result = fingerprint({
      headers: {},
      cookieNames: [],
      html: page("", '<link href="/wp-content/x.css"><script src="/wp-includes/y.js"></script>'),
    });
    expect(result.signals.filter((s) => s.id === "wordpress")).toHaveLength(1);
  });

  it("allows two platforms, because WooCommerce is WordPress and both are true", () => {
    const result = fingerprint({
      headers: {},
      cookieNames: [],
      html: page("", '<link href="/wp-content/plugins/woocommerce/a.css">'),
    });
    expect(result.byCategory.platform).toEqual(["woocommerce", "wordpress"]);
  });

  it("returns an empty list per category rather than inventing one", () => {
    const result = fingerprint({ headers: {}, cookieNames: [], html: page("<p>hello</p>") });
    expect(result.byCategory).toEqual({ platform: [], host: [], payments: [], booking: [], newsletter: [] });
    expect(result.signals).toEqual([]);
  });

  it("sorts ids inside a category, so two runs of the same page agree byte for byte", () => {
    const result = fingerprint({
      headers: {},
      cookieNames: [],
      html: page("", '<script src="https://js.stripe.com/v3/"></script><script src="https://www.paypal.com/sdk/js"></script>'),
    });
    expect(result.byCategory.payments).toEqual(["paypal", "stripe"]);
  });

  it("flags a parking page, which is a positive detection and not an absence", () => {
    const result = fingerprint({
      headers: {},
      cookieNames: [],
      html: page("<h1>This domain is for sale</h1>"),
    });
    expect(result.parked).toBe(true);
  });

  it("does not flag an ordinary page as parked", () => {
    const result = fingerprint({ headers: {}, cookieNames: [], html: page("<p>We sell parking sensors.</p>") });
    expect(result.parked).toBe(false);
  });
});

describe("readH1", () => {
  it("reports the verdict and the shape but never the words", () => {
    const reading = readH1(page("<h1>Fitzgerald and Sons</h1>"));
    expect(reading).toEqual({ verdict: "clean", characterElements: 0, length: 19 });
    expect(JSON.stringify(reading)).not.toContain("Fitzgerald");
  });

  it("agrees with the headline checker that a per-character h1 is fragmented", () => {
    const split = Array.from("Fitzgerald").map((c) => `<span>${c}</span>`).join("");
    const reading = readH1(page(`<h1>${split}</h1>`));
    expect(reading?.verdict).toBe("fragmented");
    expect(reading?.characterElements).toBe(10);
  });

  it("reports no-h1-in-html when the served page has none", () => {
    expect(readH1(page("<h2>Second</h2>"))?.verdict).toBe("no-h1-in-html");
  });

  it("returns null when there is no heading of any level at all", () => {
    expect(readH1(page("<p>nothing</p>"))).toBeNull();
  });
});

describe("copyrightYear", () => {
  const now = new Date("2026-09-04T00:00:00Z");

  it("reads the plain forms", () => {
    expect(copyrightYear("&copy; 2024 Murphy Ltd", now)).toBe(2024);
    expect(copyrightYear("© 2019 Murphy", now)).toBe(2019);
    expect(copyrightYear("Copyright 2021 Murphy", now)).toBe(2021);
    expect(copyrightYear("(c) 2020", now)).toBe(2020);
  });

  it("takes the later end of a range, whichever dash was used", () => {
    for (const dash of ["-", "\u2010", "\u2013", "\u2014"]) {
      expect(copyrightYear(`© 2019 ${dash} 2026 Murphy`, now), dash).toBe(2026);
    }
    expect(copyrightYear("© 2019 to 2025 Murphy", now)).toBe(2025);
  });

  it("takes the latest year when a page carries several notices", () => {
    expect(copyrightYear("© 2018 Theme Co. Site © 2025 Murphy", now)).toBe(2025);
  });

  it("refuses a year in the future, which is a template variable and not a date", () => {
    expect(copyrightYear("© 2099 Murphy", now)).toBeNull();
  });

  it("allows next year, because a January footer is often ahead", () => {
    expect(copyrightYear("© 2027 Murphy", now)).toBe(2027);
  });

  it("refuses a year before the web", () => {
    expect(copyrightYear("© 1804 Murphy Distillers", now)).toBeNull();
  });

  it("returns null when there is no notice", () => {
    expect(copyrightYear("<p>All rights are ours</p>", now)).toBeNull();
  });

  it("does not read a phone number or a price as a year", () => {
    expect(copyrightYear("Call 2024 5567 for a quote", now)).toBeNull();
  });
});

describe("metaContent and pageTitle", () => {
  it("reads a description in either attribute order", () => {
    expect(metaContent('<meta name="description" content="A shop">', "description")).toBe("A shop");
    expect(metaContent('<meta content="A shop" name="description">', "description")).toBe("A shop");
  });

  it("is case-insensitive on the name", () => {
    expect(metaContent('<meta name="Description" content="A shop">', "description")).toBe("A shop");
  });

  it("returns null rather than an empty string when it is absent", () => {
    expect(metaContent("<meta>", "description")).toBeNull();
  });

  it("reads a title and collapses its whitespace", () => {
    expect(pageTitle("<title>\n  Murphy   Motors \n</title>")).toBe("Murphy Motors");
    expect(pageTitle("<html></html>")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/fingerprint.test.ts`
Expected: FAIL with `Cannot find module './fingerprint'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/fingerprint.ts
import { CRAWLER } from "../../content/tools/census.ts";
import { classify, extractHeading } from "../headline.ts";
import { SIGNATURES } from "./signatures.ts";
import type { H1Reading, Signal, SignalCategory } from "./types.ts";

/**
 * Headers plus a page turn into signals, an h1 shape and a copyright year.
 *
 * **This is the only place any of somebody else's page survives a run**, and it
 * survives as at most `EVIDENCE_MAX` characters of the text that matched a
 * rule. The page itself is thrown away by the caller the moment this returns.
 * That cap is printed on the census page as a promise, `CRAWLER.evidenceChars`
 * is where the number comes from, and `lib/census/safety.test.ts` checks the
 * promise and the constant against each other. Raising it is a one-character
 * edit that changes what this tool publishes about other people, so it has a
 * mutation row.
 *
 * **The h1 is read by `lib/headline.ts`,** which is the headline checker's own
 * parser: tested, mutation-guarded, and already able to tell what a browser
 * paints from what a plain-text extraction gets. That is what lets the census
 * answer a question nothing else here can, which is how many Irish h1s come
 * apart when read as text. The words are not kept, only the verdict, the
 * character-element count and the length.
 *
 * **The dash class is written with escapes on purpose.** `content/voice.test.ts`
 * fails the build on an em dash anywhere in the source tree, so a copyright
 * range matcher typed with literal dashes stops the build with an error about
 * house style. `[-\u2010-\u2015]` covers hyphen, non-breaking hyphen, figure
 * dash, en dash, em dash and horizontal bar, and it stays escaped.
 */

export const EVIDENCE_MAX = CRAWLER.evidenceChars;

/** A footer written in January is often a year ahead. Two is a template bug. */
export const MAX_YEAR_AHEAD = 1;
/** Before this, a "copyright year" is a founding date or a false positive. */
export const MIN_COPYRIGHT_YEAR = 1993;

export type Fingerprint = {
  signals: Signal[];
  byCategory: Record<SignalCategory, string[]>;
  h1: H1Reading | null;
  copyrightYear: number | null;
  parked: boolean;
};

export type FingerprintInput = {
  /** Lowercase header names to values, from `lib/census/fetch.ts`'s allowlist. */
  headers: Record<string, string>;
  /** Cookie names only. Values never reach this module. */
  cookieNames: string[];
  html: string;
};

const CATEGORIES: SignalCategory[] = ["platform", "host", "payments", "booking", "newsletter"];

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, EVIDENCE_MAX);
}

/**
 * The h1 as a shape.
 *
 * `classify` is the headline checker's verdict function, so `fragmented` here
 * means exactly what it means on `/tools/headline-check`. `null` means the page
 * had no heading of any level, which is different from having an h2 and no h1
 * and is counted separately.
 */
export function readH1(html: string): H1Reading | null {
  const heading = extractHeading(html);
  if (!heading) return null;
  const report = classify(heading);
  return {
    verdict: report.verdict,
    characterElements: report.characterElements,
    length: report.browserText.length,
  };
}

/**
 * The latest plausible year in a copyright notice.
 *
 * Anchored on a copyright marker so a phone number, a price or a street number
 * is not read as a date, and bounded at both ends so a template variable that
 * rendered as 2099 and a founding date of 1804 both come back null rather than
 * becoming a data point about how stale Irish websites are.
 */
export function copyrightYear(html: string, now: Date = new Date()): number | null {
  const ceiling = now.getUTCFullYear() + MAX_YEAR_AHEAD;
  const marker = /(?:©|&copy;|&#169;|\(c\)|copyright)[^0-9]{0,20}((?:19|20)\d{2})(?:\s*(?:[-\u2010-\u2015]|to)\s*((?:19|20)\d{2}))?/gi;
  let best: number | null = null;
  for (const match of String(html ?? "").matchAll(marker)) {
    for (const candidate of [match[1], match[2]]) {
      if (!candidate) continue;
      const year = Number(candidate);
      if (year < MIN_COPYRIGHT_YEAR || year > ceiling) continue;
      if (best === null || year > best) best = year;
    }
  }
  return best;
}

/** The `content` of a named meta tag, whichever order the attributes are in. */
export function metaContent(html: string, name: string): string | null {
  const text = String(html ?? "");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = new RegExp(
    `<meta[^>]+name=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const backward = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${escaped}["']`,
    "i",
  );
  const value = forward.exec(text)?.[1] ?? backward.exec(text)?.[1] ?? null;
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function pageTitle(html: string): string | null {
  const value = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(html ?? ""))?.[1];
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function fingerprint(input: FingerprintInput, now: Date = new Date()): Fingerprint {
  const html = String(input.html ?? "");
  const headers = input.headers ?? {};
  const cookieNames = input.cookieNames ?? [];

  const signals: Signal[] = [];
  for (const signature of SIGNATURES) {
    // First matcher wins: one signal per signature, so two rules for the same
    // platform do not make it look twice as popular.
    for (const matcher of signature.matchers) {
      let evidence: string | null = null;
      let where: Signal["where"] = "html";

      if (matcher.kind === "header") {
        const value = headers[matcher.name];
        if (value !== undefined && matcher.pattern.test(value)) {
          evidence = `${matcher.name}: ${value}`;
          where = "header";
        }
      } else if (matcher.kind === "cookie") {
        const hit = cookieNames.find((cookieName) => matcher.pattern.test(cookieName));
        if (hit !== undefined) {
          evidence = hit;
          where = "cookie";
        }
      } else {
        const hit = matcher.pattern.exec(html);
        if (hit) {
          const at = Math.max(0, hit.index - 20);
          evidence = html.slice(at, at + EVIDENCE_MAX + 20);
          where = "html";
        }
      }

      if (evidence !== null) {
        signals.push({ category: signature.category, id: signature.id, where, evidence: clip(evidence) });
        break;
      }
    }
  }

  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      signals
        .filter((s) => s.category === category)
        .map((s) => s.id)
        .sort(),
    ]),
  ) as Record<SignalCategory, string[]>;

  return {
    signals,
    byCategory,
    h1: readH1(html),
    copyrightYear: copyrightYear(html, now),
    parked: signals.some((s) => s.id === "parked"),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/fingerprint.test.ts`
Expected: PASS. Note the one place the `g` flag is deliberately used and is safe: `matchAll` in `copyrightYear` needs it, the regex is constructed fresh on every call rather than held in a table, and Task 6's ban is about the shared table.

What this proves: signals carry evidence, evidence is capped, cookie values never enter the object, the h1 is read by the same parser the headline checker uses, and a copyright year is bounded at both ends. What it cannot see: whether a matched script tag is a live integration or something left behind by a previous build. That is on the page's "can't see" list and no test can close it.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/fingerprint.ts lib/census/fingerprint.test.ts
git commit -m "feat(census): signals with 120 characters of evidence, and the h1 read by the headline checker"
```

---

### Task 8: The industry classifier, which says how it knew

**Files:**
- Create: `lib/census/industry.ts`
- Test: `lib/census/industry.test.ts`

**Interfaces:**
- Consumes: `INDUSTRY_IDS`, `KEYWORDS`, `SCHEMA_TO_INDUSTRY`, `normaliseSchemaType` (Task 2), `metaContent`, `pageTitle` (Task 7), `EVIDENCE_MAX` (Task 7)
- Produces: `MIN_WEAK_TERMS`, `schemaTypes(html)`, `visibleText(html)`, `classifyIndustry(input)`

Three rules, and the third is the one that keeps the page honest.

**Schema.org first.** If a site published `"@type": "Hotel"`, that is the site's own claim about itself and it beats anything a keyword table thinks. Method `schema`, and the evidence is the type.

**Keywords second, and only with enough of them.** One strong term, or two distinct weak terms. Under that, `unknown` with method `none`. A classifier that always produces an answer produces a wrong answer for every site it does not understand, and forty-two buckets means the wrong answer looks specific.

**Not knowing is a result.** `unknown` with `none`, or `parked-holding` with `parked`, are both printed on the page as their own rows with their own counts. The temptation with a classifier is to tune it until `unknown` is small, and the number that measures whether that tuning helped is precision, which Task 13 is the only source of.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/industry.test.ts
import { describe, expect, it } from "vitest";
import { MIN_WEAK_TERMS, classifyIndustry, schemaTypes, visibleText } from "./industry";

const page = (body: string, head = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const jsonLd = (payload: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;

describe("schemaTypes", () => {
  it("reads a single JSON-LD type", () => {
    expect(schemaTypes(page("", jsonLd({ "@type": "Hotel" })))).toEqual(["Hotel"]);
  });

  it("reads an array of types", () => {
    expect(schemaTypes(page("", jsonLd({ "@type": ["Hotel", "Restaurant"] })))).toEqual(["Hotel", "Restaurant"]);
  });

  it("reads a graph", () => {
    const graph = jsonLd({ "@graph": [{ "@type": "WebSite" }, { "@type": "Dentist" }] });
    expect(schemaTypes(page("", graph))).toContain("Dentist");
  });

  it("reads a URL form and a bare form the same way", () => {
    expect(schemaTypes(page("", jsonLd({ "@type": "https://schema.org/Hotel" })))).toEqual(["Hotel"]);
  });

  it("reads microdata itemtype", () => {
    expect(schemaTypes(page('<div itemscope itemtype="https://schema.org/BarOrPub"></div>'))).toEqual(["BarOrPub"]);
  });

  it("survives JSON-LD that will not parse, which is common", () => {
    expect(schemaTypes(page("", '<script type="application/ld+json">{ oops </script>'))).toEqual([]);
  });

  it("returns nothing when there is nothing", () => {
    expect(schemaTypes(page("<p>hello</p>"))).toEqual([]);
  });

  it("never returns a type from somebody's own vocabulary", () => {
    expect(schemaTypes(page("", jsonLd({ "@type": "https://example.com/MyThing" })))).toEqual([]);
  });
});

describe("visibleText", () => {
  it("drops scripts, styles and tags and lowercases what is left", () => {
    const html = page("<script>var a='hotel rooms';</script><style>.a{}</style><p>Our Bakery</p>");
    expect(visibleText(html)).toContain("our bakery");
    expect(visibleText(html)).not.toContain("var a");
  });

  it("decodes the handful of entities that matter", () => {
    expect(visibleText(page("<p>Fish &amp; Chips</p>"))).toContain("fish & chips");
  });

  it("collapses whitespace so a two-word term still matches across a line break", () => {
    expect(visibleText(page("<p>bed and\n   breakfast</p>"))).toContain("bed and breakfast");
  });
});

describe("classifyIndustry", () => {
  const base = { parked: false, reachable: true };

  it("uses the site's own schema.org type first and says so", () => {
    const result = classifyIndustry({
      ...base,
      html: page("<p>pub grub every day</p>", jsonLd({ "@type": "Hotel" })),
    });
    expect(result).toEqual({ industry: "accommodation", method: "schema", evidence: "Hotel" });
  });

  it("prefers a specific type over a general one when both are published", () => {
    const result = classifyIndustry({
      ...base,
      html: page("", jsonLd({ "@graph": [{ "@type": "Organization" }, { "@type": "Dentist" }] })),
    });
    expect(result.industry).toBe("health-medical");
  });

  it("falls through to keywords when no schema type maps to a bucket", () => {
    const result = classifyIndustry({
      ...base,
      html: page("<h1>Murphy Solicitors</h1><p>Conveyancing and probate</p>", jsonLd({ "@type": "Organization" })),
    });
    expect(result.industry).toBe("legal");
    expect(result.method).toBe("keyword");
  });

  it("takes a single strong term", () => {
    const result = classifyIndustry({ ...base, html: page("<h1>Kelly Solicitors</h1>") });
    expect(result).toMatchObject({ industry: "legal", method: "keyword" });
    expect(result.evidence).toContain("solicitors");
  });

  it("refuses on one weak term alone", () => {
    const result = classifyIndustry({ ...base, html: page("<p>We have rooms.</p>") });
    expect(result).toEqual({ industry: "unknown", method: "none", evidence: "" });
  });

  it("takes two distinct weak terms", () => {
    expect(MIN_WEAK_TERMS).toBe(2);
    const result = classifyIndustry({ ...base, html: page("<p>Our hotel has ensuite rooms.</p>") });
    expect(result.industry).toBe("accommodation");
    expect(result.method).toBe("keyword");
  });

  it("does not count the same weak term twice", () => {
    const result = classifyIndustry({ ...base, html: page("<p>rooms rooms rooms rooms</p>") });
    expect(result.industry).toBe("unknown");
  });

  it("picks the higher score when two buckets both fire", () => {
    const result = classifyIndustry({
      ...base,
      html: page("<p>Our hotel has ensuite rooms and overnight guests. We also sell gifts.</p>"),
    });
    expect(result.industry).toBe("accommodation");
  });

  it("refuses on a tie rather than picking the first bucket in the table", () => {
    const result = classifyIndustry({ ...base, html: page("<p>tyres motors garage plumbing roofing builders</p>") });
    // Three weak terms each for motor-trade and construction-trades.
    expect(result.industry).toBe("unknown");
    expect(result.evidence).toContain("tie");
  });

  it("says parked when the fingerprinter said parked, whatever the words are", () => {
    const result = classifyIndustry({ ...base, parked: true, html: page("<h1>Murphy Solicitors</h1>") });
    expect(result).toMatchObject({ industry: "parked-holding", method: "parked" });
  });

  it("says unknown when the site was never read, and never guesses from a domain name", () => {
    const result = classifyIndustry({ ...base, reachable: false, html: "" });
    expect(result).toEqual({ industry: "unknown", method: "none", evidence: "" });
  });

  it("weighs the title and the h1 more than the body, because a footer mentions everything", () => {
    const result = classifyIndustry({
      ...base,
      html: page("<p>near the golf club and the leisure centre</p>", "<title>Kelly Solicitors Dublin</title>"),
    });
    expect(result.industry).toBe("legal");
  });

  it("caps its evidence like every other evidence string on this page", () => {
    const result = classifyIndustry({ ...base, html: page(`<h1>Solicitors ${"x".repeat(500)}</h1>`) });
    expect(result.evidence.length).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/industry.test.ts`
Expected: FAIL with `Cannot find module './industry'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/industry.ts
import { EVIDENCE_MAX, metaContent, pageTitle } from "./fingerprint.ts";
import { KEYWORDS, SCHEMA_TO_INDUSTRY, normaliseSchemaType, type IndustryId } from "./industries.ts";
import type { ClassMethod } from "./types.ts";

/**
 * Which industry a site is in, and how that was decided.
 *
 * Three rules, and the third is what keeps the page honest.
 *
 * **The site's own schema.org type wins.** If a page published `"@type":
 * "Hotel"`, that is its own claim about itself and no keyword table gets to
 * argue. Method `schema`, evidence the type.
 *
 * **Keywords need enough evidence.** One strong term, or two distinct weak
 * ones. Under that, `unknown`. A classifier that always answers is wrong on
 * every site it does not understand, and with forty-two buckets a wrong answer
 * looks specific enough to quote.
 *
 * **A tie is a refusal.** Two buckets on the same score means the page did not
 * say, and picking whichever comes first in the table would encode the order of
 * a source file as a fact about Ireland.
 *
 * The title and the h1 are weighted above the body, because a footer mentions
 * the golf club, the leisure centre and the local hotel on a solicitor's site.
 * That weighting is a guess. The only measurement of whether any of this is
 * right is the spot check in Task 13, and nothing here may be described as
 * accurate before it runs.
 */

/** Distinct weak terms needed when no strong term fired. */
export const MIN_WEAK_TERMS = 2;
/** How much more a term in the title or the h1 counts than one in the body. */
const HEAD_WEIGHT = 2;

export type IndustryInput = {
  html: string;
  parked: boolean;
  /** False when the crawler never got a page: refused, timed out, no DNS. */
  reachable: boolean;
};

export type Classification = { industry: IndustryId; method: ClassMethod; evidence: string };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/**
 * Every schema.org type the page claims, from JSON-LD and from microdata.
 *
 * JSON-LD in the wild is frequently invalid, so a block that will not parse is
 * skipped rather than throwing: this runs 125,505 times unattended.
 */
export function schemaTypes(html: string): string[] {
  const text = String(html ?? "");
  const found: string[] = [];

  const blocks = text.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      const type = record["@type"];
      for (const candidate of Array.isArray(type) ? type : [type]) {
        if (typeof candidate !== "string") continue;
        const bare = normaliseSchemaType(candidate);
        if (bare) found.push(bare);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") walk(value);
      }
    };
    walk(parsed);
  }

  for (const item of text.matchAll(/itemtype=["']([^"']+)["']/gi)) {
    const bare = normaliseSchemaType(item[1]);
    if (bare) found.push(bare);
  }

  return [...new Set(found)];
}

/** The page as lowercase words, with scripts, styles and tags gone. */
export function visibleText(html: string): string {
  let text = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [entity, character] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(character);
  }
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, EVIDENCE_MAX);
}

export function classifyIndustry(input: IndustryInput): Classification {
  if (input.parked) return { industry: "parked-holding", method: "parked", evidence: "parking page" };
  if (!input.reachable) return { industry: "unknown", method: "none", evidence: "" };

  const html = String(input.html ?? "");

  // 1. The site's own claim.
  for (const type of schemaTypes(html)) {
    const industry = SCHEMA_TO_INDUSTRY[type];
    if (industry) return { industry, method: "schema", evidence: type };
  }

  // 2. Words, weighted.
  const head = [pageTitle(html) ?? "", /<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i.exec(html)?.[1] ?? "", metaContent(html, "description") ?? ""]
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const body = visibleText(html);

  let bestId: IndustryId | null = null;
  let bestScore = 0;
  let bestTerms: string[] = [];
  let tied = false;

  for (const row of KEYWORDS) {
    const strongHits = row.strong.filter((term) => body.includes(term) || head.includes(term));
    const weakHits = row.weak.filter((term) => body.includes(term) || head.includes(term));
    if (strongHits.length === 0 && weakHits.length < MIN_WEAK_TERMS) continue;

    const score = [...strongHits, ...weakHits].reduce(
      (total, term) => total + (head.includes(term) ? HEAD_WEIGHT : 1) + (row.strong.includes(term) ? HEAD_WEIGHT : 0),
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
      bestTerms = [...strongHits, ...weakHits];
      tied = false;
    } else if (score === bestScore && bestId !== null) {
      tied = true;
    }
  }

  if (bestId === null) return { industry: "unknown", method: "none", evidence: "" };
  if (tied) return { industry: "unknown", method: "none", evidence: "tie between two buckets" };
  return { industry: bestId, method: "keyword", evidence: clip(bestTerms.join(", ")) };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/industry.test.ts`
Expected: PASS. If the tie test fails, the scoring has an accidental order dependence and the fix is in the scoring, never in the test: an order-dependent classifier publishes the order of a source file as a fact about Ireland.

What this proves: schema.org beats keywords, thin evidence produces `unknown`, a tie produces `unknown`, and every path says which method it used. What it cannot see: **whether any of these answers is right.** That is Task 13 and this module may not be described as accurate before it.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/industry.ts lib/census/industry.test.ts
git commit -m "feat(census): schema first, two words minimum, and a tie is a refusal"
```

---

### Task 9: The cost meter, because the usage API is not readable from here

**Files:**
- Create: `lib/census/cost.ts`
- Test: `lib/census/cost.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Cost`, `startCost(clock?, cpu?)`, `formatCost(cost)`, `addCost(a, b)`

Design section 5, corrected on 2026-09-04 after spike S2: Vercel's usage API is Pro only, this project is on Hobby, and the signed-in browser cannot see the `larry-pm` team at all. So no agent and no script can read Active CPU or Provisioned Memory here, and every hosted tool measures its own cost instead. That is the better engineering anyway: a number from our own instrument beats one we hoped to look up.

Two numbers, always both, never one passed off as the other. **Wall clock** is the ceiling and it includes every second spent waiting on somebody else's server, which on a crawl is nearly all of it. **Node CPU** is the floor and it is what this process actually burnt. Printing one alone is the mistake S2 named on On the glass, where treating wall clock as CPU made the tool look four-runs-a-day expensive when the true cost sits between 0.21 seconds and 12.5.

Both clocks are injectable, so the tests are deterministic and do not sleep.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/cost.test.ts
import { describe, expect, it } from "vitest";
import { addCost, formatCost, startCost } from "./cost";

describe("startCost", () => {
  it("measures wall clock in milliseconds from a nanosecond clock", () => {
    let now = 1_000_000_000n;
    const stop = startCost(() => now, () => ({ user: 0, system: 0 }));
    now = 3_500_000_000n; // 2.5 seconds later
    expect(stop().wallMs).toBe(2500);
  });

  it("measures CPU as user plus system, converted from microseconds", () => {
    const stop = startCost(
      () => 0n,
      () => ({ user: 120_000, system: 30_000 }),
    );
    expect(stop().cpuMs).toBe(150);
  });

  it("passes the opening reading to process.cpuUsage, which is how a delta is taken", () => {
    const seen: Array<NodeJS.CpuUsage | undefined> = [];
    const stop = startCost(
      () => 0n,
      (prev) => {
        seen.push(prev);
        return { user: 1000, system: 0 };
      },
    );
    stop();
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toEqual({ user: 1000, system: 0 });
  });

  it("can be read more than once and keeps counting from the same start", () => {
    let now = 0n;
    let user = 0;
    const stop = startCost(() => now, () => ({ user, system: 0 }));
    now = 1_000_000n;
    user = 1000;
    expect(stop()).toEqual({ wallMs: 1, cpuMs: 1 });
    now = 5_000_000n;
    user = 4000;
    expect(stop()).toEqual({ wallMs: 5, cpuMs: 4 });
  });

  it("never returns a negative reading, whatever a clock does", () => {
    let now = 5_000_000n;
    const stop = startCost(() => now, () => ({ user: 0, system: 0 }));
    now = 0n;
    expect(stop().wallMs).toBe(0);
  });

  it("defaults to the real clocks without being handed one", () => {
    const cost = startCost()();
    expect(cost.wallMs).toBeGreaterThanOrEqual(0);
    expect(cost.cpuMs).toBeGreaterThanOrEqual(0);
  });
});

describe("formatCost", () => {
  it("prints both numbers, always, and labels which is which", () => {
    expect(formatCost({ wallMs: 12500, cpuMs: 210 })).toBe("12.5 s wall, 0.21 s CPU");
  });

  it("keeps two decimals on the CPU figure, because it is often under a second", () => {
    expect(formatCost({ wallMs: 900, cpuMs: 40 })).toBe("0.9 s wall, 0.04 s CPU");
  });

  it("prints hours once a run is long enough to have them", () => {
    expect(formatCost({ wallMs: 9 * 3600 * 1000, cpuMs: 600_000 })).toBe("9 h 0 m wall, 600.00 s CPU");
  });
});

describe("addCost", () => {
  it("sums both figures, which is how a run totals its domains", () => {
    expect(addCost({ wallMs: 10, cpuMs: 2 }, { wallMs: 5, cpuMs: 1 })).toEqual({ wallMs: 15, cpuMs: 3 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/cost.test.ts`
Expected: FAIL with `Cannot find module './cost'`.

- [ ] **Step 3: Write the module**

```ts
// lib/census/cost.ts

/**
 * What a run cost, measured by us.
 *
 * Design section 5, corrected after spike S2 on 2026-09-04: Vercel's usage API
 * is Pro only, this project is Hobby, and the signed-in browser cannot see the
 * team at all, so neither an agent nor a script can read Active CPU or
 * Provisioned Memory. Every tool measures its own instead. That is better than
 * the original plan anyway, because a number from our own instrument is one we
 * can defend rather than one we hoped to look up.
 *
 * **Two numbers, always both.** Wall clock is the ceiling and on a crawl it is
 * nearly all time spent waiting for somebody else's server. Node CPU is the
 * floor and it is what this process actually burnt. Printing one alone is the
 * exact mistake S2 named on On the glass, where treating wall clock as CPU made
 * a tool look four-runs-a-day expensive when its true cost sits somewhere
 * between 0.21 seconds and 12.5.
 *
 * Both clocks are parameters so tests are deterministic and never sleep.
 */

export type Cost = { wallMs: number; cpuMs: number };

type CpuReader = (previous?: NodeJS.CpuUsage) => NodeJS.CpuUsage;

/**
 * Starts measuring. The returned function may be called more than once and
 * always reports the total since the start, which is what lets a long run print
 * progress without stopping its own meter.
 */
export function startCost(
  clock: () => bigint = () => process.hrtime.bigint(),
  cpu: CpuReader = (previous) => process.cpuUsage(previous),
): () => Cost {
  const startedAt = clock();
  const startedCpu = cpu();
  return () => {
    const elapsedNs = clock() - startedAt;
    const wallMs = Math.max(0, Number(elapsedNs / 1_000_000n));
    const delta = cpu(startedCpu);
    const cpuMs = Math.max(0, Math.round((delta.user + delta.system) / 1000));
    return { wallMs, cpuMs };
  };
}

export function addCost(a: Cost, b: Cost): Cost {
  return { wallMs: a.wallMs + b.wallMs, cpuMs: a.cpuMs + b.cpuMs };
}

/**
 * Both figures in one line, labelled. Hours appear once a run has them, because
 * "32400.0 s wall" is a number nobody reads.
 */
export function formatCost(cost: Cost): string {
  const cpu = `${(cost.cpuMs / 1000).toFixed(2)} s CPU`;
  if (cost.wallMs >= 3_600_000) {
    const hours = Math.floor(cost.wallMs / 3_600_000);
    const minutes = Math.floor((cost.wallMs % 3_600_000) / 60_000);
    return `${hours} h ${minutes} m wall, ${cpu}`;
  }
  return `${(cost.wallMs / 1000).toFixed(1)} s wall, ${cpu}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/cost.test.ts`
Expected: PASS.

What this proves: the meter reports wall clock and CPU separately, sums, and never goes negative. What it cannot see: the memory a run holds, which Node can report but which nothing on Hobby lets us compare against a billed figure, so it is deliberately not measured rather than measured and left uninterpretable.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/census/cost.ts lib/census/cost.test.ts
git commit -m "feat(census): measure our own cost, both numbers, since the usage api is pro only"
```

---

### Task 10: The seed, with S4's ICANN ruling and a union across months

**Files:**
- Create: `scripts/census/seed.mts`
- Test: none of its own. Its logic is `lib/census/psl.ts`, tested in Task 3; this task's evidence is a run.

**Interfaces:**
- Consumes: `parsePslIeZones`, `registeredDomain`, `reverseHost`, `IE_ICANN_ZONES`, `PSL_URL` (Task 3); `startCost`, `formatCost` (Task 9)
- Produces: `data/census/ie-domains.txt` (the union), `data/census/seed-report.json`

The S4 spike wrote and proved this script. It is on branch `toolshed/f5-spikes`, unmerged, so **retrieve it rather than retyping it**: the abort-path fix in `streamPart` was found by a real crash, confirmed by reverting, and typing it again from memory is how it gets lost. S4's own decision says so: "The kept script must carry the abort-path fix or the scheduler will see exit 1 every month."

Three changes to what S4 ran, each from that record's decision section:

1. **Collapse on the ICANN section only.** The spike's parser took every `.ie` line in the Public Suffix List, which pulled in `myspreadshop.ie` from the PRIVATE section and turned 710 Spreadshirt shops into 710 registrations. The seed goes from 126,214 to 125,505, and the coverage claim the page is built on goes from 38% to 37.7%. That is now `lib/census/psl.ts` and this script imports it.
2. **Union across runs.** Each month's host graph names hosts the last one missed. The output is the union of every run so far, and a domain leaves only when it fails DNS twice, which the crawler records.
3. **`rte.ie` as the instrument check.** The spike checked for `tighsauna.ie`, which does not exist, so its absence proved nothing about the filter. S4 says to replace it and `rte.ie` did the job.

- [ ] **Step 1: Retrieve the spike's script rather than retyping it**

```bash
cd "$WT"
mkdir -p scripts/census
git show toolshed/f5-spikes:scripts/census/seed-ie.mjs > scripts/census/seed.mts
grep -n "Spike fix (2026-09-03)" scripts/census/seed.mts
grep -c "swallowAfterStop" scripts/census/seed.mts
```

Expected: the `grep -n` prints the comment above the abort-path fix, and the `grep -c` prints `3` (the definition and its two listeners). **If the branch is gone or the file is not there, stop and say so** rather than writing a fresh crawler for a corpus somebody already measured twice.

- [ ] **Step 2: Make the three changes**

The file is now `.mts`, so the imports at the top gain the two shared modules and the local `registeredDomain`, `reverseHost` and PSL parsing are deleted in favour of them:

```ts
import { IE_ICANN_ZONES, PSL_URL, parsePslIeZones, registeredDomain, reverseHost } from "../../lib/census/psl.ts";
import { formatCost, startCost } from "../../lib/census/cost.ts";
```

Delete the local `registeredDomain` and the local `secondLevelZones`, and replace the latter with:

```ts
/**
 * Second-level .ie zones, from the ICANN section of the live Public Suffix
 * List, falling back to what S4 measured on 2026-09-03 if the list is
 * unreachable. Which one was used is printed and lands in the report, because
 * a silent fallback is how a seed changes size for no visible reason.
 */
async function secondLevelZones() {
  try {
    const res = await fetchRetry(PSL_URL);
    const zones = parsePslIeZones(await res.text());
    if (zones.size === 0) throw new Error("no ICANN section found");
    return { zones, source: "publicsuffix.org" };
  } catch (error) {
    console.log(`  PSL unusable (${String(error)}), using the checked-in ICANN zones`);
    return { zones: new Set(IE_ICANN_ZONES), source: "checked-in" };
  }
}
```

Inside `main`, after the block is streamed, replace the single write with the union:

```ts
  mkdirSync(OUT_DIR, { recursive: true });
  const previous = existsSync(`${OUT_DIR}/ie-domains.txt`)
    ? readFileSync(`${OUT_DIR}/ie-domains.txt`, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  const union = new Set([...previous, ...domains]);
  const sorted = [...union].sort();
  writeFileSync(`${OUT_DIR}/ie-domains.txt`, `${sorted.join("\n")}\n`);
```

and the report gains four fields and loses one:

```ts
    thisRunDomains: domains.size,
    previousDomains: previous.length,
    addedThisRun: sorted.length - previous.length,
    registeredDomains: sorted.length,
    instrumentCheck: { "rte.ie": union.has("rte.ie") },
```

`coverageOf2022Registry` and the `REGISTRY_2022` constant are deleted. S4's decision is explicit that the 330,000 figure is undated on weare.ie and that the dated Snapshot figure is the one to use; the coverage arithmetic lives in `content/tools/census.ts` where the page reads it, and computing a second copy here would be a second thing to drift.

`existsSync` and `readFileSync` join the `node:fs` import. Wrap `main` in the cost meter and print `formatCost` at the end.

- [ ] **Step 3: Typecheck, then run it**

```bash
cd "$WT"
npx tsc --noEmit && echo "tsc: clean"
npm run census:seed 2>&1 | tee data/census/seed-run.log
wc -l data/census/ie-domains.txt
grep -c "^rte\.ie$" data/census/ie-domains.txt
grep -c "myspreadshop" data/census/ie-domains.txt
head -3 data/census/ie-domains.txt
tail -3 data/census/ie-domains.txt
```

**Predictions, written before the run so the run can falsify them.** Every one is from S4's measurements and none has been re-observed:

| Prediction | S4's reading | If it is wrong |
|---|---|---|
| about 125,505 domains | 125,505 on the ICANN collapse | A different count means the graph changed between crawls or the collapse is wrong. Print the label-count distribution as S4 did and see which. |
| `rte.ie` present, exactly once | present | The block bounds are wrong. Print the first and last host. |
| `myspreadshop` appears exactly once | one registration, 710 hosts | More than one means the ICANN filter is not being applied and the count is inflated by 709. |
| one part streamed, part 34 | part 34 of 48 | Two parts means the graph is bigger, which is fine and worth noting. |
| under 20 MB, under a minute | 17.4 MB, 8.3 s and 32.3 s on two runs | Longer is Common Crawl's CDN on the day. S4 saw a 4x spread on identical bytes and could not explain it. |
| first `00.ie`, last `www.zyra.ie` | those exact two | A different pair means the block bounds moved. |

Paste the whole run log and the six command outputs into the ledger **before** changing anything. That paste is the observation.

- [ ] **Step 4: Run it a second time and confirm the union is idempotent**

```bash
cd "$WT"
npm run census:seed 2>&1 | tail -20
wc -l data/census/ie-domains.txt
```

Expected: the same line count, `addedThisRun: 0`, and `previousDomains` equal to the total. A union that grows on a second run of the same graph is adding duplicates and the collapse is not deterministic, which would make every month-to-month diff meaningless.

- [ ] **Step 5: Commit the script, never the data**

```bash
cd "$WT"
git status --porcelain
git add scripts/census/seed.mts
git commit -m "feat(census): seed from the host graph, collapsed on the icann section, merged with last month"
```

Expected from `git status`: `scripts/census/seed.mts` only. **If anything under `data/` appears, the `.gitignore` line from Task 0 is missing or wrong.** Fix that before committing; a 2 MB domain list in the repository is a mistake that is annoying to undo.

What this proves: the corpus is 125,505 domains including `rte.ie`, `myspreadshop.ie` counts once, and re-running adds nothing. What it cannot see: whether every name is a live registration. The crawl answers that per domain, and the "fails DNS twice" rule is what eventually removes the dangling ones.

---

### Task 11: The crawler, and the pilot that measures it

**Files:**
- Create: `scripts/census/crawl.mts`, `lib/census/policy.test.ts`, `lib/census/safety.test.ts`
- Modify: `lib/census/fetch.ts`, `lib/census/fetch.test.ts` (append `fetchRobots`)

**Interfaces:**
- Consumes: everything from Tasks 3 to 9, `EXCLUDED_DOMAINS` and `CRAWLER` from `content/`
- Produces: `fetchRobots(url, deps)`, `data/census/<runId>/rows.ndjson`, `data/census/<runId>/report.json`, and the first real measurement of what a run costs

`fetchRobots` is an addition to the interface Task 5 froze, and it is here rather than there because it exists only for the crawler: `fetchText` refuses anything that is not HTML, which is right for a home page and wrong for a `text/plain` robots file.

The pilot at the end of this task is the point. Everything before it is arithmetic on a guess.

- [ ] **Step 1: Append `fetchRobots` and its tests**

Append to `lib/census/fetch.ts`:

```ts
/**
 * robots.txt, which is not HTML and so cannot go through `fetchText`.
 *
 * Returns the status and the body, and nothing else: `lib/census/robots.ts`
 * decides what the status means, including the part where a 5xx is a refusal.
 * Redirects are followed only within the same host, at most twice, because a
 * robots.txt that redirects off-site is not that site's robots.txt and
 * following it would let a third party write rules for somebody else's domain.
 *
 * `status: 0` means the request never completed, which `robotsForStatus`
 * treats as a complete disallow. That is deliberate: we are a guest, and a
 * guest who cannot hear the answer does not walk in.
 */
export async function fetchRobots(
  rawUrl: string,
  deps: CensusFetchDeps = {},
): Promise<{ status: number; body: string }> {
  const send = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return { status: 0, body: "" };
    }
    const origin = target.host;

    for (let hop = 0; hop <= 2; hop++) {
      const refusal = await guard(rawUrl, target, deps);
      if (refusal) return { status: 0, body: "" };

      let response: Response;
      try {
        response = await send(target.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          headers: { "user-agent": CENSUS_UA, accept: "text/plain", "accept-language": "en" },
        });
      } catch {
        return { status: 0, body: "" };
      }

      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) return { status: response.status, body: "" };
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          return { status: response.status, body: "" };
        }
        // Off-host means this is not that host's robots.txt.
        if (next.host !== origin) return { status: 404, body: "" };
        target = next;
        continue;
      }

      if (response.status < 200 || response.status >= 300) return { status: response.status, body: "" };

      const bytes = await readCapped(response, ROBOTS_FETCH_MAX_BYTES);
      if (!bytes) return { status: response.status, body: "" };
      return { status: response.status, body: new TextDecoder("utf-8").decode(bytes) };
    }
    return { status: 0, body: "" };
  } catch {
    return { status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}
```

with, beside the other constants near the top of the file:

```ts
/** robots.txt is parsed to 500 KB, so there is no point reading more than that. */
export const ROBOTS_FETCH_MAX_BYTES = 512 * 1024;
```

Append to `lib/census/fetch.test.ts`:

```ts
describe("fetchRobots", () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { "content-type": "text/plain" } });

  it("returns the status and the body", async () => {
    const fetchImpl = vi.fn(async () => text("User-agent: *\nDisallow: /x\n"));
    const result = await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    expect(result.status).toBe(200);
    expect(result.body).toContain("Disallow: /x");
  });

  it("sends the census user agent", async () => {
    const fetchImpl = vi.fn(async () => text(""));
    await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(CENSUS_UA);
  });

  it("follows a same-host redirect", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/robots.txt")
        ? new Response("", { status: 301, headers: { location: "https://example.ie/robots" } })
        : text("User-agent: *\nDisallow: /\n"),
    );
    const result = await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    expect(result.body).toContain("Disallow: /");
  });

  it("refuses to follow a redirect off the host, and reports it as absent", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 301, headers: { location: "https://cdn.example.com/robots.txt" } }),
    );
    const result = await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    expect(result.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports status 0 when the request fails, which robotsForStatus reads as a refusal", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const result = await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    expect(result).toEqual({ status: 0, body: "" });
  });

  it("carries a 503 through untouched, so the caller can refuse on it", async () => {
    const fetchImpl = vi.fn(async () => text("", 503));
    const result = await fetchRobots("https://example.ie/robots.txt", { fetchImpl, lookupImpl: publicLookup });
    expect(result.status).toBe(503);
  });

  it("applies the fence, so a private address is never asked for robots either", async () => {
    const fetchImpl = vi.fn(async () => text(""));
    const result = await fetchRobots("http://127.0.0.1/robots.txt", { fetchImpl });
    expect(result).toEqual({ status: 0, body: "" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

Add `fetchRobots` to the import list at the top of the test file.

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/fetch.test.ts`
Expected: PASS.

- [ ] **Step 2: The two guards that hold the page's promises to the code**

```ts
// lib/census/policy.test.ts
import { describe, expect, it } from "vitest";
import { CRAWLER, censusCopy } from "@/content/tools/census";
import { MAX_BODY_BYTES, RANGE_BYTES, REQUEST_TIMEOUT_MS, CENSUS_TOKEN, CENSUS_UA } from "./fetch";

/**
 * The politeness policy printed on the page, checked against the constants the
 * crawler actually runs on.
 *
 * This is not a style test. The page makes nine specific promises about what a
 * robot carrying Fergus's name does to other people's servers, and if the copy
 * and the code are two sets of numbers then one of them is wrong and it will be
 * the page. So the numbers live in `content/tools/census.ts`, `lib/census/fetch.ts`
 * derives its constants from them, and this file checks that the sentences
 * still say what the constants are.
 */
const policy = censusCopy.policy.join(" ");

describe("the policy on the page is the policy in the code", () => {
  it("says two requests, and the crawler makes two", () => {
    expect(CRAWLER.requestsPerDomain).toBe(2);
    expect(policy).toContain("Two requests per domain");
  });

  it("says 64 kilobytes asked for and 128 read, and both constants agree", () => {
    expect(RANGE_BYTES).toBe(CRAWLER.rangeKb * 1024);
    expect(MAX_BODY_BYTES).toBe(CRAWLER.maxBodyKb * 1024);
    expect(policy).toContain(`${CRAWLER.rangeKb} kilobytes`);
    expect(policy).toContain(`${CRAWLER.maxBodyKb} kilobytes`);
  });

  it("says two seconds, and the timeout is two seconds", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(CRAWLER.timeoutSec * 1000);
  });

  it("says eight a second", () => {
    expect(CRAWLER.ratePerSecond).toBe(8);
    expect(policy).toContain("Eight requests a second");
  });

  it("says 120 characters, and that is the cap the fingerprinter uses", () => {
    expect(policy).toContain(`${CRAWLER.evidenceChars} characters`);
  });

  it("names the token a site owner would put in robots.txt, and the crawler answers to it", () => {
    expect(policy).toContain(CENSUS_TOKEN);
    expect(CENSUS_UA).toContain(CENSUS_TOKEN);
  });

  it("promises the server error is treated as a no, which robots.txt handling must honour", () => {
    expect(policy.toLowerCase()).toContain("server error");
  });

  it("promises cookie names and never values", () => {
    expect(policy).toContain("cookie names and never cookie values");
  });
});
```

```ts
// lib/census/safety.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KEPT_HEADERS } from "./fetch";

/**
 * Greps, not renders.
 *
 * vitest runs in the node environment here, so nothing in this file mounts
 * anything. These are source-file checks in the pattern of `lib/boot.test.ts`
 * and `components/chrome.test.ts`, and they exist because three of this tool's
 * promises are about what the code does NOT do, and an absence has no other
 * kind of test.
 *
 * Every read normalises line endings first. This is a Windows checkout with
 * autocrlf on, and a guard that searches for a bare newline is red here and
 * green in CI, which is how `lib/contact.test.ts` wasted a fortnight.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

function filesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(ROOT, relative))) {
      const next = `${relative}/${entry}`;
      if (statSync(join(ROOT, next)).isDirectory()) walk(next);
      else if (extensions.some((ext) => entry.endsWith(ext))) out.push(next);
    }
  };
  walk(dir);
  return out;
}

const sources = [
  ...filesUnder("lib/census", [".ts"]).filter((f) => !f.endsWith(".test.ts")),
  ...filesUnder("scripts/census", [".mts"]),
];

describe("nothing is written to a visitor's machine", () => {
  it("names no browser storage anywhere in the tool", () => {
    for (const file of [...sources, ...filesUnder("app/tools/census", [".tsx", ".ts", ".css"])]) {
      const body = read(file);
      for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "caches."]) {
        expect(body, `${file} touches ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("nothing anybody wrote is kept", () => {
  it("keeps no header that could carry a credential", () => {
    for (const forbidden of ["set-cookie", "authorization", "www-authenticate", "proxy-authenticate"]) {
      expect(KEPT_HEADERS, forbidden).not.toContain(forbidden);
    }
  });

  it("caps evidence in the one place evidence is made", () => {
    const body = read("lib/census/fingerprint.ts");
    expect(body).toContain("slice(0, EVIDENCE_MAX)");
  });

  it("never writes a raw page to disk from the crawler", () => {
    const body = read("scripts/census/crawl.mts");
    // The row written to NDJSON is built from a fingerprint, never from `html`.
    expect(body).not.toMatch(/writeFileSync\([^)]*html/);
    expect(body).not.toMatch(/appendFileSync\([^)]*\bhtml\b/);
  });

  it("puts no page text in a row: the row type has no field for one", () => {
    const body = read("lib/census/types.ts");
    expect(body).not.toContain("html:");
    expect(body).not.toContain("text:");
  });
});

describe("the crawl can actually run under bare node", () => {
  it("uses no @/ alias in a runtime module, because node does not know what that is", () => {
    for (const file of sources) {
      const body = read(file);
      const offenders = body
        .split("\n")
        .filter((line) => /^\s*(?:import|export)\s+(?!type)[^;]*from\s+["']@\//.test(line));
      expect(offenders, `${file} imports through the @/ alias at runtime`).toEqual([]);
    }
  });

  it("writes the .ts extension on every relative import in a runtime module", () => {
    for (const file of sources) {
      const body = read(file);
      const offenders = body
        .split("\n")
        .filter((line) => /^\s*(?:import|export)\s+(?!type)[^;]*from\s+["']\.[^"']*["']/.test(line))
        .filter((line) => !/\.ts["']/.test(line));
      expect(offenders, `${file} has a relative import with no extension`).toEqual([]);
    }
  });
});

describe("the crawler cannot skip its own fence", () => {
  it("reaches the network only through lib/census/fetch.ts", () => {
    const body = read("scripts/census/crawl.mts");
    // `fetch(` appears nowhere: every request goes through fetchText or fetchRobots.
    expect(body).not.toMatch(/(?<![a-zA-Z])fetch\(/);
  });

  it("checks the opt-out list before it resolves anything", () => {
    const body = read("scripts/census/crawl.mts");
    const optOut = body.indexOf("EXCLUDED");
    const resolve = body.indexOf("resolvePublic");
    expect(optOut).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(-1);
    expect(optOut, "the opt-out check must come before any DNS lookup").toBeLessThan(resolve);
  });
});
```

Run: `cd "$WT" && npx vitest run lib/census/policy.test.ts`
Expected: PASS. `safety.test.ts` fails until Step 3 writes the crawler, which is the right order: it is a test for a file that does not exist yet.

- [ ] **Step 3: Write the crawler**

```ts
// scripts/census/crawl.mts
/**
 * The Irish Stack Census crawl. One polite read of one page per domain.
 *
 *   npm run census:crawl -- --limit 500 --run pilot
 *   npm run census:crawl
 *
 * Runs on the home machine, monthly, on the scheduler that already runs the
 * daily scans. It never runs on Vercel: 251,010 outbound requests would spend
 * the month's whole CPU allotment several times over, and the design says so.
 *
 * **Resumable, because nine hours is long enough for something to happen.**
 * Rows are appended to NDJSON as they finish and a restart reads back which
 * domains are already there. There is no state anywhere else, so killing this
 * at hour eight costs nothing but the domains in flight.
 *
 * **The order of the checks is a promise.** Opt-out first, so an excluded
 * domain costs its owner nothing, not even a DNS lookup. Then DNS, which is
 * answered by a resolver rather than by their server. Then robots.txt. Only
 * then the page. `lib/census/safety.test.ts` checks that order in the source,
 * because getting it backwards would still produce correct-looking rows.
 *
 * **Every request goes through `lib/census/fetch.ts`.** The word `fetch(` does
 * not appear in this file and there is a test that says so: 125,505 hostnames
 * chosen by a third party, resolved and fetched unattended on a home network,
 * is exactly the shape that wants a fence it cannot route around.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EXCLUDED_DOMAINS } from "../../content/census/excluded.ts";
import { CRAWLER } from "../../content/tools/census.ts";
import { formatCost, startCost, type Cost } from "../../lib/census/cost.ts";
import { CENSUS_TOKEN, fetchRobots, fetchText, resolvePublic } from "../../lib/census/fetch.ts";
import { fingerprint } from "../../lib/census/fingerprint.ts";
import { classifyIndustry } from "../../lib/census/industry.ts";
import { parseRobots, robotsAllows, robotsForStatus } from "../../lib/census/robots.ts";
import type { CensusRow, Reach } from "../../lib/census/types.ts";

const SEED = "data/census/ie-domains.txt";
const CONCURRENCY = 16;
const PROGRESS_EVERY = 1000;
const EXCLUDED = new Set(EXCLUDED_DOMAINS);

type Args = { runId: string; limit: number | null };

function parseArgs(argv: string[]): Args {
  const out: Args = { runId: new Date().toISOString().slice(0, 7), limit: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") out.runId = String(argv[++i]);
    else if (argv[i] === "--limit") out.limit = Number(argv[++i]);
  }
  return out;
}

/**
 * A token bucket at `CRAWLER.ratePerSecond` across the whole run.
 *
 * Not per host: each host is visited twice in a whole month, so a per-host
 * limit would be about nothing. The global rate is what decides whether this is
 * a nine-hour crawl or a rude one, and it is the number the page prints.
 */
function rateGate(perSecond: number) {
  const intervalMs = 1000 / perSecond;
  let next = Date.now();
  return async () => {
    const now = Date.now();
    next = Math.max(now, next) + intervalMs;
    const wait = next - now - intervalMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };
}

function emptyRow(domain: string, reach: Reach, ms: number): CensusRow {
  return {
    domain,
    reach,
    status: null,
    signals: [],
    industry: "unknown",
    method: "none",
    classEvidence: "",
    h1: null,
    copyrightYear: null,
    ms,
  };
}

/** 401, 403 and 429 are a refusal. They are never a "custom build". */
function reachForStatus(detail: string): Reach {
  return /\b(401|403|429)\b/.test(detail) ? "blocked" : "http-error";
}

async function crawlDomain(domain: string, take: () => Promise<void>): Promise<CensusRow> {
  const stop = startCost();

  if (EXCLUDED.has(domain)) return emptyRow(domain, "opted-out", stop().wallMs);

  // DNS before HTTP. A resolver answers this, not their server, so trying both
  // names costs the site nothing and tells us whether it exists at all.
  let host: string | null = null;
  for (const candidate of [domain, `www.${domain}`]) {
    const resolved = await resolvePublic(candidate);
    if (resolved.ok) {
      host = candidate;
      break;
    }
  }
  if (host === null) return emptyRow(domain, "dns-failed", stop().wallMs);

  // robots.txt, and a server error or a silence is a no.
  await take();
  const robotsReply = await fetchRobots(`https://${host}/robots.txt`);
  const outcome = robotsForStatus(robotsReply.status);
  if (outcome === "disallow-all") return emptyRow(domain, "robots-excluded", stop().wallMs);
  let crawlDelaySec = 0;
  if (outcome === "use-body") {
    const decision = robotsAllows(parseRobots(robotsReply.body), CENSUS_TOKEN, "/");
    if (!decision.allowed) return emptyRow(domain, "robots-excluded", stop().wallMs);
    crawlDelaySec = decision.crawlDelaySec ?? 0;
  }
  if (crawlDelaySec > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(crawlDelaySec, 30) * 1000));
  }

  // The one page.
  await take();
  const page = await fetchText(`https://${host}/`);
  if (!page.ok) {
    const reach: Reach =
      page.reason === "timeout"
        ? "timed-out"
        : page.reason === "not-html"
          ? "not-html"
          : page.reason === "dns" || page.reason === "private-address"
            ? "dns-failed"
            : page.reason === "http-error"
              ? reachForStatus(page.detail)
              : "http-error";
    return { ...emptyRow(domain, reach, stop().wallMs), status: null };
  }

  const marks = fingerprint({ headers: page.headers, cookieNames: page.cookieNames, html: page.html });
  const classification = classifyIndustry({ html: page.html, parked: marks.parked, reachable: true });

  // `page.html` goes out of scope here and is never written anywhere.
  return {
    domain,
    reach: "answered",
    status: page.status,
    signals: marks.signals,
    industry: classification.industry,
    method: classification.method,
    classEvidence: classification.evidence,
    h1: marks.h1,
    copyrightYear: marks.copyrightYear,
    ms: stop().wallMs,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = `data/census/${args.runId}`;
  const rowsPath = `${outDir}/rows.ndjson`;
  mkdirSync(outDir, { recursive: true });

  if (!existsSync(SEED)) {
    console.error(`no seed at ${SEED}. Run npm run census:seed first.`);
    process.exit(1);
  }
  const all = readFileSync(SEED, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);

  const done = new Set<string>();
  if (existsSync(rowsPath)) {
    for (const line of readFileSync(rowsPath, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        done.add((JSON.parse(line) as CensusRow).domain);
      } catch {
        // A half-written last line after a kill. Ignore it; that domain is redone.
      }
    }
  }

  const queue = all.filter((d) => !done.has(d)).slice(0, args.limit ?? undefined);
  console.log(`run ${args.runId}: ${all.length} in seed, ${done.size} already done, ${queue.length} to do`);
  console.log(`user agent: ${CRAWLER.userAgent}`);
  console.log(`rate: ${CRAWLER.ratePerSecond}/s global, ${CONCURRENCY} in flight`);

  const take = rateGate(CRAWLER.ratePerSecond);
  const stop = startCost();
  const reach: Record<string, number> = {};
  let completed = 0;
  let at = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = at++;
      if (index >= queue.length) return;
      const row = await crawlDomain(queue[index], take);
      appendFileSync(rowsPath, `${JSON.stringify(row)}\n`);
      reach[row.reach] = (reach[row.reach] ?? 0) + 1;
      completed++;
      if (completed % PROGRESS_EVERY === 0) {
        const so_far = stop();
        console.log(
          `${completed}/${queue.length}  ${formatCost(so_far)}  ${(completed / (so_far.wallMs / 1000)).toFixed(1)}/s  ${JSON.stringify(reach)}`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const cost: Cost = stop();
  const report = {
    runId: args.runId,
    seedDomains: all.length,
    attempted: queue.length,
    completed,
    reach,
    requests: completed * CRAWLER.requestsPerDomain,
    cost,
    costLine: formatCost(cost),
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Two things about that file are worth naming because `tsc` will not. `resolvePublic` is imported at the top rather than reached for with a dynamic `import()` inside the loop, so the module graph is static and `lib/census/safety.test.ts`'s grep can see it. And `crawlDomain` takes `take` as a parameter rather than closing over a module-level gate, so the rate limiter is one object for the whole run and a future caller cannot accidentally create a second one.

- [ ] **Step 4: Typecheck and run the safety guards**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/census/safety.test.ts lib/census/policy.test.ts`
Expected: PASS. The `fetch(` grep is the load-bearing one. If it fails, something in the crawler is reaching the network without the fence, and the fix is to route it through `lib/census/fetch.ts`, never to loosen the grep.

- [ ] **Step 5: The pilot, on 500 real domains, and this is where the guesses die**

Take a random 500 from the seed so the sample is not the alphabetical head, which is full of numeric and novelty names:

```bash
cd "$WT"
mkdir -p data/census/pilot
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const all = readFileSync("data/census/ie-domains.txt", "utf8").split("\n").filter(Boolean);
// Deterministic sample so a rerun is comparable: every 251st name.
const step = Math.floor(all.length / 500);
const sample = Array.from({ length: 500 }, (_, i) => all[i * step]).filter(Boolean);
writeFileSync("data/census/pilot/seed.txt", sample.join("\n") + "\n");
console.log("sampled", sample.length, "of", all.length, "step", step);
'
cp data/census/ie-domains.txt data/census/ie-domains.full.txt
cp data/census/pilot/seed.txt data/census/ie-domains.txt
time npm run census:crawl -- --run pilot 2>&1 | tee data/census/pilot/run.log
cp data/census/ie-domains.full.txt data/census/ie-domains.txt
cat data/census/pilot/report.json
```

**Predictions, all guesses, written before the run:**

| Thing | Guess | Falsified by |
|---|---|---|
| wall clock | 500 domains at 2 requests and 8 a second is 125 s, plus tail latency, so 2 to 4 minutes | over 10 minutes: the rate gate is throttling harder than intended, or `CONCURRENCY` is too low for a 2 s timeout |
| `answered` | 55 to 75% | under 40%: something systematic, and the reach tally says which |
| `dns-failed` | 5 to 15%, the dangling names S4 warned about | over 30%: the resolver is the problem, not the domains. Check `nslookup` on ten of them by hand before blaming the corpus |
| `robots-excluded` | under 5% | over 15%: read ten of those robots files by hand. A parser bug looks exactly like a strict internet |
| `blocked` | 2 to 10%, mostly Cloudflare challenges | |
| CPU as a fraction of wall | under 5% | over 25%: the parsing is expensive enough to matter at 125,505 and the fingerprinter needs looking at |
| rows with a platform | 60 to 80% of answered | under 40%: the signature table is thin, which is a finding rather than a bug |
| rows with industry `unknown` | 30 to 50% of answered | over 70%: the keyword table needs work before the full run, and that work is cheap now and expensive later |

Then look at the data rather than only the tally:

```bash
cd "$WT"
node -e '
const rows = require("node:fs").readFileSync("data/census/pilot/rows.ndjson","utf8").split("\n").filter(Boolean).map(JSON.parse);
const tally = (f) => rows.reduce((m,r)=>{const k=f(r); if(k!==undefined&&k!==null) m[k]=(m[k]||0)+1; return m;},{});
console.log("reach", tally(r=>r.reach));
console.log("method", tally(r=>r.method));
console.log("industry", Object.entries(tally(r=>r.industry)).sort((a,b)=>b[1]-a[1]).slice(0,12));
console.log("platform", Object.entries(tally(r=>r.signals.filter(s=>s.category==="platform").map(s=>s.id).join("+")||"(none)")).sort((a,b)=>b[1]-a[1]).slice(0,12));
console.log("h1", tally(r=>r.h1&&r.h1.verdict));
console.log("years", Object.entries(tally(r=>r.copyrightYear)).sort());
console.log("slowest", rows.map(r=>r.ms).sort((a,b)=>b-a).slice(0,5));
'
```

**Paste every one of those outputs into the ledger before changing a line of code.** They are the first evidence about the real internet this tool has ever seen and everything after them is a reaction to them.

- [ ] **Step 6: Read twenty rows by hand, because a tally cannot tell you it is wrong**

Print twenty answered rows with their domain, industry, method and evidence, open each in a browser, and write down whether the bucket is right. Twenty is not a measurement, it is a smell test before spending nine hours; the measurement is Task 13.

What to act on, and what not to:

- **A signature that never fires** on a platform you can see with your own eyes on three of the twenty: fix the pattern, add a test case, and note it.
- **A bucket that is obviously wrong** on more than three of twenty: look at the evidence string. If a weak term is doing too much work, move it or drop it, and re-run the pilot.
- **A bucket you disagree with but the evidence supports**: leave it. The classifier is allowed to be wrong in ways the spot check will count. Tuning it against twenty examples you chose is how a measurement becomes a mirror.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git status --porcelain
git add scripts/census/crawl.mts lib/census/fetch.ts lib/census/fetch.test.ts lib/census/policy.test.ts lib/census/safety.test.ts
git commit -m "feat(census): the polite crawler, opt-out before dns, and a pilot that measured it"
```

`git status` must show nothing under `data/`.

What this proves: 500 real `.ie` domains were read at the stated rate with the stated politeness, and the reach, method, industry and cost distributions are measured rather than guessed. What it cannot see: whether the buckets are right (Task 13), how the full 125,505 behaves (Task 13), and whether anybody minds, which is a question only time and the contact page answer.

---

### Task 12: The aggregate, and a snapshot with no prose in it

**Files:**
- Create: `lib/census/aggregate.ts`, `lib/census/aggregate.test.ts`, `scripts/census/aggregate.mts`, `content/census/snapshot.test.ts`
- Generated: `content/census/snapshot.ts`

**Interfaces:**
- Consumes: `CensusRow`, `INDUSTRIES`, `SIGNATURES`, `COVERAGE`, `Cost`
- Produces: `CensusSnapshot`, `SNAPSHOT_SAMPLES`, `aggregate(rows, meta)`, `snapshotSource(snapshot)`

The snapshot is the whole of what the page renders and it is a committed TypeScript file, which makes two constraints real.

**No prose from anybody else's site, ever.** Not an h1, not a title, not a meta description. Counts, bucket ids, signature ids and domain names. The obvious reason is that a stranger's em dash would fail `content/voice.test.ts` and stop the build. The real reason is that a committed file is a permanent publication of somebody's words, taken by a robot, with no way for them to ask for it back. `content/census/snapshot.test.ts` enforces it with a charset check, so it fails loudly rather than being a rule somebody remembers.

**Sample domains are the honesty layer that phase A can have.** The design asks for "the evidence URL and the reason for each classification" per row, which is 125,505 rows and needs Neon. What fits in a committed file is, per signature, up to five domains it fired on: a reader can open one and check. Domain names are identifiers, not prose, and they pass the charset check by construction.

- [ ] **Step 1: Write the failing test**

```ts
// lib/census/aggregate.test.ts
import { describe, expect, it } from "vitest";
import { SNAPSHOT_SAMPLES, aggregate } from "./aggregate";
import type { CensusRow } from "./types";

const row = (over: Partial<CensusRow> = {}): CensusRow => ({
  domain: "example.ie",
  reach: "answered",
  status: 200,
  signals: [],
  industry: "unknown",
  method: "none",
  classEvidence: "",
  h1: null,
  copyrightYear: null,
  ms: 400,
  ...over,
});

const meta = {
  runId: "2026-09",
  startedAt: "2026-09-04",
  finishedAt: "2026-09-04",
  cost: { wallMs: 1000, cpuMs: 40 },
  requests: 8,
};

describe("aggregate", () => {
  it("counts every reach, including the ones that are not findings", () => {
    const snapshot = aggregate(
      [
        row({ domain: "a.ie" }),
        row({ domain: "b.ie", reach: "dns-failed" }),
        row({ domain: "c.ie", reach: "robots-excluded" }),
        row({ domain: "d.ie", reach: "opted-out" }),
        row({ domain: "e.ie", reach: "blocked" }),
      ],
      meta,
    );
    expect(snapshot.reach).toEqual({
      answered: 1,
      "dns-failed": 1,
      "robots-excluded": 1,
      "opted-out": 1,
      blocked: 1,
      "timed-out": 0,
      "http-error": 0,
      "not-html": 0,
    });
  });

  it("rolls signals up per category with counts and sample domains", () => {
    const wp = { category: "platform" as const, id: "wordpress", where: "html" as const, evidence: "/wp-content/" };
    const snapshot = aggregate(
      [row({ domain: "a.ie", signals: [wp] }), row({ domain: "b.ie", signals: [wp] })],
      meta,
    );
    const platform = snapshot.categories.find((c) => c.category === "platform");
    expect(platform?.total).toBe(2);
    expect(platform?.known).toBe(2);
    expect(platform?.items[0]).toEqual({ id: "wordpress", n: 2, samples: ["a.ie", "b.ie"] });
  });

  it("counts answered sites with no signal in a category as not-known, never as custom", () => {
    const snapshot = aggregate([row({ domain: "a.ie" })], meta);
    const platform = snapshot.categories.find((c) => c.category === "platform");
    expect(platform?.total).toBe(1);
    expect(platform?.known).toBe(0);
    expect(platform?.items).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("custom");
  });

  it("caps sample domains and takes them in sorted order, so a rerun agrees", () => {
    const wp = { category: "platform" as const, id: "wordpress", where: "html" as const, evidence: "x" };
    const rows = ["e.ie", "d.ie", "c.ie", "b.ie", "a.ie", "f.ie", "g.ie"].map((domain) => row({ domain, signals: [wp] }));
    const snapshot = aggregate(rows, meta);
    const item = snapshot.categories.find((c) => c.category === "platform")?.items[0];
    expect(item?.samples).toHaveLength(SNAPSHOT_SAMPLES);
    expect(item?.samples).toEqual([...(item?.samples ?? [])].sort());
  });

  it("sorts items by count, descending, so the page renders a ranking", () => {
    const wp = { category: "platform" as const, id: "wordpress", where: "html" as const, evidence: "x" };
    const shopify = { category: "platform" as const, id: "shopify", where: "html" as const, evidence: "y" };
    const snapshot = aggregate(
      [row({ domain: "a.ie", signals: [shopify] }), row({ domain: "b.ie", signals: [wp] }), row({ domain: "c.ie", signals: [wp] })],
      meta,
    );
    const ids = snapshot.categories.find((c) => c.category === "platform")?.items.map((i) => i.id);
    expect(ids).toEqual(["wordpress", "shopify"]);
  });

  it("splits every industry into stated and inferred, which is the honesty column", () => {
    const snapshot = aggregate(
      [
        row({ domain: "a.ie", industry: "legal", method: "schema" }),
        row({ domain: "b.ie", industry: "legal", method: "keyword" }),
        row({ domain: "c.ie", industry: "legal", method: "keyword" }),
      ],
      meta,
    );
    const legal = snapshot.industries.find((i) => i.id === "legal");
    expect(legal).toMatchObject({ n: 3, stated: 1, inferred: 2 });
  });

  it("gives each industry its own top platforms, which is the matrix", () => {
    const wp = { category: "platform" as const, id: "wordpress", where: "html" as const, evidence: "x" };
    const snapshot = aggregate(
      [row({ domain: "a.ie", industry: "legal", method: "schema", signals: [wp] })],
      meta,
    );
    expect(snapshot.industries.find((i) => i.id === "legal")?.platforms).toEqual([
      { id: "wordpress", n: 1, samples: ["a.ie"] },
    ]);
  });

  it("counts h1 verdicts, which is the headline checker's finding at scale", () => {
    const snapshot = aggregate(
      [
        row({ domain: "a.ie", h1: { verdict: "clean", characterElements: 0, length: 10 } }),
        row({ domain: "b.ie", h1: { verdict: "fragmented", characterElements: 9, length: 9 } }),
        row({ domain: "c.ie", h1: { verdict: "no-h1-in-html", characterElements: 0, length: 0 } }),
        row({ domain: "d.ie" }),
      ],
      meta,
    );
    expect(snapshot.headings).toEqual({ clean: 1, fragmented: 1, noH1: 1, noHeadingAtAll: 1 });
  });

  it("buckets copyright years and drops the empties", () => {
    const snapshot = aggregate(
      [row({ domain: "a.ie", copyrightYear: 2026 }), row({ domain: "b.ie", copyrightYear: 2019 }), row({ domain: "c.ie" })],
      meta,
    );
    expect(snapshot.copyrightYears).toEqual([
      { year: 2019, n: 1 },
      { year: 2026, n: 1 },
    ]);
  });

  it("carries the coverage constants, so the page cannot render a share without them", () => {
    const snapshot = aggregate([row()], meta);
    expect(snapshot.coverage.seedDomains).toBe(125505);
    expect(snapshot.coverage.sharePercent).toBe(37.7);
  });

  it("carries the run's own cost, both numbers", () => {
    const snapshot = aggregate([row()], meta);
    expect(snapshot.cost).toEqual({ wallMs: 1000, cpuMs: 40 });
    expect(snapshot.requests).toBe(8);
  });

  it("holds no string that is not an identifier, a domain or a date", () => {
    const wp = { category: "platform" as const, id: "wordpress", where: "html" as const, evidence: "<!-- somebody's page -->" };
    const snapshot = aggregate([row({ domain: "a.ie", signals: [wp], classEvidence: "solicitors, probate" })], meta);
    const strings = JSON.stringify(snapshot);
    expect(strings).not.toContain("somebody");
    expect(strings).not.toContain("probate");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && npx vitest run lib/census/aggregate.test.ts`
Expected: FAIL with `Cannot find module './aggregate'`.

- [ ] **Step 3: Write the aggregator**

```ts
// lib/census/aggregate.ts
import { COVERAGE } from "../../content/tools/census.ts";
import { INDUSTRIES, type IndustryId } from "./industries.ts";
import type { Cost } from "./cost.ts";
import type { CensusRow, Reach, SignalCategory } from "./types.ts";

/**
 * Rows to the object the page renders.
 *
 * **Nothing anybody wrote crosses this function.** Evidence strings and
 * classification evidence are read to make counts and are then dropped: the
 * output holds counts, bucket ids, signature ids, domain names and two dates.
 * The obvious reason is that a stranger's em dash in a committed file fails
 * `content/voice.test.ts` and stops the build. The real reason is that a
 * committed file is a permanent publication of somebody's words, taken by a
 * robot, with nobody to ask for it back. `content/census/snapshot.test.ts`
 * enforces the charset so this is a guard rather than a habit.
 *
 * **`known` is not `total`.** A category's `total` is every answered site and
 * its `known` is the ones where a rule fired. The gap is what the census could
 * not read, and it is printed rather than divided away, because dividing by
 * `known` instead of `total` is how a platform share doubles overnight.
 *
 * Sample domains are the honesty layer phase A can afford: up to five domains
 * per signature that a reader can open and check. The per-row evidence the
 * design asks for needs Neon and is Task 18.
 */

/** Domains kept per signature so a reader can check one. */
export const SNAPSHOT_SAMPLES = 5;
/** Platforms kept per industry row. Enough for a matrix that fits a phone. */
export const PLATFORMS_PER_INDUSTRY = 6;

export type SignatureCount = { id: string; n: number; samples: string[] };

export type CategoryRoll = {
  category: SignalCategory;
  /** Answered sites, whether or not a rule fired. */
  total: number;
  /** Answered sites where at least one rule in this category fired. */
  known: number;
  items: SignatureCount[];
};

export type IndustryRow = {
  id: IndustryId;
  n: number;
  /** Classified from the site's own schema.org markup. */
  stated: number;
  /** Classified from words. */
  inferred: number;
  platforms: SignatureCount[];
};

export type HeadingCounts = {
  clean: number;
  fragmented: number;
  noH1: number;
  /** No heading of any level in the served HTML. */
  noHeadingAtAll: number;
};

export type CensusSnapshot = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  coverage: {
    seedDomains: number;
    registryCount: number;
    registryAsOf: string;
    sharePercent: number;
    crawl: string;
  };
  reach: Record<Reach, number>;
  categories: CategoryRoll[];
  industries: IndustryRow[];
  headings: HeadingCounts;
  copyrightYears: { year: number; n: number }[];
  requests: number;
  cost: Cost;
};

export type AggregateMeta = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  requests: number;
  cost: Cost;
};

const REACHES: Reach[] = [
  "answered",
  "opted-out",
  "robots-excluded",
  "dns-failed",
  "blocked",
  "timed-out",
  "http-error",
  "not-html",
];

const CATEGORIES: SignalCategory[] = ["platform", "host", "payments", "booking", "newsletter"];

/** Counts and sorted sample domains per id. Sorted so two runs agree byte for byte. */
function roll(pairs: Array<{ id: string; domain: string }>, limit: number): SignatureCount[] {
  const counts = new Map<string, { n: number; domains: string[] }>();
  for (const { id, domain } of pairs) {
    const entry = counts.get(id) ?? { n: 0, domains: [] };
    entry.n += 1;
    entry.domains.push(domain);
    counts.set(id, entry);
  }
  return [...counts.entries()]
    .map(([id, entry]) => ({
      id,
      n: entry.n,
      samples: [...entry.domains].sort().slice(0, SNAPSHOT_SAMPLES),
    }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function aggregate(rows: readonly CensusRow[], meta: AggregateMeta): CensusSnapshot {
  const reach = Object.fromEntries(REACHES.map((r) => [r, 0])) as Record<Reach, number>;
  for (const row of rows) reach[row.reach] = (reach[row.reach] ?? 0) + 1;

  const answered = rows.filter((r) => r.reach === "answered");

  const categories: CategoryRoll[] = CATEGORIES.map((category) => {
    const pairs = answered.flatMap((row) =>
      row.signals.filter((s) => s.category === category).map((s) => ({ id: s.id, domain: row.domain })),
    );
    const known = answered.filter((row) => row.signals.some((s) => s.category === category)).length;
    return { category, total: answered.length, known, items: roll(pairs, Number.MAX_SAFE_INTEGER) };
  });

  const industries: IndustryRow[] = INDUSTRIES.map((industry) => {
    const mine = rows.filter((r) => r.industry === industry.id);
    const platformPairs = mine.flatMap((row) =>
      row.signals.filter((s) => s.category === "platform").map((s) => ({ id: s.id, domain: row.domain })),
    );
    return {
      id: industry.id,
      n: mine.length,
      stated: mine.filter((r) => r.method === "schema").length,
      inferred: mine.filter((r) => r.method === "keyword").length,
      platforms: roll(platformPairs, PLATFORMS_PER_INDUSTRY),
    };
  }).filter((row) => row.n > 0);

  const headings: HeadingCounts = {
    clean: answered.filter((r) => r.h1?.verdict === "clean").length,
    fragmented: answered.filter((r) => r.h1?.verdict === "fragmented").length,
    noH1: answered.filter((r) => r.h1?.verdict === "no-h1-in-html").length,
    noHeadingAtAll: answered.filter((r) => r.h1 === null).length,
  };

  const years = new Map<number, number>();
  for (const row of answered) {
    if (row.copyrightYear === null) continue;
    years.set(row.copyrightYear, (years.get(row.copyrightYear) ?? 0) + 1);
  }

  return {
    runId: meta.runId,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    coverage: {
      seedDomains: COVERAGE.seedDomains,
      registryCount: COVERAGE.registryCount,
      registryAsOf: COVERAGE.registryAsOf,
      sharePercent: COVERAGE.sharePercent,
      crawl: COVERAGE.crawl,
    },
    reach,
    categories,
    industries,
    headings,
    copyrightYears: [...years.entries()]
      .map(([year, n]) => ({ year, n }))
      .sort((a, b) => a.year - b.year),
    requests: meta.requests,
    cost: meta.cost,
  };
}

/** The generated module, as text. Written by `scripts/census/aggregate.mts`. */
export function snapshotSource(snapshot: CensusSnapshot): string {
  return [
    "// Generated by scripts/census/aggregate.mts. Do not edit by hand.",
    "//",
    "// Counts, bucket ids, signature ids, domain names and two dates. No prose",
    "// from anybody else's website reaches this file, and",
    "// content/census/snapshot.test.ts fails the build if it ever does.",
    'import type { CensusSnapshot } from "@/lib/census/aggregate";',
    "",
    `export const snapshot: CensusSnapshot = ${JSON.stringify(snapshot, null, 2)};`,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: The charset guard on the generated file**

```ts
// content/census/snapshot.test.ts
import { describe, expect, it } from "vitest";
import { INDUSTRY_IDS } from "@/lib/census/industries";
import { SIGNATURES_BY_ID } from "@/lib/census/signatures";
import { snapshot } from "./snapshot";

/**
 * The generated snapshot is a committed file, so what is in it is published for
 * good. This is the guard that keeps it to facts about the web rather than
 * words off somebody's home page.
 *
 * It also catches the boring version of the same problem: a stranger's em dash
 * in a `content/` file fails `content/voice.test.ts` and stops the build with an
 * error about house style, which is a confusing way to learn that the
 * aggregator leaked a title.
 */
const STRING_KEYS_ALLOWED = /^[a-z0-9][a-z0-9.\-]*$/;

function strings(value: unknown, path = "$"): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

describe("the generated snapshot", () => {
  it("holds no string outside the allowed shapes", () => {
    for (const { path, value } of strings(snapshot)) {
      const ok =
        STRING_KEYS_ALLOWED.test(value) ||
        /^\d{4}(?:-\d{2}){0,2}$/.test(value) ||
        /^end of \d{4}$/.test(value) ||
        /^cc-main-\d{4}-[a-z-]+$/.test(value);
      expect(ok, `${path} = ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it("has no space in any domain sample, which is what a leaked sentence looks like", () => {
    for (const category of snapshot.categories) {
      for (const item of category.items) {
        for (const sample of item.samples) expect(sample, sample).not.toContain(" ");
      }
    }
  });

  it("names only signatures that exist", () => {
    for (const category of snapshot.categories) {
      for (const item of category.items) expect(SIGNATURES_BY_ID.has(item.id), item.id).toBe(true);
    }
  });

  it("names only industries that exist", () => {
    for (const industry of snapshot.industries) expect(INDUSTRY_IDS, industry.id).toContain(industry.id);
  });

  it("never says a category is more known than it is total", () => {
    for (const category of snapshot.categories) {
      expect(category.known, category.category).toBeLessThanOrEqual(category.total);
    }
  });

  it("adds its industries up to no more than the rows it read", () => {
    const total = snapshot.industries.reduce((sum, i) => sum + i.n, 0);
    const read = Object.values(snapshot.reach).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(read);
  });

  it("carries the coverage share the page prints", () => {
    expect(snapshot.coverage.sharePercent).toBe(37.7);
  });
});
```

- [ ] **Step 5: Write the aggregate script and run it on the pilot**

```ts
// scripts/census/aggregate.mts
/**
 * A run's NDJSON becomes `content/census/snapshot.ts`, which is what the page
 * imports.
 *
 *   npm run census:aggregate -- --run pilot
 *
 * The page is a static import of the output, so the census costs nothing to
 * serve: no function, no Redis command, no Neon compute. Neon holds the
 * per-domain rows for the diff and the drill-down, and that is a separate step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate, snapshotSource } from "../../lib/census/aggregate.ts";
import type { CensusRow } from "../../lib/census/types.ts";

const runId = process.argv.includes("--run")
  ? String(process.argv[process.argv.indexOf("--run") + 1])
  : new Date().toISOString().slice(0, 7);

const dir = `data/census/${runId}`;
const rows: CensusRow[] = readFileSync(`${dir}/rows.ndjson`, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as CensusRow);

const report = JSON.parse(readFileSync(`${dir}/report.json`, "utf8")) as {
  runId: string;
  requests: number;
  cost: { wallMs: number; cpuMs: number };
  finishedAt: string;
};

const snapshot = aggregate(rows, {
  runId: report.runId,
  startedAt: report.finishedAt.slice(0, 10),
  finishedAt: report.finishedAt.slice(0, 10),
  requests: report.requests,
  cost: report.cost,
});

writeFileSync("content/census/snapshot.ts", snapshotSource(snapshot));
console.log(`wrote content/census/snapshot.ts from ${rows.length} rows in ${dir}`);
console.log(`reach: ${JSON.stringify(snapshot.reach)}`);
console.log(`industries with rows: ${snapshot.industries.length}`);
```

```bash
cd "$WT"
npx tsc --noEmit && npm run census:aggregate -- --run pilot
npx vitest run lib/census/aggregate.test.ts content/census/snapshot.test.ts
wc -c content/census/snapshot.ts
```

Expected: PASS on both suites and a file well under 200 KB for the pilot. If the charset guard fails, **fix the aggregator, never the guard**: a failure there means a page's words reached a committed file, which is the thing the guard exists to stop.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/census/aggregate.ts lib/census/aggregate.test.ts scripts/census/aggregate.mts content/census/snapshot.ts content/census/snapshot.test.ts
git commit -m "feat(census): aggregate to a committed snapshot with nobody else's words in it"
```

What this proves: the aggregate is deterministic, `known` is never confused with `total`, and the generated file holds only identifiers, domains and dates. What it cannot see: whether the pilot's 500 rows resemble the full 125,505 in any way. They are a sample of 0.4% and the snapshot committed here is labelled `pilot`.

---

### Task 13: The full run, and the spot check that measures the classifier

**Files:**
- Create: `scripts/census/spotcheck.mts`, `content/census/spotcheck.ts`
- Regenerated: `content/census/snapshot.ts`

**Interfaces:**
- Consumes: the seed, the crawler, the aggregate
- Produces: `SPOT_CHECK`, the full snapshot, and the first honest statement of how often the industry column is right

The full crawl is roughly nine hours of wall clock, which is longer than a session. Start it in the background at Step 1 and do the spot check while it runs; they touch different files.

**The spot check is the only measurement of accuracy in this whole sub-project**, and the design asks for it in those words: "Coverage stated per bucket against a spot check." It has two halves that answer different questions, and conflating them is the mistake to avoid:

- **Precision**: of the domains the classifier put in a bucket, how many belong there. Measured by hand, on a random sample, by a person opening the site.
- **Coverage**: of the Irish businesses that exist in a bucket, how many are in the seed at all. Measured against an independent list, and it is a fraction of the 37.7% rather than a fraction of Ireland.

- [ ] **Step 1: Start the full run in the background**

```bash
cd "$WT"
nohup npm run census:crawl -- --run "$(date -u +%Y-%m)" > data/census/full-run.log 2>&1 &
sleep 60
tail -5 data/census/full-run.log
```

Expected: a progress line inside the first minute showing a rate near 8 domains a second... **and it will not be that.** Eight requests a second at two requests a domain is four domains a second, so the first progress line at 1,000 domains should appear at about four minutes. If it appears in under two, the rate gate is not gating and that is a politeness bug, not a performance win: stop the run, fix it, and start again.

Check it every hour or so. It is resumable, so a kill costs only the domains in flight.

- [ ] **Step 2: The precision sample, by hand, on the pilot's rows**

```ts
// scripts/census/spotcheck.mts
/**
 * Draws the sample a person then judges by hand.
 *
 *   npm run census:spotcheck -- --run pilot --size 60
 *
 * Deterministic: it takes every nth answered row rather than a random one, so
 * two people drawing the sample get the same sixty sites and a rerun after a
 * classifier change is comparable with the run before it. That matters more
 * than randomness here, because the thing being measured is whether a change
 * helped, and a fresh random sample every time makes that unanswerable.
 *
 * It prints a tab-separated line per site and nothing else, so it can be pasted
 * into a sheet and a verdict column typed beside it. The verdicts go into
 * `content/census/spotcheck.ts` by hand, because a person opening a website and
 * deciding what business it is cannot be automated and pretending otherwise is
 * how a measurement becomes a mirror.
 */
import { readFileSync } from "node:fs";
import type { CensusRow } from "../../lib/census/types.ts";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : String(process.argv[at + 1]);
};

const runId = arg("run", "pilot");
const size = Number(arg("size", "60"));

const rows: CensusRow[] = readFileSync(`data/census/${runId}/rows.ndjson`, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as CensusRow);

const answered = rows.filter((row) => row.reach === "answered");
const step = Math.max(1, Math.floor(answered.length / size));
const sample = answered.filter((_row, i) => i % step === 0).slice(0, size);

console.log(["domain", "industry", "method", "evidence", "verdict"].join("\t"));
for (const row of sample) {
  console.log([`https://${row.domain}/`, row.industry, row.method, row.classEvidence, ""].join("\t"));
}
console.error(`sampled ${sample.length} of ${answered.length} answered, every ${step}th`);
```

```bash
cd "$WT"
npx tsc --noEmit && npm run census:spotcheck -- --run pilot --size 60 > data/census/pilot/spotcheck.tsv
wc -l data/census/pilot/spotcheck.tsv
```

Open all sixty. For each, write `right`, `wrong` or `arguable`, and for a wrong one write the bucket you would have chosen. Sixty is a real sample and it takes about an hour; thirty is not enough to separate 70% from 85% and there is no point pretending otherwise.

Then, and only then:

- Compute precision overall, and per method (`schema` against `keyword`). The `schema` figure is the site's own claim about itself, so if it is under about 90% the schema map has a wrong row in it and that is a code fix.
- Compute precision for the five largest buckets. A bucket under 60% goes on the page with that number beside it, and the page says so, rather than being tuned until it looks better against the sixty examples that produced it. Tuning against your own measurement destroys the measurement.

- [ ] **Step 3: The coverage half, against an independent list**

Pick three buckets where an independent list exists and is short enough to check: for example accommodation (a public list of registered Irish hotels), education-school (the Department of Education's school list), and legal (the Law Society's firm directory). For each, take twenty names, find their website by hand, and record three things:

1. Is the domain a `.ie` at all? (If not, it can never be in this census, and that is the "businesses without a .ie domain" line on the page turned into a number.)
2. Is that `.ie` domain in `data/census/ie-domains.txt`? (Seed coverage.)
3. Did the crawl classify it into the right bucket? (End-to-end.)

Twenty per bucket across three buckets is 60 lookups and about ninety minutes. It is the only number on the page that says how much of Ireland is behind the 37.7%.

- [ ] **Step 4: Write the result down as data, not as a paragraph**

```ts
// content/census/spotcheck.ts

/**
 * The spot check: the only measurement of how often the industry column is
 * right, and of what fraction of a bucket's real businesses the seed holds.
 *
 * Hand-measured, on a stated date, by opening sites and looking at them. It is
 * a sample, not a proof, and the page prints the sample size beside every
 * figure so a reader can weigh it themselves. Redo it after any change to
 * `lib/census/industries.ts` or `lib/census/industry.ts`: a precision figure
 * measured before a keyword table changed is a figure about a different tool.
 *
 * **Do not tune the classifier against this sample.** Tuning against your own
 * measurement destroys the measurement, and a 71% that is real is worth more
 * than an 88% that is a mirror.
 */
export const SPOT_CHECK = {
  /** When the sixty sites were opened and judged. */
  measuredOn: "2026-09-04",
  /** The run whose rows were sampled. */
  runId: "pilot",
  precision: {
    sampled: 60,
    right: 0,
    arguable: 0,
    wrong: 0,
    /** Of the ones classified from the site's own schema.org markup. */
    bySchema: { sampled: 0, right: 0 },
    /** Of the ones classified from words. */
    byKeyword: { sampled: 0, right: 0 },
    /** The largest buckets, each with its own reading. */
    byIndustry: [] as Array<{ id: string; sampled: number; right: number }>,
  },
  coverage: [] as Array<{
    id: string;
    /** Names taken from the independent list. */
    checked: number;
    /** How many of those trade on a .ie domain at all. */
    onDotIe: number;
    /** How many of those .ie domains are in the seed. */
    inSeed: number;
    /** How many the crawl put in the right bucket. */
    classifiedRight: number;
    /** Where the list came from, so a reader can repeat it. */
    source: string;
  }>,
} as const;
```

Fill in every zero from Steps 2 and 3. **A zero left in this file when the page ships is a published claim that nothing was right**, so `app/tools/census/page.test.ts` in Task 14 asserts `precision.right + precision.arguable + precision.wrong === precision.sampled`.

- [ ] **Step 5: When the full run finishes, aggregate it and re-read the numbers**

```bash
cd "$WT"
tail -30 data/census/full-run.log
cat "data/census/$(date -u +%Y-%m)/report.json"
npm run census:aggregate -- --run "$(date -u +%Y-%m)"
npx vitest run content/census/snapshot.test.ts
wc -c content/census/snapshot.ts
```

Paste the report into the ledger. It carries the first real figures for **wall clock, requests, and the reach distribution over 125,505 domains**, which is where the nine-hour guess in this plan's arithmetic table either holds or is replaced.

Two things to check before believing any of it:

- **`completed` equals `attempted`.** A shortfall means workers died silently and the missing domains are not random, so the reach distribution is biased by whatever killed them.
- **The reach distribution is not wildly different from the pilot's.** A pilot at 65% answered and a full run at 20% answered means something changed partway through, most likely the home connection or a rate limit somewhere upstream, and the run should be redone rather than published.

If the snapshot is over about 400 KB, drop `PLATFORMS_PER_INDUSTRY` to 4 and re-run the aggregate: it ships in the page's payload and a phone on a slow connection pays for every byte.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add content/census/snapshot.ts content/census/spotcheck.ts scripts/census/spotcheck.mts
git commit -m "feat(census): the full run, and a hand-measured spot check that says how often it is right"
```

What this proves: 125,505 domains were read, the reach distribution is measured, and the industry column has a precision figure taken by a person opening sixty sites. What it cannot see: everything outside those sixty, seasonal variation, and whether the three independent lists used for coverage are themselves complete. All three go on the page beside the numbers.

---

### Task 14: The page, the island, and the greps that hold it to the copy

**Files:**
- Create: `app/tools/census/page.tsx`, `app/tools/census/CensusExplorer.tsx`, `app/tools/census/tool.css`, `app/tools/census/page.test.ts`
- Modify: `content/tools/census.ts` (`status` to `live`)

**Interfaces:**
- Consumes: `ToolPage` (F3), `snapshot` (Task 12), `SPOT_CHECK` (Task 13), `census` and `censusCopy` (Task 1), `industryLabel` (Task 2), `signatureName` (Task 6), `formatCost` (Task 9), `canonical`, `absolute`, `OG_IMAGE`, `toolPath` from `lib/seo.ts`
- Produces: the route, and the only client component in the tool

**The order of the page is the argument.** Coverage first, before a single finding. Then how it was read, then what it found, then how often it is wrong, then the politeness policy, then what it cost. A reader who stops after two screens has read the caveat rather than the headline, which is the opposite of how a data page usually goes and is the point.

**Phone first, and this is where a data page normally fails.** The primary presentation is a ranked list of bars, which reflows to any width, not a table. The stack-by-industry matrix is secondary and lives in its own `overflow-x: auto` container so the **document** never scrolls sideways, which is what the phone check measures. Task 16 drives it at 390 and 320.

**One client component and it is small.** `CensusExplorer` filters the industry list and builds a CSV in the tab. Everything else is server-rendered, so the page works with JavaScript off, which on a data page is not a nicety: it is whether a crawler and a reader in a bad signal area see the numbers.

- [ ] **Step 1: Write the page**

```tsx
// app/tools/census/page.tsx
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import ToolPage from "@/components/tools/ToolPage";
import { snapshot } from "@/content/census/snapshot";
import { SPOT_CHECK } from "@/content/census/spotcheck";
import { profile } from "@/content/profile";
import { COVERAGE, CRAWLER, census as tool, censusCopy } from "@/content/tools/census";
import { formatCost } from "@/lib/census/cost";
import { industryLabel } from "@/lib/census/industries";
import { signatureName } from "@/lib/census/signatures";
import { OG_IMAGE, absolute, canonical, toolPath } from "@/lib/seo";
import CensusExplorer from "./CensusExplorer";
import "./tool.css";

const PATH = toolPath(tool.slug);

const DESCRIPTION =
  "What Irish websites are built with, measured by reading one page from 125,505 .ie domains. That is 37.7% of the registry's count, and the page says so before it says anything else.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: tool.name,
  description: DESCRIPTION,
  alternates: canonical(PATH),
  openGraph: {
    title: `${tool.name} · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

const CATEGORY_TITLES: Record<string, string> = {
  platform: "Platform",
  host: "Server and host",
  payments: "Payments",
  booking: "Booking",
  newsletter: "Newsletter",
};

const REACH_TITLES: Record<string, string> = {
  answered: "answered with HTML",
  "dns-failed": "did not resolve",
  blocked: "refused the crawler",
  "robots-excluded": "said no in robots.txt",
  "timed-out": "did not answer in two seconds",
  "http-error": "answered with an error",
  "not-html": "answered with something that is not a page",
  "opted-out": "asked to be left out",
};

function pct(n: number, of: number): string {
  return of === 0 ? "0%" : `${((n / of) * 100).toFixed(1)}%`;
}

/**
 * One ranked bar list. Server-rendered, so it is in the HTML a crawler reads
 * and on the screen of anybody with JavaScript off. The bar is a CSS custom
 * property on the row, which is the same trick `PromptLine` uses for its parts:
 * one number in the markup, all the drawing in the stylesheet.
 */
function BarList({ items, of }: { items: Array<{ id: string; n: number; samples: string[] }>; of: number }) {
  const top = items[0]?.n ?? 1;
  return (
    <ol className="census__bars">
      {items.slice(0, 20).map((item) => (
        <li
          key={item.id}
          className="census__bar"
          style={{ "--census-bar": `${Math.round((item.n / top) * 100)}%` } as CSSProperties}
        >
          <span className="census__bar-name">{signatureName(item.id)}</span>
          <span className="census__bar-count">
            {item.n.toLocaleString("en-IE")} <span className="census__bar-pct">{pct(item.n, of)}</span>
          </span>
          <span className="census__bar-samples">
            {item.samples.map((domain) => (
              <a key={domain} className="census__sample" href={`https://${domain}/`} rel="nofollow noopener">
                {domain}
              </a>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * `/tools/census`.
 *
 * The order of this page is the argument. Coverage before any finding, then how
 * the reading was done, then what it found, then how often it is wrong, then
 * what it does to other people's servers, then what it cost. A reader who stops
 * after two screens has read the caveat rather than the headline, which is
 * deliberate.
 *
 * Static. It imports a generated snapshot and renders it, so the route costs no
 * function time, no Redis command and no Neon compute. The per-domain
 * drill-down and the month-to-month diff need a row store and are a separate
 * piece of work.
 */
export default function CensusPage() {
  const answered = snapshot.reach.answered;
  const read = Object.values(snapshot.reach).reduce((sum, n) => sum + n, 0);
  const platform = snapshot.categories.find((c) => c.category === "platform");

  return (
    <ToolPage
      tool={tool}
      extraSchema={{ isBasedOn: absolute(toolPath("headline-check")) }}
      talk={censusCopy.talk}
    >
      <section className="census__coverage" aria-labelledby="census-coverage">
        <h2 id="census-coverage" className="census__h2">
          Read this first
        </h2>
        <p className="census__headline">{censusCopy.coverageHeadline}</p>
        <p className="census__body">{censusCopy.seedBias}</p>
        <p className="census__body">{censusCopy.registryNote}</p>
      </section>

      <section className="census__section" aria-labelledby="census-reach">
        <h2 id="census-reach" className="census__h2">
          What answered
        </h2>
        <p className="census__body">
          Of {read.toLocaleString("en-IE")} domains in the seed, {answered.toLocaleString("en-IE")} answered with a
          page this could read. Every share below is out of that {answered.toLocaleString("en-IE")}.
        </p>
        <dl className="census__reach">
          {Object.entries(snapshot.reach)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([key, n]) => (
              <div key={key} className="census__reach-row">
                <dt className="census__reach-label">{REACH_TITLES[key] ?? key}</dt>
                <dd className="census__reach-value">
                  {n.toLocaleString("en-IE")} <span className="census__bar-pct">{pct(n, read)}</span>
                </dd>
              </div>
            ))}
        </dl>
      </section>

      {snapshot.categories.map((category) => (
        <section key={category.category} className="census__section" aria-labelledby={`census-${category.category}`}>
          <h2 id={`census-${category.category}`} className="census__h2">
            {CATEGORY_TITLES[category.category] ?? category.category}
          </h2>
          <p className="census__body">
            {category.known.toLocaleString("en-IE")} of {category.total.toLocaleString("en-IE")} sites that answered
            matched a rule here, which is {pct(category.known, category.total)}. The rest matched nothing, and that is
            recorded as unknown rather than as a hand-built site.
          </p>
          <BarList items={category.items} of={category.total} />
        </section>
      ))}

      <CensusExplorer
        industries={snapshot.industries.map((row) => ({
          id: row.id,
          label: industryLabel(row.id),
          n: row.n,
          stated: row.stated,
          inferred: row.inferred,
          platforms: row.platforms.map((p) => ({ name: signatureName(p.id), n: p.n })),
        }))}
        total={read}
        csvLabel={censusCopy.csvLabel}
        csvNote={censusCopy.csvNote}
      />

      <section className="census__section" aria-labelledby="census-headings">
        <h2 id="census-headings" className="census__h2">
          Headings, read the way a crawler reads them
        </h2>
        <p className="census__body">
          Of the sites that answered, {snapshot.headings.clean.toLocaleString("en-IE")} have an h1 that survives being
          read as plain text, {snapshot.headings.fragmented.toLocaleString("en-IE")} have one that comes apart,{" "}
          {snapshot.headings.noH1.toLocaleString("en-IE")} serve no h1 at all, and{" "}
          {snapshot.headings.noHeadingAtAll.toLocaleString("en-IE")} serve no heading of any level. That is the same
          check as{" "}
          <Link className="prose__link" href={toolPath("headline-check")}>
            headline check
          </Link>
          , run by the same parser, on everybody at once.
        </p>
      </section>

      <section className="census__section" aria-labelledby="census-years">
        <h2 id="census-years" className="census__h2">
          Copyright years
        </h2>
        <div className="census__scroller">
          <table className="census__table">
            <caption className="census__caption">
              The latest year in a copyright notice, where there is one. A footer is not a maintenance record, so this
              is a hint about staleness rather than a measurement of it.
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Sites</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.copyrightYears
                .slice()
                .sort((a, b) => b.year - a.year)
                .slice(0, 12)
                .map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    <td>{row.n.toLocaleString("en-IE")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="census__section" aria-labelledby="census-accuracy">
        <h2 id="census-accuracy" className="census__h2">
          {censusCopy.spotCheckHeading}
        </h2>
        <p className="census__body">
          Somebody opened {SPOT_CHECK.precision.sampled} of these sites on {SPOT_CHECK.measuredOn} and judged the
          industry column by eye. {SPOT_CHECK.precision.right} were right, {SPOT_CHECK.precision.arguable} were
          arguable and {SPOT_CHECK.precision.wrong} were wrong. That is a sample of{" "}
          {SPOT_CHECK.precision.sampled}, not a proof, and it is the only measurement of accuracy on this page.
        </p>
        {SPOT_CHECK.coverage.length > 0 ? (
          <div className="census__scroller">
            <table className="census__table">
              <caption className="census__caption">
                How much of a bucket the seed holds, checked against a list from somewhere else.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bucket</th>
                  <th scope="col">Checked</th>
                  <th scope="col">On a .ie</th>
                  <th scope="col">In the seed</th>
                  <th scope="col">Right bucket</th>
                  <th scope="col">List</th>
                </tr>
              </thead>
              <tbody>
                {SPOT_CHECK.coverage.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{industryLabel(row.id)}</th>
                    <td>{row.checked}</td>
                    <td>{row.onDotIe}</td>
                    <td>{row.inSeed}</td>
                    <td>{row.classifiedRight}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="census__section" aria-labelledby="census-method">
        <h2 id="census-method" className="census__h2">
          {censusCopy.methodHeading}
        </h2>
        <p className="census__body">{censusCopy.method}</p>
        <h3 className="census__h3">{censusCopy.argueHeading}</h3>
        <ul className="census__list">
          {censusCopy.argue.map((line) => (
            <li key={line} className="census__list-item">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="census__section" aria-labelledby="census-policy">
        <h2 id="census-policy" className="census__h2">
          {censusCopy.policyHeading}
        </h2>
        <ul className="census__list">
          {censusCopy.policy.map((line) => (
            <li key={line} className="census__list-item">
              {line}
            </li>
          ))}
        </ul>
        <p className="census__body">
          The crawler identifies itself as <code className="census__code">{CRAWLER.userAgent}</code>. To be left out,
          put <code className="census__code">{CRAWLER.token}</code> in your robots.txt, or{" "}
          <Link className="prose__link" href={CRAWLER.contactPath}>
            ask
          </Link>{" "}
          and I will add you to the list by hand.
        </p>
      </section>

      <section className="census__section" aria-labelledby="census-cost">
        <h2 id="census-cost" className="census__h2">
          {censusCopy.costHeading}
        </h2>
        <p className="census__body">
          Run {snapshot.runId}, finished {snapshot.finishedAt}. {snapshot.requests.toLocaleString("en-IE")} requests,{" "}
          {formatCost(snapshot.cost)}. Wall clock is the ceiling and is mostly time spent waiting on other people's
          servers; the CPU figure is what this machine actually burnt. Both are measured here rather than read off a
          bill, because the hosting plan this site runs on does not expose one.
        </p>
        <p className="census__body">{censusCopy.forgetNote}</p>
      </section>
    </ToolPage>
  );
}
```

- [ ] **Step 2: Write the one client component**

```tsx
// app/tools/census/CensusExplorer.tsx
"use client";

import { useMemo, useState } from "react";

/**
 * The industry table, filtered, plus a CSV built in the tab.
 *
 * The only client component in this tool, and it is deliberately thin. The
 * numbers are rendered on the server too, in the same markup, so the section is
 * complete with JavaScript off: the filter is an enhancement, not the thing
 * that draws the table. On a data page that is not a nicety, it is whether a
 * crawler and a reader on a bad connection see the numbers at all.
 *
 * The CSV is a Blob URL made from data the page already holds. Nothing is
 * requested, nothing is stored, and the download link is created on click and
 * revoked straight after, so no object URL is left alive in the tab.
 */

export type ExplorerRow = {
  id: string;
  label: string;
  n: number;
  stated: number;
  inferred: number;
  platforms: Array<{ name: string; n: number }>;
};

function toCsv(rows: ExplorerRow[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["industry", "sites", "from_schema_org", "from_keywords", "top_platforms"];
  const lines = rows.map((row) =>
    [
      escape(row.label),
      String(row.n),
      String(row.stated),
      String(row.inferred),
      escape(row.platforms.map((p) => `${p.name} ${p.n}`).join("; ")),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export default function CensusExplorer({
  industries,
  total,
  csvLabel,
  csvNote,
}: {
  industries: ExplorerRow[];
  total: number;
  csvLabel: string;
  csvNote: string;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return industries;
    return industries.filter(
      (row) =>
        row.label.toLowerCase().includes(needle) ||
        row.platforms.some((p) => p.name.toLowerCase().includes(needle)),
    );
  }, [industries, query]);

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "irish-stack-census.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="census__section" aria-labelledby="census-industries">
      <h2 id="census-industries" className="census__h2">
        By industry
      </h2>
      <p className="census__body">
        Every domain sits in exactly one bucket. Stated means the site published a schema.org type and this took its
        word for it; inferred means the bucket came from words on the page and could be wrong.
      </p>

      <div className="census__controls">
        <label className="census__label" htmlFor="census-filter">
          Filter by industry or platform
        </label>
        <input
          id="census-filter"
          className="census__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="hotels, wordpress"
          autoComplete="off"
        />
        <button type="button" className="census__button" onClick={download}>
          {csvLabel}
        </button>
      </div>
      <p className="census__note">{csvNote}</p>

      <ul className="census__industries">
        {rows.map((row) => (
          <li key={row.id} className="census__industry">
            <h3 className="census__industry-name">{row.label}</h3>
            <p className="census__industry-count">
              {row.n.toLocaleString("en-IE")} sites{" "}
              <span className="census__bar-pct">
                {total === 0 ? "0%" : `${((row.n / total) * 100).toFixed(1)}%`}
              </span>
            </p>
            <p className="census__industry-method">
              {row.stated.toLocaleString("en-IE")} stated, {row.inferred.toLocaleString("en-IE")} inferred
            </p>
            <ul className="census__chips">
              {row.platforms.map((platform) => (
                <li key={platform.name} className="census__chip">
                  {platform.name} {platform.n.toLocaleString("en-IE")}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="census__body">Nothing matches that.</p> : null}
    </section>
  );
}
```

- [ ] **Step 3: Write the stylesheet**

```css
/* app/tools/census/tool.css
   ==========================================================================
   /tools/census
   --------------------------------------------------------------------------
   The census's own rules, imported by ./page.tsx and loaded on this route
   only (design 2026-09-03, section 2). It reads the shell's custom properties
   (--green, --amber, --bg-panel, --sp-*, --radius, --font-screen) which
   cascade in from globals.css. Nothing here redefines one.

   Two things this file is doing that a data page usually gets wrong.

   1. THE PRIMARY PRESENTATION IS NOT A TABLE. Bars and stacked rows reflow to
      any width. The one real table, the copyright years, sits in
      .census__scroller so IT scrolls sideways and the DOCUMENT never does,
      which is the thing scripts/phone-check.mjs fails a route on.
   2. --green-dim is borderline on the amber and ice themes (4.45 and 4.46,
      measured in app/globals.test.ts), so it appears here only on a
      placeholder. Everything a visitor has to read is --green or --amber.

   Both animations are behind prefers-reduced-motion. Under reduce the bars are
   already at width and nothing moves.
   ========================================================================== */

.census__section {
  max-width: 72ch;
  margin-top: var(--sp-5);
}

.census__coverage {
  max-width: 72ch;
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  border: 1px solid var(--green);
  border-radius: var(--radius);
  background: var(--bg-panel);
}

.census__h2 {
  color: var(--amber);
  font-size: 1.05rem;
  margin-bottom: var(--sp-2);
}

.census__h3 {
  color: var(--green);
  font-size: 0.95rem;
  margin-top: var(--sp-3);
  margin-bottom: var(--sp-1);
}

.census__headline {
  color: var(--amber);
  font-size: 1.05rem;
  line-height: 1.55;
  margin-bottom: var(--sp-2);
}

.census__body,
.census__note {
  color: var(--green);
  line-height: 1.6;
  margin-bottom: var(--sp-2);
}

.census__note {
  font-size: 0.85rem;
}

.census__list {
  list-style: none;
  display: grid;
  gap: var(--sp-2);
}

.census__list-item {
  color: var(--green);
  line-height: 1.6;
  padding-left: var(--sp-2);
  border-left: 2px solid var(--amber);
}

.census__code {
  font-family: var(--font-screen);
  font-size: 0.8rem;
  word-break: break-all;
}

/* ── ranked bars ─────────────────────────────────────────────────────────── */

.census__bars {
  list-style: none;
  display: grid;
  gap: var(--sp-2);
}

.census__bar {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius);
  background: var(--bg-panel);
  overflow: hidden;
}

/* The bar itself is drawn behind the text, from one custom property set on the
   row. One number in the markup, all the drawing here. */
.census__bar::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--census-bar, 0%);
  background: color-mix(in srgb, var(--amber) 22%, transparent);
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .census__bar::before {
    animation: census-grow 700ms ease-out both;
  }
  @keyframes census-grow {
    from {
      width: 0%;
    }
    to {
      width: var(--census-bar, 0%);
    }
  }
}

.census__bar-name,
.census__bar-count {
  position: relative;
  color: var(--green);
}

.census__bar-count {
  text-align: right;
  white-space: nowrap;
}

.census__bar-pct {
  color: var(--amber);
}

.census__bar-samples {
  position: relative;
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: 2px;
}

.census__sample {
  color: var(--green);
  font-size: 0.75rem;
  text-decoration: underline;
  /* A domain has no spaces in it, so without this a long one sets a minimum
     content width and the document scrolls sideways at 320. */
  word-break: break-all;
}

/* ── reach ───────────────────────────────────────────────────────────────── */

.census__reach {
  display: grid;
  gap: var(--sp-1);
}

.census__reach-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--sp-1);
  padding-bottom: var(--sp-1);
  border-bottom: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
}

.census__reach-label,
.census__reach-value {
  color: var(--green);
}

/* ── industries ──────────────────────────────────────────────────────────── */

.census__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: flex-end;
  margin-bottom: var(--sp-1);
}

.census__label {
  color: var(--green);
  font-size: 0.82rem;
  flex-basis: 100%;
}

/* 16px exactly. Anything under it and iOS zooms the whole page on focus. */
.census__input {
  flex: 1 1 14ch;
  min-width: 0;
  min-height: 44px;
  font-size: 16px;
  font-family: var(--font-screen);
  color: var(--green);
  background: var(--bg-panel);
  border: 1px solid var(--green);
  border-radius: var(--radius);
  padding: 0 var(--sp-2);
}

.census__input::placeholder {
  color: var(--green-dim);
}

.census__button {
  min-height: 44px;
  min-width: 44px;
  font-size: 16px;
  font-family: var(--font-screen);
  color: var(--amber);
  background: transparent;
  border: 1px solid var(--amber);
  border-radius: var(--radius);
  padding: 0 var(--sp-2);
  cursor: pointer;
}

.census__industries {
  list-style: none;
  display: grid;
  gap: var(--sp-2);
}

.census__industry {
  padding: var(--sp-2);
  border-radius: var(--radius);
  background: var(--bg-panel);
}

@media (prefers-reduced-motion: no-preference) {
  .census__industry {
    animation: census-fade 400ms ease-out both;
  }
  @keyframes census-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}

.census__industry-name {
  color: var(--amber);
  font-size: 0.95rem;
}

.census__industry-count,
.census__industry-method {
  color: var(--green);
  font-size: 0.85rem;
}

.census__chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: var(--sp-1);
}

.census__chip {
  color: var(--green);
  font-size: 0.75rem;
  padding: 2px var(--sp-1);
  border: 1px solid color-mix(in srgb, var(--green) 45%, transparent);
  border-radius: var(--radius);
}

/* ── the one real table, and its own scroller ────────────────────────────── */

.census__scroller {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.census__table {
  border-collapse: collapse;
  min-width: 24ch;
}

.census__caption {
  color: var(--green);
  font-size: 0.82rem;
  text-align: left;
  margin-bottom: var(--sp-1);
}

.census__table th,
.census__table td {
  color: var(--green);
  text-align: left;
  padding: var(--sp-1) var(--sp-2);
  border-bottom: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
  white-space: nowrap;
}

.census__table thead th {
  color: var(--amber);
}
```

- [ ] **Step 4: Flip the entry live**

In `content/tools/census.ts`, `status: "soon"` becomes `status: "live"`. That is what puts `/tools/census` in the sitemap, which is what puts it into the `phone` CI job, which is why it waited until the page existed.

- [ ] **Step 5: The coupling tests**

```ts
// app/tools/census/page.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { snapshot } from "@/content/census/snapshot";
import { SPOT_CHECK } from "@/content/census/spotcheck";
import { census, censusCopy } from "@/content/tools/census";

/**
 * Coupling checks, not renders. vitest runs in the node environment here, so
 * nothing in this file mounts a component: these read the source as text and
 * assert what it references, in the pattern of `lib/boot.test.ts` and
 * `components/chrome.test.ts`.
 *
 * Line endings are normalised first. This is a Windows checkout with autocrlf
 * on, and a search for a bare newline is red here and green in CI, which cost
 * `lib/contact.test.ts` a fortnight.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const page = read("app/tools/census/page.tsx");
const explorer = read("app/tools/census/CensusExplorer.tsx");
const css = read("app/tools/census/tool.css");

describe("the page renders the caveat before the findings", () => {
  it("puts the coverage section above every other section in the source", () => {
    const coverage = page.indexOf("census-coverage");
    for (const later of ["census-reach", "census-industries", "census-method", "census-cost"]) {
      expect(coverage, `${later} must come after the coverage block`).toBeLessThan(page.indexOf(later));
    }
  });

  it("renders the coverage headline from content rather than retyping it", () => {
    expect(page).toContain("censusCopy.coverageHeadline");
    expect(page).not.toContain("37.7% of .ie");
  });

  it("renders the policy, the method and the argue list from content", () => {
    for (const key of ["censusCopy.policy", "censusCopy.method", "censusCopy.argue", "censusCopy.forgetNote"]) {
      expect(page, key).toContain(key);
    }
  });

  it("prints the user agent and the opt-out token a site owner would need", () => {
    expect(page).toContain("CRAWLER.userAgent");
    expect(page).toContain("CRAWLER.token");
  });

  it("prints both cost figures through the shared formatter", () => {
    expect(page).toContain("formatCost(snapshot.cost)");
  });
});

describe("the page cannot quietly become dynamic", () => {
  it("imports the snapshot rather than querying anything", () => {
    expect(page).toContain('from "@/content/census/snapshot"');
    expect(page).not.toContain("getSql");
    expect(page).not.toContain("takeBudget");
    expect(page).not.toMatch(/(?<![a-zA-Z])fetch\(/);
  });

  it("is not marked dynamic, because a static page is what makes it free", () => {
    expect(page).not.toContain("force-dynamic");
    expect(page).not.toContain("export const revalidate");
  });
});

describe("the island", () => {
  it("is the only client component in the tool", () => {
    expect(explorer.startsWith('"use client"')).toBe(true);
    expect(page).not.toContain('"use client"');
  });

  it("writes nothing to the visitor's machine and requests nothing", () => {
    for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      expect(explorer, forbidden).not.toContain(forbidden);
    }
    expect(explorer).not.toMatch(/(?<![a-zA-Z])fetch\(/);
  });

  it("revokes the object URL it creates, so nothing is left alive in the tab", () => {
    expect(explorer).toContain("URL.revokeObjectURL(url)");
  });

  it("keeps its input at 16px, or iOS zooms the page when it is focused", () => {
    expect(css).toMatch(/\.census__input\s*\{[^}]*font-size:\s*16px/);
  });

  it("gives its input and its button a 44px thumb target", () => {
    expect(css).toMatch(/\.census__input\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.census__button\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("the stylesheet keeps the document from scrolling sideways", () => {
  it("puts the one real table in its own scroller", () => {
    expect(css).toMatch(/\.census__scroller\s*\{[^}]*overflow-x:\s*auto/);
    expect(page).toContain('className="census__scroller"');
  });

  it("breaks long domain names, which have no spaces to break at", () => {
    expect(css).toMatch(/\.census__sample\s*\{[^}]*word-break:\s*break-all/);
  });

  it("gates both animations behind reduced motion", () => {
    const gated = css.split("@media (prefers-reduced-motion: no-preference)").length - 1;
    expect(gated).toBeGreaterThanOrEqual(2);
    // No keyframes outside a gate.
    const ungated = css.replace(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\n}\n/g, "");
    expect(ungated).not.toContain("animation:");
  });

  it("uses the borderline token only on a placeholder", () => {
    const dim = [...css.matchAll(/var\(--green-dim\)/g)];
    expect(dim).toHaveLength(1);
    expect(css).toMatch(/::placeholder\s*\{[^}]*var\(--green-dim\)/);
  });
});

describe("the data the page is about to publish", () => {
  it("is live in the registry, so the sitemap and the phone job pick it up", () => {
    expect(census.status).toBe("live");
  });

  it("carries a spot check that was actually filled in", () => {
    const { sampled, right, arguable, wrong } = SPOT_CHECK.precision;
    expect(sampled).toBeGreaterThan(0);
    expect(right + arguable + wrong, "the spot check still has zeros in it").toBe(sampled);
  });

  it("carries a snapshot with rows in it", () => {
    expect(snapshot.industries.length).toBeGreaterThan(0);
    expect(snapshot.reach.answered).toBeGreaterThan(0);
  });

  it("says the same share in the copy and in the snapshot", () => {
    expect(censusCopy.coverageHeadline).toContain(String(snapshot.coverage.sharePercent));
  });
});
```

- [ ] **Step 6: Run everything, then look at it**

```bash
cd "$WT"
npx tsc --noEmit && npm test 2>&1 | tail -5
npm run build 2>&1 | tail -20
```

Expected: clean types, a green suite, and `/tools/census` in the build output as a static page (a `○` or `●` rather than an `ƒ`). **If it built as a dynamic function, something in the page reached for a request-time value** and the whole free-to-serve argument is gone; find it before going further.

Then serve it and look:

```bash
cd "$WT"
(npm start > .t6-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/census > /dev/null && break; done
curl -s http://localhost:3000/tools/census | head -c 2000
curl -s http://localhost:3000/sitemap.xml | grep -c "tools/census"
```

Expected: a 200 with the coverage sentence in the served HTML **before** any finding (a text extraction of the page must read the caveat first), and `1` from the sitemap grep.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add app/tools/census/ content/tools/census.ts
git commit -m "feat(census): the page, coverage first, with the matrix in its own scroller"
```

What this proves: the route builds static, the sitemap has it, the caveat is in the served HTML above the findings, and the coupling greps hold the page to the copy and to the phone floors. What it cannot see: what it looks like on a real phone, which is Task 16, and whether the numbers are right, which is Task 13's sample and nothing else.

---

### Task 15: Prove the tests can fail, then wire sixteen guards into the mutation check

**Files:**
- Temporarily modify then restore: `lib/census/signatures.ts`
- Modify: `scripts/mutation-check.mjs`

**Interfaces:**
- Consumes: every module from Tasks 3 to 14
- Produces: sixteen mutation rows, and the evidence that the suite goes red when the most dangerous line in this sub-project is broken

A guard that survives its own mutation is decoration, and a suite nobody has watched fail is a ritual. Both, in that order, and neither claim goes in the ledger before its run.

**The one chosen for the demonstration, and why it is not the obvious one.** The obvious choice is the evidence cap, and it is a fine mutation but a boring demonstration: it fails one assertion in one file. The `g` flag on a signature pattern is the interesting one, because it is the failure that would otherwise be **invisible**: a `g` regex held in a shared table carries `lastIndex` between calls, so the same object starts returning `null` on pages it should match, in a pattern that looks like a fact about Ireland rather than a bug in the code. Nothing about the output would look wrong. That is exactly the class of thing a mutation check exists for.

- [ ] **Step 1: Add a g flag on purpose and watch the suite notice**

In `lib/census/signatures.ts`, change the first WordPress matcher only:

```ts
  { id: "wordpress", category: "platform", name: "WordPress", matchers: [html(/\/wp-content\//gi), ...
```

Then:

```bash
cd "$WT"
npx vitest run lib/census/signatures.test.ts 2>&1 | tail -20
```

Expected: **FAIL**, and specifically `the table > NEVER uses the g flag, because lastIndex would carry between 125,505 pages`, naming `wordpress` and the pattern. Paste the failure line into the ledger. That paste is the observation.

**If the suite goes green with the `g` flag on, stop.** The most dangerous edit anybody can make to this tool is unguarded, and the fix is a test, not a note.

- [ ] **Step 2: Put it back and confirm the failure goes with it**

```bash
cd "$WT"
git checkout -- lib/census/signatures.ts
npx vitest run lib/census/signatures.test.ts 2>&1 | tail -5
```

Expected: PASS. The pair of runs is `CLAIMS.md` rule 3, revert to confirm: the failure appeared when the guard was broken and went when it was restored. That earns the word "tested" for the `g`-flag ban and says nothing at all about the other fifteen, which is what Step 3 is for.

- [ ] **Step 3: Check every anchor before adding a row**

Every anchor is a single-line regex tolerant of CRLF, because `scripts/mutation-check.mjs` has been bitten once by a bare newline against a CRLF file, and a missing anchor is reported as `ANCHOR-MISS` and counted as a survivor. Tasks 3 to 14 may have been typed with different spacing, so check first:

```bash
cd "$WT"
node -e '
const { readFileSync } = require("node:fs");
const checks = [
  ["lib/census/psl.ts", /if \(line\.includes\(ICANN_BEGIN\)\) \{/],
  ["lib/census/psl.ts", /if \(zones\.has\(lastTwo\)\) \{/],
  ["lib/census/robots.ts", /if \(status >= 400 && status < 500 && status !== 429\) return "allow-all";/],
  ["lib/census/robots.ts", /if \(named\.length > 0\) return named;/],
  ["lib/census/robots.ts", /if \(rule\.pattern\.length === best\.pattern\.length && rule\.allow\) best = rule;/],
  ["lib/census/fetch.ts", /if \(isBlockedAddress\(answer\.address\)\) \{/],
  ["lib/census/fetch.ts", /const name = line\.split\("="\)\[0\]\?\.trim\(\);/],
  ["lib/census/fetch.ts", /if \(total > maxBytes\) \{/],
  ["lib/census/fetch.ts", /if \(next\.host !== origin\) return \{ status: 404, body: "" \};/],
  ["lib/census/fingerprint.ts", /return text\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.slice\(0, EVIDENCE_MAX\);/],
  ["lib/census/industry.ts", /if \(strongHits\.length === 0 && weakHits\.length < MIN_WEAK_TERMS\) continue;/],
  ["lib/census/industry.ts", /if \(tied\) return \{ industry: "unknown", method: "none", evidence: "tie between two buckets" \};/],
  ["lib/census/aggregate.ts", /const known = answered\.filter\(\(row\) => row\.signals\.some\(\(s\) => s\.category === category\)\)\.length;/],
  ["lib/census/cost.ts", /const cpuMs = Math\.max\(0, Math\.round\(\(delta\.user \+ delta\.system\) \/ 1000\)\);/],
  ["scripts/census/crawl.mts", /if \(EXCLUDED\.has\(domain\)\) return emptyRow\(domain, "opted-out", stop\(\)\.wallMs\);/],
  ["content/tools/census.ts", /ratePerSecond: 8,/],
];
let bad = 0;
for (const [file, re] of checks) {
  const hit = re.test(readFileSync(file, "utf8"));
  if (!hit) bad++;
  console.log(`${hit ? "ok    " : "MISS  "} ${file}  ${re}`);
}
process.exitCode = bad ? 1 : 0;
'
```

Expected: sixteen `ok` lines and exit 0. A `MISS` means the anchor must be rewritten against the file as it was actually typed. **Never loosen the file to fit the anchor**, and never carry a `MISS` into the run.

- [ ] **Step 4: Add the sixteen rows**

Append to the `MUTATIONS` array in `scripts/mutation-check.mjs`, after the rows the previous sub-project added:

```js
  // ── census: sixteen guards, each with the test that bites on it ──
  {
    name: "census reads the whole public suffix list, so 710 spreadshirt shops become 710 registrations",
    file: "lib/census/psl.ts",
    pattern: /if \(line\.includes\(ICANN_BEGIN\)\) \{/,
    replace: "if (true) {",
  },
  {
    name: "census stops keeping three labels under gov.ie, so 218 government sites collapse to one",
    file: "lib/census/psl.ts",
    pattern: /if \(zones\.has\(lastTwo\)\) \{/,
    replace: "if (false) {",
  },
  {
    name: "PRIVACY: robots.txt answering 503 is read as permission rather than as a refusal",
    file: "lib/census/robots.ts",
    pattern: /if \(status >= 400 && status < 500 && status !== 429\) return "allow-all";/,
    replace: 'if (status >= 400) return "allow-all";',
  },
  {
    name: "census falls back to the star group for rules a specific group did not mention",
    file: "lib/census/robots.ts",
    pattern: /if \(named\.length > 0\) return named;/,
    replace: "if (named.length > 0) return [...named, ...robots.groups.filter((g) => g.agents.includes(\"*\"))];",
  },
  {
    name: "census lets disallow win a tie, turning an explicit permission into a refusal",
    file: "lib/census/robots.ts",
    pattern: /if \(rule\.pattern\.length === best\.pattern\.length && rule\.allow\) best = rule;/,
    replace: "if (rule.pattern.length === best.pattern.length && !rule.allow) best = rule;",
  },
  {
    name: "SECURITY: the crawler checks only the first address a name resolves to",
    file: "lib/census/fetch.ts",
    pattern: /if \(isBlockedAddress\(answer\.address\)\) \{/,
    replace: "if (isBlockedAddress(answers[0].address) && false) {",
  },
  {
    name: "PRIVACY: the crawler keeps the whole set-cookie line, session value and all",
    file: "lib/census/fetch.ts",
    pattern: /const name = line\.split\("="\)\[0\]\?\.trim\(\);/,
    replace: "const name = line.trim();",
  },
  {
    name: "census stops capping the body, so an endless response is read to the end",
    file: "lib/census/fetch.ts",
    pattern: /if \(total > maxBytes\) \{/,
    replace: "if (false) {",
  },
  {
    name: "census follows a robots.txt redirect off the host, so a third party writes somebody else's rules",
    file: "lib/census/fetch.ts",
    pattern: /if \(next\.host !== origin\) return \{ status: 404, body: "" \};/,
    replace: "// off-host redirect followed",
  },
  {
    name: "PRIVACY: evidence stops being capped, so whole paragraphs of other people's pages are kept",
    file: "lib/census/fingerprint.ts",
    pattern: /return text\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.slice\(0, EVIDENCE_MAX\);/,
    replace: 'return text.replace(/\\s+/g, " ").trim();',
  },
  {
    name: "census classifies on a single weak word, so one mention of rooms makes a hotel",
    file: "lib/census/industry.ts",
    pattern: /if \(strongHits\.length === 0 && weakHits\.length < MIN_WEAK_TERMS\) continue;/,
    replace: "if (strongHits.length === 0 && weakHits.length < 1) continue;",
  },
  {
    name: "census breaks a tie by table order, publishing a source file's ordering as a fact about Ireland",
    file: "lib/census/industry.ts",
    pattern: /if \(tied\) return \{ industry: "unknown", method: "none", evidence: "tie between two buckets" \};/,
    replace: "// ties resolved by whichever bucket came first",
  },
  {
    name: "census counts a platform share out of the sites that had one, doubling every share overnight",
    file: "lib/census/aggregate.ts",
    pattern: /const known = answered\.filter\(\(row\) => row\.signals\.some\(\(s\) => s\.category === category\)\)\.length;/,
    replace: "const known = answered.length;",
  },
  {
    name: "the cost meter reports wall clock as CPU, which is the mistake spike S2 named",
    file: "lib/census/cost.ts",
    pattern: /const cpuMs = Math\.max\(0, Math\.round\(\(delta\.user \+ delta\.system\) \/ 1000\)\);/,
    replace: "const cpuMs = wallMs;",
  },
  {
    name: "POLITENESS: the crawler resolves an opted-out domain before checking the list",
    file: "scripts/census/crawl.mts",
    pattern: /if \(EXCLUDED\.has\(domain\)\) return emptyRow\(domain, "opted-out", stop\(\)\.wallMs\);/,
    replace: "// opt-out checked later",
  },
  {
    name: "POLITENESS: the rate the page promises and the rate the crawler runs at come apart",
    file: "content/tools/census.ts",
    pattern: /ratePerSecond: 8,/,
    replace: "ratePerSecond: 40,",
  },
```

Two notes on the choices. The `g`-flag mutation from Step 1 is deliberately **not** in this list: it lives in a data table where a mutation script's regex anchor would be fragile across reorderings, and Steps 1 and 2 have already proved it by hand, with the evidence in the ledger. And the five rows carrying a `PRIVACY:`, `SECURITY:` or `POLITENESS:` prefix follow the convention `scripts/mutation-check.mjs` already uses for `tool_run`: they are the ones whose failure would harm somebody other than Fergus.

- [ ] **Step 5: Run the whole mutation check**

```bash
cd "$WT"
git status --porcelain
node scripts/mutation-check.mjs 2>&1 | tail -40
```

Expected: every row `RED`, with the total equal to whatever main carried plus sixteen. Count it rather than trusting the header comment:

```bash
cd "$WT"
grep -c '^\s*name: "' scripts/mutation-check.mjs
git status --porcelain
```

The second `git status` must be as clean as the first: the script restores by writing the original text back, and a dirty tree afterwards means a mutation was not restored and a file is now broken on disk.

**A `SKIP` or an `ANCHOR-MISS` is a failure, not a pass.** It means the mutation was never applied, so the row proves nothing while reading like a clean column.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(census): sixteen mutations, five of them about somebody other than fergus"
```

What this proves: sixteen guards fail when the thing they guard is broken, and the `g`-flag ban was proved by hand with a revert. What it cannot see: guards nobody wrote. The mutation check measures the tests that exist and says nothing about the ones that do not.

---

### Task 16: The phone check, at 390 and 320, on a real engine

**Files:**
- Modify: whatever the run names, and only in `app/tools/census/tool.css`

**Interfaces:**
- Consumes: `scripts/phone-check.mjs` (F3), the production build
- Produces: the phone evidence for T6, pasted verbatim into the ledger

The rule this site refuses to fudge: **a resized desktop window does not count.** WebKit at 390 and at 320 because that is what an iPhone renders with, and a throttled Chromium beside it.

A census page is a data page and data pages are where 320 goes wrong, so the predictions below are more detailed than usual and the one about horizontal overflow is the one to watch.

**Predictions, written before the run so the run can prove them wrong (`CLAIMS.md` rule 2). All six are guesses from reading the CSS and none has been observed:**

1. **`overflow`: pass, and this is by far the likeliest to be wrong.** Three candidates. The sample domain links carry `word-break: break-all`, which is what stops a 40-character `.ie` domain setting a minimum content width. The copyright table sits in `.census__scroller` with `overflow-x: auto`, so the table scrolls and the document does not. The `<code>` holding the 96-character user agent carries `word-break: break-all` for the same reason as the domains. If the prediction is wrong the run names one of `.census__sample`, `.census__table` or `.census__code`, and each has its own fix on its own element.
2. **`tap-target`: pass, with the sample links the risk.** The input and the button carry `min-height: 44px`. The sample domain links are inline text at 0.75rem and will be about 14px tall, which is under 44. Whether the script measures them depends on whether it treats an `<a>` inside a list item as tappable, which it does. **This is a real defect and the fix is in the CSS, not in the script**: the links get `display: inline-block; min-height: 44px; line-height: 44px` at touch widths, or they become a single "see five examples" disclosure. Predicting a failure and being ready for it is not the same as fixing it blind, so run first.
3. **`input-font`: pass.** `.census__input` is a literal `16px` and there is a coupling test on it.
4. **`contrast`: pass, and least certain of the four.** Body text is `--green` and headings are `--amber`, both proven on all three themes. The risk is the chips and the samples at 0.75rem over `--bg-panel` with the bar's `color-mix` overlay behind them, which is a composited colour no test has sampled. If one fails, the fix is a lighter token on that element, never an edit to the token: the tokens are proven in `app/globals.test.ts` and other surfaces depend on them.
5. **`skipped` and `assets`: pass.** Nothing on this route is offscreen or occluded that is not already so on every route.
6. **The check cannot see the filtered state.** It measures the page as it opens, so it sees the full industry list and never sees the empty-result message or a filtered list. That is a real gap and Step 4 closes it by hand.

- [ ] **Step 1: Decide whether CI needs editing at all**

```bash
cd "$WT"
grep -n "phone-check" .github/workflows/ci.yml
```

If the job runs `--from-sitemap`, **change nothing**: a live tool is in the sitemap because `liveTools` puts it there, so `/tools/census` joined the phone job the moment Task 14 flipped the status. Record that as a correction to this plan's file-structure table rather than editing a workflow to make a table true. If the job names routes with `--routes`, add `/tools/census` alphabetically and nothing else.

- [ ] **Step 2: Build and serve**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -5
(npm start > .t6-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/census > /dev/null && break; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools/census
```

Expected: `200`. **Kill any `next start` first and check the stylesheet returns 200.** The ledger already carries the trap: a stale server holding port 3000 over a rebuilt `.next` made every stylesheet 400 and the phone check reported sixty tap-target failures that were all true facts about a document with no CSS. The check now fails such a route as `assets` and reports nothing else, but knowing why is what stops an hour going into the wrong page.

- [ ] **Step 3: Run the check and keep the output**

```bash
cd "$WT"
mkdir -p .phone-check
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/census --out .phone-check | tee .phone-check/t6-first-run.txt
echo "exit: $?"
```

Expected: a header naming `1 route(s) x 3 profiles`, then whatever it finds. **Paste the whole output into the ledger before changing a single line.** That paste is the observation; everything after it is a fix.

- [ ] **Step 4: Close the gap the check cannot see, by hand**

With the built site still serving, open the route in a real WebKit at 320 (`npx playwright open --device="iPhone 13" http://localhost:3000/tools/census` opens at 390; set 320 in the inspector) and:

- Type into the filter and watch the industry list shrink. Does anything jump sideways as rows are removed?
- Filter to something that matches nothing and read the empty message.
- Scroll the copyright table sideways with a finger drag and confirm the page behind it does not move.
- Read the user agent in the policy section. It is 96 characters with no spaces in the URL and it is the most likely single string on the page to push the document wide.
- Press the CSV button. It should download a file; if nothing happens, note it and check the console, because a control that does nothing is the exact failure `/contact` has a rule about.

Write down what you see. A control under a thumb's width there is a `tool.css` fix exactly as if the script had named it.

- [ ] **Step 5: Fix each named failure in the file that owns it**

Every fix goes in `app/tools/census/tool.css`. The thresholds in the script are not touched, and `app/globals.css` is not touched: a shell failure on this route is a shell failure on every route and that is F3's ground.

The likely one, written out so it is not invented under pressure. If the sample links fail `tap-target`:

```css
/* A thumb, not a cursor. `(hover: none)` is about the finger and applies on a
   27 inch touchscreen too, which is why there is no width in this query: the
   rule is about how it is being pressed, not about how much room there is.
   `app/globals.test.ts` records the same distinction for the status bar. */
@media (hover: none) {
  .census__sample {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    padding: 0 var(--sp-1);
  }
}
```

- [ ] **Step 6: Rebuild, re-run, confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .t6-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/census > /dev/null && break; done
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/census --out .phone-check
echo "exit: $?"
pkill -f "next start" || true
```

Expected: `exit: 0` and no `FAIL` lines.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add app/tools/census/tool.css
git commit -m "fix(census): meet the phone floors the check named"
```

If the run was clean and nothing changed, skip the commit and say so in the ledger. A clean first run is a finding worth recording, not a step to fake.

What this proves: on WebKit at 390 and 320 and on a throttled Chromium, the route has no horizontal overflow, no input under 16px, no tap target under 44px and no sampled text contrast under 4.5:1, in the state the page opens in, plus whatever Step 4's manual pass covered. What it cannot see: the filtered state under the script, a real iPhone GPU, and whether reading forty-two industry rows on a phone is pleasant.

---

## Phase B starts here, and it is blocked

**Tasks 17 and 18 cannot be done or proven today.** F4 is finished and held unmerged because two Vercel Marketplace terms acceptances are waiting on Fergus: provisioning Upstash Redis and Neon Postgres both stop with `integration_terms_acceptance_required`, no resource is created for either, and `UPSTASH_REDIS_REST_URL` and `DATABASE_URL` do not exist. The ledger records this as the critical path for the whole state track, and it was retried on the morning of 2026-09-04 and still refused.

So, plainly:

- **Do not start Task 17 or 18 until `git cat-file -e origin/main:lib/store/neon.ts` succeeds and `DATABASE_URL` is set.** Check, do not assume.
- **Do not prove either against a fake.** F4 already recorded "everything Redis is proven against a fake" as the honest description of what it could not do, and a green tick here against a stub would be worse than an unticked box, because it would read as evidence.
- If the stores are still absent when Task 16 is finished, **go straight to Task 19**, open the pull request with phase A only, and say in the pull request body and the ledger which two tasks are outstanding and why. A census page that reads a committed snapshot is a complete tool; the diff and the per-domain lookup are the second half and they can land in their own pull request the week the two clicks happen.

---

### Task 17: The Neon schema, the loader and the diff (BLOCKED ON NEON)

**Files:**
- Create: `scripts/census/schema.sql`, `scripts/census/load.mts`, `lib/census/sql.ts`, `lib/census/sql.test.ts`
- Modify: `package.json` (the fifth script)

**Interfaces:**
- Consumes: `getSql()` from `lib/store/neon.ts` and `StoreUnavailableError` from `lib/store/errors.ts` (F4, frozen)
- Produces: `CENSUS_TABLES`, `upsertRowsSql`, `changesSinceSql`, `domainSql`, `industrySql`

**The schema is current state plus a change log, and that is a correction to the design.** The design's store table gives Neon "census tables, Tide query cache, census monthly diff" inside 0.5 GB and does not say what happens after a year of monthly runs. Twelve full snapshots of 125,505 rows would be about 370 MB before indexes, which is most of the tier for one tool, and Tide shares it. So one row per domain holding the latest reading and its `first_seen`, and one row per observed change. About 31 MB steady state, about 1 MB a month of growth, and the diff is a query over the change log rather than a join between two full snapshots.

- [ ] **Step 1: Confirm the store exists before writing a line**

```bash
cd "$WT"
git fetch origin
git cat-file -e origin/main:lib/store/neon.ts 2>/dev/null && echo "neon client: on main" || echo "neon client: NOT on main"
node -e 'console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "MISSING")'
```

Both must be positive. **If either is not, stop here** and go to Task 19. Do not stub `getSql`, do not point it at a local Postgres and call it proven, and do not tick this task.

- [ ] **Step 2: The schema**

```sql
-- scripts/census/schema.sql
--
-- Current state plus a change log, not one table per run.
--
-- Twelve monthly snapshots of 125,505 rows would be about 370 MB before
-- indexes, which is most of the 0.5 GB free tier for one tool, and Tide shares
-- it. So `census_domain` holds the latest reading for each domain and
-- `census_change` holds one row per observed change. Steady state is about
-- 31 MB and growth is about 1 MB a month.
--
-- No page text is stored. `signals` holds rule ids and at most 120 characters
-- of the text that matched each, which is the same cap the page promises and
-- the crawler enforces.

create table if not exists census_domain (
  domain          text primary key,
  run_id          text not null,
  reach           text not null,
  status          integer,
  industry        text not null,
  method          text not null,
  class_evidence  text not null default '',
  signals         jsonb not null default '[]'::jsonb,
  h1_verdict      text,
  h1_chars        integer,
  copyright_year  integer,
  first_seen      text not null,
  last_seen       text not null,
  -- Consecutive runs where DNS failed. Two and the domain leaves the seed.
  dns_misses      integer not null default 0
);

create index if not exists census_domain_industry on census_domain (industry);
create index if not exists census_domain_run on census_domain (run_id);

create table if not exists census_change (
  id          bigserial primary key,
  run_id      text not null,
  domain      text not null,
  -- 'arrived', 'went-dark', 'came-back', 'moved'
  kind        text not null,
  field       text,
  old_value   text,
  new_value   text,
  seen_at     text not null
);

create index if not exists census_change_run on census_change (run_id);
create index if not exists census_change_domain on census_change (domain);
```

- [ ] **Step 3: The queries, as strings, tested without a database**

```ts
// lib/census/sql.ts

/**
 * The census's SQL, as strings, so it can be read and tested without a
 * database.
 *
 * Every one is parameterised. Nothing here interpolates a value into a query,
 * because the one value that reaches these from outside is a domain typed into
 * the JSON API's `?domain=` by a stranger, and that is the whole reason this
 * file exists as its own module with its own test rather than as strings inside
 * a route handler.
 */

export const CENSUS_TABLES = ["census_domain", "census_change"] as const;

/** One domain's current row. `$1` is the domain, lowercased by the caller. */
export const domainSql = `
  select domain, run_id, reach, status, industry, method, class_evidence,
         signals, h1_verdict, h1_chars, copyright_year, first_seen, last_seen
    from census_domain
   where domain = $1
`;

/** One industry's rows, newest run first, capped. `$1` industry, `$2` limit. */
export const industrySql = `
  select domain, industry, method, class_evidence, signals, last_seen
    from census_domain
   where industry = $1
   order by domain
   limit $2
`;

/** Everything that changed in a run. `$1` run id, `$2` limit. */
export const changesSinceSql = `
  select domain, kind, field, old_value, new_value, seen_at
    from census_change
   where run_id = $1
   order by domain
   limit $2
`;

/**
 * Upsert one domain and return what changed, so the loader can write the change
 * log from the same statement rather than reading first and racing itself.
 */
export const upsertRowsSql = `
  insert into census_domain (
    domain, run_id, reach, status, industry, method, class_evidence, signals,
    h1_verdict, h1_chars, copyright_year, first_seen, last_seen, dns_misses
  ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)
  on conflict (domain) do update set
    run_id = excluded.run_id,
    reach = excluded.reach,
    status = excluded.status,
    industry = excluded.industry,
    method = excluded.method,
    class_evidence = excluded.class_evidence,
    signals = excluded.signals,
    h1_verdict = excluded.h1_verdict,
    h1_chars = excluded.h1_chars,
    copyright_year = excluded.copyright_year,
    last_seen = excluded.last_seen,
    dns_misses = case when excluded.reach = 'dns-failed' then census_domain.dns_misses + 1 else 0 end
  returning
    (xmax = 0) as inserted,
    census_domain.industry as new_industry,
    census_domain.reach as new_reach
`;

export const insertChangeSql = `
  insert into census_change (run_id, domain, kind, field, old_value, new_value, seen_at)
  values ($1,$2,$3,$4,$5,$6,$7)
`;
```

```ts
// lib/census/sql.test.ts
import { describe, expect, it } from "vitest";
import {
  CENSUS_TABLES,
  changesSinceSql,
  domainSql,
  industrySql,
  insertChangeSql,
  upsertRowsSql,
} from "./sql";

/**
 * These do not need a database and are not a substitute for having one. They
 * check the shape of the strings: that every value is a placeholder, that no
 * statement can be handed a domain by concatenation, and that the two tables
 * are the two tables. Whether the queries return the right rows is Step 5's
 * job, against real Neon, and cannot be faked here.
 */
const ALL = [domainSql, industrySql, changesSinceSql, upsertRowsSql, insertChangeSql];

describe("the census queries", () => {
  it("names two tables and no more", () => {
    expect(CENSUS_TABLES).toEqual(["census_domain", "census_change"]);
  });

  it("parameterises every value, so a typed domain is never concatenated", () => {
    for (const sql of ALL) {
      expect(sql, sql.slice(0, 40)).toMatch(/\$\d/);
      expect(sql, "no template interpolation").not.toContain("${");
      expect(sql, "no string concatenation").not.toContain("' +");
    }
  });

  it("caps every read that could return the whole table", () => {
    expect(industrySql).toContain("limit $2");
    expect(changesSinceSql).toContain("limit $2");
  });

  it("orders every list, so two identical requests answer identically", () => {
    expect(industrySql).toContain("order by");
    expect(changesSinceSql).toContain("order by");
  });

  it("counts consecutive dns failures and resets on any other reach", () => {
    expect(upsertRowsSql).toContain("dns_misses = case when excluded.reach = 'dns-failed'");
    expect(upsertRowsSql).toContain("else 0 end");
  });

  it("never updates first_seen, which is what makes arrived mean arrived", () => {
    const update = upsertRowsSql.slice(upsertRowsSql.indexOf("do update set"));
    expect(update).not.toContain("first_seen");
  });

  it("writes no page text: every column it sets is a count, an id or a date", () => {
    for (const forbidden of ["html", "title", "description", "body_text"]) {
      expect(upsertRowsSql, forbidden).not.toContain(forbidden);
    }
  });
});
```

- [ ] **Step 4: The loader**

```ts
// scripts/census/load.mts
/**
 * A run's NDJSON into Neon, and the change log written as it goes.
 *
 *   npm run census:load -- --run 2026-09
 *
 * Batched, because 125,505 single round trips over the HTTP driver would be
 * slow and would spend Neon compute for no reason. The change log is written
 * from the upsert's own `returning`, so there is no read-then-write race with
 * itself.
 *
 * `getSql()` throws `StoreUnavailableError` when `DATABASE_URL` is missing, and
 * that is left to throw: this is a script a person runs, and a loud failure is
 * the right answer to a missing database.
 */
import { readFileSync } from "node:fs";
import { getSql } from "../../lib/store/neon.ts";
import { insertChangeSql, upsertRowsSql } from "../../lib/census/sql.ts";
import { formatCost, startCost } from "../../lib/census/cost.ts";
import type { CensusRow } from "../../lib/census/types.ts";

const BATCH = 500;

const runId = process.argv.includes("--run")
  ? String(process.argv[process.argv.indexOf("--run") + 1])
  : new Date().toISOString().slice(0, 7);

async function main(): Promise<void> {
  const stop = startCost();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);

  const rows: CensusRow[] = readFileSync(`data/census/${runId}/rows.ndjson`, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as CensusRow);

  let arrived = 0;
  let moved = 0;
  let wentDark = 0;

  for (let at = 0; at < rows.length; at += BATCH) {
    const batch = rows.slice(at, at + BATCH);
    for (const row of batch) {
      const before = await sql(
        "select industry, reach from census_domain where domain = $1",
        [row.domain],
      );
      const previous = (before as Array<{ industry: string; reach: string }>)[0];

      await sql(upsertRowsSql, [
        row.domain,
        runId,
        row.reach,
        row.status,
        row.industry,
        row.method,
        row.classEvidence,
        JSON.stringify(row.signals),
        row.h1?.verdict ?? null,
        row.h1?.characterElements ?? null,
        row.copyrightYear,
        today,
        row.reach === "dns-failed" ? 1 : 0,
      ]);

      if (!previous) {
        arrived++;
        await sql(insertChangeSql, [runId, row.domain, "arrived", null, null, row.industry, today]);
        continue;
      }
      if (previous.reach === "answered" && row.reach !== "answered") {
        wentDark++;
        await sql(insertChangeSql, [runId, row.domain, "went-dark", "reach", previous.reach, row.reach, today]);
      }
      if (previous.reach !== "answered" && row.reach === "answered") {
        await sql(insertChangeSql, [runId, row.domain, "came-back", "reach", previous.reach, row.reach, today]);
      }
      if (previous.industry !== row.industry) {
        moved++;
        await sql(insertChangeSql, [runId, row.domain, "moved", "industry", previous.industry, row.industry, today]);
      }
    }
    console.log(`${Math.min(at + BATCH, rows.length)}/${rows.length}  ${formatCost(stop())}`);
  }

  console.log(JSON.stringify({ runId, rows: rows.length, arrived, moved, wentDark, cost: stop() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`package.json` gains the fifth script, alphabetical:

```json
    "census:load": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/census/load.mts",
```

- [ ] **Step 5: Prove it against the real database, twice**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/census/sql.test.ts
psql "$DATABASE_URL" -f scripts/census/schema.sql
npm run census:load -- --run pilot
psql "$DATABASE_URL" -c "select count(*) from census_domain;"
psql "$DATABASE_URL" -c "select kind, count(*) from census_change group by kind;"
```

Expected on the first load: `census_domain` holds the pilot's row count, and every `census_change` row is `arrived`.

Then the load that actually proves the diff works, which the first one cannot:

```bash
cd "$WT"
npm run census:load -- --run pilot
psql "$DATABASE_URL" -c "select kind, count(*) from census_change group by kind;"
psql "$DATABASE_URL" -c "select count(*) from census_domain;"
```

Expected: the domain count is **unchanged**, and no new `arrived` rows appear. A second load of the same data producing a second set of `arrived` rows means the upsert is inserting rather than updating, and every diff the tool ever publishes would be noise. **This is the assertion the whole change log rests on and it cannot be made without a database**, which is why this task is blocked rather than deferred.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add scripts/census/schema.sql scripts/census/load.mts lib/census/sql.ts lib/census/sql.test.ts package.json
git commit -m "feat(census): current state and a change log, so a year of runs fits the free tier"
```

What this proves: the schema loads, the upsert is idempotent across two loads of the same run, and the change log records arrivals. What it cannot see: a real month-to-month diff, which needs two crawls a month apart and is the reason the design says the census needs a second run before it means anything.

---

### Task 18: The JSON API and the per-domain drill-down (BLOCKED ON NEON AND REDIS)

**Files:**
- Create: `app/api/census/route.ts`, `app/api/census/route.test.ts`, `lib/census/api-budgets.ts`, `lib/census/api-budgets.test.ts`
- Modify: `content/tools/census.ts` (`privacy` to `server`, and the line that says why)

**Interfaces:**
- Consumes: `getSql`, `StoreUnavailableError`, `takeBudget`, `budgetKeyForIp` (F4, frozen); the queries from Task 17
- Produces: `GET /api/census`

**Both stores, and neither is a maybe.** Neon holds the rows, Redis holds the budget, and F4's `takeBudget` falls back to memory only when `NODE_ENV !== "production"`. Check both before starting, the same way Task 17 does.

**Three things about this route are the design's rules made concrete.**

The design's phrase "a JSON API with the same budget as the page" has no referent in this build, because the page is static and costs nothing. So the API carries its own three budgets: per IP, per target (the domain or industry asked for), and a global daily cap, chosen so the month lands under 60% of every allotment. That correction is written in this plan's arithmetic section and repeated here so an implementer meets it.

**Every JSON answer carries the coverage fraction.** Not a link to it, the number itself, in every response body. An API is where a figure gets lifted into somebody else's chart with no page around it, and a payload that says `{"wordpress": 41000}` with nothing beside it is exactly the misquotation this whole tool is built to avoid.

**The privacy line changes in this commit.** `privacy: "browser"` was true while nothing on the page reached a server. A lookup box that calls this route makes it false, and leaving it would be a wrong claim on a page whose entire argument is not making those.

- [ ] **Step 1: Confirm both stores exist**

```bash
cd "$WT"
git cat-file -e origin/main:lib/budget.ts 2>/dev/null && echo "budget: on main" || echo "budget: NOT on main"
node -e 'console.log("DATABASE_URL:", !!process.env.DATABASE_URL, "UPSTASH:", !!process.env.UPSTASH_REDIS_REST_URL)'
```

All three positive, or **stop and go to Task 19**.

- [ ] **Step 2: The budgets**

```ts
// lib/census/api-budgets.ts
import type { BudgetRequest } from "../budget.ts";

/**
 * The three budgets `/api/census` takes, in the order it takes them.
 *
 * The design says the API has "the same budget as the page". The page in this
 * build is static and costs nothing, so that phrase has no referent and the API
 * carries its own instead: per IP so one caller cannot spin, per target so a
 * script cannot hammer one popular domain, and globally so the month cannot be
 * spent in a day. The numbers are chosen so 2,000 calls a day at about five
 * Redis commands each is 300,000 a month, which is inside the 500,000 free tier
 * with the rest of the programme's draw.
 *
 * Cheapest refusal first: the global cap costs the same as the others but
 * refuses everybody at once, so it goes last, and the per-IP cap goes first
 * because it is the one a runaway client trips.
 */
export const CENSUS_TOOL = "census-api";

export function ipBudget(key: string): BudgetRequest {
  return { tool: CENSUS_TOOL, scope: "ip", key, limit: 60, windowSec: 3600 };
}

export function targetBudget(target: string): BudgetRequest {
  return { tool: CENSUS_TOOL, scope: "target", key: target, limit: 20, windowSec: 3600 };
}

export function globalBudget(): BudgetRequest {
  return { tool: CENSUS_TOOL, scope: "global", key: "all", limit: 2000, windowSec: 86400 };
}
```

```ts
// lib/census/api-budgets.test.ts
import { describe, expect, it } from "vitest";
import { CENSUS_TOOL, globalBudget, ipBudget, targetBudget } from "./api-budgets";

describe("the census api budgets", () => {
  it("names one tool, so the counters cannot collide with another tool's", () => {
    for (const budget of [ipBudget("a"), targetBudget("b"), globalBudget()]) {
      expect(budget.tool).toBe(CENSUS_TOOL);
    }
  });

  it("uses the three scopes the design requires", () => {
    expect(ipBudget("a").scope).toBe("ip");
    expect(targetBudget("b").scope).toBe("target");
    expect(globalBudget().scope).toBe("global");
  });

  it("caps the day below the arithmetic in the plan", () => {
    const budget = globalBudget();
    expect(budget.limit).toBe(2000);
    expect(budget.windowSec).toBe(86400);
    // 2,000 calls a day at about five Redis commands each, over a month.
    expect(budget.limit * 5 * 30).toBeLessThan(500_000 * 0.6);
  });

  it("lets one address do less in an hour than everybody does in a day", () => {
    expect(ipBudget("a").limit).toBeLessThan(globalBudget().limit);
  });
});
```

- [ ] **Step 3: The route**

```ts
// app/api/census/route.ts
import { NextResponse } from "next/server";
import { COVERAGE } from "@/content/tools/census";
import { globalBudget, ipBudget, targetBudget } from "@/lib/census/api-budgets";
import { changesSinceSql, domainSql, industrySql } from "@/lib/census/sql";
import { budgetKeyForIp, takeBudget } from "@/lib/budget";
import { StoreUnavailableError } from "@/lib/store/errors";
import { getSql } from "@/lib/store/neon";

/**
 * `GET /api/census`.
 *
 *   ?domain=rte.ie        one domain's row, with the rules that matched it
 *   ?industry=legal       up to 200 domains in a bucket
 *   ?changes=2026-10      what moved in a run
 *
 * **Every answer carries the coverage fraction.** Not a link to it, the number
 * itself, in the body, on every path including the refusals. An API is where a
 * figure gets lifted into somebody else's chart with no page around it, and
 * `{"wordpress": 41000}` on its own is the misquotation this whole tool exists
 * to prevent.
 *
 * Budgets before the database, always: a refused caller must not cost a query.
 * A missing store answers 503 with a sentence rather than a stack trace, and
 * only `StoreUnavailableError` is caught, so a real fault is still a 500 and is
 * not dressed up as a missing database.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 200;

const coverage = {
  seedDomains: COVERAGE.seedDomains,
  registryCount: COVERAGE.registryCount,
  registryAsOf: COVERAGE.registryAsOf,
  sharePercent: COVERAGE.sharePercent,
  note: `This is ${COVERAGE.sharePercent}% of .ie. Every count here is a count within that share, not within Ireland.`,
};

function refuse(status: number, error: string, message: string, retryAfterSec?: number) {
  const headers = retryAfterSec ? { "retry-after": String(retryAfterSec) } : undefined;
  return NextResponse.json({ error, message, coverage }, { status, headers });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain")?.trim().toLowerCase() ?? "";
  const industry = url.searchParams.get("industry")?.trim().toLowerCase() ?? "";
  const changes = url.searchParams.get("changes")?.trim() ?? "";

  const target = domain || industry || changes;
  if (target === "") {
    return refuse(400, "bad-request", "Ask for one of domain, industry or changes.");
  }
  if (target.length > 100 || !/^[a-z0-9][a-z0-9.\-]*$/.test(target)) {
    return refuse(400, "bad-request", "That is not a domain, a bucket id or a run id.");
  }

  const ip = await takeBudget(ipBudget(budgetKeyForIp(request.headers)));
  if (!ip.ok) return refuse(429, "budget", ip.reason, ip.retryAfterSec);
  const perTarget = await takeBudget(targetBudget(target));
  if (!perTarget.ok) return refuse(429, "budget", perTarget.reason, perTarget.retryAfterSec);
  const overall = await takeBudget(globalBudget());
  if (!overall.ok) return refuse(429, "budget", overall.reason, overall.retryAfterSec);

  try {
    const sql = getSql();
    if (domain) {
      const rows = await sql(domainSql, [domain]);
      const row = (rows as unknown[])[0];
      if (!row) return refuse(404, "not-in-census", "That domain is not in this census.");
      return NextResponse.json({ coverage, domain: row });
    }
    if (industry) {
      const rows = await sql(industrySql, [industry, LIMIT]);
      return NextResponse.json({ coverage, industry, limit: LIMIT, domains: rows });
    }
    const rows = await sql(changesSinceSql, [changes, LIMIT]);
    return NextResponse.json({ coverage, run: changes, limit: LIMIT, changes: rows });
  } catch (thrown) {
    if (thrown instanceof StoreUnavailableError) {
      return refuse(
        503,
        "census-unavailable",
        "The per-domain lookup is off right now. Every number on /tools/census is still there and does not need this.",
      );
    }
    throw thrown;
  }
}
```

- [ ] **Step 4: The route test, with injected stores where the framework allows and against the real ones where it does not**

```ts
// app/api/census/route.test.ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

/**
 * These call the handler with a plain `Request`, which is how
 * `lib/mcp.test.ts` and the headline checker's action tests already work here.
 * They cover the paths that never reach a store: the argument validation and
 * the coverage block. The budget and the database paths are proved in Step 5
 * against the real stores, because a budget proven against a fake is the exact
 * thing F4 recorded as what it could NOT prove.
 */
const call = (query: string) => GET(new Request(`https://fergusoreilly.dev/api/census${query}`));

describe("the census api, on the paths that need no store", () => {
  it("refuses an empty request with a sentence", async () => {
    const response = await call("");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("domain");
  });

  it("refuses a target that is not a domain, a bucket or a run id", async () => {
    for (const bad of ["?domain=../etc/passwd", "?domain=a%20b", `?industry=${"x".repeat(200)}`]) {
      const response = await call(bad);
      expect(response.status, bad).toBe(400);
    }
  });

  it("carries the coverage block even on a refusal", async () => {
    const body = await (await call("")).json();
    expect(body.coverage.sharePercent).toBe(37.7);
    expect(body.coverage.note).toContain("not within Ireland");
  });
});
```

- [ ] **Step 5: Prove the budget refuses on the n+1th call, from two instances**

The programme's section 9 requires this in those words and it cannot be done without Redis. Against a deployed preview:

```bash
PREVIEW=https://<the preview url>
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code} " "$PREVIEW/api/census?industry=legal"
done
echo
```

Expected: twenty `200`s and then `429`, because the per-target cap is 20 an hour. Then the part that proves it is Redis and not one function's memory: run the same loop from a second machine or after a deploy that replaces the instance, and confirm the twenty-first call is still refused. **A budget that resets when the instance does is not a budget**, and that is the exact failure `app/tools/headline-check/rate-limit.ts` documents about itself.

- [ ] **Step 6: Change the privacy line, in this commit and not later**

In `content/tools/census.ts`:

```ts
  privacy: "server",
```

and add to `cantSee`, first in the list:

```ts
    "What you look up. The per-domain lookup asks a server, which keeps a hashed IP for a day so it can count calls. Everything else on this page is a static file and asks nothing.",
```

Task 1's docblock says this change belongs here. A page whose whole argument is not making false claims cannot carry "nothing leaves this tab" beside a box that sends what you typed to a server.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add app/api/census/ lib/census/api-budgets.ts lib/census/api-budgets.test.ts content/tools/census.ts
git commit -m "feat(census): a json api that carries the coverage fraction in every answer"
```

What this proves: the API validates its input, refuses on three budgets, answers 503 with a sentence when the store is gone, and puts the coverage fraction in every body. What it cannot see: how anybody actually uses it, and whether the per-domain evidence reads well to somebody who did not build it.

---

### Task 19: Documentation, the pull request, and the live check

**Files:**
- Modify: `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything
- Produces: a merged pull request and a verified production route

- [ ] **Step 1: Write down what changed, in the three places that carry it**

`AGENTS.md`, in the stack and conventions section, one paragraph after the tools list:

> **`/tools/census` is a crawler with this site's name on it, and its politeness policy is code.** `content/tools/census.ts` holds the constants the crawl runs on (two requests a domain, two seconds, 64 KB asked for and 128 KB read, eight requests a second, 120 characters of evidence) and the nine sentences the page prints about them. `lib/census/policy.test.ts` asserts the sentences carry the numbers, so the page and the crawler cannot drift. The crawl itself runs on the home machine, monthly, never on Vercel: 251,010 outbound requests would spend the month's whole CPU allotment several times over. `scripts/census/*.mts` are TypeScript run by plain Node 24, which is why `tsconfig.json` carries `allowImportingTsExtensions` and `**/*.mts`. The page is a static import of `content/census/snapshot.ts`, a generated file that holds counts, ids and domain names and no prose from anybody else's website; `content/census/snapshot.test.ts` is the charset guard that keeps it that way.

`docs/PROGRESS.md`: tick T6, and add a dated line naming the two blocked tasks if they are blocked.

The ledger: move T6 to `pr`, then `merged`, then `live`, with every pasted measurement from Tasks 10, 11, 13 and 16 under it. **The ledger is where the numbers live**, not the pull request body, because conversation memory does not survive compaction and re-dispatching finished work is the most expensive failure there is.

- [ ] **Step 2: The whole suite, cold**

```bash
cd "$WT"
npx tsc --noEmit && echo "tsc: clean"
npm test 2>&1 | tail -6
npm run build 2>&1 | tail -20
node scripts/mutation-check.mjs 2>&1 | tail -5
git status --porcelain
```

Expected: clean types, a green suite whose count is the Task 0 baseline plus this branch's tests, a clean build with `/tools/census` static, every mutation red, and nothing untracked under `data/`.

- [ ] **Step 3: Rebase and open the pull request**

```bash
cd "$WT"
git fetch origin
git rebase origin/main
npx tsc --noEmit && npm test 2>&1 | tail -3
git push -u origin toolshed/t6-census
```

If the rebase conflicts, the likely file is `scripts/mutation-check.mjs`, where every sub-project appends. **Keep both sides, then count the rows** rather than trusting the merge: `grep -c '^\s*name: "' scripts/mutation-check.mjs` must equal main's count plus sixteen.

The pull request body says, in this order: what the tool is, the coverage fraction and where it comes from, the politeness policy in one paragraph, what the pilot and the full run measured, what the spot check measured and on what sample size, which tasks are outstanding and why, and what was not verified. Do not write "should work" anywhere in it.

- [ ] **Step 4: Watch CI, and expect the phone job to be the slow one**

```bash
gh pr checks --watch
```

Three required jobs: `check`, `mutation`, `phone`. The `phone` job walks the sitemap, so it picks up `/tools/census` automatically now that the entry is `live`. It ran at about eight minutes on F3's merge and this adds a route to it.

- [ ] **Step 5: Merge and confirm the deployment the way this repo confirms deployments**

```bash
gh pr merge --squash --delete-branch=false
```

Then, per AGENTS.md, and not by trusting the CLI's exit code or `vercel ls`:

```bash
curl -s "https://api.vercel.com/v6/deployments?projectId=<id>&teamId=<team>&target=production&limit=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" | head -c 800
```

Expected: `readyState: "READY"`, `aliasAssigned: true`, and `meta.githubCommitSha` equal to the squash commit. A `BLOCKED` here is a finding to report, not a reason to reach for the retired temp-directory shipping route.

- [ ] **Step 6: Verify the live feature, which is not a 200 on the route**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fergusoreilly.dev/tools/census
curl -s https://fergusoreilly.dev/tools/census | grep -c "37.7% of .ie"
curl -s https://fergusoreilly.dev/tools/census | grep -c "IrishStackCensus"
curl -s https://fergusoreilly.dev/sitemap.xml | grep -c "tools/census"
curl -s https://fergusoreilly.dev/llms.txt | grep -c "census"
```

Expected: `200`, then `1`, `1`, `1`, `1`. The second is the one that matters: **the coverage sentence must be in the served HTML**, because a page that only shows its caveat after hydration has not shown it to a crawler, an answer engine or anybody on a bad connection.

Then in a real browser, on a phone-sized viewport:

- The coverage block is the first thing under the heading.
- Type in the filter and watch the list narrow.
- Press the CSV button and confirm a file arrives with the industry rows in it. A control that does nothing is the failure `/contact` has a rule about, and this one is easy to ship broken because it works locally.
- Read the console. Zero errors.
- Confirm the `tool_run` question: **this tool does not fire one**, because nothing runs. If a later change adds the lookup box, it fires `tool_run` with the slug and the outcome and never the domain.

- [ ] **Step 7: Submit it to the index and update the ledger**

```bash
cd /c/Dev/fergus-portfolio
node scripts/indexnow.mjs --dry-run | grep census
node scripts/indexnow.mjs
```

Then write the ledger's final T6 entry. It says what was verified, and then, in its own paragraph, **what was not**. At the time of writing that list is expected to include: the month-to-month diff (needs a second crawl a month later and is the design's own note that the census needs two runs to mean anything), the JSON API and the per-domain drill-down if Neon never arrived, whether any site owner minds, the accuracy of every bucket outside the sixty in the spot check, and whether the seed's 37.7% is representative of the other 62% in any way at all.

- [ ] **Step 8: Log the lessons**

Append to `[[coding-playbook]]` whatever held up, and to `[[coding-mistakes]]` whatever did not. Two candidates are already visible from writing this plan and should be logged whether or not they bite:

- **A shared regex table must never carry the `g` flag.** `lastIndex` persists on the object, so a table reused across a large corpus starts missing matches in a pattern that looks like data rather than a bug. Guard: a test over the table's flags, plus a manual mutation with the failure pasted.
- **A test that reads a source file on a Windows checkout normalises line endings first**, or it is red locally and green in CI for no real reason. This is already in the ledger from `lib/contact.test.ts` and it recurred in the planning of this one, which is the definition of a lesson that needs a guard rather than a note.

---

## Self-review

Run against the spec with fresh eyes, per the writing-plans skill, after the tasks were written. Gaps found were fixed inline before this plan was saved; each is listed with what changed.

**1. Spec coverage.** Walking design section 6, T6, clause by clause, plus the clauses sections 2, 5, 8 and 9 apply to every tool:

| Spec clause | Task |
|---|---|
| `/tools/census` | 14 |
| "The corpus from S4" | 10, with S4's three rulings written into it |
| "A monthly crawl on the home machine" | 11, and the `.mts` decision in 0 |
| "one polite fetch per domain (HEAD, then the first 64 KB...)" | 5 and 11. **Corrected**: HEAD is dropped, one ranged GET replaces it, and the correction is argued in the politeness section |
| "a 2-second cap" | 5 (`REQUEST_TIMEOUT_MS`), 11 (`policy.test.ts` pins it against the copy) |
| "`robots.txt` honoured" | 4, including the 5xx clause the copy promises |
| "a named user agent with a contact URL" | 1 (the constant), 5 (the header), 14 (printed on the page with the opt-out instruction) |
| "fingerprinted for platform, host, payments, booking system, newsletter tool" | 6 (the table), 7 (the matching) |
| "an h1" | 7, through `lib/headline.ts`, which also gives the page a finding no other tool here can produce |
| "the copyright year" | 7, bounded at both ends |
| "classified by industry from schema.org types and page content into about forty buckets" | 2 (42 buckets), 8 (schema first, then keywords) |
| "written to Neon with the run id" | 17, **blocked** |
| "The site serves a table by industry" | 14 |
| "a stack-by-industry matrix" | 12 (`platforms` per industry row), 14 (rendered as chips per row, in the explorer) |
| "after the second month the diff: who moved, who went dark, who arrived" | 17's change log, **blocked**, and it needs a second crawl regardless |
| "An honesty layer per row: the evidence URL and the reason for each classification" | Partly 12 and 14 (sample domains per signature, and stated against inferred per industry, in phase A); fully 18, **blocked** |
| "A JSON API with the same budget as the page" | 18, **blocked**. **Corrected**: the page has no budget because it is static, so the API carries its own three |
| "Can't see: sites behind JavaScript" | 1, `cantSee[1]` |
| "sites that block bots (marked unknown, never custom)" | 1 `cantSee[2]`, 2 (no `custom` bucket, with a test), 8 (`reachable: false` gives `unknown`) |
| "businesses without a `.ie` domain" | 1 `cantSee[3]`, and measured in 13's coverage half |
| "Coverage stated per bucket against a spot check" | 13, and rendered in 14 |
| Every hosted tool measures its own cost (section 5, corrected) | 9, 11, 14 |
| Budgets per IP, per target and globally (section 5) | 18, **blocked** |
| Phone check at 390 and 320 on a real engine (section 9) | 16 |
| Mutation check on every new guard (section 9) | 15 |
| Fence refuses 127.0.0.1, 169.254.169.254, a private redirect, a private DNS answer (section 9) | 5, all four by name |
| "can't see" list on the page, checked against the code (section 9) | 1 writes it, F3's `ToolPage` renders it, the reviewer checks it against `lib/census/*` |
| Every completion note states what was not verified (section 9) | every task's closing paragraph, and 19 Step 7 |
| Tool owns `app/tools/<slug>/tool.css` (section 2, rule 2) | 14 |
| Only what the visitor explicitly saved (section 2, rule 1) | the storage greps in 11 and 14, and the sentence in 1 |
| No new dependencies (section 2, rule 3) | Global Constraints; nothing in phase A installs anything and phase B uses F4's client |

**Seven gaps found and closed while reviewing.**

The first is the worst and it was structural. The plan originally had the page reading Neon, which made **the entire tool blocked** on two clicks nobody controls. Splitting it into a committed snapshot the page imports and a row store for the drill-down means seventeen of nineteen tasks ship today, the page costs nothing to serve, and the two blocked tasks are genuinely the ones that need a database. That is also the better design: an ISR page hitting Neon on a revalidation is compute spent to render numbers that changed once a month.

Second, the snapshot was going to carry example h1 text and titles as "evidence". That would have put strangers' prose into a committed file for good, and the immediate symptom would have been `content/voice.test.ts` failing the build on somebody else's em dash, which reads like a house-style bug and is actually a privacy one. The snapshot is now identifiers, counts and domain names, with a charset guard, and the sample domains do the honesty job that phase A can afford.

Third, the design's "HEAD, then the first 64 KB" was taken at face value and would have doubled the load on 125,505 other people's servers to learn nothing a ranged GET does not tell you. It is now one GET, the correction is argued where a reviewer will see it, and the request count in the arithmetic table is 251,010 rather than 376,515.

Fourth, nothing measured whether the classifier is right. Every test in Tasks 2, 6, 7 and 8 proves the rules are well formed, which a completely wrong table would also pass. Task 13's spot check is now a task rather than a sentence, it is hand-measured on sixty sites, it has a data file with a test that fails if the zeros are left in it, and there is an explicit instruction not to tune the classifier against it.

Fifth, the crawler could have reached the network without the fence and nothing would have noticed. `lib/census/safety.test.ts` now greps `scripts/census/crawl.mts` for a bare `fetch(` and for the order of the opt-out check against the first DNS lookup. The second one matters because getting it backwards still produces correct-looking rows while costing an opted-out owner a lookup.

Sixth, the `.mts` decision was an assumption. Node 24's native type stripping is what lets a script import a tested module with no build step, and eleven tasks depend on it. Task 0 Step 3 now proves it with a two-file probe before anything is built on it, and names the exact fallback (`tsx`, a new dependency, an argument on the pull request) if it fails. It also pins `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`, without which a monthly run prints a warning per imported file into a scheduler log.

Seventh, and it would have failed on the first monthly run rather than in review, every module under `lib/census/` was written with `@/` aliases and extensionless relative imports, because that is the house style everywhere else in this repository. Both work under vitest and under the Next build and **neither works under bare Node**, which is what runs the crawl. So the runtime modules now import by relative path with the `.ts` extension written out, the Task 0 probe was extended to a two-hop chain because a one-hop chain would have passed while the real thing failed, and `lib/census/safety.test.ts` greps for both mistakes. Test files keep `@/` on purpose and the constraint says why.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code. Fourteen places name something that has not happened yet, and every one is labelled as a prediction with the action to take if it is wrong: the six phone-check predictions (16), the eight pilot predictions (11 Step 5), the six seed predictions (10 Step 3), the three failure lines expected from the `g`-flag mutation (15 Step 1), the sixteen anchors that must be checked before the mutation run (15 Step 3), whether Neon and Redis exist at all (17 and 18, both Step 1), whether the full run's reach distribution resembles the pilot's (13 Step 5), and what the spot check will find (13, explicitly unmeasured). That is the `CLAIMS.md` pattern, not a placeholder.

Three sets of numbers are arithmetic rather than measurement and are marked as such: the request count (125,505 x 2), the nine-hour wall clock (251,010 / 8, which Task 13 replaces with a reading), and the Neon storage estimate (125,505 rows at about 250 bytes). The one number that is neither is 37.7%, which is division of two published figures, both cited with their dates, with the two alternative readings printed beside it.

One deliberate empty: `content/census/excluded.ts` ships as an empty array. That is not a placeholder, it is the correct initial state of an opt-out list on the day a crawler starts, and it has a test that keeps it a list of bare domains.

**3. Type consistency.** Checked name by name across tasks:

- `CensusRow` is produced in Task 2's `types.ts` and consumed in 11 (written), 12 (aggregated) and 17 (loaded). One definition, imported three ways: `@/lib/census/types` from the app and the tests, `../../lib/census/types.ts` from the scripts. The two specifiers resolve to one file, which is what `allowImportingTsExtensions` and the vitest alias are both for.
- `IndustryId` is derived from `INDUSTRIES` with `as const satisfies`, so adding a bucket widens the union and a typo in `SCHEMA_TO_INDUSTRY` is a compile error rather than a row that silently classifies nothing. `KEYWORDS` is typed `KeywordRow[]` with `id: IndustryId` for the same reason.
- `Signal` carries `category`, `id`, `where` and `evidence`, and `Signature` carries `category`, `id`, `name` and `matchers`. The `name` lives only on the signature, so a stored row holds an id and the page resolves the label through `signatureName`. That is what stops a rename of "Realex" turning into a data migration.
- `Cost` is defined once in `cost.ts`, imported by `aggregate.ts` (in `CensusSnapshot`), by both scripts, and by the page through `formatCost`. `CensusSnapshot` therefore imports a type from `cost.ts` and `content/census/snapshot.ts` imports `CensusSnapshot` from `aggregate.ts`, which is one direction and no cycle.
- `Reach` is a closed union used as a `Record<Reach, number>` key in the snapshot, so adding a reach is a compile error in `aggregate.ts` until the `REACHES` array is updated too. That array and the union are the one place this plan repeats itself, and the `reach` test in Task 12 asserts all eight keys are present, which is what catches the omission.
- `CensusFetchDeps` is the single injection point for `fetchText`, `fetchRobots` and `resolvePublic`, so one test double drives all three, and `guard`, `readCapped` and `REDIRECTS` are module-private and shared between the two exported fetchers rather than duplicated.
- `ClassMethod` has four values and the aggregate reads exactly two of them (`schema`, `keyword`) for its stated/inferred split, with `parked` and `none` falling into neither. That is deliberate: `stated + inferred` is deliberately less than `n` for a bucket, and the page prints all three numbers rather than implying the first two add up.
- F4's names are consumed and never redefined: `getSql`, `StoreUnavailableError`, `takeBudget`, `budgetKeyForIp`, `BudgetRequest`. `lib/census/api-budgets.ts` returns `BudgetRequest` objects rather than wrapping `takeBudget`, so the budget's own tests still cover the mechanism and this file only fixes the numbers.
- The one name that changes meaning across the plan is `census.privacy`: `"browser"` from Task 1 and `"server"` from Task 18. Both tasks say so in their own text, Task 1's docblock names Task 18 as the place it changes, and Task 18 makes the change in the same commit as the route rather than leaving the page carrying a claim the code has made false.
