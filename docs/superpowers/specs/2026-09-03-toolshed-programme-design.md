# The toolshed: programme design

**Date:** 2026-09-03. **Status:** decided, building. **Owner:** Fergus, with the agents.

This is the master design for turning `/tools` from a page with one tool into the thing the site is known for: nine tools, a shared homepage that visitors wear down together, and an arcade behind a door nobody is told about. It decomposes the work into sub-projects that can be built in parallel, fixes the interfaces they share, and sets the budget and verification rules every one of them has to meet.

It is the output of two research passes (the "FergusOS Toolshed" pages, 3 September 2026) and one round of decisions from Fergus, recorded below. Each sub-project gets its own spec and plan as it starts; this document is what those are checked against.

---

## 1. Decisions (Fergus, 2026-09-03)

| Question | Decision |
|---|---|
| Which tools | On the glass, Tide, Irish Stack Census, Second Visit, Overlap, Drift, Relief, Play your website, Burn. Rung, Deadlock hunter, Ledger and On a tube are not in this programme. |
| Second Visit and the Tigh model | Ship the real model (migration 0300's functions ported and proven equal to the SQL row for row; see the S3 ruling), credited and linked, so it doubles as a Tigh Sauna demo on a prospect's own export. Assumes Connell's nod; the page copy is written so that removing the credit is a one-line change. |
| Burn | Curated words and shared knobs, **no free text**. Pointer burn-in from everyone, a stamp from a curated word list, vote-driven shared knobs that decay overnight, a nightly degauss, `who` for presence. Nothing a stranger types is ever shown to anyone. |
| Games | Four: Phosphor Pong, Snake, a roguelike (Under the Terminal), Six-max poker. |
| The door | `cd arcade` in the terminal. Not in `help`, not in completion, not in `ls`. **The terminal is available on every page of the site.** |
| Census corpus | Every `.ie` domain, classified by industry. Called **Irish Stack Census**. |
| Hosting | **Vercel only, on free tiers.** Nothing that costs money. Where a free tier cannot carry a feature, the feature scales down or is dropped, never the bill. |
| Constitution | Amend AGENTS.md: local storage only for state the visitor explicitly saved, wiped by a `forget` command; server state limited to anonymous aggregates. |
| Deploys | Make the repository public. Git-linked deploys then work on Hobby, and work goes through pull requests. |

## 2. What this changes about the site

Three rules in AGENTS.md move, and the moves are part of wave 0, not something that happens quietly later.

1. **State the visitor asked for.** "No cookies, no local storage" was written about analytics and it stays true for analytics. The new clause: the site may keep, on the visitor's own machine, only what the visitor explicitly saved (a Drift voice profile, arcade initials, a saved report), never anything used to recognise them, and the `forget` command wipes all of it. Server-side, the site holds anonymous aggregates only: a heat map of pointer wear, three-letter initials with a score, per-IP budgets that expire in a day. Nothing keyed to a person.
2. **Styling.** `app/globals.css` stays the shell's stylesheet. A tool may own `app/tools/<slug>/tool.css`, imported by its own page. Ten tools appending to one file would spend the programme resolving merge conflicts.
3. **Dependencies.** The "reach for CSS first, earn every dependency" rule holds. Dependencies this programme earns, each with the reason on its own PR: `@upstash/redis` (budgets, Burn, boards), `@neondatabase/serverless` (census, Tide cache), `@vercel/blob` (reports), `@vercel/functions` (WebSocket upgrade, if the spike passes), `playwright-core` plus `@sparticuz/chromium` (On the glass), and `playwright` as a devDependency for the phone check. Nothing else without an argument.

## 3. The estate being reused

Everything below exists, is tested, and is the reason each tool is cheap here and expensive anywhere else.

- `components/Terminal.tsx` and `lib/commands.ts`: a pure parser returning `CommandResult` (`output | navigate | clear | effect`), with `Terminal` the only applier of effects. The arcade and the global shell extend this rather than replace it.
- `components/system/PhosphorScreen.tsx`: the two-pass phosphor tube. Its alpha channel is burn-in, cleared only by degauss. Burn is a texture fed into that channel.
  **Correction, 2026-09-04, and it matters for the arcade.** This document said moving text would leave a phosphor trail for free. It will not. The shader never samples the page: it draws its own field of light, and the DOM sits over it. The only seam is `pushImpact` in `lib/system.ts`, which lights a point in the persistence buffer, and the shader lights at most `MAX_FRAME_IMPACTS`, which is six, per frame, keeping the brightest when more are offered. So a trail behind a Pong ball is one impact a frame and is affordable; a trail behind every glyph of a Snake is not, and a game wanting one has to choose its six. G0 owns that budget and hands games a `flash` on the host rather than letting each one reach for the buffer.
- `lib/physics.ts`: the rigid-body solver. Play your website's collisions and the Pong ball live here.
- `lib/audio.ts`: the synth. Every game sound is an oscillator, never a file.
- `lib/headline-fetch.ts`: the SSRF fence. It becomes `lib/fence.ts` and guards every URL the site is handed, including the ones the browser engine navigates to.
- `app/tools/headline-check/rate-limit.ts`: the courtesy bucket. It becomes `lib/budget.ts` on Redis so replicas agree.
- `lib/mcp.ts` and the `mcp_tool_call` event: tools with an MCP twin (Drift, On the glass, Tide) plug into the same server with the same budgets.
- `content/*.ts` plus `content/voice.test.ts`: all copy lives in content files and is linted for house style. Every tool's copy goes through it.
- From other repos, lifted as pure modules with tests and credited in the file header: `terrain.ts` (marching squares, Tigh Sauna) for Relief and Second Visit; the retention SQL in migration 0300 (Tigh Sauna) for Second Visit; the equity engine in `ultimate-poker/src/bots/equity.ts` for poker; the Remand growth-momentum method for Tide.

## 4. Architecture

One repository, one Next.js app, one Vercel project, three free stores and one scheduled job on the home machine.

```
fergus-portfolio
├─ app/
│  ├─ tools/<slug>/            page.tsx, tool.css, actions.ts (server), client components
│  ├─ api/relay/               room codes and matchmaking (Overlap, Pong)
│  ├─ api/burn/                pointer paths in, heat map and knob state out
│  ├─ api/board/               initials boards
│  ├─ api/cron/                nightly degauss, report expiry, budget reset
│  └─ api/mcp/                 existing server; new tools register here
├─ lib/
│  ├─ commands/                the registry: one module per command group, plus hidden ones
│  ├─ arcade/                  program runtime, grid, input, games
│  ├─ tools/<slug>/            pure logic, tested, no React
│  ├─ store/                   redis.ts, neon.ts, blob.ts (thin, typed, env-guarded)
│  ├─ budget.ts                per-IP, per-target, global budgets with in-memory fallback
│  └─ fence.ts                 the SSRF fence, shared
├─ content/tools/              one file per tool: name, blurb, privacy line, cantSee[]
├─ scripts/census/             the monthly .ie crawl, run on the home machine
├─ scripts/phone-check.mjs     WebKit iPhone at 390 and 320, throttled Pixel, per route
└─ .github/workflows/ci.yml    vitest, tsc, build, mutation-check, on every PR
```

**Stores, each inside its free tier.**

| Store | Holds | Free tier (verified 2026-09-03) | Why this one |
|---|---|---|---|
| Upstash Redis | budgets, Burn heat map and knobs, room codes, initials boards | 256 MB, 500,000 commands a month | Hot, tiny values, TTLs. Command count is the meter to watch. |
| Neon Postgres (pgvector on) | census tables, Tide query cache, census monthly diff | 0.5 GB, 100 compute-hours a month, scales to zero after 5 minutes idle | Durable, queryable, and the site reads it through ISR so compute stays asleep. |
| Vercel Blob | On the glass screenshots and filmstrips, 14-day expiry | Hobby allotment not verified this session; assume 1 GB and prove it in wave 0 | Function responses cap at 4.5 MB, so screenshots must go to a store. |

**Scheduled work.** Vercel Hobby crons run once a day, with an hour of slop. That is enough for the degauss, report expiry and budget resets. Anything heavier (the monthly `.ie` crawl, a Tide index if one ever exists) runs on the home machine's scheduler, which already runs daily scans, and pushes results to Neon. No new server anywhere.

**Realtime.** Vercel Functions hold WebSockets, but a held socket bills provisioned memory for its whole life, and Hobby has 360 GB-hours a month at 2 GB an instance. So the default transport for Burn is **batched HTTP**: a small POST every four seconds while the tab is visible and the pointer has moved, carrying the path since the last one, answered with the heat delta and knob state. Player-to-player realtime (Pong against a stranger) goes over **WebRTC** with the relay only doing the introduction, which costs the server nothing during the match. WebSockets are spiked in wave 0 and used only where the spike shows the GB-hours are affordable.

## 5. The budget, and the rule that keeps it free

Vercel Hobby, per month, verified 2026-09-03: 4 hours of active CPU, 360 GB-hours of provisioned memory, 1,000,000 invocations, functions capped at 300 seconds and 2 GB, crons once a day.

Rough monthly draw at the caps below (guessed, not measured; the first month measures):

| Tool | Cap | CPU-hrs | GB-hrs | Invocations | Redis commands |
|---|---|---|---|---|---|
| On the glass | 15 renders a day, 3 per IP | 1.3 | 8 | 500 | 2k |
| Burn | 100 visitor-hours | 0.1 | 3 | 90k | 180k |
| Tide | 1,000 queries | 0.1 | 1 | 5k | 4k |
| Census (serving) | ISR, daily | ~0 | ~0 | 2k | 0 |
| Relay, boards, crons | | ~0 | ~0 | 10k | 20k |
| **Total** | | **1.5 of 4** | **12 of 360** | **110k of 1M** | **206k of 500k** |

Active CPU is the binding meter and On the glass is the only thing that moves it. The rule: every hosted tool has a per-IP budget, a per-target budget and a global daily cap, each refusal is a sentence rather than a spinner, and the caps are chosen so the month sums to under 60% of every allotment. If a meter passes 60% before the 20th, the global cap of the tool responsible halves. Nothing ever moves to a paid tier without Fergus saying so.

## 6. Sub-projects

Each has an ID, a size (S about one agent session, M two or three, L four to six, XL seven or more), a risk tier per the coding policy, hard dependencies, and acceptance criteria that a reviewer can fail. "Can't see" lines are part of the deliverable: they are printed on the page.

### Wave 0: foundations

**F0 Ship path** (S, high risk: public exposure). Secrets sweep of the whole history (gitleaks, plus a by-hand pass over `content/` and `public/`), then the repository goes public, branch protection on `main` requiring the CI check, and GitHub Actions running `vitest`, `tsc --noEmit`, `next build` and `scripts/mutation-check.mjs` on every pull request. Done when a push to `main` produces a `READY` production deployment whose `githubCommitSha` matches the pushed commit (the thing that has been `BLOCKED` since August), and when a deliberately failing test blocks a PR.

**F1 Command registry** (M, low risk). `lib/commands.ts` becomes a dispatcher over `lib/commands/*.ts` modules, each exporting `defineCommand({ name, aliases, help, hidden, argPool, run })`. `COMMANDS`, `HELP_LINES` and `complete()` derive from the registry. A `hidden: true` command is absent from all three. One new result kind, `{ type: "program", program: ProgramSpec }`, which `Terminal` hands to the arcade runtime (G0) and which, until G0 lands, prints "no runtime" and exits. Done when the existing `commands.test.ts` passes unchanged against the new structure, and a hidden command is proven absent from help, completion and `ls`.

**F2 The shell everywhere** (M, low risk). The terminal opens on every route: inline on the home page as now, and as a drawer everywhere else, opened by the backtick key, by the prompt in the status bar, or by a tap target on phones. One `Terminal` component, one history, the same registry. Adds `forget` (wipes every key the site ever wrote to local storage and says which) and `who` (prints presence once Burn exists, "just you" until then). Amends AGENTS.md with the three clauses in section 2. Done when `cd arcade` typed on `/writing/anything` routes to the arcade door, and when `forget` on a machine with a saved profile leaves local storage empty.

**F3 Tool registry and page shell** (S, low risk). `content/tools/<slug>.ts` files, an index that the `/tools` page and the sitemap read, and `components/tools/ToolPage.tsx`: title, lede, the privacy line ("runs in your browser, nothing leaves this tab" or "runs on the server, keeps a hashed IP for a day"), the body, and the "can't see" list at the foot. Adds the `tool_run` PostHog event with tool slug and outcome, never the input. Adds `scripts/phone-check.mjs`: Playwright WebKit iPhone at 390 and 320 and a throttled Chromium Pixel, driving a route and failing on horizontal overflow, inputs under 16px, tap targets under 44px, and text nodes whose sampled contrast is under 4.5:1. Done when `/tools` lists headline-check from the registry and the phone check passes on it.

**F4 State layer** (M, high risk: keys and data). Provision Upstash, Neon and Blob on the Vercel project (CLI `vercel integration add` first; if that needs a dashboard, it is the one step that waits for Fergus). `lib/store/*` thin clients that throw a named error when their env var is missing, so a missing store fails loudly in CI and never silently degrades in production. `lib/budget.ts`: per-IP, per-target and global counters with TTLs on Redis, falling back to the in-memory bucket only when `NODE_ENV !== "production"`. `lib/fence.ts` lifted from `headline-fetch.ts` with its tests. `.env.example` written. Done when a budget of three is exhausted on the fourth call from two different function instances, proven with a test against a real Upstash database, and when `headline-check` runs on the shared fence with its own tests green.

**F5 Spikes** (four S tasks, run in parallel, each ending in a one-page decision record under `docs/superpowers/spikes/`). A spike is allowed to fail; what it may not do is come back without a measurement.

- **S1 WebSocket on Hobby.** A Next.js route using `experimental_upgradeWebSocket`, deployed, held open from two tabs, with fan-out through Redis pub/sub. Measure: does it upgrade on Hobby at all, how many GB-hours does one hour of one open socket cost on the usage page, and does it survive the 300-second cut with the reconnect pattern. Decision: transport for Burn and for Pong.
- **S2 WebKit in a function.** Large-function build with `playwright-core` and the WebKit Linux build, one screenshot of a known page. If WebKit will not launch (expected: it wants system libraries the runtime lacks), the same test with `@sparticuz/chromium` and iPhone device emulation. Decision: the engine On the glass runs, and the exact sentence the report prints about it.
- **S3 DuckDB in the tab.** Load `@duckdb/duckdb-wasm` in a worker, port `hearth.shrink` and `hearth.expected_gap_days` from migration 0300 to DuckDB SQL, run against a 100,000-row synthetic bookings table, and compare against the Postgres output on the same rows. Decision: port as functions or as CTEs, and the bundle cost.
- **S4 The .ie seed.** Common Crawl's host-level graph (`cc-main-2026-jun-jul-aug`, 235 million hosts, vertices sorted by reversed host) read with HTTP range requests to pull only the `ie.` block, on the home machine. Measure: how many `.ie` hosts, how many registered domains after collapsing subdomains, how long, how many bytes. Decision: the census corpus and whether a monthly re-seed is a five-minute job.

### Wave 1: browser-only tools (parallel)

**T1 Drift** (M, low risk). `/tools/drift`. Not an AI detector, and the first line says so. Paste ten things you wrote; the tab builds a voice profile (function-word frequencies, sentence-length rhythm, punctuation, joins) and measures Burrows' Delta between it and any draft, with the sentences pulling away and the substitutions your own corpus suggests. Profile saved only if the visitor presses save, in local storage, wiped by `forget`. Under 150 words the tool refuses to print a distance. MCP twin `check_voice(profile, draft)` on the existing server. Can't see: meaning, register shifts within one writer.

**T2 Relief** (M, low risk). `/tools/relief`. A year of activity as contour ground drawn with `terrain.ts`: a GitHub username (commits, 52 weeks by 24 hours, using the visitor's own token pasted and never stored, because the unauthenticated API caps at 60 calls an hour), or any CSV with a date column. Out: PNG, SVG for a plotter, STL for a printer (two triangles a cell). Can't see: private repos without a token; commit times are the author's local time and the page says so.

**T3 Overlap** (M, low risk for the site, high for trust). `/tools/overlap`. Two people drop their LinkedIn `Connections.csv` into two tabs; a six-character room code from `api/relay` introduces the tabs over WebRTC; one side generates a salt, both hash every profile slug with it, only hashes cross the channel, each side sees the intersection with names only from its own file. Relay stores the offer and answer in Redis for ten minutes and nothing else, and the page offers the copy-paste route with no relay at all. Bloom filters above 10,000 rows. This relay is reused by Pong. Can't see: second-degree paths, warmth, changed slugs.

**T4 Second Visit** (XL, low risk for the site, high for the claim). `/tools/second-visit`. Drop a bookings or orders export; it is parsed in a worker; map customer, date, amount, optionally slot time, capacity, cancelled, town, product. Then the production model, ported to TypeScript and proven equal to the production SQL row for row (spike S3 ruled DuckDB out: 8.1 MB and 82 seconds on a Slow 4G phone; the macros stay in the repo as the oracle and `compare.mjs` is the regression test at 1e-9): expected gap by empirical Bayes (k = 2, the same constant as 0300), silence ratio, a Kaplan-Meier time-to-second-visit with right-censoring beside the naive one-and-done figure, distance bands from a bundled table of Irish town centroids, the verdicts (visiting, dormant, committed idle, squeezed), every constant a slider, terrain if there are slots, reorder radar if there are products, three CSVs out (lapsed regulars, second-visit nudges, stall risks), and a self-contained HTML report the visitor can save and reopen. Credited to Tigh Sauna, with a link. Can't see: why anyone left, tourists without a town, seasonality under a year (disabled, and it says so). S3 decided: see `docs/superpowers/spikes/s3-duckdb.md`.

### Wave 2: hosted tools (parallel)

**T5 On the glass** (L, high risk: fetches URLs on the server). `/tools/on-the-glass`. Paste a URL. The engine S2 chose loads it at 390 and 320 as an iPhone and as a throttled Pixel, scrolls and taps through. Measured, not linted: motion under `prefers-reduced-motion: reduce` by frame differencing over three seconds, drawn as a heat map; per-element composited contrast by sampling screenshot pixels under each text rect; tap targets against 44 by 44 and a one-thumb reach zone; the iOS zoom trap by driving focus; overflow at 320 with the element named; the fetch-only text against the rendered text. Screenshots to Blob, 14 days, a permanent report URL keyed by domain and run, and the second run diffs against the first. Every navigation, including redirects and subresources, goes through `lib/fence.ts`. Budget: 3 a day per IP, 15 a day globally, 40 seconds a run. Can't see: pages behind a login, a real phone GPU, and, if S2 lands on Chromium, WebKit itself, which the report says in its first line.

**T6 Irish Stack Census** (L, medium risk: a crawler with your name on it). `/tools/census`. The corpus from S4. A monthly crawl on the home machine: one polite fetch per domain (HEAD, then the first 64 KB of the home page, a 2-second cap, `robots.txt` honoured, a named user agent with a contact URL), fingerprinted for platform, host, payments, booking system, newsletter tool, an h1, the copyright year, then classified by industry from schema.org types and page content into about forty buckets, written to Neon with the run id. The site serves a table by industry, a stack-by-industry matrix, and after the second month the diff: who moved, who went dark, who arrived. An honesty layer per row: the evidence URL and the reason for each classification. A JSON API with the same budget as the page. Can't see: sites behind JavaScript, sites that block bots (marked unknown, never custom), businesses without a `.ie` domain. Coverage stated per bucket against a spot check.

**T7 Tide** (L, medium risk: four external APIs). `/tools/tide`. Type a problem in plain words. Four sources, shown separately, never summed: Reddit through Arctic Shift (dynamic rate limits, a couple of requests a second is safe), Hacker News through Algolia, GitHub repositories created per month whose description matches, Stack Exchange questions per month. The number is acceleration with a noise floor: month-on-month change, the second difference for the bend, a bootstrap over each source's history for what that source does by chance, and "flat, within noise" printed when the rise is under the floor. Three fixed control phrases run beside every query (known flat, known rising, nonsense); if the nonsense phrase rises, the run is marked broken and nothing is shown. "First ask": the earliest dated sentence that matches. Results cached in Neon for a day. The self-built pgvector index from the research is deferred: on a free tier the live APIs are the index. Can't see: whether anyone would pay, anything outside English, Arctic Shift's lag.

### Wave 3: the shared world

**X1 Burn** (L, medium risk: shared state). The homepage tube wears everyone's paths. Each tab sends its pointer path, quantised to a 96 by 54 grid, every four seconds while visible and moving; the server adds it to a decaying heat map in Redis and returns the map since the client's last mark plus the knob state; the client feeds the map into the phosphor burn-in channel. Stamps: pick a word from the curated list (`content/burn-words.ts`, about 200, every one in house voice), place it, and it burns in for everyone. Knobs: theme, curvature, scanline density, gravity, each a vote that moves the shared value, decaying back to default overnight. A daily cron degausses at 4am and archives the day's map as a PNG (the "yesterday" gallery is a later idea, not in scope). `who` prints how many tabs sent a path in the last minute. Nothing typed by a visitor is ever shown; the only text is from the list. Transport per S1. Can't see: who anyone is, by design.

### Wave 4: the arcade and the platformer

**G0 Arcade runtime** (M, low risk). `lib/arcade/`: a program loop the terminal hosts. A text grid (48 by 20 on desktop, 32 by 16 at 320), a fixed-step tick, key handling and swipe handling, `Escape` always exits and always restores the prompt, a sound hook into the synth, and a `flash` that spends the shader's six impacts a frame (see the correction in section 3: trails are not free). The door: `cd arcade` (hidden) prints the cabinet and the game list; `top` shows an `arcade` process as the one hint. `api/board`: three-letter initials and a score, per game, top twenty, in Redis; initials filtered against a short blocklist; the board printed by `neofetch` and inside the cabinet. Reduced motion declines the arcade the way it declines gravity, with a sentence.

**G1 Phosphor Pong** (M). From RLPong. Solo against a paddle with a small amount of deliberate error, and "play a stranger": matchmaking through `api/relay` and the match over WebRTC, the ball simulated on both sides with the host authoritative. Initials board.

**G2 Snake** (S). The tail burns in as it passes, so a long game leaves a ghost on the tube. Initials board.

**G3 Under the Terminal** (L). An ASCII roguelike lit by the pointer's glow: the visible radius follows the mouse. Enemies are named after real bugs from the articles; ammunition is "tests", which only work once you have seen them fail. One dungeon a day for everyone from a date seed; the board is depth reached, one entry per initials per day.

**G4 Six-max poker** (L). Heads-up no-limit against the equity bot lifted from Ultimate Poker, with the equity calculation shown as a bar when the hand ends. Browser only, no server. Initials board on chips won across a session.

**P1 Play your website** (L, low risk). `/tools/play` and a bookmarklet. Every block element's `getClientRects()` becomes a platform, images are solid, links spring, buttons are coins, the h1 is the exit, and a floor sits at the document bottom. A block character drops in, `lib/physics.ts` does collisions, a camera follows. On this site it is the `play` command; anywhere else it is one click on the bookmarklet and `Escape` puts the page back. The bookmarklet is a single self-contained script built from the same source by a `scripts/build-bookmarklet.mjs` step, served from `/play.js`. Can't see: fixed headers become ceilings, iframes are solid.

### Wave 5: launch

**L1 Launch** (M). The `/tools` index rewritten for nine tools with the privacy line on each, the MCP page updated with the new tools and their budgets, `PROGRESS.md` and `docs/measurement.md` brought up to date, a `tools_index_view` event, IndexNow submission, and one article: what was built, what each tool cannot see, and what the first month's meters read.

## 7. Dependencies and waves

```
F0 ──► F1 ──► F2 ──► G0 ──► G1, G2, G3, G4
 │      │
 │      └────────────────────► P1
 ├────► F3 ──► T1, T2, T3 ─(T3 relay)─► G1
 │              └─ S3 ──► T4
 └────► F4 ──► S1 ──► X1
         │      S2 ──► T5
         │      S4 ──► T6
         └────────────► T7
                              all ──► L1
```

Only F0 is strictly first, and it is short. After it, three tracks run at once: the terminal track (F1, F2, G0, games), the tools track (F3, then the browser tools), and the state track (F4, spikes, then the hosted tools). Burn waits for S1 and F2. Launch waits for everything.

## 8. How the work is segmented for throughput

The point of the segmentation is that four agents can work at once without touching the same lines.

1. **Hotspots get refactored before anyone branches from them.** `lib/commands.ts` (every game and command would edit one switch), `app/tools/page.tsx` (every tool would edit one array) and `app/globals.css` (every tool would append) are split in wave 0 into per-feature modules and per-tool files. After wave 0, a sub-project adds files; it edits shared files only at a registration line, and registrations are alphabetical so two PRs rarely collide on the same line.
2. **Interfaces are frozen at wave 0 and written into each sub-project's spec.** `defineCommand`, `ProgramSpec`, `ToolEntry`, `budget.take()`, `fence.check()`, the store clients, `api/relay`'s two routes, the `tool_run` event shape. An implementer sees only their own spec, so the interface block is how they learn what their neighbours expect.
3. **One sub-project, one worktree, one branch, one PR.** Created through the `workspaces.ps1` wrapper as a sibling worktree, never reused, never removed by an agent. Branch names `toolshed/<id>-<slug>`.
4. **Subagent-driven development per sub-project.** For each: a spec (the section above expanded, with the interface block and the "can't see" list), then a plan with bite-sized TDD tasks, then a fresh implementer per task, a task reviewer after each, and a whole-branch reviewer before the PR. A ledger at `docs/superpowers/programme/toolshed-ledger.md` records every task's state, because conversation memory does not survive compaction and re-dispatching finished work is the most expensive failure there is.
5. **Concurrency cap of four implementers.** Above that, review quality drops and the coordinator spends its context waiting. Waves are pipelines, not gates: when T1 merges, the next ready sub-project starts.
6. **Review is by risk tier, per the coding policy.** Low-risk browser tools get one reviewer and one build. High-risk ones (F0, F4, T5, X1) get the full gauntlet: independent review, the Docker parity image, and a live verifier.
7. **Merge order follows the graph.** A branch rebases on `main` before its PR, and a PR merges only when its dependencies have. Foundations first, always.
8. **Every PR ships.** Merge to `main` deploys; a verifier agent then runs the post-deploy protocol against fergusoreilly.dev on the exact changed route, reads the logs, and checks the PostHog event landed. A tool is "live" only after that.

Fergus can raise the concurrency, or run a whole wave as a multi-agent workflow, by saying so.

## 9. The verification standard, per sub-project

The five rules of the coding policy, plus the ones this programme adds:

- Tests first. A tool's pure logic lives in `lib/tools/<slug>/` with tests beside it, and its React is thin.
- The phone check runs on every tool route in CI: WebKit iPhone at 390 and 320, throttled Pixel, real engines, the same method On the glass sells. A resized desktop window does not count.
- The mutation check runs whenever a guard or a constant is touched.
- The "can't see" list is on the page, and a reviewer checks it against the code, not the spec.
- A hosted tool proves its budget refuses on the n+1th call, from two instances, before it ships.
- A hosted tool proves the fence refuses `127.0.0.1`, `169.254.169.254`, a private-range redirect and a DNS name resolving to a private address, before it ships.
- The verifier after deploy runs the exact flow: paste a URL, drop a file, type the command. A 200 on the route is not a pass.
- Every completion note states what was not verified.

## 10. Risks, and what would prove each one wrong

| Risk | If true, we would see | Mitigation |
|---|---|---|
| WebKit will not run in a Vercel function | S2 fails to launch WebKit with missing-library errors | Chromium with device emulation, labelled honestly in the report's first line. The tool is still the only one measuring motion and composited contrast. |
| WebSockets on Hobby cost too many GB-hours | S1's usage page shows an open socket burning provisioned memory for its whole life | Batched HTTP for Burn, WebRTC for Pong. Both designed in already. |
| The .ie crawl is too slow or too rude from a home machine | S4 and the first crawl show more than a week of wall clock, or complaints | Lower concurrency, HEAD-first, a sample of the corpus per month with a full pass quarterly. |
| Redis command budget blown by Burn | The Upstash meter passes 300k mid-month | Poll interval rises from four seconds to eight; the heat map moves to an in-function cache with a ten-second flush. |
| ~~DuckDB will not take the 0300 SQL~~ Resolved 2026-09-03 | The port agreed to 1.14e-13, so the SQL was never the risk. The engine's size was: 8.1 MB, 82 s at Slow 4G | DuckDB dropped; the model is ported to TypeScript and the DuckDB macros stay as the test oracle. |
| Connell objects to the model being public | He says so | The credit and the link are one content file; the constants become generic. The tool survives. |
| Making the repo public leaks something | The sweep finds a secret in history | The sweep runs before the flip, and a found secret is rotated before the flip, not after. |
| The whole thing is too much for one site's constitution | Reviewers keep filing "this breaks the no-storage rule" | Section 2 is the amendment; it is in wave 0 so no reviewer is guessing. |

## 11. Order and size

| Order | ID | Sub-project | Size | Starts when |
|---|---|---|---|---|
| 1 | F0 | Ship path | S | now |
| 2 | F1, F3, F4, F5 | Registry, tool shell, state, spikes | M, S, M, 4×S | F0 merged, in parallel |
| 3 | F2 | The shell everywhere | M | F1 merged |
| 4 | T1, T2, T3 | Drift, Relief, Overlap | M, M, M | F3 merged, in parallel |
| 5 | T4 | Second Visit | XL | S3 decided |
| 6 | T5, T6, T7 | On the glass, Census, Tide | L, L, L | F4 and the matching spike |
| 7 | X1 | Burn | L | S1 decided, F2 merged |
| 8 | G0 | Arcade runtime | M | F2 merged |
| 9 | G1, G2, G3, G4 | Pong, Snake, roguelike, poker | M, S, L, L | G0 merged (G1 also T3) |
| 10 | P1 | Play your website | L | F1 merged |
| 11 | L1 | Launch | M | everything |

Total: roughly 55 to 70 agent sessions of work if run one at a time; with four in flight, the calendar is set by the longest chain (F0, F1, F2, G0, G3) and by the two things that need a month to mean anything (the census needs a second crawl before it has a diff; Tide's caches need traffic).

## 12. Not in this programme

Rung, Deadlock hunter, Ledger and On a tube (all still good; none picked). A Tide index of our own. Free text in Burn. Private repositories in Relief without a token. Any paid tier of anything.
