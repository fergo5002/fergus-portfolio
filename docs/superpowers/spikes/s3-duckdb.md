# S3 DuckDB in the tab: decision record

- Date run: 2026-09-03, by Claude (Fable 5.1) on Fergus's home machine, worktree `C:\Dev\fergus-portfolio-toolshed-f5-spikes`, branch `toolshed/f5-spikes`, commit 8b82c3b (base)
- Preview deployment(s): none. The coordinator's instruction for this run was that neither S3 nor S4 deploys anything, so step 8 (CDN transfer and Slow 4G load) ran against the local Next dev server with Chrome's network emulation applied through CDP. What that can and cannot see is stated under each number.
- Hours spent: about 0.6 of 6 (16:19 to 16:55 UTC, interleaved with S4)
- Record opened, before any run: 2026-09-03 16:19 UTC

## Question
Do `hearth.shrink` and `hearth.expected_gap_days` from Tigh Sauna's migration 0300 port to DuckDB-WASM as macros and produce the same numbers as Postgres on 100,000 synthetic bookings, and what does the engine cost a phone to load?

## Prediction (copied verbatim from the brief before running)
All three functions (`shrink`, `expected_gap_days`, and `blend_prior`, which feeds the second) port as `CREATE MACRO` with the body unchanged apart from the schema line, because the migration wrote them as `language sql` single expressions and a DuckDB macro is exactly that; there is no PL/pgSQL to port. Zero rows differ at 1e-9: Postgres carries `numeric` and DuckDB carries `DOUBLE`, but every input here has under 15 significant digits and the values stay under 540, so the disagreement is around 1e-13. The retention query over 100,000 rows runs in under 500 ms in the tab. The `eh` bundle transfers about 6 MB if the CDN compresses `.wasm` and about 35 MB if it does not (guessed raw size, the Resource Timing entry gives the real one), and instantiates in 4 to 8 s on Chrome's "Slow 4G" preset. Tab memory after the query stays under 300 MB. **Falsified by:** any macro refusing to create (then the port is CTEs, the design's mitigation); any row differing by more than 1e-6 (a semantic difference such as median interpolation or decimal rounding, not precision); transfer over 12 MB or load over 20 s at Slow 4G (then the bundle question goes to Fergus, because the phone rule and the privacy rule pull against each other); memory over 500 MB.

## What ran

Same single worktree as S4 (the coordinator's instruction), Node v24.16.0, Docker 29.2.1, Next.js 15.5.19 in dev mode, the real Chrome at `C:\Program Files\Google\Chrome` driven headed by the Playwright MCP.

1. `npm install --legacy-peer-deps` (16:19:22 to 16:20:46 UTC, rc 0), then `npm install --legacy-peer-deps @duckdb/duckdb-wasm`, which resolved to **1.33.1-dev57.0** (npm's `latest` tag is a dev build today) carrying DuckDB **v1.5.4** (`db.getVersion()`). `package.json` and `package-lock.json` changed by that install are committed on the spike branch and die with it, as the brief says.
2. The five source files extracted from the brief's fenced blocks verbatim: `lib/tools/second-visit/synth.mjs`, `lib/tools/second-visit/retention-sql.mjs`, `app/spike-duckdb/page.tsx`, `app/api/spike-duckdb/route.ts`, `scripts/spike-duckdb/compare.mjs`. `npx tsc --noEmit` clean, 16 s.
3. Engine files copied to `public/spike-duckdb/` (sizes in the table). The brief's `.git/info/exclude` step does not work in a linked worktree (see the S4 record); nothing was staged that should not be.
4. **Node path first**, the coordinator's fallback, which became the second engine reading: `scripts/spike-duckdb/run-duckdb-node.mjs`, new for this spike. Three false starts on the worker plumbing, each observed and each fixed from the bundle's source rather than a further guess: (a) `worker_threads.Worker` has `.on()` and `AsyncDuckDB.attach` calls `addEventListener` (TypeError); (b) the bundle's exported `createWorker` fetches its argument and Node's `fetch` refuses a file path ("unknown scheme"); (c) a hand-rolled adapter round `worker_threads.Worker` attached fine but the worker exited with code 0 at once, because the worker script expects the `self`, `addEventListener` and `postMessage` globals that the bundle's inlined `web-worker` shim sets up. The shape that works replicates that shim, read off the minified source (`new R.Worker(__filename,{workerData:{mod:o,name:n,type:a}})`): spawn `duckdb-node.cjs` itself as the worker thread with `workerData.mod` pointing at `duckdb-node-eh.worker.cjs`, plus a 15-line adapter exposing `addEventListener`, `removeEventListener`, `postMessage` and `terminate` with messages wrapped as `{ data }`. Ran at 16:28:48 UTC, wrote `.spike/duckdb-out-node.json`.
5. **Browser path**: `npm run dev` (16:23). The site's `.saver` overlay intercepts pointer events on `/spike-duckdb`, so the button is clicked from `page.evaluate`. First run on `http://localhost:3000/spike-duckdb` at 16:28:00 UTC, unthrottled, warm dev server; `posted to /api/spike-duckdb status=200` wrote `.spike/duckdb-out.json`.
6. `node scripts/spike-duckdb/compare.mjs .spike/duckdb-out.json` and then `… .spike/duckdb-out-node.json`, 16:29 to 16:30 UTC. One spike change to the script: it takes the input path as `argv[2]` and names its report after it, so the two engine readings do not overwrite each other. Postgres 16 in container `spike-pg` (image already on the machine); the script's own `docker stop` plus `--rm` removed it, `docker ps -a` shows none.
7. **Step 8 stand-in.** One fresh page per run, `Network.setCacheDisabled`, `Network.emulateNetworkConditions`, click, wait for the log line, close. Preset values taken from devtools-frontend `front_end/core/sdk/NetworkManager.ts` on `main`, not from memory: **"Slow 4G"** is 1.6 Mbps × 0.9 = 180,000 B/s down, 84,375 B/s up, 562.5 ms (this is the profile the menu used to call "Fast 3G"); **"3G"** is 50,000 B/s, 50,000 B/s, 2,000 ms (the old "Slow 3G"); "Fast 4G" is 1,012,500 B/s, 165 ms. Three instrument findings on the way, all observed: the `.wasm` never appears in the page's Resource Timing because the worker fetches it, so the brief's `resource …` line cannot see it and wire sizes came from Playwright's `requestfinished` and `request.sizes()` instead; `Network.setCacheDisabled` on the page's CDP session does not reach the worker's fetch, which on the first Slow 4G attempt came back in 2.6 s with `responseBodySize: 0` from HTTP cache, so `page.tsx` got a per-click `?v=` on the four engine URLs; and a throttle set on a page outlives the session object that set it, a later session's reset did not undo it (a 189 KB probe fetch took 7.8 s after the "reset"), so one fresh page per run. Runs, all on `http://127.0.0.1:3000` so the page's `localhost` check kept it from POSTing over the compare's input: 3G once (16:31), Slow 4G three times cold (16:42, 16:44, 16:46), unthrottled cold once (16:49).
8. Tab memory: Chrome Task Manager is not reachable from here. Proxy: working sets of Playwright's Chrome renderer processes after the last run, `Get-CimInstance Win32_Process` filtered to `--type=renderer` under the Playwright browser PID.
9. Dev server stopped and the spike tabs closed at the end. Docker: no container left.

## Measurements

| Name | Value | Where read | When (UTC) | Rung |
|---|---|---|---|---|
| Macros created | all three, no error (`macros created ms=152` in the browser, `failures=0` in Node) | page log, node log | 16:28 | reproduced (seven browser runs, one Node) |
| Rows compared | 14,749 (the generator draws 14,749 of the 15,000 customer ids); missing in Postgres 0, missing in DuckDB 0 | `.spike/s3-compare.json`, `.spike/s3-compare-node.json` | 16:30 | reproduced (browser rows and Node rows) |
| Mismatches at 1e-9 | **0** | same | 16:30 | reproduced |
| Mismatches at 1e-6 | 0 | same | 16:30 | reproduced |
| Max abs diff per column | `base_gap_days` 1.78e-15, `distance_factor` 2.22e-16, `expected_gap_days` 1.14e-13 | same | 16:30 | reproduced (identical for both engine readings) |
| `sum(expected_gap_days)` | 1560438.739662 in every browser run and in Node | page log, node log | 16:28 to 16:49 | reproduced |
| DuckDB query ms, 100,000 rows | browser 418, 452, 369, 423, 407, 519, 432 across seven clicks, **median 423**; Node 691, 454, 441 in one process | page log, node log | 16:28 to 16:49 | reproduced |
| Postgres query ms | 1,655 and 1,466 (`docker exec psql`, cold) | compare output | 16:30 | reproduced |
| Postgres copy, 100,000 rows | 3,010 ms and 1,511 ms | compare output | 16:30 | reproduced |
| Uncompressed on disk | `duckdb-eh.wasm` 35,913,747; `duckdb-mvp.wasm` 41,325,187; eh worker 773,223; mvp worker 839,642 | `ls -l public/spike-duckdb` | 16:21 | observed |
| Compressed offline | eh.wasm gzip -9 **8,057,777**, brotli q9 **6,163,011**; mvp.wasm gzip -9 9,181,520, brotli q9 6,965,123; eh worker gzip 188,134, brotli q11 155,857 | `gzip`, `brotli` | 16:24 | observed |
| Bundle selected | `eh` (Chrome and Node) | logs | 16:28 | observed |
| `.wasm` bytes on the wire from the dev server | **8,135,179**, `content-encoding: gzip`, the same in all four cold runs | Playwright `request.sizes()` | 16:42 to 16:49 | reproduced |
| worker.js on the wire | 189,556 transfer, 189,256 encoded, 773,223 decoded | Resource Timing | 16:28 to 16:49 | reproduced |
| DuckDB JS chunk on the wire | 425,896 (gzip) | `request.sizes()` | 16:42 to 16:49 | reproduced |
| `js import` ms | 172 unthrottled warm, 626 unthrottled cold; 3,375 / 3,066 / 3,370 at Slow 4G; 19,171 at 3G | page log | 16:28 to 16:49 | observed |
| `wasm load+instantiate`, Slow 4G, three cold runs | 108,686 / 82,570 / 77,634 ms, **median 82,570 ms**; the `.wasm` request alone 92.9 / 78.4 / 72.9 s | page log, request timing | 16:42 to 16:47 | reproduced |
| `wasm load+instantiate`, 3G | 210,312 ms, one cold run | page log | 16:34 | observed |
| `wasm load+instantiate`, unthrottled | 6,082 ms (first run, warm dev server, cache allowed) and 11,581 ms (cold, cache-busted; the `.wasm` request 9.26 s, which is the dev server gzipping 36 MB on the fly) | page log | 16:28, 16:49 | observed, two setups |
| Node load and instantiate from disk | 1,499 ms | node log | 16:28 | observed |
| DuckDB memory after the query | 5,320,704 bytes, every run | `duckdb_memory()` | 16:28 to 16:49 | reproduced |
| Main-thread JS heap | 109 MB used, 128 MB total (`performance.memory`; the engine lives in the worker, so this is mostly the site itself) | page | 16:49 | observed |
| Tab memory, proxy | Playwright Chrome renderer working sets: **317.9 MB and 202.2 MB** for the two spike tabs (the 317.9 MB tab had run the engine twice and never terminated the first worker), 92 MB and 30 MB for the two others; which spike tab is which not established | `Win32_Process` | 16:51 | observed, attribution guessed |
| Node process RSS after the query | 441 MB | node log | 16:28 | observed |
| Effective throttled rate | 8,135,179 B over 72.9 to 92.9 s is 88 to 112 KB/s against a nominal 180 KB/s | arithmetic | 16:47 | observed, unexplained |
| CDN compression of `.wasm` | unmeasured, nothing deployed | | | |

## Result against the prediction

**Confirmed** on the port and the numbers: all three functions created as macros with bodies verbatim apart from the schema line (the `::numeric` / `::double` token is the brief's own dialect switch, not a change made here); zero rows differ at 1e-9, and the largest disagreement is 1.14e-13, the size predicted; the query runs in 423 ms median in the tab against a 500 ms ceiling; DuckDB's own memory is 5.3 MB and the best-attributed tab reading is 202 MB, under the 300 MB predicted, though the tab that had loaded the engine twice sat at 318 MB.

**Falsified** on the load. The prediction said 4 to 8 s at Slow 4G; three cold runs gave a median of 82.6 s, and the `.wasm` alone is 8.1 MB gzip on the wire (6.2 MB with brotli). The prediction could never have held: at Chrome's Slow 4G profile, 180 KB/s, 6 MB is 34 s and 8 MB is 45 s by arithmetic before any latency, so "4 to 8 s" was written for a payload about ten times smaller than the engine. The "about 6 MB if the CDN compresses" line is right for brotli (6.16 MB) and wrong for gzip (8.06 MB offline, 8.14 MB as the dev server actually sent it). Of the named falsifiers, transfer over 12 MB did not fire; load over 20 s fired by a factor of four.

**Not tested**: whether Vercel's CDN compresses `.wasm` at all, since nothing deployed.

## Decision

- **Port: macros.** Rule 1 applies, macros created and mismatches at 1e-9 = 0. The T4 spec ships the rest of migration 0300's `language sql` functions the same way (`season_factor`, `retention_verdict`, `reachability`), bodies verbatim in a `hearth` schema, and `compare.mjs` becomes T4's regression test against Postgres on a service container. The dialect surface is exactly the three switches the brief wrote: `::numeric` / `::double`, `percentile_cont` / `quantile_cont`, date subtraction / `datediff`.
- **Query time: under 1 s** (423 ms median in the tab on 100,000 rows), so T4's sliders can recompute live.
- **The bundle: stop and put it to Fergus with the numbers.** Rule: over 20 s at Slow 4G. Measured median 82.6 s at Chrome's Slow 4G profile from the local dev server (gzip, 8.1 MB on the wire), 210 s at 3G. Even the best case the numbers allow, brotli from a CDN that does compress `.wasm` (6.16 MB), is 34 s at 180 KB/s by arithmetic, over the 20 s line; getting under the 10 s line would need a payload of about 1.8 MB. The phone rule and the privacy rule pull against each other exactly as the brief said they might. The options the numbers leave open, none chosen here: (a) keep DuckDB and make the wait honest, a progress bar driven by the fetch, the size stated before the visitor drops a file, the engine cached after the first visit, with the first visit on a phone costing a minute or more; (b) a smaller in-tab engine for this one tool, since the retention query is one window function, two medians and three one-line macros and sql.js or a plain JS reduce would come in under 1 MB, keeping DuckDB for tools that need it; (c) run the query server-side, which breaks "nothing leaves this tab".
- **Memory**: not a blocker on what was measured (202 to 318 MB renderer working set, 5.3 MB inside DuckDB), under the 500 MB line.
- **Instrument notes for T4**: the page's Resource Timing cannot see the worker's `.wasm` fetch (measure inside the worker or at the network layer); DevTools "Disable cache" applied through CDP on the page does not reach the worker (cache-bust the URLs, or take one reading per profile); Next's dev server gzips the `.wasm` on the fly at about 9 s per request, so local unthrottled numbers overstate the CDN case.

## Not verified

- Anything about Vercel's CDN: whether it compresses `.wasm`, with what, and the resulting transfer size and time. Nothing deployed. The brotli figure is offline at q9; q11 would be a little smaller.
- The Slow 4G figures are Chrome's emulation applied through CDP against a local server, not a phone on a real network, and the effective throughput came out at 88 to 112 KB/s against the 180 KB/s nominal, which I could not explain (the dev server's gzip pacing and the emulator's per-packet latency are two guesses, neither tested). A real device needs its own reading.
- Tab memory was read as renderer working set, not Chrome Task Manager's "Memory footprint", and the attribution between the two spike tabs is a guess.
- Chrome only. No WebKit reading; the phone rule's WebKit iPhone emulation was not part of this spike.
- Only the `eh` bundle was exercised; whether a target phone would ever select `mvp` was not checked.
- Next's server compile of the client page warns "Critical dependency: the request of a dependency is an expression" for `duckdb-node.cjs`; the browser build loaded and ran, and the warning was not chased.
- 1.33.1-dev57.0 is what npm's `latest` resolves to today; a pinned stable could differ in size and version.

## Meters moved

None. Nothing deployed, so Provisioned Memory, Active CPU and invocations are untouched by design. Not read.
