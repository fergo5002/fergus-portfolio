# T4 Second Visit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/tools/second-visit`: somebody who takes bookings drops their own export into the page, answers a few questions about it (which column is what, which town the business is in, what date the file ends), and gets back an honest estimate of how many first-time customers come back, with the uncertainty printed beside it rather than hidden, plus a per-customer verdict from the retention model that runs in Tigh Sauna's production database, credited, and proved equal to the production SQL by a test that runs in CI.

**Architecture:** Every number is a pure function in `lib/tools/second-visit/` with a test beside it. A file becomes rows, rows become customers, customers become facts, and the twelve scalar functions of Tigh Sauna's migration 0300 turn those facts into an expected gap, a silence ratio and a verdict. Nothing reaches the network: the tool is one page, one Web Worker and a pile of arithmetic. The port is not trusted because it was read carefully. It is trusted because `lib/tools/second-visit/oracle.test.ts` runs it over a committed fixture and compares it, at 1e-9, against output that a real Postgres 16 produced from migration 0300's own SQL, and `scripts/second-visit/compare.mjs` regenerates that output on demand so the golden file can never drift into being something this repository made up.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest 2 (node environment, no jsdom), hand-written CSS, one Web Worker, and no new runtime dependency. Docker with `postgres:16` for the oracle regeneration, which is a deliberate command like `scripts/mutation-check.mjs` and not part of `npm test`. Node 24's built-in TypeScript stripping is used by two scripts so the fixture generator can be one module rather than two.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is T4 (section 6, wave 1). Its line, verbatim: "`/tools/second-visit`. Drop a bookings or orders export; it is parsed in a worker; map customer, date, amount, optionally slot time, capacity, cancelled, town, product. Then the production model, ported to TypeScript and proven equal to the production SQL row for row (spike S3 ruled DuckDB out: 8.1 MB and 82 seconds on a Slow 4G phone; the macros stay in the repo as the oracle and `compare.mjs` is the regression test at 1e-9): expected gap by empirical Bayes (k = 2, the same constant as 0300), silence ratio, a Kaplan-Meier time-to-second-visit with right-censoring beside the naive one-and-done figure, distance bands from a bundled table of Irish town centroids, the verdicts (visiting, dormant, committed idle, squeezed), every constant a slider, terrain if there are slots, reorder radar if there are products, three CSVs out (lapsed regulars, second-visit nudges, stall risks), and a self-contained HTML report the visitor can save and reopen. Credited to Tigh Sauna, with a link. Can't see: why anyone left, tourists without a town, seasonality under a year (disabled, and it says so). S3 decided: see `docs/superpowers/spikes/s3-duckdb.md`."
- **`C:\Dev\sauna-os` is read only. Never write to it, never commit in it, never create a branch in it.** It is a different business's repository. This plan reads exactly two files from it, copies text out of them, and records the commit the copy came from.
- **No new runtime dependency, and DuckDB in particular is not coming back.** S3 measured it at 8.1 MB gzip and an 82 second median load at Chrome's Slow 4G profile, the coordinator ruled on 2026-09-03 that it does not ship, and the design's dependency list has already lost `@duckdb/duckdb-wasm`. Everything this tool needs is a `for` loop. `playwright` stays a devDependency and is used only by the phone check.
- vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`. **There is no jsdom, so no React component can be mounted.** Every piece of logic lives in `lib/tools/second-visit/*.ts` as a pure function with a test beside it, and the React is wiring. Component wiring is proved by source-grep coupling tests in the pattern of `lib/boot.test.ts` and `components/chrome.test.ts`, and every one of those says in its docblock that it is a coupling check and not a render.
- **This checkout is Windows with `core.autocrlf=true` and there is no `.gitattributes`.** Any test that reads a source file and looks for a newline must normalise first: `readFileSync(path, "utf8").replace(/\r\n/g, "\n")`. Skip it and the test is red here and green in CI for no reason to do with the code, which has already happened once in this repository (`lib/contact.test.ts`, fixed in 6fe4b58). The same rule applies to the committed fixture `oracle/bookings.csv`: git hands it to a Windows checkout with CRLF and to CI with LF, so the CSV reader must treat the two identically and Task 5 has a test that says so.
- F3's interfaces are frozen and this plan consumes them unchanged: `ToolEntry` (`slug, name, blurb, privacy, cantSee, status, order`), `content/tools/index.ts` exporting `tools`, `liveTools`, `toolBySlug` and `toolShellCopy`, `components/tools/ToolPage.tsx` with props `{ tool, children }` plus the optional `extraSchema` and `talk`, `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`, `trackToolRun(payload)` in `lib/tools/events.ts`, and `scripts/phone-check.mjs --base --routes`.
- **F4 is not a dependency and this tool must never acquire one.** Redis and Neon are unprovisioned, waiting on two Vercel Marketplace terms acceptances from Fergus. Nothing in this tool touches a store, a budget or the network, so none of that blocks it. A store would only ever add one thing here, and it is written down in Task 18 rather than built: a short URL for a saved report, so somebody could send it to a colleague instead of attaching a file. That is a nice-to-have and it is not in scope.
- **The tool does no server work, so the "every hosted tool measures its own cost" rule does not apply to it, and saying that plainly is part of the deliverable.** There is no server action, no route handler and no function invocation: the page is static and the work happens in the visitor's tab. What the tool does measure and print, because it is free and honest, is its own wall clock: rows read, milliseconds to parse, milliseconds to model. Those numbers go on the page and into the saved report.
- **Nothing is written to the visitor's machine.** No `localStorage`, no `sessionStorage`, no `indexedDB`, no `document.cookie`, no Cache API, anywhere under `app/tools/second-visit/` or `lib/tools/second-visit/`. The only file that leaves the tab is one the visitor pressed a button to save. `lib/tools/second-visit/safety.test.ts` greps both directories and fails on any storage API, on `fetch`, on `XMLHttpRequest` and on `navigator.sendBeacon`. The page says `forget` has nothing to wipe here, and the same test asserts that sentence is in the copy, so the claim and the code are checked together.
- **`tool_run` carries the slug, the outcome and the milliseconds, rounded to the nearest 100.** Never a column name, never a row count, never a town, never a customer identifier. The rounding is the same decision T3 took: a millisecond-precise duration correlates with file size, and the number is only wanted as a rough performance signal.
- All copy lives in `content/tools/second-visit.ts` and passes `content/voice.test.ts`: no em dash, no en dash outside a date, British spelling. Nothing is hard-coded in a page or a component, the report's own headings included.
- Hand-written CSS. The tool owns `app/tools/second-visit/tool.css`, imported by its own `page.tsx` (design section 2, rule 2). `app/globals.css` is not touched. `--green-dim` is borderline on two of the three themes (`app/globals.test.ts`) and appears on nothing a visitor has to read.
- Every animation gated behind `@media (prefers-reduced-motion: no-preference)`. There is one on this route, a CSS opacity fade on the results block. No second `requestAnimationFrame` loop: `SystemProvider` owns the only one (AGENTS.md).
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/t4-second-visit` in its own sibling worktree made through `workspaces.ps1`, never reused, never removed by an agent. The repository is public, so this ships as a pull request needing the `check`, `mutation` and `phone` jobs green.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what the output proves and what it cannot see. Numbers that have not been measured are labelled as guesses until a run replaces them. The port is "read from the migration" until Task 12 runs, and "equal to Postgres at 1e-9 on the committed fixture" after it, never "the same model" without that qualifier.

---

## The model, what is being claimed, and what is not

### Where it comes from

Two files in `C:\Dev\sauna-os`, at commit `94f77a80debcd3e444e6609bd0c8b0068c4193db`:

- `apps/api/migrations/0300_customer_intelligence.sql`, dated 2026-08-11. Twelve `language sql` scalar functions in the `hearth` schema, plus four views that assemble them.
- `apps/api/migrations/0070_analytics_views.sql`. `analytics.customer_metrics`, which is where `visits`, `visit_cadence_days`, `days_to_second_visit`, `days_since_last_visit` and the old `lifecycle` are actually defined. 0300 consumes them and does not define them, so a port that reads 0300 alone would invent four of its own inputs.

The twelve functions, all of which this plan ports and all of which the oracle covers:

| Function | What it decides |
|---|---|
| `distance_km` | Haversine, strict, so an unknown address stays unknown rather than becoming (0, 0) |
| `distance_band` | local 15, catchment 45, regional 95, distant beyond, visitor if a different country |
| `distance_prior_factor` | 1.00 / 1.35 / 2.20 / 4.00 / 8.00, and 1.00 for unknown |
| `blend_prior` | Evidence beats the prior. k = 2, floored at 1 so a prior can never become a discount |
| `shrink` | Empirical Bayes toward the cohort, k = 2 |
| `season_factor` | The inverse of the month's index, clamped to [0.6, 3.0] |
| `expected_gap_days` | The product, floored at 3 days and capped at 540 |
| `retention_verdict` | prospect, visiting, loyal, first_time, repeat, committed_idle, squeezed, dormant, lapsed, at_risk |
| `reachability` | 0 with no consent or a suppression, 0.6 with one channel, 1.0 with two |
| `p_return_prior` | The opening assumption before the merchant has any reactivation data |
| `smooth_rate` | A measured rate pulled toward that prior, strength 20 |
| `winnability_cents` | Probability times margin times reachability, in money |

`hearth.retention_basis` is deliberately **not** ported. It takes the view's own row type, which does not exist here, and its job is to write a sentence about a customer. This tool writes its own sentences from `content/tools/second-visit.ts`, in Fergus's voice rather than in Tigh Sauna's, and the page says the words are the tool's and the numbers are the model's.

### The four inputs that come from 0070, and the one this tool has to define differently

| Input | 0070's definition | What this tool does |
|---|---|---|
| `visits` | count of bookings with status in (`completed`, `no_show`) | count of rows that are not cancelled, which is the same thing when a status column is mapped and a superset when there is none |
| `visit_cadence_days` | `percentile_cont(0.5)` over gaps between **completed** bookings only, gaps of zero days dropped, cast to `numeric(6,1)` so it is rounded to one decimal | identical, including the zero-gap drop and the one-decimal rounding, both of which change the answer |
| `days_to_second_visit` | second visit date minus first visit date, over completed and no-show | identical |
| `days_since_last_visit` | `current_date` minus the last visit | **the as-of date** minus the last visit, where the as-of date defaults to the newest date in the file |

That last row is the one real departure and it is a correction rather than a compromise. An export is a snapshot. Measuring silence against today when the file ends in March makes every customer in it look lapsed by exactly the number of days since the export was taken, which is a property of the download and not of the business. So the default as-of is the file's own last date, the visitor can type a different one, and the page prints which was used. If the file's last date is more than sixty days behind today, the page says so in a sentence.

### The claim the page is allowed to make

> The model is Tigh Sauna's, ported from the SQL that runs in its production database and checked against that SQL, row for row, by a test that runs on every pull request. Your numbers never leave this tab and neither does anything else.

That sentence is earned by Task 12 and by nothing before it. What the page may **not** say, and what `copy.test.ts` bans: "validated", "proven accurate", "predicts", "AI", "machine learning", and any form of "we know why". Three things are true and go on the page in their own words:

1. **The distance priors are stated assumptions, not fitted parameters.** 0300's own comment says so: one venue and eighteen months is not enough to fit five coefficients without overfitting. The numbers are a merchant's judgement written down so it can be argued with. On somebody else's business, in another trade, they are a starting point, and the sliders are there because of it.
2. **Nobody has checked the verdicts against what the customers actually did.** The model has never been scored against outcomes, here or in production. It reorganises what the data already says; it does not forecast.
3. **The bands are drawn for a rural Irish sauna.** 95 km is where they sit because Dublin is 98 km from Aughnacliff. For a hairdresser in a town that is nonsense, and the sliders move.

### The credit, and how one line removes it

Fergus's decision (design section 1) is to ship the model credited, because the point is that it runs on a real business's real bookings. The design also says the copy is written so removing the credit is a one-line change, so:

```ts
// content/tools/second-visit.ts
export const TIGH_CREDIT: Credit | null = { name: "...", href: "...", line: "..." };
```

Set it to `null` and the credit block, the outbound link and the schema edge all disappear, the tool keeps working, and `copy.test.ts` has a case that proves the page renders without it. Nothing else in the codebase mentions Tigh Sauna outside `content/`, apart from the provenance headers on the two SQL files, which are a record of where code came from rather than a claim on a page.

---

## The oracle, and why it is Postgres rather than DuckDB

S3 ported three of the functions to DuckDB macros, ran them against Postgres over 100,000 synthetic rows, and got zero mismatches at 1e-9 with a largest disagreement of 1.14e-13. The engine was then ruled out for its download size, and the ruling said the macros stay in the repo as the oracle and `compare.mjs` becomes T4's regression test.

This plan keeps both halves and makes one substitution, stated here because it is a deviation from the design's wording:

- **Postgres is the executed oracle.** It is what production runs, the golden files come from it, and `scripts/second-visit/compare.mjs` regenerates them from migration 0300's own SQL text inside a `postgres:16` container.
- **The DuckDB macros are committed as reference text and are not executed by CI.** S3 already established that DuckDB and Postgres agree to 1.14e-13, so running DuckDB again re-proves a settled equality at the cost of reinstalling the dependency the programme has just dropped. The file `lib/tools/second-visit/oracle/0300-macros.sql` is kept because the S3 ruling said to keep it, its header names the three dialect switches and the exact one-line command that runs it from an unsaved install, and nothing in the repository depends on it.

**The regression test is real and it runs in CI.** Two levels, two committed golden files, both produced by Postgres and never by TypeScript:

| Level | Fixture | What Postgres computes | What the test asserts |
|---|---|---|---|
| Scalar | `oracle/scalars.json`, about 700 argument tuples: every hand-picked edge of all twelve functions plus a deterministic sweep | each function over each tuple | the TypeScript port agrees to 1e-9, and every text and integer result agrees exactly |
| Pipeline | `oracle/bookings.csv`, about 2,500 rows and 400 customers over 24 months, plus `oracle/towns.csv` and `oracle/manifest.json` | the whole customer row: cohort medians, cadence, the four factors, the expected gap, the silence ratio, the verdict, the reactivation rates, `p_return` and `winnability_cents` | the same, per customer, with the row set identical |

The pipeline SQL (`oracle/pipeline.sql`) is a re-expression of 0300's `base` / `cohort` / `modelled` / `scored` / `ratioed` CTEs over a flat fixture, because `analytics.customer_metrics` and six application tables do not exist here. **It is written from the migration's text, never from the TypeScript**, and that ordering is the whole value of it. What it therefore cannot catch: a misreading shared by both, which is why Task 11 Step 1 has the implementer read the CTE and write the SQL before opening `analyse.ts`, and why Task 4's unit tests pin the literal constants against the migration independently.

`compare.mjs` has two modes. Default verifies that the committed golden files still match what Postgres produces now, which is what catches a hand-edited golden or a drifted copy of 0300. `--write` regenerates them. Neither mode ever reads the TypeScript.

---

## The second-visit estimate, and why a survival curve

The tool's headline number answers "how many first-time customers come back". The obvious way to compute it is the one every dashboard uses and it is wrong:

```
one and done = customers with exactly one visit / all customers
```

That counts somebody who first came yesterday as a customer who never returned. On a growing business the recent arrivals dominate, and the figure gets worse the faster you grow. It is not a small effect: on the demo file it reads 50% against a real figure near 73%.

So the tool prints a **Kaplan-Meier estimate of time to second visit, with right-censoring**. Every customer contributes: those with a second visit contribute an event at `days_to_second_visit`, and those without contribute a censored observation at `as_of - first_visit`, which says "at least this long, still counting". The estimate of the fraction returning by day *t* is `1 - S(t)` where

```
S(t) = product over event days d <= t of (1 - events_d / at_risk_d)
```

and `at_risk_d` is the number of customers whose observation time is at least *d*, events counted before censorings at the same day.

**The uncertainty is printed, not hidden.** Greenwood's formula gives the variance, and the interval is the complementary log-log one (Kalbfleisch-Prentice), because a plain normal interval on a proportion near 0 or 1 runs outside [0, 1] and then has to be clipped, which quietly turns "we do not know" into "we are certain":

```
sigma^2 = sum over event days d <= t of  events_d / (at_risk_d * (at_risk_d - events_d))
CI on ln(-ln S) = ln(-ln S)  +/-  z * sigma / abs(ln S)
```

exponentiated back twice. `z = 1.959963984540054` for 95%.

**The worked example the test uses, computed by hand here so a failure is diagnosable.** Eight customers: four returned, at 5, 5, 12 and 30 days; four are still out, censored at 3, 8, 20 and 40 days.

| Day | At risk | Events | S after |
|---|---|---|---|
| 5 | 7 | 2 | 5/7 = 0.7142857142857143 |
| 12 | 4 | 1 | 15/28 = 0.5357142857142857 |
| 30 | 2 | 1 | 15/56 = 0.26785714285714285 |

So the estimate of "came back within 40 days" is `1 - 15/56 = 41/56 = 0.7321428571428571`, against a naive one-and-done reading of 4/8 = 0.5. Greenwood at day 30: `2/(7*5) + 1/(4*3) + 1/(2*1) = 0.6404761904761905`. The 95% interval on S(30) works out to about **[0.0131, 0.6700]**, so the return fraction is somewhere between about 33% and 99%. That is what eight customers buys you, and printing it is the point of the tool.

Three things the page says about this number, all of them consequences rather than caveats:

- **The median time to a second visit is often "not reached".** If the curve never drops to 0.5 inside the file there is no median, and the tool says so rather than extrapolating.
- **A horizon longer than the file is meaningless.** The tool offers 30, 90, 180 and 365 days and disables any horizon beyond the longest observation, with a sentence.
- **Seasonality under a year is disabled**, per the design's own "can't see" line. `season_factor` is forced to 1.0 when the file spans fewer than twelve distinct months, and the page prints that it is off and why: a venue that has only traded through one winter has no evidence about its summer, and the month index would happily tell it otherwise.

---

## Two deviations from the design, both deliberate

Recorded here rather than discovered by a reviewer.

1. **"Terrain if there are slots" becomes a slot heat grid, not contours.** The design's terrain line points at `terrain.ts`, the marching-squares module from Tigh Sauna that T2 Relief is porting. T2 keeps its copy private at `lib/tools/relief/contour.ts` rather than in a shared `lib/terrain.ts`, so there is nothing for T4 to import, and duplicating a contour tracer into a second parallel branch buys a picture rather than an answer. The slot surface here is 7 weekdays by 24 hours, which is 168 cells: too coarse for contours to mean anything and exactly the right size for a grid. So the tool draws an SVG heat grid of visits per weekday and hour, with a second grid of the sold-out rate over it, and the number a merchant wants ("your Saturday 18:00 sold out eleven times since they last came") is a cell they can point at. If `lib/terrain.ts` ever exists as a shared module, swapping the renderer is one component.
2. **`reachability` is ported and used, with consent assumed present unless a column says otherwise.** An export almost never carries marketing consent, and 0300 makes consent a hard zero. Treating a missing consent column as "no consent" would zero every winnability figure and make the three CSVs empty, which reads as a broken tool. So the default is `reachability = 1.0` with a sentence beside the ranking saying it assumes you may contact these people and that the model in production does not assume that. If a consent column is mapped, the real function runs.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `content/tools/second-visit.ts` | The registry entry, the credit, and every string the tool and the report say. |
| `lib/tools/second-visit/types.ts` | `StatusRole`, `Booking`, `ColumnRoles`, `CustomerFacts`, `CustomerRow`, `Analysis`, `ModelParams`, the named errors. |
| `lib/tools/second-visit/numbers.ts` (+ `.test.ts`) | `percentileCont`, `medianCont`, `roundTo`, `widthBucket`, `dayFromIso`, `isoFromDay`, `monthOfYear`, `isoDow`. |
| `lib/tools/second-visit/model.ts` (+ `.test.ts`) | The twelve functions of migration 0300, ported, plus `PRODUCTION_PARAMS`. |
| `lib/tools/second-visit/csv.ts` (+ `.test.ts`) | RFC 4180 reading, CRLF and LF alike, the preamble, the header, the delimiter. |
| `lib/tools/second-visit/mapping.ts` (+ `.test.ts`) | Guessing which column is which, and refusing when it cannot. |
| `lib/tools/second-visit/towns.ts` (+ `.test.ts`) | Name normalisation, the lookup, the attribution string. |
| `lib/tools/second-visit/towns.generated.ts` | Built by `scripts/second-visit/build-towns.mjs`. Committed. |
| `lib/tools/second-visit/customers.ts` (+ `.test.ts`) | Bookings to per-customer facts, seasonality, occupancy, the squeeze. |
| `lib/tools/second-visit/km.ts` (+ `.test.ts`) | Kaplan-Meier, Greenwood, the log-log interval, the median that may not exist. |
| `lib/tools/second-visit/analyse.ts` (+ `.test.ts`) | The whole pipeline, pure, one function. |
| `lib/tools/second-visit/exports.ts` (+ `.test.ts`) | The three CSVs, the reorder radar, and the formula-injection guard. |
| `lib/tools/second-visit/report.ts` (+ `.test.ts`) | The self-contained HTML, and the escaper it depends on. |
| `lib/tools/second-visit/demo.ts` (+ `.test.ts`) | One seeded generator, used by the page's demo and by the oracle fixture. |
| `lib/tools/second-visit/oracle/0300-functions.sql` | The twelve functions, verbatim, with provenance. |
| `lib/tools/second-visit/oracle/0300-macros.sql` | S3's DuckDB translation, kept as reference, not executed. |
| `lib/tools/second-visit/oracle/pipeline.sql` | The CTE re-expression over the fixture. |
| `lib/tools/second-visit/oracle/scalars.json` | The committed argument table. |
| `lib/tools/second-visit/oracle/scalars.golden.json` | Postgres output. Never written by TypeScript. |
| `lib/tools/second-visit/oracle/bookings.csv` | The committed fixture export. |
| `lib/tools/second-visit/oracle/towns.csv` | The towns the fixture uses, so the SQL is self-contained. |
| `lib/tools/second-visit/oracle/manifest.json` | As-of day, venue town, generator seed and version. |
| `lib/tools/second-visit/oracle/pipeline.golden.json` | Postgres output. Never written by TypeScript. |
| `lib/tools/second-visit/oracle.test.ts` | The regression test at 1e-9. Runs in CI. |
| `lib/tools/second-visit/safety.test.ts` | The greps: no storage, no network, no colour literal in the report. |
| `lib/tools/second-visit/copy.test.ts` | The honesty guard on the page's words and the credit. |
| `scripts/second-visit/build-towns.mjs` | GeoNames to `towns.generated.ts`. Run rarely. |
| `scripts/second-visit/make-fixture.mjs` | The generator to the four committed fixture files. |
| `scripts/second-visit/compare.mjs` | Postgres in Docker. Verifies or regenerates the goldens. |
| `app/tools/second-visit/page.tsx` (+ `page.test.ts`) | Server component: metadata, schema, the shell, the island. |
| `app/tools/second-visit/SecondVisitTool.tsx` (+ `.test.ts`) | The one client component. |
| `app/tools/second-visit/analysis.worker.ts` | The message plumbing over `analyse`. |
| `app/tools/second-visit/run-client.ts` (+ `.test.ts`) | Worker if there is one, same thread if not, one interface either way. |
| `app/tools/second-visit/tool.css` | The tool's own rules. |

**Modified**

| Path | Change |
|---|---|
| `content/tools/index.ts` | One import line and one array entry, alphabetical. |
| `content/voice.test.ts` | The tool's prose and the report's headings join the value list. |
| `package.json` | Two script lines: `sv:fixture` and `sv:compare`. |
| `scripts/mutation-check.mjs` | Nineteen rows for T4's guards. |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md` | The words that match the code, and the evidence. |

`.github/workflows/ci.yml` is **not** modified. The `phone` job runs `--from-sitemap`, and a live tool is in the sitemap because `liveTools` puts it there, so `/tools/second-visit` joins the phone check the moment Task 1 sets `status: "live"`.

`app/globals.css` is **not** modified. Nothing here needs a shell rule.

## Interfaces this plan freezes

Nothing else in the programme consumes T4, so this block is for the reviewer and for whoever picks the tool up later. Additions are allowed; renames are not.

```ts
// lib/tools/second-visit/types.ts
export type StatusRole = "completed" | "no_show" | "cancelled" | "other";
export type Band = "local" | "catchment" | "regional" | "distant" | "visitor" | "unknown";
export type Lifecycle =
  | "prospect" | "visiting" | "loyal" | "first_time" | "repeat"
  | "committed_idle" | "squeezed" | "dormant" | "lapsed" | "at_risk";

export type Booking = {
  customerId: string;
  day: number;            // whole days since the Unix epoch, never a timestamp
  hour: number | null;
  capacity: number | null;
  status: StatusRole;
  amountCents: number | null;
  town: string | null;
  country: string | null;
  product: string | null;
  party: number;
  creditsRemaining: number;
  consent: boolean | null;
};

// lib/tools/second-visit/model.ts
export const PRODUCTION_PARAMS: ModelParams;   // exactly migration 0300's constants
export function distanceKm(lat1: number|null, lng1: number|null, lat2: number|null, lng2: number|null): number | null;
export function distanceBand(km: number|null, sameCountry: boolean|null, p?: ModelParams): Band;
export function distancePriorFactor(band: Band, p?: ModelParams): number;
export function blendPrior(raw: number|null, observedGaps: number|null, p?: ModelParams): number;
export function shrink(observed: number|null, n: number|null, prior: number|null, p?: ModelParams): number | null;
export function seasonFactor(monthIndex: number|null, p?: ModelParams): number;
export function expectedGapDays(base: number|null, distance: number|null, season: number|null, companion: number|null, p?: ModelParams): number;
export function retentionVerdict(visits: number|null, silenceRatio: number|null, committed: boolean|null, squeezed: boolean|null, dormant: boolean|null, lowEvidenceFar: boolean|null, p?: ModelParams): Lifecycle;
export function reachability(consent: boolean|null, hasEmail: boolean|null, hasPhone: boolean|null, suppressed: boolean|null): number;
export function pReturnPrior(band: Band, visits: number|null, p?: ModelParams): number;
export function smoothRate(successes: number|null, trials: number|null, prior: number|null, strength: number|null): number | null;
export function winnabilityCents(pReturn: number|null, marginCents: number|null, reach: number|null): number;

// lib/tools/second-visit/analyse.ts
export function analyse(input: AnalyseInput): Analysis;   // pure, no I/O, structured-cloneable output

// lib/tools/second-visit/km.ts
export const Z_95 = 1.959963984540054;
export function kaplanMeier(observations: readonly Observation[], z?: number): KmCurve;
export function returnedBy(curve: KmCurve, day: number): Interval;
export function medianTimeToReturn(curve: KmCurve): number | null;

// app/tools/second-visit/run-client.ts
export function makeRunner(): Runner;   // parse(), analyse(), dispose(), and a `where` of "worker" | "main"
```

---

### Task 0: Worktree, branch, baseline, and the instruments this plan depends on

**Files:**
- Create: nothing in the tree

**Interfaces:**
- Consumes: `main` with F3 merged, the S3 decision record, and a readable `C:\Dev\sauna-os`
- Produces: a sibling worktree on `toolshed/t4-second-visit` that every later task runs in, a recorded baseline test count, and four instrument readings

- [ ] **Step 1: Confirm F3 has landed and F4 has not been made a dependency**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -5
for f in content/tools/index.ts content/tools/types.ts components/tools/ToolPage.tsx \
         lib/tools/events.ts lib/analytics.ts lib/seo.ts scripts/phone-check.mjs \
         scripts/mutation-check.mjs docs/superpowers/spikes/s3-duckdb.md; do
  git cat-file -e origin/main:$f 2>/dev/null && echo "present: $f" || echo "MISSING: $f"
done
```

Expected: eight `present:` lines. Any `MISSING:` means a dependency is not merged. **Stop and say so** rather than inventing the interface T4 consumes. F4 is deliberately absent from that list: this tool has no store and must not grow one.

- [ ] **Step 2: Confirm the source of the model is where this plan says it is, and read only**

```bash
cd /c/Dev/sauna-os
git rev-parse HEAD
git status --porcelain | head -5
wc -l apps/api/migrations/0300_customer_intelligence.sql apps/api/migrations/0070_analytics_views.sql
grep -c "^create function hearth\." apps/api/migrations/0300_customer_intelligence.sql
```

Expected: a commit hash (this plan was written against `94f77a80debcd3e444e6609bd0c8b0068c4193db`; a different one is fine and is what gets recorded in the SQL headers), 952 lines in 0300, and **12** `create function hearth.` lines.

If the count is not 12, the migration has moved since this plan was written. Read it, and if a function was added, decide whether it belongs in the port before continuing. Do not carry on with eleven and call it complete.

**Nothing in this task, or any later one, writes to `C:\Dev\sauna-os`.** No `git add`, no `git checkout`, no editor. `git status --porcelain` above is there so that if the repository is already dirty from somebody else's work, that is observed now rather than blamed on this task later.

- [ ] **Step 3: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/t4-second-visit
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/t4-second-visit
```

Expected: the second command prints a sibling path of `C:\Dev\fergus-portfolio`. Every `cd` below means that path; the plan writes `$WT`. Never `git worktree remove` it.

The main checkout holds an uncommitted `scripts/analytics.mjs` and an `npm run analytics` line in `package.json`, dated 2026-08-22 and belonging to nobody in this programme. A worktree does not inherit an uncommitted file, so it will not be there. If it appears, leave it alone and say so.

- [ ] **Step 4: Install and record the baseline**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && npx vitest run --reporter=dot 2>&1 | tail -4
```

Expected: `tsc` silent, and a `Tests  N passed` line. Write `N` down. What this proves: the checkout builds and the suite is green before T4 touches anything. What it cannot see: whether `main` is green on CI, which is a different machine with a different line-ending policy.

- [ ] **Step 5: Prove the four instruments this plan leans on, before leaning on them**

`CLAIMS.md` rule 1. Three of these decide whether a later task is writable at all.

```bash
cd "$WT"
node -e 'console.log("node", process.version)'
node --input-type=module -e 'const m = await import("./package.json", { with: { type: "json" } }); console.log("json import ok")' 2>/dev/null || echo "json import: not needed, skip"
printf 'export const hello: string = "ts";\n' > .t4-strip.ts
node -e 'import("./.t4-strip.ts").then((m) => console.log("type stripping:", m.hello)).catch((e) => console.log("type stripping FAILED:", e.message))'
rm -f .t4-strip.ts
docker --version || echo "docker: absent"
git config --get core.autocrlf
```

Expected and what each one gates:

- **`node v24.x`.** CI is on Node 24 (`.github/workflows/ci.yml`).
- **`type stripping: ts`.** Node strips TypeScript types from `.ts` files by default from 23.6. Tasks 11 and 13 use it so the fixture generator can be one module in TypeScript rather than a duplicate in `.mjs`. If it prints `FAILED`, **stop and record it**: the fallback is to run the generator through `npx vitest run` with a guarded test, which is uglier, and choosing it should be a decision rather than a surprise.
- **`docker --version`.** Only Task 11 needs it, and only for regenerating the golden files. `absent` here is not a blocker for Tasks 1 to 10; it is a blocker for Task 11 and it is better known now.
- **`core.autocrlf` prints `true`.** That is why every source-reading test in this plan normalises line endings. If it prints `false` or nothing, the normalisation is harmless and stays: CI is Linux and the guard has to hold on both.

- [ ] **Step 6: Note the interaction with T1, T2 and T3, which are building in parallel**

```bash
cd "$WT"
grep -n "order: " content/tools/*.ts
```

T1 Drift takes `order: 20`, T2 Relief and T3 Overlap both specify `order: 30` and whichever lands second takes the next free multiple of ten. **T4 takes 50**, which leaves 40 free for whichever of T2 and T3 has to move. `content/tools/index.test.ts` fails on a duplicate order, so a collision cannot pass quietly; if 50 is taken by the time this merges, take 60 and record it in the ledger.

T4 touches no file that T1, T2 or T3 touch except `content/tools/index.ts` (one import line, one array entry, alphabetical) and `content/voice.test.ts` (one entry in a list) and `scripts/mutation-check.mjs` (an append at the end of the array). All three are the collision points the design's section 8 predicted, and all three resolve by taking both sides.

---

### Task 1: The registry entry, the copy, the credit, and the honesty guard

**Files:**
- Create: `content/tools/second-visit.ts`
- Create: `lib/tools/second-visit/copy.test.ts`
- Modify: `content/tools/index.ts` (one import line, one array entry)
- Modify: `content/voice.test.ts` (the tool's prose joins the value list)

**Interfaces:**
- Consumes: `ToolEntry`, `tools`, `toolShellCopy` (F3)
- Produces: `secondVisit: ToolEntry` with `status: "live"`, `privacy: "browser"`, `order: 50`; `secondVisitCopy` (every string the tool and the report say); `TIGH_CREDIT: Credit | null`

The copy comes first because it is the specification. Every honesty rule in the section above is a sentence somewhere in this file, and `copy.test.ts` is the thing that stops a later edit from quietly upgrading a careful claim into a confident one.

- [ ] **Step 1: Write the failing honesty test**

```ts
// lib/tools/second-visit/copy.test.ts
import { describe, expect, it } from "vitest";
import { TIGH_CREDIT, secondVisit, secondVisitCopy } from "@/content/tools/second-visit";
import { tools, toolBySlug } from "@/content/tools";

/**
 * The honesty guard.
 *
 * This tool makes a claim no other tool on the site makes: that it is running
 * somebody's production model. That claim is worth exactly as much as the test
 * behind it, so the words are pinned here and there are mutation rows on two
 * of them.
 *
 * The banned list is not squeamishness. Every word on it says something this
 * tool cannot support: that the verdicts were checked against outcomes, that
 * anything is being forecast, or that a statistical model is an intelligence.
 * The required sentences are the three limits the plan argues for, and if one
 * goes missing the page is overselling by omission.
 */

/** Every string a visitor can read, flattened. */
function everyLine(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(secondVisitCopy);
  walk(secondVisit.blurb);
  walk(secondVisit.cantSee);
  if (TIGH_CREDIT) walk(TIGH_CREDIT.line);
  return out;
}

describe("the words this tool is allowed to use", () => {
  const banned: [string, RegExp][] = [
    ["validated", /\bvalidat(e|ed|ion)\b/i],
    ["proven accurate", /\bproven accurate\b/i],
    ["predicts", /\bpredict(s|ion|ive)?\b/i],
    ["forecast", /\bforecast(s|ing)?\b/i],
    ["machine learning", /\bmachine learning\b/i],
    ["AI", /\bA\.?I\.?\b/],
    ["artificial intelligence", /\bartificial intelligence\b/i],
    ["guarantee", /\bguarantee(s|d)?\b/i],
  ];

  for (const [label, pattern] of banned) {
    it(`never says "${label}"`, () => {
      const offenders = everyLine().filter((line) => pattern.test(line));
      expect(offenders, `"${label}" in:\n${offenders.join("\n")}`).toEqual([]);
    });
  }

  /**
   * Written out rather than referenced, so moving the constant cannot make
   * this pass. The same trap T2 recorded on MIN_EVENTS and T3 on
   * HASH_HEX_CHARS.
   */
  const required = [
    "Your file never leaves this tab.",
    "The model has never been scored against what customers went on to do.",
    "The distance bands were drawn for a rural Irish sauna.",
    "One winter is no evidence at all about your summer.",
  ];

  for (const sentence of required) {
    it(`says: ${sentence}`, () => {
      expect(everyLine().join("\n")).toContain(sentence);
    });
  }

  it("tells the visitor that forget has nothing to wipe here", () => {
    expect(everyLine().join("\n")).toContain("nothing to wipe here");
  });
});

describe("the credit", () => {
  it("is one value, so removing it is one line", () => {
    // If this ever becomes a string spread through the copy, the design's
    // "removing the credit is a one-line change" stops being true.
    expect(TIGH_CREDIT === null || typeof TIGH_CREDIT === "object").toBe(true);
    if (TIGH_CREDIT) {
      expect(TIGH_CREDIT.href).toMatch(/^https:\/\//);
      expect(TIGH_CREDIT.name.length).toBeGreaterThan(0);
      expect(TIGH_CREDIT.line.length).toBeGreaterThan(0);
    }
  });

  it("is the only place the credited business is named", () => {
    const named = everyLine().filter((line) => /tigh/i.test(line));
    const expected = TIGH_CREDIT ? [TIGH_CREDIT.line] : [];
    expect(named).toEqual(expected);
  });

  it("does not claim the model was checked against anything but the SQL", () => {
    if (!TIGH_CREDIT) return;
    expect(TIGH_CREDIT.line).toContain("row for row");
    expect(TIGH_CREDIT.line).not.toMatch(/\bcorrect\b/i);
  });
});

describe("the registry entry", () => {
  it("is registered, live, browser-only and at order 50", () => {
    expect(toolBySlug("second-visit")).toBe(secondVisit);
    expect(secondVisit.status).toBe("live");
    expect(secondVisit.privacy).toBe("browser");
    expect(secondVisit.order).toBe(50);
    expect(tools.map((t) => t.order)).toEqual([...tools.map((t) => t.order)].sort((a, b) => a - b));
  });

  it("names six things it cannot see, and the design's three among them", () => {
    expect(secondVisit.cantSee).toHaveLength(6);
    const all = secondVisit.cantSee.join("\n");
    expect(all).toContain("Why anyone left");
    expect(all).toContain("no town");
    expect(all).toContain("fewer than twelve months");
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/copy.test.ts`
Expected: FAIL with `Cannot find module '@/content/tools/second-visit'`.

- [ ] **Step 3: Write the content file**

```ts
// content/tools/second-visit.ts
import type { ToolEntry } from "./types";

/**
 * `/tools/second-visit`: every string, in one place.
 *
 * The house rule is that copy lives in `content/`; this file also carries the
 * two things that make the tool's central claim removable and checkable. The
 * credit is one value, so setting it to null takes the credited business off
 * the page entirely, and the honesty block is prose rather than a footnote,
 * because the limits of this model are the interesting part of it.
 */

export type Credit = { name: string; href: string; line: string };

/**
 * Set this to `null` and the credit block, the outbound link and the
 * `isBasedOn` edge in the page's schema all disappear together. Nothing else
 * has to change and `lib/tools/second-visit/copy.test.ts` proves it.
 */
export const TIGH_CREDIT: Credit | null = {
  name: "Tigh Sauna",
  href: "https://tighsauna.com",
  line:
    "The model is Tigh Sauna's, a booking system for Irish saunas. It was ported from the SQL that runs in that product's database, and a test in this repository checks the port against that SQL, row for row, on every pull request.",
};

export const secondVisit: ToolEntry = {
  slug: "second-visit",
  name: "Second visit",
  blurb:
    "Drop a bookings or orders export and find out how many first-time customers actually come back, with the uncertainty printed beside the number instead of hidden behind it. The retention model is a real one, taken from a business that runs on it.",
  privacy: "browser",
  cantSee: [
    "Why anyone left. Every verdict here is a shape in your own dates. Somebody who moved house and somebody who had a bad time look identical from the outside, and nothing in this tool can tell them apart.",
    "Anyone whose town is not in the table, and anyone with no town at all. Distance is worked out from town centroids, so a row with no match gets no distance and is judged on behaviour alone. That is deliberate: not knowing where somebody lives is a gap in your records, and it must not be charged to the customer as suspicion.",
    "Your summer, if your file covers fewer than twelve months. The season factor is switched off below that and the page says so. One winter is no evidence at all about your summer.",
    "The difference between a no-show and a completed visit, unless your export has a status column and you map it. Without one, every row that is not cancelled counts as a visit, which is a slightly kinder reading than the model uses in production.",
    "Anything that is not in the file. No addresses, no marketing consent, no memberships or prepaid credits unless a column carries them, and nothing at all about people who have never booked.",
    "Whether any of the verdicts are right. The model has never been scored against what customers went on to do. It reorganises what your dates already say, which is useful, and it is not the same thing as being correct.",
  ],
  status: "live",
  order: 50,
};

export const secondVisitCopy = {
  /** The three steps, in the order the page asks them. */
  steps: {
    file: {
      title: "1. Your export",
      hint: "A CSV from your booking system, your till or your shop. One row per booking or order. Your file never leaves this tab.",
      button: "Choose a file",
      demo: "Or try it on a made-up sauna",
      demoNote: "A generated file, 180 customers over two years. Nothing in it is a real person.",
    },
    columns: {
      title: "2. Which column is which",
      hint: "Guessed from the headers. Change anything that is wrong. Only the first two are needed.",
      required: "Needed",
      optional: "Optional, and each one switches something on",
    },
    where: {
      title: "3. Where you are, and when the file ends",
      townLabel: "The town your business is in",
      townHint: "Distance bands are worked out from here. Leave it blank and everybody is judged on behaviour alone.",
      asOfLabel: "Treat the file as ending on",
      asOfHint: "Defaults to the newest date in your file, because that is when the export was taken. Silence is measured to this date.",
      staleWarning:
        "This file ends more than two months ago, so every silence in it is measured to that date rather than to today.",
    },
  },

  /** The headline block. */
  headline: {
    title: "How many come back",
    kmLabel: "Estimated share of first-time customers who return",
    naiveLabel: "The figure a dashboard would show you",
    naiveNote:
      "That second number counts somebody who first came last week as a customer who never returned. On a growing business it gets worse the faster you grow.",
    intervalLabel: "95% interval",
    medianLabel: "Half of those who return do so within",
    medianNotReached: "not reached inside this file",
    horizonLabel: "by day",
    horizonDisabled: "Longer than your file covers.",
  },

  /** The honesty block, which is prose and sits above the results. */
  honesty: {
    title: "What this is, and what it is not",
    body: [
      "Your file never leaves this tab. It is read in a background thread in your own browser, the numbers are worked out there, and nothing is uploaded, stored or sent anywhere. The forget command has nothing to wipe here, because this tool writes nothing to your machine at all.",
      "The distance bands were drawn for a rural Irish sauna: fifteen kilometres is habit range, ninety-five is the point where Dublin stops being a catchment and starts being a day out. For your business those numbers may be nonsense, which is why every one of them is a slider.",
      "The priors are stated assumptions rather than fitted parameters, and the people who wrote them say so in the code. One venue and eighteen months is not enough history to fit five coefficients without overfitting, so somebody wrote down what they believed and left it arguable.",
      "The model has never been scored against what customers went on to do. Nobody has taken a list of people it called lapsed and checked how many were. It reorganises the dates you already have, which is worth doing, and it is a different thing from knowing what happens next.",
    ],
    changed:
      "You have moved a slider, so these numbers are no longer the ones the production model would give.",
  },

  /** Verdicts, in the model's own order. */
  verdicts: {
    prospect: { label: "Never booked", note: "In your file with no attended booking." },
    visiting: {
      label: "Was always visiting",
      note: "Too far away and too little history to call this a habit that broke. Chasing them costs goodwill.",
    },
    loyal: { label: "Loyal", note: "Ten visits or more and inside their own window." },
    first_time: { label: "First time", note: "One visit, and not yet late by their own clock." },
    repeat: { label: "Repeat", note: "Coming back, and inside their own window." },
    committed_idle: {
      label: "Paid and not coming",
      note: "They hold credits or a membership and have gone quiet. The cheapest and the most urgent list here.",
    },
    squeezed: {
      label: "Shut out",
      note: "Their usual slot kept selling out after they stopped coming. The fix is the timetable, not a discount.",
    },
    dormant: {
      label: "Out of season",
      note: "They only ever come when you are busy. Expected back, so the reminder is a seasonal one.",
    },
    lapsed: { label: "Lapsed", note: "Well past their own window with no reason found." },
    at_risk: { label: "At risk", note: "Past their own window with no reason found." },
  },

  /** The three files out. */
  exports: {
    lapsed: {
      name: "Lapsed regulars",
      file: "lapsed-regulars.csv",
      note: "People with a real rhythm who are well past it, ranked by what winning them back is worth.",
    },
    nudges: {
      name: "Second-visit nudges",
      file: "second-visit-nudges.csv",
      note: "One visit, still inside a plausible window, nothing yet to worry about. This is the list where a nudge is cheapest.",
    },
    stalls: {
      name: "Stall risks",
      file: "stall-risks.csv",
      note: "Two or three visits and drifting. The point where a habit either forms or does not.",
    },
    assumesConsent:
      "This ranking assumes you are allowed to contact these people. Your export does not say whether you are, and the model in production refuses to guess.",
  },

  /** The saved report. */
  report: {
    button: "Save the report",
    file: "second-visit-report.html",
    note: "One HTML file with the numbers in it. It opens in any browser with no internet connection and no scripts. It contains your customers' identifiers, so treat it like the export it came from.",
    title: "Second visit report",
    sections: {
      summary: "The headline",
      curve: "Time to a second visit",
      bands: "By distance",
      verdicts: "Verdicts",
      slots: "Slots",
      products: "Reorder radar",
      settings: "Settings used",
      limits: "What this cannot see",
    },
  },

  /** The sliders. Every one moves a constant the model shipped with. */
  sliders: {
    title: "The constants, if you disagree with them",
    reset: "Put the production values back",
    shrinkK: "How many visits it takes to outweigh the starting assumption",
    localKm: "Local, up to",
    catchmentKm: "Catchment, up to",
    regionalKm: "Regional, up to",
    distantFactor: "A distant customer takes this many times longer",
    visitorFactor: "Somebody from another country takes this many times longer",
    companionFactor: "A pair takes this many times longer than a solo visitor",
    lapsedRatio: "Lapsed once they are this far past their own window",
    loyalVisits: "Loyal from this many visits",
    floorDays: "Never expect anybody back sooner than",
    capDays: "Never expect anybody back later than",
  },

  /** Refusals. Each names the thing to do about it. */
  refusals: {
    noFile: "No file yet.",
    empty: "That file has no rows in it.",
    noHeader: "No header row found. The first row of the file should name the columns.",
    noCustomer: "Pick the column that identifies the customer. Without it there is nothing to follow.",
    noDate: "Pick the column with the booking or order date.",
    badDates: "None of the values in that column parsed as a date. Pick a different one.",
    tooFew:
      "Under twenty customers with a booking, there is nothing here a survival curve could honestly say. Come back with more of the file.",
    tooBig: "That file is over 60 MB. Nothing here can hold it. Export a narrower date range.",
    failed: "Something went wrong reading that file, and it stopped rather than guessing.",
  },

  /** Small labels used in more than one place. */
  labels: {
    rows: "rows read",
    customers: "customers",
    used: "used",
    ignored: "ignored",
    parseMs: "read in",
    modelMs: "modelled in",
    seasonOff: "Season factor off: this file covers fewer than twelve months.",
    seasonOn: "Season factor on.",
    unknownTown: "no town matched",
    towns: "Town coordinates from GeoNames, CC BY 4.0.",
  },
} as const;
```

- [ ] **Step 4: Register it, alphabetically**

In `content/tools/index.ts`, add the import in alphabetical order among the existing ones and add the entry to the array:

```ts
import { headlineCheck } from "./headline-check";
import { secondVisit } from "./second-visit";
```

```ts
const entries: ToolEntry[] = [headlineCheck, secondVisit];
```

If T1, T2 or T3 have already landed, their lines are there too and both the import block and the array stay alphabetical. `content/tools/index.test.ts` checks the source for that, so a mis-sorted line is red rather than a future conflict.

- [ ] **Step 5: Add the copy to the voice check**

`content/voice.test.ts` already walks `tools` for `name`, `blurb` and `cantSee`. The rest of `secondVisitCopy` is prose a visitor reads and is not covered by that walk, so add it to the `prose` array beside the `toolShellCopy` entries:

```ts
import { secondVisitCopy, TIGH_CREDIT } from "@/content/tools/second-visit";
```

```ts
    ...(function flattenSecondVisit(): { where: string; text: string }[] {
      // The tool's copy is nested, so it is flattened by path rather than
      // listed field by field: a new string added to it is covered without
      // anybody remembering to come back here.
      const out: { where: string; text: string }[] = [];
      const walk = (node: unknown, path: string) => {
        if (typeof node === "string") out.push({ where: `secondVisitCopy.${path}`, text: node });
        else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
        else if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
        }
      };
      walk(secondVisitCopy, "");
      if (TIGH_CREDIT) out.push({ where: "TIGH_CREDIT.line", text: TIGH_CREDIT.line });
      return out;
    })(),
```

- [ ] **Step 6: Run them to watch them pass**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/tools/second-visit/copy.test.ts content/tools/index.test.ts content/voice.test.ts
```

Expected: PASS on all three. What this proves: the words are the ones the plan argues for, the credit is one removable value, and none of the copy carries an em dash or an American spelling. What it cannot see: whether any of the sentences are true, which is the job of every task after this one.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add content/tools/second-visit.ts content/tools/index.ts content/voice.test.ts lib/tools/second-visit/copy.test.ts
git commit -m "feat(second-visit): the registry entry, the copy, and a guard on what it may claim"
```

---

### Task 2: The oracle's SQL, copied out of the migration with its provenance

**Files:**
- Create: `lib/tools/second-visit/oracle/0300-functions.sql`
- Create: `lib/tools/second-visit/oracle/0300-macros.sql`

**Interfaces:**
- Consumes: `C:\Dev\sauna-os` at the commit recorded in Task 0 Step 2
- Produces: the twelve function bodies as text, in a form Postgres can load, and the DuckDB translation S3 wrote, kept as reference

This is a copy, not a rewrite. Every character of the twelve function bodies comes out of the migration unchanged. The only additions are a `create schema` line, a provenance header, and the removal of the `comment on function` statements, which need nothing here.

**Read the migration before copying it, top to bottom.** It is 952 lines and about two thirds of it is an argument for the numbers. That argument is what Task 4 is porting; the SQL is only how it is written down.

- [ ] **Step 1: Copy the twelve functions**

```bash
cd "$WT"
mkdir -p lib/tools/second-visit/oracle
grep -n "^create function hearth\." /c/Dev/sauna-os/apps/api/migrations/0300_customer_intelligence.sql
```

Then write the file. The header records where it came from; the bodies below it are verbatim.

```sql
-- lib/tools/second-visit/oracle/0300-functions.sql
--
-- The oracle for /tools/second-visit.
--
-- Copied verbatim from Tigh Sauna's migration 0300, which is the SQL that runs
-- in that product's production database:
--
--   repository  C:\Dev\sauna-os  (fergo5002/sauna-os)
--   file        apps/api/migrations/0300_customer_intelligence.sql
--   commit      94f77a80debcd3e444e6609bd0c8b0068c4193db
--   migration   dated 2026-08-11
--   copied      2026-09-04, by the T4 implementer
--
-- Nothing in this file is executed by the site and nothing imports it. It is
-- loaded into a throwaway Postgres 16 container by scripts/second-visit/compare.mjs,
-- which computes the golden files that lib/tools/second-visit/oracle.test.ts
-- checks the TypeScript port against. That is the whole reason it exists: the
-- port is trusted because this ran, not because it was read carefully.
--
-- Four things were changed, and only these four:
--   1. `create schema hearth;` added, because there is no migration 0100 here.
--   2. The `comment on function` statements dropped. They document a database
--      nobody is reading here.
--   3. `hearth.retention_basis` not copied. It takes the row type of
--      analytics.customer_intelligence, which does not exist in this fixture,
--      and its output is prose rather than a number. The tool writes its own
--      sentences from content/tools/second-visit.ts.
--   4. The prose comments kept. They are the argument for every constant below
--      and deleting them would leave twelve unexplained numbers.
--
-- If the commit above no longer matches what is in the sauna repository, the
-- port may be behind. `node scripts/second-visit/compare.mjs` is what settles
-- it: re-copy, re-run, and the golden files either move or they do not.

create schema if not exists hearth;

-- <the twelve `create function hearth.*` blocks, with their `/* */` comments,
--  pasted here in the order they appear in the migration:
--    distance_km, distance_band, distance_prior_factor, blend_prior, shrink,
--    season_factor, expected_gap_days, retention_verdict, reachability,
--    p_return_prior, smooth_rate, winnability_cents>
```

**The instruction for that last block is literal: paste the text, do not retype it.** A retyped `4.00` that becomes `4.0` changes nothing and a retyped `0.6` that becomes `0.06` changes everything, and neither is visible in review. Use the line numbers from the `grep` above and copy the ranges out of the file.

- [ ] **Step 2: Prove the copy loads and answers**

```bash
cd "$WT"
docker run --rm -d --name t4-pg-smoke -e POSTGRES_PASSWORD=t4 -p 55433:5432 postgres:16
for i in $(seq 1 40); do docker exec t4-pg-smoke pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec -i t4-pg-smoke psql -U postgres -v ON_ERROR_STOP=1 < lib/tools/second-visit/oracle/0300-functions.sql
docker exec -i t4-pg-smoke psql -U postgres -At -c "
  select hearth.shrink(3.0, 1, 30.0),
         hearth.blend_prior(4.0, 2),
         hearth.expected_gap_days(30.0, 4.0, 1.0, 1.0),
         hearth.distance_band(98.0, true),
         hearth.retention_verdict(1, 2.5, false, false, false, true),
         hearth.season_factor(0.5),
         hearth.winnability_cents(0.25, 4000, 0.6);"
docker stop t4-pg-smoke
```

Expected, and each of these is worked out by hand from the migration's text so it checks the paste rather than the database:

- `hearth.shrink(3.0, 1, 30.0)` = `(1 * 3 + 2 * 30) / (1 + 2)` = **21.000...**
- `hearth.blend_prior(4.0, 2)` = `1 + 3 * (2 / 4)` = **2.5**
- `hearth.expected_gap_days(30, 4, 1, 1)` = `least(540, greatest(3, 120))` = **120**
- `hearth.distance_band(98.0, true)` = **distant** (Dublin from Aughnacliff, the boundary the comment names)
- `hearth.retention_verdict(1, 2.5, false, false, false, true)` = **visiting**, because `low_evidence_far` is checked before lateness. If this comes back `lapsed`, the branches were pasted in the wrong order and the whole argument of the migration has been inverted.
- `hearth.season_factor(0.5)` = `least(3, greatest(0.6, 2))` = **2**
- `hearth.winnability_cents(0.25, 4000, 0.6)` = `round(600)` = **600**

What this proves: the file loads into a real Postgres and seven hand-computed values come back right, so the paste is not corrupt. What it cannot see: the nine other functions, and any function whose body was pasted from the wrong line range but still parses. Task 11 covers those by running all twelve over 700 arguments.

- [ ] **Step 3: Write the DuckDB macros file, as reference**

S3 produced these and the ruling said to keep them. They are not executed here, and the header says so plainly so nobody spends an afternoon wiring them into CI.

```sql
-- lib/tools/second-visit/oracle/0300-macros.sql
--
-- The same twelve functions as DuckDB macros. NOT EXECUTED BY ANYTHING.
--
-- Spike S3 (docs/superpowers/spikes/s3-duckdb.md, 2026-09-03) ported these,
-- ran them in the browser against 100,000 synthetic rows, and compared them
-- with Postgres: zero mismatches at 1e-9, largest disagreement 1.14e-13, which
-- is `numeric` against `double` and nothing else. DuckDB was then ruled out for
-- Second Visit because the engine costs 8.1 MB gzip and took a median of 82
-- seconds to load at Chrome's Slow 4G profile, and the phone is the product
-- surface. The macros stay because the ruling said they stay: they are the
-- reference translation, and they are the thing that established that the SQL
-- was never the risk.
--
-- Three dialect switches, and there are no others:
--   ::numeric        -> ::double
--   percentile_cont  -> quantile_cont   (not used by these twelve)
--   date - date      -> datediff('day', a, b)  (not used by these twelve)
--
-- To take the third opinion by hand, without adding a dependency:
--
--   npm i --no-save @duckdb/duckdb-wasm
--   node scripts/second-visit/compare.mjs --duckdb
--
-- `--duckdb` is unimplemented on purpose. Wiring it up is about forty lines of
-- worker plumbing (S3's record has the shape that works, including the three
-- false starts) and it re-proves an equality that is already recorded. Do it if
-- the Postgres leg ever disagrees with the port and you want a tie-breaker.

-- <the twelve macros, bodies identical to 0300-functions.sql apart from the
--  ::numeric to ::double switch, written as CREATE MACRO ... AS (expression)>
```

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/oracle/0300-functions.sql lib/tools/second-visit/oracle/0300-macros.sql
git commit -m "feat(second-visit): the production model's SQL, copied with its provenance, and the macros S3 wrote"
```

---

### Task 3: Dates, medians and the two roundings Postgres does that JavaScript does not

**Files:**
- Create: `lib/tools/second-visit/types.ts`
- Create: `lib/tools/second-visit/numbers.ts`
- Test: `lib/tools/second-visit/numbers.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Booking`, `StatusRole`, `Band`, `Lifecycle`, `ColumnRoles` and the other shared types; `dayFromIso`, `isoFromDay`, `monthOfYear`, `isoDow`, `detectDateStyle`, `parseDay`, `percentileCont`, `medianCont`, `roundTo`, `widthBucket`

Three things in this module decide whether the port can ever agree with Postgres, and all three are easy to get almost right:

1. **Dates are whole days since the epoch, never timestamps.** Postgres subtracts two `date` values and gets an integer. A tool that subtracts two `Date` objects gets milliseconds and, twice a year, an hour of drift that turns a 14-day gap into 13.958. Every date in this tool is an integer from the moment it is parsed.
2. **`percentile_cont` interpolates.** It is not "the middle element". With an even count it is the average of the two middles, and at other fractions it is a weighted blend. Nearest-rank is a different function and it moves every cohort median.
3. **`round(numeric, n)` is half away from zero on an exact decimal.** JavaScript's `Math.round(x * 1000) / 1000` is neither: it is half up, and the multiply introduces its own error. `Number(x.toFixed(n))` is half away from zero on the double's true value, which is the closest thing available and agrees with Postgres everywhere except on a value that is exactly a decimal tie. That divergence is real, it is documented in the module, and Task 12 is what finds out whether the fixture ever hits it.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/numbers.test.ts
import { describe, expect, it } from "vitest";
import {
  dayFromIso,
  detectDateStyle,
  isoDow,
  isoFromDay,
  medianCont,
  monthOfYear,
  parseDay,
  percentileCont,
  roundTo,
  widthBucket,
} from "./numbers";

describe("days since the epoch", () => {
  it("puts the epoch at zero and counts whole days", () => {
    expect(dayFromIso("1970-01-01")).toBe(0);
    expect(dayFromIso("1970-01-02")).toBe(1);
    expect(dayFromIso("2026-09-04")).toBe(20700);
  });

  it("round-trips", () => {
    for (const iso of ["1970-01-01", "2000-02-29", "2026-12-31", "2026-03-29"]) {
      expect(isoFromDay(dayFromIso(iso) as number)).toBe(iso);
    }
  });

  /**
   * 2026-03-29 is the night the clocks go forward in Ireland. Subtracting two
   * Date objects across it gives 23 hours, and 23/24 of a day rounds to the
   * wrong integer in either direction depending on which way you round. Whole
   * days from the epoch have no such night in them.
   */
  it("is not disturbed by a daylight saving change", () => {
    expect((dayFromIso("2026-03-30") as number) - (dayFromIso("2026-03-29") as number)).toBe(1);
    expect((dayFromIso("2026-10-26") as number) - (dayFromIso("2026-10-25") as number)).toBe(1);
  });

  it("refuses a date that does not exist rather than rolling it over", () => {
    expect(dayFromIso("2026-02-30")).toBeNull();
    expect(dayFromIso("2026-13-01")).toBeNull();
    expect(dayFromIso("not a date")).toBeNull();
    expect(dayFromIso("")).toBeNull();
  });

  it("knows the day of the week, ISO style, Monday is 1", () => {
    expect(isoDow(dayFromIso("1970-01-01") as number)).toBe(4); // a Thursday
    expect(isoDow(dayFromIso("2026-09-07") as number)).toBe(1); // a Monday
    expect(isoDow(dayFromIso("2026-09-13") as number)).toBe(7); // a Sunday
  });

  it("knows the month, one-based", () => {
    expect(monthOfYear(dayFromIso("2026-01-15") as number)).toBe(1);
    expect(monthOfYear(dayFromIso("2026-12-31") as number)).toBe(12);
  });
});

describe("reading whatever the export calls a date", () => {
  it("takes ISO with or without a time on the end", () => {
    expect(parseDay("2026-03-14", "iso")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("2026-03-14T18:30:00Z", "iso")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("2026-03-14 18:30", "iso")).toBe(dayFromIso("2026-03-14"));
  });

  it("takes day-first and month-first, once told which", () => {
    expect(parseDay("14/03/2026", "dmy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("03/14/2026", "mdy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("14-03-2026", "dmy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("4/3/26", "dmy")).toBe(dayFromIso("2026-03-04"));
  });

  /**
   * The ambiguity is decided per column and never per value, because a column
   * that reads day-first on row 4 and month-first on row 900 produces gaps
   * nobody can explain. 01/02/2026 alone is undecidable and the tool says so.
   */
  it("decides the style from the whole column", () => {
    expect(detectDateStyle(["2026-03-14", "2026-04-01"])).toEqual({ style: "iso", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "13/02/2026"])).toEqual({ style: "dmy", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "02/13/2026"])).toEqual({ style: "mdy", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "03/04/2026"])).toEqual({ style: "dmy", ambiguous: true });
    expect(detectDateStyle(["banana", ""])).toEqual({ style: "iso", ambiguous: false });
  });

  /**
   * An ISO date matches a naive slashed-date pattern too, and a column that is
   * mostly ISO with one stray must not be read as day-first because of the
   * stray. It is the majority that decides.
   */
  it("is not talked out of ISO by one odd row", () => {
    expect(detectDateStyle(["2026-01-04", "2026-02-01", "04/02/2026"])).toEqual({
      style: "iso",
      ambiguous: false,
    });
  });

  it("refuses a column where nothing parses", () => {
    expect(parseDay("banana", "iso")).toBeNull();
    expect(parseDay("", "dmy")).toBeNull();
    expect(parseDay("32/01/2026", "dmy")).toBeNull();
  });
});

describe("percentileCont, which is what Postgres means by a median", () => {
  it("averages the two middles on an even count, and does not pick one", () => {
    // Nearest-rank would answer 2. percentile_cont answers 2.5.
    expect(percentileCont([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(medianCont([1, 2, 3, 4])).toBe(2.5);
  });

  it("takes the middle on an odd count", () => {
    expect(percentileCont([1, 2, 3], 0.5)).toBe(2);
  });

  it("interpolates between neighbours away from the middle", () => {
    // idx = 0.25 * (5 - 1) = 1, exactly on the second element.
    expect(percentileCont([10, 20, 30, 40, 50], 0.25)).toBe(20);
    // idx = 0.3 * 4 = 1.2, so 20 + 0.2 * (30 - 20).
    expect(percentileCont([10, 20, 30, 40, 50], 0.3)).toBeCloseTo(22, 12);
  });

  it("sorts for itself, so a caller cannot break it by passing unsorted input", () => {
    expect(medianCont([4, 1, 3, 2])).toBe(2.5);
  });

  it("is null on nothing, and the value itself on one", () => {
    expect(medianCont([])).toBeNull();
    expect(medianCont([7])).toBe(7);
  });

  it("hits both ends", () => {
    expect(percentileCont([1, 2, 3], 0)).toBe(1);
    expect(percentileCont([1, 2, 3], 1)).toBe(3);
  });
});

describe("roundTo, which has to be half away from zero", () => {
  it("rounds a half up, away from zero", () => {
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(3.5, 0)).toBe(4);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });

  it("rounds to a given number of places", () => {
    expect(roundTo(1.23456, 3)).toBe(1.235);
    expect(roundTo(0.0625, 3)).toBe(0.063);
    expect(roundTo(120.46, 1)).toBe(120.5);
    expect(roundTo(120.44, 1)).toBe(120.4);
  });

  /**
   * The documented divergence, pinned so nobody "fixes" it by accident.
   *
   * Postgres numeric is exact decimal, so round(1.0005, 3) is 1.001. The double
   * nearest to 1.0005 is 1.00049999999999994493, so toFixed sees a value below
   * the tie and gives 1.000. Every input this tool rounds is a computed product
   * of several factors, which lands on an exact decimal tie with probability
   * near zero, and Task 12's oracle asserts the rounded columns exactly so a
   * real occurrence is a red test rather than a silent 0.001.
   */
  it("differs from Postgres on an exact decimal tie, and that is known", () => {
    // Postgres numeric holds 1.0005 exactly and rounds up to 1.001. The nearest
    // double is 1.00049999999999994, a hair below the tie, so this rounds down.
    expect(roundTo(1.0005, 3)).toBe(1);
    // The same thing one decimal along: 120.05 as a double is 120.049999...
    expect(roundTo(120.05, 1)).toBe(120);
  });

  it("leaves the absurd alone rather than producing exponent notation", () => {
    expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
    expect(roundTo(1e22, 2)).toBe(1e22);
  });
});

describe("widthBucket, the way the reactivation table buckets an overdue count", () => {
  const bounds = [30, 60, 120, 240];

  it("puts a value below the first bound in bucket zero", () => {
    expect(widthBucket(0, bounds)).toBe(0);
    expect(widthBucket(29.999, bounds)).toBe(0);
  });

  it("is inclusive at the bottom of each bucket", () => {
    expect(widthBucket(30, bounds)).toBe(1);
    expect(widthBucket(59.999, bounds)).toBe(1);
    expect(widthBucket(60, bounds)).toBe(2);
    expect(widthBucket(120, bounds)).toBe(3);
    expect(widthBucket(239.999, bounds)).toBe(3);
  });

  it("puts everything past the last bound in the last bucket", () => {
    expect(widthBucket(240, bounds)).toBe(4);
    expect(widthBucket(100000, bounds)).toBe(4);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/numbers.test.ts`
Expected: FAIL with `Cannot find module './numbers'`.

- [ ] **Step 3: Write the types**

```ts
// lib/tools/second-visit/types.ts

/**
 * The shared vocabulary of `/tools/second-visit`.
 *
 * Two rules hold across every type here. Dates are whole days since the Unix
 * epoch, never `Date` objects and never timestamps, because Postgres subtracts
 * dates and gets integers and this port has to agree with it. And nothing in
 * an `Analysis` is a `Map`, a `Set`, a `Date` or a function, because an
 * `Analysis` crosses a Web Worker boundary by structured clone and then goes
 * into a saved report by `JSON.stringify`.
 */

/** How a row's status column was read. Absent status column means `completed`. */
export type StatusRole = "completed" | "no_show" | "cancelled" | "other";

export type Band = "local" | "catchment" | "regional" | "distant" | "visitor" | "unknown";

export type Lifecycle =
  | "prospect"
  | "visiting"
  | "loyal"
  | "first_time"
  | "repeat"
  | "committed_idle"
  | "squeezed"
  | "dormant"
  | "lapsed"
  | "at_risk";

export type DateStyle = "iso" | "dmy" | "mdy";

/** Which column in the visitor's file plays which part. `null` means absent. */
export type ColumnRoles = {
  customer: number;
  date: number;
  amount: number | null;
  slotStart: number | null;
  capacity: number | null;
  status: number | null;
  town: number | null;
  country: number | null;
  product: number | null;
  party: number | null;
  credits: number | null;
  consent: number | null;
  email: number | null;
  phone: number | null;
};

export type Booking = {
  customerId: string;
  day: number;
  hour: number | null;
  capacity: number | null;
  status: StatusRole;
  amountCents: number | null;
  town: string | null;
  country: string | null;
  product: string | null;
  party: number;
  creditsRemaining: number;
  consent: boolean | null;
  hasEmail: boolean;
  hasPhone: boolean;
};

/** Everything migration 0300 states as a literal, and nothing else. */
export type ModelParams = {
  shrinkK: number;
  blendK: number;
  localKm: number;
  catchmentKm: number;
  regionalKm: number;
  priorLocal: number;
  priorCatchment: number;
  priorRegional: number;
  priorDistant: number;
  priorVisitor: number;
  priorUnknown: number;
  seasonFloor: number;
  seasonCap: number;
  gapFloorDays: number;
  gapCapDays: number;
  gapDefaultBaseDays: number;
  companionFactor: number;
  companionPartyThreshold: number;
  loyalVisits: number;
  overdueRatio: number;
  lapsedRatio: number;
  squeezeMinVisits: number;
  squeezeMinSlots: number;
  squeezeFullRatio: number;
  dormantMonthIndex: number;
  dormantMinVisits: number;
  dormantTroughRatio: number;
  farDistantVisits: number;
  farVisitorVisits: number;
  pReturnBase: number;
  pReturnCap: number;
  pReturnExperienceBase: number;
  pReturnExperienceStep: number;
  pReturnExperienceCap: number;
  smoothStrength: number;
  cohortDefaultCadenceDays: number;
  cohortDefaultFirstRepeatDays: number;
};

/** Thrown by the reader and the mapper. The message is shown to the visitor. */
export class ReadError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = "ReadError";
    this.kind = kind;
  }
}
```

- [ ] **Step 4: Write the numbers module**

```ts
// lib/tools/second-visit/numbers.ts
import type { DateStyle } from "./types";

/**
 * Dates as integers, medians the way Postgres means them, and the rounding
 * `numeric` does that JavaScript does not.
 *
 * Nothing here is interesting on its own. All three exist because the port has
 * to agree with a database to nine decimal places, and each is a place where
 * the obvious JavaScript is subtly a different function.
 */

const MS_PER_DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days since 1970-01-01, or null if that date does not exist. */
export function dayFromIso(iso: string): number | null {
  const m = ISO.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const dayOfMonth = Number(d);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  const ms = Date.UTC(year, month - 1, dayOfMonth);
  const back = new Date(ms);
  // Date.UTC rolls 2026-02-30 forward to 2026-03-02 without complaining, so the
  // only way to reject an impossible date is to convert back and compare.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== dayOfMonth
  ) {
    return null;
  }
  return Math.round(ms / MS_PER_DAY);
}

export function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 1 to 12. */
export function monthOfYear(day: number): number {
  return new Date(day * MS_PER_DAY).getUTCMonth() + 1;
}

/** 1 Monday to 7 Sunday, matching Postgres `extract(isodow ...)`. */
export function isoDow(day: number): number {
  // Epoch day 0 is a Thursday, so shifting by 3 puts Monday at 0.
  return (((day + 3) % 7) + 7) % 7 + 1;
}

/** Day and month are one or two digits, so a four-digit year cannot lead. That
 *  is what keeps an ISO date out of this branch entirely. */
const SEPARATED = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/;

/**
 * One value, given a style already decided for the whole column.
 *
 * `iso` also accepts a trailing time, because a booking export very often
 * carries `2026-03-14T18:30:00Z` in the column somebody calls "date". Only the
 * date part is used, and the timezone is deliberately ignored: a booking
 * belongs to the local day the venue traded, and re-deriving that from an
 * offset the export may not even carry is guesswork dressed as precision.
 */
export function parseDay(text: string, style: DateStyle): number | null {
  const value = text.trim();
  if (value === "") return null;

  if (style === "iso") {
    const head = value.slice(0, 10);
    return dayFromIso(head);
  }

  const m = SEPARATED.exec(value);
  if (!m) return dayFromIso(value.slice(0, 10));
  const a = Number(m[1]);
  const b = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length <= 2) year += year < 70 ? 2000 : 1900;
  const day = style === "dmy" ? a : b;
  const month = style === "dmy" ? b : a;
  const pad = (n: number) => String(n).padStart(2, "0");
  return dayFromIso(`${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`);
}

/**
 * Which way round a separated date column reads, decided once for the column.
 *
 * A first component over 12 can only be a day; a second component over 12 can
 * only be a month in the American order. If neither appears anywhere in the
 * column it is genuinely undecidable, and the tool takes day-first (this site
 * is Irish) and says on the page that it guessed.
 */
export function detectDateStyle(samples: readonly string[]): { style: DateStyle; ambiguous: boolean } {
  let dayFirst = false;
  let monthFirst = false;
  let separated = 0;
  let iso = 0;
  for (const raw of samples) {
    const value = raw.trim();
    if (value === "") continue;
    if (ISO_LIKE.test(value)) {
      iso++;
      continue;
    }
    const m = SEPARATED.exec(value);
    if (!m) continue;
    separated++;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (separated === 0) return { style: "iso", ambiguous: false };
  // A column that is mostly ISO with a few strays is an ISO column with a few
  // rows this tool will report as unreadable, which is better than reading the
  // majority of it the wrong way round.
  if (iso > separated) return { style: "iso", ambiguous: false };
  if (dayFirst && !monthFirst) return { style: "dmy", ambiguous: false };
  if (monthFirst && !dayFirst) return { style: "mdy", ambiguous: false };
  // Both, which means the column is inconsistent, or neither, which means it is
  // undecidable. Day-first either way, flagged.
  return { style: "dmy", ambiguous: true };
}

/**
 * Postgres `percentile_cont(p) within group (order by x)`.
 *
 * Continuous, so it interpolates between the two neighbours rather than
 * choosing one of them. On an even count at p = 0.5 that is the mean of the
 * middle pair. Nearest-rank is a different function (`percentile_disc`) and
 * swapping one for the other moves every cohort baseline in this tool.
 */
export function percentileCont(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function medianCont(values: readonly number[]): number | null {
  return percentileCont(values, 0.5);
}

/**
 * Postgres `round(numeric, n)`: half away from zero.
 *
 * `Math.round(x * 10 ** n) / 10 ** n` is wrong twice over. It is half up, so it
 * disagrees on negatives, and the multiply introduces error of its own
 * (1.005 * 100 is 100.49999999999999, which rounds down). `toFixed` operates on
 * the double's true value and, per the specification, takes the absolute value
 * first and prepends the sign, which is half away from zero.
 *
 * The residual difference from Postgres is a value that is an exact decimal
 * tie: numeric holds 1.0005 exactly and rounds up, while the nearest double is
 * a hair below the tie and rounds down. Every value rounded in this tool is a
 * product of several computed factors, so this is a probability rather than a
 * pattern, and `oracle.test.ts` asserts the rounded columns exactly so it
 * surfaces as a red test rather than as a quiet thousandth.
 */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) return value;
  return Number(value.toFixed(digits));
}

/**
 * Postgres `width_bucket(operand, array[...])`: 0 below the first bound,
 * then one bucket per bound, inclusive at the bottom.
 */
export function widthBucket(value: number, bounds: readonly number[]): number {
  let bucket = 0;
  for (const bound of bounds) {
    if (value >= bound) bucket++;
    else break;
  }
  return bucket;
}
```

- [ ] **Step 5: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/numbers.test.ts`
Expected: PASS.

What this proves: dates are integers and survive both clock changes, the median is the interpolating one, the rounding is half away from zero, and `width_bucket` is inclusive at the bottom of each bucket. What it cannot see: whether any of it agrees with a real Postgres, which is Task 12.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/types.ts lib/tools/second-visit/numbers.ts lib/tools/second-visit/numbers.test.ts
git commit -m "feat(second-visit): dates as whole days, the interpolating median, and Postgres rounding"
```

---

### Task 4: The twelve functions, ported

**Files:**
- Create: `lib/tools/second-visit/model.ts`
- Test: `lib/tools/second-visit/model.test.ts`

**Interfaces:**
- Consumes: `roundTo` (Task 3), `Band`, `Lifecycle`, `ModelParams` (Task 3)
- Produces: `PRODUCTION_PARAMS`, `EARTH_RADIUS_KM`, and the twelve functions named in the frozen interface block

**Write these with the migration open beside you, one function at a time, and copy the constants across by eye rather than from memory.** Every test below pins a literal that is worked out by hand from the SQL, so a constant that drifts by a factor of ten is red rather than plausible.

The one structural change from the SQL: each function takes an optional `ModelParams` defaulting to `PRODUCTION_PARAMS`, so the page's sliders drive the same code the oracle runs. `PRODUCTION_PARAMS` is frozen and every value in it is one of migration 0300's own literals.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/model.test.ts
import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  PRODUCTION_PARAMS,
  blendPrior,
  distanceBand,
  distanceKm,
  distancePriorFactor,
  expectedGapDays,
  pReturnPrior,
  reachability,
  retentionVerdict,
  seasonFactor,
  shrink,
  smoothRate,
  winnabilityCents,
} from "./model";

/**
 * Every number in this file is written out rather than read from
 * PRODUCTION_PARAMS. A test that asserts `shrink(3, 1, 30) === expected(p)`
 * moves with the constant and can never fail when the constant is wrong, which
 * is the trap T2 recorded on MIN_EVENTS and T3 on HASH_HEX_CHARS. The literals
 * below come from Tigh Sauna's migration 0300 and from arithmetic done by hand.
 */

describe("the production constants are migration 0300's", () => {
  it("carries k = 2 in both places it appears", () => {
    expect(PRODUCTION_PARAMS.shrinkK).toBe(2);
    expect(PRODUCTION_PARAMS.blendK).toBe(2);
  });

  it("carries the distance boundaries and their priors", () => {
    expect(PRODUCTION_PARAMS.localKm).toBe(15);
    expect(PRODUCTION_PARAMS.catchmentKm).toBe(45);
    expect(PRODUCTION_PARAMS.regionalKm).toBe(95);
    expect(PRODUCTION_PARAMS.priorLocal).toBe(1.0);
    expect(PRODUCTION_PARAMS.priorCatchment).toBe(1.35);
    expect(PRODUCTION_PARAMS.priorRegional).toBe(2.2);
    expect(PRODUCTION_PARAMS.priorDistant).toBe(4.0);
    expect(PRODUCTION_PARAMS.priorVisitor).toBe(8.0);
    expect(PRODUCTION_PARAMS.priorUnknown).toBe(1.0);
  });

  it("carries the clamps", () => {
    expect(PRODUCTION_PARAMS.seasonFloor).toBe(0.6);
    expect(PRODUCTION_PARAMS.seasonCap).toBe(3.0);
    expect(PRODUCTION_PARAMS.gapFloorDays).toBe(3.0);
    expect(PRODUCTION_PARAMS.gapCapDays).toBe(540.0);
    expect(PRODUCTION_PARAMS.gapDefaultBaseDays).toBe(30.0);
    expect(PRODUCTION_PARAMS.companionFactor).toBe(1.25);
    expect(PRODUCTION_PARAMS.smoothStrength).toBe(20);
    expect(PRODUCTION_PARAMS.pReturnBase).toBe(0.12);
    expect(PRODUCTION_PARAMS.pReturnCap).toBe(0.6);
  });

  it("is frozen, so a slider cannot edit the production values by reference", () => {
    expect(Object.isFrozen(PRODUCTION_PARAMS)).toBe(true);
  });
});

describe("distanceKm", () => {
  it("uses the mean earth radius the migration names", () => {
    expect(EARTH_RADIUS_KM).toBe(6371.0088);
  });

  /**
   * Aughnacliff to Dublin. The migration's own comment says "Dublin is 98km
   * from Aughnacliff, and that is the point of this boundary rather than an
   * accident of it", so this pair is the one worth pinning.
   */
  it("puts Dublin the far side of the 95km boundary from north Longford", () => {
    // The migration says 98km and does not publish the point it measured from.
    // These coordinates give 104. That the exact figure moves with the point is
    // the reason this asserts the band rather than the metre: what the model
    // does with it is the same either way.
    const km = distanceKm(53.8608, -7.5806, 53.3498, -6.2603) as number;
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(115);
    expect(distanceBand(km, true)).toBe("distant");
  });

  it("is zero for a point on itself", () => {
    expect(distanceKm(53.3498, -6.2603, 53.3498, -6.2603)).toBeCloseTo(0, 10);
  });

  it("is strict, so an unknown address never becomes a point off Africa", () => {
    expect(distanceKm(null, -6.26, 53.35, -6.26)).toBeNull();
    expect(distanceKm(53.35, null, 53.35, -6.26)).toBeNull();
    expect(distanceKm(53.35, -6.26, null, -6.26)).toBeNull();
    expect(distanceKm(53.35, -6.26, 53.35, null)).toBeNull();
    expect(distanceKm(Number.NaN, -6.26, 53.35, -6.26)).toBeNull();
  });

  it("is symmetric", () => {
    const there = distanceKm(53.86, -7.58, 51.9, -8.47) as number;
    const back = distanceKm(51.9, -8.47, 53.86, -7.58) as number;
    expect(there).toBeCloseTo(back, 12);
  });
});

describe("distanceBand", () => {
  it("is inclusive at the top of each band", () => {
    expect(distanceBand(15, true)).toBe("local");
    expect(distanceBand(15.001, true)).toBe("catchment");
    expect(distanceBand(45, true)).toBe("catchment");
    expect(distanceBand(45.001, true)).toBe("regional");
    expect(distanceBand(95, true)).toBe("regional");
    expect(distanceBand(98, true)).toBe("distant");
  });

  /**
   * The border decides, not the mileage, and it is checked before distance.
   * Somebody twelve kilometres away across a border is passing through.
   */
  it("calls a different country a visitor whatever the distance", () => {
    expect(distanceBand(12, false)).toBe("visitor");
    expect(distanceBand(null, false)).toBe("visitor");
  });

  it("treats an unknown country as no evidence of a border", () => {
    expect(distanceBand(12, null)).toBe("local");
    expect(distanceBand(null, null)).toBe("unknown");
    expect(distanceBand(null, true)).toBe("unknown");
  });
});

describe("distancePriorFactor", () => {
  it("charges nothing for not knowing", () => {
    // "Not knowing where somebody lives is a gap in our records and must never
    // be charged to the customer as suspicion." Migration 0300.
    expect(distancePriorFactor("unknown")).toBe(1.0);
  });

  it("is 1.00, 1.35, 2.20, 4.00, 8.00", () => {
    expect(distancePriorFactor("local")).toBe(1.0);
    expect(distancePriorFactor("catchment")).toBe(1.35);
    expect(distancePriorFactor("regional")).toBe(2.2);
    expect(distancePriorFactor("distant")).toBe(4.0);
    expect(distancePriorFactor("visitor")).toBe(8.0);
  });
});

describe("blendPrior, where evidence beats the prior", () => {
  /**
   * The three rows of the migration's own worked table, which is what makes
   * this the most important function in the file.
   */
  it("matches the migration's Dubliner table", () => {
    expect(blendPrior(4.0, 0)).toBeCloseTo(4.0, 12); // came once
    expect(blendPrior(4.0, 2)).toBeCloseTo(2.5, 12); // came three times
    expect(blendPrior(4.0, 9)).toBeCloseTo(1.5454545454545454, 12); // came ten
  });

  it("never becomes a discount", () => {
    // Floored at 1, so a prior can never make a distant customer look overdue
    // sooner than a local one.
    expect(blendPrior(0.5, 0)).toBe(1);
    expect(blendPrior(0.5, 100)).toBe(1);
  });

  it("treats a null prior as no prior and a null count as none", () => {
    expect(blendPrior(null, 5)).toBe(1);
    expect(blendPrior(4.0, null)).toBeCloseTo(4.0, 12);
    expect(blendPrior(4.0, -3)).toBeCloseTo(4.0, 12);
  });
});

describe("shrink, empirical Bayes toward the cohort", () => {
  it("gives the prior two observations' worth of weight", () => {
    // One observation of 3 against a prior of 30: (1*3 + 2*30) / (1+2) = 21.
    expect(shrink(3, 1, 30)).toBeCloseTo(21, 12);
    // Ten observations of 3: (10*3 + 2*30) / 12 = 7.5.
    expect(shrink(3, 10, 30)).toBeCloseTo(7.5, 12);
  });

  it("stops one lucky three-day gap becoming a cadence", () => {
    // The failure the migration's comment names, stated as a number.
    expect(shrink(3, 1, 30)).toBeGreaterThan(20);
  });

  it("falls back either way, and to null when there is nothing at all", () => {
    expect(shrink(null, 5, 30)).toBe(30);
    expect(shrink(12, 5, null)).toBe(12);
    expect(shrink(null, 5, null)).toBeNull();
  });

  it("treats a negative count as zero", () => {
    expect(shrink(3, -4, 30)).toBeCloseTo(30, 12);
  });
});

describe("seasonFactor", () => {
  it("inverts the month index, so a quiet month stretches the gap", () => {
    expect(seasonFactor(0.5)).toBeCloseTo(2, 12);
    expect(seasonFactor(1)).toBeCloseTo(1, 12);
    expect(seasonFactor(2)).toBeCloseTo(0.6, 12); // 0.5, floored at 0.6
  });

  it("is clamped at both ends", () => {
    expect(seasonFactor(0.01)).toBe(3);
    expect(seasonFactor(100)).toBe(0.6);
  });

  it("is neutral on no index and on nonsense", () => {
    expect(seasonFactor(null)).toBe(1);
    expect(seasonFactor(0)).toBe(1);
    expect(seasonFactor(-1)).toBe(1);
  });
});

describe("expectedGapDays", () => {
  it("multiplies, because the effects compound", () => {
    expect(expectedGapDays(30, 4, 1, 1)).toBeCloseTo(120, 12);
    expect(expectedGapDays(30, 4, 2, 1.25)).toBe(300);
  });

  it("is floored at three days so nobody is overdue by construction", () => {
    expect(expectedGapDays(1, 1, 1, 1)).toBe(3);
    expect(expectedGapDays(0, 1, 1, 1)).toBe(3);
  });

  it("is capped at 540 so a visitor gets a real number rather than infinity", () => {
    expect(expectedGapDays(200, 8, 3, 1.25)).toBe(540);
  });

  it("falls back to thirty days and to neutral factors", () => {
    expect(expectedGapDays(null, null, null, null)).toBeCloseTo(30, 12);
  });
});

describe("retentionVerdict", () => {
  it("calls somebody with no visits a prospect before anything else", () => {
    expect(retentionVerdict(0, 5, true, true, true, true)).toBe("prospect");
    expect(retentionVerdict(null, 5, false, false, false, false)).toBe("prospect");
  });

  /**
   * The ordering the migration says took a wrong turn to find. Visiting is a
   * statement about who somebody is, decided before lateness is considered, so
   * a Dubliner who came once to a Longford sauna is not filed as a pending
   * conversion for the eighteen months their inflated window takes to run out.
   */
  it("decides visiting before lateness", () => {
    expect(retentionVerdict(1, 2.5, false, false, false, true)).toBe("visiting");
    expect(retentionVerdict(1, 0.2, false, false, false, true)).toBe("visiting");
  });

  it("lets a prepaid commitment outrank geography", () => {
    expect(retentionVerdict(1, 2.5, true, false, false, true)).toBe("committed_idle");
  });

  it("calls an on-time customer by their experience", () => {
    expect(retentionVerdict(10, 0.5, false, false, false, false)).toBe("loyal");
    expect(retentionVerdict(1, 0.5, false, false, false, false)).toBe("first_time");
    expect(retentionVerdict(4, 0.5, false, false, false, false)).toBe("repeat");
    // A null ratio is somebody with no last visit to measure from, which is
    // not the same as being late.
    expect(retentionVerdict(4, null, false, false, false, false)).toBe("repeat");
  });

  it("ranks the causes of an overdue silence in the order of the action", () => {
    expect(retentionVerdict(5, 1.5, true, true, true, false)).toBe("committed_idle");
    expect(retentionVerdict(5, 1.5, false, true, true, false)).toBe("squeezed");
    expect(retentionVerdict(5, 1.5, false, false, true, false)).toBe("dormant");
    expect(retentionVerdict(5, 1.5, false, false, false, false)).toBe("at_risk");
    expect(retentionVerdict(5, 2.0, false, false, false, false)).toBe("lapsed");
  });

  it("is exactly on time at a ratio of one", () => {
    expect(retentionVerdict(4, 0.999, false, false, false, false)).toBe("repeat");
    expect(retentionVerdict(4, 1.0, false, false, false, false)).toBe("at_risk");
  });

  it("reads a null flag as no evidence rather than as true", () => {
    expect(retentionVerdict(5, 1.5, null, null, null, null)).toBe("at_risk");
  });
});

describe("reachability", () => {
  it("is a hard zero without consent", () => {
    expect(reachability(false, true, true, false)).toBe(0);
    expect(reachability(null, true, true, false)).toBe(0);
  });

  it("is a hard zero when suppressed", () => {
    expect(reachability(true, true, true, true)).toBe(0);
  });

  it("is 0.6 on one channel and 1.0 on two", () => {
    expect(reachability(true, true, false, false)).toBe(0.6);
    expect(reachability(true, false, true, false)).toBe(0.6);
    expect(reachability(true, true, true, false)).toBe(1);
    expect(reachability(true, false, false, false)).toBe(0);
  });
});

describe("pReturnPrior", () => {
  it("is the inverse of the distance prior, times experience, capped", () => {
    // local, one visit: 0.12 * (1/1.00) * min(1.5, 0.6 + 0.1) = 0.12 * 0.7.
    expect(pReturnPrior("local", 1)).toBeCloseTo(0.084, 12);
    // distant, one visit: 0.12 * (1/4) * 0.7.
    expect(pReturnPrior("distant", 1)).toBeCloseTo(0.021, 12);
    // local, twenty visits: experience is capped at 1.5, so 0.12 * 1.5.
    expect(pReturnPrior("local", 20)).toBeCloseTo(0.18, 12);
  });

  it("never exceeds 0.60", () => {
    expect(pReturnPrior("local", 1000)).toBeLessThanOrEqual(0.6);
  });

  it("treats no visits as no experience", () => {
    expect(pReturnPrior("local", null)).toBeCloseTo(0.072, 12); // 0.12 * 0.6
  });
});

describe("smoothRate", () => {
  it("does not let one customer make a cell a hundred per cent", () => {
    // 1 return out of 1 observation against a prior of 0.1 with strength 20:
    // (1 + 20*0.1) / (1 + 20) = 3/21 = 0.142857..., rounded to four places.
    expect(smoothRate(1, 1, 0.1, 20)).toBe(0.1429);
  });

  it("does not let one non-return make it zero", () => {
    // (0 + 20*0.1) / (1 + 20) = 2/21 = 0.095238..., rounded.
    expect(smoothRate(0, 1, 0.1, 20)).toBe(0.0952);
  });

  it("lets a real pattern through once there is enough of it", () => {
    // (60 + 2) / (100 + 20) = 0.516666..., rounded.
    expect(smoothRate(60, 100, 0.1, 20)).toBe(0.5167);
  });

  it("is the prior itself when there is nothing measured", () => {
    expect(smoothRate(0, 0, 0.25, 20)).toBe(0.25);
  });

  it("is null when the strength is zero and there are no trials", () => {
    expect(smoothRate(0, 0, 0.25, 0)).toBeNull();
  });
});

describe("winnabilityCents", () => {
  it("is probability times margin times reachability, in whole cents", () => {
    expect(winnabilityCents(0.25, 4000, 0.6)).toBe(600);
    expect(winnabilityCents(0.25, 4000, 1)).toBe(1000);
  });

  it("is zero when they cannot be reached, however good the odds", () => {
    expect(winnabilityCents(0.9, 100000, 0)).toBe(0);
  });

  it("floors a negative margin at zero rather than ranking below nothing", () => {
    expect(winnabilityCents(0.5, -5000, 1)).toBe(0);
  });

  it("rounds half away from zero, like the SQL", () => {
    expect(winnabilityCents(0.5, 5, 1)).toBe(3); // 2.5
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/model.test.ts`
Expected: FAIL with `Cannot find module './model'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/model.ts
import { roundTo } from "./numbers";
import type { Band, Lifecycle, ModelParams } from "./types";

/**
 * Tigh Sauna's retention model, ported.
 *
 * Source: `apps/api/migrations/0300_customer_intelligence.sql` in
 * `fergo5002/sauna-os`, commit 94f77a80debcd3e444e6609bd0c8b0068c4193db, dated
 * 2026-08-11. The SQL bodies are committed beside this file at
 * `oracle/0300-functions.sql` and `lib/tools/second-visit/oracle.test.ts`
 * checks this port against what a real Postgres 16 makes of them, over a
 * committed fixture, at 1e-9. **That test is the only reason to believe any of
 * this.** Read it before trusting a number out of here.
 *
 * Two rules the migration states and this port keeps, because they are the
 * argument rather than the implementation:
 *
 *   1. Distance is a prior and behaviour is evidence that overrides it.
 *      `blendPrior` is where that happens and it is the most important function
 *      in the file. Get it wrong in the other direction and the model writes
 *      off a merchant's best customers for living in the wrong county.
 *   2. Not knowing something is never charged to the customer. An unknown
 *      address is a factor of 1.00, not of 4.00.
 *
 * Every literal the SQL states lives in `PRODUCTION_PARAMS` and every function
 * takes an optional override, because the page puts sliders on all of them. The
 * oracle runs with the defaults, so a slider cannot make the regression test
 * agree with anything but the SQL.
 */

/** The mean earth radius migration 0300 uses. Not 6371, and not 6378. */
export const EARTH_RADIUS_KM = 6371.0088;

export const PRODUCTION_PARAMS: ModelParams = Object.freeze({
  shrinkK: 2,
  blendK: 2,
  localKm: 15,
  catchmentKm: 45,
  regionalKm: 95,
  priorLocal: 1.0,
  priorCatchment: 1.35,
  priorRegional: 2.2,
  priorDistant: 4.0,
  priorVisitor: 8.0,
  priorUnknown: 1.0,
  seasonFloor: 0.6,
  seasonCap: 3.0,
  gapFloorDays: 3.0,
  gapCapDays: 540.0,
  gapDefaultBaseDays: 30.0,
  companionFactor: 1.25,
  companionPartyThreshold: 2,
  loyalVisits: 10,
  overdueRatio: 1.0,
  lapsedRatio: 2.0,
  squeezeMinVisits: 3,
  squeezeMinSlots: 4,
  squeezeFullRatio: 0.5,
  dormantMonthIndex: 0.9,
  dormantMinVisits: 4,
  dormantTroughRatio: 0.15,
  farDistantVisits: 2,
  farVisitorVisits: 3,
  pReturnBase: 0.12,
  pReturnCap: 0.6,
  pReturnExperienceBase: 0.6,
  pReturnExperienceStep: 0.1,
  pReturnExperienceCap: 1.5,
  smoothStrength: 20,
  cohortDefaultCadenceDays: 30.0,
  cohortDefaultFirstRepeatDays: 45.0,
});

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Great-circle kilometres. Null in, null out.
 *
 * Haversine rather than a geodesic: the error is well under a percent at Irish
 * distances and this is one number per customer for ranking and banding. Strict
 * on purpose, so a customer with no address yields an unknown distance rather
 * than quietly becoming a point off the coast of Africa at (0, 0). A walk-in
 * with no address is the normal case, not a hypothetical.
 */
export function distanceKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (!usable(lat1) || !usable(lng1) || !usable(lat2) || !usable(lng2)) return null;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Distance as the merchant thinks about it.
 *
 * The border is checked first and the mileage second, because a different
 * country means somebody is passing through whatever the distance. A null
 * country on either side is not evidence of a border and is not treated as one.
 */
export function distanceBand(
  km: number | null,
  sameCountry: boolean | null,
  p: ModelParams = PRODUCTION_PARAMS,
): Band {
  if (sameCountry === false) return "visitor";
  if (km === null || !Number.isFinite(km)) return "unknown";
  if (km <= p.localKm) return "local";
  if (km <= p.catchmentKm) return "catchment";
  if (km <= p.regionalKm) return "regional";
  return "distant";
}

export function distancePriorFactor(band: Band, p: ModelParams = PRODUCTION_PARAMS): number {
  switch (band) {
    case "local":
      return p.priorLocal;
    case "catchment":
      return p.priorCatchment;
    case "regional":
      return p.priorRegional;
    case "distant":
      return p.priorDistant;
    case "visitor":
      return p.priorVisitor;
    default:
      return p.priorUnknown;
  }
}

/**
 * Evidence beats the prior.
 *
 * The prior applies in full to somebody never seen twice and fades as their own
 * rhythm becomes observable. k = 2 means two observed gaps are worth as much as
 * the prior, which is aggressive on purpose: somebody who has come back twice
 * has told us more about themselves than their postcode ever will. Floored at 1
 * so a prior can never become a discount.
 */
export function blendPrior(
  raw: number | null,
  observedGaps: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const prior = usable(raw) ? raw : 1.0;
  const n = Math.max(0, usable(observedGaps) ? observedGaps : 0);
  return Math.max(1.0, 1.0 + (prior - 1.0) * (p.blendK / (p.blendK + n)));
}

/**
 * Shrink an observation toward a prior in proportion to how much of it there is.
 *
 * Without this, one customer who happened to come back after three days has a
 * cadence of three days and is permanently, absurdly overdue.
 */
export function shrink(
  observed: number | null,
  n: number | null,
  prior: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number | null {
  if (!usable(observed)) return usable(prior) ? prior : null;
  if (!usable(prior)) return observed;
  const count = Math.max(0, usable(n) ? n : 0);
  return (count * observed + p.shrinkK * prior) / (count + p.shrinkK);
}

/**
 * How much the calendar itself stretches an expected gap.
 *
 * `monthIndex` is the venue's trade this month against its own average month.
 * Judge a January customer by a July clock and half the base looks like it is
 * walking out the door every summer, which is the commonest false alarm in a
 * seasonal trade. Bounded at both ends so one freak month cannot swamp the
 * model.
 */
export function seasonFactor(
  monthIndex: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  if (!usable(monthIndex) || monthIndex <= 0) return 1.0;
  return Math.min(p.seasonCap, Math.max(p.seasonFloor, 1.0 / monthIndex));
}

/**
 * How long this particular person was always going to take.
 *
 * Multiplicative because the effects genuinely compound: somebody far away in
 * the off season is both taking a trip and doing it out of season. Floored so
 * nobody is overdue by construction, capped so a visitor gets a large number
 * rather than an infinite one and still appears on a report with a real figure
 * beside them.
 */
export function expectedGapDays(
  base: number | null,
  distance: number | null,
  season: number | null,
  companion: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const product =
    (usable(base) ? base : p.gapDefaultBaseDays) *
    (usable(distance) ? distance : 1.0) *
    (usable(season) ? season : 1.0) *
    (usable(companion) ? companion : 1.0);
  return Math.min(p.gapCapDays, Math.max(p.gapFloorDays, product));
}

/**
 * The verdict.
 *
 * The branch order is the argument. `visiting` is decided before lateness
 * because it is a statement about who somebody is rather than a stage they
 * reach by going quiet, and the exception is a prepaid commitment, which
 * outranks geography. After that, on time means active however far away they
 * live. The overdue branches rank causes in the order of the action they imply:
 * money already taken, then a timetable that shut them out, then a season that
 * explains it, then real churn.
 *
 * A null flag is no evidence and never reads as true, matching SQL's `when
 * committed then` on a null.
 */
export function retentionVerdict(
  visits: number | null,
  silenceRatio: number | null,
  committed: boolean | null,
  squeezed: boolean | null,
  dormant: boolean | null,
  lowEvidenceFar: boolean | null,
  p: ModelParams = PRODUCTION_PARAMS,
): Lifecycle {
  const n = usable(visits) ? visits : 0;
  if (n <= 0) return "prospect";
  if (lowEvidenceFar === true && committed !== true) return "visiting";
  if (!usable(silenceRatio) || silenceRatio < p.overdueRatio) {
    if (n >= p.loyalVisits) return "loyal";
    if (n === 1) return "first_time";
    return "repeat";
  }
  if (committed === true) return "committed_idle";
  if (squeezed === true) return "squeezed";
  if (dormant === true) return "dormant";
  if (silenceRatio >= p.lapsedRatio) return "lapsed";
  return "at_risk";
}

/**
 * Consent first, then a channel, then whether that channel still works.
 *
 * Zero is a hard zero, not a small number. A rank that treats an unlawful send
 * as merely unlikely is a rank that will eventually produce one.
 */
export function reachability(
  consent: boolean | null,
  hasEmail: boolean | null,
  hasPhone: boolean | null,
  suppressed: boolean | null,
): number {
  if (consent !== true) return 0.0;
  if (suppressed === true) return 0.0;
  const channels = (hasEmail === true ? 1 : 0) + (hasPhone === true ? 1 : 0);
  if (channels === 0) return 0.0;
  if (channels === 1) return 0.6;
  return 1.0;
}

/**
 * What we believe about somebody before we have contacted anybody like them.
 *
 * The inverse of the distance prior, which is the same assumption stated from
 * the other side: if somebody in a band takes four times as long to come back,
 * a nudge aimed at them is roughly a quarter as likely to land. The base rate
 * is a stated assumption, which is exactly why `smoothRate` exists to let real
 * numbers take over from it.
 */
export function pReturnPrior(
  band: Band,
  visits: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const n = Math.max(0, usable(visits) ? visits : 0);
  const experience = Math.min(
    p.pReturnExperienceCap,
    p.pReturnExperienceBase + p.pReturnExperienceStep * n,
  );
  return Math.min(p.pReturnCap, p.pReturnBase * (1.0 / distancePriorFactor(band, p)) * experience);
}

/**
 * A rate, smoothed toward a prior by how much evidence stands behind it.
 *
 * One customer in a cell who happened to return does not make that cell a
 * hundred per cent, and one who did not does not make it zero.
 */
export function smoothRate(
  successes: number | null,
  trials: number | null,
  prior: number | null,
  strength: number | null,
): number | null {
  const s = usable(strength) ? strength : 20.0;
  const denominator = Math.max(0, usable(trials) ? trials : 0) + s;
  if (denominator === 0) return null;
  const numerator = Math.max(0, usable(successes) ? successes : 0) + s * (usable(prior) ? prior : 0);
  return roundTo(numerator / denominator, 4);
}

/**
 * What one winback attempt is worth, in cents.
 *
 * A number in money rather than a score out of ten, because the question an
 * operator is really asking is which forty people to contact on a Tuesday
 * morning, and that is a question about money.
 */
export function winnabilityCents(
  pReturn: number | null,
  marginCents: number | null,
  reach: number | null,
): number {
  const p = Math.max(0, usable(pReturn) ? pReturn : 0);
  const margin = Math.max(0, usable(marginCents) ? marginCents : 0);
  const r = Math.max(0, usable(reach) ? reach : 0);
  return Math.max(0, roundTo(p * margin * r, 0));
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/model.test.ts`
Expected: PASS.

What this proves: twelve functions behave as their SQL bodies say they do on about sixty hand-computed cases, including every branch of the verdict and both ends of every clamp. What it cannot see: whether they agree with Postgres on numbers nobody thought to pick, which is the whole point of Task 12, and whether the constants were transcribed correctly, which the same task settles by running the SQL itself.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/model.ts lib/tools/second-visit/model.test.ts
git commit -m "feat(second-visit): migration 0300's twelve functions, ported with their arguments intact"
```

---

### Task 5: The reader, which has to survive both line endings and somebody's preamble

**Files:**
- Create: `lib/tools/second-visit/csv.ts`
- Test: `lib/tools/second-visit/csv.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `MAX_BYTES`, `MAX_ROWS`, `detectDelimiter`, `parseCsv`, `type Sheet`

A third CSV reader in this repository, after T2's and T3's, and that is a decision rather than an oversight. T2 reads a date column out of anything, T3 reads a LinkedIn export with a fixed shape and a three-line preamble, and this one reads an arbitrary booking export with an unknown delimiter and up to half a million rows. Merging them would mean three parallel branches editing one file during the wave they are all building in. **A consolidation into `lib/csv.ts` is a fair follow-up once all three have merged**, and it goes in the ledger as one rather than being attempted here.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/csv.test.ts
import { describe, expect, it } from "vitest";
import { MAX_ROWS, detectDelimiter, parseCsv } from "./csv";
import { ReadError } from "./types";

describe("the shape of a field", () => {
  it("splits on the delimiter and trims nothing inside quotes", () => {
    const sheet = parseCsv('a,b\n1, 2 \n');
    expect(sheet.header).toEqual(["a", "b"]);
    expect(sheet.rows).toEqual([["1", " 2 "]]);
  });

  it("keeps a delimiter, a newline and a quote inside a quoted field", () => {
    const sheet = parseCsv('a,b\n"x,y","line1\nline2"\n"he said ""no""",z\n');
    expect(sheet.rows[0]).toEqual(["x,y", "line1\nline2"]);
    expect(sheet.rows[1][0]).toBe('he said "no"');
  });

  /**
   * The rule this repository has already been bitten by once. Git hands this
   * checkout CRLF and hands CI LF, so a reader that treats them differently is
   * a test that is red on one machine and green on the other for no reason to
   * do with the code.
   */
  it("reads CRLF, LF and a lone CR to exactly the same rows", () => {
    const lf = parseCsv("a,b\n1,2\n3,4\n");
    const crlf = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    const cr = parseCsv("a,b\r1,2\r3,4\r");
    expect(crlf).toEqual(lf);
    expect(cr).toEqual(lf);
  });

  it("drops a byte order mark rather than putting it in the first header", () => {
    // Written as an escape rather than a literal, so nobody's editor eats it.
    const sheet = parseCsv("\uFEFFcustomer,date\n1,2026-01-01\n");
    expect(sheet.header[0]).toBe("customer");
  });

  it("does not invent a final empty row from a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toHaveLength(1);
    expect(parseCsv("a,b\n1,2").rows).toHaveLength(1);
  });

  it("keeps a genuinely blank field but drops a blank line", () => {
    const sheet = parseCsv("a,b\n1,\n\n2,3\n");
    expect(sheet.rows).toEqual([["1", ""], ["2", "3"]]);
  });

  it("pads a short row and keeps an over-long one rather than throwing", () => {
    const sheet = parseCsv("a,b,c\n1,2\n1,2,3,4\n");
    expect(sheet.rows[0]).toEqual(["1", "2", ""]);
    expect(sheet.rows[1]).toEqual(["1", "2", "3", "4"]);
  });
});

describe("the delimiter", () => {
  it("finds a comma, a semicolon or a tab from the header line", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("is not fooled by commas inside quoted headers", () => {
    expect(detectDelimiter('"Name, full";"Date"\n"a";"b"')).toBe(";");
  });

  it("falls back to a comma when there is only one column", () => {
    expect(detectDelimiter("date\n2026-01-01")).toBe(",");
  });
});

describe("finding the header when the file starts with something else", () => {
  it("takes the first row when the file is ordinary", () => {
    const sheet = parseCsv("customer,date\nc1,2026-01-01\n");
    expect(sheet.headerIndex).toBe(0);
    expect(sheet.skipped).toBe(0);
  });

  /**
   * Booking systems put a title, a date range and a blank line above the
   * header often enough that a reader which assumes row one is a header will
   * happily treat "Bookings export" as a column name and then find no dates
   * anywhere.
   */
  it("skips a preamble narrower than the table under it", () => {
    const text = [
      "Bookings export",
      "Generated 2026-09-01",
      "",
      "Customer,Date,Amount",
      "c1,2026-01-01,45.00",
      "c2,2026-01-04,45.00",
    ].join("\n");
    const sheet = parseCsv(text);
    // Two, not three: the blank line is dropped before a header is chosen, so
    // `headerIndex` counts parsed rows rather than lines in the file.
    expect(sheet.headerIndex).toBe(2);
    expect(sheet.skipped).toBe(2);
    expect(sheet.header).toEqual(["Customer", "Date", "Amount"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("does not mistake a data row for a header when every header cell is a number", () => {
    // No row here has all-non-numeric cells, so the first full-width row wins
    // and the caller is left to notice the headers are useless.
    const sheet = parseCsv("1,2,3\n4,5,6\n");
    expect(sheet.headerIndex).toBe(0);
  });

  it("refuses a file with nothing in it, by kind", () => {
    expect(() => parseCsv("")).toThrow(ReadError);
    expect(() => parseCsv("   \n\n")).toThrow(/no rows/i);
  });
});

describe("the limits, which refuse rather than hang", () => {
  it("stops at MAX_ROWS and says it was truncated", () => {
    const body = Array.from({ length: 20 }, (_, i) => `c${i},2026-01-01`).join("\n");
    const sheet = parseCsv(`customer,date\n${body}\n`, { maxRows: 10 });
    expect(sheet.rows).toHaveLength(10);
    expect(sheet.truncated).toBe(true);
    expect(MAX_ROWS).toBe(500000);
  });

  it("does not claim truncation when it read everything", () => {
    expect(parseCsv("a,b\n1,2\n").truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/csv.test.ts`
Expected: FAIL with `Cannot find module './csv'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/csv.ts
import { ReadError } from "./types";

/**
 * A CSV reader for whatever a booking system calls an export.
 *
 * RFC 4180 in a state machine, plus three things real exports do that the RFC
 * does not mention: a byte order mark, a preamble above the header, and a
 * delimiter that is a semicolon because the file was made in a locale where a
 * comma is a decimal point.
 *
 * **Line endings are normalised inside the machine, not before it.** A
 * `replace(/\r\n/g, "\n")` over a 50 MB string is a second 50 MB string, and it
 * would also rewrite a CRLF inside a quoted field, which is content. The
 * machine treats CRLF, LF and a lone CR as one row terminator when it is not
 * inside quotes, and leaves whatever is inside quotes alone.
 */

export const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_ROWS = 500_000;

/** How many rows are looked at when guessing the delimiter and the header. */
const SNIFF_ROWS = 50;

export type Sheet = {
  header: string[];
  rows: string[][];
  /** Which parsed row the header was. Blank lines are already gone by then, so
   *  this counts rows rather than lines in the file. */
  headerIndex: number;
  skipped: number;
  delimiter: string;
  truncated: boolean;
};

export type ParseOptions = { delimiter?: string; maxRows?: number };

/**
 * The delimiter, from the first line that is not inside quotes.
 *
 * Counted outside quotes only, so `"Name, full";"Date"` is not read as a comma
 * file with two commas in it.
 */
export function detectDelimiter(text: string): string {
  const candidates = [",", ";", "\t", "|"];
  const line = firstUnquotedLine(text);
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(line, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount === 0 ? "," : best;
}

function firstUnquotedLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === "\n" || c === "\r")) return text.slice(0, i);
  }
  return text;
}

function countOutsideQuotes(line: string, needle: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === needle) count++;
  }
  return count;
}

/** Every physical row, before a header is chosen. */
function scan(text: string, delimiter: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;
  let truncated = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };
  const endRow = () => {
    if (started || row.length > 0 || field !== "") endField();
    // A blank line is not a row of one empty field, and it is not a row of no
    // fields either. Both are nothing.
    const blank = row.length === 0 || (row.length === 1 && row[0] === "");
    if (!blank) rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      started = true;
      continue;
    }
    if (c === delimiter) {
      endField();
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= maxRows + 1) {
        truncated = true;
        break;
      }
      continue;
    }
    if (c === "\n") {
      endRow();
      if (rows.length >= maxRows + 1) {
        truncated = true;
        break;
      }
      continue;
    }
    field += c;
    started = true;
  }
  if (field !== "" || row.length > 0) endRow();
  return { rows, truncated };
}

/**
 * Which row is the header.
 *
 * The width of the table is the commonest row width in the first fifty rows.
 * The header is the first row of that width whose cells are all non-empty and
 * none of which reads as a number, because a title line ("Bookings export") is
 * narrower and a data row has numbers in it. If nothing qualifies, row zero is
 * the header and the caller is left to notice that the column names are
 * useless, which is a better failure than silently dropping the first booking.
 */
function chooseHeader(rows: string[][]): number {
  const widths = new Map<number, number>();
  for (const row of rows.slice(0, SNIFF_ROWS)) {
    widths.set(row.length, (widths.get(row.length) ?? 0) + 1);
  }
  let width = 0;
  let seen = 0;
  for (const [w, count] of widths) {
    if (count > seen || (count === seen && w > width)) {
      width = w;
      seen = count;
    }
  }
  for (let i = 0; i < Math.min(rows.length, SNIFF_ROWS); i++) {
    const row = rows[i];
    if (row.length !== width) continue;
    const everyCellNamed = row.every((cell) => cell.trim() !== "" && !isNumeric(cell));
    if (everyCellNamed) return i;
  }
  return 0;
}

function isNumeric(cell: string): boolean {
  const t = cell.trim();
  if (t === "") return false;
  return /^[-+]?[\d.,]+$/.test(t) && /\d/.test(t);
}

export function parseCsv(text: string, options: ParseOptions = {}): Sheet {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.trim() === "") throw new ReadError("empty", "no rows in that file");

  const delimiter = options.delimiter ?? detectDelimiter(body);
  const maxRows = options.maxRows ?? MAX_ROWS;
  const { rows, truncated } = scan(body, delimiter, maxRows);
  if (rows.length === 0) throw new ReadError("empty", "no rows in that file");

  const headerIndex = chooseHeader(rows);
  const header = rows[headerIndex].map((cell) => cell.trim());
  const width = header.length;
  const data: string[][] = [];
  for (let i = headerIndex + 1; i < rows.length && data.length < maxRows; i++) {
    const row = rows[i];
    if (row.length === width) data.push(row);
    else if (row.length < width) data.push([...row, ...Array(width - row.length).fill("")]);
    else data.push(row);
  }

  return {
    header,
    rows: data,
    headerIndex,
    skipped: headerIndex,
    delimiter,
    truncated: truncated || data.length >= maxRows,
  };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/csv.test.ts`
Expected: PASS.

What this proves: the reader handles quoting, three line endings, a byte order mark, a preamble, a ragged row and four delimiters, and refuses an empty file by kind rather than by exception type. What it cannot see: a real export from a real booking system, which Task 18 Step 6 is for, and how long 500,000 rows takes, which Task 15 measures in a browser.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/csv.ts lib/tools/second-visit/csv.test.ts
git commit -m "feat(second-visit): a csv reader that treats crlf and lf the same and skips a preamble"
```

---

### Task 6: Guessing which column is which, and refusing when it cannot

**Files:**
- Create: `lib/tools/second-visit/mapping.ts`
- Test: `lib/tools/second-visit/mapping.test.ts`

**Interfaces:**
- Consumes: `Sheet` (Task 5), `parseDay`, `detectDateStyle` (Task 3), `ColumnRoles`, `Booking`, `ReadError` (Task 3)
- Produces: `guessRoles`, `emptyRoles`, `validateRoles`, `toBookings`, `parseAmountCents`, `statusRole`, `type ReadSummary`

Two columns are needed and the rest each switch something on. The page shows the guess and lets every one of them be changed, so this module's job is a good first answer and a refusal that names the missing thing rather than a silent wrong one.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/mapping.test.ts
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { emptyRoles, guessRoles, parseAmountCents, statusRole, toBookings, validateRoles } from "./mapping";
import { dayFromIso } from "./numbers";

const sheetOf = (text: string) => parseCsv(text);

describe("guessing from the header", () => {
  it("finds the obvious names", () => {
    const sheet = sheetOf(
      "Customer ID,Booking Date,Total,Town,Product\nc1,2026-01-04,45.00,Longford,Sauna\n",
    );
    const roles = guessRoles(sheet);
    expect(roles.customer).toBe(0);
    expect(roles.date).toBe(1);
    expect(roles.amount).toBe(2);
    expect(roles.town).toBe(3);
    expect(roles.product).toBe(4);
  });

  it("prefers an email over a name for identity, because a name is not unique", () => {
    const sheet = sheetOf("Name,Email,Date\nJohn Smith,a@b.ie,2026-01-04\n");
    const roles = guessRoles(sheet);
    expect(roles.customer).toBe(1);
    expect(roles.email).toBe(1);
  });

  it("finds a date column by its content when the header is unhelpful", () => {
    // No header word in this file says "date", so the content fallback is the
    // only thing that can find it.
    const sheet = sheetOf("ref,col2,who\nA1,2026-01-04,c1\nA2,2026-02-11,c2\nA3,2026-03-01,c1\n");
    expect(guessRoles(sheet).date).toBe(1);
  });

  it("does not guess a role it has no evidence for", () => {
    const sheet = sheetOf("customer,date\nc1,2026-01-04\n");
    const roles = guessRoles(sheet);
    expect(roles.amount).toBeNull();
    expect(roles.capacity).toBeNull();
    expect(roles.credits).toBeNull();
  });

  it("starts from nothing", () => {
    const roles = emptyRoles();
    expect(roles.customer).toBe(-1);
    expect(roles.date).toBe(-1);
    expect(roles.town).toBeNull();
  });
});

describe("refusing, by name", () => {
  const sheet = sheetOf("a,b\n1,2026-01-04\n");

  it("names the customer column when it is missing", () => {
    const error = validateRoles({ ...emptyRoles(), date: 1 }, sheet);
    expect(error?.kind).toBe("no-customer");
  });

  it("names the date column when it is missing", () => {
    const error = validateRoles({ ...emptyRoles(), customer: 0 }, sheet);
    expect(error?.kind).toBe("no-date");
  });

  it("is happy with the two", () => {
    expect(validateRoles({ ...emptyRoles(), customer: 0, date: 1 }, sheet)).toBeNull();
  });
});

describe("reading money", () => {
  it("takes a plain number as whole cents", () => {
    expect(parseAmountCents("45.00")).toBe(4500);
    expect(parseAmountCents("45")).toBe(4500);
    expect(parseAmountCents("0.99")).toBe(99);
  });

  it("takes a currency symbol and a thousands separator", () => {
    expect(parseAmountCents("EUR 1,234.56")).toBe(123456);
    expect(parseAmountCents("1 234.56")).toBe(123456);
  });

  /**
   * A file made in a locale where the comma is the decimal point. Decided per
   * value rather than per column, because the two forms are distinguishable:
   * a comma with exactly two digits after it and no full stop anywhere is a
   * decimal comma, and anything else is a thousands separator.
   */
  it("takes a decimal comma", () => {
    expect(parseAmountCents("45,00")).toBe(4500);
    expect(parseAmountCents("1.234,56")).toBe(123456);
  });

  it("reads a bracketed number as a refund", () => {
    expect(parseAmountCents("(45.00)")).toBe(-4500);
    expect(parseAmountCents("-45.00")).toBe(-4500);
  });

  it("is null on anything it cannot read, rather than zero", () => {
    // Zero would be a claim that the booking was free.
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("free")).toBeNull();
    expect(parseAmountCents("n/a")).toBeNull();
  });

  it("does not lose a cent to floating point", () => {
    expect(parseAmountCents("35.35")).toBe(3535);
    expect(parseAmountCents("8.15")).toBe(815);
  });
});

describe("reading a status", () => {
  it("knows the three that matter and files the rest as other", () => {
    for (const word of ["completed", "Complete", "attended", "checked in", "CHECKED_IN", "fulfilled"]) {
      expect(statusRole(word)).toBe("completed");
    }
    for (const word of ["no show", "no-show", "NoShow", "did not attend"]) {
      expect(statusRole(word)).toBe("no_show");
    }
    for (const word of ["cancelled", "canceled", "refunded", "void"]) {
      expect(statusRole(word)).toBe("cancelled");
    }
    expect(statusRole("pending")).toBe("other");
    expect(statusRole("")).toBe("other");
  });
});

describe("turning rows into bookings", () => {
  const text = [
    "customer,date,amount,slot,capacity,status,town,product,party,credits",
    "c1,2026-01-04,45.00,18:00,8,completed,Longford,Sauna,2,0",
    "c1,2026-02-01,45.00,18:00,8,completed,Longford,Sauna,2,0",
    "c2,2026-02-04,45.00,20:00,8,cancelled,Dublin,Sauna,1,3",
    "c3,not a date,45.00,,,completed,,,1,0",
  ].join("\n");

  const roles = {
    ...emptyRoles(),
    customer: 0,
    date: 1,
    amount: 2,
    slotStart: 3,
    capacity: 4,
    status: 5,
    town: 6,
    product: 7,
    party: 8,
    credits: 9,
  };

  it("keeps the rows it could read and counts the ones it could not", () => {
    const out = toBookings(sheetOf(text), roles);
    expect(out.bookings).toHaveLength(3);
    expect(out.used).toBe(3);
    expect(out.ignored).toBe(1);
    expect(out.reasons.badDate).toBe(1);
  });

  it("reads the parts of a booking", () => {
    const b = toBookings(sheetOf(text), roles).bookings[0];
    expect(b.customerId).toBe("c1");
    expect(b.day).toBe(dayFromIso("2026-01-04"));
    expect(b.hour).toBe(18);
    expect(b.capacity).toBe(8);
    expect(b.status).toBe("completed");
    expect(b.amountCents).toBe(4500);
    expect(b.town).toBe("Longford");
    expect(b.product).toBe("Sauna");
    expect(b.party).toBe(2);
  });

  it("keeps a cancelled row, marked, rather than dropping it", () => {
    // The cancellation rate is a number worth showing, and a row that is
    // silently gone cannot be counted later.
    const cancelled = toBookings(sheetOf(text), roles).bookings.find((b) => b.customerId === "c2");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.creditsRemaining).toBe(3);
  });

  it("decides the date style once for the whole column", () => {
    const out = toBookings(sheetOf(text), roles);
    expect(out.dateStyle).toBe("iso");
    expect(out.ambiguousDates).toBe(false);
  });

  it("reads a day-first column day-first, and says when it had to guess", () => {
    const dmy = sheetOf("customer,date\nc1,14/03/2026\nc2,01/02/2026\n");
    const out = toBookings(dmy, { ...emptyRoles(), customer: 0, date: 1 });
    expect(out.dateStyle).toBe("dmy");
    expect(out.ambiguousDates).toBe(false);
    expect(out.bookings[0].day).toBe(dayFromIso("2026-03-14"));

    const guessed = toBookings(sheetOf("customer,date\nc1,01/02/2026\nc2,03/04/2026\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(guessed.ambiguousDates).toBe(true);
  });

  it("defaults a party of nothing to one person", () => {
    const out = toBookings(sheetOf("customer,date\nc1,2026-01-04\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(out.bookings[0].party).toBe(1);
    expect(out.bookings[0].status).toBe("completed");
    expect(out.bookings[0].amountCents).toBeNull();
  });

  it("drops a row with no customer identifier at all", () => {
    const out = toBookings(sheetOf("customer,date\n,2026-01-04\nc1,2026-01-05\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(out.bookings).toHaveLength(1);
    expect(out.reasons.noCustomer).toBe(1);
  });

  it("reads a slot as an hour from several shapes", () => {
    const out = toBookings(
      sheetOf("customer,date,slot\nc1,2026-01-04,18:00\nc2,2026-01-04,2026-01-04T09:30:00Z\nc3,2026-01-04,7pm\n"),
      { ...emptyRoles(), customer: 0, date: 1, slotStart: 2 },
    );
    expect(out.bookings.map((b) => b.hour)).toEqual([18, 9, 19]);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/mapping.test.ts`
Expected: FAIL with `Cannot find module './mapping'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/mapping.ts
import type { Sheet } from "./csv";
import { detectDateStyle, parseDay, roundTo } from "./numbers";
import { ReadError, type Booking, type ColumnRoles, type DateStyle, type StatusRole } from "./types";

/**
 * Which column is which, guessed and then shown to the visitor to correct.
 *
 * The guess is header-driven with one content fallback, for the date, because
 * a column of dates is the only role a machine can recognise without being
 * told. Everything else is a vocabulary of the words booking systems actually
 * use, and a wrong guess costs one click.
 *
 * Only `customer` and `date` are required. Every other role switches something
 * on and its absence switches that thing off, visibly, on the page: no town
 * means no distance bands, no slot means no squeeze and no slot grid, no
 * product means no reorder radar, no credits means the `committed_idle` verdict
 * can never fire. The page says each of those in a sentence rather than showing
 * an empty panel.
 */

const HEADER_WORDS: Record<keyof ColumnRoles, RegExp[]> = {
  customer: [/^customer.?(id|ref|number|code)$/i, /^client.?(id|ref)?$/i, /^customer$/i, /^guest$/i, /^member$/i, /^user.?id$/i, /^contact$/i],
  date: [/date/i, /^when$/i, /^day$/i, /^booked.?(on|at)$/i, /^start/i, /^created/i, /^placed/i],
  amount: [/^(total|amount|price|revenue|paid|net|gross|value)/i, /total.?(price|amount|paid)/i, /^subtotal$/i],
  slotStart: [/^(slot|session|class|start).?(time|at|start)?$/i, /^time$/i, /start.?time/i],
  capacity: [/capacity/i, /^seats?$/i, /^places$/i, /max.?(seats|guests|capacity)/i],
  status: [/status/i, /^state$/i, /^outcome$/i, /^attendance$/i],
  town: [/^(town|city|locality)$/i, /^address.?(city|town)$/i, /^billing.?city$/i, /^shipping.?city$/i],
  country: [/^country/i, /country.?code/i],
  product: [/^(product|service|item|treatment|class|session).?(name|type)?$/i, /^sku$/i, /^package$/i],
  party: [/party/i, /^(guests|people|pax|seats.?booked|quantity|qty)$/i, /group.?size/i],
  credits: [/credit/i, /^(pack|passes|sessions).?(remaining|left|balance)$/i, /membership/i],
  consent: [/consent/i, /marketing/i, /^opt.?in$/i, /subscribed/i, /newsletter/i],
  email: [/e.?mail/i],
  phone: [/^(phone|mobile|tel|telephone|msisdn)/i],
};

/** No column chosen for anything. `-1` for the two required roles, null elsewhere. */
export function emptyRoles(): ColumnRoles {
  return {
    customer: -1,
    date: -1,
    amount: null,
    slotStart: null,
    capacity: null,
    status: null,
    town: null,
    country: null,
    product: null,
    party: null,
    credits: null,
    consent: null,
    email: null,
    phone: null,
  };
}

function matchHeader(header: readonly string[], patterns: RegExp[], taken: Set<number>): number | null {
  for (const pattern of patterns) {
    for (let i = 0; i < header.length; i++) {
      if (taken.has(i)) continue;
      if (pattern.test(header[i].trim())) return i;
    }
  }
  return null;
}

/** The share of the sampled values in a column that read as a date. */
function dateDensity(sheet: Sheet, column: number): number {
  const sample = sheet.rows.slice(0, 200).map((row) => row[column] ?? "");
  const { style } = detectDateStyle(sample);
  const nonEmpty = sample.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return 0;
  const parsed = nonEmpty.filter((v) => parseDay(v, style) !== null).length;
  return parsed / nonEmpty.length;
}

export function guessRoles(sheet: Sheet): ColumnRoles {
  const roles = emptyRoles();
  const taken = new Set<number>();

  // Identity first, and an email beats a name: two people called John Smith are
  // one customer to anything that keys on a name, and that silently halves a
  // real retention figure.
  const email = matchHeader(sheet.header, HEADER_WORDS.email, taken);
  if (email !== null) roles.email = email;
  const phone = matchHeader(sheet.header, HEADER_WORDS.phone, taken);
  if (phone !== null) roles.phone = phone;

  const explicitId = matchHeader(sheet.header, HEADER_WORDS.customer, taken);
  roles.customer = explicitId ?? roles.email ?? -1;
  if (roles.customer >= 0) taken.add(roles.customer);

  const dateByHeader = matchHeader(sheet.header, HEADER_WORDS.date, taken);
  if (dateByHeader !== null && dateDensity(sheet, dateByHeader) >= 0.6) {
    roles.date = dateByHeader;
  } else {
    // The one content fallback. A column of dates is the only role that
    // announces itself without a helpful header.
    let best = -1;
    let bestDensity = 0.6;
    for (let i = 0; i < sheet.header.length; i++) {
      if (taken.has(i)) continue;
      const density = dateDensity(sheet, i);
      if (density > bestDensity) {
        best = i;
        bestDensity = density;
      }
    }
    roles.date = best;
  }
  if (roles.date >= 0) taken.add(roles.date);

  for (const role of ["amount", "slotStart", "capacity", "status", "town", "country", "product", "party", "credits", "consent"] as const) {
    const found = matchHeader(sheet.header, HEADER_WORDS[role], taken);
    if (found !== null) {
      roles[role] = found;
      taken.add(found);
    }
  }
  return roles;
}

export function validateRoles(roles: ColumnRoles, sheet: Sheet): ReadError | null {
  const inRange = (i: number) => i >= 0 && i < sheet.header.length;
  if (!inRange(roles.customer)) return new ReadError("no-customer", "no customer column chosen");
  if (!inRange(roles.date)) return new ReadError("no-date", "no date column chosen");
  return null;
}

const CURRENCY = /[^0-9,.\-()]/g;

/**
 * Money, in whole cents, or null when the cell says nothing.
 *
 * Null rather than zero, because zero is a claim that the booking was free and
 * that claim would drag every average order value in the report.
 *
 * The decimal separator is decided per value. A comma followed by exactly two
 * digits with no full stop after it is a decimal comma; anything else is a
 * thousands separator. That is decidable, unlike the date question, because a
 * thousands group is always three digits.
 */
export function parseAmountCents(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const negative = /^\(.*\)$/.test(text) || text.trim().startsWith("-");
  let cleaned = text.replace(CURRENCY, "");
  cleaned = cleaned.replace(/[()\-]/g, "");
  if (cleaned === "") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot && /,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // roundTo rather than Math.round(value * 100): 35.35 * 100 is
  // 3534.9999999999995 and truncating that loses a cent on every third row.
  const cents = roundTo(value * 100, 0);
  return negative ? -cents : cents;
}

const COMPLETED = /^(completed?|attended|checked.?in|finished|fulfill?ed|paid|done|success(ful)?)$/i;
const NO_SHOW = /^(no.?show|did.?not.?attend|dna|missed)$/i;
// `void(ed)?` and not `voided?`: the second one needs the "e" and so misses the
// bare word "void", which is what a payment system actually writes.
const CANCELLED = /^(cancell?ed|refunded|void(ed)?|declined|failed|abandoned)$/i;

export function statusRole(raw: string): StatusRole {
  const text = raw.trim().replace(/[_\s]+/g, " ");
  if (COMPLETED.test(text)) return "completed";
  if (NO_SHOW.test(text)) return "no_show";
  if (CANCELLED.test(text)) return "cancelled";
  return "other";
}

const HOUR_COLON = /(\d{1,2}):(\d{2})/;
const HOUR_AMPM = /^(\d{1,2})\s*(am|pm)$/i;

/** The hour of the day a slot starts, from a time, a timestamp or "7pm". */
function parseHour(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const ampm = HOUR_AMPM.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[2])) hour += 12;
    return hour;
  }
  const colon = HOUR_COLON.exec(text);
  if (colon) {
    const hour = Number(colon[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  const bare = Number(text);
  if (Number.isInteger(bare) && bare >= 0 && bare <= 23) return bare;
  return null;
}

function parseCount(raw: string, fallback: number): number {
  const value = Number(raw.trim().replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

const TRUE_WORDS = /^(true|yes|y|1|active|subscribed|opted.?in|member)$/i;
const FALSE_WORDS = /^(false|no|n|0|inactive|unsubscribed|opted.?out|none)$/i;

function parseBoolish(raw: string): boolean | null {
  const text = raw.trim();
  if (text === "") return null;
  if (TRUE_WORDS.test(text)) return true;
  if (FALSE_WORDS.test(text)) return false;
  return null;
}

export type ReadSummary = {
  bookings: Booking[];
  used: number;
  ignored: number;
  dateStyle: DateStyle;
  ambiguousDates: boolean;
  reasons: { badDate: number; noCustomer: number };
};

export function toBookings(sheet: Sheet, roles: ColumnRoles): ReadSummary {
  const cell = (row: string[], index: number | null): string =>
    index === null || index < 0 ? "" : (row[index] ?? "");

  const sample = sheet.rows.slice(0, 200).map((row) => cell(row, roles.date));
  const { style, ambiguous } = detectDateStyle(sample);

  const bookings: Booking[] = [];
  let badDate = 0;
  let noCustomer = 0;

  for (const row of sheet.rows) {
    const customerId = cell(row, roles.customer).trim();
    if (customerId === "") {
      noCustomer++;
      continue;
    }
    const day = parseDay(cell(row, roles.date), style);
    if (day === null) {
      badDate++;
      continue;
    }
    const capacityText = cell(row, roles.capacity).trim();
    const partyText = cell(row, roles.party).trim();
    const creditsRaw = cell(row, roles.credits).trim();
    const creditsBool = parseBoolish(creditsRaw);
    bookings.push({
      customerId,
      day,
      hour: roles.slotStart === null ? null : parseHour(cell(row, roles.slotStart)),
      capacity: capacityText === "" ? null : parseCount(capacityText, 0) || null,
      status: roles.status === null ? "completed" : statusRole(cell(row, roles.status)),
      amountCents: roles.amount === null ? null : parseAmountCents(cell(row, roles.amount)),
      town: roles.town === null ? null : cell(row, roles.town).trim() || null,
      country: roles.country === null ? null : cell(row, roles.country).trim() || null,
      product: roles.product === null ? null : cell(row, roles.product).trim() || null,
      party: partyText === "" ? 1 : Math.max(1, parseCount(partyText, 1)),
      creditsRemaining: creditsBool === true ? 1 : creditsBool === false ? 0 : parseCount(creditsRaw, 0),
      consent: roles.consent === null ? null : parseBoolish(cell(row, roles.consent)),
      hasEmail: cell(row, roles.email).trim() !== "",
      hasPhone: cell(row, roles.phone).trim() !== "",
    });
  }

  return {
    bookings,
    used: bookings.length,
    ignored: badDate + noCustomer,
    dateStyle: style,
    ambiguousDates: ambiguous,
    reasons: { badDate, noCustomer },
  };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/mapping.test.ts`
Expected: PASS.

What this proves: the guess finds the ordinary shapes, an email beats a name for identity, money survives four notations without losing a cent, and a row it cannot read is counted rather than dropped in silence. What it cannot see: any header spelling nobody thought of, which is why the page always shows the guess and lets it be changed, and a real export, which Task 18 Step 6 covers.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/mapping.ts lib/tools/second-visit/mapping.test.ts
git commit -m "feat(second-visit): guess the columns, refuse by name, and never read a blank amount as free"
```

---

### Task 7: Towns, so a distance band means something

**Files:**
- Create: `scripts/second-visit/build-towns.mjs`
- Create: `lib/tools/second-visit/towns.generated.ts` (by running that script)
- Create: `lib/tools/second-visit/towns.ts`
- Test: `lib/tools/second-visit/towns.test.ts`

**Interfaces:**
- Consumes: GeoNames, once, on somebody's machine
- Produces: `TOWNS`, `TOWNS_ATTRIBUTION`, `normaliseTownName`, `findTown`, `townOptions`

The model's distance bands need two coordinates: the venue's and the customer's. Neither is in a booking export, but a town name usually is, so the tool bundles town centroids and looks both up. **A centroid is not an address**, the error is up to a few kilometres inside a large town, and that is on the page rather than in a footnote: it moves nobody between bands except right on a boundary, and the bands are sliders anyway.

Northern Ireland is included on purpose. A sauna in Donegal has customers from Derry, and without GB places every one of them would fall to `unknown` instead of `visitor`, which is the band `distance_band` exists to produce.

- [ ] **Step 1: Write the build script**

```js
// scripts/second-visit/build-towns.mjs
/**
 * Builds lib/tools/second-visit/towns.generated.ts from GeoNames.
 *
 * Run rarely, by hand, on a machine with a network. The generated file is
 * committed, so a fresh clone never needs this and CI never runs it.
 *
 *   node scripts/second-visit/build-towns.mjs
 *   node scripts/second-visit/build-towns.mjs --min-population 1000
 *
 * Source: https://download.geonames.org/export/dump/, licensed CC BY 4.0. The
 * attribution that licence requires is printed on the tool's page and is in
 * `content/tools/second-visit.ts`, not only in this comment.
 *
 * Two countries. IE is the whole of it; GB is filtered to admin1 `NIR`, because
 * a sauna in Donegal has customers from Derry and without them every one of
 * those rows falls to `unknown` instead of `visitor`.
 *
 * The zip is unpacked with `tar -xf`, which is bsdtar on Windows 10 and later
 * and GNU tar with libarchive elsewhere, and handles a zip in both. That is
 * deliberately not a dependency: this script runs about once a year.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://download.geonames.org/export/dump";
const args = process.argv.slice(2);
const minPopulation = Number(args[args.indexOf("--min-population") + 1]) || 500;
/** Capitals and administrative seats come in whatever their population says. */
const ALWAYS = new Set(["PPLC", "PPLA", "PPLA2"]);

const work = mkdtempSync(join(tmpdir(), "sv-towns-"));

async function download(name) {
  const url = `${BASE}/${name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} came back ${response.status}`);
  const path = join(work, name);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  console.log(`downloaded ${name}, ${(await (await fetch(url)).arrayBuffer()).byteLength} bytes`);
  return path;
}

function unzip(zipPath, member) {
  execFileSync("tar", ["-xf", zipPath, "-C", work, member], { stdio: "inherit" });
  return join(work, member);
}

const adminPath = await download("admin1CodesASCII.txt");
const admin = new Map();
for (const line of readFileSync(adminPath, "utf8").split("\n")) {
  const [code, name] = line.split("\t");
  if (code && name) admin.set(code, name);
}

const rows = [];
for (const [country, file, filter] of [
  ["IE", "IE.zip", () => true],
  ["GB", "GB.zip", (cols) => cols[10] === "NIR"],
]) {
  const zip = await download(file);
  const txt = unzip(zip, file.replace(".zip", ".txt"));
  let kept = 0;
  for (const line of readFileSync(txt, "utf8").split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 15) continue;
    if (cols[6] !== "P") continue;
    if (!filter(cols)) continue;
    const population = Number(cols[14]) || 0;
    if (population < minPopulation && !ALWAYS.has(cols[7])) continue;
    const county = country === "GB" ? "Northern Ireland" : (admin.get(`IE.${cols[10]}`) ?? "");
    rows.push([cols[1], county, country, Number(cols[4]), Number(cols[5]), population]);
    kept++;
  }
  console.log(`${file}: kept ${kept}`);
}

// One row per name, the largest settlement winning, so "Newport" is the one
// most people mean and the other is unreachable rather than randomly chosen.
const byName = new Map();
for (const row of rows) {
  const key = row[0].toLowerCase();
  const existing = byName.get(key);
  if (!existing || row[5] > existing[5]) byName.set(key, row);
}
const final = [...byName.values()].sort((a, b) => b[5] - a[5] || a[0].localeCompare(b[0]));

const body = final
  .map(([n, c, cc, lat, lng, pop]) =>
    `  [${JSON.stringify(n)},${JSON.stringify(c)},"${cc}",${lat},${lng},${pop}],`,
  )
  .join("\n");

writeFileSync(
  "lib/tools/second-visit/towns.generated.ts",
  `// GENERATED by scripts/second-visit/build-towns.mjs. Do not edit by hand.
//
// Source: GeoNames (https://www.geonames.org/), IE.zip and the Northern Ireland
// rows of GB.zip, licensed CC BY 4.0. The attribution that licence requires is
// printed on /tools/second-visit and lives in content/tools/second-visit.ts.
//
// Populated places only (feature class P) with a population of at least
// ${minPopulation}, plus every capital and administrative seat whatever its
// population. One row per name, the largest settlement winning.
//
// Built ${new Date().toISOString().slice(0, 10)}. ${final.length} places.

/** name, county, country, latitude, longitude, population */
export type TownRow = readonly [string, string, string, number, number, number];

export const TOWN_ROWS: readonly TownRow[] = [
${body}
];
`,
  "utf8",
);

rmSync(work, { recursive: true, force: true });
console.log(`wrote ${final.length} places`);
```

- [ ] **Step 2: Run it, and measure what it costs the visitor to download**

```bash
cd "$WT"
node scripts/second-visit/build-towns.mjs
wc -c lib/tools/second-visit/towns.generated.ts
gzip -9 -c lib/tools/second-visit/towns.generated.ts | wc -c
grep -c "^  \[" lib/tools/second-visit/towns.generated.ts
```

Expected: a file of somewhere around 1,000 to 1,500 places. **The ceiling is 40 KB gzipped**, because this ships in the page's JavaScript to every visitor whether or not they have a town column, and the phone is the product surface.

If the gzipped size is over 40 KB, re-run with `--min-population 1000` and measure again. Record both numbers in the ledger, because "it is 1,200 towns" is not a fact about anybody's phone and the gzipped byte count is.

**If the download fails**, the script says which URL and with what status. GeoNames occasionally moves a file. Do not work around it by hand-typing a table of towns: a hand-typed centroid is a number nobody can check and the whole distance band rests on it.

- [ ] **Step 3: Write the failing tests**

```ts
// lib/tools/second-visit/towns.test.ts
import { describe, expect, it } from "vitest";
import { TOWNS, TOWNS_ATTRIBUTION, findTown, normaliseTownName, townOptions } from "./towns";

describe("the table", () => {
  it("has a workable number of Irish places", () => {
    expect(TOWNS.length).toBeGreaterThan(300);
    expect(TOWNS.length).toBeLessThan(4000);
  });

  it("carries the attribution the licence requires", () => {
    expect(TOWNS_ATTRIBUTION).toContain("GeoNames");
    expect(TOWNS_ATTRIBUTION).toContain("CC BY 4.0");
  });

  it("has both countries in it, so a border can exist", () => {
    expect(TOWNS.some((t) => t.country === "IE")).toBe(true);
    expect(TOWNS.some((t) => t.country === "GB")).toBe(true);
  });

  it("has coordinates that are actually on this island", () => {
    for (const town of TOWNS) {
      expect(town.lat).toBeGreaterThan(51);
      expect(town.lat).toBeLessThan(56);
      expect(town.lng).toBeGreaterThan(-11);
      expect(town.lng).toBeLessThan(-5);
    }
  });
});

describe("normalising what somebody typed", () => {
  it("folds case, accents and punctuation", () => {
    expect(normaliseTownName("Dún Laoghaire")).toBe("dun laoghaire");
    expect(normaliseTownName("DUN  LAOGHAIRE ")).toBe("dun laoghaire");
    expect(normaliseTownName("Carrick-on-Shannon")).toBe("carrick on shannon");
  });

  it("drops the county wrapper people put round a town", () => {
    expect(normaliseTownName("Co. Longford")).toBe("longford");
    expect(normaliseTownName("County Cork")).toBe("cork");
    expect(normaliseTownName("Longford, Co. Longford")).toBe("longford");
  });

  it("drops a Dublin postal district", () => {
    expect(normaliseTownName("Dublin 4")).toBe("dublin");
    expect(normaliseTownName("Dublin 6W")).toBe("dublin");
  });

  it("leaves a name that needs nothing done to it alone", () => {
    expect(normaliseTownName("Sligo")).toBe("sligo");
  });
});

describe("looking a town up", () => {
  it("finds the obvious ones", () => {
    expect(findTown("Dublin")?.country).toBe("IE");
    expect(findTown("cork")?.name.toLowerCase()).toContain("cork");
    expect(findTown("Belfast")?.country).toBe("GB");
  });

  it("finds one through an accent and a county wrapper", () => {
    expect(findTown("Dún Laoghaire")).not.toBeNull();
    expect(findTown("Longford, Co. Longford")?.name).toBe("Longford");
  });

  it("is null on nothing and on nonsense, rather than guessing the nearest", () => {
    // A fuzzy match here would put a customer in a band on the strength of a
    // typo, and the band changes the verdict.
    expect(findTown("")).toBeNull();
    expect(findTown(null)).toBeNull();
    expect(findTown("Zzzzz")).toBeNull();
  });

  it("offers the list biggest first, because that is what a picker wants", () => {
    const options = townOptions();
    expect(options[0].population).toBeGreaterThanOrEqual(options[1].population);
    expect(options).toHaveLength(TOWNS.length);
  });
});

describe("what a centroid can and cannot do", () => {
  it("puts Dublin about 98km from the Longford village the bands were drawn for", async () => {
    const { distanceKm } = await import("./model");
    const dublin = findTown("Dublin");
    expect(dublin).not.toBeNull();
    const km = distanceKm(53.8608, -7.5806, dublin!.lat, dublin!.lng) as number;
    // The migration's comment says 98km; these coordinates and GeoNames'
    // Dublin centroid give about 104. A centroid is not an address and this
    // tolerance says so out loud. What matters is which side of 95 it falls.
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(115);
  });
});
```

- [ ] **Step 4: Write the lookup**

```ts
// lib/tools/second-visit/towns.ts
import { TOWN_ROWS } from "./towns.generated";

/**
 * Town centroids, and the one thing they are for.
 *
 * A booking export has a town, not an address, so the distance a band is drawn
 * from is centroid to centroid. Inside a large town that is out by a few
 * kilometres, which moves nobody between bands except on a boundary, and the
 * boundaries are sliders. The page says this in a sentence rather than hiding
 * it, because a number presented to three decimal places invites more trust
 * than a centroid deserves.
 *
 * **The lookup is exact after normalisation and never fuzzy.** A near match
 * would put a customer in a band on the strength of a typo, and the band
 * changes the verdict. An unmatched town is `unknown`, which the model treats
 * as a factor of 1.00, because not knowing where somebody lives is a gap in the
 * records and must not be charged to the customer as suspicion.
 */

export type Town = {
  name: string;
  county: string;
  country: string;
  lat: number;
  lng: number;
  population: number;
};

export const TOWNS: readonly Town[] = TOWN_ROWS.map(
  ([name, county, country, lat, lng, population]) => ({ name, county, country, lat, lng, population }),
);

export const TOWNS_ATTRIBUTION = "Town coordinates from GeoNames, CC BY 4.0.";

const COUNTY_PREFIX = /^(co\.?|county)\s+/;
const DUBLIN_DISTRICT = /^dublin\s+\d+\s*w?$/;

/**
 * Everything a person might type round a town name, taken off.
 *
 * The order matters: accents are folded before punctuation, because a combining
 * mark is not punctuation, and the county wrapper comes off after the comma
 * split so "Longford, Co. Longford" reduces to one name rather than two.
 */
export function normaliseTownName(input: string): string {
  let text = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  // A comma usually separates a town from its county, and the town is first.
  const [head] = text.split(",");
  text = head
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^the /, "");
  text = text.replace(COUNTY_PREFIX, "");
  if (DUBLIN_DISTRICT.test(text)) return "dublin";
  return text;
}

const INDEX: Map<string, Town> = (() => {
  const index = new Map<string, Town>();
  const consider = (key: string, town: Town) => {
    if (key === "") return;
    const existing = index.get(key);
    if (!existing || town.population > existing.population) index.set(key, town);
  };
  for (const town of TOWNS) consider(normaliseTownName(town.name), town);
  // A county name resolves to its largest place, so "Co. Leitrim" in a town
  // column is a coordinate rather than a shrug.
  for (const town of TOWNS) if (town.county) consider(normaliseTownName(town.county), town);
  return index;
})();

export function findTown(input: string | null | undefined): Town | null {
  if (!input) return null;
  return INDEX.get(normaliseTownName(input)) ?? null;
}

/** Biggest first, which is the order a picker wants. */
export function townOptions(): readonly Town[] {
  return [...TOWNS].sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/towns.test.ts`
Expected: PASS.

What this proves: the table is built, both countries are in it, every coordinate is on this island, and the lookup handles accents, county wrappers and Dublin postal districts without ever guessing. What it cannot see: how many rows of a real export match, which Task 18 Step 6 measures and which the page reports per run as a "no town matched" count.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add scripts/second-visit/build-towns.mjs lib/tools/second-visit/towns.generated.ts lib/tools/second-visit/towns.ts lib/tools/second-visit/towns.test.ts
git commit -m "feat(second-visit): irish and northern irish town centroids, matched exactly or not at all"
```

---

### Task 8: Customers, the trading year, and the slot that kept selling out

**Files:**
- Create: `lib/tools/second-visit/customers.ts`
- Test: `lib/tools/second-visit/customers.test.ts`
- Modify: `content/tools/second-visit.ts` (two copy blocks the panels need)

**Interfaces:**
- Consumes: `Booking`, `ModelParams` (Task 3), `medianCont`, `roundTo`, `isoDow`, `monthOfYear` (Task 3)
- Produces: `buildSeasonality`, `monthIndexFor`, `buildOccupancy`, `buildCustomers`, `squeezeOf`, `type Seasonality`, `type OccupancyIndex`, `type CustomerFacts`

This is where the four inputs 0300 takes from `analytics.customer_metrics` are reproduced, and each one has a detail in it that changes the answer:

- **`visits` counts attended rows**, which are `completed` and `no_show`. A no-show is a visit for the count.
- **`visit_cadence_days` is the median gap between `completed` rows only, with zero-day gaps dropped, rounded to one decimal.** All three of those are in 0070's SQL. A no-show is not part of somebody's rhythm, two bookings on one day are not a gap, and `numeric(6,1)` is a rounding rather than a storage detail.
- **`days_to_second_visit`** is over attended rows, so a no-show counts as coming back. That is 0070's reading and the port keeps it.
- **`days_since_last_visit`** is against the as-of date, for the reason in the head of this plan.

- [ ] **Step 1: Add the two copy blocks the slot and product panels need**

In `content/tools/second-visit.ts`, inside `secondVisitCopy`, after `exports`:

```ts
  slots: {
    title: "Slots",
    note: "Counted from your own bookings, so a slot nobody booked is not in the file and is not in this grid. The sold-out share below is the share of the slots that had at least one booking.",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    heatLabel: "Visits",
    fullLabel: "Sold out",
    missing: "No slot time column, so there is nothing to draw. Map one and this fills in.",
  },
  products: {
    title: "Reorder radar",
    note: "Anybody who has bought the same thing at least twice, with their own rhythm for that one thing, and how far past it they are.",
    missing: "No product column, so there is nothing to compare. Map one and this fills in.",
    columns: { product: "Product", customers: "Customers", median: "Median gap, days", overdue: "Overdue now" },
  },
```

`content/voice.test.ts` flattens the whole object, so these are covered without editing it again.

- [ ] **Step 2: Write the failing tests**

```ts
// lib/tools/second-visit/customers.test.ts
import { describe, expect, it } from "vitest";
import { buildCustomers, buildOccupancy, buildSeasonality, monthIndexFor, squeezeOf } from "./customers";
import { PRODUCTION_PARAMS } from "./model";
import { dayFromIso } from "./numbers";
import type { Booking } from "./types";

const day = (iso: string) => dayFromIso(iso) as number;

const booking = (over: Partial<Booking> & { customerId: string; day: number }): Booking => ({
  hour: null,
  capacity: null,
  status: "completed",
  amountCents: null,
  town: null,
  country: null,
  product: null,
  party: 1,
  creditsRemaining: 0,
  consent: null,
  hasEmail: false,
  hasPhone: false,
  ...over,
});

describe("the trading year", () => {
  it("puts an average month at 1.0", () => {
    const bookings = [
      ...Array.from({ length: 10 }, () => booking({ customerId: "a", day: day("2026-01-10") })),
      ...Array.from({ length: 10 }, () => booking({ customerId: "b", day: day("2026-07-10") })),
    ];
    const season = buildSeasonality(bookings);
    expect(monthIndexFor(season, 1)).toBe(1);
    expect(monthIndexFor(season, 7)).toBe(1);
  });

  it("halves a month that traded half as much", () => {
    const bookings = [
      ...Array.from({ length: 12 }, () => booking({ customerId: "a", day: day("2026-01-10") })),
      ...Array.from({ length: 6 }, () => booking({ customerId: "b", day: day("2026-07-10") })),
    ];
    const season = buildSeasonality(bookings);
    // Average month is 9, so January is 12/9 and July is 6/9, rounded to three
    // places the way the view does.
    expect(monthIndexFor(season, 1)).toBe(1.333);
    expect(monthIndexFor(season, 7)).toBe(0.667);
  });

  it("is 1.0 for a month with no trade in it at all", () => {
    const season = buildSeasonality([booking({ customerId: "a", day: day("2026-01-10") })]);
    expect(monthIndexFor(season, 6)).toBe(1);
  });

  /**
   * The design's own "can't see" line. One winter is no evidence about a
   * summer, and a month index computed from six months would say otherwise
   * with total confidence.
   */
  it("says it has too little history under twelve months", () => {
    const short = buildSeasonality([
      booking({ customerId: "a", day: day("2026-01-10") }),
      booking({ customerId: "a", day: day("2026-06-10") }),
    ]);
    expect(short.enoughHistory).toBe(false);

    const long = buildSeasonality(
      Array.from({ length: 12 }, (_, i) =>
        booking({ customerId: "a", day: day(`2026-${String(i + 1).padStart(2, "0")}-10`) }),
      ),
    );
    expect(long.enoughHistory).toBe(true);
  });

  it("ignores a cancelled row", () => {
    const season = buildSeasonality([
      booking({ customerId: "a", day: day("2026-01-10") }),
      booking({ customerId: "b", day: day("2026-01-11"), status: "cancelled" }),
    ]);
    expect(season.total).toBe(1);
  });
});

describe("one customer's facts", () => {
  const asOf = day("2026-06-01");

  it("counts a no-show as a visit but not as part of the rhythm", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-11"), status: "no_show" }),
      booking({ customerId: "c1", day: day("2026-01-31") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.visits).toBe(3);
    expect(c.observedGaps).toBe(2);
    // Completed rows are the 1st and the 31st, so one gap of 30 days.
    expect(c.visitCadenceDays).toBe(30);
    // Days to a second visit counts the no-show, per 0070.
    expect(c.daysToSecondVisit).toBe(10);
  });

  it("drops a zero-day gap rather than letting a double booking halve the cadence", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-21") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Gaps are 0 and 20. Keeping the zero would give a median of 10.
    expect(c.visitCadenceDays).toBe(20);
  });

  /**
   * `numeric(6,1)` in 0070 is a rounding, and this port applies it. On integer
   * day gaps it is a no-op, because `percentile_cont` at 0.5 over integers is
   * always a whole number or a half. It is here so the port matches the column
   * type rather than because it changes an answer, and that is worth saying
   * out loud so nobody deletes it as dead code.
   */
  it("gives a half where the median falls between two gaps", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-04") }),
      booking({ customerId: "c1", day: day("2026-01-12") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Gaps 3 and 8, median 5.5, which numeric(6,1) leaves alone.
    expect(c.visitCadenceDays).toBe(5.5);
  });

  it("measures silence to the as-of date, not to today", () => {
    const bookings = [booking({ customerId: "c1", day: day("2026-05-01") })];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.daysSinceLast).toBe(31);
  });

  it("has no cadence and no second visit after one booking", () => {
    const bookings = [booking({ customerId: "c1", day: day("2026-05-01") })];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.visitCadenceDays).toBeNull();
    expect(c.daysToSecondVisit).toBeNull();
    expect(c.observedGaps).toBe(0);
  });

  it("counts money only where there is a figure", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), amountCents: 4500 }),
      booking({ customerId: "c1", day: day("2026-02-01") }),
      booking({ customerId: "c1", day: day("2026-03-01"), amountCents: 5500 }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.orders).toBe(2);
    expect(c.lifetimeValueCents).toBe(10000);
  });

  it("takes the modal party size and breaks a tie on the smaller", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), party: 2 }),
      booking({ customerId: "c1", day: day("2026-02-01"), party: 4 }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Postgres `mode()` breaks a tie arbitrarily; this port breaks it on the
    // smaller value so the same file gives the same answer twice. That is a
    // deliberate difference and the oracle fixture avoids ties because of it.
    expect(c.modalPartySize).toBe(2);
  });

  it("takes the most recent town and the strongest consent", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), town: "Longford", consent: false }),
      booking({ customerId: "c1", day: day("2026-02-01"), town: "Sligo", consent: true }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.town).toBe("Sligo");
    expect(c.consent).toBe(true);
  });

  it("counts visits in the trough against the venue's own quiet months", () => {
    // Twelve bookings in January and three in July makes July the trough.
    const bookings = [
      ...Array.from({ length: 12 }, (_, i) => booking({ customerId: `x${i}`, day: day("2026-01-10") })),
      ...Array.from({ length: 3 }, (_, i) => booking({ customerId: `y${i}`, day: day("2026-07-10") })),
      booking({ customerId: "c1", day: day("2026-01-05") }),
      booking({ customerId: "c1", day: day("2026-07-05") }),
    ];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1");
    expect(c?.seasonVisitsSeen).toBe(2);
    expect(c?.seasonVisitsInTrough).toBe(1);
  });

  it("returns one row per customer, in a stable order", () => {
    const bookings = [
      booking({ customerId: "b", day: day("2026-01-01") }),
      booking({ customerId: "a", day: day("2026-01-01") }),
      booking({ customerId: "b", day: day("2026-02-01") }),
    ];
    const rows = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the slot that kept selling out", () => {
  const asOf = day("2026-03-01");

  /**
   * Six Saturdays at 18:00 after the customer's last visit, five of which sold
   * out. The migration's floor is three visits before this can fire, because
   * the claim is that a habit was taken away and somebody who came twice had no
   * habit to take.
   */
  function saturdays(sold: number) {
    const rows: Booking[] = [];
    const dates = ["2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31", "2026-02-07", "2026-02-14"];
    dates.forEach((iso, i) => {
      const full = i < sold;
      for (let seat = 0; seat < (full ? 8 : 3); seat++) {
        rows.push(booking({ customerId: `other${i}-${seat}`, day: day(iso), hour: 18, capacity: 8 }));
      }
    });
    return rows;
  }

  const regular = [
    booking({ customerId: "c1", day: day("2025-12-06"), hour: 18, capacity: 8 }),
    booking({ customerId: "c1", day: day("2025-12-13"), hour: 18, capacity: 8 }),
    booking({ customerId: "c1", day: day("2025-12-20"), hour: 18, capacity: 8 }),
  ];

  it("fires when the habitual slot sold out at least half the time", () => {
    const bookings = [...regular, ...saturdays(5)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    const squeeze = squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS);
    expect(squeeze.slotsSince).toBe(6);
    expect(squeeze.slotsFull).toBe(5);
    expect(squeeze.squeezed).toBe(true);
  });

  it("does not fire when the slot was mostly available", () => {
    const bookings = [...regular, ...saturdays(2)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS).squeezed).toBe(false);
  });

  it("does not fire on somebody with two visits, who had no habit to take", () => {
    const twice = regular.slice(0, 2);
    const bookings = [...twice, ...saturdays(6)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS).squeezed).toBe(false);
  });

  it("does not fire on fewer than four slots since they left", () => {
    const bookings = [...regular, ...saturdays(6).filter((b) => b.day <= day("2026-01-24"))];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    const squeeze = squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS);
    expect(squeeze.slotsSince).toBe(3);
    expect(squeeze.squeezed).toBe(false);
  });

  it("says nothing at all when there is no slot column", () => {
    const bookings = regular.map((b) => ({ ...b, hour: null, capacity: null }));
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS)).toEqual({
      slotsSince: 0,
      slotsFull: 0,
      squeezed: false,
    });
  });
});
```

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/customers.ts
import { PRODUCTION_PARAMS } from "./model";
import { isoDow, medianCont, monthOfYear, roundTo } from "./numbers";
import type { Booking, ModelParams } from "./types";

/**
 * Bookings to the facts the model needs, which is where the four inputs
 * migration 0300 takes from `analytics.customer_metrics` are reproduced.
 *
 * Source for these definitions: `apps/api/migrations/0070_analytics_views.sql`
 * in `fergo5002/sauna-os`, the same commit as the model. 0300 consumes them and
 * does not define them, so reading 0300 alone would mean inventing four inputs
 * and then testing the invention against itself.
 *
 * The three that are easy to get almost right:
 *
 *   1. A visit is attended, which is completed or no-show. A no-show counts.
 *   2. A cadence is the median gap between COMPLETED visits, zero-day gaps
 *      dropped, rounded to one decimal. A no-show is not part of a rhythm, two
 *      bookings on one day are not a gap, and `numeric(6,1)` rounds.
 *   3. Silence is measured to the as-of date and not to today, because an
 *      export is a snapshot and today is a fact about the download.
 */

const attended = (b: Booking) => b.status === "completed" || b.status === "no_show";

export type Seasonality = {
  /** Index by calendar month, 1 to 12. Absent months are not present. */
  months: { month: number; visits: number; index: number }[];
  monthsSeen: number;
  total: number;
  /** Twelve distinct calendar months of trade, or the season factor is off. */
  enoughHistory: boolean;
};

/**
 * Trade per calendar month against this venue's own average month.
 *
 * Against the average month actually observed, not against a twelfth of the
 * total, so a venue that has only traded through one winter is not told its
 * summer is catastrophic. That the tool switches the factor off entirely below
 * twelve months is this tool's addition, and it is stated on the page.
 */
export function buildSeasonality(bookings: readonly Booking[]): Seasonality {
  const counts = new Map<number, number>();
  let total = 0;
  for (const b of bookings) {
    if (!attended(b)) continue;
    const month = monthOfYear(b.day);
    counts.set(month, (counts.get(month) ?? 0) + 1);
    total++;
  }
  const monthsSeen = counts.size;
  const average = monthsSeen === 0 ? 0 : total / monthsSeen;
  const months = [...counts.entries()]
    .map(([month, visits]) => ({
      month,
      visits,
      index: average === 0 ? 1 : roundTo(visits / average, 3),
    }))
    .sort((a, b) => a.month - b.month);

  // Distinct calendar months across the whole file, so two Januaries count once
  // for the shape of the year and the history test asks for twelve of them.
  return { months, monthsSeen, total, enoughHistory: monthsSeen >= 12 };
}

/** 1.0 for a month with no trade, which is the right amount of confidence. */
export function monthIndexFor(season: Seasonality, month: number): number {
  return season.months.find((m) => m.month === month)?.index ?? 1;
}

/** Keyed `day:hour`. Only slots somebody booked exist here; see the page's note. */
export type OccupancyIndex = Map<string, { day: number; hour: number; booked: number; capacity: number | null }>;

export function buildOccupancy(bookings: readonly Booking[]): OccupancyIndex {
  const index: OccupancyIndex = new Map();
  for (const b of bookings) {
    if (!attended(b) || b.hour === null) continue;
    const key = `${b.day}:${b.hour}`;
    const cell = index.get(key) ?? { day: b.day, hour: b.hour, booked: 0, capacity: null };
    cell.booked += 1;
    if (b.capacity !== null) cell.capacity = Math.max(cell.capacity ?? 0, b.capacity);
    index.set(key, cell);
  }
  return index;
}

export type CustomerFacts = {
  id: string;
  visits: number;
  cancelled: number;
  observedGaps: number;
  firstDay: number | null;
  lastDay: number | null;
  daysSinceLast: number | null;
  visitCadenceDays: number | null;
  daysToSecondVisit: number | null;
  orders: number;
  lifetimeValueCents: number;
  modalPartySize: number;
  modalWeekday: number | null;
  modalHour: number | null;
  town: string | null;
  country: string | null;
  creditsRemaining: number;
  consent: boolean | null;
  hasEmail: boolean;
  hasPhone: boolean;
  seasonVisitsSeen: number;
  seasonVisitsInTrough: number;
  /** Sorted days per product, for the reorder radar. Only products they bought. */
  productDays: { product: string; days: number[] }[];
};

/** The most frequent value, ties broken on the smaller, so a file is deterministic. */
function modeOf(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = fallback;
  let bestCount = -1;
  for (const [value, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function buildCustomers(
  bookings: readonly Booking[],
  asOfDay: number,
  season: Seasonality,
  p: ModelParams = PRODUCTION_PARAMS,
): CustomerFacts[] {
  const byCustomer = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = byCustomer.get(b.customerId);
    if (list) list.push(b);
    else byCustomer.set(b.customerId, [b]);
  }

  const out: CustomerFacts[] = [];
  for (const [id, rows] of byCustomer) {
    const ordered = [...rows].sort((a, b) => a.day - b.day);
    const visits = ordered.filter(attended);
    const completed = ordered.filter((b) => b.status === "completed");

    const gaps: number[] = [];
    for (let i = 1; i < completed.length; i++) {
      const gap = completed[i].day - completed[i - 1].day;
      if (gap > 0) gaps.push(gap);
    }
    const cadence = medianCont(gaps);

    const products = new Map<string, number[]>();
    for (const b of visits) {
      if (!b.product) continue;
      const days = products.get(b.product);
      if (days) days.push(b.day);
      else products.set(b.product, [b.day]);
    }

    let consent: boolean | null = null;
    for (const b of ordered) {
      if (b.consent === true) consent = true;
      else if (b.consent === false && consent === null) consent = false;
    }

    const lastWithTown = [...ordered].reverse().find((b) => b.town);
    const lastWithCountry = [...ordered].reverse().find((b) => b.country);

    const firstDay = visits.length > 0 ? visits[0].day : null;
    const lastDay = visits.length > 0 ? visits[visits.length - 1].day : null;

    out.push({
      id,
      visits: visits.length,
      cancelled: ordered.filter((b) => b.status === "cancelled").length,
      observedGaps: Math.max(0, visits.length - 1),
      firstDay,
      lastDay,
      daysSinceLast: lastDay === null ? null : asOfDay - lastDay,
      visitCadenceDays: cadence === null ? null : roundTo(cadence, 1),
      daysToSecondVisit: visits.length >= 2 ? visits[1].day - visits[0].day : null,
      orders: ordered.filter((b) => b.amountCents !== null).length,
      lifetimeValueCents: ordered.reduce((sum, b) => sum + (b.amountCents ?? 0), 0),
      modalPartySize: modeOf(visits.map((b) => b.party), 1),
      modalWeekday: visits.length === 0 ? null : modeOf(visits.map((b) => isoDow(b.day)), 1),
      modalHour:
        visits.some((b) => b.hour !== null)
          ? modeOf(visits.filter((b) => b.hour !== null).map((b) => b.hour as number), 0)
          : null,
      town: lastWithTown?.town ?? null,
      country: lastWithCountry?.country ?? null,
      // An export usually repeats the current balance on every row, so the
      // largest value is the balance and an older smaller one is not evidence
      // that they spent it.
      creditsRemaining: ordered.reduce((max, b) => Math.max(max, b.creditsRemaining), 0),
      consent,
      hasEmail: ordered.some((b) => b.hasEmail),
      hasPhone: ordered.some((b) => b.hasPhone),
      seasonVisitsSeen: visits.length,
      seasonVisitsInTrough: visits.filter(
        (b) => monthIndexFor(season, monthOfYear(b.day)) < p.dormantMonthIndex,
      ).length,
      productDays: [...products.entries()]
        .map(([product, days]) => ({ product, days: [...days].sort((a, b) => a - b) }))
        .sort((a, b) => a.product.localeCompare(b.product)),
    });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Whether their usual slot kept selling out after they stopped coming.
 *
 * Somebody shut out of the only time that suits them has not churned, and the
 * fix is the timetable rather than a discount. Three visits before this can
 * fire, because the claim is that a habit was taken away and somebody who came
 * twice had no habit to take: without that floor the flag lands on one-off
 * visitors whose chosen evening happens to be the busy one, which is a
 * coincidence dressed up as a cause.
 *
 * **What this cannot see**: a slot nobody booked. An export contains bookings,
 * so an empty Saturday is not in the file at all, and the share below is the
 * share of the slots that had at least one booking. The page says so.
 */
export function squeezeOf(
  occupancy: OccupancyIndex,
  customer: CustomerFacts,
  asOfDay: number,
  p: ModelParams = PRODUCTION_PARAMS,
): { slotsSince: number; slotsFull: number; squeezed: boolean } {
  if (customer.modalHour === null || customer.modalWeekday === null || customer.lastDay === null) {
    return { slotsSince: 0, slotsFull: 0, squeezed: false };
  }
  let slotsSince = 0;
  let slotsFull = 0;
  for (const cell of occupancy.values()) {
    if (cell.hour !== customer.modalHour) continue;
    if (cell.day <= customer.lastDay || cell.day > asOfDay) continue;
    if (isoDow(cell.day) !== customer.modalWeekday) continue;
    slotsSince++;
    if (cell.capacity !== null && cell.booked >= cell.capacity) slotsFull++;
  }
  const squeezed =
    customer.visits >= p.squeezeMinVisits &&
    slotsSince >= p.squeezeMinSlots &&
    slotsSince > 0 &&
    slotsFull / slotsSince >= p.squeezeFullRatio;
  return { slotsSince, slotsFull, squeezed };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/customers.test.ts`
Expected: PASS.

What this proves: a no-show is a visit and not a rhythm, a double booking does not halve a cadence, the cadence is rounded the way `numeric(6,1)` rounds, silence is measured to the as-of date, and the squeeze needs three visits and four slots before it will say anything. What it cannot see: whether Postgres agrees, which is Task 12, and whether `mode()` would have broken a tie the same way, which it is not required to and which the fixture avoids on purpose.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/customers.ts lib/tools/second-visit/customers.test.ts content/tools/second-visit.ts
git commit -m "feat(second-visit): the four inputs 0300 takes from customer_metrics, reproduced from 0070"
```

---

### Task 9: The honest answer to "how many come back"

**Files:**
- Create: `lib/tools/second-visit/km.ts`
- Test: `lib/tools/second-visit/km.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Z_95`, `kaplanMeier`, `survivalAt`, `returnedBy`, `medianTimeToReturn`, `naiveReturnRate`, `type Observation`, `type KmCurve`, `type Interval`

This is the headline of the tool and the one number a visitor came for. The arithmetic is in the plan's own section above, worked out by hand, and the tests below assert the exact fractions from it so a failure names which step of the product went wrong rather than saying a float is a bit off.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/km.test.ts
import { describe, expect, it } from "vitest";
import {
  Z_95,
  kaplanMeier,
  medianTimeToReturn,
  naiveReturnRate,
  returnedBy,
  survivalAt,
} from "./km";
import type { Observation } from "./km";

/**
 * The worked example from the plan, eight customers.
 *
 *   returned at 5, 5, 12, 30
 *   still out at 3, 8, 20, 40
 *
 *   day 5:  7 at risk, 2 events, S = 5/7
 *   day 12: 4 at risk, 1 event,  S = 15/28
 *   day 30: 2 at risk, 1 event,  S = 15/56
 *
 * Every number below is that arithmetic, written out, so a failure says which
 * step is wrong rather than that a float moved.
 */
const eight: Observation[] = [
  { days: 5, returned: true },
  { days: 5, returned: true },
  { days: 12, returned: true },
  { days: 30, returned: true },
  { days: 3, returned: false },
  { days: 8, returned: false },
  { days: 20, returned: false },
  { days: 40, returned: false },
];

describe("the curve", () => {
  const curve = kaplanMeier(eight);

  it("has one point per day something happened, and no others", () => {
    expect(curve.points.map((p) => p.day)).toEqual([5, 12, 30]);
  });

  it("counts everybody still out at a day as at risk on it", () => {
    expect(curve.points.map((p) => p.atRisk)).toEqual([7, 4, 2]);
    expect(curve.points.map((p) => p.events)).toEqual([2, 1, 1]);
  });

  it("multiplies the survival down step by step", () => {
    expect(curve.points[0].survival).toBeCloseTo(5 / 7, 15);
    expect(curve.points[1].survival).toBeCloseTo(15 / 28, 15);
    expect(curve.points[2].survival).toBeCloseTo(15 / 56, 15);
  });

  it("knows how many of each kind it had", () => {
    expect(curve.n).toBe(8);
    expect(curve.events).toBe(4);
    expect(curve.censored).toBe(4);
    expect(curve.maxObserved).toBe(40);
  });

  /**
   * A censored observation on the same day as an event is at risk for that
   * event and leaves afterwards. Getting this backwards moves every step of
   * the curve.
   */
  it("counts a censoring on an event day as at risk", () => {
    const tied = kaplanMeier([
      { days: 10, returned: true },
      { days: 10, returned: false },
      { days: 20, returned: true },
    ]);
    expect(tied.points[0].atRisk).toBe(3);
    expect(tied.points[0].survival).toBeCloseTo(2 / 3, 15);
    expect(tied.points[1].atRisk).toBe(1);
  });
});

describe("the answer somebody came for", () => {
  const curve = kaplanMeier(eight);

  it("says 73%, not 50%", () => {
    const answer = returnedBy(curve, 40);
    // 12 places, not 15: `1 - 15/56` and `41/56` are the same number to within
    // one bit of double precision, and pinning the last bit tests the floating
    // point unit rather than the model.
    expect(answer.estimate).toBeCloseTo(41 / 56, 12);
    expect(naiveReturnRate(eight)).toBe(0.5);
  });

  it("steps at the event days and not between them", () => {
    expect(returnedBy(curve, 4).estimate).toBe(0);
    expect(returnedBy(curve, 5).estimate).toBeCloseTo(2 / 7, 15);
    expect(returnedBy(curve, 11).estimate).toBeCloseTo(2 / 7, 15);
    expect(returnedBy(curve, 12).estimate).toBeCloseTo(13 / 28, 15);
  });

  it("prints an interval that stays inside nought and one", () => {
    // The plan's hand-worked figures: sigma^2 = 0.6404761905, and the
    // complementary log-log interval on S(30) is about [0.0131, 0.6700]. The
    // return fraction is one minus that, with the bounds swapped.
    const answer = returnedBy(curve, 30);
    expect(answer.defined).toBe(true);
    expect(answer.lo).toBeCloseTo(1 - 0.670013, 3);
    expect(answer.hi).toBeCloseTo(1 - 0.013124, 3);
    expect(answer.lo).toBeGreaterThan(0);
    expect(answer.hi).toBeLessThan(1);
    expect(answer.lo).toBeLessThan(answer.estimate);
    expect(answer.hi).toBeGreaterThan(answer.estimate);
  });

  it("carries Greenwood's sum on each point", () => {
    const curveAt = kaplanMeier(eight);
    expect(curveAt.points[2].cumVariance).toBeCloseTo(2 / 35 + 1 / 12 + 1 / 2, 12);
  });

  it("narrows as the sample grows, which is the whole point of printing it", () => {
    const wide = returnedBy(kaplanMeier(eight), 30);
    const many: Observation[] = [];
    for (let i = 0; i < 50; i++) many.push(...eight);
    const narrow = returnedBy(kaplanMeier(many), 30);
    expect(narrow.estimate).toBeCloseTo(wide.estimate, 12);
    expect(narrow.hi - narrow.lo).toBeLessThan((wide.hi - wide.lo) / 3);
  });

  it("refuses to print an interval when nothing has happened yet", () => {
    const nothing = kaplanMeier([
      { days: 10, returned: false },
      { days: 20, returned: false },
    ]);
    const answer = returnedBy(nothing, 20);
    expect(answer.estimate).toBe(0);
    expect(answer.defined).toBe(false);
  });

  it("gives a degenerate answer on no customers rather than a NaN", () => {
    const empty = kaplanMeier([]);
    expect(empty.n).toBe(0);
    expect(returnedBy(empty, 30)).toEqual({ estimate: 0, lo: 0, hi: 0, defined: false });
  });

  it("uses the two-sided 95% z", () => {
    expect(Z_95).toBeCloseTo(1.959963984540054, 15);
  });
});

describe("the median that often does not exist", () => {
  it("is the first day survival reaches a half", () => {
    const curve = kaplanMeier(eight);
    // S drops to 15/28 = 0.536 at day 12 and to 15/56 = 0.268 at day 30, so the
    // first day at or below a half is 30.
    expect(medianTimeToReturn(curve)).toBe(30);
  });

  it("is null when the curve never gets there, rather than extrapolated", () => {
    const shy = kaplanMeier([
      { days: 10, returned: true },
      { days: 20, returned: false },
      { days: 30, returned: false },
      { days: 40, returned: false },
    ]);
    // One event out of four at risk: S = 0.75 and it never falls further.
    expect(medianTimeToReturn(shy)).toBeNull();
  });
});

describe("survivalAt, which is the same thing the other way up", () => {
  it("is one before anything has happened", () => {
    const curve = kaplanMeier(eight);
    expect(survivalAt(curve, 0).estimate).toBe(1);
    expect(survivalAt(curve, 4).estimate).toBe(1);
  });

  it("mirrors returnedBy exactly", () => {
    const curve = kaplanMeier(eight);
    const s = survivalAt(curve, 30);
    const r = returnedBy(curve, 30);
    expect(r.estimate).toBeCloseTo(1 - s.estimate, 15);
    expect(r.lo).toBeCloseTo(1 - s.hi, 15);
    expect(r.hi).toBeCloseTo(1 - s.lo, 15);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/km.test.ts`
Expected: FAIL with `Cannot find module './km'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/km.ts

/**
 * How many first-time customers come back, computed the way a survival analyst
 * would rather than the way a dashboard does.
 *
 * The dashboard figure is `customers with one visit / all customers`, and it is
 * wrong in a specific direction: it counts somebody who first came last week as
 * somebody who never returned. On a growing business the recent arrivals
 * dominate, so the faster you grow the worse your retention looks. Kaplan-Meier
 * fixes exactly that by letting those customers contribute what is known about
 * them ("at least this long, still counting") instead of a verdict nobody has
 * earned yet.
 *
 * The interval is the complementary log-log one (Kalbfleisch-Prentice) over
 * Greenwood's variance, rather than a normal interval on the proportion. A
 * normal interval near 0 or 1 runs outside the range and then gets clipped, and
 * a clipped bound reads as certainty where the truth was "we do not know".
 *
 * Nothing here is a forecast. It is a description of what the file already
 * contains, with the uncertainty that description carries printed beside it.
 */

/** Two-sided 95%. */
export const Z_95 = 1.959963984540054;

export type Observation = {
  /** Days from the first visit: to the second one, or to the as-of date. */
  days: number;
  /** True if the second visit happened. False means still out, still counting. */
  returned: boolean;
};

export type KmPoint = {
  day: number;
  atRisk: number;
  events: number;
  /** S(day), after this day's events. */
  survival: number;
  /** Greenwood's running sum of d / (n * (n - d)) up to and including this day. */
  cumVariance: number;
};

export type KmCurve = {
  points: KmPoint[];
  n: number;
  events: number;
  censored: number;
  /** The longest observation, censored or not. Nothing past it means anything. */
  maxObserved: number;
  z: number;
};

export type Interval = {
  estimate: number;
  lo: number;
  hi: number;
  /**
   * False when there is no interval to give: no customers, or nothing has
   * happened yet in this window, where the log-log transform is undefined. The
   * page prints a sentence rather than a pair of numbers.
   */
  defined: boolean;
};

export function kaplanMeier(observations: readonly Observation[], z: number = Z_95): KmCurve {
  const usable = observations.filter((o) => Number.isFinite(o.days) && o.days >= 0);
  const n = usable.length;
  if (n === 0) return { points: [], n: 0, events: 0, censored: 0, maxObserved: 0, z };

  const sorted = [...usable].sort((a, b) => a.days - b.days);
  const eventDays = [...new Set(sorted.filter((o) => o.returned).map((o) => o.days))].sort(
    (a, b) => a - b,
  );

  const points: KmPoint[] = [];
  let survival = 1;
  let cumVariance = 0;
  for (const day of eventDays) {
    // Everybody whose observation runs to at least this day is at risk on it,
    // which includes somebody censored on exactly this day.
    const atRisk = sorted.filter((o) => o.days >= day).length;
    const events = sorted.filter((o) => o.returned && o.days === day).length;
    if (atRisk === 0) continue;
    survival *= 1 - events / atRisk;
    if (atRisk - events > 0) cumVariance += events / (atRisk * (atRisk - events));
    else cumVariance = Number.POSITIVE_INFINITY;
    points.push({ day, atRisk, events, survival, cumVariance });
  }

  return {
    points,
    n,
    events: sorted.filter((o) => o.returned).length,
    censored: sorted.filter((o) => !o.returned).length,
    maxObserved: sorted[sorted.length - 1].days,
    z,
  };
}

function stepAt(curve: KmCurve, day: number): { survival: number; cumVariance: number } {
  let survival = 1;
  let cumVariance = 0;
  for (const point of curve.points) {
    if (point.day > day) break;
    survival = point.survival;
    cumVariance = point.cumVariance;
  }
  return { survival, cumVariance };
}

/**
 * S(t) with its interval.
 *
 * The transform: the interval is computed on `ln(-ln S)`, where it is roughly
 * symmetric, then exponentiated twice to come back. That is what keeps both
 * ends inside [0, 1] without clipping either.
 */
export function survivalAt(curve: KmCurve, day: number): Interval {
  if (curve.n === 0) return { estimate: 0, lo: 0, hi: 0, defined: false };
  const { survival, cumVariance } = stepAt(curve, day);
  if (survival >= 1 || survival <= 0 || !Number.isFinite(cumVariance) || cumVariance <= 0) {
    return { estimate: survival, lo: survival, hi: survival, defined: false };
  }
  const logS = Math.log(survival);
  const sigma = Math.sqrt(cumVariance);
  const halfWidth = (curve.z * sigma) / Math.abs(logS);
  const centre = Math.log(-logS);
  const lower = Math.exp(-Math.exp(centre + halfWidth));
  const upper = Math.exp(-Math.exp(centre - halfWidth));
  return { estimate: survival, lo: lower, hi: upper, defined: true };
}

/** The share who have come back by day `day`, which is one minus the survival. */
export function returnedBy(curve: KmCurve, day: number): Interval {
  const s = survivalAt(curve, day);
  return { estimate: 1 - s.estimate, lo: 1 - s.hi, hi: 1 - s.lo, defined: s.defined };
}

/**
 * The first day by which half of them have come back, or null.
 *
 * Null is the common answer and it is a real one: if the curve never falls to a
 * half inside the file, the median has not been reached and any number printed
 * for it would be an extrapolation.
 */
export function medianTimeToReturn(curve: KmCurve): number | null {
  for (const point of curve.points) {
    if (point.survival <= 0.5) return point.day;
  }
  return null;
}

/**
 * The figure a dashboard shows, computed so the page can print it beside the
 * real one. Kept here rather than in the page so the comparison is a property
 * of the same input.
 */
export function naiveReturnRate(observations: readonly Observation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((o) => o.returned).length / observations.length;
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/km.test.ts`
Expected: PASS.

If the interval assertions fail while the survival steps pass, the product is right and the transform is wrong: check whether the interval is being computed on `S` directly rather than on `ln(-ln S)`, which is the usual mistake and produces bounds outside [0, 1] on a small sample.

What this proves: the curve steps where events are, a censoring on an event day counts as at risk, the interval stays inside the range and narrows with the sample, and the median is null rather than invented when the curve never reaches a half. What it cannot see: whether the censoring assumption holds on real data. Kaplan-Meier assumes that being censored says nothing about whether you would have returned, and a customer who first came yesterday is censored for a reason that has nothing to do with their loyalty, so on this data the assumption is about as safe as it gets. That sentence is on the page and it is an argument, not a measurement.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/km.ts lib/tools/second-visit/km.test.ts
git commit -m "feat(second-visit): kaplan-meier with right-censoring, and the interval printed rather than clipped"
```

---

### Task 10: The pipeline, in one pure function

**Files:**
- Create: `lib/tools/second-visit/analyse.ts`
- Test: `lib/tools/second-visit/analyse.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3, 4, 7, 8 and 9
- Produces: `MIN_CUSTOMERS`, `HORIZONS`, `analyse`, `type AnalyseInput`, `type Analysis`, `type CustomerRow`, `type Cohort`

One function, no I/O, output made only of arrays, plain objects, numbers, strings and booleans, because an `Analysis` crosses a Web Worker boundary by structured clone and then goes into a saved report through `JSON.stringify`. No `Map`, no `Date`, no class instance.

This is the re-expression of 0300's `base` / `cohort` / `modelled` / `scored` / `ratioed` CTEs. **Write it from the migration, and if Task 11's SQL is already written, do not read it while writing this.** The point of having two independent expressions of the same thing is lost the moment one is copied from the other.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/analyse.test.ts
import { describe, expect, it } from "vitest";
import { HORIZONS, MIN_CUSTOMERS, analyse } from "./analyse";
import { PRODUCTION_PARAMS } from "./model";
import { dayFromIso } from "./numbers";
import type { Booking } from "./types";

const day = (iso: string) => dayFromIso(iso) as number;

const b = (over: Partial<Booking> & { customerId: string; day: number }): Booking => ({
  hour: null,
  capacity: null,
  status: "completed",
  amountCents: 4500,
  town: null,
  country: null,
  product: null,
  party: 1,
  creditsRemaining: 0,
  consent: null,
  hasEmail: false,
  hasPhone: false,
  ...over,
});

/** Thirty customers so the headline is not refused, plus whoever the test adds. */
function crowd(): Booking[] {
  const rows: Booking[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push(b({ customerId: `bulk${i}`, day: day("2026-01-05") + i }));
    if (i % 2 === 0) rows.push(b({ customerId: `bulk${i}`, day: day("2026-02-05") + i }));
    if (i % 4 === 0) rows.push(b({ customerId: `bulk${i}`, day: day("2026-03-08") + i }));
  }
  return rows;
}

describe("what it decides for itself", () => {
  it("takes the as-of date from the newest booking in the file", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.asOfDay).toBe(Math.max(...crowd().map((r) => r.day)));
    expect(out.asOfIso).toBe(out.asOfIso.slice(0, 10));
  });

  it("takes an as-of date it is given instead", () => {
    const out = analyse({ bookings: crowd(), asOfDay: day("2026-12-31"), venueTown: null });
    expect(out.asOfDay).toBe(day("2026-12-31"));
  });

  it("knows whether it is running the production constants", () => {
    const plain = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(plain.usingProductionParams).toBe(true);
    const moved = analyse({
      bookings: crowd(),
      asOfDay: null,
      venueTown: null,
      params: { ...PRODUCTION_PARAMS, shrinkK: 5 },
    });
    expect(moved.usingProductionParams).toBe(false);
  });
});

describe("the season factor, and why it is off", () => {
  it("is off under twelve months and says so in a warning", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.season.enabled).toBe(false);
    expect(out.rows.every((r) => r.seasonFactor === 1)).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/twelve months/i);
  });

  it("is on once the file covers twelve calendar months", () => {
    const rows: Booking[] = [];
    for (let m = 0; m < 12; m++) {
      const month = String(m + 1).padStart(2, "0");
      for (let i = 0; i < 4; i++) rows.push(b({ customerId: `c${m}-${i}`, day: day(`2026-${month}-10`) }));
    }
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.season.enabled).toBe(true);
    expect(out.season.months).toHaveLength(12);
  });
});

describe("the cohort baselines", () => {
  it("falls back to thirty and forty-five days when nothing can be measured", () => {
    // Every customer here has one visit, so there is no cadence and no second
    // visit anywhere in the file.
    const rows = Array.from({ length: 25 }, (_, i) => b({ customerId: `c${i}`, day: day("2026-01-05") + i }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.cohort.cadenceDays).toBe(30);
    expect(out.cohort.firstRepeatDays).toBe(45);
  });

  it("judges a first-timer against the first-repeat baseline, not the steady-state one", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const firstTimer = out.rows.find((r) => r.visits === 1);
    expect(firstTimer?.baseGapDays).toBeCloseTo(out.cohort.firstRepeatDays, 6);
  });
});

describe("distance, when there is a venue and a town", () => {
  const withTowns = () => [
    ...crowd(),
    b({ customerId: "near", day: day("2026-01-10"), town: "Longford" }),
    b({ customerId: "far", day: day("2026-01-10"), town: "Dublin" }),
    b({ customerId: "nowhere", day: day("2026-01-10"), town: "Zzzzz" }),
    b({ customerId: "abroad", day: day("2026-01-10"), town: "Belfast" }),
  ];

  it("bands a customer against the venue's town", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    const band = (id: string) => out.rows.find((r) => r.id === id)?.distanceBand;
    expect(band("near")).toBe("local");
    expect(band("far")).toBe("distant");
    expect(band("nowhere")).toBe("unknown");
  });

  it("calls a customer in another country a visitor, whatever the mileage", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    // Belfast is in the table as GB, Longford as IE, so the border decides.
    expect(out.rows.find((r) => r.id === "abroad")?.distanceBand).toBe("visitor");
  });

  it("charges nothing for a town it could not match", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    expect(out.rows.find((r) => r.id === "nowhere")?.distanceFactor).toBe(1);
    expect(out.counts.townUnmatched).toBeGreaterThan(0);
  });

  it("bands everybody unknown when no venue is chosen, and warns", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: null });
    expect(out.rows.every((r) => r.distanceBand === "unknown")).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/no town/i);
  });
});

describe("the verdict, and the one it replaces", () => {
  it("carries both, so the difference can be listed rather than asserted", () => {
    const rows = [
      ...crowd(),
      // Three visits a fortnight apart, then silence for a year.
      b({ customerId: "gone", day: day("2025-01-06") }),
      b({ customerId: "gone", day: day("2025-01-20") }),
      b({ customerId: "gone", day: day("2025-02-03") }),
    ];
    const out = analyse({ bookings: rows, asOfDay: day("2026-03-08"), venueTown: null });
    const gone = out.rows.find((r) => r.id === "gone");
    expect(gone?.lifecycle).toBe("lapsed");
    expect(gone?.lifecycleNaive).toBe("lapsed");
    expect(gone?.silenceRatio).toBeGreaterThan(2);
  });

  it("calls a prepaid absentee committed_idle rather than lapsed", () => {
    const rows = [
      ...crowd(),
      b({ customerId: "paid", day: day("2025-01-06"), creditsRemaining: 5 }),
      b({ customerId: "paid", day: day("2025-01-20"), creditsRemaining: 5 }),
      b({ customerId: "paid", day: day("2025-02-03"), creditsRemaining: 5 }),
    ];
    const out = analyse({ bookings: rows, asOfDay: day("2026-03-08"), venueTown: null });
    expect(out.rows.find((r) => r.id === "paid")?.lifecycle).toBe("committed_idle");
  });

  it("counts the verdicts, every kind that occurred", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const total = out.verdicts.reduce((sum, v) => sum + v.count, 0);
    expect(total).toBe(out.rows.length);
  });
});

describe("the headline", () => {
  it("is refused under twenty customers, by name", () => {
    const rows = Array.from({ length: 5 }, (_, i) => b({ customerId: `c${i}`, day: day("2026-01-05") }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(MIN_CUSTOMERS).toBe(20);
    expect(out.secondVisit.enough).toBe(false);
    // Everything else still computed, so the table is there to look at.
    expect(out.rows).toHaveLength(5);
  });

  it("prints the naive figure beside the modelled one", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.secondVisit.enough).toBe(true);
    expect(out.secondVisit.naive).toBeGreaterThan(0);
    expect(out.secondVisit.naive).toBeLessThan(1);
    const at90 = out.secondVisit.horizons.find((h) => h.day === 90);
    expect(at90?.estimate).toBeGreaterThanOrEqual(out.secondVisit.naive);
  });

  it("offers the four horizons and marks the ones the file cannot reach", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.secondVisit.horizons.map((h) => h.day)).toEqual([...HORIZONS]);
    expect(out.secondVisit.horizons.find((h) => h.day === 365)?.beyondFile).toBe(true);
  });
});

describe("money, and the assumption it rests on", () => {
  it("takes the order value as the margin and says so", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const row = out.rows.find((r) => r.orders > 0);
    expect(row?.expectedMarginCents).toBe(4500);
    expect(out.warnings.join(" ")).toMatch(/costs/i);
  });

  it("assumes it may contact people when the file says nothing about consent", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.assumedConsent).toBe(true);
    expect(out.rows.every((r) => r.reachability === 1)).toBe(true);
  });

  it("uses the real reachability once the file carries consent", () => {
    const rows = crowd().map((r, i) => ({ ...r, consent: i % 2 === 0, hasEmail: true }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.assumedConsent).toBe(false);
    expect(out.rows.some((r) => r.reachability === 0)).toBe(true);
    expect(out.rows.some((r) => r.reachability === 0.6)).toBe(true);
  });

  it("cannot rank somebody it cannot contact above zero", () => {
    const rows = crowd().map((r) => ({ ...r, consent: false, hasEmail: true }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.rows.every((r) => r.winnabilityCents === 0)).toBe(true);
  });
});

describe("the output crosses a worker and a JSON round trip unchanged", () => {
  it("holds nothing but plain data", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const round = JSON.parse(JSON.stringify(out));
    expect(round).toEqual(out);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/second-visit/analyse.test.ts`
Expected: FAIL with `Cannot find module './analyse'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/second-visit/analyse.ts
import {
  buildCustomers,
  buildOccupancy,
  buildSeasonality,
  monthIndexFor,
  squeezeOf,
  type CustomerFacts,
  type Seasonality,
} from "./customers";
import { Z_95, kaplanMeier, medianTimeToReturn, naiveReturnRate, returnedBy, type Observation } from "./km";
import {
  PRODUCTION_PARAMS,
  blendPrior,
  distanceBand,
  distanceKm,
  distancePriorFactor,
  expectedGapDays,
  pReturnPrior,
  reachability,
  retentionVerdict,
  seasonFactor,
  shrink,
  smoothRate,
  winnabilityCents,
} from "./model";
import { isoDow, isoFromDay, medianCont, monthOfYear, percentileCont, roundTo, widthBucket } from "./numbers";
import { findTown, type Town } from "./towns";
import type { Band, Booking, Lifecycle, ModelParams } from "./types";

/**
 * The whole model, in one pure function.
 *
 * This is migration 0300's `base` / `cohort` / `modelled` / `scored` /
 * `ratioed` chain re-expressed over a flat file, with the four inputs it takes
 * from `analytics.customer_metrics` supplied by `customers.ts`. It is checked
 * against Postgres by `oracle.test.ts` over a committed fixture, and that test
 * is the only reason to believe the numbers coming out of here.
 *
 * Nothing in the return value is a Map, a Date or a class instance, because it
 * crosses a Web Worker boundary and then a `JSON.stringify`.
 */

/** Below this there is nothing a survival curve could honestly say. */
export const MIN_CUSTOMERS = 20;

/** The horizons the headline offers. Anything past the file is marked. */
export const HORIZONS = [30, 90, 180, 365] as const;

/** The overdue buckets `analytics.reactivation_rates` uses. */
const OVERDUE_BOUNDS = [30, 60, 120, 240];

export type Cohort = { cadenceDays: number; firstRepeatDays: number; averageOrderCents: number };

export type CustomerRow = {
  id: string;
  visits: number;
  cancelled: number;
  observedGaps: number;
  firstIso: string | null;
  lastIso: string | null;
  daysSinceLast: number | null;
  visitCadenceDays: number | null;
  daysToSecondVisit: number | null;
  orders: number;
  lifetimeValueCents: number;
  town: string | null;
  distanceKm: number | null;
  distanceBand: Band;
  modalPartySize: number;
  baseGapDays: number | null;
  distanceFactor: number;
  seasonFactor: number;
  companionFactor: number;
  expectedGapDays: number;
  silenceRatio: number | null;
  committed: boolean;
  slotSqueezed: boolean;
  seasonalDormant: boolean;
  lowEvidenceFar: boolean;
  habitualSlotsSince: number;
  habitualSlotsFull: number;
  lifecycle: Lifecycle;
  lifecycleNaive: Lifecycle;
  expectedMarginCents: number;
  reachability: number;
  pReturn: number | null;
  pReturnObservations: number;
  winnabilityCents: number;
};

export type AnalyseInput = {
  bookings: readonly Booking[];
  /** Null takes the newest attended booking in the file. */
  asOfDay: number | null;
  /** The town the business is in. Null means no distance bands at all. */
  venueTown: string | null;
  params?: ModelParams;
};

export type Analysis = {
  asOfDay: number;
  asOfIso: string;
  venue: { name: string; county: string; country: string; lat: number; lng: number } | null;
  params: ModelParams;
  usingProductionParams: boolean;
  assumedConsent: boolean;
  counts: {
    bookings: number;
    attended: number;
    cancelled: number;
    customers: number;
    townMatched: number;
    townUnmatched: number;
  };
  span: { firstIso: string | null; lastIso: string | null; months: number };
  season: { enabled: boolean; months: { month: number; visits: number; index: number }[] };
  cohort: Cohort;
  rows: CustomerRow[];
  verdicts: { lifecycle: Lifecycle; count: number }[];
  bands: { band: Band; customers: number; medianExpectedGapDays: number | null }[];
  secondVisit: {
    enough: boolean;
    n: number;
    events: number;
    censored: number;
    naive: number;
    medianDays: number | null;
    curve: { day: number; returned: number }[];
    horizons: { day: number; estimate: number; lo: number; hi: number; defined: boolean; beyondFile: boolean }[];
  };
  slots: { weekday: number; hour: number; slots: number; visits: number; full: number }[];
  products: { product: string; customers: number; medianGapDays: number | null; overdue: number }[];
  warnings: string[];
};

const attended = (b: Booking) => b.status === "completed" || b.status === "no_show";

function visitsBucket(visits: number): string {
  if (visits <= 1) return "1";
  if (visits <= 3) return "2-3";
  if (visits <= 9) return "4-9";
  return "10+";
}

/**
 * Every silence this file contains, closed or still running.
 *
 * One row per gap between consecutive visits, which ended in a visit, plus one
 * trailing row per customer for the silence still counting. Counting only the
 * gaps that closed would measure the survivors and conclude that everybody
 * comes back, which is the same mistake the naive one-and-done figure makes at
 * the other end of the tool.
 */
function reactivationRates(
  facts: readonly CustomerFacts[],
  bandOf: (c: CustomerFacts) => Band,
  asOfDay: number,
  bookings: readonly Booking[],
): Map<string, { observations: number; returns: number }> {
  const byCustomer = new Map<string, number[]>();
  for (const b of bookings) {
    if (!attended(b)) continue;
    const days = byCustomer.get(b.customerId);
    if (days) days.push(b.day);
    else byCustomer.set(b.customerId, [b.day]);
  }

  const table = new Map<string, { observations: number; returns: number }>();
  const add = (key: string, returned: boolean) => {
    const cell = table.get(key) ?? { observations: 0, returns: 0 };
    cell.observations += 1;
    if (returned) cell.returns += 1;
    table.set(key, cell);
  };

  for (const customer of facts) {
    const days = (byCustomer.get(customer.id) ?? []).sort((a, b) => a - b);
    if (days.length === 0) continue;
    const band = bandOf(customer);
    const bucket = visitsBucket(customer.visits);
    for (let i = 1; i < days.length; i++) {
      add(`${band}|${bucket}|${widthBucket(days[i] - days[i - 1], OVERDUE_BOUNDS)}`, true);
    }
    add(`${band}|${bucket}|${widthBucket(asOfDay - days[days.length - 1], OVERDUE_BOUNDS)}`, false);
  }
  return table;
}

/** 0070's rule, verbatim, so the difference between the two verdicts is listable. */
function naiveLifecycle(customer: CustomerFacts): Lifecycle {
  if (customer.visits === 0) return "prospect";
  if (customer.visits === 1) return "first_time";
  if (customer.daysSinceLast === null) return "prospect";
  const cadence = customer.visitCadenceDays;
  if (customer.daysSinceLast > (cadence === null ? 90 : cadence * 4)) return "lapsed";
  if (customer.daysSinceLast > (cadence === null ? 45 : cadence * 2)) return "at_risk";
  if (customer.visits >= 10) return "loyal";
  return "repeat";
}

function sameParams(a: ModelParams, b: ModelParams): boolean {
  return (Object.keys(b) as (keyof ModelParams)[]).every((key) => a[key] === b[key]);
}

export function analyse(input: AnalyseInput): Analysis {
  const params = input.params ?? PRODUCTION_PARAMS;
  const bookings = input.bookings;
  const warnings: string[] = [];

  const attendedRows = bookings.filter(attended);
  const asOfDay =
    input.asOfDay ??
    (attendedRows.length > 0 ? Math.max(...attendedRows.map((r) => r.day)) : 0);

  const venueTown: Town | null = findTown(input.venueTown);
  if (input.venueTown && !venueTown) {
    warnings.push(`No town matched "${input.venueTown}", so nobody has a distance band.`);
  }
  if (!input.venueTown) {
    warnings.push("No town chosen for the business, so nobody has a distance band and everybody is judged on behaviour alone.");
  }

  const season: Seasonality = buildSeasonality(bookings);
  // Said in words as well as carried as a field, because a switched-off factor
  // that nobody mentions reads as a factor of one that was measured.
  if (!season.enoughHistory) {
    warnings.push("This file covers fewer than twelve months, so the season factor is switched off. One winter is no evidence at all about your summer.");
  }

  const facts = buildCustomers(bookings, asOfDay, season, params);
  const occupancy = buildOccupancy(bookings);

  const townOf = new Map<string, Town | null>();
  let townMatched = 0;
  let townUnmatched = 0;
  for (const customer of facts) {
    const town = customer.town ? findTown(customer.town) : null;
    townOf.set(customer.id, town);
    if (customer.town) {
      if (town) townMatched++;
      else townUnmatched++;
    }
  }

  const bandOf = (customer: CustomerFacts): Band => {
    if (!venueTown) return "unknown";
    const town = townOf.get(customer.id) ?? null;
    const km = town ? distanceKm(town.lat, town.lng, venueTown.lat, venueTown.lng) : null;
    const country = customer.country ?? town?.country ?? null;
    const sameCountry = country === null ? null : country === venueTown.country;
    return distanceBand(km, sameCountry, params);
  };

  // The cohort baselines. Three numbers, the same for every customer.
  const cadences = facts.filter((c) => c.visits >= 3 && c.visitCadenceDays !== null).map((c) => c.visitCadenceDays as number);
  const firstRepeats = facts.filter((c) => c.daysToSecondVisit !== null).map((c) => c.daysToSecondVisit as number);
  const orderValues = facts.filter((c) => c.orders > 0).map((c) => c.lifetimeValueCents / c.orders);
  const cohort: Cohort = {
    cadenceDays: percentileCont(cadences, 0.5) ?? params.cohortDefaultCadenceDays,
    firstRepeatDays: percentileCont(firstRepeats, 0.5) ?? params.cohortDefaultFirstRepeatDays,
    averageOrderCents:
      orderValues.length === 0 ? 0 : orderValues.reduce((a, b) => a + b, 0) / orderValues.length,
  };

  const hasContactData = facts.some((c) => c.consent !== null || c.hasEmail || c.hasPhone);
  const assumedConsent = !hasContactData;
  if (assumedConsent) {
    warnings.push("Your file says nothing about marketing consent, so the ranking assumes you may contact everybody in it. The model in production refuses to guess and scores an unreachable customer at zero.");
  }
  warnings.push("Your file does not carry your costs, so the margin behind every winnability figure is the order value itself. Treat those numbers as an upper bound.");

  const monthIndexNow = season.enoughHistory ? monthIndexFor(season, monthOfYear(asOfDay)) : null;
  const rates = reactivationRates(facts, bandOf, asOfDay, bookings);

  const rows: CustomerRow[] = facts.map((customer) => {
    const band = bandOf(customer);
    const town = townOf.get(customer.id) ?? null;
    const km = venueTown && town ? distanceKm(town.lat, town.lng, venueTown.lat, venueTown.lng) : null;

    const baseGap =
      customer.visits <= 1
        ? cohort.firstRepeatDays
        : shrink(customer.visitCadenceDays, customer.observedGaps, cohort.cadenceDays, params);
    const distanceFactor = blendPrior(distancePriorFactor(band, params), customer.observedGaps, params);
    const season_ = seasonFactor(monthIndexNow, params);
    const companion = customer.modalPartySize >= params.companionPartyThreshold ? params.companionFactor : 1.0;
    const expected = expectedGapDays(baseGap, distanceFactor, season_, companion, params);
    const ratio =
      customer.daysSinceLast === null ? null : roundTo(customer.daysSinceLast / expected, 3);

    const squeeze = squeezeOf(occupancy, customer, asOfDay, params);
    const committed = customer.creditsRemaining > 0;
    const dormant =
      monthIndexNow !== null &&
      monthIndexNow < params.dormantMonthIndex &&
      customer.seasonVisitsSeen >= params.dormantMinVisits &&
      customer.seasonVisitsInTrough / customer.seasonVisitsSeen < params.dormantTroughRatio;
    const lowEvidenceFar =
      (band === "distant" && customer.visits <= params.farDistantVisits) ||
      (band === "visitor" && customer.visits <= params.farVisitorVisits);

    const aov = customer.orders > 0 ? customer.lifetimeValueCents / customer.orders : cohort.averageOrderCents;
    const margin = Math.max(0, roundTo(aov, 0));
    const reach = assumedConsent
      ? 1.0
      : reachability(customer.consent, customer.hasEmail, customer.hasPhone, false);
    const cell = rates.get(`${band}|${visitsBucket(customer.visits)}|${widthBucket(customer.daysSinceLast ?? 0, OVERDUE_BOUNDS)}`);
    const pReturn = smoothRate(
      cell?.returns ?? 0,
      cell?.observations ?? 0,
      pReturnPrior(band, customer.visits, params),
      params.smoothStrength,
    );

    return {
      id: customer.id,
      visits: customer.visits,
      cancelled: customer.cancelled,
      observedGaps: customer.observedGaps,
      firstIso: customer.firstDay === null ? null : isoFromDay(customer.firstDay),
      lastIso: customer.lastDay === null ? null : isoFromDay(customer.lastDay),
      daysSinceLast: customer.daysSinceLast,
      visitCadenceDays: customer.visitCadenceDays,
      daysToSecondVisit: customer.daysToSecondVisit,
      orders: customer.orders,
      lifetimeValueCents: customer.lifetimeValueCents,
      town: customer.town,
      distanceKm: km === null ? null : roundTo(km, 2),
      distanceBand: band,
      modalPartySize: customer.modalPartySize,
      baseGapDays: baseGap === null ? null : roundTo(baseGap, 1),
      distanceFactor: roundTo(distanceFactor, 3),
      seasonFactor: roundTo(season_, 3),
      companionFactor: roundTo(companion, 3),
      expectedGapDays: roundTo(expected, 1),
      silenceRatio: ratio,
      committed,
      slotSqueezed: squeeze.squeezed,
      seasonalDormant: dormant,
      lowEvidenceFar,
      habitualSlotsSince: squeeze.slotsSince,
      habitualSlotsFull: squeeze.slotsFull,
      lifecycle: retentionVerdict(customer.visits, ratio, committed, squeeze.squeezed, dormant, lowEvidenceFar, params),
      lifecycleNaive: naiveLifecycle(customer),
      expectedMarginCents: margin,
      reachability: reach,
      pReturn,
      pReturnObservations: cell?.observations ?? 0,
      winnabilityCents: winnabilityCents(pReturn, margin, reach),
    };
  });

  // The headline.
  const observations: Observation[] = facts
    .filter((c) => c.firstDay !== null)
    .map((c) =>
      c.daysToSecondVisit !== null
        ? { days: c.daysToSecondVisit, returned: true }
        : { days: Math.max(0, asOfDay - (c.firstDay as number)), returned: false },
    );
  const curve = kaplanMeier(observations, Z_95);
  const horizons = HORIZONS.map((day) => {
    const answer = returnedBy(curve, day);
    return {
      day,
      estimate: answer.estimate,
      lo: answer.lo,
      hi: answer.hi,
      defined: answer.defined,
      beyondFile: day > curve.maxObserved,
    };
  });

  // The slot grid, aggregated from the occupancy that exists.
  const grid = new Map<string, { weekday: number; hour: number; slots: number; visits: number; full: number }>();
  for (const cell of occupancy.values()) {
    const weekday = isoDow(cell.day);
    const key = `${weekday}:${cell.hour}`;
    const entry = grid.get(key) ?? { weekday, hour: cell.hour, slots: 0, visits: 0, full: 0 };
    entry.slots += 1;
    entry.visits += cell.booked;
    if (cell.capacity !== null && cell.booked >= cell.capacity) entry.full += 1;
    grid.set(key, entry);
  }

  // The reorder radar.
  const productGaps = new Map<string, { gaps: number[]; customers: Set<string>; overdue: number }>();
  for (const customer of facts) {
    for (const { product, days } of customer.productDays) {
      if (days.length < 2) continue;
      const entry = productGaps.get(product) ?? { gaps: [], customers: new Set<string>(), overdue: 0 };
      for (let i = 1; i < days.length; i++) {
        const gap = days[i] - days[i - 1];
        if (gap > 0) entry.gaps.push(gap);
      }
      entry.customers.add(customer.id);
      const own = medianCont(days.slice(1).map((d, i) => d - days[i]).filter((g) => g > 0));
      const since = asOfDay - days[days.length - 1];
      if (own !== null && since > own) entry.overdue += 1;
      productGaps.set(product, entry);
    }
  }

  const verdictCounts = new Map<Lifecycle, number>();
  for (const row of rows) verdictCounts.set(row.lifecycle, (verdictCounts.get(row.lifecycle) ?? 0) + 1);

  const bandCounts = new Map<Band, CustomerRow[]>();
  for (const row of rows) {
    const list = bandCounts.get(row.distanceBand);
    if (list) list.push(row);
    else bandCounts.set(row.distanceBand, [row]);
  }

  const days = attendedRows.map((r) => r.day);
  return {
    asOfDay,
    asOfIso: isoFromDay(asOfDay),
    venue: venueTown
      ? {
          name: venueTown.name,
          county: venueTown.county,
          country: venueTown.country,
          lat: venueTown.lat,
          lng: venueTown.lng,
        }
      : null,
    params,
    usingProductionParams: sameParams(params, PRODUCTION_PARAMS),
    assumedConsent,
    counts: {
      bookings: bookings.length,
      attended: attendedRows.length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      customers: facts.length,
      townMatched,
      townUnmatched,
    },
    span: {
      firstIso: days.length === 0 ? null : isoFromDay(Math.min(...days)),
      lastIso: days.length === 0 ? null : isoFromDay(Math.max(...days)),
      months: season.monthsSeen,
    },
    season: { enabled: season.enoughHistory, months: season.months },
    cohort,
    rows,
    verdicts: [...verdictCounts.entries()]
      .map(([lifecycle, count]) => ({ lifecycle, count }))
      .sort((a, b) => b.count - a.count || a.lifecycle.localeCompare(b.lifecycle)),
    bands: [...bandCounts.entries()]
      .map(([band, list]) => ({
        band,
        customers: list.length,
        medianExpectedGapDays: medianCont(list.map((r) => r.expectedGapDays)),
      }))
      .sort((a, b) => b.customers - a.customers || a.band.localeCompare(b.band)),
    secondVisit: {
      enough: facts.length >= MIN_CUSTOMERS,
      n: curve.n,
      events: curve.events,
      censored: curve.censored,
      naive: naiveReturnRate(observations),
      medianDays: medianTimeToReturn(curve),
      curve: curve.points.map((p) => ({ day: p.day, returned: 1 - p.survival })),
      horizons,
    },
    slots: [...grid.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    products: [...productGaps.entries()]
      .map(([product, entry]) => ({
        product,
        customers: entry.customers.size,
        medianGapDays: medianCont(entry.gaps),
        overdue: entry.overdue,
      }))
      .sort((a, b) => b.customers - a.customers || a.product.localeCompare(b.product)),
    warnings,
  };
}
```

Two names in there are easy to confuse and `tsc` catches both: `Seasonality` carries `enoughHistory`, and the `Analysis` output renames it to `season.enabled` for the page. There is no `enabled` field on `Seasonality`.

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/analyse.test.ts`
Expected: PASS.

What this proves: the pipeline computes both verdicts, bands against a real venue, refuses the headline under twenty customers without refusing the rest, marks a horizon the file cannot reach, assumes consent only when the file is silent about it, and survives a JSON round trip. What it cannot see: whether any of the arithmetic agrees with Postgres, which is the next two tasks and the only thing that makes the page's claim true.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/analyse.ts lib/tools/second-visit/analyse.test.ts
git commit -m "feat(second-visit): the pipeline, with both verdicts and a headline that refuses when it should"
```

---

### Task 11: The fixture, the SQL that judges the port, and the script that runs it

**Files:**
- Create: `lib/tools/second-visit/demo.ts` (+ `demo.test.ts`)
- Create: `scripts/second-visit/make-fixture.mjs`
- Create: `lib/tools/second-visit/oracle/pipeline.sql`
- Create: `scripts/second-visit/compare.mjs`
- Create (by running the two scripts): `oracle/bookings.csv`, `oracle/towns.csv`, `oracle/manifest.json`, `oracle/scalars.json`, `oracle/scalars.golden.json`, `oracle/pipeline.golden.json`
- Modify: `package.json` (two script lines)

**Interfaces:**
- Consumes: `oracle/0300-functions.sql` (Task 2), Docker, `analyse`'s input shape (Task 10)
- Produces: one seeded generator used by both the fixture and the page's demo, and two golden files that Postgres wrote

**Read this before starting: the pipeline SQL is written from migration 0300's CTEs, not from `analyse.ts`.** Two independent expressions of the same model are the entire value of this task. If the SQL is transcribed from the TypeScript, the oracle proves that a function agrees with itself, which is a ritual rather than a check.

- [ ] **Step 1: Write the generator and its test**

```ts
// lib/tools/second-visit/demo.test.ts
import { describe, expect, it } from "vitest";
import { DEMO_VENUE_TOWN, generate } from "./demo";
import { parseCsv } from "./csv";
import { emptyRoles, guessRoles, toBookings } from "./mapping";
import { buildCustomers, buildSeasonality } from "./customers";
import { dayFromIso } from "./numbers";
import { isoDow } from "./numbers";

const options = { seed: 1, customers: 40, months: 24, startIso: "2024-09-01", venueTown: DEMO_VENUE_TOWN };

describe("the generator", () => {
  it("is deterministic, byte for byte", () => {
    expect(generate(options).csv).toBe(generate(options).csv);
  });

  it("changes completely on a different seed", () => {
    expect(generate({ ...options, seed: 2 }).csv).not.toBe(generate(options).csv);
  });

  it("produces a file this tool can read back with no help", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const roles = guessRoles(sheet);
    expect(roles.customer).toBeGreaterThanOrEqual(0);
    expect(roles.date).toBeGreaterThanOrEqual(0);
    expect(roles.town).not.toBeNull();
    expect(roles.capacity).not.toBeNull();
    const out = toBookings(sheet, roles);
    expect(out.ignored).toBe(0);
    expect(out.bookings.length).toBe(file.rows);
  });

  /**
   * The fixture has to be free of the one thing Postgres does not promise:
   * `mode()` breaks a tie arbitrarily, so a customer whose modal weekday, hour
   * or party size is tied could legitimately differ between the two sides and
   * the oracle would report a difference that is nobody's bug.
   */
  it("gives every customer an unambiguous modal weekday, hour and party size", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const out = toBookings(sheet, guessRoles(sheet));
    const byCustomer = new Map<string, typeof out.bookings>();
    for (const b of out.bookings) {
      const list = byCustomer.get(b.customerId) ?? [];
      list.push(b);
      byCustomer.set(b.customerId, list);
    }
    for (const [id, rows] of byCustomer) {
      const attended = rows.filter((r) => r.status !== "cancelled");
      if (attended.length === 0) continue;
      expect(new Set(attended.map((r) => isoDow(r.day))).size, `${id} weekday`).toBe(1);
      expect(new Set(attended.map((r) => r.hour)).size, `${id} hour`).toBe(1);
      expect(new Set(attended.map((r) => r.party)).size, `${id} party`).toBe(1);
    }
  });

  it("contains all five distance bands, so the oracle exercises each", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const towns = new Set(toBookings(sheet, guessRoles(sheet)).bookings.map((b) => b.town));
    expect(towns.has("Longford")).toBe(true);
    expect(towns.has("Dublin")).toBe(true);
    expect(towns.has("Belfast")).toBe(true);
    expect(towns.has(null)).toBe(true);
  });

  it("contains customers of every visit count the buckets care about", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    const facts = buildCustomers(bookings, dayFromIso(file.asOfIso) as number, buildSeasonality(bookings));
    const counts = facts.map((f) => f.visits);
    expect(counts.some((n) => n === 1)).toBe(true);
    expect(counts.some((n) => n >= 2 && n <= 3)).toBe(true);
    expect(counts.some((n) => n >= 4 && n <= 9)).toBe(true);
    expect(counts.some((n) => n >= 10)).toBe(true);
  });

  it("contains cancellations, no-shows, memberships and sold-out slots", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    expect(bookings.some((b) => b.status === "cancelled")).toBe(true);
    expect(bookings.some((b) => b.status === "no_show")).toBe(true);
    expect(bookings.some((b) => b.creditsRemaining > 0)).toBe(true);
    const byslot = new Map<string, number>();
    for (const b of bookings) {
      if (b.status === "cancelled" || b.hour === null) continue;
      const key = `${b.day}:${b.hour}`;
      byslot.set(key, (byslot.get(key) ?? 0) + 1);
    }
    expect([...byslot.values()].some((n) => n >= 8)).toBe(true);
  });

  it("covers twelve calendar months, so the season factor can be on", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    expect(buildSeasonality(bookings).enoughHistory).toBe(true);
  });

  it("names nobody real", () => {
    // Every identifier is generated. This is a guard against somebody later
    // pasting a real export in here as "better test data".
    expect(generate(options).csv).toMatch(/^customer_id,/);
    expect(/@/.test(generate(options).csv)).toBe(false);
  });
});
```

```ts
// lib/tools/second-visit/demo.ts

/**
 * One seeded generator, two jobs.
 *
 * The page's demo file and the oracle's fixture come out of here with different
 * seeds and sizes, which is why it is a TypeScript module in `lib/` rather than
 * a script: `scripts/second-visit/make-fixture.mjs` imports it directly, on
 * Node's built-in type stripping, so there is one generator and not two that
 * drift.
 *
 * Three properties matter and each one is a test in `demo.test.ts`:
 *
 *   1. **Deterministic.** Same seed, same bytes. A fixture that changes between
 *      runs is not a fixture.
 *   2. **No ties on anything `mode()` decides.** Every customer keeps one
 *      weekday, one hour and one party size for life, because Postgres does not
 *      promise how it breaks a tie and a difference there would be nobody's bug.
 *   3. **Every branch present.** All five distance bands, all four visit
 *      buckets, cancellations, no-shows, memberships and slots that sold out,
 *      or the oracle passes without ever reaching most of the model.
 */

export const DEMO_SEED = 20260904;
export const DEMO_FILENAME = "second-visit-demo.csv";
export const DEMO_VENUE_TOWN = "Longford";

export type GenerateOptions = {
  seed: number;
  customers: number;
  months: number;
  startIso: string;
  venueTown: string;
};

export type GeneratedFile = {
  csv: string;
  asOfIso: string;
  venueTown: string;
  customers: number;
  rows: number;
};

/** mulberry32: small, fast, and identical in every engine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS_PER_DAY = 86_400_000;
const toDay = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_PER_DAY);
const toIso = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
const dow = (day: number) => (((day + 3) % 7) + 7) % 7 + 1;

/** Weighted so most people are local and a few are not, which is the real shape. */
const TOWNS: { town: string | null; country: string | null; weight: number }[] = [
  { town: "Longford", country: "IE", weight: 30 },
  { town: "Granard", country: "IE", weight: 14 },
  { town: "Cavan", country: "IE", weight: 12 },
  { town: "Mullingar", country: "IE", weight: 10 },
  { town: "Sligo", country: "IE", weight: 6 },
  { town: "Dublin", country: "IE", weight: 12 },
  { town: "Belfast", country: "GB", weight: 4 },
  { town: "Nowheresville", country: "IE", weight: 3 },
  { town: null, country: null, weight: 9 },
];

const PRODUCTS = ["Sauna session", "Private hire", "Cold plunge", "Ten-pack"];

function pick<T extends { weight: number }>(next: () => number, items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = [
  "customer_id",
  "booking_date",
  "amount",
  "slot_start",
  "capacity",
  "status",
  "town",
  "country",
  "product",
  "party_size",
  "credits_remaining",
];

export function generate(options: GenerateOptions): GeneratedFile {
  const next = rng(options.seed);
  const startDay = toDay(options.startIso);
  const endDay = startDay + Math.round(options.months * 30.4);
  const rows: (string | number | null)[][] = [];

  for (let i = 0; i < options.customers; i++) {
    const id = `C${String(i + 1).padStart(4, "0")}`;
    const place = pick(next, TOWNS);
    const weekday = 1 + Math.floor(next() * 7);
    const hour = [11, 14, 17, 18, 20][Math.floor(next() * 5)];
    const party = next() < 0.4 ? 2 : 1;
    const member = next() < 0.12;
    const product = PRODUCTS[Math.floor(next() * PRODUCTS.length)];

    // Four kinds of customer, which is what produces all four visit buckets.
    const roll = next();
    const cadence = roll < 0.35 ? 14 : roll < 0.6 ? 30 : roll < 0.85 ? 75 : 200;
    const joins = startDay + Math.floor(next() * (endDay - startDay) * 0.9);

    // Snap every visit onto that customer's own weekday, so nothing `mode()`
    // decides is ever tied.
    let day = joins + ((weekday - dow(joins) + 7) % 7);
    let visits = 0;
    while (day <= endDay && visits < 40) {
      const status = next() < 0.05 ? "no_show" : next() < 0.06 ? "cancelled" : "completed";
      rows.push([
        id,
        toIso(day),
        (next() < 0.25 ? 55 : 45).toFixed(2),
        `${String(hour).padStart(2, "0")}:00`,
        8,
        status,
        place.town,
        place.country,
        product,
        party,
        member ? 5 : 0,
      ]);
      visits++;
      const jitter = 0.6 + next() * 0.9;
      const step = Math.max(7, Math.round(cadence * jitter));
      day += step + ((weekday - dow(day + step) + 7) % 7);
    }
  }

  // A handful of evenings that sold out, so the squeeze has something to find.
  // Filler bookings under their own identifiers, on one weekday and hour.
  let fillerDay = startDay + 400 + ((6 - dow(startDay + 400) + 7) % 7);
  for (let week = 0; week < 20; week++) {
    const full = week % 3 !== 0;
    for (let seat = 0; seat < (full ? 8 : 2); seat++) {
      rows.push([
        `F${week}-${seat}`,
        toIso(fillerDay),
        "45.00",
        "18:00",
        8,
        "completed",
        "Longford",
        "IE",
        PRODUCTS[0],
        1,
        0,
      ]);
    }
    fillerDay += 7;
  }

  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));

  const csv = [HEADER.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
  const lastDay = rows.reduce((max, row) => Math.max(max, toDay(String(row[1]))), startDay);

  return {
    csv,
    asOfIso: toIso(lastDay),
    venueTown: options.venueTown,
    customers: new Set(rows.map((row) => String(row[0]))).size,
    rows: rows.length,
  };
}

/** The file behind the page's "try it on a made-up sauna" button. */
export function demoCsv(): string {
  return generate({
    seed: DEMO_SEED,
    customers: 180,
    months: 24,
    startIso: "2024-09-01",
    venueTown: DEMO_VENUE_TOWN,
  }).csv;
}
```

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/demo.test.ts`
Expected: PASS. If the "unambiguous modal" test fails, the weekday snap is wrong and the fixture would produce differences in Task 12 that are nobody's bug. Fix it here.

- [ ] **Step 2: Write the fixture maker**

```js
// scripts/second-visit/make-fixture.mjs
/**
 * Writes the four committed fixture inputs for the oracle.
 *
 *   node scripts/second-visit/make-fixture.mjs
 *
 * Deterministic: same seed, same bytes, so re-running it on an unchanged
 * generator produces no diff. Imports the TypeScript generator directly on
 * Node's built-in type stripping (Node 23.6 and later; CI runs 24), which is
 * how there is one generator rather than a copy that drifts.
 *
 * **Both imports carry a `.ts` extension and point at modules that import
 * nothing themselves.** Node's ESM resolver has no extension guessing and no
 * `@/` alias, so `towns.generated.ts` is imported directly rather than through
 * `towns.ts`, which would drag in a `./towns.generated` that Node cannot
 * resolve. The bundler and vitest both resolve that form; Node does not, and
 * this script is the only thing that runs outside them.
 *
 * The outputs are committed. Nothing regenerates them in CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generate } from "../../lib/tools/second-visit/demo.ts";
import { TOWN_ROWS } from "../../lib/tools/second-visit/towns.generated.ts";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`this script needs Node 23.6 or later for TypeScript imports; this is ${process.version}`);
  process.exit(1);
}

const OUT = "lib/tools/second-visit/oracle";
const SEED = 4242;
const VENUE = "Longford";
mkdirSync(OUT, { recursive: true });

const file = generate({ seed: SEED, customers: 400, months: 24, startIso: "2024-09-01", venueTown: VENUE });
writeFileSync(`${OUT}/bookings.csv`, file.csv, "utf8");

// Only the towns the fixture mentions, plus the venue, so the SQL side needs
// no copy of the generated table.
const mentioned = new Set(
  file.csv
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[6])
    .filter(Boolean),
);
mentioned.add(VENUE);
const rows = [...mentioned]
  .map((name) => TOWN_ROWS.find((t) => t[0].toLowerCase() === name.toLowerCase()))
  .filter(Boolean)
  .sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(
  `${OUT}/towns.csv`,
  ["name,county,country,lat,lng", ...rows.map((t) => `${t[0]},${t[1]},${t[2]},${t[3]},${t[4]}`)].join("\n") + "\n",
  "utf8",
);

writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify(
    { seed: SEED, venueTown: VENUE, asOfIso: file.asOfIso, customers: file.customers, rows: file.rows },
    null,
    2,
  ) + "\n",
  "utf8",
);

/* ── the scalar argument table ─────────────────────────────────────────────
 * Hand-picked edges first, because those are the cases that matter, then a
 * deterministic sweep so the functions are exercised on values nobody chose.
 */
const bands = ["local", "catchment", "regional", "distant", "visitor", "unknown", "nonsense"];
const scalars = [];
const add = (fn, args) => scalars.push({ i: scalars.length, fn, args });

for (const [lat1, lng1, lat2, lng2] of [
  [53.8608, -7.5806, 53.3498, -6.2603],
  [53.3498, -6.2603, 53.3498, -6.2603],
  [null, -6.2603, 53.3498, -6.2603],
  [53.3498, null, 53.3498, -6.2603],
  [51.8985, -8.4756, 54.5973, -5.9301],
]) add("distance_km", [lat1, lng1, lat2, lng2]);

for (const km of [null, 0, 14.999, 15, 15.001, 44.999, 45, 45.001, 94.999, 95, 95.001, 98, 5000]) {
  for (const same of [true, false, null]) add("distance_band", [km, same]);
}
for (const band of bands) add("distance_prior_factor", [band]);
for (const raw of [null, 0.5, 1, 1.35, 2.2, 4, 8]) {
  for (const n of [null, -3, 0, 1, 2, 3, 9, 40]) add("blend_prior", [raw, n]);
}
for (const observed of [null, 0, 3, 14, 30, 365.5]) {
  for (const n of [null, -1, 0, 1, 2, 10]) {
    for (const prior of [null, 30, 45.5]) add("shrink", [observed, n, prior]);
  }
}
for (const m of [null, -1, 0, 0.001, 0.25, 0.5, 0.9, 1, 1.111, 2, 100]) add("season_factor", [m]);
for (const base of [null, 0, 1, 30, 200]) {
  for (const d of [null, 1, 2.5, 8]) {
    for (const s of [null, 0.6, 1, 3]) {
      for (const c of [null, 1, 1.25]) add("expected_gap_days", [base, d, s, c]);
    }
  }
}
for (const visits of [null, 0, 1, 2, 4, 10]) {
  for (const ratio of [null, 0, 0.999, 1, 1.5, 1.999, 2, 7]) {
    for (const flags of [
      [false, false, false, false],
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
      [true, false, false, true],
      [null, null, null, null],
    ]) add("retention_verdict", [visits, ratio, ...flags]);
  }
}
for (const consent of [true, false, null]) {
  for (const email of [true, false, null]) {
    for (const phone of [true, false, null]) {
      for (const suppressed of [true, false, null]) add("reachability", [consent, email, phone, suppressed]);
    }
  }
}
for (const band of bands) {
  for (const visits of [null, 0, 1, 3, 9, 20, 500]) add("p_return_prior", [band, visits]);
}
for (const successes of [null, 0, 1, 60]) {
  for (const trials of [null, 0, 1, 100]) {
    for (const prior of [null, 0, 0.1, 0.6]) add("smooth_rate", [successes, trials, prior, 20]);
  }
}
for (const p of [null, 0, 0.25, 1]) {
  for (const margin of [null, -5000, 0, 5, 4000, 123456]) {
    for (const reach of [null, 0, 0.6, 1]) add("winnability_cents", [p, margin, reach]);
  }
}

writeFileSync(`${OUT}/scalars.json`, JSON.stringify(scalars) + "\n", "utf8");
console.log(`bookings ${file.rows} rows, ${file.customers} customers, as of ${file.asOfIso}`);
console.log(`towns ${rows.length}`);
console.log(`scalars ${scalars.length}`);
```

Run it and look at what came out:

```bash
cd "$WT"
node scripts/second-visit/make-fixture.mjs
wc -c lib/tools/second-visit/oracle/bookings.csv lib/tools/second-visit/oracle/scalars.json
head -3 lib/tools/second-visit/oracle/bookings.csv
cat lib/tools/second-visit/oracle/manifest.json
```

Expected: a bookings file in the low hundreds of kilobytes, around 700 scalar tuples, and a manifest naming the as-of date. **Run it twice and confirm `git status` is clean the second time**: a fixture that changes on every run is not a fixture.

- [ ] **Step 3: Write the pipeline SQL, from the migration**

Open `apps/api/migrations/0300_customer_intelligence.sql` at the `analytics.customer_intelligence` view and work down its CTEs. The fixture is flat, so `app.bookings` becomes `fx.bookings`, `analytics.customer_metrics` becomes the `visits` / `gaps` / `second_visit` / `spend` CTEs reproduced from 0070, and the venue is one row instead of a table. Nothing else changes.

```sql
-- lib/tools/second-visit/oracle/pipeline.sql
--
-- The whole model over the committed fixture, in the dialect that runs in
-- production. Loaded by scripts/second-visit/compare.mjs after
-- 0300-functions.sql, against the tables that script creates.
--
-- **Written from migration 0300's own CTEs and from 0070's customer_metrics,
-- never from lib/tools/second-visit/analyse.ts.** Two independent expressions
-- of one model is the entire value of this file. Transcribe it from the
-- TypeScript and the oracle proves only that a function agrees with itself.
--
-- What it cannot catch, stated so nobody claims otherwise: a misreading of the
-- migration shared by both sides. The unit tests in model.test.ts are the other
-- half of that, because they pin the literals against the SQL text by hand.

with settings as (select as_of, venue_town from fx.settings),
venue as (
  select t.lat, t.lng, t.country
  from fx.towns t, settings s
  where lower(t.name) = lower(s.venue_town)
),
attended as (
  select * from fx.bookings where status in ('completed', 'no_show')
),
season_monthly as (
  select extract(month from local_date)::int as month_of_year, count(*)::numeric as visits
  from attended group by 1
),
season_totals as (
  select sum(visits) as total, count(*)::int as months_seen from season_monthly
),
season as (
  select m.month_of_year,
         case when t.total = 0 or t.months_seen = 0 then 1.0
              else round(m.visits / (t.total / t.months_seen), 3) end as month_index,
         t.months_seen
  from season_monthly m cross join season_totals t
),
-- customer_metrics, the four inputs 0300 consumes and does not define (0070).
v as (
  select customer_id, count(*)::int as visits,
         min(local_date) as first_on, max(local_date) as last_on
  from attended group by customer_id
),
g as (
  select customer_id,
         percentile_cont(0.5) within group (order by gap_days)::numeric(6,1) as median_gap_days
  from (
    select customer_id,
           local_date - lag(local_date) over (partition by customer_id order by local_date) as gap_days
    from fx.bookings where status = 'completed'
  ) x
  where gap_days is not null and gap_days > 0
  group by customer_id
),
sv as (
  select a.customer_id,
         (select min(b.local_date) from attended b
           where b.customer_id = a.customer_id and b.local_date > min(a.local_date))
         - min(a.local_date) as days_to_second_visit
  from attended a group by a.customer_id
),
sp as (
  select customer_id,
         count(*) filter (where amount_cents is not null)::int as orders,
         coalesce(sum(amount_cents), 0)::numeric as lifetime_value_cents
  from fx.bookings group by customer_id
),
pa as (
  select customer_id, mode() within group (order by party_size) as modal_party_size
  from attended group by customer_id
),
cr as (
  select customer_id, max(credits_remaining) as credits_remaining
  from fx.bookings group by customer_id
),
geo_town as (
  select distinct on (customer_id) customer_id, town, country
  from fx.bookings where town is not null and town <> ''
  order by customer_id, local_date desc, town
),
geo as (
  select v.customer_id,
         hearth.distance_km(t.lat, t.lng, ve.lat, ve.lng) as distance_km,
         case when t.country is null or ve.country is null then null
              else t.country = ve.country end as same_country
  from v
  left join geo_town gt on gt.customer_id = v.customer_id
  left join fx.towns t on lower(t.name) = lower(gt.town)
  cross join venue ve
),
slot as (
  select customer_id,
         mode() within group (order by extract(isodow from local_date)::int) as modal_weekday,
         mode() within group (order by slot_hour) as modal_hour,
         max(local_date) as last_on
  from attended where slot_hour is not null
  group by customer_id
),
occ as (
  select local_date, slot_hour, count(*) as booked, max(capacity) as capacity
  from attended where slot_hour is not null
  group by local_date, slot_hour
),
squeeze as (
  select s.customer_id,
         count(*) as slots_since,
         count(*) filter (where o.capacity is not null and o.booked >= o.capacity) as slots_full
  from slot s
  join occ o
    on o.slot_hour = s.modal_hour
   and extract(isodow from o.local_date)::int = s.modal_weekday
   and o.local_date > s.last_on
   and o.local_date <= (select as_of from settings)
  group by s.customer_id
),
season_profile as (
  select a.customer_id,
         count(*) as visits_seen,
         count(*) filter (where s.month_index < 0.9) as visits_in_trough
  from attended a
  join season s on s.month_of_year = extract(month from a.local_date)::int
  group by a.customer_id
),
base as materialized (
  select
    v.customer_id,
    v.visits,
    v.first_on,
    v.last_on,
    (select as_of from settings) - v.last_on            as days_since_last_visit,
    g.median_gap_days                                   as visit_cadence_days,
    sv.days_to_second_visit,
    greatest(0, v.visits - 1)::integer                  as observed_gaps,
    coalesce(sp.orders, 0)                              as orders,
    coalesce(sp.lifetime_value_cents, 0)                as lifetime_value_cents,
    coalesce(pa.modal_party_size, 1)                    as modal_party_size,
    coalesce(sq.slots_since, 0)                         as habitual_slots_since,
    coalesce(sq.slots_full, 0)                          as habitual_slots_full,
    coalesce(spr.visits_seen, 0)                        as season_visits_seen,
    coalesce(spr.visits_in_trough, 0)                   as season_visits_in_trough,
    coalesce(cr.credits_remaining, 0)                   as credits_remaining,
    geo.distance_km,
    coalesce(hearth.distance_band(geo.distance_km, geo.same_country), 'unknown') as distance_band,
    -- The season factor is off below twelve calendar months of trade, which is
    -- this tool's own rule and not the migration's. Null in means 1.0 out.
    case when (select months_seen from season_totals) >= 12
         then (select s.month_index from season s
                where s.month_of_year = extract(month from (select as_of from settings))::int)
         else null end                                  as current_month_index
  from v
  left join g   on g.customer_id = v.customer_id
  left join sv  on sv.customer_id = v.customer_id
  left join sp  on sp.customer_id = v.customer_id
  left join pa  on pa.customer_id = v.customer_id
  left join cr  on cr.customer_id = v.customer_id
  left join squeeze sq on sq.customer_id = v.customer_id
  left join season_profile spr on spr.customer_id = v.customer_id
  left join geo on geo.customer_id = v.customer_id
),
cohort as (
  select
    coalesce(percentile_cont(0.5) within group (
      order by base.visit_cadence_days) filter (where base.visits >= 3), 30.0)::numeric as cadence_days,
    coalesce(percentile_cont(0.5) within group (
      order by base.days_to_second_visit) filter (where base.days_to_second_visit is not null),
      45.0)::numeric as first_repeat_days,
    coalesce(avg(case when base.orders > 0
                      then base.lifetime_value_cents::numeric / base.orders end), 0)::numeric
      as average_order_cents
  from base
),
retention_obs as (
  select customer_id, total_visits,
         case when next_date is null then (select as_of from settings) - local_date
              else next_date - local_date end as gap_days,
         (next_date is not null) as returned
  from (
    select customer_id, local_date,
           lead(local_date) over (partition by customer_id order by local_date) as next_date,
           count(*) over (partition by customer_id) as total_visits
    from attended
  ) w
),
rates as (
  select b.distance_band,
         case when o.total_visits <= 1 then '1'
              when o.total_visits <= 3 then '2-3'
              when o.total_visits <= 9 then '4-9'
              else '10+' end as visits_bucket,
         width_bucket(o.gap_days::numeric, array[30, 60, 120, 240]::numeric[]) as overdue_bucket,
         count(*)::bigint as observations,
         count(*) filter (where o.returned)::bigint as returns
  from retention_obs o
  join base b on b.customer_id = o.customer_id
  group by 1, 2, 3
),
modelled as (
  select
    base.*,
    co.cadence_days      as cohort_cadence_days,
    co.first_repeat_days as cohort_first_repeat_days,
    co.average_order_cents as cohort_average_order_cents,
    case when base.visits <= 1 then co.first_repeat_days
         else hearth.shrink(base.visit_cadence_days, base.observed_gaps, co.cadence_days)
    end as base_gap_days,
    hearth.blend_prior(
      hearth.distance_prior_factor(base.distance_band), base.observed_gaps
    ) as distance_factor,
    hearth.season_factor(base.current_month_index) as season_factor,
    case when base.modal_party_size >= 2 then 1.25 else 1.00 end::numeric as companion_factor,
    (base.credits_remaining > 0) as committed,
    (base.visits >= 3
       and base.habitual_slots_since >= 4
       and base.habitual_slots_full::numeric / nullif(base.habitual_slots_since, 0) >= 0.5)
      as slot_squeezed,
    (base.current_month_index < 0.9
       and base.season_visits_seen >= 4
       and base.season_visits_in_trough::numeric
             / nullif(base.season_visits_seen, 0) < 0.15) as seasonal_dormant,
    ((base.distance_band = 'distant' and base.visits <= 2)
     or (base.distance_band = 'visitor' and base.visits <= 3)) as low_evidence_far
  from base cross join cohort co
),
scored as (
  select modelled.*,
         hearth.expected_gap_days(
           modelled.base_gap_days, modelled.distance_factor,
           modelled.season_factor, modelled.companion_factor
         ) as expected_gap_days_calc
  from modelled
),
ratioed as (
  select scored.*,
         case when scored.days_since_last_visit is null then null
              else round(scored.days_since_last_visit / scored.expected_gap_days_calc, 3)
         end as silence_ratio_calc
  from scored
)
select
  r.customer_id,
  r.visits,
  r.observed_gaps,
  r.days_since_last_visit,
  r.visit_cadence_days,
  r.days_to_second_visit,
  r.orders,
  r.lifetime_value_cents,
  r.distance_band,
  -- `round(double precision, integer)` does not exist in Postgres, only
  -- `round(numeric, integer)`, and hearth.distance_km returns double.
  round(r.distance_km::numeric, 2)                as distance_km,
  r.modal_party_size,
  r.habitual_slots_since,
  r.habitual_slots_full,
  round(r.base_gap_days, 1)                       as base_gap_days,
  round(r.distance_factor, 3)                     as distance_factor,
  round(r.season_factor, 3)                       as season_factor,
  round(r.companion_factor, 3)                    as companion_factor,
  round(r.expected_gap_days_calc, 1)              as expected_gap_days,
  r.silence_ratio_calc                            as silence_ratio,
  r.committed,
  r.slot_squeezed,
  r.seasonal_dormant,
  r.low_evidence_far,
  hearth.retention_verdict(
    r.visits::integer, r.silence_ratio_calc, r.committed,
    r.slot_squeezed, r.seasonal_dormant, r.low_evidence_far
  ) as lifecycle,
  greatest(0, round(
    case when r.orders > 0 then r.lifetime_value_cents::numeric / r.orders
         else r.cohort_average_order_cents end
  ))::integer as expected_margin_cents,
  hearth.smooth_rate(
    coalesce(rr.returns, 0), coalesce(rr.observations, 0),
    hearth.p_return_prior(r.distance_band, r.visits::integer), 20
  ) as p_return,
  coalesce(rr.observations, 0)::bigint            as p_return_observations,
  hearth.winnability_cents(
    hearth.smooth_rate(
      coalesce(rr.returns, 0), coalesce(rr.observations, 0),
      hearth.p_return_prior(r.distance_band, r.visits::integer), 20
    ),
    greatest(0, round(
      case when r.orders > 0 then r.lifetime_value_cents::numeric / r.orders
           else r.cohort_average_order_cents end
    )),
    1.0
  ) as winnability_cents
from ratioed r
left join rates rr
  on rr.distance_band = r.distance_band
 and rr.visits_bucket = case when r.visits <= 1 then '1'
                             when r.visits <= 3 then '2-3'
                             when r.visits <= 9 then '4-9'
                             else '10+' end
 and rr.overdue_bucket = width_bucket(coalesce(r.days_since_last_visit, 0)::numeric,
                                      array[30, 60, 120, 240]::numeric[])
order by r.customer_id;
```

**Three deliberate differences from the production view, each because the fixture has no such data, and each mirrored on the TypeScript side:**

1. `winnability_cents` is called with a reachability of `1.0`, because the fixture carries no consent and the tool assumes consent when the file is silent. `reachability` itself is exercised exhaustively by the scalar level instead.
2. `expected_margin_cents` has no variable costs subtracted, because an export does not carry them. The production view multiplies by `(1 - variable_revenue_share)` and subtracts `variable_per_seat_cents`, and with no cost rows both are zero, so this is the same expression with the zeros written out.
3. `committed` is `credits_remaining > 0` only. The production view also reads an active membership from another table, which an export does not have.

- [ ] **Step 4: Write the comparison script**

```js
// scripts/second-visit/compare.mjs
/**
 * The oracle. Runs migration 0300's own SQL in a throwaway Postgres 16 and
 * either checks the committed golden files against it, or rewrites them.
 *
 *   node scripts/second-visit/compare.mjs            verify (default)
 *   node scripts/second-visit/compare.mjs --write    regenerate
 *   node scripts/second-visit/compare.mjs --keep     leave the container up
 *
 * Not part of `npm test` and not run in CI, for the same reason
 * scripts/mutation-check.mjs is not: it needs Docker and it takes a minute.
 * What runs in CI is lib/tools/second-visit/oracle.test.ts, which reads the
 * golden files this produced. So the division is:
 *
 *   this script      is the golden file really what Postgres says
 *   the vitest test  does the TypeScript port agree with the golden file
 *
 * **Neither of them ever reads the TypeScript.** A golden file regenerated
 * from the port would be a mirror rather than an oracle.
 *
 * `--duckdb` is documented in oracle/0300-macros.sql and is not implemented
 * here. S3 already established that DuckDB and Postgres agree to 1.14e-13.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ORACLE = "lib/tools/second-visit/oracle";
const CONTAINER = "sv-oracle-pg";
const PORT = "55432";
const TOLERANCE = 1e-9;

const write = process.argv.includes("--write");
const keep = process.argv.includes("--keep");

/** Every function, its argument types, and whether the result is a number. */
const SIGNATURES = {
  distance_km: { args: ["double precision", "double precision", "double precision", "double precision"], numeric: true },
  distance_band: { args: ["double precision", "boolean"], numeric: false },
  distance_prior_factor: { args: ["text"], numeric: true },
  blend_prior: { args: ["numeric", "integer"], numeric: true },
  shrink: { args: ["numeric", "integer", "numeric"], numeric: true },
  season_factor: { args: ["numeric"], numeric: true },
  expected_gap_days: { args: ["numeric", "numeric", "numeric", "numeric"], numeric: true },
  retention_verdict: { args: ["integer", "numeric", "boolean", "boolean", "boolean", "boolean"], numeric: false },
  reachability: { args: ["boolean", "boolean", "boolean", "boolean"], numeric: true },
  p_return_prior: { args: ["text", "integer"], numeric: true },
  smooth_rate: { args: ["numeric", "numeric", "numeric", "numeric"], numeric: true },
  winnability_cents: { args: ["numeric", "numeric", "numeric"], numeric: true },
};

function sql(value, type) {
  if (value === null || value === undefined) return `null::${type}`;
  if (typeof value === "boolean") return `${value}::${type}`;
  if (typeof value === "number") return `(${value})::${type}`;
  const quoted = String(value).replace(/'/g, "''");
  return `'${quoted}'::${type}`;
}

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function psql(text) {
  return docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], text);
}

function start() {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  } catch {
    // Nothing to remove, which is the normal case.
  }
  execFileSync("docker", [
    "run", "--rm", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=oracle",
    "-p", `${PORT}:5432`, "postgres:16",
  ], { stdio: "inherit" });
  for (let i = 0; i < 60; i++) {
    const ready = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (ready.status === 0) return;
    execFileSync("node", ["-e", "setTimeout(()=>{},1000)"]);
  }
  throw new Error("postgres did not come up within sixty seconds");
}

function stop() {
  if (keep) {
    console.log(`container ${CONTAINER} left running on port ${PORT}`);
    return;
  }
  try {
    execFileSync("docker", ["stop", CONTAINER], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}

/** CSV normalised to LF, because a Windows checkout hands these over as CRLF. */
const lf = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function loadFixture() {
  const manifest = JSON.parse(lf(`${ORACLE}/manifest.json`));
  psql(`
    create schema fx;
    create table fx.bookings (
      customer_id text, booking_date date, amount numeric, slot_start text,
      capacity int, status text, town text, country text, product text,
      party_size int, credits_remaining int
    );
    create table fx.towns (name text, county text, country text, lat double precision, lng double precision);
    create table fx.settings (as_of date, venue_town text);
  `);
  docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "\\copy fx.bookings from stdin with (format csv, header true)"], lf(`${ORACLE}/bookings.csv`));
  docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "\\copy fx.towns from stdin with (format csv, header true)"], lf(`${ORACLE}/towns.csv`));
  psql(`insert into fx.settings values ('${manifest.asOfIso}', '${manifest.venueTown.replace(/'/g, "''")}');`);
  // The pipeline SQL reads `slot_hour` and `amount_cents`; the export column is
  // a clock time and a decimal, so the two derived columns are added here
  // rather than making the fixture carry a shape no real export has.
  psql(`
    alter table fx.bookings add column slot_hour int;
    alter table fx.bookings add column amount_cents numeric;
    alter table fx.bookings add column local_date date;
    update fx.bookings set
      slot_hour = nullif(split_part(slot_start, ':', 1), '')::int,
      amount_cents = round(amount * 100),
      local_date = booking_date;
  `);
  return manifest;
}

function runScalars() {
  const cases = JSON.parse(lf(`${ORACLE}/scalars.json`));
  const parts = cases.map(({ i, fn, args }) => {
    const signature = SIGNATURES[fn];
    if (!signature) throw new Error(`no signature for ${fn}`);
    const rendered = args.map((value, index) => sql(value, signature.args[index])).join(", ");
    return `select ${i} as i, coalesce(hearth.${fn}(${rendered})::text, 'NULL') as value`;
  });
  const out = {};
  // Chunked so one statement does not run to megabytes.
  for (let start = 0; start < parts.length; start += 200) {
    const text = parts.slice(start, start + 200).join(" union all ") + " order by i;";
    for (const line of psql(text).trim().split("\n")) {
      if (line === "") continue;
      const [i, ...rest] = line.split("|");
      out[Number(i)] = rest.join("|");
    }
  }
  return cases.map(({ i, fn, args }) => ({ i, fn, args, value: out[i] }));
}

function runPipeline() {
  const text = `\\pset format unaligned\n\\pset tuples_only on\nselect coalesce(json_agg(x), '[]'::json)::text from (${lf(`${ORACLE}/pipeline.sql`).replace(/;\s*$/, "")}) x;`;
  return JSON.parse(psql(text).trim());
}

function compare(name, fresh, goldenPath) {
  const golden = JSON.parse(lf(goldenPath));
  const problems = [];
  if (golden.length !== fresh.length) {
    problems.push(`${name}: ${golden.length} golden rows against ${fresh.length} fresh`);
  }
  const limit = Math.min(golden.length, fresh.length);
  for (let i = 0; i < limit; i++) {
    for (const key of Object.keys(fresh[i])) {
      const a = golden[i][key];
      const b = fresh[i][key];
      if (a === b) continue;
      const bothNumbers = typeof a !== "boolean" && typeof b !== "boolean" && a !== null && b !== null && Number.isFinite(Number(a)) && Number.isFinite(Number(b));
      if (bothNumbers && Math.abs(Number(a) - Number(b)) <= TOLERANCE) continue;
      problems.push(`${name}[${i}].${key}: golden ${JSON.stringify(a)} against fresh ${JSON.stringify(b)}`);
    }
  }
  return problems;
}

try {
  start();
  psql(lf(`${ORACLE}/0300-functions.sql`));
  const manifest = loadFixture();
  console.log(`fixture: ${manifest.rows} rows, ${manifest.customers} customers, as of ${manifest.asOfIso}`);

  const scalars = runScalars();
  const pipeline = runPipeline();
  console.log(`postgres answered ${scalars.length} scalar cases and ${pipeline.length} customer rows`);

  if (write) {
    writeFileSync(`${ORACLE}/scalars.golden.json`, JSON.stringify(scalars) + "\n", "utf8");
    writeFileSync(`${ORACLE}/pipeline.golden.json`, JSON.stringify(pipeline) + "\n", "utf8");
    console.log("golden files rewritten from postgres");
  } else {
    const problems = [
      ...compare("scalars", scalars, `${ORACLE}/scalars.golden.json`),
      ...compare("pipeline", pipeline, `${ORACLE}/pipeline.golden.json`),
    ];
    if (problems.length > 0) {
      console.error(`${problems.length} differences between the committed golden files and postgres:`);
      for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("the committed golden files still match postgres");
    }
  }
} finally {
  stop();
}
```

Add to `package.json`, beside the existing scripts:

```json
    "sv:fixture": "node scripts/second-visit/make-fixture.mjs",
    "sv:compare": "node scripts/second-visit/compare.mjs",
```

- [ ] **Step 5: Generate the golden files, then prove the script can fail**

```bash
cd "$WT"
node scripts/second-visit/compare.mjs --write
wc -c lib/tools/second-visit/oracle/*.golden.json
node scripts/second-visit/compare.mjs; echo "verify exit: $?"
```

Expected: the first writes two files, the second prints `the committed golden files still match postgres` and exits 0.

Then break it on purpose, because a check nobody has seen fail is a ritual:

```bash
cd "$WT"
node -e '
const p = "lib/tools/second-visit/oracle/pipeline.golden.json";
const rows = JSON.parse(require("fs").readFileSync(p, "utf8"));
rows[0].expected_gap_days = String(Number(rows[0].expected_gap_days) + 0.2);
require("fs").writeFileSync(p, JSON.stringify(rows) + "\n");
'
node scripts/second-visit/compare.mjs; echo "verify exit: $?"
git checkout -- lib/tools/second-visit/oracle/pipeline.golden.json
node scripts/second-visit/compare.mjs; echo "verify exit: $?"
```

Expected: exit 1 naming `pipeline[0].expected_gap_days`, then exit 0 after the revert. That pair is `CLAIMS.md` rule 3, revert to confirm.

Then look at what came back, because a golden file full of nulls would also compare equal to itself:

```bash
cd "$WT"
node -e '
const rows = JSON.parse(require("fs").readFileSync("lib/tools/second-visit/oracle/pipeline.golden.json","utf8"));
const counts = {};
for (const r of rows) counts[r.lifecycle] = (counts[r.lifecycle] ?? 0) + 1;
console.log("rows", rows.length, counts);
console.log("bands", [...new Set(rows.map(r => r.distance_band))].sort());
console.log("squeezed", rows.filter(r => r.slot_squeezed).length, "committed", rows.filter(r => r.committed).length);
console.log("null expected_gap", rows.filter(r => r.expected_gap_days === null).length);
'
```

Expected: several hundred rows, at least five distinct lifecycles including `visiting` and `committed_idle`, all five distance bands present, a non-zero squeezed count, and **zero** null expected gaps. If `visiting` or `committed_idle` never occurs, the fixture never reaches those branches and Task 12 would pass without testing them. Fix the generator, not the expectation.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/demo.ts lib/tools/second-visit/demo.test.ts \
        lib/tools/second-visit/oracle/pipeline.sql lib/tools/second-visit/oracle/bookings.csv \
        lib/tools/second-visit/oracle/towns.csv lib/tools/second-visit/oracle/manifest.json \
        lib/tools/second-visit/oracle/scalars.json lib/tools/second-visit/oracle/scalars.golden.json \
        lib/tools/second-visit/oracle/pipeline.golden.json \
        scripts/second-visit/make-fixture.mjs scripts/second-visit/compare.mjs package.json
git commit -m "feat(second-visit): the fixture, the pipeline sql, and golden files postgres wrote"
```

---

### Task 12: The regression test, at 1e-9, in CI

**Files:**
- Create: `lib/tools/second-visit/oracle.test.ts`

**Interfaces:**
- Consumes: the six committed fixture and golden files (Task 11), `model.ts` (Task 4), `analyse.ts` (Task 10)
- Produces: the only reason the page is allowed to say the model is the production one

This is the task the whole plan exists for. Everything before it is careful reading; this is the check.

- [ ] **Step 1: Write the test**

```ts
// lib/tools/second-visit/oracle.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { parseCsv } from "./csv";
import { guessRoles, toBookings } from "./mapping";
import {
  blendPrior,
  distanceBand,
  distanceKm,
  distancePriorFactor,
  expectedGapDays,
  pReturnPrior,
  reachability,
  retentionVerdict,
  seasonFactor,
  shrink,
  smoothRate,
  winnabilityCents,
} from "./model";
import { dayFromIso } from "./numbers";
import type { Band } from "./types";

/**
 * The oracle.
 *
 * Two levels, both against output that a real Postgres 16 produced from
 * migration 0300's own SQL, committed under `oracle/`:
 *
 *   scalars   about 700 argument tuples through all twelve functions
 *   pipeline  the whole customer row over a 400-customer fixture export
 *
 * `scripts/second-visit/compare.mjs` is what produced those two files and what
 * re-checks them against Postgres on demand. Neither it nor this test ever
 * reads the port to decide what the right answer is, which is the difference
 * between an oracle and a mirror.
 *
 * **Tolerance is 1e-9 on numbers and exact on everything else.** Postgres
 * carries `numeric` and this port carries doubles, and spike S3 measured that
 * disagreement at 1.14e-13 over 100,000 rows. Anything above 1e-9 is a
 * different function rather than a different representation. A rounded column
 * that disagrees while its unrounded neighbour agrees is the documented
 * decimal-tie case in `numbers.ts`, and it is a finding to record rather than a
 * tolerance to loosen.
 */

const ORACLE = join(process.cwd(), "lib", "tools", "second-visit", "oracle");
/** LF, because git hands this checkout CRLF and CI LF for the same file. */
const read = (name: string) => readFileSync(join(ORACLE, name), "utf8").replace(/\r\n/g, "\n");

type ScalarCase = { i: number; fn: string; args: (number | boolean | string | null)[]; value: string };

const scalars: ScalarCase[] = JSON.parse(read("scalars.golden.json"));
const pipeline: Record<string, string | number | boolean | null>[] = JSON.parse(read("pipeline.golden.json"));
const manifest: { asOfIso: string; venueTown: string; customers: number; rows: number } = JSON.parse(
  read("manifest.json"),
);

const n = (value: number | boolean | string | null) =>
  value === null ? null : typeof value === "number" ? value : Number(value);
const bool = (value: number | boolean | string | null) => (value === null ? null : Boolean(value));

/** The port, called with the arguments Postgres was called with. */
function callPort(fn: string, args: (number | boolean | string | null)[]): unknown {
  switch (fn) {
    case "distance_km":
      return distanceKm(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "distance_band":
      return distanceBand(n(args[0]), bool(args[1]));
    case "distance_prior_factor":
      return distancePriorFactor(args[0] as Band);
    case "blend_prior":
      return blendPrior(n(args[0]), n(args[1]));
    case "shrink":
      return shrink(n(args[0]), n(args[1]), n(args[2]));
    case "season_factor":
      return seasonFactor(n(args[0]));
    case "expected_gap_days":
      return expectedGapDays(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "retention_verdict":
      return retentionVerdict(n(args[0]), n(args[1]), bool(args[2]), bool(args[3]), bool(args[4]), bool(args[5]));
    case "reachability":
      return reachability(bool(args[0]), bool(args[1]), bool(args[2]), bool(args[3]));
    case "p_return_prior":
      return pReturnPrior(args[0] as Band, n(args[1]));
    case "smooth_rate":
      return smoothRate(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "winnability_cents":
      return winnabilityCents(n(args[0]), n(args[1]), n(args[2]));
    default:
      throw new Error(`the golden file has a function this test does not call: ${fn}`);
  }
}

describe("the golden files are what this test thinks they are", () => {
  it("has a scalar case for every function, and enough of them", () => {
    expect(scalars.length).toBeGreaterThan(500);
    const covered = new Set(scalars.map((c) => c.fn));
    expect([...covered].sort()).toEqual([
      "blend_prior",
      "distance_band",
      "distance_km",
      "distance_prior_factor",
      "expected_gap_days",
      "p_return_prior",
      "reachability",
      "retention_verdict",
      "season_factor",
      "shrink",
      "smooth_rate",
      "winnability_cents",
    ]);
  });

  it("has a pipeline row for every customer in the fixture", () => {
    expect(pipeline.length).toBeGreaterThan(300);
    expect(new Set(pipeline.map((r) => r.customer_id)).size).toBe(pipeline.length);
  });

  /**
   * A golden file of nulls would agree with anything. This is the check that
   * the fixture actually reaches the branches the model is made of.
   */
  it("reaches every branch worth reaching", () => {
    const lifecycles = new Set(pipeline.map((r) => r.lifecycle));
    for (const expected of ["first_time", "repeat", "lapsed", "visiting", "committed_idle"]) {
      expect(lifecycles.has(expected), `no ${expected} row in the fixture`).toBe(true);
    }
    const bands = new Set(pipeline.map((r) => r.distance_band));
    for (const band of ["local", "catchment", "regional", "distant", "visitor", "unknown"]) {
      expect(bands.has(band), `no ${band} row in the fixture`).toBe(true);
    }
    expect(pipeline.some((r) => r.slot_squeezed === true)).toBe(true);
    expect(pipeline.every((r) => r.expected_gap_days !== null)).toBe(true);
  });
});

describe("the twelve functions agree with postgres", () => {
  it("on every argument tuple, at 1e-9", () => {
    const differences: string[] = [];
    for (const testCase of scalars) {
      const mine = callPort(testCase.fn, testCase.args);
      const theirs = testCase.value;
      const args = JSON.stringify(testCase.args);

      if (theirs === "NULL") {
        if (mine !== null) differences.push(`${testCase.fn}${args}: postgres null, port ${JSON.stringify(mine)}`);
        continue;
      }
      if (typeof mine === "string") {
        if (mine !== theirs) differences.push(`${testCase.fn}${args}: postgres ${theirs}, port ${mine}`);
        continue;
      }
      if (mine === null) {
        differences.push(`${testCase.fn}${args}: postgres ${theirs}, port null`);
        continue;
      }
      const gap = Math.abs(Number(mine) - Number(theirs));
      if (!(gap <= 1e-9)) {
        differences.push(`${testCase.fn}${args}: postgres ${theirs}, port ${mine}, apart by ${gap}`);
      }
    }
    expect(differences.slice(0, 20), `${differences.length} differences`).toEqual([]);
  });

  it("and the largest disagreement anywhere is the size representation predicts", () => {
    // Spike S3 measured 1.14e-13 between numeric and double over 100,000 rows.
    // Anything much larger than that is a different function, not a different
    // representation, and this records the number rather than assuming it.
    let worst = 0;
    let where = "none";
    for (const testCase of scalars) {
      const mine = callPort(testCase.fn, testCase.args);
      if (typeof mine !== "number" || testCase.value === "NULL") continue;
      const gap = Math.abs(mine - Number(testCase.value));
      if (gap > worst) {
        worst = gap;
        where = `${testCase.fn}${JSON.stringify(testCase.args)}`;
      }
    }
    expect(worst, `worst at ${where}`).toBeLessThan(1e-9);
  });
});

describe("the whole pipeline agrees with postgres", () => {
  const bookings = (() => {
    const sheet = parseCsv(read("bookings.csv"));
    const roles = guessRoles(sheet);
    const out = toBookings(sheet, roles);
    expect(out.ignored, "the fixture should read with nothing ignored").toBe(0);
    return out.bookings;
  })();

  const mine = analyse({
    bookings,
    asOfDay: dayFromIso(manifest.asOfIso),
    venueTown: manifest.venueTown,
  });

  const byId = new Map(mine.rows.map((row) => [row.id, row]));

  /** Golden column to the port's field, and how to read the golden value. */
  const COLUMNS: [string, keyof (typeof mine.rows)[number], "number" | "text" | "boolean"][] = [
    ["visits", "visits", "number"],
    ["observed_gaps", "observedGaps", "number"],
    ["days_since_last_visit", "daysSinceLast", "number"],
    ["visit_cadence_days", "visitCadenceDays", "number"],
    ["days_to_second_visit", "daysToSecondVisit", "number"],
    ["orders", "orders", "number"],
    ["lifetime_value_cents", "lifetimeValueCents", "number"],
    ["distance_band", "distanceBand", "text"],
    ["distance_km", "distanceKm", "number"],
    ["modal_party_size", "modalPartySize", "number"],
    ["habitual_slots_since", "habitualSlotsSince", "number"],
    ["habitual_slots_full", "habitualSlotsFull", "number"],
    ["base_gap_days", "baseGapDays", "number"],
    ["distance_factor", "distanceFactor", "number"],
    ["season_factor", "seasonFactor", "number"],
    ["companion_factor", "companionFactor", "number"],
    ["expected_gap_days", "expectedGapDays", "number"],
    ["silence_ratio", "silenceRatio", "number"],
    ["committed", "committed", "boolean"],
    ["slot_squeezed", "slotSqueezed", "boolean"],
    ["seasonal_dormant", "seasonalDormant", "boolean"],
    ["low_evidence_far", "lowEvidenceFar", "boolean"],
    ["lifecycle", "lifecycle", "text"],
    ["expected_margin_cents", "expectedMarginCents", "number"],
    ["p_return", "pReturn", "number"],
    ["p_return_observations", "pReturnObservations", "number"],
    ["winnability_cents", "winnabilityCents", "number"],
  ];

  it("has the same customers, and no others", () => {
    expect([...byId.keys()].sort()).toEqual(pipeline.map((r) => String(r.customer_id)).sort());
  });

  for (const [column, field, kind] of COLUMNS) {
    it(`agrees on ${column}`, () => {
      const differences: string[] = [];
      for (const golden of pipeline) {
        const row = byId.get(String(golden.customer_id));
        if (!row) continue;
        const theirs = golden[column];
        const ours = row[field] as unknown;
        if (theirs === null || theirs === undefined) {
          if (ours !== null) differences.push(`${golden.customer_id}: postgres null, port ${JSON.stringify(ours)}`);
          continue;
        }
        if (kind === "number") {
          if (ours === null) {
            differences.push(`${golden.customer_id}: postgres ${theirs}, port null`);
            continue;
          }
          const gap = Math.abs(Number(ours) - Number(theirs));
          if (!(gap <= 1e-9)) {
            differences.push(`${golden.customer_id}: postgres ${theirs}, port ${ours}, apart by ${gap}`);
          }
        } else if (String(ours) !== String(theirs)) {
          differences.push(`${golden.customer_id}: postgres ${theirs}, port ${ours}`);
        }
      }
      expect(differences.slice(0, 10), `${differences.length} rows differ on ${column}`).toEqual([]);
    });
  }

  it("agrees on the cohort baselines, which every row depends on", () => {
    // Not a column on the golden rows, so it is checked through the one place
    // it shows up: a first-timer's base gap is exactly the cohort's first
    // repeat median.
    const firstTimer = pipeline.find((r) => Number(r.visits) === 1);
    expect(firstTimer, "the fixture has no one-visit customer").toBeTruthy();
    const row = byId.get(String(firstTimer!.customer_id))!;
    expect(Math.abs(row.baseGapDays! - Number(firstTimer!.base_gap_days))).toBeLessThanOrEqual(1e-9);
  });
});
```

- [ ] **Step 2: Run it, and read the failures rather than adjusting the tolerance**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/tools/second-visit/oracle.test.ts 2>&1 | tail -40
```

**This is the step where the port gets fixed.** Expect failures on the first run, and expect them to be informative: each names a customer, the Postgres value and the port's. Three kinds and what each means:

- **A whole column off by a constant factor.** A literal was transcribed wrong. Go back to `model.ts` and the migration.
- **A handful of rows differing while the rest agree.** A branch or a null case. The commonest cause is a `coalesce` that is not there, or a comparison that treats a null as false where SQL treats it as unknown.
- **Everything differing by around 1e-13.** That is `numeric` against `double` and it is under the tolerance already. If it is not, the tolerance is not the problem, the arithmetic order is.

**Do not raise the tolerance and do not regenerate the golden file to match.** The golden file is what Postgres said; changing it to agree with the port is the one move that turns this whole task into decoration.

If a rounded column disagrees while its unrounded neighbour agrees, that is the decimal-tie case documented in `numbers.ts`. Record the exact value in the ledger, and only then decide: it is a real limit of the port, not a bug to paper over.

- [ ] **Step 3: Confirm it can fail, then confirm the failure goes**

```bash
cd "$WT"
node -e '
const fs = require("fs");
const p = "lib/tools/second-visit/model.ts";
fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("shrinkK: 2,", "shrinkK: 3,"));
'
npx vitest run lib/tools/second-visit/oracle.test.ts 2>&1 | tail -20
git checkout -- lib/tools/second-visit/model.ts
npx vitest run lib/tools/second-visit/oracle.test.ts 2>&1 | tail -5
```

Expected: FAIL naming `base_gap_days` and `expected_gap_days` on many customers, then PASS after the revert. **If moving the empirical Bayes constant from 2 to 3 leaves this test green, the oracle is not connected to the model and everything the page says about the port is unearned.** Paste both runs into the ledger.

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/oracle.test.ts
git commit -m "test(second-visit): the port against postgres at 1e-9, on every function and every customer"
```

---

### Task 13: The three files out, and the guard nobody expects a CSV to need

**Files:**
- Create: `lib/tools/second-visit/exports.ts`
- Test: `lib/tools/second-visit/exports.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `CustomerRow` (Task 10), `secondVisitCopy` (Task 1)
- Produces: `csvCell`, `toCsv`, `lapsedRegulars`, `secondVisitNudges`, `stallRisks`, `exportFiles`

Three lists, each defined by what somebody would do with it on a Tuesday morning, and each ranked by `winnability_cents` so the top of the file is where to start.

The guard: **a CSV cell beginning with `=`, `+`, `-`, `@`, a tab or a carriage return is a formula in Excel, LibreOffice and Sheets.** A customer identifier is data a stranger's system produced, this tool hands it back as a file somebody will double-click, and `=HYPERLINK(...)` in a customer name is a real and boring attack. Text cells get an apostrophe in front; numbers are written as numbers and never touched, because prefixing a negative number would make it text and break every sum in the sheet.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/exports.test.ts
import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { csvCell, exportFiles, lapsedRegulars, secondVisitNudges, stallRisks, toCsv } from "./exports";
import { parseCsv } from "./csv";
import { guessRoles, toBookings } from "./mapping";
import { demoCsv, DEMO_VENUE_TOWN } from "./demo";

const analysis = (() => {
  const sheet = parseCsv(demoCsv());
  const out = toBookings(sheet, guessRoles(sheet));
  return analyse({ bookings: out.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
})();

describe("a cell", () => {
  it("quotes only when it has to", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("has,comma")).toBe('"has,comma"');
    expect(csvCell('has"quote')).toBe('"has""quote"');
    expect(csvCell("has\nnewline")).toBe('"has\nnewline"');
  });

  it("is empty for nothing, and not the word null", () => {
    expect(csvCell(null)).toBe("");
  });

  /**
   * A customer identifier came out of somebody else's system and goes into a
   * file somebody will double-click. `=HYPERLINK("http://x","click")` in a
   * name is a formula in every spreadsheet there is.
   */
  it("defuses a formula in a text cell", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+44 7700 900000")).toBe("'+44 7700 900000");
    expect(csvCell("@handle")).toBe("'@handle");
    expect(csvCell("-lead")).toBe("'-lead");
    // Guarded but not quoted: a tab needs no quoting in a comma-delimited file,
    // and RFC 4180 only asks for it round a comma, a quote or a line break.
    expect(csvCell("\tstart")).toBe("'\tstart");
  });

  it("leaves a number alone, so a sheet can still add it up", () => {
    expect(csvCell(-4500)).toBe("-4500");
    expect(csvCell(0)).toBe("0");
  });
});

describe("the three lists", () => {
  it("puts people with a rhythm who are well past it in the lapsed file", () => {
    const rows = lapsedRegulars(analysis);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visits).toBeGreaterThanOrEqual(3);
      expect(["lapsed", "at_risk"]).toContain(row.lifecycle);
    }
  });

  it("puts one-visit customers who are not yet late in the nudges file", () => {
    const rows = secondVisitNudges(analysis);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visits).toBe(1);
      expect(row.lifecycle).toBe("first_time");
    }
  });

  it("puts the two and three visit drifters in the stalls file", () => {
    const rows = stallRisks(analysis);
    for (const row of rows) {
      expect(row.visits).toBeGreaterThanOrEqual(2);
      expect(row.visits).toBeLessThanOrEqual(3);
      expect(row.silenceRatio).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("never puts anybody in two of them", () => {
    const ids = [
      ...lapsedRegulars(analysis).map((r) => r.id),
      ...secondVisitNudges(analysis).map((r) => r.id),
      ...stallRisks(analysis).map((r) => r.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ranks by what a winback is worth, biggest first", () => {
    const rows = lapsedRegulars(analysis);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].winnabilityCents).toBeGreaterThanOrEqual(rows[i].winnabilityCents);
    }
  });

  it("never lists somebody it has already said cannot be contacted", () => {
    const withConsent = (() => {
      const sheet = parseCsv(demoCsv());
      const out = toBookings(sheet, guessRoles(sheet));
      const bookings = out.bookings.map((b) => ({ ...b, consent: false, hasEmail: true }));
      return analyse({ bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
    })();
    expect(lapsedRegulars(withConsent)).toHaveLength(0);
  });
});

describe("the files", () => {
  const files = exportFiles(analysis);

  it("is three of them, each named and each with its own sentence", () => {
    expect(files).toHaveLength(3);
    for (const file of files) {
      expect(file.file).toMatch(/\.csv$/);
      expect(file.note.length).toBeGreaterThan(20);
    }
  });

  it("writes a header this tool can read back", () => {
    for (const file of files) {
      if (file.csv.split("\n").length < 3) continue;
      const sheet = parseCsv(file.csv);
      expect(sheet.header[0]).toBe("customer");
      expect(sheet.rows.length).toBeGreaterThan(0);
    }
  });

  it("carries the sentence about assumed consent when it applies", () => {
    expect(files.some((f) => f.note.length > 0)).toBe(true);
    expect(analysis.assumedConsent).toBe(true);
  });

  it("uses CRLF, which is what RFC 4180 says and what Excel expects", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2\r\n");
  });
});
```

- [ ] **Step 2: Write the module**

```ts
// lib/tools/second-visit/exports.ts
import { secondVisitCopy } from "@/content/tools/second-visit";
import type { Analysis, CustomerRow } from "./analyse";

/**
 * Three lists somebody could act on this morning, and the guard a CSV needs.
 *
 * Each list is defined by the action it implies rather than by a score band,
 * and nobody appears in two of them, because a list that overlaps another is a
 * list somebody contacts twice.
 *
 * **The formula guard.** A cell starting with `=`, `+`, `-`, `@`, a tab or a
 * carriage return is a formula in Excel, LibreOffice and Sheets. These files
 * carry identifiers that came out of somebody else's system and go into a file
 * somebody will double-click. Text cells get an apostrophe; numbers never do,
 * because prefixing a negative number turns it into text and breaks every sum
 * in the sheet.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const guarded = FORMULA_START.test(value) ? "'" + value : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** CRLF, which is what RFC 4180 says and what a spreadsheet expects. */
export function toCsv(header: readonly string[], rows: readonly (string | number | null)[][]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}

const byWorth = (a: CustomerRow, b: CustomerRow) =>
  b.winnabilityCents - a.winnabilityCents || a.id.localeCompare(b.id);

/** A real rhythm, well past it, and worth something. */
export function lapsedRegulars(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits >= 3 && (row.lifecycle === "lapsed" || row.lifecycle === "at_risk"))
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

/** One visit, not yet late. The cheapest nudge in the file. */
export function secondVisitNudges(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits === 1 && row.lifecycle === "first_time")
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

/** Two or three visits and drifting: the point where a habit forms or does not. */
export function stallRisks(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits >= 2 && row.visits <= 3)
    .filter((row) => row.silenceRatio !== null && row.silenceRatio >= 0.75)
    .filter((row) => row.lifecycle !== "lapsed" && row.lifecycle !== "at_risk")
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

const HEADER = [
  "customer",
  "visits",
  "first_visit",
  "last_visit",
  "days_since_last",
  "own_cadence_days",
  "expected_gap_days",
  "silence_ratio",
  "distance_band",
  "distance_km",
  "verdict",
  "verdict_before",
  "p_return",
  "expected_margin_cents",
  "winnability_cents",
];

function toRows(rows: readonly CustomerRow[]): (string | number | null)[][] {
  return rows.map((row) => [
    row.id,
    row.visits,
    row.firstIso,
    row.lastIso,
    row.daysSinceLast,
    row.visitCadenceDays,
    row.expectedGapDays,
    row.silenceRatio,
    row.distanceBand,
    row.distanceKm,
    row.lifecycle,
    row.lifecycleNaive,
    row.pReturn,
    row.expectedMarginCents,
    row.winnabilityCents,
  ]);
}

export type ExportFile = { name: string; file: string; note: string; csv: string };

export function exportFiles(analysis: Analysis): ExportFile[] {
  const copy = secondVisitCopy.exports;
  const consentNote = analysis.assumedConsent ? ` ${copy.assumesConsent}` : "";
  return [
    { spec: copy.lapsed, rows: lapsedRegulars(analysis) },
    { spec: copy.nudges, rows: secondVisitNudges(analysis) },
    { spec: copy.stalls, rows: stallRisks(analysis) },
  ].map(({ spec, rows }) => ({
    name: spec.name,
    file: spec.file,
    note: `${spec.note}${consentNote}`,
    csv: toCsv(HEADER, toRows(rows)),
  }));
}
```

- [ ] **Step 3: Run them**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/second-visit/exports.test.ts`
Expected: PASS.

What this proves: three disjoint lists ranked by worth, a formula guard on text and not on numbers, CRLF line endings, and a file this tool can read back. What it cannot see: whether Excel actually opens it the way the guard assumes, which is a claim about a spreadsheet and is worth one manual check in Task 18.

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/exports.ts lib/tools/second-visit/exports.test.ts
git commit -m "feat(second-visit): three disjoint lists, ranked by worth, with the formula guard on"
```

---

### Task 14: A report that opens with no internet and no scripts

**Files:**
- Create: `lib/tools/second-visit/report.ts`
- Test: `lib/tools/second-visit/report.test.ts`

**Interfaces:**
- Consumes: `Analysis` (Task 10), `secondVisitCopy`, `TIGH_CREDIT` (Task 1)
- Produces: `escapeHtml`, `stepPath`, `reportHtml`

One HTML file with everything in it. No script, no stylesheet, no font, no image, no fetch. It opens from a `file://` URL on a laptop with the wifi off in five years, which is the only definition of "self-contained" worth having.

Two guards, both with mutation rows: the escaper, because the file is full of identifiers a stranger's system produced; and the no-network rule, because a single `<img src="https://...">` in a report full of customer data is a beacon.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/second-visit/report.test.ts
import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { parseCsv } from "./csv";
import { DEMO_VENUE_TOWN, demoCsv } from "./demo";
import { guessRoles, toBookings } from "./mapping";
import { escapeHtml, reportHtml, stepPath } from "./report";

const analysis = (() => {
  const sheet = parseCsv(demoCsv());
  const out = toBookings(sheet, guessRoles(sheet));
  return analyse({ bookings: out.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
})();

describe("the escaper", () => {
  it("takes out all five characters that matter", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("does the ampersand first, or it double-escapes everything else", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone, accents included", () => {
    expect(escapeHtml("Séan O'Broin, Longford")).toBe("Séan O&#39;Broin, Longford");
  });
});

describe("the report", () => {
  const html = reportHtml(analysis);

  it("is a whole document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta charset="utf-8">');
  });

  /**
   * The whole point. A report full of somebody's customers that fetches
   * anything is a beacon, and one that needs a stylesheet is a blank page in
   * five years.
   */
  it("asks the network for nothing at all", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(/i);
    // The one exception, and it is a link somebody clicks rather than something
    // the document loads.
    const urls = html.match(/https?:\/\/[^"' <]+/g) ?? [];
    expect(urls.every((u) => u.startsWith("https://tighsauna.com"))).toBe(true);
  });

  it("carries its own styling inline", () => {
    expect(html).toContain("<style>");
  });

  it("prints both figures, so the comparison survives the save", () => {
    expect(html).toContain("Estimated share of first-time customers who return");
    expect(html).toContain("The figure a dashboard would show you");
  });

  it("prints the settings it was run with, so a saved report can be argued with", () => {
    expect(html).toContain(analysis.asOfIso);
    expect(html).toContain("Settings used");
    expect(html).toContain("15");  // the local band boundary
  });

  it("prints what it cannot see", () => {
    expect(html).toContain("What this cannot see");
    expect(html).toContain("Why anyone left");
  });

  it("escapes an identifier that is trying to be markup", () => {
    const hostile = {
      ...analysis,
      rows: [{ ...analysis.rows[0], id: '<script>alert(1)</script>' }],
    };
    const out = reportHtml(hostile);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("names the credited business exactly twice: the sentence and the link", () => {
    // Once inside TIGH_CREDIT.line and once as the link's text. The href is
    // lowercase and does not count. If this becomes three, the credit has been
    // repeated somewhere and removing it is no longer a one-line change.
    expect(html.split("Tigh Sauna")).toHaveLength(3);
  });
});

describe("the curve, drawn as a path", () => {
  it("is a step, because a survival curve does not slope between events", () => {
    const path = stepPath([{ day: 0, returned: 0 }, { day: 10, returned: 0.5 }], 100, 50);
    // Move, across, up, across: an L then a V, never a diagonal.
    expect(path).toMatch(/^M/);
    expect(path).toContain("H");
    expect(path).toContain("V");
    expect(path).not.toContain("C");
  });

  it("draws nothing rather than a NaN when there are no points", () => {
    expect(stepPath([], 100, 50)).toBe("");
  });
});
```

- [ ] **Step 2: Write the module**

```ts
// lib/tools/second-visit/report.ts
import { TIGH_CREDIT, secondVisit, secondVisitCopy } from "@/content/tools/second-visit";
import type { Analysis } from "./analyse";

/**
 * The saved report: one HTML file, no network, no scripts.
 *
 * It opens from a `file://` URL on a laptop with the wifi off, in five years,
 * in whatever browser exists then. That rules out a stylesheet, a font, an
 * image, an `@import` and any `url()`, and `report.test.ts` greps for all of
 * them. The one link is the credit, which is something somebody clicks rather
 * than something the document loads.
 *
 * Everything a visitor's file put into it goes through `escapeHtml`. The
 * identifiers in here came out of somebody else's system and this file is
 * handed back as a document a browser will render.
 *
 * The chart is an inline SVG path built here rather than a library, for the
 * same reason: a library is a script.
 */

/** Ampersand first, or every other replacement gets escaped a second time. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (cents: number) => `${(cents / 100).toFixed(2)}`;

/**
 * A survival curve is a step function: it holds flat between events and drops
 * at one. Drawing it with a smooth line would claim knowledge about the days
 * between events that nobody has.
 */
export function stepPath(
  points: readonly { day: number; returned: number }[],
  width: number,
  height: number,
): string {
  if (points.length === 0) return "";
  const maxDay = Math.max(...points.map((p) => p.day), 1);
  const x = (day: number) => ((day / maxDay) * width).toFixed(2);
  const y = (value: number) => (height - value * height).toFixed(2);
  let path = `M0 ${y(0)}`;
  for (const point of points) {
    path += ` H${x(point.day)} V${y(point.returned)}`;
  }
  path += ` H${width.toFixed(2)}`;
  return path;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 32px; max-width: 900px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 32px 0 8px; }
  p { margin: 0 0 10px; }
  .sub { opacity: 0.7; margin-bottom: 24px; }
  .big { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
  .muted { opacity: 0.7; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid rgba(128,128,128,0.3); }
  td.n, th.n { text-align: right; }
  svg { max-width: 100%; height: auto; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
`;

function table(header: readonly string[], rows: readonly (string | number | null)[][]): string {
  const head = header.map((h, i) => `<th${i > 0 ? ' class="n"' : ""}>${e(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td${i > 0 ? ' class="n"' : ""}>${cell === null ? "" : e(String(cell))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function reportHtml(analysis: Analysis): string {
  const copy = secondVisitCopy;
  const horizon = analysis.secondVisit.horizons.find((h) => !h.beyondFile && h.defined)
    ?? analysis.secondVisit.horizons[0];

  const headline = analysis.secondVisit.enough
    ? `<p class="big">${pct(horizon.estimate)}</p>
       <p class="muted">${e(copy.headline.kmLabel)}, ${e(copy.headline.horizonLabel)} ${horizon.day}.
       ${horizon.defined ? `${e(copy.headline.intervalLabel)} ${pct(horizon.lo)} to ${pct(horizon.hi)}.` : ""}</p>
       <p class="muted">${e(copy.headline.naiveLabel)}: ${pct(analysis.secondVisit.naive)}. ${e(copy.headline.naiveNote)}</p>
       <p class="muted">${e(copy.headline.medianLabel)}: ${
         analysis.secondVisit.medianDays === null
           ? e(copy.headline.medianNotReached)
           : `${analysis.secondVisit.medianDays} days`
       }.</p>`
    : `<p>${e(copy.refusals.tooFew)}</p>`;

  const curve = analysis.secondVisit.curve.length
    ? `<svg viewBox="0 0 640 200" role="img" aria-label="${e(copy.report.sections.curve)}">
         <path d="${stepPath(analysis.secondVisit.curve, 640, 200)}" fill="none" stroke="currentColor" stroke-width="2"/>
       </svg>`
    : "";

  const settings = Object.entries(analysis.params).map(([key, value]) => [key, value as number]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(copy.report.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${e(copy.report.title)}</h1>
<p class="sub">${e(analysis.counts.customers.toLocaleString("en-IE"))} customers, ${e(
    analysis.counts.attended.toLocaleString("en-IE"),
  )} attended bookings, ${e(analysis.span.firstIso ?? "")} to ${e(analysis.span.lastIso ?? "")}, measured as at ${e(
    analysis.asOfIso,
  )}${analysis.venue ? `, from ${e(analysis.venue.name)}` : ""}.</p>

<h2>${e(copy.report.sections.summary)}</h2>
${headline}

<h2>${e(copy.report.sections.curve)}</h2>
${curve}
${table(
  ["Day", "Returned by then"],
  analysis.secondVisit.horizons.map((h) => [h.day, h.beyondFile ? copy.headline.horizonDisabled : pct(h.estimate)]),
)}

<h2>${e(copy.report.sections.verdicts)}</h2>
${table(
  ["Verdict", "Customers"],
  analysis.verdicts.map((v) => [
    (copy.verdicts as Record<string, { label: string }>)[v.lifecycle]?.label ?? v.lifecycle,
    v.count,
  ]),
)}

<h2>${e(copy.report.sections.bands)}</h2>
${table(
  ["Band", "Customers", "Median expected gap, days"],
  analysis.bands.map((b) => [b.band, b.customers, b.medianExpectedGapDays]),
)}

<h2>${e(copy.report.sections.slots)}</h2>
<p class="muted">${e(copy.slots.note)}</p>
${
  analysis.slots.length === 0
    ? `<p>${e(copy.slots.missing)}</p>`
    : table(
        ["Weekday", "Hour", "Slots", "Visits", "Sold out"],
        analysis.slots.map((s) => [copy.slots.weekdays[s.weekday - 1], s.hour, s.slots, s.visits, s.full]),
      )
}

<h2>${e(copy.report.sections.products)}</h2>
${
  analysis.products.length === 0
    ? `<p>${e(copy.products.missing)}</p>`
    : table(
        [copy.products.columns.product, copy.products.columns.customers, copy.products.columns.median, copy.products.columns.overdue],
        analysis.products.map((p) => [p.product, p.customers, p.medianGapDays, p.overdue]),
      )
}

<h2>Top of the winback list</h2>
${table(
  ["Customer", "Visits", "Last visit", "Verdict", "Worth, euro"],
  [...analysis.rows]
    .sort((a, b) => b.winnabilityCents - a.winnabilityCents)
    .slice(0, 50)
    .map((r) => [r.id, r.visits, r.lastIso, r.lifecycle, money(r.winnabilityCents)]),
)}

<h2>${e(copy.report.sections.settings)}</h2>
<p class="muted">${
    analysis.usingProductionParams ? "" : e(copy.honesty.changed)
  }</p>
${table(["Constant", "Value"], settings)}

<h2>${e(copy.report.sections.limits)}</h2>
<ul>${secondVisit.cantSee.map((line) => `<li>${e(line)}</li>`).join("")}</ul>
${analysis.warnings.map((line) => `<p class="muted">${e(line)}</p>`).join("")}
${
  TIGH_CREDIT
    ? `<p class="muted">${e(TIGH_CREDIT.line)} <a href="${e(TIGH_CREDIT.href)}">${e(TIGH_CREDIT.name)}</a></p>`
    : ""
}
<p class="muted">${e(copy.report.note)}</p>
</body>
</html>
`;
}
```

- [ ] **Step 3: Run them, then look at one with your own eyes**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/tools/second-visit/report.test.ts
```

Then write one out to look at. **This goes through vitest rather than `node -e`**, because `report.ts` imports `@/content/tools/second-visit` and Node's resolver has no `@/` alias. Vitest does, from `vitest.config.ts`.

```bash
cd "$WT"
cat > lib/tools/second-visit/scratch-report.test.ts <<'EOF'
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { analyse } from "./analyse";
import { parseCsv } from "./csv";
import { DEMO_VENUE_TOWN, demoCsv } from "./demo";
import { guessRoles, toBookings } from "./mapping";
import { reportHtml } from "./report";

it("writes one report to look at with human eyes", () => {
  const sheet = parseCsv(demoCsv());
  const out = toBookings(sheet, guessRoles(sheet));
  const html = reportHtml(analyse({ bookings: out.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN }));
  writeFileSync(".t4-report.html", html);
  console.log("wrote .t4-report.html,", html.length, "bytes");
});
EOF
npx vitest run lib/tools/second-visit/scratch-report.test.ts
rm lib/tools/second-visit/scratch-report.test.ts
```

Open `.t4-report.html` in a browser **with the network disconnected**, and check: it renders, the curve is a step, the tables have numbers in them, and nothing is a broken image. That last check is the one the grep cannot do.

Then delete both: `rm .t4-report.html`, and confirm `git status` shows no `scratch-report.test.ts`. Neither is committed, and a scratch test left in the tree would ship a file write into CI.

What this proves: the escaper covers all five characters and does the ampersand first, the document asks the network for nothing, and every section renders from a real analysis. What it cannot see: how it looks, which is the manual step above and which is the reason it is a step.

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add lib/tools/second-visit/report.ts lib/tools/second-visit/report.test.ts
git commit -m "feat(second-visit): a saved report that opens with no network and no scripts"
```

---

### Task 15: The page, the worker, and the island

**Files:**
- Create: `app/tools/second-visit/page.tsx` (+ `page.test.ts`)
- Create: `app/tools/second-visit/run-client.ts` (+ `run-client.test.ts`)
- Create: `app/tools/second-visit/analysis.worker.ts`
- Create: `app/tools/second-visit/SecondVisitTool.tsx` (+ `SecondVisitTool.test.ts`)
- Create: `app/tools/second-visit/tool.css`
- Create: `lib/tools/second-visit/safety.test.ts`

**Interfaces:**
- Consumes: `ToolPage` (F3), `secondVisit`, `secondVisitCopy`, `TIGH_CREDIT` (Task 1), everything in `lib/tools/second-visit/`
- Produces: `/tools/second-visit`, and `makeRunner()` behind which the worker either exists or does not

**Vitest runs in `node` and there is no jsdom, so nothing below is rendered by a test.** The component tests are source-grep coupling checks in the pattern of `lib/boot.test.ts` and `components/chrome.test.ts`, and each says so in its own docblock. They cannot prove what a browser paints. What they can do is fail the moment somebody puts a `fetch` in the tool or drops the "Can't see" list, which is what they exist for.

- [ ] **Step 1: Write the worker and the runner**

```ts
// app/tools/second-visit/analysis.worker.ts
/**
 * The tool's background thread.
 *
 * A 50 MB export parsed on the main thread is a frozen tab, and the phone is
 * the product surface. So the file is read and modelled here, and the page gets
 * progress and a finished `Analysis`.
 *
 * Deliberately thin: everything it calls is a pure function from
 * `lib/tools/second-visit/`, tested in node with no worker anywhere near it.
 * The parsed bookings are kept in module state so moving a slider re-models
 * without re-reading a file that has not changed.
 *
 * Typed through `globalThis` rather than `self`, because the DOM lib types
 * `self` as a `Window` and this is not one.
 */
import { analyse, type AnalyseInput } from "@/lib/tools/second-visit/analyse";
import { parseCsv } from "@/lib/tools/second-visit/csv";
import { guessRoles, toBookings } from "@/lib/tools/second-visit/mapping";
import type { Booking, ColumnRoles, ModelParams } from "@/lib/tools/second-visit/types";

export type ToWorker =
  | { type: "parse"; text: string }
  | { type: "analyse"; roles: ColumnRoles; asOfDay: number | null; venueTown: string | null; params: ModelParams };

export type FromWorker =
  | { type: "parsed"; header: string[]; rows: number; sample: string[][]; roles: ColumnRoles; skipped: number; truncated: boolean; ms: number }
  | { type: "analysed"; analysis: ReturnType<typeof analyse>; used: number; ignored: number; ambiguousDates: boolean; ms: number }
  | { type: "failed"; kind: string; message: string };

const scope = globalThis as unknown as {
  addEventListener(type: "message", handler: (event: { data: ToWorker }) => void): void;
  postMessage(message: FromWorker): void;
};

let sheet: ReturnType<typeof parseCsv> | null = null;

scope.addEventListener("message", (event) => {
  const started = Date.now();
  try {
    if (event.data.type === "parse") {
      sheet = parseCsv(event.data.text);
      scope.postMessage({
        type: "parsed",
        header: sheet.header,
        rows: sheet.rows.length,
        sample: sheet.rows.slice(0, 5),
        roles: guessRoles(sheet),
        skipped: sheet.skipped,
        truncated: sheet.truncated,
        ms: Date.now() - started,
      });
      return;
    }
    if (!sheet) throw new Error("no file read yet");
    const read = toBookings(sheet, event.data.roles);
    const input: AnalyseInput = {
      bookings: read.bookings as Booking[],
      asOfDay: event.data.asOfDay,
      venueTown: event.data.venueTown,
      params: event.data.params,
    };
    scope.postMessage({
      type: "analysed",
      analysis: analyse(input),
      used: read.used,
      ignored: read.ignored,
      ambiguousDates: read.ambiguousDates,
      ms: Date.now() - started,
    });
  } catch (cause) {
    const kind = cause && typeof cause === "object" && "kind" in cause ? String((cause as { kind: unknown }).kind) : "failed";
    scope.postMessage({ type: "failed", kind, message: cause instanceof Error ? cause.message : "unknown" });
  }
});
```

```ts
// app/tools/second-visit/run-client.ts
"use client";

import { analyse } from "@/lib/tools/second-visit/analyse";
import { parseCsv } from "@/lib/tools/second-visit/csv";
import { guessRoles, toBookings } from "@/lib/tools/second-visit/mapping";
import type { Booking } from "@/lib/tools/second-visit/types";
import type { FromWorker, ToWorker } from "./analysis.worker";

/**
 * One interface, two places the work can happen.
 *
 * A Web Worker if the browser has one and the bundler produced it, and the same
 * pure functions on the main thread if not. Both paths are written and both are
 * real: the fallback is not a stub, it is the identical call sequence without
 * the thread. `where` says which one ran, and the page prints it, because "it
 * is in a worker" is a claim and this is how it is checked rather than assumed.
 *
 * The worker URL is built with `new URL(..., import.meta.url)`, which is the
 * form Next's bundler recognises. If it throws, or `Worker` is undefined, the
 * main-thread runner takes over and the page still works, more slowly, on a big
 * file.
 */

export type Runner = {
  where: "worker" | "main";
  parse(text: string): Promise<Extract<FromWorker, { type: "parsed" }>>;
  analyse(request: Extract<ToWorker, { type: "analyse" }>): Promise<Extract<FromWorker, { type: "analysed" }>>;
  dispose(): void;
};

function mainThreadRunner(): Runner {
  let sheet: ReturnType<typeof parseCsv> | null = null;
  return {
    where: "main",
    async parse(text) {
      const started = Date.now();
      sheet = parseCsv(text);
      return {
        type: "parsed",
        header: sheet.header,
        rows: sheet.rows.length,
        sample: sheet.rows.slice(0, 5),
        roles: guessRoles(sheet),
        skipped: sheet.skipped,
        truncated: sheet.truncated,
        ms: Date.now() - started,
      };
    },
    async analyse(request) {
      const started = Date.now();
      if (!sheet) throw new Error("no file read yet");
      const read = toBookings(sheet, request.roles);
      return {
        type: "analysed",
        analysis: analyse({
          bookings: read.bookings as Booking[],
          asOfDay: request.asOfDay,
          venueTown: request.venueTown,
          params: request.params,
        }),
        used: read.used,
        ignored: read.ignored,
        ambiguousDates: read.ambiguousDates,
        ms: Date.now() - started,
      };
    },
    dispose() {
      sheet = null;
    },
  };
}

export function makeRunner(): Runner {
  if (typeof Worker === "undefined") return mainThreadRunner();
  let worker: Worker;
  try {
    worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return mainThreadRunner();
  }

  const send = <T extends FromWorker["type"]>(message: ToWorker, expected: T) =>
    new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
      const onMessage = (event: MessageEvent<FromWorker>) => {
        worker.removeEventListener("message", onMessage);
        if (event.data.type === "failed") reject(new Error(event.data.message));
        else if (event.data.type === expected) resolve(event.data as Extract<FromWorker, { type: T }>);
        else reject(new Error(`expected ${expected}, got ${event.data.type}`));
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage(message);
    });

  return {
    where: "worker",
    parse: (text) => send({ type: "parse", text }, "parsed"),
    analyse: (request) => send(request, "analysed"),
    dispose: () => worker.terminate(),
  };
}
```

- [ ] **Step 2: Write the client component**

One `"use client"` component, all wiring. Every string comes out of `secondVisitCopy`, every number out of the analysis, and the only work it does itself is deciding which step to show.

```tsx
// app/tools/second-visit/SecondVisitTool.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { secondVisitCopy, TIGH_CREDIT } from "@/content/tools/second-visit";
import { trackToolRun } from "@/lib/tools/events";
import type { Analysis } from "@/lib/tools/second-visit/analyse";
import { MAX_BYTES } from "@/lib/tools/second-visit/csv";
import { DEMO_VENUE_TOWN, demoCsv } from "@/lib/tools/second-visit/demo";
import { exportFiles } from "@/lib/tools/second-visit/exports";
import { PRODUCTION_PARAMS } from "@/lib/tools/second-visit/model";
import { dayFromIso } from "@/lib/tools/second-visit/numbers";
import { reportHtml, stepPath } from "@/lib/tools/second-visit/report";
import { townOptions, TOWNS_ATTRIBUTION } from "@/lib/tools/second-visit/towns";
import type { ColumnRoles, ModelParams } from "@/lib/tools/second-visit/types";
import { makeRunner, type Runner } from "./run-client";

/**
 * The one client component on this route.
 *
 * It holds four things: a runner, what the file turned out to be, which column
 * is which, and the last analysis. Everything it displays is computed in
 * `lib/tools/second-visit/` and everything it says comes from
 * `content/tools/second-visit.ts`.
 *
 * `tool_run` carries the slug, the outcome and the milliseconds rounded to the
 * nearest hundred, and nothing else. A millisecond-precise duration correlates
 * with file size, and file size is the visitor's business.
 */

const OPTIONAL_ROLES = [
  "amount",
  "slotStart",
  "capacity",
  "status",
  "town",
  "country",
  "product",
  "party",
  "credits",
  "consent",
  "email",
  "phone",
] as const;

/** The constants the page puts a slider on, with the range each is sane over. */
const SLIDERS: { key: keyof ModelParams; label: string; min: number; max: number; step: number }[] = [
  { key: "shrinkK", label: secondVisitCopy.sliders.shrinkK, min: 0, max: 10, step: 1 },
  { key: "localKm", label: secondVisitCopy.sliders.localKm, min: 1, max: 60, step: 1 },
  { key: "catchmentKm", label: secondVisitCopy.sliders.catchmentKm, min: 5, max: 150, step: 5 },
  { key: "regionalKm", label: secondVisitCopy.sliders.regionalKm, min: 20, max: 400, step: 5 },
  { key: "priorDistant", label: secondVisitCopy.sliders.distantFactor, min: 1, max: 10, step: 0.05 },
  { key: "priorVisitor", label: secondVisitCopy.sliders.visitorFactor, min: 1, max: 20, step: 0.5 },
  { key: "companionFactor", label: secondVisitCopy.sliders.companionFactor, min: 1, max: 3, step: 0.05 },
  { key: "lapsedRatio", label: secondVisitCopy.sliders.lapsedRatio, min: 1, max: 6, step: 0.1 },
  { key: "loyalVisits", label: secondVisitCopy.sliders.loyalVisits, min: 2, max: 40, step: 1 },
  { key: "gapFloorDays", label: secondVisitCopy.sliders.floorDays, min: 1, max: 30, step: 1 },
  { key: "gapCapDays", label: secondVisitCopy.sliders.capDays, min: 60, max: 1095, step: 5 },
];

const round100 = (ms: number) => Math.round(ms / 100) * 100;

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SecondVisitTool() {
  const runner = useRef<Runner | null>(null);
  const [where, setWhere] = useState<Runner["where"] | null>(null);
  const [parsed, setParsed] = useState<Awaited<ReturnType<Runner["parse"]>> | null>(null);
  const [roles, setRoles] = useState<ColumnRoles | null>(null);
  const [venueTown, setVenueTown] = useState("");
  const [asOfIso, setAsOfIso] = useState("");
  const [params, setParams] = useState<ModelParams>(PRODUCTION_PARAMS);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState({ parseMs: 0, modelMs: 0 });

  useEffect(() => {
    const made = makeRunner();
    runner.current = made;
    setWhere(made.where);
    return () => {
      made.dispose();
      runner.current = null;
    };
  }, []);

  const towns = useMemo(() => townOptions().slice(0, 400), []);

  async function read(text: string, defaultTown: string) {
    const active = runner.current;
    if (!active) return;
    setBusy(true);
    setMessage(null);
    setAnalysis(null);
    try {
      const result = await active.parse(text);
      setParsed(result);
      setRoles(result.roles);
      setVenueTown(defaultTown);
      setAsOfIso("");
      setTiming({ parseMs: result.ms, modelMs: 0 });
    } catch {
      setMessage(secondVisitCopy.refusals.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage(secondVisitCopy.refusals.tooBig);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    await read(await file.text(), "");
  }

  async function run(next: ModelParams) {
    const active = runner.current;
    if (!active || !roles) return;
    if (roles.customer < 0) {
      setMessage(secondVisitCopy.refusals.noCustomer);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    if (roles.date < 0) {
      setMessage(secondVisitCopy.refusals.noDate);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await active.analyse({
        type: "analyse",
        roles,
        asOfDay: asOfIso === "" ? null : dayFromIso(asOfIso),
        venueTown: venueTown === "" ? null : venueTown,
        params: next,
      });
      if (result.used === 0) {
        setMessage(secondVisitCopy.refusals.badDates);
        void trackToolRun({ tool: "second-visit", outcome: "refused", ms: round100(result.ms) });
        return;
      }
      setAnalysis(result.analysis);
      setTiming((current) => ({ ...current, modelMs: result.ms }));
      void trackToolRun({ tool: "second-visit", outcome: "ok", ms: round100(result.ms) });
    } catch {
      setMessage(secondVisitCopy.refusals.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      setBusy(false);
    }
  }

  function moveSlider(key: keyof ModelParams, value: number) {
    const next = { ...params, [key]: value };
    setParams(next);
    void run(next);
  }

  const horizon = analysis?.secondVisit.horizons.find((h) => !h.beyondFile && h.defined)
    ?? analysis?.secondVisit.horizons[0];
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="sv">
      <section className="sv__step">
        <h2>{secondVisitCopy.steps.file.title}</h2>
        <p>{secondVisitCopy.steps.file.hint}</p>
        <input
          className="sv__file"
          type="file"
          accept=".csv,text/csv"
          aria-label={secondVisitCopy.steps.file.button}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <button className="sv__button" type="button" onClick={() => void read(demoCsv(), DEMO_VENUE_TOWN)}>
          {secondVisitCopy.steps.file.demo}
        </button>
        <p className="sv__hint">{secondVisitCopy.steps.file.demoNote}</p>
        {message ? <p className="sv__message" role="status">{message}</p> : null}
      </section>

      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.columns.title}</h2>
          <p>{secondVisitCopy.steps.columns.hint}</p>
          <p className="sv__hint">
            {parsed.rows} {secondVisitCopy.labels.rows}, {timing.parseMs} {secondVisitCopy.labels.parseMs}
            {where === null ? "" : ` (${where})`}
          </p>
          {(["customer", "date"] as const).map((role) => (
            <label className="sv__label" key={role}>
              {role}
              <select
                className="sv__select"
                value={roles[role]}
                onChange={(event) => setRoles({ ...roles, [role]: Number(event.target.value) })}
              >
                {parsed.header.map((name, index) => (
                  <option key={`${name}-${index}`} value={index}>{name}</option>
                ))}
              </select>
            </label>
          ))}
          {OPTIONAL_ROLES.map((role) => (
            <label className="sv__label" key={role}>
              {role}
              <select
                className="sv__select"
                value={roles[role] ?? -1}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setRoles({ ...roles, [role]: index < 0 ? null : index });
                }}
              >
                <option value={-1}>{secondVisitCopy.labels.ignored}</option>
                {parsed.header.map((name, index) => (
                  <option key={`${name}-${index}`} value={index}>{name}</option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}

      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.where.title}</h2>
          <label className="sv__label">
            {secondVisitCopy.steps.where.townLabel}
            <select className="sv__select" value={venueTown} onChange={(event) => setVenueTown(event.target.value)}>
              <option value="">{secondVisitCopy.labels.unknownTown}</option>
              {towns.map((town) => (
                <option key={town.name} value={town.name}>{town.name}</option>
              ))}
            </select>
          </label>
          <p className="sv__hint">{secondVisitCopy.steps.where.townHint} {TOWNS_ATTRIBUTION}</p>
          <label className="sv__label">
            {secondVisitCopy.steps.where.asOfLabel}
            <input className="sv__input" type="date" value={asOfIso} onChange={(event) => setAsOfIso(event.target.value)} />
          </label>
          <p className="sv__hint">{secondVisitCopy.steps.where.asOfHint}</p>
          <button className="sv__button" type="button" disabled={busy} onClick={() => void run(params)}>
            {secondVisitCopy.headline.title}
          </button>
        </section>
      ) : null}

      {analysis && horizon ? (
        <section className="sv__results">
          <h2>{secondVisitCopy.headline.title}</h2>
          {analysis.secondVisit.enough ? (
            <>
              <p className="sv__big">{percent(horizon.estimate)}</p>
              <p>{secondVisitCopy.headline.kmLabel}, {secondVisitCopy.headline.horizonLabel} {horizon.day}.</p>
              {horizon.defined ? (
                <p>{secondVisitCopy.headline.intervalLabel}: {percent(horizon.lo)} to {percent(horizon.hi)}</p>
              ) : null}
              <p>{secondVisitCopy.headline.naiveLabel}: {percent(analysis.secondVisit.naive)}</p>
              <p className="sv__hint">{secondVisitCopy.headline.naiveNote}</p>
              <p>
                {secondVisitCopy.headline.medianLabel}:{" "}
                {analysis.secondVisit.medianDays === null
                  ? secondVisitCopy.headline.medianNotReached
                  : analysis.secondVisit.medianDays}
              </p>
              <svg className="sv__chart" viewBox="0 0 640 200" role="img" aria-label={secondVisitCopy.headline.kmLabel}>
                <path d={stepPath(analysis.secondVisit.curve, 640, 200)} fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </>
          ) : (
            <p>{secondVisitCopy.refusals.tooFew}</p>
          )}

          {analysis.usingProductionParams ? null : <p className="sv__warn">{secondVisitCopy.honesty.changed}</p>}
          {analysis.warnings.map((line) => (
            <p className="sv__hint" key={line}>{line}</p>
          ))}

          <h3>{secondVisitCopy.slots.title}</h3>
          {analysis.slots.length === 0 ? (
            <p>{secondVisitCopy.slots.missing}</p>
          ) : (
            <>
              <p className="sv__hint">{secondVisitCopy.slots.note}</p>
              <table className="sv__table">
                <thead>
                  <tr>
                    <th>{secondVisitCopy.slots.title}</th>
                    <th>{secondVisitCopy.slots.heatLabel}</th>
                    <th>{secondVisitCopy.slots.fullLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.slots.map((slot) => (
                    <tr key={`${slot.weekday}-${slot.hour}`}>
                      <td>{secondVisitCopy.slots.weekdays[slot.weekday - 1]} {slot.hour}</td>
                      <td>{slot.visits}</td>
                      <td>{slot.full}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>{secondVisitCopy.products.title}</h3>
          {analysis.products.length === 0 ? (
            <p>{secondVisitCopy.products.missing}</p>
          ) : (
            <table className="sv__table">
              <thead>
                <tr>
                  <th>{secondVisitCopy.products.columns.product}</th>
                  <th>{secondVisitCopy.products.columns.customers}</th>
                  <th>{secondVisitCopy.products.columns.median}</th>
                  <th>{secondVisitCopy.products.columns.overdue}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.products.map((product) => (
                  <tr key={product.product}>
                    <td>{product.product}</td>
                    <td>{product.customers}</td>
                    <td>{product.medianGapDays}</td>
                    <td>{product.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>{secondVisitCopy.sliders.title}</h3>
          {SLIDERS.map((slider) => (
            <label className="sv__label" key={slider.key}>
              {slider.label} ({params[slider.key]})
              <input
                className="sv__slider"
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={params[slider.key]}
                onChange={(event) => moveSlider(slider.key, Number(event.target.value))}
              />
            </label>
          ))}
          <button className="sv__button" type="button" onClick={() => { setParams(PRODUCTION_PARAMS); void run(PRODUCTION_PARAMS); }}>
            {secondVisitCopy.sliders.reset}
          </button>

          <h3>{secondVisitCopy.exports.lapsed.name}</h3>
          {exportFiles(analysis).map((file) => (
            <p key={file.file}>
              <button className="sv__button" type="button" onClick={() => save(file.file, file.csv, "text/csv;charset=utf-8")}>
                {file.name}
              </button>
              <span className="sv__hint">{file.note}</span>
            </p>
          ))}
          <button
            className="sv__button"
            type="button"
            onClick={() => save(secondVisitCopy.report.file, reportHtml(analysis), "text/html;charset=utf-8")}
          >
            {secondVisitCopy.report.button}
          </button>
          <p className="sv__hint">{secondVisitCopy.report.note}</p>
          <p className="sv__hint">{timing.modelMs} {secondVisitCopy.labels.modelMs}</p>
        </section>
      ) : null}

      <section className="sv__honesty">
        <h2>{secondVisitCopy.honesty.title}</h2>
        {secondVisitCopy.honesty.body.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {TIGH_CREDIT ? (
          <p>
            {TIGH_CREDIT.line}{" "}
            <a className="prose__link" href={TIGH_CREDIT.href}>{TIGH_CREDIT.name}</a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
```

Two things in there are worth knowing before `tsc` tells you. `params[slider.key]` is a `number` only because every field of `ModelParams` is a number, which is why that type has no booleans in it and must not grow one. And `run` is called from `moveSlider` with the next params rather than reading state, because `setParams` has not landed by the time the call is made and reading `params` there would model the previous position of the slider.

- [ ] **Step 3: Write the coupling checks and the safety greps**

```ts
// lib/tools/second-visit/safety.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The promises on the page, checked against the files rather than against the
 * copy.
 *
 * **This is a source grep and not a render.** Vitest runs in a `node`
 * environment here, so nothing below mounts a component; it reads the files and
 * asserts on their text, the same way `lib/boot.test.ts` greps `BootSequence`.
 * It cannot prove what a browser does. What it can do is fail the moment
 * somebody adds a `fetch` to a tool whose page says nothing leaves the tab.
 *
 * Line endings are normalised first: git hands this checkout CRLF and CI LF for
 * the same file, and a pattern with a bare newline in it would be red on one
 * machine and green on the other.
 */

const ROOT = process.cwd();

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

const files = [...sources("lib/tools/second-visit"), ...sources("app/tools/second-visit")];

/** Comments stripped, so a docblock explaining a rule cannot break it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("nothing leaves the tab", () => {
  const banned: [string, RegExp][] = [
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["sendBeacon", /sendBeacon/],
    ["WebSocket", /new WebSocket/],
    ["EventSource", /new EventSource/],
  ];

  for (const [name, pattern] of banned) {
    it(`never calls ${name}`, () => {
      const offenders = files.filter((file) => pattern.test(code(file)));
      expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
    });
  }

  it("was actually reading files", () => {
    // A grep over an empty list passes. This is the control.
    expect(files.length).toBeGreaterThan(12);
    expect(files.some((f) => f.endsWith("analyse.ts"))).toBe(true);
  });
});

describe("nothing is written to the visitor's machine", () => {
  const banned: [string, RegExp][] = [
    ["localStorage", /localStorage/],
    ["sessionStorage", /sessionStorage/],
    ["indexedDB", /indexedDB/],
    ["document.cookie", /document\.cookie/],
    ["caches", /\bcaches\./],
  ];

  for (const [name, pattern] of banned) {
    it(`never touches ${name}`, () => {
      const offenders = files.filter((file) => pattern.test(code(file)));
      expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
    });
  }

  it("and the page says so, so the claim and the code are checked together", async () => {
    const { secondVisitCopy } = await import("@/content/tools/second-visit");
    expect(JSON.stringify(secondVisitCopy)).toContain("nothing to wipe here");
  });
});
```

```ts
// app/tools/second-visit/SecondVisitTool.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { secondVisitCopy } from "@/content/tools/second-visit";

/**
 * A coupling check on the client component, not a render. Vitest runs in
 * `node` here and there is no jsdom, so nothing below mounts anything. It reads
 * the source and asserts on its text. CRLF is normalised first, because git
 * hands this checkout CRLF and CI LF for the same file.
 */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "SecondVisitTool.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("the island is wired to the things it claims", () => {
  it("was actually read", () => {
    expect(source).toContain("export default function SecondVisitTool");
    expect(source.startsWith('"use client"')).toBe(true);
  });

  it("takes its work through the runner rather than doing it inline", () => {
    expect(source).toContain("makeRunner()");
    expect(source).toContain("dispose()");
  });

  it("rounds the duration to the nearest hundred milliseconds", () => {
    expect(source).toMatch(/Math\.round\(ms \/ 100\) \* 100/);
  });

  it("reports a run with three fields and no fourth", () => {
    const calls = source.match(/trackToolRun\(\{[^}]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) {
      const fields = call
        .replace(/^trackToolRun\(\{/, "")
        .replace(/\}\)$/, "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      expect(fields, call).toHaveLength(3);
      expect(fields[0]).toContain("tool:");
      expect(fields[1]).toContain("outcome:");
      expect(fields[2]).toContain("ms:");
    }
  });

  it("revokes every object URL it creates", () => {
    const created = (source.match(/createObjectURL/g) ?? []).length;
    const revoked = (source.match(/revokeObjectURL/g) ?? []).length;
    expect(created).toBeGreaterThan(0);
    expect(revoked).toBeGreaterThanOrEqual(1);
  });

  it("refuses a file that is too big before reading it", () => {
    expect(source).toContain("MAX_BYTES");
    expect(source).toContain("refusals.tooBig");
  });

  it("says when the numbers are no longer the production model's", () => {
    expect(source).toContain("usingProductionParams");
    expect(source).toContain("honesty.changed");
  });

  it("writes no sentence of its own", () => {
    /**
     * A long string literal with a space in it is prose, and prose in a
     * component is copy that escaped `content/`. Import paths, class names and
     * MIME types have no spaces, so the rule needs no allow-list to maintain.
     */
    const offenders = (source.match(/"[^"\n]{25,}"/g) ?? [])
      .map((literal) => literal.slice(1, -1))
      .filter((text) => text.includes(" "));
    expect(offenders).toEqual([]);
  });

  it("draws every word from the content file", () => {
    expect(source).toContain('from "@/content/tools/second-visit"');
    expect(Object.keys(secondVisitCopy)).toContain("refusals");
  });
});
```

```ts
// app/tools/second-visit/page.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIGH_CREDIT, secondVisit } from "@/content/tools/second-visit";

/** A coupling check on the server component. Not a render; see the note in
 *  `SecondVisitTool.test.ts`. */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "page.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("the page", () => {
  it("was actually read", () => {
    expect(source).toContain("export default function SecondVisitPage");
  });

  it("renders through the shared shell, so the privacy line and the list are there", () => {
    expect(source).toContain("ToolPage");
    expect(source).toContain("tool={tool}");
  });

  it("imports the registry entry rather than restating it", () => {
    expect(source).toContain('from "@/content/tools/second-visit"');
    expect(secondVisit.privacy).toBe("browser");
  });

  it("owns its own stylesheet and nothing else's", () => {
    expect(source).toContain('import "./tool.css"');
    expect(source).not.toContain("globals.css");
  });

  it("carries the credit as an edge in the graph, when there is one", () => {
    if (TIGH_CREDIT) expect(source).toContain("isBasedOn");
    expect(source).toContain("TIGH_CREDIT");
  });

  it("is a server component: the island is imported, not inlined", () => {
    expect(source).not.toContain('"use client"');
    expect(source).toContain("SecondVisitTool");
  });
});
```

```ts
// app/tools/second-visit/run-client.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeRunner } from "./run-client";

/**
 * There is no `Worker` in Node, so this exercises the fallback for real and
 * greps the source for the worker path. That split is honest: the main-thread
 * runner is genuinely tested here, and the worker is a coupling check plus the
 * live run in Task 18, which prints which path ran.
 */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "run-client.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("the runner", () => {
  it("falls back to the main thread where there is no Worker, and says so", async () => {
    expect(typeof Worker).toBe("undefined");
    const runner = makeRunner();
    expect(runner.where).toBe("main");
    const parsed = await runner.parse("customer,date\nc1,2026-01-01\nc1,2026-02-01\n");
    expect(parsed.rows).toBe(2);
    expect(parsed.roles.customer).toBe(0);
    runner.dispose();
  });

  it("builds the worker URL in the form the bundler recognises", () => {
    expect(source).toContain('new URL("./analysis.worker.ts", import.meta.url)');
    expect(source).toContain('type: "module"');
  });

  it("takes the fallback rather than throwing when the worker cannot be built", () => {
    expect(source).toContain("catch");
    expect(source).toContain("mainThreadRunner()");
  });
});
```

- [ ] **Step 4: Write the page and the stylesheet**

```tsx
// app/tools/second-visit/page.tsx
import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { TIGH_CREDIT, secondVisit as tool } from "@/content/tools/second-visit";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import SecondVisitTool from "./SecondVisitTool";
import "./tool.css";

const PATH = toolPath(tool.slug);

const DESCRIPTION =
  "Drop a bookings or orders export and get an honest estimate of how many first-time customers come back, with the uncertainty printed beside it. Runs entirely in your browser.";

export const metadata: Metadata = {
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

/**
 * `/tools/second-visit`.
 *
 * The shell draws the prompt line, the heading, the lede, the privacy line and
 * the "Can't see" list from the registry entry. This file owns the island and
 * the one graph edge the registry has no field for: `isBasedOn`, pointing at
 * the business whose model this is. Both the edge and the credit block come
 * from `TIGH_CREDIT`, so setting that to null removes them together.
 */
export default function SecondVisitPage() {
  return (
    <ToolPage
      tool={tool}
      extraSchema={TIGH_CREDIT ? { isBasedOn: TIGH_CREDIT.href } : undefined}
      talk="If you ran this on a real export, I'd like to know what it got wrong."
    >
      <SecondVisitTool />
    </ToolPage>
  );
}
```

`tool.css` follows `app/tools/headline-check/tool.css`: a header comment naming the file and the rule that a tool owns its own stylesheet, then rules under a `.sv` prefix. The floors it has to meet, because the phone check will name them otherwise:

```css
/* app/tools/second-visit/tool.css
   The tool's own rules, per the toolshed rule that a tool owns
   app/tools/<slug>/tool.css and the shell keeps globals.css. Imported by
   ./page.tsx, so it loads on this route only. It reads the shell's custom
   properties (--green, --bg-panel, --sp-*, --radius, --amber, --red) and
   redefines none of them.

   --green-dim is borderline on the amber and ice themes (app/globals.test.ts),
   so it appears on nothing a visitor has to read. Every animation is behind
   prefers-reduced-motion. */

.sv { max-width: 68ch; margin-top: var(--sp-5); }
.sv__step, .sv__results, .sv__honesty { display: grid; gap: var(--sp-2); margin-top: var(--sp-5); }
.sv__label { display: grid; gap: var(--sp-1); color: var(--green); font-size: 0.82rem; }
.sv__input, .sv__select, .sv__file {
  font-size: 16px;
  min-height: 44px;
  max-width: 100%;
  background: var(--bg-panel);
  border: 1px solid var(--green-line);
  border-radius: var(--radius);
  color: var(--green-bright);
  text-overflow: ellipsis;
}
.sv__button {
  min-height: 44px;
  min-width: 44px;
  font-size: 16px;
  background: var(--bg-panel);
  border: 1px solid var(--green-line);
  border-radius: var(--radius);
  color: var(--green-bright);
}
.sv__slider { min-height: 44px; width: 100%; }
.sv__big { font-size: 2.4rem; line-height: 1.1; color: var(--amber-bright); }
.sv__hint, .sv__message, .sv__warn { color: var(--green); font-size: 0.86rem; }
.sv__warn { color: var(--amber); }
.sv__chart { width: 100%; height: auto; color: var(--amber); }
.sv__table { display: block; overflow-x: auto; max-width: 100%; }

@media (prefers-reduced-motion: no-preference) {
  .sv__results { animation: sv-in 240ms ease-out both; }
  @keyframes sv-in { from { opacity: 0; } to { opacity: 1; } }
}
```

The `16px` on inputs is not a taste: iOS zooms the whole page when a smaller one is focused. The `44px` floors are the phone check's, and the `overflow-x: auto` on the table and the grid is what stops a wide table setting the document's minimum width at 320.

- [ ] **Step 5: Build, and run everything**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run 2>&1 | tail -6
npm run build 2>&1 | tail -12
```

Expected: `tsc` silent, the whole suite green, and a build that compiles with `/tools/second-visit` in the route list. **Look for the worker in the build output**: Next reports the chunk. If the build warns about the worker URL, record the exact warning; a worker that silently does not build is the case `run-client.ts`'s fallback exists for, and knowing which path shipped is Task 18's job.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add app/tools/second-visit lib/tools/second-visit/safety.test.ts
git commit -m "feat(second-visit): the page, the worker, and a runner that works without one"
```

---

### Task 16: Prove the tests can fail, then wire the guards into the mutation check

**Files:**
- Temporarily modify then restore: `lib/tools/second-visit/model.ts`
- Modify: `scripts/mutation-check.mjs` (nineteen entries)

**Interfaces:**
- Consumes: every module from Tasks 3 to 15
- Produces: nineteen mutation rows, and the evidence that the suite goes red when this plan's central decisions are broken

A guard that survives its own mutation is decoration, and this repository has shipped one of those before. This task breaks one thing by hand, watches it fail, puts it back, and then hands the rest to the script.

**The one chosen for the demonstration, and why.** Task 12 Step 3 already broke `shrinkK` and watched the oracle notice, which is the single most important demonstration in the plan and it is already recorded. So the hand-run here is a different one: the ordering of `retention_verdict`'s branches. It is the decision the migration says took a wrong turn to find, it is invisible in review because both orderings compile and both produce plausible verdicts, and it is the sort of thing a later "tidy up" reorders without thinking.

- [ ] **Step 1: Break the branch order and watch the suite notice**

In `lib/tools/second-visit/model.ts`, move the `visiting` branch below the on-time branch:

```ts
  if (n <= 0) return "prospect";
  if (!usable(silenceRatio) || silenceRatio < p.overdueRatio) {
    if (n >= p.loyalVisits) return "loyal";
    if (n === 1) return "first_time";
    return "repeat";
  }
  if (lowEvidenceFar === true && committed !== true) return "visiting";
```

Then:

```bash
cd "$WT"
npx vitest run lib/tools/second-visit/model.test.ts lib/tools/second-visit/oracle.test.ts 2>&1 | tail -30
```

Expected: **FAIL**, and specifically these, not something vague:

- `retentionVerdict > decides visiting before lateness`: the second case, `retentionVerdict(1, 0.2, ...)`, now returns `first_time`, because a ratio of 0.2 is on time and the on-time branch now runs first.
- `the whole pipeline agrees with postgres > agrees on lifecycle`: every fixture customer who is far away, thin on history and not yet late flips from `visiting` to `first_time`.

That second failure is the one that matters. It is the oracle catching a semantic change that every unit test could plausibly have missed, and it is what the whole of Task 11 was for. **If the oracle stays green while `model.test.ts` goes red, the pipeline fixture has no `visiting` customer in it and Task 11 Step 5's branch check was not really done.**

Paste both failure lines into the ledger. That paste is the observation.

- [ ] **Step 2: Put it back and confirm the failure goes with it**

```bash
cd "$WT"
git checkout -- lib/tools/second-visit/model.ts
npx vitest run lib/tools/second-visit/model.test.ts lib/tools/second-visit/oracle.test.ts 2>&1 | tail -5
```

Expected: PASS. The pair of runs is `CLAIMS.md` rule 3, revert to confirm.

- [ ] **Step 3: Check every anchor before adding a row**

Every anchor is a regex tolerant of CRLF, which means single-line and never containing `\n`, because `scripts/mutation-check.mjs` has been bitten once by a bare newline against a CRLF file. Tasks 3 to 14 may have been typed with different spacing, so check first:

```bash
cd "$WT"
node -e '
const { readFileSync } = require("node:fs");
const checks = [
  ["lib/tools/second-visit/model.ts", /  shrinkK: 2,/],
  ["lib/tools/second-visit/model.ts", /  smoothStrength: 20,/],
  ["lib/tools/second-visit/model.ts", /  return Math\.max\(1\.0, 1\.0 \+ \(prior - 1\.0\) \* \(p\.blendK \/ \(p\.blendK \+ n\)\)\);/],
  ["lib/tools/second-visit/model.ts", /  return Math\.min\(p\.gapCapDays, Math\.max\(p\.gapFloorDays, product\)\);/],
  ["lib/tools/second-visit/model.ts", /  if \(lowEvidenceFar === true && committed !== true\) return "visiting";/],
  ["lib/tools/second-visit/model.ts", /  if \(!usable\(lat1\) \|\| !usable\(lng1\) \|\| !usable\(lat2\) \|\| !usable\(lng2\)\) return null;/],
  ["lib/tools/second-visit/model.ts", /  if \(sameCountry === false\) return "visitor";/],
  ["lib/tools/second-visit/model.ts", /  return Math\.min\(p\.seasonCap, Math\.max\(p\.seasonFloor, 1\.0 \/ monthIndex\)\);/],
  ["lib/tools/second-visit/numbers.ts", /  return sorted\[lo\] \+ \(sorted\[hi\] - sorted\[lo\]\) \* \(idx - lo\);/],
  ["lib/tools/second-visit/numbers.ts", /  return Number\(value\.toFixed\(digits\)\);/],
  ["lib/tools/second-visit/numbers.ts", /    if \(value >= bound\) bucket\+\+;/],
  ["lib/tools/second-visit/customers.ts", /      if \(gap > 0\) gaps\.push\(gap\);/],
  ["lib/tools/second-visit/customers.ts", /    const completed = ordered\.filter\(\(b\) => b\.status === "completed"\);/],
  ["lib/tools/second-visit/km.ts", /    const atRisk = sorted\.filter\(\(o\) => o\.days >= day\)\.length;/],
  ["lib/tools/second-visit/km.ts", /  const lower = Math\.exp\(-Math\.exp\(centre \+ halfWidth\)\);/],
  ["lib/tools/second-visit/exports.ts", /  const guarded = FORMULA_START\.test\(value\) \? "\x27" \+ value : value;/],
  ["lib/tools/second-visit/report.ts", /    \.replace\(\/</g, "&lt;"\)/],
  ["lib/tools/second-visit/analyse.ts", /export const MIN_CUSTOMERS = 20;/],
  ["lib/tools/second-visit/analyse.ts", /  return \(Object\.keys\(b\) as \(keyof ModelParams\)\[\]\)\.every\(\(key\) => a\[key\] === b\[key\]\);/],
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

Expected: nineteen `ok` lines and exit 0. A `MISS` means the anchor has to be rewritten against the file as it was actually typed. **Never loosen the file to fit the anchor**, and never carry a `MISS` into the run: the script reports an unmatched anchor as `ANCHOR-MISS` and counts it as a survivor, which is the right behaviour.

- [ ] **Step 4: Add the nineteen rows**

Append to the `MUTATIONS` array in `scripts/mutation-check.mjs`, after whatever the previous sub-project added:

```js
  // ── second visit: the model, the maths, and the two guards on the files out ──
  {
    name: "second visit weakens empirical Bayes, so one lucky gap becomes a cadence",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  shrinkK: 2,/,
    replace: "  shrinkK: 1,",
  },
  {
    name: "second visit lets one returning customer make a whole cell a certainty",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  smoothStrength: 20,/,
    replace: "  smoothStrength: 0,",
  },
  {
    name: "second visit lets a distance prior become a discount, so far customers look overdue sooner",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  return Math\.max\(1\.0, 1\.0 \+ \(prior - 1\.0\) \* \(p\.blendK \/ \(p\.blendK \+ n\)\)\);/,
    replace: "  return 1.0 + (prior - 1.0) * (p.blendK / (p.blendK + n));",
  },
  {
    name: "second visit drops the 540 day cap, so a visitor gets an unbounded window",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  return Math\.min\(p\.gapCapDays, Math\.max\(p\.gapFloorDays, product\)\);/,
    replace: "  return Math.max(p.gapFloorDays, product);",
  },
  {
    name: "second visit drops the visiting verdict, so a day-tripper is filed as a pending conversion",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  if \(lowEvidenceFar === true && committed !== true\) return "visiting";/,
    replace: "  if (false && committed !== true) return \"visiting\";",
  },
  {
    name: "second visit loses the strict distance guard, so no address becomes a point off Africa",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  if \(!usable\(lat1\) \|\| !usable\(lng1\) \|\| !usable\(lat2\) \|\| !usable\(lng2\)\) return null;/,
    replace: "  if (false) return null;",
  },
  {
    name: "second visit flips the border test, so everyone at home is a visitor",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  if \(sameCountry === false\) return "visitor";/,
    replace: "  if (sameCountry === true) return \"visitor\";",
  },
  {
    name: "second visit stops inverting the month index, so a quiet month shortens the window",
    file: "lib/tools/second-visit/model.ts",
    pattern: /  return Math\.min\(p\.seasonCap, Math\.max\(p\.seasonFloor, 1\.0 \/ monthIndex\)\);/,
    replace: "  return Math.min(p.seasonCap, Math.max(p.seasonFloor, monthIndex));",
  },
  {
    name: "second visit takes the nearest rank instead of interpolating, moving every cohort median",
    file: "lib/tools/second-visit/numbers.ts",
    pattern: /  return sorted\[lo\] \+ \(sorted\[hi\] - sorted\[lo\]\) \* \(idx - lo\);/,
    replace: "  return sorted[lo];",
  },
  {
    name: "second visit rounds half up instead of away from zero, disagreeing with numeric",
    file: "lib/tools/second-visit/numbers.ts",
    pattern: /  return Number\(value\.toFixed\(digits\)\);/,
    replace: "  return Math.round(value * 10 ** digits) / 10 ** digits;",
  },
  {
    name: "second visit makes the overdue buckets exclusive at the bottom, shifting every reactivation rate",
    file: "lib/tools/second-visit/numbers.ts",
    pattern: /    if \(value >= bound\) bucket\+\+;/,
    replace: "    if (value > bound) bucket++;",
  },
  {
    name: "second visit counts a zero day gap, so a double booking halves a cadence",
    file: "lib/tools/second-visit/customers.ts",
    pattern: /      if \(gap > 0\) gaps\.push\(gap\);/,
    replace: "      gaps.push(gap);",
  },
  {
    name: "second visit lets a no show into the rhythm, which customer_metrics does not",
    file: "lib/tools/second-visit/customers.ts",
    pattern: /    const completed = ordered\.filter\(\(b\) => b\.status === "completed"\);/,
    replace: "    const completed = ordered.filter(attended);",
  },
  {
    name: "second visit drops censored customers from the at-risk set, which is the naive figure again",
    file: "lib/tools/second-visit/km.ts",
    pattern: /    const atRisk = sorted\.filter\(\(o\) => o\.days >= day\)\.length;/,
    replace: "    const atRisk = sorted.filter((o) => o.days >= day && o.returned).length;",
  },
  {
    name: "second visit puts a normal interval on a proportion, so a bound escapes nought and one",
    file: "lib/tools/second-visit/km.ts",
    pattern: /  const lower = Math\.exp\(-Math\.exp\(centre \+ halfWidth\)\);/,
    replace: "  const lower = survival - curve.z * sigma * survival;",
  },
  {
    name: "second visit lets a formula out of a csv cell into somebody's spreadsheet",
    file: "lib/tools/second-visit/exports.ts",
    pattern: /  const guarded = FORMULA_START\.test\(value\) \? "'" \+ value : value;/,
    replace: "  const guarded = value;",
  },
  {
    name: "second visit stops escaping a less-than, so an identifier becomes markup in the saved report",
    file: "lib/tools/second-visit/report.ts",
    pattern: /    \.replace\(\/</g, "&lt;"\)/,
    replace: "    .replace(/</g, \"<\")",
  },
  {
    name: "second visit prints a survival curve for five customers as though it meant something",
    file: "lib/tools/second-visit/analyse.ts",
    pattern: /export const MIN_CUSTOMERS = 20;/,
    replace: "export const MIN_CUSTOMERS = 1;",
  },
  {
    name: "second visit always claims the production constants, however far a slider has moved",
    file: "lib/tools/second-visit/analyse.ts",
    pattern: /  return \(Object\.keys\(b\) as \(keyof ModelParams\)\[\]\)\.every\(\(key\) => a\[key\] === b\[key\]\);/,
    replace: "  return true;",
  },
```

Three guards deliberately get no row, each for the same reason: a second door into a module the nineteen already cover, at the cost of a full suite run each. The town normaliser is held by four cases in `towns.test.ts`, the CSV preamble skip by two in `csv.test.ts`, and the amount parser's decimal-comma branch by two in `mapping.test.ts`. Add a row if a later change touches one.

**Two rows are worth watching more than the others.** The `smoothStrength` row and the `widthBucket` row are the only two whose only bite is the oracle: no unit test passes a strength of 0 or a bucket boundary directly, so if either comes back `GREEN` the pipeline golden file is not connected to `p_return` and that column is untested.

- [ ] **Step 5: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs 2>&1 | tail -30
```

Expected: every second-visit row prints `RED`, and the last line reads `N/N mutations caught.` with no `Survived` block. An `ANCHOR-MISS` is a failure, not a skip.

This run is long. Each mutation runs the whole suite and there are eighty-odd rows before these nineteen, so budget an hour and do not interleave it with anything that writes to the worktree: the script restores each file by writing the original text back, and a concurrent edit in the same file would be lost.

Note that the suite is now slower than it was, because `oracle.test.ts` reads two golden files and runs the whole pipeline over 400 customers. Time one run first (`npx vitest run --reporter=dot`) and multiply, so the hour is a number rather than a hope.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(second-visit): mutate nineteen guards and prove each one is load-bearing"
```

---

### Task 17: The phone check, at 390 and 320, on a real engine

**Files:**
- Modify: whatever the run names, and only in `app/tools/second-visit/tool.css`

**Interfaces:**
- Consumes: `scripts/phone-check.mjs` (F3), the production build
- Produces: the phone evidence for T4, pasted verbatim into the ledger

The rule this site refuses to fudge: **a resized desktop window does not count.** WebKit at 390 and at 320 because that is what an iPhone renders with, and a throttled Chromium Pixel beside it.

**Predictions, written before the run so the run can prove them wrong (`CLAIMS.md` rule 2). All five are guesses from reading the CSS and none has been observed:**

1. **`overflow`: the likeliest failure, and the likeliest culprit is the column mapper.** Fourteen `<select>` elements each labelled with a role name, in a column, is fine; the thing that is not is a `<select>` whose widest `<option>` is a long header from somebody's export. A select sizes to its widest option in some engines. `.sv__select` needs `max-width: 100%` and the option text needs truncating, and if the prediction is wrong the run names `.sv__select`.
2. **`tap-target`: pass, but the range inputs are the ones to watch.** `.sv__slider` carries `min-height: 44px`, and whether the script measures the input or its thumb is unknown behaviour worth reading in `auditInPage` rather than guessing at.
3. **`input-font`: pass.** `.sv__input`, `.sv__select` and `.sv__file` are a literal `16px`. Anything under that and iOS zooms the page on focus, which on this route would happen while somebody is picking a column.
4. **`contrast`: pass, and least certain of the four.** The honesty paragraphs are body colour and the hints are `--green`, following T1's measured finding that `--green-dim` fails on two of the three themes. `.sv__big` at 2.4rem has never been sampled through the scanline overlay and the shader on this route.
5. **The check cannot see the tool at all.** It measures the page as it opens: the honesty block and the file step, and nothing else, because the column step and the results only exist after a file is read. That is a real gap and Step 3 closes it by hand.

- [ ] **Step 1: Confirm CI needs no editing**

```bash
cd "$WT"
grep -n "phone-check" .github/workflows/ci.yml
```

Expected: the job runs `--from-sitemap`. A live tool is in the sitemap because `liveTools` puts it there, so `/tools/second-visit` joins the phone job the moment Task 1's `status: "live"` merges. **Change nothing.** If the job names routes with `--routes` instead, add `/tools/second-visit` alphabetically and nothing else, and record that this plan's file-structure table was wrong.

- [ ] **Step 2: Build and serve**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -5
(npm start > .t4-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/second-visit > /dev/null && break; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools/second-visit
```

Expected: `200`. **Kill any old `next start` first**, and mean it: this repository has already had a run where an earlier server held port 3000, the new one died with `EADDRINUSE`, `.next` was rebuilt underneath the old process, and the phone check reported sixty tap-target failures that were perfectly true facts about a page with no CSS. The check now fails such a route as `assets`, but the habit is cheaper than the diagnosis.

- [ ] **Step 3: Run the check and keep the output**

```bash
cd "$WT"
mkdir -p .phone-check
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/second-visit --out .phone-check | tee .phone-check/t4-first-run.txt
echo "exit: $?"
```

Expected: a header naming `1 route(s) x 3 profiles`, then whatever it finds. **Paste the whole output into the ledger under "T4 first phone-check run" before changing a single line.** That paste is the observation; everything after it is a fix.

Then close the gap named in prediction 5, by hand. With the built site still serving, open the route in a real WebKit at 320 (`npx playwright open --device="iPhone 13" http://localhost:3000/tools/second-visit` opens at 390; set 320 in the inspector) and:

- Press the demo button. Look at the fourteen column selects with a real header in them.
- Scroll to the results. Look at the slot table and the reorder table: both are inside `overflow-x: auto`, and the question is whether the container is the one scrolling or the document.
- Look at the sliders. Drag one and watch whether the results reflow underneath your thumb in a way that makes the next drag land somewhere else.
- Look at the SVG curve at 320. It is `viewBox`ed at 640 wide, so it should scale; confirm it does rather than clipping.

Write down what you see. If a control is under a thumb's width there, it is a `tool.css` fix exactly as if the script had named it.

- [ ] **Step 4: Fix each named failure in the file that owns it**

Every fix goes in `app/tools/second-visit/tool.css`. The thresholds in the script are not touched, and `app/globals.css` is not touched: a shell failure on this route is a shell failure on every route, and that is F3's ground. If the run names one, record it in the ledger and leave it.

A `contrast` failure is fixed by using a lighter token on that element, never by editing the token: the tokens are proven on all three themes in `app/globals.test.ts` and other surfaces depend on them.

An `overflow` failure naming `.sv__select` is prediction 1 coming true, and the fix is on that element (`max-width: 100%` plus `text-overflow: ellipsis`), not on the container.

- [ ] **Step 5: Rebuild, re-run, confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .t4-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/second-visit > /dev/null && break; done
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/second-visit --out .phone-check
echo "exit: $?"
pkill -f "next start" || true
```

Expected: `exit: 0` and no `FAIL` lines.

What this proves: on WebKit at 390 and 320 and on a throttled Chromium Pixel, the route has no horizontal overflow, no input under 16px, no tap target under 44px and no sampled text contrast under 4.5:1, in the state the page opens in. What it cannot see: the column mapper, the results, the sliders, a real file, whether any of it is pleasant to use, and a real iPhone GPU.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add app/tools/second-visit/tool.css
git commit -m "fix(second-visit): meet the phone floors the check named"
```

If the run was clean and nothing changed, skip the commit and say so in the ledger. A clean first run is a finding worth recording, not a step to fake.

---

### Task 18: Documentation, the pull request and the live check

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above, and the `check`, `mutation` and `phone` CI jobs required on `main`
- Produces: `/tools/second-visit` live on `https://fergusoreilly.dev`, with the deployment id and the evidence in the ledger

- [ ] **Step 1: The paragraphs in AGENTS.md**

In "Stack and conventions", at the end of the bullet F3 added about `content/tools/` and `ToolPage`, append:

```markdown
  `/tools/second-visit` runs Tigh Sauna's retention model on a visitor's own bookings export, in
  their own tab. **The claim on the page is unusual for this site and it is earned by exactly one
  test.** `lib/tools/second-visit/oracle.test.ts` runs the TypeScript port over a committed
  fixture and compares it, at 1e-9, against golden files that a real Postgres 16 produced from
  migration 0300's own SQL, which is committed verbatim with its provenance at
  `lib/tools/second-visit/oracle/0300-functions.sql`.
  `node scripts/second-visit/compare.mjs` regenerates or re-verifies those golden files against
  Postgres in Docker; it is a deliberate command like `scripts/mutation-check.mjs` and is not in
  CI. **Neither the script nor the test ever reads the port to decide what the right answer is.**
  Regenerating a golden file to make a failing test pass is the one move that turns the whole thing
  into decoration, and it is the reason `--write` and the verify mode are separate.

  Two things about the model are load-bearing and easy to undo. **Four of its inputs are not in
  migration 0300 at all**: `visits`, `visit_cadence_days`, `days_to_second_visit` and
  `days_since_last_visit` come from `analytics.customer_metrics` in migration 0070, and each has a
  detail that changes the answer (a no-show is a visit but not part of a rhythm; a cadence drops
  zero-day gaps and rounds to one decimal). `lib/tools/second-visit/customers.ts` is where those
  live and its docblock names the source. And **silence is measured to the file's own last date,
  not to today**, because an export is a snapshot and using today makes every customer look lapsed
  by the age of the download.

  Spike S3 ruled DuckDB out of this tool: 8.1 MB gzipped and an 82 second median load at Slow 4G,
  against a phone rule that does not bend. The macros it wrote are kept at
  `oracle/0300-macros.sql` as reference text and nothing executes them. Do not reintroduce the
  dependency to re-prove an equality that record already carries.

  Nothing on this route touches the network or the visitor's storage, and
  `lib/tools/second-visit/safety.test.ts` greps both directories for `fetch`, `XMLHttpRequest`,
  `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` and `caches`. The
  saved HTML report is held to the same rule and has no script, no stylesheet and no image in it,
  so it opens from a `file://` URL with the wifi off.
```

- [ ] **Step 2: Update PROGRESS.md and the ledger**

`docs/PROGRESS.md`: tick T4 and add a decision-log line naming the oracle's two levels and its tolerance, the four inputs taken from migration 0070, the as-of rule, the Kaplan-Meier headline with the complementary log-log interval, the season factor being off under twelve months, and the two deviations from the design recorded in this plan (the slot grid in place of contours, and reachability defaulting to 1.0 when the file is silent about consent).

The ledger: set the T4 row to `**pr**` and put the observations in the Log, each labelled with its rung:

```markdown
- 2026-09-04: T4 built. Observed: tsc clean; N tests passing (was M at baseline); the oracle test
  compares the port against golden files a real Postgres 16 wrote from migration 0300, over about
  700 scalar tuples and 400 customer rows, and the largest disagreement anywhere is <X>, against a
  1e-9 tolerance and S3's measured numeric-versus-double figure of 1.14e-13. Moving `shrinkK` from
  2 to 3 turned the oracle red on base_gap_days and expected_gap_days and reverting turned it green
  again; reordering `retention_verdict`'s visiting branch turned it red on lifecycle. The mutation
  check caught all nineteen second-visit guards. The phone check passed on /tools/second-visit at
  390, 320 and the throttled Pixel. Not verified at this point: anything on the live site, whether
  the work ran in a Web Worker or on the main thread in a real browser, and any real export.
```

- [ ] **Step 3: Push and open the pull request**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(second-visit): record the oracle, the four borrowed inputs and the T4 evidence"
git push -u origin toolshed/t4-second-visit
gh pr create --title "T4: Second Visit, a real retention model on your own export, in your own tab" --body "$(cat <<'BODY'
Adds `/tools/second-visit`.

Drop a bookings or orders export, say which column is which and which town the business is in, and
get back how many first-time customers actually come back, with the uncertainty printed beside the
number rather than hidden behind it. Nothing leaves the tab.

**The headline is a Kaplan-Meier estimate with right-censoring, not a ratio.** The figure every
dashboard shows is `one-visit customers / all customers`, and it counts somebody who first came
last week as somebody who never returned, which makes retention look worse the faster you grow. The
page prints both, and the interval on the real one is the complementary log-log one over
Greenwood's variance, so neither bound has to be clipped into the range and "we do not know" reads
as what it is.

**The model is Tigh Sauna's, ported, and the port is checked rather than asserted.** Twelve
`language sql` functions from that product's migration 0300, in TypeScript, with the four inputs it
takes from migration 0070's `customer_metrics` reproduced beside them.
`lib/tools/second-visit/oracle.test.ts` runs the port over a committed fixture and compares it at
1e-9 against golden files that a real Postgres 16 produced from the SQL itself, committed verbatim
with its provenance. `scripts/second-visit/compare.mjs` regenerates or re-verifies those files
against Postgres in Docker. Neither ever reads the port to decide the right answer.

Spike S3 ruled DuckDB out for this tool (8.1 MB gzipped, 82 second median load at Slow 4G) and its
macros are kept as reference text that nothing executes. No new dependency.

**What the page is not allowed to say, and a test that enforces it.** No "validated", no
"predicts", no "AI". The distance priors are stated assumptions from one venue rather than fitted
parameters, the bands were drawn for a rural Irish sauna, and nobody has ever scored the verdicts
against what the customers went on to do. All three are on the page in those words and
`lib/tools/second-visit/copy.test.ts` is the guard.

Nineteen new guards, nineteen mutation rows, all caught. The phone check passes at 390 and 320 on
WebKit and on a throttled Chromium Pixel.

Not verified in this PR: anything on the live site, whether the analysis ran in a Web Worker or fell
back to the main thread in a real browser, how long a large real export takes on a phone, and any
export that was not generated by this repository. The post-deploy checks follow the merge.
BODY
)"
```

Expected: the PR opens and the `check`, `mutation` and `phone` jobs start. Wait for all three green. A red `mutation` job with a `Survived` line is a guard that does nothing, and it is fixed by making the test bite, never by deleting the row.

- [ ] **Step 4: Merge, then find the deployment the way AGENTS.md says**

```bash
gh pr merge --squash --delete-branch=false
sleep 20
curl -s "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&target=production&limit=3" \
  -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" | head -c 2000
```

Then read `readyState`, `aliasAssigned` and `meta.githubCommitSha` from `v13/deployments/<id>`. Expected: `READY`, `aliasAssigned` true, and the SHA equal to the squash-merge commit. **Do not** run `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building", and do not trust the CLI's exit code. The `teamId` is not optional: without it the listing is scoped to the wrong account and comes back empty, which reads like a failed deploy.

- [ ] **Step 5: Drive the whole flow on the live site, and watch the network while you do**

A 200 on the route is not a pass. This drives the demo end to end, reads the numbers off the page, and captures every request the context makes.

```bash
cd "$WT"
node --input-type=module -e "$(cat <<'JS'
import { chromium, devices } from "playwright";

const browser = await chromium.launch();
const context = await browser.newContext(devices["Pixel 7"]);
const page = await context.newPage();
const requests = [];
page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text()); });

await page.goto("https://fergusoreilly.dev/tools/second-visit", { waitUntil: "networkidle" });

console.log("privacy line:", await page.locator(".tool__privacy").innerText());
console.log("cant see:", await page.locator(".tool__cantsee-item").count(), "items");

await page.getByRole("button", { name: /made-up sauna/i }).click();
await page.locator(".sv__select").first().waitFor();
console.log("columns offered:", await page.locator(".sv__select").count());

await page.getByRole("button", { name: /How many come back/i }).click();
await page.locator(".sv__big").waitFor({ timeout: 60_000 });

console.log("headline:", await page.locator(".sv__big").innerText());
const text = await page.locator(".sv").innerText();
console.log("naive line:", /dashboard would show you: [^\n]+/.exec(text)?.[0]);
console.log("interval line:", /95% interval: [^\n]+/.exec(text)?.[0]);
console.log("median line:", /Half of those who return[^\n]+/.exec(text)?.[0]);

// Which path actually ran. The page prints it beside the row count.
console.log("runner:", /\((worker|main)\)/.exec(text)?.[1] ?? "not printed");

// Move a slider and confirm the honesty sentence appears.
await page.locator(".sv__slider").first().evaluate((el) => {
  const input = el;
  input.value = String(Number(input.max));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1500);
console.log("changed warning present:", (await page.locator(".sv__warn").count()) > 0);

const offSite = requests.filter((u) => !u.includes("fergusoreilly.dev"));
console.log("off-site requests:", JSON.stringify(offSite));

await browser.close();
JS
)"
```

Expected, and each line is the observation for one claim:

- `privacy line:` the browser sentence from `toolShellCopy`, and `cant see: 6 items`. **The shell is doing its job.**
- `columns offered: 14`. The mapper found the demo file's header.
- `headline:` a percentage. `naive line:` a different, lower percentage. **Those two numbers being different is the whole tool**; if they are equal, the censoring is not happening and the curve has collapsed into the ratio.
- `interval line:` two percentages either side of the headline.
- `median line:` either a number of days or the "not reached" sentence. Both are correct answers and which one appears is a fact about the demo file.
- `runner:` **`worker` or `main`, and this is the one line that settles a question no test in the repository can reach.** If it says `main`, the worker did not build, the tool still works, and that is a finding for the ledger rather than a fault. Say which one it was; do not write "runs in a worker" without this line.
- `changed warning present: true` after a slider moves. **The credit's claim is only true at the production constants**, and this is the check that the page stops making it.
- `off-site requests: []`, or nothing but the PostHog ingest path. **This is the "nothing leaves this tab" promise, checked on the wire rather than in the copy.**

Then the saved report, by hand, because a downloaded file is not something a script should be trusted to judge:

- On the live page, press the report button, disconnect the network, and open the saved file. It must render fully. Then view its source and confirm there is no `<script>`, no `<link>`, no `<img>`.
- Open one of the three CSVs in a spreadsheet and confirm that a cell beginning with `=` shows as text rather than evaluating.

- [ ] **Step 6: Try it on one real export, which nothing has done**

Every test above ran on files this repository generated. The header vocabulary in `mapping.ts` and the shapes in `csv.ts` are written from the format rather than copied from a live file, and that is the largest single guess in this plan.

Get one real bookings or orders export, from any source, and load it into the page on the live site. Then write down:

- Whether the column guess was right, and which roles it missed. Every miss is a pattern for `HEADER_WORDS` and a case in `mapping.test.ts` before it is called fixed.
- How many rows were ignored and why, from the counts line. A large `badDate` count means the date style was decided wrongly, which is the one guess `detectDateStyle` makes and prints.
- How many towns matched. A low share means the town column is an address line rather than a town, which is a finding about the format rather than about the table.
- The wall clock from pressing the button to seeing a number, and the row count, so there is one real measurement of what this costs on a real file. Everything said about performance until this line is a guess.

**Do not paste any part of the export into a commit, an issue or the ledger.** It is other people's customers. Numbers about it are fine; rows are not.

- [ ] **Step 7: Check the event landed and carries nothing**

In PostHog, look for `tool_run` with `tool: "second-visit"` from the runs above, within a few minutes. There should be one per completed analysis, one per refusal, and none for loading a file. Confirm the payload carries `tool`, `outcome` and `ms` and nothing else, and that `ms` is a multiple of 100. A column name, a row count or a town in it is a stop-and-fix. If pageviews are arriving and this is not, read the `cookieless_server_hash_mode` note in AGENTS.md before blaming the tool.

- [ ] **Step 8: Close the ledger**

Set the T4 row to `**live**` with the deployment uid, and write the final log line stating both halves:

```markdown
- 2026-09-04: T4 live. Verified on https://fergusoreilly.dev/tools/second-visit by driving the demo
  end to end in a Pixel 7 context: the shell printed the browser privacy line and six "can't see"
  items, the mapper offered fourteen columns, the headline read <X>% against a naive <Y>%, the
  interval read <lo> to <hi>, the median <was / was not> reached, moving a slider made the "no
  longer the production model" sentence appear, and the context made no off-site request beyond the
  analytics ingest path. The analysis ran <in a worker / on the main thread>. The saved report
  opened from disk with the network off and contains no script, link or image. The tool_run event
  arrived with slug, outcome and milliseconds only, rounded to 100 ms.
  One real export was read: <R> rows, <U> used, <E> ignored, <T>% of towns matched, <M> ms to model.
  Not verified: any browser other than Chromium on the live run (WebKit is covered by the phone
  check for layout only); a file larger than <N> rows; whether the verdicts are right, which no test
  in this repository can settle and which the page says plainly; and the golden files against a
  Postgres other than 16, since that is the image the compare script pins.
```

- [ ] **Step 9: Commit the ledger straight to main**

```bash
cd /c/Dev/fergus-portfolio
git checkout main && git pull
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(ledger): T4 second visit is live, with what was and was not verified"
git push
```

Docs-only commits may land on `main` directly (AGENTS.md, Commands).

**One thing a store would add here, written down rather than built.** If Upstash is ever provisioned, the saved report could get a short URL so somebody could send it to a colleague instead of attaching a file. That would mean the report leaving the tab, which contradicts the privacy line as it currently stands, so it is a change to the promise as well as to the code and it needs Fergus rather than an implementer. Nothing else in this tool wants a store.

---

## Self-review

Run against the spec with fresh eyes, per the writing-plans skill, after the tasks were written. Gaps found were fixed inline before this plan was saved; each is listed with what changed.

**1. Spec coverage.** Walking design section 6, T4, clause by clause, plus the clauses sections 2, 5, 8 and 9 apply to every tool:

| Spec clause | Task |
|---|---|
| `/tools/second-visit` | 15 |
| "Drop a bookings or orders export" | 5 (the reader), 15 (the input) |
| "it is parsed in a worker" | 15 (`analysis.worker.ts`, and `run-client.ts`'s fallback), 18 Step 5 (which one actually ran) |
| "map customer, date, amount, optionally slot time, capacity, cancelled, town, product" | 6, and the mapper adds status, country, party, credits, consent, email and phone for the reasons in that task |
| "the production model, ported to TypeScript" | 4 (the twelve functions), 8 (the four inputs 0300 does not define) |
| "proven equal to the production SQL row for row" | 11 (the fixture, the SQL, the golden files), 12 (the test at 1e-9) |
| "the macros stay in the repo as the oracle" | 2 (`0300-macros.sql`, with the deviation stated) |
| "`compare.mjs` is the regression test at 1e-9" | 11 (the script), 12 (the tolerance) |
| "expected gap by empirical Bayes (k = 2, the same constant as 0300)" | 4 (`shrink`, `blendPrior`), and a mutation row on `shrinkK` |
| "silence ratio" | 10 |
| "a Kaplan-Meier time-to-second-visit with right-censoring beside the naive one-and-done figure" | 9 (the maths), 10 (over the file), 15 (both printed) |
| "distance bands from a bundled table of Irish town centroids" | 7 |
| "the verdicts (visiting, dormant, committed idle, squeezed)" | 4 (the branches), 8 (squeeze and dormancy), 12 (each present in the fixture) |
| "every constant a slider" | 4 (`ModelParams`), 15 (`SLIDERS`), and the honesty sentence when one moves |
| "terrain if there are slots" | 8 and 15, **as a heat grid rather than contours**; the deviation and its reason are in "Two deviations from the design" |
| "reorder radar if there are products" | 10, 15 |
| "three CSVs out (lapsed regulars, second-visit nudges, stall risks)" | 13 |
| "a self-contained HTML report the visitor can save and reopen" | 14 |
| "Credited to Tigh Sauna, with a link" | 1 (`TIGH_CREDIT`, one value), 15 (the block and the `isBasedOn` edge) |
| "Can't see: why anyone left, tourists without a town, seasonality under a year (disabled, and it says so)" | 1 (six lines, those three among them), 10 (the season factor really is off under twelve months) |
| Demo state, never an empty form (section 6 preamble) | 11 (the generator), 15 (the button) |
| `tool_run` with slug and outcome, never the input (section 6, F3) | 15, and the coupling test that counts the payload's fields |
| Every hosted tool measures its own cost (section 5, as amended 2026-09-04) | Global Constraints: this tool is not hosted, and it prints its own wall clock anyway |
| Phone check at 390 and 320 on a real engine (section 9) | 17 |
| Mutation check on every new guard (section 9) | 16 |
| "can't see" list on the page, checked against the code (section 9) | 1 writes it, F3's `ToolPage` renders it, `safety.test.ts` checks two of the six against the code |
| "the verifier runs the exact flow, a 200 is not a pass" (section 9) | 18 Steps 5 to 7 |
| Every completion note states what was not verified (section 9) | 18 Step 8 |
| Tool owns `app/tools/<slug>/tool.css` (section 2, rule 2) | 15 |
| Only what the visitor explicitly saved (section 2, rule 1) | the storage grep in 15, and the sentence in 1 |
| No new dependencies (section 2, rule 3) | Global Constraints, and nothing in any task installs anything |

**Six gaps found and closed while reviewing.**

The first is the worst, and it is the one this whole plan turns on. The design says "proven equal to the production SQL row for row", and the first draft made that a `compare.mjs` somebody could run. **A check that nobody runs is not a check**, and a golden file regenerated from the port would be a mirror rather than an oracle. So the oracle is now two artefacts with a hard rule between them: `compare.mjs` produces the golden files from Postgres and never reads the TypeScript, and `oracle.test.ts` compares the TypeScript against them and runs in CI on every pull request. Task 11 Step 5 also breaks a golden file on purpose and watches the script fail, because a comparison that has never been seen to fail proves nothing when it passes.

Second, **four of the model's inputs are not in migration 0300 at all.** The first draft ported 0300 and defined `visits`, `visit_cadence_days`, `days_to_second_visit` and `days_since_last_visit` from first principles, which would have meant testing an invention against itself. They come from `analytics.customer_metrics` in migration 0070, and each has a detail that changes the answer: a cadence is over completed rows only, drops zero-day gaps and is rounded to one decimal. Task 0 Step 2 now reads both files, Task 8 reproduces all four, and the plan's own table names the one that could not be reproduced and why.

Third, **the as-of date.** Using `current_date` the way production does would make every customer in a three-month-old export look lapsed by exactly ninety days, which is a fact about the download. The default is now the file's own last date, with an input to change it and a sentence on the page when the file is stale. That is a deliberate divergence from the SQL and it is stated in the plan, in the code and on the page.

Fourth, **the fixture could have passed without exercising the model.** A golden file of nulls agrees with anything. Task 11 Step 5 now counts lifecycles and bands before the golden files are committed, and Task 12 has a test that fails if the fixture contains no `visiting` or `committed_idle` row, no `visitor` band, or no squeezed customer. The generator also had to be made tie-free on everything `mode()` decides, because Postgres does not promise how it breaks a tie and a difference there would be nobody's bug.

Fifth, **the credit's claim is only true at the production constants**, and the first draft had sliders that could move the model while the page went on saying it was the production one. `analysis.usingProductionParams` now exists, the page prints a sentence the moment it is false, the saved report carries the same sentence, and there is a mutation row on the comparison.

Sixth, **reachability would have emptied all three CSVs.** `hearth.reachability` makes no consent a hard zero, an export almost never carries consent, and every winnability figure would have been zero with no explanation. The tool now assumes consent only when the file is silent, says so beside the ranking, and uses the real function the moment a consent, email or phone column is mapped.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code, including the client component, which the first draft had left as a list of rules. Twelve places name something that has not happened yet and every one is labelled as a prediction with the action to take if it is wrong: the five phone-check guesses (Task 17), the failures expected from the reordered verdict branches (Task 16 Step 1) and from the broken `shrinkK` (Task 12 Step 3), the nineteen anchors that must be checked before the mutation run (Task 16 Step 3), whether the towns file fits under 40 KB gzipped (Task 7 Step 2), whether the worker builds at all (Tasks 15 and 18), whether Node's type stripping is available (Task 0 Step 5), whether Docker is present (Task 0 Step 5), what a real export looks like (Task 18 Step 6), how long a large file takes on a phone (Task 18 Step 6), and whether the fixture ever hits the decimal-tie rounding case (Tasks 3 and 12). That is the `CLAIMS.md` pattern, not a placeholder.

**One thing in Task 2 is not code in this plan and it is deliberate.** The twelve SQL function bodies are marked "paste them here" rather than reproduced, because they are three hundred lines of another repository's file and retyping them into a plan is exactly the transcription error the whole oracle exists to catch. What the task gives instead is the file, the commit, the `grep` that prints the line ranges, the order they go in, the four permitted changes, and a smoke test of seven values worked out by hand from the migration's own text. An implementer with no context can execute it, and the smoke test is what tells them whether they got it right.

Three sets of numbers are arithmetic rather than measurement and are marked as such: the Kaplan-Meier worked example, which is a product of three fractions and a Greenwood sum anybody can check on paper; the birthday-free claim that the port and Postgres should differ by about 1e-13, which is S3's measurement rather than this plan's; and the 40 KB ceiling on the towns table, which is a budget rather than a reading and which Task 7 replaces with a real gzip count.

**2b. The code in this plan was executed, and six assertions in it were wrong.** Reading a test and believing it is the same move `CLAIMS.md` is about, so the pure parts were transcribed into scratch scripts and run before this plan was saved: the CSV reader against twenty-nine of its own cases, the mapping helpers against forty-one, the twelve model functions against eighty-eight, the CSV writer and the HTML escaper and the chart path against twenty-two, plus the date helpers and the Kaplan-Meier worked example. Everything else passed, and the survival curve came back at exactly 5/7, 15/28 and 15/56 with a Greenwood sum of 0.6404761904761904 and an interval of [0.013125, 0.670013], which is what the plan's own section says. These six did not, and each is fixed above:

- `roundTo(120.05, 1)` was asserted as `120.1`. It is `120`, because 120.05 as a double is 120.04999999999999716, which is the documented decimal-tie divergence and now sits in the test that documents it.
- `statusRole("void")` was asserted as `cancelled` against a pattern of `voided?`, which needs the "e" and so matches "voide" and "voided" but not "void". The pattern is now `void(ed)?`.
- `distanceKm` from those Aughnacliff coordinates to Dublin is 104.0 km, not the 98 the migration's comment names, and the test asserted a window of 94 to 102. It now asserts the band, which is what the model actually uses, and says why.
- The same figure appears in `towns.test.ts` against GeoNames' Dublin centroid, with the same fix.
- `returnedBy(curve, 40)` was asserted against `41/56` to fifteen places. The two differ by one bit of double precision, which passes by a factor of four and tests the floating point unit rather than the model. Twelve places now.
- `csvCell("\tstart")` was asserted as quoted. It is guarded with an apostrophe and not quoted, and that is correct: RFC 4180 asks for quotes round a comma, a quote or a line break, and a tab in a comma-delimited file is none of those.

What that run cannot see: anything involving React, the worker, the SQL, Postgres, or the modules that import `@/content`, because a scratch script has no bundler and no alias. Those are checked by the tasks themselves.

**3. Type consistency.** Checked name by name across tasks:

- `Booking` is produced in Task 3's `types.ts` and consumed in 6, 8, 10 and 11. Every module imports it from `./types` and nowhere else, so there is one definition.
- `ModelParams` is defined in `types.ts`, its only instance is `PRODUCTION_PARAMS` in `model.ts`, and every model function takes it as an optional last argument. **Every field is a number**, which is what lets `SLIDERS` in the component index it generically; adding a boolean to that type would break the component's `params[slider.key]` and `tsc` would say so.
- `Seasonality` carries `enoughHistory`; the `Analysis` output renames it to `season.enabled` for the page. Those are two names for one thing on purpose, and the note in Task 10 says so, because reading one for the other is the obvious mistake.
- `CustomerFacts` (Task 8) and `CustomerRow` (Task 10) are different types and the second is not an extension of the first: `CustomerFacts` carries `firstDay`/`lastDay` as integers for arithmetic, and `CustomerRow` carries `firstIso`/`lastIso` as strings because it crosses a worker and goes into a report. The conversion happens once, in `analyse`.
- `Interval` from `km.ts` carries `defined`, which the first draft did not have. Without it a curve with no events yet produces a degenerate interval that reads as certainty, and both the page and the report now check it before printing two numbers.
- `Analysis` holds only arrays, plain objects, numbers, strings and booleans, and `analyse.test.ts` asserts a `JSON.parse(JSON.stringify(...))` round trip is unchanged. That is what makes the worker boundary and the saved report both work, and it is why `productDays` is an array of `{ product, days }` rather than the `Map` it is inside `customers.ts`.
- `ToWorker` and `FromWorker` are declared in `analysis.worker.ts` and imported by `run-client.ts`, so the two ends of the message channel cannot drift. The main-thread runner builds the same `parsed` and `analysed` shapes by hand, and `tsc` checks that it does.
- `ReadError.kind` is a string rather than a union, deliberately: the kinds are matched to sentences in `secondVisitCopy.refusals` by the component, and making it a union would put the copy's keys into a type that lives two directories away.
- `Band` is used as a plain string in the oracle's `scalars.json` (which includes `"nonsense"` on purpose, to check the default branch of `distancePriorFactor`), and `oracle.test.ts` casts it at the call site with a comment. That is the one place the type is deliberately widened, and it is widened towards the SQL, which takes `text`.
