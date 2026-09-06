# Phone polish and UI glitch pass: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fergusoreilly.dev work properly on phones and remove the load-time glitches every visitor sees, then prove it on real mobile engines and in production.

**Architecture:** Every fix is inside the existing system: `app/globals.css` for the shell, the three motion components for the load flash, `lib/boot.ts` for the shorter phone boot, the shader for the rain, the command registry for `help`, and `scripts/phone-check.mjs` for the instrument. No new dependencies. Each task carries its own test in the file that already guards that area.

**Tech Stack:** Next.js 15 App Router, React 19, hand-written CSS, vitest, Playwright (WebKit + Chromium device emulation) for the phone instrument.

## Global constraints

- Retired names (Firespark, Hearth, Sauna OS) never reach anything a person reads.
- All motion stays gated on `prefers-reduced-motion`; under `reduce` nothing here changes.
- No copy in components; `content/` owns copy.
- No cookies or storage added. The nav scroll position is not persisted.
- `globals.css` stays the shell's stylesheet.
- Every CSS floor lives on the input it is about: 44px targets on `(hover: none)`, room on `(max-width: 768px)`.
- The public repo ships from `main` through a PR; `check`, `mutation` and `phone` must pass.

## The audit this answers (2026-09-06, live site, real engines)

| # | Finding | Where | Rung |
|---|---|---|---|
| 1 | Six nav links in a 390px bar: "cd tools" and "cd mcp" off-screen, unreachable; "cd writing" clipped | every route, iPhone 13 WebKit and Pixel 5 Chromium | observed, measured (links end at 551px in 390) |
| 2 | Status bar: `$` prompt bottom-aligned while the rest is centred; pwd squeezed to 11px ("~…"); readouts under the sound button on tool routes | every route, both engines | observed, measured |
| 3 | Hard load: page paints, then at hydration (2.5s desktop GPU, 4s throttled Pixel) titles and hero name flip to scrambled glyphs; every raster block is opacity 0 until then | every route | observed on headed Chromium and throttled Pixel; mechanism read from the code |
| 4 | `help` output wraps into a mess in a 38-column phone terminal | drawer and inline | observed |
| 5 | `/mcp` endpoint box clips at the right edge | /mcp | observed |
| 6 | Contact validation scrolls the invalid field under the fixed nav | /contact | observed |
| 7 | The shader rain reads as coarse blocky noise on phones (32 cells at 0.6 dpr) | every route | observed on both engines, headless (software GL renders the same image) |
| 8 | The 6.4s boot plays in full on phones | / | read from the code, confirmed by the 8s black screenshot |
| 9 | The phone instrument passes with two links off-screen, and CI only drives `/tools*` | scripts/phone-check.mjs, ci.yml | observed: "offscreen" lines on a passing run |

Fergus's decisions (2026-09-06): nav keeps the `cd` labels and scrolls sideways with an edge fade; animations only run on in-site navigation, never re-hiding a hard load; rain toned down on phones; boot shortened to about two seconds on phones.

---

### Task 1: The phone instrument learns "unreachable" and drives every route

**Files:**
- Modify: `scripts/phone-check.mjs` (auditInPage, CHECKS, routesFromSitemap, selfTest)
- Modify: `scripts/phone-check-fixtures/bad.html`, `scripts/phone-check-fixtures/good.html`

**Interfaces:**
- Produces: a new failure kind `unreachable` in the summary table and `FAIL` lines. A visible `a, button, input, select, textarea` whose box extends past either side of the viewport, with no ancestor that scrolls horizontally, fails. Inside `[aria-hidden="true"]` is ignored.
- Produces: `routesFromSitemap` returns every non-article route plus the two newest article routes.

- [ ] **Step 1: Plant the faults in the fixtures.** In `bad.html` add, inside `<body>`: `<a id="offscreen-link" href="#" style="position:absolute;left:420px;top:600px;width:60px;height:48px">off</a>`. In `good.html` add a scroll container with a link past its edge: `<div id="rail" style="overflow-x:auto;width:200px;white-space:nowrap"><a href="#" style="display:inline-block;width:150px;height:48px">a</a><a id="rail-link" href="#" style="display:inline-block;width:150px;height:48px">b</a></div>`.
- [ ] **Step 2: Extend the self-test expectations.** In `selfTest`, add `["unreachable", "a#offscreen-link"]` to the bad list, and assert `good` does not report `unreachable` on `a#rail-link` (it already asserts zero failures on good).
- [ ] **Step 3: Run `node scripts/phone-check.mjs --self-test --out .phone-check`.** Expected: FAIL, "unreachable on a#offscreen-link was not caught".
- [ ] **Step 4: Implement.** In `auditInPage`, after the tap-target loop:

```js
// 3b. Reachability. Off the side of the viewport with nothing to scroll is a
// control nobody can press. This is how two nav links shipped invisible on
// every phone while the overflow check stayed green: a fixed bar does not
// widen the document.
const scrollsSideways = (el) => {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 1) return true;
  }
  return false;
};
for (const el of document.querySelectorAll("a, button, [role=button], input, select, textarea")) {
  if (!visible(el) || el.type === "hidden" || el.closest("[aria-hidden=true]")) continue;
  const r = el.getBoundingClientRect();
  if (r.right <= viewportWidth + 1 && r.left >= -1) continue;
  if (scrollsSideways(el)) continue;
  failures.push({ check: "unreachable", el: path(el), detail: `${Math.round(r.left)}..${Math.round(r.right)}px in a ${viewportWidth}px viewport` });
}
```

Add `"unreachable"` to `CHECKS` after `"tap-target"`. Change `routesFromSitemap` to keep every path that does not start with `/writing/`, plus the first two `/writing/` paths in sitemap order.

- [ ] **Step 5: Run the self-test again.** Expected: pass, and the header comment lists `unreachable` with the other checks.
- [ ] **Step 6: Commit** `git commit -m "phone-check: fail on controls off the side of the viewport, drive every route"`.

### Task 2: The phone nav scrolls sideways and shows its edge

**Files:**
- Modify: `app/globals.css` (the `@media (max-width: 768px)` nav block)
- Modify: `components/Nav.tsx` (scroll the active link into view)
- Test: `app/globals.test.ts`

- [ ] **Step 1: Failing test.** In `app/globals.test.ts` add a `describe("the phone nav scrolls rather than clips")` using the existing `mediaBlocks("(max-width: 768px)")` helper: expect the block to contain `.nav__list` with `overflow-x: auto`, `scrollbar-width: none`, a `mask-image` fade, and NOT `justify-content: space-between` on `.nav__list`.
- [ ] **Step 2: Run** `npx vitest run app/globals.test.ts`. Expected: FAIL on `overflow-x: auto`.
- [ ] **Step 3: CSS.** Replace the nav part of the 768 block:

```css
  .nav {
    font-size: 0.8rem;
    gap: 0;
    padding: 0;
    justify-content: flex-start;
    overflow: hidden;
  }
  .nav__prompt { display: none; }
  /* Six links do not fit in 390px. The list scrolls, the bar does not, so the
     reading-progress line drawn on `.nav::after` stays put. The mask fades the
     last 32px so a clipped link reads as "more this way" rather than as the
     end; the list's own right padding is the same 32px, so when it is scrolled
     to the end the fade sits over padding and "cd mcp" is whole. */
  .nav__list {
    display: flex;
    gap: var(--sp-1);
    width: 100%;
    padding: 0 32px 0 var(--sp-2);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 32px), transparent);
  }
  .nav__list::-webkit-scrollbar { display: none; }
  .nav__list li { flex: none; }
  .nav__link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 var(--sp-2);
  }
```

- [ ] **Step 4: Nav.tsx.** Add a ref on the active `<li>` and an effect that, when the active link's right edge is past the list's `clientWidth` or its left is negative, sets `list.scrollLeft = link.offsetLeft - 16`. No `scrollIntoView` (it can move the page).
- [ ] **Step 5: Run the test and `npx tsc --noEmit`.** Expected: pass.
- [ ] **Step 6: Commit** `git commit -m "nav: scroll the list sideways on phones with an edge fade"`.

### Task 3: The phone status bar

**Files:**
- Modify: `components/system/StatusBar.tsx` (class on the uptime segment, short pwd)
- Modify: `app/globals.css` (the two touch blocks and the 768 shell block at the end of the file)
- Test: `app/globals.test.ts`, `components/chrome.test.ts`

- [ ] **Step 1: Failing tests.** In `globals.test.ts`, in the touch bar describe: expect the 768 block NOT to contain `align-items: flex-end` for `.statusbar__prompt`; expect it to contain `.statusbar__up` and `.statusbar__pwd` with `flex: 1 1 auto`. In `chrome.test.ts` add: `StatusBar` renders the working directory as `~/…/last-segment` for a path with more than one segment (the component reads `usePathname`; the test renders through `renderToStaticMarkup` with the mock already used in that file for `usePathname`).
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: StatusBar.tsx.** Add `className="statusbar__seg statusbar__up"` on the uptime span. Compute `const pwd = shortPwd(path)` from a new pure `shortPwd(path: string): string` in `lib/system.ts`: `/` → `~`; one segment → `~/seg`; more → `~/…/last`. Test it in `lib/system.test.ts` (three cases).
- [ ] **Step 4: CSS.** In the `(max-width: 768px)` block at the end of the file replace the prompt rule with:

```css
  .statusbar { overflow: hidden; gap: var(--sp-2); padding: 0 var(--sp-2) 0 var(--sp-3); }
  .statusbar__readouts { display: flex; align-items: center; gap: var(--sp-2); flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; }
  .statusbar__pwd { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .statusbar__up { display: none; }
  .machine { flex: none; }
  .statusbar__prompt { flex: none; align-self: stretch; align-items: center; justify-content: center; min-width: 44px; padding: 0 10px; }
```

And in `(hover: none) and (max-width: 768px)` remove the `.statusbar__pwd` truncation rule (it moved up), keep `.statusbar__mem { display: none }`. Add `@media (max-width: 360px) { .statusbar__brand { display: none; } }`.

- [ ] **Step 5: Run tests.** Expected: pass. The existing test "truncates the working directory for room rather than for thumbs" changes to look in the 768 block.
- [ ] **Step 6: Commit** `git commit -m "statusbar: a bar that fits a phone"`.

### Task 4: Animate only what the visitor has not seen

**Files:**
- Create: `lib/navigation.ts`, `lib/navigation.test.ts`
- Modify: `components/system/RouteTransition.tsx` (call `markNavigated()` on a path change)
- Modify: `components/motion/RasterReveal.tsx`, `components/Scramble.tsx`, `components/motion/HeroName.tsx`
- Modify: `app/globals.css` (`.raster` pre-hide rule)
- Test: `app/globals.test.ts`, `components/motion/RasterReveal.test.ts` (new, greps)

- [ ] **Step 1: Failing tests for the module.**

```ts
import { describe, expect, it } from "vitest";
import { LATE_HYDRATION_MS, isLateHydration, markNavigated, resetNavigationForTests } from "@/lib/navigation";
describe("late hydration", () => {
  it("is late when the document painted long before the effect ran", () => {
    resetNavigationForTests();
    expect(isLateHydration(LATE_HYDRATION_MS + 1)).toBe(true);
  });
  it("is not late on a fast hydration", () => {
    resetNavigationForTests();
    expect(isLateHydration(LATE_HYDRATION_MS - 1)).toBe(false);
  });
  it("is never late once the visitor has navigated inside the site", () => {
    resetNavigationForTests();
    markNavigated();
    expect(isLateHydration(60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/navigation.ts`.** `LATE_HYDRATION_MS = 400`; module-level `navigated = false`; `markNavigated()` sets it and, when `document` exists, adds `navigated` to `<html>`; `isLateHydration(now = performance.now())` returns `!navigated && now > LATE_HYDRATION_MS`; `resetNavigationForTests()`.
- [ ] **Step 4: RouteTransition.** After the `firstRender` guard, call `markNavigated()` before the focus work.
- [ ] **Step 5: CSS.** Replace `html.js .raster:not(.is-revealed) { opacity: 0; }` with `html.navigated .raster:not(.is-revealed), .raster.is-unseen { opacity: 0; }` and add `.raster.is-instant, .raster.is-instant .raster__beam { animation: none; }` inside the same motion block. Add a `globals.test.ts` case: the motion block no longer pre-hides on `html.js` alone, and contains `html.navigated .raster`.
- [ ] **Step 6: RasterReveal.** In the effect, before creating the observer: if `isLateHydration()`: measure `el.getBoundingClientRect()`; if it intersects the viewport, add `is-revealed is-instant` and return; otherwise add `is-unseen` and continue to the observer (which adds `is-revealed`, and the CSS animation runs from opacity 0 because `is-unseen` is removed at the same time; remove it in `reveal()`).
- [ ] **Step 7: Scramble.** For `trigger === "mount"`, if `isLateHydration()` then `setDisplay(text)` and return (no timers). `trigger === "view"` is unchanged: a heading below the fold has not been seen.
- [ ] **Step 8: HeroName.** If `isLateHydration()` skip the immediate `run()` and keep the 20s interval.
- [ ] **Step 9: Greps in a new `components/motion/RasterReveal.test.ts`:** the three components import `isLateHydration`; the reveal adds `is-instant`; RouteTransition calls `markNavigated`.
- [ ] **Step 10: Run the suite and `npx tsc --noEmit`.** Expected: pass.
- [ ] **Step 11: Commit** `git commit -m "motion: never re-hide or re-scramble content a hard load already painted"`.

### Task 5: A two-second boot on phones

**Files:**
- Modify: `lib/boot.ts`, `lib/boot.test.ts`, `components/BootSequence.tsx`

- [ ] **Step 1: Failing tests.** In `boot.test.ts`:

```ts
describe("the phone boot", () => {
  it("is a real profile with a floor near two seconds", () => {
    expect(bootFloorMs(PHONE_BOOT)).toBeLessThan(2600);
    expect(bootFloorMs(PHONE_BOOT)).toBeGreaterThan(1500);
  });
  it("keeps the full boot's floor exactly where it was", () => {
    expect(bootFloorMs(FULL_BOOT)).toBe(BOOT_FLOOR_MS);
  });
  it("picks the phone boot for a coarse pointer or a narrow window, and the full boot otherwise", () => {
    expect(pickBootProfile({ coarse: true, width: 1440 })).toBe(PHONE_BOOT);
    expect(pickBootProfile({ coarse: false, width: 390 })).toBe(PHONE_BOOT);
    expect(pickBootProfile({ coarse: false, width: 1440 })).toBe(FULL_BOOT);
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL, exports missing.
- [ ] **Step 3: Implement.** In `lib/boot.ts` add `type BootProfile = { headLines, deviceLines, strikeMs, headSpeedMs, deviceSpeedMs, memoryMs, barMs, handoffMs }`; `FULL_BOOT` built from the existing constants; `PHONE_BOOT = { headLines: [HEAD_LINES[0]], deviceLines: [DEVICE_LINES[0], DEVICE_LINES[5]], strikeMs: 360, headSpeedMs: 7, deviceSpeedMs: 6, memoryMs: 360, barMs: 320, handoffMs: 220 }`; `bootFloorMs(profile)`; `BOOT_FLOOR_MS = bootFloorMs(FULL_BOOT)`; `pickBootProfile({ coarse, width })` returns `PHONE_BOOT` when `coarse || width < 768`.
- [ ] **Step 4: BootSequence.** Read `profile` once on mount (`useRef` set in the mount effect from `window.matchMedia("(pointer: coarse)").matches` and `window.innerWidth`) and use its lines and timings in place of the constants.
- [ ] **Step 5: Run `npx vitest run lib/boot.test.ts`.** Expected: pass, including the existing floor-vs-watchdog assertion.
- [ ] **Step 6: Commit** `git commit -m "boot: about two seconds on a phone"`.

### Task 6: Finer, quieter rain on phones

**Files:**
- Modify: `components/system/PhosphorScreen.tsx` (present shader `rain()` and its callers)
- Test: `components/system/PhosphorScreen.test.ts`

- [ ] **Step 1: Failing test.** `it("draws the rain finer and dimmer on a phone")`: the present source contains `mix(54.0, 48.0, uMobile)` and `uRain * mix(1.0, 0.55, uMobile)`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Change `cols` to `mix(54.0, 48.0, uMobile)` and multiply every `* uRain` in the present pass by `mix(1.0, 0.55, uMobile)` through one `float rainGain = mix(1.0, 0.55, uMobile);` declared once in `tubeImage`.
- [ ] **Step 4: Measure the pixels** on the iPhone 13 WebKit emulation against a local production build: mean luminance of the rain in a text-free strip of `/writing` before and after (script in the scratchpad; record both numbers in PROGRESS.md).
- [ ] **Step 5: Commit** `git commit -m "phosphor: finer, dimmer rain on phones"`.

### Task 7: `help` that fits a phone terminal

**Files:**
- Modify: `lib/commands/registry.ts` (`helpLines(defs, opts)`), `lib/commands/info.ts` or wherever `help` runs, `lib/commands.ts` (`CommandContext.cols`), `components/Terminal.tsx`
- Test: `lib/commands.test.ts`

- [ ] **Step 1: Failing test.** `it("lays help out in one column when the terminal is narrow")`: `runCommand("help", { ...ctx, cols: 40 }).lines` contains a line that is exactly `    gravity` and the next line starts with six spaces and `drop the page`; and no line is longer than 40 characters except the two shell footers, which are split at the dots.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `helpLines(defs, { narrow = false } = {})`: in narrow mode, split each `d.help` at `/\s{2,}/` into `[name, desc]` and emit `    ${name}` then `      ${desc}`; split each `HELP_FOOT` line at ` · ` into chunks that fit 40 columns. `help`'s `run(ctx)` passes `{ narrow: (ctx.cols ?? 80) < 60 }`. `CommandContext` gains `cols?: number`. Terminal measures once per submit: a hidden `<span class="term__probe">` of 20 zeros inside `.term__scroll`; `cols = Math.floor(scroll.clientWidth / (probe.width / 20))`.
- [ ] **Step 4: Run the suite.** Expected: pass, `HELP_LINES` unchanged for the wide case (its existing test still passes).
- [ ] **Step 5: Commit** `git commit -m "help: one column when the terminal is narrow"`.

### Task 8: Small fixes: mcp endpoint, contact scroll margin, terminal placeholder

**Files:**
- Modify: `app/mcp/page.tsx`, `app/globals.css`
- Test: `app/globals.test.ts`

- [ ] **Step 1: Failing test.** `globals.test.ts`: `.cform__input` declares `scroll-margin-top`; `.prose__pre--wrap code` declares `white-space: pre-wrap`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add `scroll-margin-top: calc(var(--nav-h) + var(--sp-3));` to `.cform__input` and `.term__input`. Add `.prose__pre--wrap code { white-space: pre-wrap; word-break: break-all; }` and put the class on the endpoint `<pre>` in `app/mcp/page.tsx`.
- [ ] **Step 4: Run tests.** Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "mcp, contact: wrap the endpoint, keep an invalid field out from under the nav"`.

### Task 9: Prove it

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` clean.
- [ ] `node scripts/mutation-check.mjs` (touches `boot`, `commands`, `PhosphorScreen` guards).
- [ ] Docker prod-parity build (`Dockerfile.parity`) serves the site; phone-check against it with `--from-sitemap`: zero failures, no `unreachable`, and the nav links reported reachable.
- [ ] Scratchpad scripts against the local build: iPhone 13 WebKit and Pixel 5 screenshots of every route, drawer open, `help` in the drawer, boot on a coarse pointer under 2.6s to `booting` cleared, headed Chromium scramble timeline on a hard load shows no flip after first paint.
- [ ] Open the PR, wait for `check`, `mutation`, `phone`; merge; read `readyState`/`aliasAssigned` from the Vercel API; rerun the phone screenshots against `https://fergusoreilly.dev`.
- [ ] Update `docs/PROGRESS.md`, `AGENTS.md` (phone-check now covers every route and fails on `unreachable`; the load-flash rule), and the two ledgers.

### Task 2b: `cd arcade` in the nav on every route (Fergus, 2026-09-06)

**Files:**
- Create: `lib/shell-request.ts` (a pending-command store), `lib/shell-request.test.ts`
- Modify: `components/Nav.tsx` (a `cd arcade` control after `cd mcp`), `components/Terminal.tsx` (runs a pending request on mount and on change), `components/ShellDrawer.tsx` (nothing: opening the drawer mounts the Terminal, which drains the request)
- Test: `lib/shell-request.test.ts`, `components/chrome.test.ts` (the nav renders `cd arcade` as a button, not a link, because there is no page)

- [ ] **Step 1: Failing test.** `requestCommand("cd arcade")` then `takeRequest()` returns `"cd arcade"` and a second `takeRequest()` returns `null`; subscribers are notified on request.
- [ ] **Step 2: Implement** `lib/shell-request.ts`: module-level `pending: string | null`, `requestCommand(cmd)`, `takeRequest()`, `subscribe(fn)`.
- [ ] **Step 3: Nav.** After the route links, a `<li>` with `<button type="button" className="nav__link nav__link--cmd" onClick={() => { requestCommand("cd arcade"); summonShell(); }}>cd arcade</button>`. On the home page `summonShell` focuses the inline terminal; elsewhere it opens the drawer. `nav__link--cmd` resets the button chrome to match a link.
- [ ] **Step 4: Terminal.** An effect subscribed to the request store: on mount and on each notification, `const cmd = takeRequest(); if (cmd) run(cmd);`. The inline terminal on `/` and the drawer terminal are never mounted together, so one consumer drains it.
- [ ] **Step 5: Tests green, commit** `git commit -m "nav: cd arcade on every route"`.
