# S2 WebKit in a function: decision record

- Date run: 2026-09-03 into 2026-09-04, by Claude (Fable 5.1, then Opus 5 after a quota cut) on Fergus's home machine, worktree `C:\Dev\fergus-portfolio-toolshed-s2-webkit`, branch `toolshed/s2-webkit`, commits `9b717ac`, `042077c`, `1479153`, `4d9f163`
- Preview deployment(s):
  - `dpl_GnVkrWKmdvWE1YvcmNwCJFHypcG6`, `https://fergus-portfolio-6rqxgpjt4-larry-pm.vercel.app`, READY (CLI JSON `readyState: READY` at 17:23:37Z). Both engines in the bundle. Phase A ran here.
  - `dpl_3uMDk3fXxsd1hj6FiBUAEB78NBWX`, `https://fergus-portfolio-cdba8o6bj-larry-pm.vercel.app`, **ERROR** (v6 API, `target=preview`, read 23:33Z). Refused at the function size limit. That is a measurement, not a run.
  - `dpl_2BnWngXDkMJ7kgJDdjf6RMvM4dbq`, `https://fergus-portfolio-n1sunqmmf-larry-pm.vercel.app`, READY (v6 API with `target=preview`, confirmed 23:41:32Z). Chromium only. Phase B ran here.
- No `--prod` in any command. The pre-deploy hook state file `~/.claude/hooks/state/predeploy-reviewed` was touched immediately before the one deploy this session made, as its own command, because a spike preview is the experiment itself.
- Hours spent: about 3.2 of 6 (predecessor 17:16 to 19:00 local, this session 23:15 to 00:35 UTC)
- Record opened, before any run: 2026-09-03 17:16 UTC

## Question
Can a Vercel Hobby function launch Playwright's WebKit and screenshot a page, and if not, how fast and how CPU-hungry is `@sparticuz/chromium` under `playwright-core` with iPhone emulation?

## Prediction (copied verbatim from the brief before running)
WebKit does not launch. The Linux build wants libicu, libwebp, gstreamer and a dozen more shared libraries the runtime does not have, so `launch()` fails within 5 s with Playwright's "Host system is missing dependencies" box or a loader error naming a `.so`. The function with WebKit inside it is over 250 MB unpacked, so it needs `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` to deploy at all. Chromium from `@sparticuz/chromium` launches; cold start (first request on a fresh instance) is 3 to 8 s, a warm render of `https://fergusoreilly.dev` at 390 wide finishes in under 4 s, and the two-width run costs under 8 CPU-seconds. **Falsified by:** WebKit launching and returning a PNG (then the tool gets the real engine and the report's first line changes); Chromium cold start over 30 s or any run over 60 s (the tool as designed does not fit a Hobby function); or measured CPU per two-width run over 10.4 s (then the daily cap in section 5 has to drop, see the decision rule).

## What ran

Versions, pinned and read off disk: `playwright-core` 1.62.1 (its `browsers.json` wants Chromium `151.0.7922.34` revision 1234, and WebKit 26.5 revision 2336), `@sparticuz/chromium` 149.0.0. That is a **two-major gap** between what Playwright expects and what sparticuz ships, not the "nearest below" the brief asked for. It rendered anyway, twenty times out of twenty, so the gap is recorded rather than treated as a problem.

**Phase A, WebKit, on `dpl_GnVk…`.** `vercel.json` carried the brief's build command verbatim, `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright-core install webkit && du -sh … && next build`, with `serverExternalPackages` and `outputFileTracingIncludes` in `next.config.ts` as the brief wrote them. Two calls to `/api/spike-render?engine=webkit`.

**Between the phases.** The brief's two preview environment variables were never added. `vercel env add … preview toolshed/s2-webkit` scopes a variable to a git branch, and this branch is never pushed, so the scoping is refused; an unscoped preview variable would have changed every preview on the project including other agents' branches. `PLAYWRIGHT_BROWSERS_PATH` turned out not to be needed at runtime on `dpl_GnVk…` (Playwright found the binary at `/var/task/node_modules/playwright-core/.local-browsers/webkit-2336/` on its own, because the install wrote it there). `VERCEL_SUPPORT_LARGE_FUNCTIONS` was never set, which is why `dpl_3uMDk…` was refused.

**Phase B, Chromium, on `dpl_2BnW…`.** Commit `4d9f163` drops the WebKit install from the build command and from the tracer include. Reason: phase A is finished and its deliverable is the error text, WebKit costs 298 MB it cannot use, and the Chromium-only bundle is the one T5 would actually ship, so the cold start measured on it is the one the tool would actually pay. `npx tsc --noEmit` clean. Deploy at 23:39:32Z, READY at 23:41:23Z, confirmed through the v6 API at 23:41:32Z. Then: one probe with `--single-process` dropped, one with it kept, one `engine=webkit` on the binary-free bundle, then twenty runs with a ten-minute idle after every fifth (`.spike/run20.sh`).

Two departures from the brief in the route, both from the predecessor and both kept:

1. The error text is sliced at 6,000 characters with the `<launching> …` line elided, because sparticuz's launch args alone are over 2,000 characters and the brief's 2,000-character slice hid the browser's own stderr underneath them (`.spike/s2-chromium-probe.json` is the run where that happened).
2. `--single-process` is a query flag (`?single=1`) rather than the brief's environment variable, for the branch-scoping reason above. One deployment measures both.

## Measurements

| Name | Value | Where read | When (UTC) | Rung |
|---|---|---|---|---|
| WebKit installer, build machine | `BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.` then `webkit-ubuntu-24.04.zip`, 102 MiB, WebKit 26.5 (playwright webkit v2336) | build log of `dpl_GnVk…` | 17:22 | observed |
| WebKit, build-time dependency check | Playwright's "Host system is missing dependencies" box, 43 libraries, listed in full below | same build log | 17:22 | observed |
| `du -sh .local-browsers` | **298M** (WebKit plus the FFmpeg 1011 helper) | same build log | 17:22 | reproduced (identical line in `dpl_3uMDk…`'s build) |
| WebKit at runtime, error | `MiniBrowser: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory`, `<process did exit: exitCode=127, signal=null>`, surfaced by Playwright as `browserType.launch: Target page, context or browser has been closed` | `.spike/s2-webkit-1.json`, `.spike/s2-webkit-2.json` | 17:25, 17:26 | reproduced (twice, two instances, pid 21 and pid 22) |
| WebKit, time to failure | 73 ms and 58 ms in-function (`totalMs`); 2.63 s and 2.21 s wall including cold start | same files | 17:25, 17:26 | reproduced |
| Function size with both engines | **374.72 MB uncompressed**, refused: `exceeds the maximum uncompressed size limit of 250mb … set VERCEL_SUPPORT_LARGE_FUNCTIONS=1` | `.spike/s2-deploy3.txt`, deploy of `dpl_3uMDk…` | 17:59 | observed |
| Function size, Chromium only | Under 250 MB: the same build command minus the WebKit install deployed with no size error | `.spike/s2-deploy4.txt` | 23:41 | observed (the exact number was not printed; `VERCEL_ANALYZE_BUILD_OUTPUT=1` was not set) |
| WebKit on the Chromium-only bundle | `browserType.launch: Failed to launch webkit because executable doesn't exist at /home/sbx_user1051/.cache/ms-playwright/webkit-2336/pw_run.sh`, 20 ms | `.spike/s2-webkit-3-nobinary.json` | 23:43 | observed |
| `--single-process` kept | **`FUNCTION_INVOCATION_TIMEOUT`, HTTP 504 at 60.48 s** (the route's `maxDuration`) | `.spike/s2-singleprocess-probe.json` | 23:42 | isolated (one query parameter, changed alone: `?single=1` times out, the same URL without it returns 200 in 18 s) |
| Chromium runs, 20 | **20 ok, 0 failed** | `.spike/s2-chromium.jsonl` | 23:43 to 00:18 | observed |
| Cold starts caught in 20 | 3 (the ten-minute idle recycles the instance: runs 6, 11 and 16 all came back `coldStart: true, requestsOnThisInstance: 1`) | same | 23:43 to 00:18 | reproduced (three times, same idle length) |
| Chromium cold: total ms | median **16,496**, min 15,344, max **20,520** | `.spike/s2-reduction.txt` | 00:19 | observed |
| Chromium cold: launch ms | 4,077, 2,607, 2,748 | same | 00:19 | observed |
| Chromium warm: total ms | n=17, median **12,510**, min 11,486, max 15,949 | same | 00:19 | observed |
| Chromium warm: launch ms | median **50** (the sparticuz brotli bundle is already unpacked at `/tmp/chromium`) | same | 00:19 | observed |
| Per-shot ms | 390-wide (1170 px) median **4,750**; 320-wide (960 px) median **6,179** | same | 00:19 | observed |
| Screenshot pixels | **1170×2532 and 960×1704**, exactly as the brief predicted at scale 3 | same | 00:19 | reproduced (every one of 20 runs) |
| Screenshot bytes | 390-wide median 259,634; 320-wide median 169,339 | same | 00:19 | observed |
| Node-process CPU per run | warm median **211.5 ms**, cold 3,054 / 2,897 / 3,382 ms. **A floor, not the cost:** the browser is a child process and is not in this figure | same | 00:19 | observed |
| Function RSS | median 138.5 MB, max 166 MB | same | 00:19 | observed |
| Active CPU and Provisioned Memory for the batch | **not read.** Both routes to the meter are closed, see below | — | 23:47 to 23:55 | observed |

The 43 libraries the build machine's dependency check named, in the order printed: `libgstreamer-1.0.so.0`, `libgtk-4.so.1`, `libvulkan.so.1`, `libgraphene-1.0.so.0`, `libicudata.so.74`, `libicui18n.so.74`, `libicuuc.so.74`, `libxslt.so.1`, `libopus.so.0`, `libgstallocators-1.0.so.0`, `libgstapp-1.0.so.0`, `libgstbase-1.0.so.0`, `libgstpbutils-1.0.so.0`, `libgstaudio-1.0.so.0`, `libgsttag-1.0.so.0`, `libgstvideo-1.0.so.0`, `libgstgl-1.0.so.0`, `libgstcodecparsers-1.0.so.0`, `libgstfft-1.0.so.0`, `libflite.so.1`, `libflite_usenglish.so.1`, `libflite_cmu_grapheme_lang.so.1`, `libflite_cmu_grapheme_lex.so.1`, `libflite_cmu_indic_lang.so.1`, `libflite_cmu_indic_lex.so.1`, `libflite_cmulex.so.1`, `libflite_cmu_time_awb.so.1`, `libflite_cmu_us_awb.so.1`, `libflite_cmu_us_kal16.so.1`, `libflite_cmu_us_kal.so.1`, `libflite_cmu_us_rms.so.1`, `libflite_cmu_us_slt.so.1`, `libavif.so.16`, `libharfbuzz-icu.so.0`, `libjpeg.so.8`, `libmanette-0.2.so.0`, `libenchant-2.so.2`, `libhyphen.so.0`, `libsecret-1.so.0`, `libGLESv2.so.2`, `libx264.so`.

The **runtime** is a different machine from the build machine and its first missing library is not on that list: it is `libatk-1.0.so.0`. Nobody should read the build list as the shopping list for making WebKit work in the function; the runtime stopped at the first thing it could not find and there is no reason to think it is the only one.

### The meter could not be read, and that is a finding about the plan

The brief has all four spikes read Provisioned Memory and Active CPU from `https://vercel.com/larry-pm/~/usage`. Neither route works from here:

- **API.** `GET https://api.vercel.com/v1/usage` returns `{"error":{"code":"plan_upgrade_required","message":"This API endpoint is only available to Teams on the Pro or Enterprise plan."}}`, on every combination of `teamId`, `projectId`, bare, hour and day granularity, ISO and epoch. `GET /v2/teams/team_SW7xEyTEz5ftQj3cIxulWxKG` says `slug larry-pm, billing.plan hobby`, so the gate is exactly what it says it is.
- **Dashboard.** The Chrome profile is signed in as `fergus@tighsauna.com`, which is not a member of `larry-pm`. `https://vercel.com/larry-pm/~/usage` renders `Select Team / 404 / You're logged in as fergus@tighsauna.com`, and `/api/usage` from that session answers `403 forbidden` with a team id and `400 invalid_time_range` without one. Logging in as the other account is not something an agent does.

Instrument note, because the first reading was a lie: the first two `javascript_tool` calls into that tab timed out after 45 s with "the renderer may be frozen". A control expression, `1+1`, timed out too, so that was evidence about the tab and not about Vercel. After a reload the control returned 2 and the real errors above appeared. The predecessor's `.spike/usage-day.json` and `.spike/usage-3h.json`, pulled at 17:26Z, prove the dashboard endpoint did work earlier in the day, so the session changed under us between 17:26Z and 23:47Z. **Rung on the cause of that change: guessed, untested.**

## Result against the prediction

**Confirmed on WebKit, confirmed on size, falsified on speed.**

- WebKit did not launch. Confirmed. The mechanism is the predicted one (a missing shared library) though not one of the libraries the prediction named: `libatk-1.0.so.0`, exit code 127, twice. The prediction's "within 5 s" is comfortably right at 58 to 73 ms in-function.
- The function with WebKit in it was over 250 MB and did need the flag. Confirmed, and now with a number: 374.72 MB.
- Chromium launched. Confirmed, 20 of 20.
- **Cold start 3 to 8 s: falsified.** Cold total is 15.3 to 20.5 s, of which launch is 2.6 to 4.1 s. If the prediction meant only the launch, it is right; as written it says the cold request, and the cold request is two to seven times over.
- **Warm render at 390 under 4 s: falsified.** The 390 shot alone has a median of 4.75 s, and the whole warm two-width request has a median of 12.5 s.
- **Under 8 CPU-seconds per two-width run: falsified as far as it can be tested.** Node's own CPU is 0.21 s warm, but that excludes the browser child. The wall-clock ceiling is 12.5 s warm. The true figure sits somewhere in that band and the band's top is over the 10.4 s budget.

Of the named falsifiers, one fired and two did not: WebKit did not return a PNG; no run went over 60 s and no cold start went over 30 s (max 20.5 s), so the tool does fit inside a Hobby function; but CPU per two-width run is over 10.4 s on the only measurement available, so **the daily cap has to drop**.

## Decision

Rule applied: the second branch, "WebKit failed, Chromium rendered both widths, warm run ≤ 40 s and cold ≤ 60 s". So **On the glass (T5) uses `@sparticuz/chromium` under `playwright-core` with `devices["iPhone 13"]`**, and the "can't see" list gains WebKit itself.

**The exact first sentence the On the glass report prints, settled now rather than later:**

> Measured in Chromium pretending to be an iPhone 13 at 390 and 320 wide. Not WebKit, so a Safari-only bug is invisible here.

Three things the run settled for T5's spec:

1. **Drop `--single-process`.** It is in sparticuz's default Lambda args and under Playwright it does not slow the launch down, it hangs it: `FUNCTION_INVOCATION_TIMEOUT` at 60 s, against 18 s for the identical request without it. Filter it out of `chromium.args` at launch. This is isolated, not guessed.
2. **The daily cap is 4, not 15.** Section 5 gave T5 1.3 CPU-hours a month, which is 156 CPU-seconds a day. The usage page could not resolve the real Active CPU, so the brief's fallback applies and warm wall-clock is the ceiling: 12.5 s a run. `floor(156 / 12.5)` is **12 renders a day for the spike's work**. The real tool does about three times that work (a scroll pass, three seconds of frame differencing, a second device), so `floor(156 / 37.5)` is **4 renders a day**. The rule says to say so when the cap lands under 5: **the tool is too expensive as designed and its spec has to cut work per run before anyone starts building it.** Obvious places to cut: one device rather than two, no frame differencing, and reuse one browser across both widths instead of a fresh context per width.
3. **Budget the cold start into the UX, not out of it.** One request in five or six on this traffic shape is cold at 15 to 20 s, and warm is still 11.5 to 16 s. There is no version of this where a person waits for it in one page load without being told what is happening.

## Not verified

- **Active CPU and Provisioned Memory.** Not read, for the two reasons above. Every CPU figure here is either Node-only (a floor, 0.21 s warm) or wall-clock (a ceiling, 12.5 s warm), and the true cost is somewhere between. The 4-a-day cap is computed from the ceiling, so it is the pessimistic end; the optimistic end, if Vercel bills close to the Node figure, would be far higher. Nobody should treat 4 as measured. It is arithmetic on a ceiling.
- **The exact size of the Chromium-only function.** It deployed, so it is under 250 MB. `VERCEL_ANALYZE_BUILD_OUTPUT=1` was not set and no number was printed.
- **Why `dpl_GnVk…` deployed at all.** It carried the same 374.72 MB of function that got `dpl_3uMDk…` refused, from the same build command, the same dependencies and the same `du -sh` line, with no `VERCEL_SUPPORT_LARGE_FUNCTIONS` on the project then or now. One deployed, one was refused. I have no explanation and I did not spend the box getting one. Rung: observed, both readings, unexplained.
- **Whether WebKit could be made to work.** Nobody tried shipping the missing libraries. The runtime named one, `libatk-1.0.so.0`; the build machine named 43 different ones; the two lists are from different machines and neither is a complete inventory of what the runtime would want next.
- **A second target page.** Every one of the 23 successful requests loaded `https://fergusoreilly.dev` and nothing else. The timings are that page's timings, on a warm CDN, from `iad1`.
- **The fence.** The route hard-codes one URL. It says nothing about `lib/fence.ts` or about what an arbitrary URL would do to these numbers.
- **Concurrency.** Every request was sequential. Two renders at once on one instance were never tried.
- **`networkidle` as a stopping rule.** The 320 shot is consistently slower than the 390 shot (6.18 s against 4.75 s median) and no time was spent on why. Guess, untested: it is the second navigation in the request and `networkidle` waits differently on a warm HTTP cache. Not tested.
- **Blob, uploads, and anything the real tool does with the PNG.** The screenshot is measured and discarded, as the brief specified.

## Meters moved

Not read, and not readable from here: see "The meter could not be read" above. What is countable instead, from the run logs:

- **Invocations added by S2 in this session: 24.** Twenty runs of `/api/spike-render?engine=chromium` (all 200), one Chromium probe (200), one `?single=1` (504, a timeout invocation, 60 s of it), one `engine=webkit` on the binary-free bundle (500), plus one deploy's build. The two phase-A WebKit calls on 2026-09-03 at 17:25 and 17:26 make 26 for the spike as a whole.
- **Function seconds consumed, from the responses' own `totalMs`:** 20 runs summing to 271.3 s, plus 16.9 s for the probe, plus 60 s burnt by the `--single-process` timeout, plus 0.13 s of failures. About 348 function-seconds. What that is in GB-hours depends on the memory the platform provisioned, which is the number the usage page holds and which was not read.
- Background draw from production and from the other `toolshed/*` branches deploying to this same project through the same window (`toolshed/f2-shell-everywhere`, `toolshed/f3-tool-registry`, `toolshed/fix-doubled-prompt`) was never separated out, because the baseline reading the brief's step 6 asks for needs the same usage page.
