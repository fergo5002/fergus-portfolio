# Tools rebuild

Fergus requested an audit, a fresh product/design plan, implementation and production deployment on 5 September 2026. Scope: the five public tools and their index. Preserve the CRT shell, browser privacy, existing routes, free hosting and user-owned worktrees.

## Audit and product decisions

Live Chromium audit at 1440 × 1000, reduced motion, commit 2be67e7: all six routes return 200 and no application exceptions. That proves loading, not usability. Index height 1,861px; Drift 4,661px; Overlap 4,312px. Screenshots captured locally under .phone-check/before. Vercel environment metadata confirms no room-code storage or budget secret.

| Tool | Problem and opportunity | Implementation |
| --- | --- | --- |
| Index/shared page | Long descriptions with no visible outputs; excessive spacing; developer vocabulary | Purpose-led cards with illustrative instrument previews, short task descriptions, direct links; compact page header and work surface; readable opaque panels over the CRT; native disclosure for detailed limitations |
| Headline Check | Needs a public site before the value is apparent; no local markup workflow | Keep server/no-JS URL flow; add a bounded local HTML test bench, working and broken examples, live comparison and copyable fix. Never execute pasted markup |
| Drift | Requires a manual multi-piece format; demo and visitor work can look similar; unbounded analysis; editing leaves old figures | Word/piece readiness, text limits, explicit stale-report state, descriptive comparison against own spread, downloadable report, clearer primary actions and compact methodology |
| Relief | Attractive output buried; no way to explore values; failed imports leave the previous plate/export attributed to the new source | Bring plate forward; keyboard-accessible week/hour explorer with original counts; preserve generated example identity; disable stale exports on failed/unfinished imports; expose export details on demand |
| Overlap | Room codes cannot work on current deployment; too much explanation; no useful one-computer route | Add exact local two-file comparison with demo, search and CSV export; keep peer mode with its full privacy explanation and manual signalling; make room availability explicit before offering controls |
| Second Visit | Demo requires setup; optional mapping overwhelms; required select has no unselected option; stale results; worker errors can hang | One-click demo analysis; compact required mapping, expandable optional mapping and model controls; selectable return horizon; named actionable export groups; invalidate stale results; handle worker error/disposal and overlapping requests |

## Delivery sequence

- [x] Add failing behavioural tests for local comparison, input/readiness bounds and asynchronous failure handling.
- [x] Implement shared workbench, index and clearer tool copy.
- [x] Implement and verify all five workflows with synthetic inputs in Chromium.
- [x] Production build, full tests/types and phone checks (WebKit 390/320 and slow Chromium).
- [x] Browser regression script: examples, successful imports, import failures, stale results, downloads, mobile overflow and console errors. Inspect screenshots.
- [ ] Required mutation catalogue on the final release commit.
- [ ] Commit, push review branch, open PR, complete GitHub checks, merge normally and verify Vercel production SHA/READY/alias.
- [ ] Repeat changed workflows on the public domain; update progress and durable personal-site memory.

## Boundaries

No new paid service, tracking, automatic saves or dependency. Local comparison requires two files the visitor is entitled to use and makes no peer privacy claim. Peer mode remains direct WebRTC without TURN; local automated two-context proof does not prove two real networks. Statistical estimates remain uncalibrated and show their limits. Emulated browsers do not prove physical phones or physical printers. Code goes through the existing pull-request route; deployment is explicitly authorised in this request.

## Verification record

Full local suite: 2,436 passed, two existing Redis-gated skips; 138 passing files. Production build generates 43 routes. The local phone instrument caught every planted fault; all six tool/index routes passed all three profiles. GitHub `check` and `phone` passed at `85c83b1` and `0fce3d3`; the final parser correction in PR #14 requires another complete gate before release.

The headline regressions were seen red: 6,000 nested spans caused a stack overflow, and unfinished quoted attributes exceeded a two-second worker deadline. The iterative reader and disjoint tag-scanning alternatives pass these cases and the existing interpretation cases. Browser checks assert the actual extracted words after nested and malformed inputs. The URL form passes with JavaScript on and off, preserving the URL. Local CSV comparison, profile editing, report downloads, all three terrain exports, successful historical CSV import, retention demo/file equivalence and stale-result refusals have browser proof. No synthetic visitor text appeared in POST bodies during these workflows.

Windows' default headless Chromium graphics driver produced a reflected textarea artefact in the CRT background. Repeating the same page with SwiftShader removed it without a site change. Windows WebKit also reports cancelled prefetches as access-control exceptions during forced cross-page replacement; its individual workflows complete, while the complete Linux CI WebKit suites pass. A separate WebKit check followed all five actual index links and their back links with no application errors. These are recorded limits of the local harness, not a claim of physical-device coverage. Vercel previews require sign-in, so public smoke verification follows the production merge.
