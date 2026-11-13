# Phones, wide screens and accessibility

Read this before changing layout, the nav, tap targets, contrast, any `(hover: none)` or `min-width` rule, `scripts/phone-check.mjs` or `scripts/wide-check.mjs`.

## Accessibility and the phone check (from "Stack & conventions")

- **Accessibility is non-negotiable:** every animation must be gated behind
  `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a
  static/instant fallback. Under `reduce`, Lenis is never mounted, the shader draws one static
  frame, and reveals apply instantly. Keep text contrast ≥ 4.5:1, alt text on images, visible
  focus. Every route in the sitemap (the first two articles standing in for the template) is
  driven through WebKit at 390 and 320 and a throttled Chromium in CI by
  `scripts/phone-check.mjs`, which fails on overflow, inputs under 16px, tap targets under
  44px, a control past either side of the viewport with nothing to scroll (`unreachable`),
  and sampled contrast under 4.5:1, and also on a route that leaves more than two text runs
  unread or whose photograph is not the layout its rectangles were measured in. A resized
  desktop window does not count. Its self-test pins every floor from both sides and asserts
  three hand-computed contrast ratios, so loosening one is red rather than quiet; read that
  file's header before changing a number in it. **Until 2026-09-06 it drove `/tools*` only
  and listed off-screen controls under `offscreen`, a category that never fails.** That is
  how "cd tools" and "cd mcp" shipped unreachable on every phone with the check green. Read
  the `offscreen` and `skipped` lines on a passing run: they are findings the instrument has
  not been taught to fail yet. It now also ignores the contents of a closed `<details>`
  (Chromium keeps them laid out) and clips a text run to its overflow-clipping ancestors, so
  an ellipsised path is read where it is drawn.
  **A `(hover: none)` rule is about the finger and applies on a 27" touchscreen too.** Pair it
  with a width when the rule is really about running out of room: the touch status bar block
  in `globals.css` was one block doing both and dropped a readout on any touchscreen, which
  the phone check cannot see because it only drives 320 and 390. `app/globals.test.ts` guards
  the split.

## On a phone the nav list scrolls sideways

**On a phone the nav list scrolls sideways** (2026-09-06, Fergus's call over shorter labels or
a menu). The `ul` scrolls and the fixed bar does not, so the reading-progress line on
`.nav::after` stays put; the list snaps to a link and `Nav.tsx` scrolls the active one into
view by writing `scrollLeft`, never `scrollIntoView`. There is deliberately no fade at the
trailing edge: the first version had one and the phone check read the clipped link under it at
1.23:1, which was correct. The cut is the affordance. `cd arcade` sits at the end of the row as a
`<button>` dressed as a link, because the arcade is not a page: it asks the shell to run the door
command through `lib/shell-request.ts` (one slot, taken once) and the Terminal mounted in the
common drawer runs it on every route. The drawer is opened with `open`, not
`toggle`, so a drawer that is already up stays up to run it.

## Wide screens: the page fills and tiles (2026-10-19)

Fergus's brief: on a wide monitor the site should fill at least three quarters of the screen and
look good at every size. His calls on the forks: more panes rather than a wider column, text stays
its laptop size, and the page stops growing at about 2700px so a 5120 super-ultrawide does not get
seven-column grids.

- **The width.** `.screen` is `clamp(var(--maxw), var(--maxw-fill), var(--maxw-cap))`: 1040px up
  to a 1300px screen, then 80% of it, capped at 2700px. The three tokens live at `:root`, never
  inside a query (a property declared only in a query voids every `var()` that reads it outside).
- **Where the rules live.** Each stylesheet that owns a route carries its own `wide screens`
  block at the end, so every override sits after the rule it overrides: route CSS loads after
  `globals.css`, and a wide rule for `.bench-grid` written in `globals.css` would lose to
  `workbench.css` at equal specificity. Every block is a `min-width` query of 1560px or more, so
  nothing a laptop or a phone renders changed. The queries key on the viewport, which is safe
  because the page width is a pure function of it (1560 gives 1200 of content, 1840 gives 1424,
  2300 gives 1792).
- **What tiles.** Home opens whoami, the highlights, about and a full-height terminal into panes,
  in four steps chosen so the hero name never wraps. Experience splits each commit into who and
  what, then from 2300px turns the log on its side, one column per commit. Projects go to three
  columns, and from 3000px each card lays its picture beside its words. Writing goes two then three
  across. Articles keep 68ch and put the contents and the way on in sticky margins (the body is
  one `.post__body` box so the contents can stand beside it for exactly its height). Contact puts
  the form beside the meeting cards; booking puts the calendar beside its fields. Tools put every
  tool on one row, and a tool's page moves its name and notes to a side panel from 2000px, the
  width where the stage beside it is wider than on a laptop. MCP tiles from 1840px, where the
  install line fits its pane. The 404's test card becomes most of the screen.
- **The instrument.** `scripts/wide-check.mjs` drives every sitemap route at 1600, 1920, 2560,
  3440 and 5120 and fails on overflow, fill (the brief as a number), overlapping panes, sideways
  scrollers, a wrapped hero name, a layout that should have tiled and did not (including its hook
  class going missing), and broken assets. `--self-test` plants one fault per check in
  `scripts/wide-check-fixtures/` and runs first in the `phone` job. `app/wide.test.ts` guards the
  tokens, the 1560px floor and the hooks.
- **Headless pictures lie about the tube.** On 2026-10-19 headless Chromium painted a bright green
  block over `/tools/drift`, live and local alike; a headed browser on a real GPU showed none. The
  shader is software-rendered there. The wide check measures boxes, never pixels, for that reason.
