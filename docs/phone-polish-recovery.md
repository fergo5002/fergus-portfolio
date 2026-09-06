# Phone polish recovery, 6 September 2026

Fergus asked Codex to find the interrupted Claude session and continue from its exact stopping
point. This record separates recovered evidence from checks performed after recovery.

## Source and preserved work

- Session: `5d32da86-0162-43ca-aafd-6934e9e73941`, in
  `C:\Users\oreil\.claude\projects\C--Dev-fergus-portfolio`.
- Original checkout: `C:\Dev\fergus-portfolio`, branch `phone-polish`, head `1e4dd0c`.
- Original request began at 11:29 Dublin time. The limit interrupted work at 13:10 on
  6 September 2026. The final background mutation check subsequently completed.
- The original request explicitly included fixing and deploying the work. Fergus's
  continuation request resumes that scope through the repository's normal release gates.
- Six commits follow `f4cc357`: `5969eae`, `bf1686c`, `7154fbd`, `aa61438`, `b3e3141`,
  and `1e4dd0c`. They cover the phone instrument, nav and arcade door, status bar,
  hydration/reveals, shorter phone boot, rain, help, MCP wrapping and article template.
- Three uncommitted files were copied byte-for-byte into the recovery checkout:
  `AGENTS.md`, `app/globals.css`, and `app/globals.test.ts`. Original copies are retained
  under `.codex/phone-polish-recovery/source-snapshot/`. The snapshot test has a `.txt`
  suffix so Vitest cannot discover it as a second test file.
- The original checkout, including its modified `CLAUDE.md`, untracked `.codex/` and
  `scripts/analytics.mjs`, is untouched. Claude instructions were not adopted by Codex.
- Recovery branch: `codex/phone-polish-recovery`, in
  `C:\Users\oreil\.codex\worktrees\95fb\fergus-portfolio`.
- Current `origin/main` included `c029de1`, the five-studio release, so recovery merged
  that commit. The phone instrument's conflict combines clipped-text sampling with the
  studio scroll-panel checks. Both sets of planted regression fixtures remain.
- The subsequent documentation/Atlas-check correction `3d9b44c` was also merged. Original
  source remains at `1e4dd0c`; all three recovered files still match their snapshots by hash.

## Decisions recovered from Fergus's answers

- Keep the `cd` labels and scroll the phone nav sideways.
- A hard load keeps already visible words and blocks readable through hydration;
  in-site navigation and unseen content retain their effects.
- Tone down the rain on phones.
- Shorten the phone boot to about two seconds, retaining the full desktop profile.
- Fergus's additional message at 11:55 asked for `cd arcade` globally. It runs through
  the existing terminal, including when the drawer is already open.

The original edge fade was removed after the phone instrument measured the partially
clipped link at 1.23:1. The recovered implementation uses a clipped, scrolling row with
scroll snapping. It does not shorten the labels or introduce a menu.

## Exact stopping point

The final uncommitted batch lifts secondary text colour on touch for all three themes,
removes glow from small secondary lines, and gives terminal chips/input/label and contact,
experience/project and article-footer links at least 44px height. Its four tests failed
before implementation. Afterwards, 102 focused tests passed and TypeScript produced no
diagnostic in the recorded command. It had no fresh production build or browser check.

Earlier evidence belongs to the tree before that last batch:

- 2,587 passing tests and a production build.
- A full route phone scan still failing on small targets and dim text. The quoted
  transcript's successful background exit only means its wrapper command finished;
  it does not mean the phone audit passed.
- A code review found that slow hydration could re-hide blocks already scrolled past,
  and view-triggered headings could scramble after being read. `b3e3141` fixes both.
- The final filtered mutation command caught 11/11 cases: six degauss cases plus help,
  status-bar costume, arcade visibility, the arcade `cd` door and the backtick guard.
  This was not the complete mutation catalogue.
- The saved headed Chromium timeline shows one title value on a hard load. Its measured
  desktop rates were 60 to 61 frames/s; the throttled Pixel proxy reported 55 to 59
  scrolling frames/s. Those are historical measurements, not a new performance claim.
- The earlier rain screenshot comparison reported bright-pixel share changing from
  0.0024 to 0.0019, maximum channel-weighted brightness from 106.3 to 69.9, and three to
  nine bright connected regions. Mean values were 15.23 and 15.32. This was a single
  composited screenshot comparison, not a controlled time series or `gl.readPixels` proof.

## Remaining verification at recovery

- [x] Full tests on the final tree: 2,669 passes, three opt-in skips; TypeScript passes.
- [x] Final production build after the route and focus fixes: 49 generated pages.
- [x] Phone instrument planted-fault proof, including both merged fixture sets and the
  clipped-parent honeypot, on all three browser profiles.
- [x] Every sitemap route family, two article examples and all public tools on WebKit
  at 390/320 and throttled Chromium: 19 routes per profile, 57 checks, zero failures.
- [x] Real browser checks of nav reachability, drawer/help, arcade entry/exit, status-bar
  geometry, validation position and hard-load/in-site motion.
- [x] All six arcade games on both WebKit widths and Chromium: touch, pause/resume,
  measured sizing, Escape, scrollback/focus recovery and reduced motion.
- [x] All 220 current mutation cases caught across the recorded checks; final diff reviewed.
- [x] Update the living progress record and shared-vault worktree/evidence notes.

## Recovery corrections

The first recovered production build reproduced a further contact issue on both WebKit
phone sizes: native validation focused the empty name field but left it above the viewport,
despite a computed 60px field scroll margin. After settling, the 320px probe measured the
field top at -10.17px. Adding document scroll padding kept the field below the nav in the
same browser. The CSS guard failed before this correction; the final browser driver also
waits for the native scroll to settle and never scrolls the invalid field itself.

Secondary-colour headroom is now checked against page and panel backgrounds on all three
themes. Ten additional mutation cases cover these colours, terminal tap height, document
scroll padding, phone boot selection, both rain constants and the two late-hydration guards.

The expanded audit also found that the earlier mobile contact font rule lost to a later
`font: inherit`: WebKit measured 15px text and 41px inputs. The touch rule now follows the
base declaration, with 16px text and 44px input/label targets. The standalone RSS link also
gets a 44px target. Experience and writing-index separator dots follow the existing article
convention: empty spans with CSS-generated decoration. Four new tests failed before these
fixes and passed afterwards; six mutation cases cover the corresponding regressions.

The contact honeypot was an instrument false positive: its input has a normal layout box
inside a clipped 1px parent. The new good fixture failed with two false alarms on all three
profiles before the audit checked the ancestors' clipping box. Afterwards it passed, while
the existing unreachable-control fault, scrollable rail, closed-details and clipped-text
fixtures continued to behave correctly. No accessibility floor or spam handling changed.

One fresh WebKit run lost both the arcade and its drawer on an immediate Escape. Four
instrumented repeats showed correct routing, so the observed failure was intermittent.
The room's initial focus previously ran in a passive effect; it now runs before first paint
in a layout effect, closing that interval. Its source-coupling guard failed before the change,
then passed with the shell/nav suite, and its mutation was caught. The browser driver keeps
keyboard/focus traces on a failure rather than silently retrying it.

The cold-boot driver observes the real animation, without speeding up timers. It distinguishes
a completed script from the existing 20-second watchdog recovery. In the final software-rendered
run, the visible WebKit phone pages completed in 5,573ms and 5,339ms; the visible desktop page
recovered through the watchdog at 20,471ms while still typing the first line. These are local
rendering measurements, not a two-second device guarantee or evidence of a completed desktop
animation. The shorter profile's timer floor and unchanged full profile are separately tested.

`scripts/phone-rain-check.mjs` reads the actual WebGL canvas over 60 frames at paired shader
times, replacing only the two phone rain constants for the before case. In the completed run,
phone mean channel-weighted brightness changed from 14.8724 to 14.0533 and peak from 139.5042
to 90.8056. Desktop means were identical at 12.8329 and peaks at 133.8584. These are controlled
local canvas samples, not a claim about real-network frame rates or every device.

The local full-catalogue mutation proof uses four temporary checkouts under
`C:\Users\oreil\AppData\Local\Temp\codex-phone-polish-01a076f1`. Four workers per checkout
caused an unchanged protocol timeout, so those failed baselines were discarded. One worker
per checkout passed all 2,664 tests. To avoid repeating the whole suite for every fault,
the temporary runners select tests by imports and source-reading guards, verify each test
group on clean source, and fall back to the full suite if a selected group survives. That first
catalogue had 213 cases. A stale status-bar anchor was repaired, then seven additional cases
and fresh full baselines brought the final catalogue to 220. The last baseline passes all
2,669 tests. The preparation scripts, source/test mapping and per-case proof mapping are
retained under `.codex/phone-polish-recovery/`; the committed CI runner retains its standard
full-suite behaviour.

The optional 15-second-harness rerun records 38/39 because its extra timeout rejection
misclassifies the fault that deliberately drops the first handshake frame. The ordinary
partition caught that fault; the retained direct microtask proof also shows `first frame`
arriving on clean source and no message under the exact catalogue mutation. Its exchange
tests time out by design. This exception is explicit, rather than rewriting the failed log.

Physical phones, real mobile keyboards and representative real-network performance require
device testing. There was no phone-polish pull request at recovery. The release uses a pull
request with the required `check`, `mutation` and `phone` gates, then verifies the exact merge
SHA, READY state, assigned aliases and canonical browser behaviour on the personal Vercel
project. Historical evidence and local checks above do not by themselves establish deployment.
