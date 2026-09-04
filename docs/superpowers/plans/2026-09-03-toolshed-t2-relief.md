# T2 Relief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/tools/relief`: a year of activity drawn as contour ground the way an Ordnance sheet draws a hillside, from a GitHub account, from any CSV with a date column, or from a bundled demo, with a PNG, a strokes-only SVG in millimetres and a binary STL closed by the mesh edge check out the other side.

**Architecture:** Three sources produce the same tiny shape, `ReliefEvent = { week, hour }`, and everything after that is one pipeline: bucket into a 24 by 52 grid, take a percentile ceiling, compress with `log1p`, smooth twice, contour with marching squares lifted from Tigh Sauna's `terrain.ts`, chain the loose segments into polylines, then hand those polylines to three writers (canvas, SVG, STL). Every step is a pure function in `lib/tools/relief/` with a test beside it; the React is a single client component that picks a source, calls the pipeline and paints. CSV contents and exports stay in the tab. The GitHub path sends the username and token directly from the visitor's browser to `api.github.com`; the token lives in React state, goes into one `Authorization` header, and is never written anywhere.

## Post-review corrections

The independent review found eight gaps after the original task sequence below was implemented. The current source and tests supersede the older snippets where they differ:

- GitHub windows whose reported count exceeds the 1,000-result search ceiling, or whose response says `incomplete_results`, are bisected by calendar day until each query is below the ceiling. A saturated single day and a full tenth page both set `truncated`, and that truth reaches the visitor instead of claiming a complete year. The one-retry secondary-limit backoff remains unchanged.
- Unmounting the route aborts the active GitHub controller, including an interruptible pacing or secondary-limit wait.
- A CSV over 8 MiB is refused from its `File.size` before `File.text()` allocates it. The parser separately caps data rows at 200,000 and returns `capped`; that warning remains visible through automatic and manual column selection, including when the density guard refuses the result.
- ISO-shaped input is checked against the actual Gregorian calendar before `Date.parse`, including leap years, month lengths, minutes and seconds.
- PNG, SVG and STL export exceptions become a visible status message.
- The shared `privacyLine` override replaces the generic privacy line for this mixed local/GitHub tool, so the page does not print "Nothing leaves this tab" and contradict it underneath.
- Export copy claims only properties measured from the files: SVG units, strokes and groups; STL dimensions, binary layout and directed-edge closure. No physical plotter, slicer or printer is claimed.
- Ambiguous marching-squares cases 5 and 10 use the asymptotic decider. The paired saddle fixture holds the corner pattern constant while moving the bilinear saddle through the contour level, proving that the chosen diagonal changes for the geometry rather than for the case number.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest 2 (node environment, no jsdom), hand-written CSS, the browser's own `CanvasRenderingContext2D` and `Blob`. No new dependencies.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is T2 (section 6, wave 1). Its line, verbatim: "`/tools/relief`. A year of activity as contour ground drawn with `terrain.ts`: a GitHub username (commits, 52 weeks by 24 hours, using the visitor's own token pasted and never stored, because the unauthenticated API caps at 60 calls an hour), or any CSV with a date column. Out: PNG, SVG for a plotter, STL for a printer (two triangles a cell). Can't see: private repos without a token; commit times are the author's local time and the page says so."
- **No new dependencies.** Canvas is in the browser, an SVG is a string, and an STL is 84 bytes plus 50 bytes a triangle written into a `DataView`. The three obvious packages are refused on the record: `d3-contour` (marching squares is 40 lines and this repo already owns a proven copy), `three` or `three-stdlib` for `STLExporter` (hundreds of kilobytes of scene graph to serialise 4,988 triangles), `papaparse` (RFC 4180 is one state machine and the tool needs the header row and nothing else). If a later reviewer believes one is unavoidable, the alternative is always the hand-written module already in this plan, and the argument goes on the pull request before the install.
- vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`. No jsdom, so no React component can be mounted. Every piece of maths lives in `lib/tools/relief/*.ts` as a pure function with a test beside it; component wiring is proved by source-grep coupling tests in the pattern of `lib/boot.test.ts` and `components/chrome.test.ts`, and every one of those says in its docblock that it is a coupling check and not a render.
- F3's interfaces are frozen and this plan consumes them unchanged: `ToolEntry` (`slug, name, blurb, privacy, cantSee, status, order`), `content/tools/index.ts` exporting `tools`, `liveTools`, `toolBySlug` and `toolShellCopy`, `components/tools/ToolPage.tsx` with props `{ tool, children }` plus the optional `extraSchema` and `talk`, `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`, `trackToolRun(payload)` in `lib/tools/events.ts`, and `scripts/phone-check.mjs --base --routes`. T2 reuses the optional `privacyLine?: string` field already added on main, rather than introducing a second name for the same full-line override. Nothing is renamed and nothing is removed.
- All copy lives in `content/tools/relief.ts` and passes `content/voice.test.ts`: no em dash, no en dash outside a date, British spelling. Nothing is hard-coded in a page or a component.
- Hand-written CSS. The tool owns `app/tools/relief/tool.css`, imported by its own `page.tsx` (design section 2, rule 2). The privacy override uses the shell's existing `.tool__privacy` line and needs no second footnote style.
- **The plate does not animate**, and that is a rule rather than a shortcut: `SystemProvider` owns the single `requestAnimationFrame` loop and AGENTS.md forbids a second one, so a progressive draw-on would have to be threaded through `onFrame` for no gain. The only motion on the route is a CSS opacity fade on the figure, gated behind `@media (prefers-reduced-motion: no-preference)`. Progress during a GitHub fetch is a line of text, not a spinner.
- **The phosphor look comes from the existing tokens.** `lib/tools/relief/draw.ts` reads `--bg`, `--green`, `--green-bright`, `--green-dim` and `--amber` through an injected reader and contains no colour literal of its own; a test greps the file for `#` and `rgb(` and fails on either. A missing token throws a named error rather than silently painting black on black.
- **The token never lands anywhere but one header.** No `localStorage`, no `sessionStorage`, no `indexedDB`, no `document.cookie` anywhere under `app/tools/relief/` or `lib/tools/relief/`, proved by a grep test. Every outbound request is built by `githubUrl()`, which refuses any path that is not a single-leading-slash path on `https://api.github.com`, proved by a unit test and by a recording `fetch` that asserts the token string appears in no URL and no body.
- `tool_run` carries the slug, the outcome and the milliseconds. Never the username, never the token, never a filename, never a row count that could identify a file.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/t2-relief` in its own sibling worktree made through `workspaces.ps1`, never reused, never removed by an agent. The repository is public, so this ships as a pull request needing the `check` and `mutation` jobs green.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what the output proves and what it cannot see. Numbers that have not been measured yet are labelled as guesses until a run replaces them.

---

## Where the lifted source came from

`terrain.ts` was found at `C:\Dev\sauna-os-feat-ordnance-survey\apps\site\src\lib\survey\terrain.ts`, a live git worktree of `C:\Dev\sauna-os` on branch `feat/ordnance-survey` at `cbc3f43`. Its sibling `model.ts` was read and is **not** lifted: it is the sauna revenue model and has nothing to do with drawing ground.

The implementer will not have that repository. Everything T2 takes from it is quoted in full below, and every file that carries lifted code repeats the credit in its own header.

**`mulberry`, the seeded PRNG** (lifted verbatim into `lib/tools/relief/demo.ts`):

```ts
/** Deterministic PRNG. A venue must not get a different year on reload. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**`bump`, one Gaussian hill** (lifted verbatim into `lib/tools/relief/demo.ts`):

```ts
/** A ridge or a basin centred on `at`, `spread` wide, `height` tall. */
function bump(x: number, at: number, spread: number, height: number): number {
  return height * Math.exp(-Math.pow((x - at) / spread, 2));
}
```

**`buildField`, quoted for reference only.** T2 does **not** lift this: the sauna sheet has no data so it generates a plausible year, whereas Relief has real events and generates nothing except the demo. It is here because the demo generator in Task 4 copies its shaping technique (a sum of `bump` calls per axis plus lattice noise) and the implementer should see the original:

```ts
export function buildField(seed: number): Field {
  const rnd = mulberry(seed);

  // Smooth value noise on a coarse lattice, so the ground rolls rather than
  // fizzing. Per-cell randomness produces contours that look like static.
  const LW = 9;
  const LH = 5;
  const lattice: number[][] = [];
  for (let i = 0; i < LH; i++) {
    lattice[i] = [];
    for (let j = 0; j < LW; j++) lattice[i][j] = rnd();
  }

  const noise = (u: number, v: number) => {
    const x = u * (LW - 1);
    const y = v * (LH - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, LW - 1);
    const y1 = Math.min(y0 + 1, LH - 1);
    let fx = x - x0;
    let fy = y - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = lattice[y0][x0] * (1 - fx) + lattice[y0][x1] * fx;
    const b = lattice[y1][x0] * (1 - fx) + lattice[y1][x1] * fx;
    return a * (1 - fy) + b * fy;
  };

  const field: Field = [];
  for (let r = 0; r < ROWS; r++) {
    field[r] = [];
    for (let c = 0; c < COLS; c++) {
      const season =
        bump(c, 40, 9, 34) +   // autumn ridge, the cold-dip season starting
        bump(c, 16, 7, 13) +   // a smaller spring shoulder
        bump(c, 4, 5, -19) +   // January, dark and skint
        bump(c, 28, 4.5, -12); // July, everybody is away
      const hour =
        bump(r, 1.5, 1.7, 17) +   // the early crowd
        bump(r, 11.5, 2.2, 30) +  // the evening, which is the business
        bump(r, 6, 2.4, -9);      // the middle of the day, which is not
      const wobble = (noise(c / (COLS - 1), r / (ROWS - 1)) - 0.5) * 22;
      field[r][c] = Math.max(2, Math.min(98, 44 + season + hour + wobble));
    }
  }
  return field;
}
```

**`contour`, the marching squares** (lifted into `lib/tools/relief/contour.ts` with one deliberate change, described in Task 3):

```ts
/**
 * Marching squares. Returns line segments in field coordinates, so the caller
 * decides the scale. Saddles (cases 5 and 10) are resolved the cheap way: both
 * pairs are emitted, which on a field this smooth is indistinguishable from
 * disambiguating against the cell average and is a good deal less code.
 */
export function contour(field: Field, level: number): Segment[] {
  const segs: Segment[] = [];
  const lerp = (a: number, b: number, va: number, vb: number) =>
    a + (b - a) * ((level - va) / (vb - va));

  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const tl = field[r][c];
      const tr = field[r][c + 1];
      const br = field[r + 1][c + 1];
      const bl = field[r + 1][c];

      const k =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (k === 0 || k === 15) continue;

      const T = { x: lerp(c, c + 1, tl, tr), y: r };
      const R = { x: c + 1, y: lerp(r, r + 1, tr, br) };
      const B = { x: lerp(c, c + 1, bl, br), y: r + 1 };
      const L = { x: c, y: lerp(r, r + 1, tl, bl) };

      switch (k) {
        case 1: case 14: segs.push([L, B]); break;
        case 2: case 13: segs.push([B, R]); break;
        case 3: case 12: segs.push([L, R]); break;
        case 4: case 11: segs.push([T, R]); break;
        case 6: case 9:  segs.push([T, B]); break;
        case 7: case 8:  segs.push([L, T]); break;
        case 5:  segs.push([L, T]); segs.push([B, R]); break;
        case 10: segs.push([T, R]); segs.push([L, B]); break;
      }
    }
  }
  return segs;
}
```

Its supporting types, also lifted:

```ts
export type Field = number[][];
export type Point = { x: number; y: number };
export type Segment = [Point, Point];
```

---

## The maths, decided up front

**The grid.** 24 rows by 52 columns. Row `r` is the hour of the day (0 to 23), column `c` is the week (0 is the oldest, 51 is the week that ends at the window's end). `field[r][c]`, exactly the layout `terrain.ts` uses.

**The column is absolute, the row is local.** A commit's week comes from `Date.parse(iso)`, which honours the offset, because "when in the year" is a fact about the calendar. The hour comes from the hour field of the ISO string read verbatim, because "what time was it where they were" is the interesting question and it is the one the spec fixes: commit times are the author's local time. Those two readings of the same timestamp disagree by design, and the page says so.

**Outliers.** A single 200-commit hour must not flatten the rest, so the ceiling is a percentile of the occupied cells rather than the maximum, and the transform is `log1p` rather than linear:

```
ceiling = the value at index floor(0.98 * (n - 1)) of the occupied cells, sorted ascending, floored at 1
height  = min(1, log1p(count) / log1p(ceiling))
```

Two separate jobs. `log1p` because commit counts are multiplicative: the step from 2 to 4 says more than the step from 100 to 102. The percentile ceiling because the log alone still anchors the sheet on the outlier. The index is taken with `Math.floor` and never interpolated upward, because the value above the index is precisely the outlier the ceiling exists to ignore.

Worked, on the occupied cells `[1, 2, 4, 8, 200]`. `n = 5`, index `floor(0.98 * 4) = 3`, so `ceiling = 8` and `log1p(8) = ln 9 = 2.197225`:

| count | `log1p(count)` | height | height if it were `count / max` |
|---|---|---|---|
| 1 | 0.693147 | **0.3155** | 0.005 |
| 2 | 1.098612 | **0.5000** (exactly, `ln 3 / ln 9`) | 0.010 |
| 4 | 1.609438 | **0.7325** | 0.020 |
| 8 | 2.197225 | **1.0000** | 0.040 |
| 200 | 5.303305 | **1.0000** (clamped) | 1.000 |

The right-hand column is the failure this replaces: every real hour under half a percent of the sheet, one spire, no contours anywhere else.

**Smoothing.** Raw counts on a 24 by 52 grid are spiky and marching squares on spiky data draws static. Two passes of a separable `[1, 2, 1] / 4` kernel, **wrapped on the hour axis** because 23:00 really is next to 00:00, and **clamped on the week axis** because the first and last weeks of a year are not neighbours. A convex kernel, so nothing leaves `[0, 1]`. The side effect is deliberate: an isolated one-hour spike is damped to roughly a seventh of its height and stops being a mountain, while a broad evening ridge keeps its shape. So the ceiling stops the outlier flattening the rest, and the smoothing stops it standing as a spire.

**Levels.** Six, evenly spaced: `0.15, 0.30, 0.45, 0.60, 0.75, 0.90`. Every second one is an index contour drawn in the brighter token, which is the actual Ordnance convention. Six because at 52 columns on a 320px phone a seventh line starts to moire against its neighbours.

**Sparsity.** Under 150 events in the year, or fewer than 30 occupied cells, the tool refuses and says which of the two it was. Below that the rings are drawn around single cells and the picture is noise with contours on it.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `content/tools/relief.ts` | The registry entry and every string the tool says. |
| `lib/tools/relief/types.ts` | `ReliefEvent`, `Heightmap`, `Field`, `Point`, `Segment`, `Polyline`, the grid constants. |
| `lib/tools/relief/heightmap.ts` | Bucketing, the percentile ceiling, `log1p` normalisation, smoothing, the sparsity guard. |
| `lib/tools/relief/heightmap.test.ts` | Including the outlier table above, as assertions. |
| `lib/tools/relief/contour.ts` | Marching squares lifted from `terrain.ts`, generalised to any grid size, plus segment chaining. |
| `lib/tools/relief/contour.test.ts` | |
| `lib/tools/relief/demo.ts` | The bundled demo: a seed and a generator, not a data blob. |
| `lib/tools/relief/demo.test.ts` | |
| `lib/tools/relief/draw.ts` | The canvas plan: a palette read from tokens, a geometry, a list of draw ops, and a painter over a structural `Ctx2D`. |
| `lib/tools/relief/draw.test.ts` | Painted against a recording stub, so it runs in node. |
| `lib/tools/relief/svg.ts` | The pen-plotter SVG writer. |
| `lib/tools/relief/svg.test.ts` | |
| `lib/tools/relief/stl.ts` | Mesh construction, the closed-mesh check, and the binary STL writer. |
| `lib/tools/relief/stl.test.ts` | Including the every-directed-edge-once proof. |
| `lib/tools/relief/csv.ts` | RFC 4180 parsing, header detection, date column mapping. |
| `lib/tools/relief/csv.test.ts` | |
| `lib/tools/relief/github.ts` | The origin fence, the windowed commit search, paging, backoff, and the hour rule. |
| `lib/tools/relief/github.test.ts` | Driven by a recording stub `fetch`. No network. |
| `lib/tools/relief/safety.test.ts` | The grep guards: no storage anywhere, no colour literal in `draw.ts`, `fetch` only in `github.ts`. |
| `app/tools/relief/page.tsx` | Server component. Metadata, schema, the shell, the client island. |
| `app/tools/relief/page.test.ts` | Coupling check. |
| `app/tools/relief/ReliefTool.tsx` | The one client component. Source picker, inputs, canvas, downloads. |
| `app/tools/relief/ReliefTool.test.ts` | Coupling check, plus the token rules read off the source. |
| `app/tools/relief/tool.css` | The tool's own rules. |

**Modified**

| Path | Change |
|---|---|
| `content/tools/types.ts` | Adds the optional `privacyNote?: string`. |
| `content/tools/index.ts` | One import line and one array entry, alphabetical. |
| `components/tools/ToolPage.tsx` | Renders `privacyNote` when present, directly after the privacy line. |
| `components/tools/ToolPage.test.ts` | One mark in the ordered list. |
| `app/globals.css` | `.tool__privacynote`. |
| `app/globals.test.ts` | The new rule joins the "no `--green-faint` for body text" list, and a contrast case for the contour tokens. |
| `content/voice.test.ts` | `privacyNote` joins the prose list. |
| `scripts/mutation-check.mjs` | Ten rows for T2's guards. |
| `.github/workflows/ci.yml` | `/tools/relief` joins the phone job's routes. |
| `docs/superpowers/programme/toolshed-ledger.md`, `docs/PROGRESS.md` | State and evidence. |

---

### Task 0: Worktree, branch, baseline

**Files:**
- Create: nothing in the tree

**Interfaces:**
- Consumes: `main` with F3 merged (`content/tools/index.ts`, `components/tools/ToolPage.tsx`, `lib/tools/events.ts` and `scripts/phone-check.mjs` all exist)
- Produces: a sibling worktree on `toolshed/t2-relief` that every later task runs in, and a recorded baseline test count

- [ ] **Step 1: Confirm F3 has landed**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -5
for f in content/tools/index.ts content/tools/types.ts components/tools/ToolPage.tsx lib/tools/events.ts scripts/phone-check.mjs; do
  git cat-file -e origin/main:$f 2>/dev/null && echo "present: $f" || echo "MISSING: $f"
done
```

Expected: five `present:` lines. Any `MISSING:` means F3 is not merged; stop and say so rather than inventing the interface T2 consumes.

- [ ] **Step 2: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/t2-relief
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/t2-relief
```

Expected: the second command prints a sibling path of `C:\Dev\fergus-portfolio`. Every `cd` below means that path; the plan writes `$WT`. Never `git worktree remove` it.

- [ ] **Step 3: Install and record the baseline**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && npx vitest run --reporter=dot 2>&1 | tail -4
```

Expected: `tsc` silent, and a `Tests  N passed` line. Write `N` down. What this proves: the checkout builds and the suite is green before T2 touches anything. What it cannot see: whether `main` itself is green on CI, which is a different machine and a different line ending policy.

---

### Task 1: The registry entry, the copy, and the optional field the shell needed

**Files:**
- Create: `content/tools/relief.ts`
- Modify: `content/tools/types.ts` (one optional field)
- Modify: `content/tools/index.ts` (one import line, one array entry)
- Modify: `components/tools/ToolPage.tsx` (one conditional paragraph)
- Modify: `components/tools/ToolPage.test.ts` (one mark)
- Modify: `content/voice.test.ts` (one line in the prose list)
- Modify: `app/globals.css` (`.tool__privacynote`)
- Modify: `app/globals.test.ts` (one selector in the existing list)

**Interfaces:**
- Consumes: `ToolEntry`, `tools`, `toolShellCopy` from `content/tools` (F3)
- Produces: `relief: ToolEntry` and `reliefCopy` from `content/tools/relief`, and `ToolEntry.privacyNote?: string` for every later tool

**Why the extra field, and why it is allowed.** The frozen privacy lines are "Runs in your browser. Nothing leaves this tab." and "Runs on the server. Keeps a hashed IP for a day, nothing else." Relief is a browser tool on two of its three paths, and on the third the visitor's own browser calls `api.github.com` with the visitor's own token. Neither frozen sentence is true of that, and printing a sentence that is not true is the thing this repo takes most seriously. The frozen block permits additions, so `privacyNote` is added as an optional field and rendered under the privacy line, which is also where a cautious visitor is already looking. The alternative considered and rejected was putting the correction inside the tool's own body, which reads as a page contradicting itself two paragraphs apart.

- [ ] **Step 1: Write the failing test**

Append to `content/tools/index.test.ts`:

```ts
describe("relief", () => {
  it("is registered, live, and browser-side", () => {
    const t = toolBySlug("relief");
    expect(t?.status).toBe("live");
    expect(t?.privacy).toBe("browser");
  });

  /**
   * The one path that leaves the tab is GitHub, and the shell's browser line
   * would be false about it. The note is what makes the page honest, so its
   * absence is a test failure rather than a missing nicety.
   */
  it("corrects the browser privacy line where GitHub is concerned", () => {
    const note = toolBySlug("relief")?.privacyNote ?? "";
    expect(note).toContain("api.github.com");
    expect(note.length).toBeGreaterThan(60);
  });

  it("says the two things the design fixed as can't-see lines", () => {
    const lines = (toolBySlug("relief")?.cantSee ?? []).join(" ");
    expect(lines).toMatch(/private/i);
    expect(lines).toMatch(/local time|local clock/i);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run content/tools/index.test.ts`
Expected: FAIL, `toolBySlug("relief")` is `undefined`, so `status` is `undefined` rather than `"live"`.

- [ ] **Step 3: Add the optional field to the frozen type**

In `content/tools/types.ts`, after the `privacy` field:

```ts
  /**
   * An addition to the frozen shape, permitted by the programme's interface
   * block. Printed under the privacy line when a tool's real behaviour needs
   * a sentence the two frozen ones cannot carry. Relief is the first: it is a
   * browser tool whose GitHub path calls api.github.com from the visitor's own
   * machine, which "nothing leaves this tab" would be a lie about.
   */
  privacyNote?: string;
```

- [ ] **Step 4: Write the entry and the copy**

```ts
// content/tools/relief.ts
import type { ToolEntry } from "./types";

/**
 * Relief. Every string the tool says lives here, per the house rule, including
 * the ones the pure modules in `lib/tools/relief/` refuse with: those return a
 * key and the component looks the sentence up, so no sentence is ever built
 * inside a function that is supposed to be arithmetic.
 */
export const relief: ToolEntry = {
  slug: "relief",
  name: "Relief",
  blurb:
    "A year of your activity drawn as contour ground, the way an Ordnance sheet draws a hillside. Out comes a PNG, an SVG a pen plotter can draw, and an STL a printer can make solid.",
  privacy: "browser",
  privacyNote:
    "One exception. On the GitHub path your own browser calls api.github.com with the token you paste. The token is held in this tab and nowhere else, never written to storage, and gone the moment you close it.",
  cantSee: [
    "Private repositories, unless the token you paste can read them. With no token at all GitHub's limits are far too tight for a year of commits, which is the whole reason the field is there.",
    "What time it was anywhere but where the author was sitting. The row is the hour off the commit's own clock, offset and all, and that is deliberate: a laptop set to the wrong zone, or a fortnight abroad, moves the ground.",
    "A year with fewer than 150 events, or fewer than 30 occupied cells. It refuses instead of drawing, because contours around a handful of cells are noise with rings on them.",
    "Work. A commit is a commit: a rebase, a squash or a bulk import lands as a ridge at the hour it was replayed, not the hour it was written.",
    "The zone a CSV was written in. A date with no offset is read as it is typed, so a spreadsheet exported in one country and read in another draws the same ground either way.",
  ],
  status: "live",
  order: 30,
};

/**
 * The tool's own words. `refusal` is keyed by what the pure guard returns, so
 * `lib/tools/relief/heightmap.ts` can decide and stay free of prose.
 */
export const reliefCopy = {
  description:
    "Draw a year of commits or any dated CSV as contour ground, then take it away as a PNG, a plotter SVG or a printable STL. Runs in your browser.",
  talk: "Want one of your own year, on paper, in a frame?",
  sources: {
    demo: "Demo",
    github: "GitHub",
    csv: "CSV",
  },
  demoCaption: "Generated, not measured. A modelled developer's year from a fixed seed, so the page has ground on it before you give it any.",
  githubHelp:
    "Your username, and a GitHub token with no scopes ticked. A token with nothing ticked can already read every public repository, which is all this needs unless you want your private ones counted.",
  tokenLabel: "GitHub token",
  userLabel: "GitHub username",
  csvHelp: "Any CSV with a column of dates. Pick the column and the tool does the rest. The file is read in this tab and never sent anywhere.",
  drawing: "Reading GitHub. Window {done} of {total}, {commits} commits so far.",
  refusal: {
    "few-events":
      "That is too thin to contour. Fewer than 150 events in the year, and the rings would be drawn around single cells, which looks like a map and means nothing.",
    "few-cells":
      "That is too concentrated to contour. Fewer than 30 of the 1,248 hours have anything in them, so there is no ground between the peaks.",
    flat: "That is flat. Every hour of the year carries much the same load, so there is nothing for a contour to follow.",
  },
  method:
    "Counts per hour per week, compressed with a logarithm against the 98th percentile so one enormous hour cannot flatten the rest, smoothed twice, then contoured at six levels. Hours wrap at midnight; weeks do not.",
  downloads: {
    png: "PNG",
    svg: "SVG for a plotter",
    stl: "STL for a printer",
  },
  plotterNote:
    "The SVG is geometry only: strokes, no fills, millimetres on the page, one group per contour level so you can put a different pen in for each. No text, because a plotter has no font.",
  stlNote:
    "The STL is a closed solid, 102mm by 46mm, 2mm of base and up to 12mm of relief. Two triangles a cell on top, the same grid upside down underneath, and a wall joining them.",
} as const;
```

- [ ] **Step 5: Register it**

In `content/tools/index.ts`, add the import in alphabetical order (after `headline-check`):

```ts
import { relief } from "./relief";
```

and extend the entries array:

```ts
const entries: ToolEntry[] = [headlineCheck, relief];
```

If `order: 30` collides with a tool T1 or T3 registered first, take the next free multiple of ten, record it in the ledger, and move on. `content/tools/index.test.ts` already fails on a duplicate order, so a collision cannot pass quietly.

- [ ] **Step 6: Render the note in the shell**

In `components/tools/ToolPage.tsx`, directly after the privacy paragraph:

```tsx
      {tool.privacyNote ? <p className="tool__privacynote">{tool.privacyNote}</p> : null}
```

and in `components/tools/ToolPage.test.ts`, insert one entry into `marks`, immediately after the `tool__privacy` line and before `"{children}"`:

```ts
    'className="tool__privacynote">{tool.privacyNote}',
```

- [ ] **Step 7: Style it, and put it under the existing guards**

In `app/globals.css`, immediately after the `.tool__privacy` rule:

```css
/* The correction to the privacy line, when a tool needs one. Dimmer than the
   line it qualifies, because it is a footnote, and --green rather than
   --green-faint because it is still a sentence somebody has to read. */
.tool__privacynote {
  margin: var(--sp-2) 0 0;
  font-size: 0.78rem;
  color: var(--green);
  text-shadow: none;
  max-width: 62ch;
}
```

In `app/globals.test.ts`, add `".tool__privacynote"` to the `it.each([...])` list under `"%s does not use --green-faint for body text"`.

In `content/voice.test.ts`, extend the tools block so the new field is linted, changing the `flatMap` body to:

```ts
    ...tools.flatMap((t) => [
      { where: `tools.${t.slug}.name`, text: t.name },
      { where: `tools.${t.slug}.blurb`, text: t.blurb },
      ...(t.privacyNote ? [{ where: `tools.${t.slug}.privacyNote`, text: t.privacyNote }] : []),
      ...t.cantSee.map((line, i) => ({ where: `tools.${t.slug}.cantSee[${i}]`, text: line })),
    ]),
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run content/tools components/tools content/voice.test.ts app/globals.test.ts`
Expected: PASS, except `content/tools/index.test.ts` "has a page behind it if it is live", which fails because `app/tools/relief/page.tsx` does not exist yet. That failure is correct and Task 10 clears it. Note it, do not paper over it by setting `status: "soon"`.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add content/tools components/tools app/globals.css app/globals.test.ts content/voice.test.ts
git commit -m "feat(relief): register the tool and give the shell a privacy note"
```

---

### Task 2: The heightmap, the outlier transform and the sparsity guard

**Files:**
- Create: `lib/tools/relief/types.ts`
- Create: `lib/tools/relief/heightmap.ts`
- Test: `lib/tools/relief/heightmap.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: in `types.ts`: `WEEKS = 52`, `HOURS = 24`, `MS_WEEK`, `type ReliefEvent = { week: number; hour: number }`, `type Field = number[][]`, `type Point = { x: number; y: number }`, `type Segment = [Point, Point]`, `type Polyline = Point[]`, `type Heightmap = { field: Field; counts: Field; ceiling: number; events: number; occupied: number; hi: number; lo: number; hiAt: { row: number; col: number } }`. In `heightmap.ts`: `weekIndex(atMs, endMs): number | null`, `countGrid(events): Field`, `ceilingFor(values, p?): number`, `normalise(count, ceiling): number`, `smooth(grid, passes?): Field`, `checkDensity(events): Density`, `buildHeightmap(events): Heightmap`, and the constants `MIN_EVENTS = 150`, `MIN_OCCUPIED_CELLS = 30`, `CEILING_PERCENTILE = 0.98`, `SMOOTH_PASSES = 2`, `FLAT_RANGE = 0.05`

- [ ] **Step 1: Write the types**

```ts
// lib/tools/relief/types.ts
/**
 * The shapes every part of Relief agrees on.
 *
 * `Field`, `Point` and `Segment` are lifted from Tigh Sauna's
 * `apps/site/src/lib/survey/terrain.ts` (branch `feat/ordnance-survey`), so
 * the marching squares in `contour.ts` can be the same code rather than a
 * retyped copy of it.
 */

/** Columns. One year, ending at the window's end. */
export const WEEKS = 52;
/** Rows. Hour of the day, in the author's own local time. */
export const HOURS = 24;
export const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

/** One dated thing, already reduced to its cell. Nothing identifying survives. */
export type ReliefEvent = { week: number; hour: number };

export type Field = number[][];
export type Point = { x: number; y: number };
export type Segment = [Point, Point];
/** A chain of points. Closed when the first and last are the same point. */
export type Polyline = Point[];

export type Heightmap = {
  /** Normalised and smoothed, every value in [0, 1]. What gets contoured. */
  field: Field;
  /** The raw counts, kept for the readout so the page can say a real number. */
  counts: Field;
  ceiling: number;
  events: number;
  occupied: number;
  hi: number;
  lo: number;
  hiAt: { row: number; col: number };
};
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/tools/relief/heightmap.test.ts
import { describe, it, expect } from "vitest";
import { HOURS, MS_WEEK, WEEKS, type ReliefEvent } from "./types";
import {
  CEILING_PERCENTILE,
  MIN_EVENTS,
  MIN_OCCUPIED_CELLS,
  buildHeightmap,
  ceilingFor,
  checkDensity,
  countGrid,
  normalise,
  smooth,
  weekIndex,
} from "./heightmap";

const spread = (n: number): ReliefEvent[] =>
  Array.from({ length: n }, (_, i) => ({ week: i % WEEKS, hour: (i * 7) % HOURS }));

describe("weekIndex", () => {
  const end = Date.UTC(2026, 8, 3);

  it("puts the newest week in the last column", () => {
    expect(weekIndex(end, end)).toBe(WEEKS - 1);
    expect(weekIndex(end - MS_WEEK, end)).toBe(WEEKS - 2);
  });

  it("drops anything older than the window", () => {
    expect(weekIndex(end - WEEKS * MS_WEEK, end)).toBeNull();
  });

  it("drops anything in the future, because a clock ahead is not a column", () => {
    expect(weekIndex(end + 1, end)).toBeNull();
  });
});

describe("countGrid", () => {
  it("is 24 rows by 52 columns of zeroes for no events", () => {
    const g = countGrid([]);
    expect(g).toHaveLength(HOURS);
    for (const row of g) expect(row).toHaveLength(WEEKS);
    expect(g.flat().every((v) => v === 0)).toBe(true);
  });

  it("counts each event into its own cell", () => {
    const g = countGrid([
      { week: 3, hour: 21 },
      { week: 3, hour: 21 },
      { week: 0, hour: 0 },
    ]);
    expect(g[21][3]).toBe(2);
    expect(g[0][0]).toBe(1);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores an event outside the grid rather than clamping it onto an edge", () => {
    const g = countGrid([
      { week: -1, hour: 0 },
      { week: WEEKS, hour: 0 },
      { week: 0, hour: HOURS },
    ]);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("ceilingFor", () => {
  it("ignores empty cells", () => {
    expect(ceilingFor([0, 0, 0, 5])).toBe(5);
  });

  it("never returns zero, so log1p has something to divide by", () => {
    expect(ceilingFor([])).toBe(1);
    expect(ceilingFor([0, 0])).toBe(1);
  });

  /**
   * The whole point. The index is taken with Math.floor and never interpolated
   * towards the value above it, because the value above it is the outlier.
   */
  it("steps down from the outlier rather than towards it", () => {
    expect(ceilingFor([1, 2, 4, 8, 200])).toBe(8);
    expect(CEILING_PERCENTILE).toBe(0.98);
  });
});

describe("normalise", () => {
  const ceiling = ceilingFor([1, 2, 4, 8, 200]);

  it("draws the table in the plan", () => {
    expect(normalise(0, ceiling)).toBe(0);
    expect(normalise(1, ceiling)).toBeCloseTo(0.3155, 4);
    // ln 3 / ln 9 is exactly one half, which is a pleasant accident and a
    // precise assertion.
    expect(normalise(2, ceiling)).toBeCloseTo(0.5, 12);
    expect(normalise(4, ceiling)).toBeCloseTo(0.7325, 4);
    expect(normalise(8, ceiling)).toBe(1);
  });

  it("clamps the outlier to the summit instead of letting it set the scale", () => {
    expect(normalise(200, ceiling)).toBe(1);
    // What this replaces: linear against the maximum.
    expect(1 / 200).toBeLessThan(0.01);
    expect(normalise(1, ceiling)).toBeGreaterThan(0.3);
  });
});

describe("smooth", () => {
  const grid = (fill: number) =>
    Array.from({ length: HOURS }, () => Array.from({ length: WEEKS }, () => fill));

  it("leaves a uniform field alone, because the kernel sums to one", () => {
    const g = grid(0.4);
    for (const row of smooth(g)) for (const v of row) expect(v).toBeCloseTo(0.4, 12);
  });

  it("never leaves the range it was given", () => {
    const g = grid(0);
    g[5][10] = 1;
    for (const row of smooth(g))
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
  });

  it("wraps the hour axis, because 23:00 is next to 00:00", () => {
    const g = grid(0);
    g[0][10] = 1;
    expect(smooth(g, 1)[HOURS - 1][10]).toBeGreaterThan(0);
  });

  it("clamps the week axis, because the first week of a year is not the last", () => {
    const g = grid(0);
    g[5][0] = 1;
    expect(smooth(g, 1)[5][WEEKS - 1]).toBe(0);
  });

  it("damps a lone spike and keeps a broad ridge", () => {
    const spike = grid(0);
    spike[10][20] = 1;
    const ridge = grid(0);
    for (let c = 0; c < WEEKS; c++) for (let r = 9; r <= 11; r++) ridge[r][c] = 1;
    expect(smooth(spike)[10][20]).toBeLessThan(0.3);
    expect(smooth(ridge)[10][20]).toBeGreaterThan(0.8);
  });
});

describe("checkDensity", () => {
  it("refuses a year with too few events", () => {
    expect(checkDensity(spread(MIN_EVENTS - 1))).toEqual({ ok: false, reason: "few-events" });
  });

  it("refuses a year piled into too few cells", () => {
    const piled: ReliefEvent[] = [];
    for (let i = 0; i < 400; i++) piled.push({ week: i % 10, hour: 12 });
    expect(checkDensity(piled)).toEqual({ ok: false, reason: "few-cells" });
    expect(MIN_OCCUPIED_CELLS).toBe(30);
  });

  it("accepts a year that is neither", () => {
    expect(checkDensity(spread(400))).toEqual({ ok: true });
  });
});

describe("buildHeightmap", () => {
  it("reports what it drew", () => {
    const h = buildHeightmap(spread(600));
    expect(h.events).toBe(600);
    expect(h.occupied).toBeGreaterThan(MIN_OCCUPIED_CELLS);
    expect(h.field).toHaveLength(HOURS);
    expect(h.field[0]).toHaveLength(WEEKS);
    expect(h.hi).toBeLessThanOrEqual(1);
    expect(h.lo).toBeGreaterThanOrEqual(0);
    expect(h.counts[h.hiAt.row][h.hiAt.col]).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(buildHeightmap(spread(600))).toEqual(buildHeightmap(spread(600)));
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/heightmap.test.ts`
Expected: FAIL, cannot resolve `./heightmap`.

- [ ] **Step 4: Write the module**

```ts
// lib/tools/relief/heightmap.ts
import { HOURS, MS_WEEK, WEEKS, type Field, type Heightmap, type ReliefEvent } from "./types";

/**
 * Counts to ground.
 *
 * Four decisions live in this file and each one is a way the plate could lie:
 * which cell an event lands in, what counts as the top of the scale, how a
 * count becomes a height, and how much the ground may be smoothed before it
 * stops being the data. They are all here, all pure, all tested.
 */

/** Under this in a year and the tool refuses. Rings around single cells are noise. */
export const MIN_EVENTS = 150;
/** And under this many occupied cells, for the same reason from the other side. */
export const MIN_OCCUPIED_CELLS = 30;
/**
 * The top of the scale, as a percentile of the occupied cells rather than the
 * maximum. One 200-commit hour is real and belongs on the sheet as the summit.
 * What it may not do is set the scale, because then every ordinary hour lands
 * under half a percent and the year draws as one spire on a flat plain.
 */
export const CEILING_PERCENTILE = 0.98;
/** Two passes of [1,2,1]/4. See the plan on what this deliberately loses. */
export const SMOOTH_PASSES = 2;
/** Below this spread the page says "flat" rather than drawing an empty sheet. */
export const FLAT_RANGE = 0.05;

/** Column for `atMs`, counting back from `endMs`. 51 is the week ending at `endMs`. */
export function weekIndex(atMs: number, endMs: number): number | null {
  if (!Number.isFinite(atMs) || !Number.isFinite(endMs)) return null;
  const back = Math.floor((endMs - atMs) / MS_WEEK);
  if (back < 0 || back >= WEEKS) return null;
  return WEEKS - 1 - back;
}

function blank(): Field {
  return Array.from({ length: HOURS }, () => Array.from({ length: WEEKS }, () => 0));
}

/** Events to raw counts. Anything off the grid is dropped, never clamped onto an edge. */
export function countGrid(events: readonly ReliefEvent[]): Field {
  const grid = blank();
  for (const e of events) {
    if (!Number.isInteger(e.week) || e.week < 0 || e.week >= WEEKS) continue;
    if (!Number.isInteger(e.hour) || e.hour < 0 || e.hour >= HOURS) continue;
    grid[e.hour][e.week] += 1;
  }
  return grid;
}

/**
 * The top of the scale.
 *
 * Nearest rank from below, deliberately: an interpolating percentile at n = 50
 * reaches 2% of the way into the 50th value, and the 50th value is the outlier
 * this function exists to step around.
 */
export function ceilingFor(values: readonly number[], p = CEILING_PERCENTILE): number {
  const occupied = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (occupied.length === 0) return 1;
  const index = Math.min(occupied.length - 1, Math.floor(p * (occupied.length - 1)));
  return Math.max(1, occupied[index]);
}

/** A count as a height in [0, 1]. Logarithmic, because commit counts are multiplicative. */
export function normalise(count: number, ceiling: number): number {
  if (!(count > 0)) return 0;
  return Math.min(1, Math.log1p(count) / Math.log1p(Math.max(1, ceiling)));
}

/**
 * Separable [1,2,1]/4, `passes` times.
 *
 * Wrapped on the hour axis because 23:00 really is next to 00:00 and a ridge
 * that crosses midnight is one ridge. Clamped on the week axis because the
 * first and last weeks of a year are a year apart. A convex kernel, so nothing
 * leaves the range it arrived in.
 */
export function smooth(grid: readonly (readonly number[])[], passes = SMOOTH_PASSES): Field {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  let out: Field = grid.map((row) => [...row]);
  for (let p = 0; p < passes; p++) {
    const h: Field = out.map((row) =>
      row.map((_, c) => {
        const l = row[Math.max(0, c - 1)];
        const r = row[Math.min(cols - 1, c + 1)];
        return (l + 2 * row[c] + r) / 4;
      }),
    );
    out = h.map((row, r) =>
      row.map((_, c) => {
        const u = h[(r - 1 + rows) % rows][c];
        const d = h[(r + 1) % rows][c];
        return (u + 2 * h[r][c] + d) / 4;
      }),
    );
  }
  return out;
}

export type Density = { ok: true } | { ok: false; reason: "few-events" | "few-cells" };

/**
 * Returns a key, not a sentence. The words are in `content/tools/relief.ts`,
 * so this stays arithmetic and the voice lint still covers the copy.
 */
export function checkDensity(events: readonly ReliefEvent[]): Density {
  if (events.length < MIN_EVENTS) return { ok: false, reason: "few-events" };
  const cells = new Set(events.map((e) => `${e.hour}:${e.week}`));
  if (cells.size < MIN_OCCUPIED_CELLS) return { ok: false, reason: "few-cells" };
  return { ok: true };
}

export function buildHeightmap(events: readonly ReliefEvent[]): Heightmap {
  const counts = countGrid(events);
  const flat = counts.flat();
  const ceiling = ceilingFor(flat);
  const normalised = counts.map((row) => row.map((v) => normalise(v, ceiling)));
  const field = smooth(normalised);

  let hi = -Infinity;
  let lo = Infinity;
  let hiAt = { row: 0, col: 0 };
  for (let r = 0; r < field.length; r++) {
    for (let c = 0; c < field[r].length; c++) {
      const v = field[r][c];
      if (v > hi) {
        hi = v;
        hiAt = { row: r, col: c };
      }
      if (v < lo) lo = v;
    }
  }

  return {
    field,
    counts,
    ceiling,
    events: flat.reduce((a, b) => a + b, 0),
    occupied: flat.filter((v) => v > 0).length,
    hi,
    lo,
    hiAt,
  };
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/heightmap.test.ts`
Expected: PASS. What this proves: the arithmetic behaves as the plan's table says, on synthetic input. What it cannot see: whether a real GitHub year has the shape any of it assumes. Task 13's live run is the first thing that can.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/relief/types.ts lib/tools/relief/heightmap.ts lib/tools/relief/heightmap.test.ts
git commit -m "feat(relief): counts to ground, with a percentile ceiling so one huge hour cannot flatten the year"
```

---

### Task 3: Contours, and chaining them into something a pen can follow

**Files:**
- Create: `lib/tools/relief/contour.ts`
- Test: `lib/tools/relief/contour.test.ts`

**Interfaces:**
- Consumes: `Field`, `Point`, `Polyline`, `Segment` from `./types`
- Produces: `LEVELS: readonly number[]`, `isIndexLevel(i: number): boolean`, `contour(field: Field, level: number): Segment[]`, `chainSegments(segments: readonly Segment[]): Polyline[]`, `isClosed(line: Polyline): boolean`, `type ContourLayer = { level: number; index: boolean; lines: Polyline[] }`, `contourLayers(field: Field): ContourLayer[]`

**The one change to the lifted code.** `terrain.ts` reads its module constants `ROWS` and `COLS` inside `contour`, which is fine there because that file owns the only field it will ever see. Relief passes fields of other sizes to it in tests, so the lift takes the dimensions off the array. Everything else, including the cheap saddle handling, is the original. There is deliberately no guard against `va === vb` in the interpolation: that case only arises when both corners sit on the same side of the level, and then the cell contributes no edge on that side at all.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/contour.test.ts
import { describe, it, expect } from "vitest";
import type { Field, Point } from "./types";
import { LEVELS, chainSegments, contour, contourLayers, isClosed, isIndexLevel } from "./contour";

/** 0 everywhere except a single 1 in the middle. The smallest closed ring there is. */
const peak: Field = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];

describe("contour", () => {
  it("finds nothing when the level is above everything", () => {
    expect(contour(peak, 2)).toHaveLength(0);
  });

  it("finds nothing when the level is below everything", () => {
    expect(contour(peak, -1)).toHaveLength(0);
  });

  it("rings a single peak with four segments", () => {
    expect(contour(peak, 0.5)).toHaveLength(4);
  });

  it("puts the crossings exactly halfway when the level is halfway", () => {
    const key = (p: Point) => `${p.x},${p.y}`;
    const points = contour(peak, 0.5).flat().map(key);
    expect(new Set(points)).toEqual(new Set(["0.5,1", "1,0.5", "1.5,1", "1,1.5"]));
  });

  it("reads its size off the array rather than a module constant", () => {
    const wide: Field = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    expect(contour(wide, 0.5).length).toBeGreaterThan(4);
  });

  it("returns nothing for a grid too small to hold a cell", () => {
    expect(contour([[1]], 0.5)).toHaveLength(0);
    expect(contour([], 0.5)).toHaveLength(0);
  });
});

describe("chainSegments", () => {
  it("joins a ring into one closed polyline", () => {
    const lines = chainSegments(contour(peak, 0.5));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(5);
    expect(isClosed(lines[0])).toBe(true);
  });

  it("keeps an open line open", () => {
    const ramp: Field = [
      [0, 1],
      [0, 1],
    ];
    const lines = chainSegments(contour(ramp, 0.5));
    expect(lines).toHaveLength(1);
    expect(isClosed(lines[0])).toBe(false);
  });

  it("loses no segment", () => {
    const segs = contour(peak, 0.5);
    const drawn = chainSegments(segs).reduce((a, l) => a + l.length - 1, 0);
    expect(drawn).toBe(segs.length);
  });

  /**
   * The reason this function exists. A plotter lifts the pen between paths, so
   * loose segments mean one lift per cell edge and a plot that takes hours and
   * comes out furry.
   */
  it("cuts the pen lifts by an order of magnitude on a real-sized field", () => {
    const field: Field = Array.from({ length: 24 }, (_, r) =>
      Array.from({ length: 52 }, (_, c) => Math.sin(c / 6) * 0.3 + Math.cos(r / 4) * 0.3 + 0.5),
    );
    const segs = contour(field, 0.5);
    const lines = chainSegments(segs);
    expect(segs.length).toBeGreaterThan(40);
    expect(lines.length * 8).toBeLessThan(segs.length);
  });

  it("handles an empty input", () => {
    expect(chainSegments([])).toEqual([]);
  });
});

describe("levels", () => {
  it("is six, evenly spaced, inside the open unit interval", () => {
    expect(LEVELS).toEqual([0.15, 0.3, 0.45, 0.6, 0.75, 0.9]);
    for (const l of LEVELS) {
      expect(l).toBeGreaterThan(0);
      expect(l).toBeLessThan(1);
    }
  });

  it("makes every second one an index contour, which is the Ordnance convention", () => {
    expect([0, 1, 2, 3, 4, 5].map(isIndexLevel)).toEqual([false, true, false, true, false, true]);
  });
});

describe("contourLayers", () => {
  it("returns one layer per level, in order, each with its own lines", () => {
    const field: Field = Array.from({ length: 24 }, (_, r) =>
      Array.from({ length: 52 }, (_, c) => Math.min(1, Math.max(0, (c + r) / 74))),
    );
    const layers = contourLayers(field);
    expect(layers).toHaveLength(LEVELS.length);
    expect(layers.map((l) => l.level)).toEqual([...LEVELS]);
    expect(layers.some((l) => l.lines.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/contour.test.ts`
Expected: FAIL, cannot resolve `./contour`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/contour.ts
import type { Field, Point, Polyline, Segment } from "./types";

/**
 * Marching squares, and the chaining that makes the output plottable.
 *
 * `contour` is lifted from Tigh Sauna's survey sheet,
 * `apps/site/src/lib/survey/terrain.ts` on branch `feat/ordnance-survey`,
 * written for the same purpose: drawing a trading year as ground. One change,
 * stated here so nobody has to diff two repositories to find it: the loop
 * bounds come off the array instead of the module constants ROWS and COLS,
 * because Relief contours grids of other sizes in its tests. The saddle
 * handling is the original's, cheap on purpose.
 *
 * `chainSegments` is new. `terrain.ts` draws to a canvas, where a thousand
 * loose two-point segments cost nothing. Relief writes an SVG a pen plotter
 * follows, and there each loose segment is a pen lift.
 */

/** Six, evenly spaced. A seventh moires against its neighbours at 52 columns on a phone. */
export const LEVELS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9] as const;

/** Every second line is heavier, which is how an Ordnance sheet is read. */
export function isIndexLevel(i: number): boolean {
  return i % 2 === 1;
}

export function contour(field: Field, level: number): Segment[] {
  const rows = field.length;
  const cols = rows > 0 ? field[0].length : 0;
  if (rows < 2 || cols < 2) return [];

  const segs: Segment[] = [];
  const lerp = (a: number, b: number, va: number, vb: number) =>
    a + (b - a) * ((level - va) / (vb - va));

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = field[r][c];
      const tr = field[r][c + 1];
      const br = field[r + 1][c + 1];
      const bl = field[r + 1][c];

      const k =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (k === 0 || k === 15) continue;

      const T = { x: lerp(c, c + 1, tl, tr), y: r };
      const R = { x: c + 1, y: lerp(r, r + 1, tr, br) };
      const B = { x: lerp(c, c + 1, bl, br), y: r + 1 };
      const L = { x: c, y: lerp(r, r + 1, tl, bl) };

      switch (k) {
        case 1: case 14: segs.push([L, B]); break;
        case 2: case 13: segs.push([B, R]); break;
        case 3: case 12: segs.push([L, R]); break;
        case 4: case 11: segs.push([T, R]); break;
        case 6: case 9:  segs.push([T, B]); break;
        case 7: case 8:  segs.push([L, T]); break;
        case 5:  segs.push([L, T]); segs.push([B, R]); break;
        case 10: segs.push([T, R]); segs.push([L, B]); break;
      }
    }
  }
  return segs;
}

/**
 * Quantised to 1e-4 of a cell before comparison. Two cells computing the same
 * crossing from opposite sides can differ in the last bit or two, and an exact
 * comparison would then break every ring into two open lines.
 */
const key = (p: Point) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`;

export function isClosed(line: Polyline): boolean {
  return line.length > 2 && key(line[0]) === key(line[line.length - 1]);
}

/** Loose segments into as few continuous runs as their endpoints allow. */
export function chainSegments(segments: readonly Segment[]): Polyline[] {
  const used = new Array<boolean>(segments.length).fill(false);
  const at = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const list = at.get(k);
    if (list) list.push(i);
    else at.set(k, [i]);
  };
  segments.forEach((s, i) => {
    add(key(s[0]), i);
    add(key(s[1]), i);
  });

  /** The far end of segment `i` from the point keyed `k`. */
  const far = (i: number, k: string): Point | null => {
    const [a, b] = segments[i];
    if (key(a) === k) return b;
    if (key(b) === k) return a;
    return null;
  };

  const unused = (k: string): number => {
    for (const i of at.get(k) ?? []) if (!used[i]) return i;
    return -1;
  };

  const out: Polyline[] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const line: Polyline = [segments[start][0], segments[start][1]];

    for (;;) {
      const k = key(line[line.length - 1]);
      const i = unused(k);
      if (i < 0) break;
      const p = far(i, k);
      if (!p) break;
      used[i] = true;
      line.push(p);
    }
    for (;;) {
      const k = key(line[0]);
      const i = unused(k);
      if (i < 0) break;
      const p = far(i, k);
      if (!p) break;
      used[i] = true;
      line.unshift(p);
    }
    out.push(line);
  }
  return out;
}

export type ContourLayer = { level: number; index: boolean; lines: Polyline[] };

/** Every level, contoured and chained. The one call the three writers share. */
export function contourLayers(field: Field): ContourLayer[] {
  return LEVELS.map((level, i) => ({
    level,
    index: isIndexLevel(i),
    lines: chainSegments(contour(field, level)),
  }));
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/contour.test.ts`
Expected: PASS. What this proves: the lift behaves on the cases the original's own tests covered, plus the chaining. What it cannot see: whether the chained output looks right, which is Task 12's screenshots and Task 13's live check.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/relief/contour.ts lib/tools/relief/contour.test.ts
git commit -m "feat(relief): lift the marching squares from tigh sauna and chain the segments into polylines"
```

---

### Task 4: The demo dataset, so the page is never an empty form

**Files:**
- Create: `lib/tools/relief/demo.ts`
- Test: `lib/tools/relief/demo.test.ts`

**Interfaces:**
- Consumes: `HOURS`, `WEEKS`, `ReliefEvent` from `./types`; `MIN_EVENTS`, `MIN_OCCUPIED_CELLS` from `./heightmap` (tests only)
- Produces: `DEMO_SEED = 20260903`, `demoEvents(seed?: number): ReliefEvent[]`

**A seed and a generator, not a data blob.** The bundled demo could have been a checked-in array of 1,500 events. It is a 40-line generator instead: the file is a tenth the size, the shape is legible and arguable rather than opaque, and a reviewer can see it is modelled rather than measured, which is the thing that must never be ambiguous. The page prints "Generated, not measured" beside it, the same discipline `terrain.ts` applies to the sauna sheet.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/demo.test.ts
import { describe, it, expect } from "vitest";
import { HOURS, WEEKS } from "./types";
import { DEMO_SEED, demoEvents } from "./demo";
import { MIN_EVENTS, MIN_OCCUPIED_CELLS, buildHeightmap, checkDensity } from "./heightmap";

describe("demoEvents", () => {
  it("is deterministic, so the page draws the same ground every load", () => {
    expect(demoEvents()).toEqual(demoEvents());
    expect(demoEvents(DEMO_SEED)).toEqual(demoEvents());
  });

  it("gives a different seed different ground", () => {
    expect(demoEvents(1)).not.toEqual(demoEvents(2));
  });

  it("stays inside the grid", () => {
    for (const e of demoEvents()) {
      expect(e.week).toBeGreaterThanOrEqual(0);
      expect(e.week).toBeLessThan(WEEKS);
      expect(e.hour).toBeGreaterThanOrEqual(0);
      expect(e.hour).toBeLessThan(HOURS);
      expect(Number.isInteger(e.week)).toBe(true);
      expect(Number.isInteger(e.hour)).toBe(true);
    }
  });

  /**
   * The demo exists to prove the pipeline draws something. If it were sparse
   * enough for the guard to refuse it, the page would open on a refusal.
   */
  it("clears the tool's own density guard with room to spare", () => {
    const events = demoEvents();
    expect(events.length).toBeGreaterThan(MIN_EVENTS * 2);
    expect(checkDensity(events)).toEqual({ ok: true });
    expect(buildHeightmap(events).occupied).toBeGreaterThan(MIN_OCCUPIED_CELLS * 4);
  });

  it("is not so dense that the whole sheet is one plateau", () => {
    const h = buildHeightmap(demoEvents());
    expect(h.hi - h.lo).toBeGreaterThan(0.2);
  });

  /**
   * The shape is the argument, exactly as it is in `terrain.ts`. A developer's
   * year has to have a working day in it and a dead 04:00, or the plate is
   * decoration.
   */
  it("puts the working day above the small hours", () => {
    const h = buildHeightmap(demoEvents());
    const mean = (r: number) => h.counts[r].reduce((a, b) => a + b, 0) / WEEKS;
    expect(mean(10)).toBeGreaterThan(mean(4));
    expect(mean(15)).toBeGreaterThan(mean(4));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/demo.test.ts`
Expected: FAIL, cannot resolve `./demo`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/demo.ts
import { HOURS, WEEKS, type ReliefEvent } from "./types";

/**
 * The demo year.
 *
 * `mulberry` and `bump` are lifted verbatim from Tigh Sauna's
 * `apps/site/src/lib/survey/terrain.ts` (branch `feat/ordnance-survey`), and
 * the shaping follows the same technique as its `buildField`: a sum of
 * Gaussian hills on each axis, then noise, then a count.
 *
 * IMPORTANT, and the page repeats it: this is generated, not measured. It is
 * here so the tool has ground on it before a visitor has given it anything,
 * which is a better first impression than an empty form and a worse one than a
 * fabricated dataset presented as somebody's real year. So it says which it is.
 */

/** Fixed, so the page is the same page for everyone who opens it. */
export const DEMO_SEED = 20260903;

/** Deterministic PRNG. A venue must not get a different year on reload. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ridge or a basin centred on `at`, `spread` wide, `height` tall. */
function bump(x: number, at: number, spread: number, height: number): number {
  return height * Math.exp(-Math.pow((x - at) / spread, 2));
}

/**
 * Knuth. Bounded in practice because `lambda` is capped below, and a count is
 * what an hour of commits actually is: a number of independent arrivals.
 */
function poisson(rnd: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}

export function demoEvents(seed: number = DEMO_SEED): ReliefEvent[] {
  const rnd = mulberry(seed);
  const out: ReliefEvent[] = [];

  for (let hour = 0; hour < HOURS; hour++) {
    for (let week = 0; week < WEEKS; week++) {
      const day =
        bump(hour, 10, 2.6, 3.1) + // the morning, once the coffee lands
        bump(hour, 15, 3.0, 3.6) + // the afternoon, which is the work
        bump(hour, 22, 2.2, 2.4) + // the evening, which is the interesting part
        bump(hour, 4, 3.0, -1.6); // the small hours, which are not
      const season =
        bump(week, 6, 6, 0.7) + // a spring push
        bump(week, 38, 8, 1.1) + // the autumn one, which is bigger
        bump(week, 29, 3.5, -1.2) + // August, everybody is away
        bump(week, 51, 2, -1.4); // Christmas
      const lambda = Math.min(12, Math.max(0, 0.35 + day + season + (rnd() - 0.5) * 0.9));
      const n = poisson(rnd, lambda);
      for (let i = 0; i < n; i++) out.push({ week, hour });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/demo.test.ts`
Expected: PASS. If the density assertions fail, the fix is the shaping constants, not the thresholds: print `demoEvents().length` and the occupied count, raise the `0.35` floor until both clear, and record the observed numbers in the ledger. Do not lower `MIN_EVENTS`.

- [ ] **Step 5: Record what it actually produced**

```bash
cd "$WT"
npx vitest run lib/tools/relief/demo.test.ts --reporter=verbose 2>&1 | tail -20
node --input-type=module -e "const m = await import('./lib/tools/relief/demo.ts').catch(() => null); console.log(m ? 'loaded' : 'ts, not runnable directly, read the count off a test instead');"
```

The second command will not load a `.ts` file under plain node, and that is expected; it is there so nobody wastes ten minutes discovering it. Get the count by adding a temporary `console.log(demoEvents().length)` to the test, running it, reading the number, and deleting the line. Put the number in the ledger as an observation. Guess, untested at the time of writing: somewhere between 1,200 and 2,500 events.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/relief/demo.ts lib/tools/relief/demo.test.ts
git commit -m "feat(relief): a seeded demo year, generated and labelled as generated"
```

---

### Task 5: The plate on canvas, drawn from the theme's own tokens

**Files:**
- Create: `lib/tools/relief/draw.ts`
- Test: `lib/tools/relief/draw.test.ts`
- Modify: `app/globals.test.ts` (one describe block)

**Interfaces:**
- Consumes: `ContourLayer`, `contourLayers` from `./contour`; `Heightmap`, `HOURS`, `WEEKS`, `Polyline` from `./types`
- Produces: `type Palette = { bg; line; index; ink; label }`, `class ReliefPaletteError extends Error`, `paletteFromTokens(read: (name: string) => string): Palette`, `type Ctx2D`, `type PlateGeometry`, `plateGeometry(width: number): PlateGeometry`, `type DrawOp`, `planPlate(input: { layers: ContourLayer[]; geometry: PlateGeometry; palette: Palette; labels: boolean }): DrawOp[]`, `paint(ctx: Ctx2D, ops: readonly DrawOp[]): void`, `hourLabels(geometry: PlateGeometry): { text: string; row: number }[]`

**Why the ops list.** vitest runs in a `node` environment, so there is no canvas to draw on and no jsdom to fake one. Splitting the drawing into "work out what to draw" and "tell a context to draw it" puts every decision in a pure function that returns a list, and leaves a nine-line painter that a recording stub exercises fully. `Ctx2D` is a structural subset of `CanvasRenderingContext2D`, so the real thing satisfies it with no cast.

**Why a missing token throws.** The alternative was a hard-coded fallback colour, which would put a hex literal in this file and defeat the point, and would also mean a renamed token silently paints black on a black page with every test still green. A named throw is caught by the component and shown as a sentence.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/draw.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contourLayers } from "./contour";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import {
  ReliefPaletteError,
  type Ctx2D,
  type DrawOp,
  hourLabels,
  paint,
  paletteFromTokens,
  planPlate,
  plateGeometry,
} from "./draw";

const TOKENS: Record<string, string> = {
  "--bg": "#0a0e0a",
  "--green": "#33ff66",
  "--green-bright": "#6effa3",
  "--green-dim": "#1f8f3a",
  "--amber": "#ffb000",
};
const reader = (name: string) => TOKENS[name] ?? "";
const palette = paletteFromTokens(reader);

/** A recording context. Structurally a CanvasRenderingContext2D, minus the drawing. */
function recorder() {
  const calls: string[] = [];
  const ctx: Ctx2D = {
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "left",
    fillRect(x, y, w, h) {
      calls.push(`fillRect ${this.fillStyle} ${x} ${y} ${w} ${h}`);
    },
    beginPath() {
      calls.push("beginPath");
    },
    moveTo(x, y) {
      calls.push(`moveTo ${x} ${y}`);
    },
    lineTo(x, y) {
      calls.push(`lineTo ${x} ${y}`);
    },
    stroke() {
      calls.push(`stroke ${this.strokeStyle} ${this.lineWidth}`);
    },
    fillText(text, x, y) {
      calls.push(`fillText ${this.fillStyle} ${text} ${x} ${y}`);
    },
  };
  return { ctx, calls };
}

describe("paletteFromTokens", () => {
  it("takes every colour from the theme", () => {
    expect(palette.bg).toBe("#0a0e0a");
    expect(palette.line).toBe("#1f8f3a");
    expect(palette.index).toBe("#33ff66");
    expect(palette.ink).toBe("#6effa3");
    expect(palette.label).toBe("#ffb000");
  });

  it("names the token it could not read rather than substituting one", () => {
    expect(() => paletteFromTokens((n) => (n === "--amber" ? "" : "#fff"))).toThrow(
      ReliefPaletteError,
    );
    expect(() => paletteFromTokens((n) => (n === "--amber" ? "" : "#fff"))).toThrow(/--amber/);
  });
});

/**
 * The rule this guards is in the plan's Global Constraints and in AGENTS.md:
 * the phosphor look comes from the existing variables, not a new palette. A
 * colour literal in this file is how a second palette starts.
 */
describe("draw.ts owns no colours", () => {
  const src = readFileSync(join(process.cwd(), "lib", "tools", "relief", "draw.ts"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    " ",
  );

  it("has no hex, rgb or hsl literal", () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\bhsla?\(/);
  });

  it("names the tokens it reads", () => {
    for (const token of ["--bg", "--green", "--green-bright", "--green-dim", "--amber"]) {
      expect(src).toContain(token);
    }
  });
});

describe("plateGeometry", () => {
  it("keeps the plate inside the width it is given", () => {
    for (const w of [320, 390, 760]) {
      const g = plateGeometry(w);
      expect(g.width).toBe(w);
      expect(g.padLeft + g.plotWidth + g.padRight).toBeLessThanOrEqual(w);
      expect(g.plotWidth).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
    }
  });

  it("drops the hour labels on a narrow phone, where they would collide", () => {
    expect(plateGeometry(320).labels).toBe(false);
    expect(plateGeometry(760).labels).toBe(true);
  });

  it("holds the field's aspect ratio, so the ground is never stretched", () => {
    const g = plateGeometry(760);
    expect(g.plotHeight / g.plotWidth).toBeCloseTo((24 - 1) / (52 - 1), 6);
  });
});

describe("planPlate", () => {
  const layers = contourLayers(buildHeightmap(demoEvents()).field);
  const geometry = plateGeometry(760);
  const ops = planPlate({ layers, geometry, palette, labels: geometry.labels });

  it("clears to the page background first", () => {
    expect(ops[0]).toEqual({
      op: "clear",
      w: geometry.width,
      h: geometry.height,
      fill: palette.bg,
    });
  });

  it("draws one polyline op per chained contour", () => {
    const drawn = ops.filter((o): o is Extract<DrawOp, { op: "polyline" }> => o.op === "polyline");
    expect(drawn.length).toBe(layers.reduce((a, l) => a + l.lines.length, 0));
    expect(drawn.length).toBeGreaterThan(0);
  });

  it("gives index contours the brighter token and a heavier pen", () => {
    const drawn = ops.filter((o): o is Extract<DrawOp, { op: "polyline" }> => o.op === "polyline");
    const strokes = new Set(drawn.map((o) => o.stroke));
    expect(strokes).toEqual(new Set([palette.line, palette.index]));
    const heavy = drawn.filter((o) => o.stroke === palette.index).map((o) => o.width);
    const light = drawn.filter((o) => o.stroke === palette.line).map((o) => o.width);
    expect(Math.min(...heavy)).toBeGreaterThan(Math.max(...light));
  });

  it("puts every point inside the plot box", () => {
    for (const op of ops) {
      if (op.op !== "polyline") continue;
      for (const p of op.points) {
        expect(p.x).toBeGreaterThanOrEqual(geometry.padLeft - 0.01);
        expect(p.x).toBeLessThanOrEqual(geometry.padLeft + geometry.plotWidth + 0.01);
        expect(p.y).toBeGreaterThanOrEqual(geometry.padTop - 0.01);
        expect(p.y).toBeLessThanOrEqual(geometry.padTop + geometry.plotHeight + 0.01);
      }
    }
  });

  it("omits every label when the geometry says there is no room", () => {
    const narrow = plateGeometry(320);
    const tight = planPlate({ layers, geometry: narrow, palette, labels: narrow.labels });
    expect(tight.some((o) => o.op === "text")).toBe(false);
  });
});

describe("hourLabels", () => {
  it("labels every sixth hour, from midnight", () => {
    expect(hourLabels(plateGeometry(760)).map((l) => l.text)).toEqual([
      "00",
      "06",
      "12",
      "18",
    ]);
  });
});

describe("paint", () => {
  it("plays the ops onto a context and touches nothing else", () => {
    const { ctx, calls } = recorder();
    paint(ctx, [
      { op: "clear", w: 10, h: 4, fill: "BG" },
      { op: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }], stroke: "S", width: 1.5 },
      { op: "text", text: "00", x: 3, y: 4, fill: "L", align: "right" },
    ]);
    expect(calls).toEqual([
      "fillRect BG 0 0 10 4",
      "beginPath",
      "moveTo 0 0",
      "lineTo 1 2",
      "stroke S 1.5",
      "fillText L 00 3 4",
    ]);
  });

  it("skips a polyline with nothing in it rather than opening an empty path", () => {
    const { ctx, calls } = recorder();
    paint(ctx, [{ op: "polyline", points: [], stroke: "S", width: 1 }]);
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/draw.test.ts`
Expected: FAIL, cannot resolve `./draw`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/draw.ts
import type { ContourLayer } from "./contour";
import { HOURS, WEEKS, type Point } from "./types";

/**
 * The plate, as a list of instructions.
 *
 * Split in two on purpose. `planPlate` decides what to draw and is pure, so
 * the geometry and the colour choices are testable in a node environment with
 * no canvas anywhere. `paint` is the nine lines that talk to a context. The
 * bugs live in the first half and so do the tests.
 *
 * Every colour comes from the site's own CSS variables through `read`, which
 * the component wires to `getComputedStyle(document.documentElement)`. That is
 * what makes the plate change with the `theme` command for free, and it is why
 * this file contains no colour of its own: `draw.test.ts` greps it and fails
 * on a hex literal.
 */

export type Palette = {
  /** `--bg`. The page, so the plate sits on the page rather than in a box. */
  bg: string;
  /** `--green-dim`. The ordinary contour. */
  line: string;
  /** `--green`. Every second contour, the index line. */
  index: string;
  /** `--green-bright`. Reserved for the summit mark. */
  ink: string;
  /** `--amber`. Labels, as everywhere else on the site. */
  label: string;
};

export class ReliefPaletteError extends Error {
  constructor(token: string) {
    super(`relief: the theme token ${token} is empty, so the plate has no colour to draw in`);
    this.name = "ReliefPaletteError";
  }
}

export function paletteFromTokens(read: (name: string) => string): Palette {
  const need = (name: string) => {
    const value = read(name).trim();
    if (!value) throw new ReliefPaletteError(name);
    return value;
  };
  return {
    bg: need("--bg"),
    line: need("--green-dim"),
    index: need("--green"),
    ink: need("--green-bright"),
    label: need("--amber"),
  };
}

/** The subset of CanvasRenderingContext2D the painter uses. The real one satisfies it. */
export type Ctx2D = {
  canvas: { width: number; height: number };
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
};

export type PlateGeometry = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  plotWidth: number;
  plotHeight: number;
  /** False on a narrow phone, where hour labels collide with the plot. */
  labels: boolean;
};

/** Below this the labels are dropped rather than overlapped. */
const LABEL_FLOOR_PX = 480;
const GUTTER_PX = 26;
const BARE_PAD_PX = 6;

export function plateGeometry(width: number): PlateGeometry {
  const labels = width >= LABEL_FLOOR_PX;
  const padLeft = labels ? GUTTER_PX : BARE_PAD_PX;
  const padRight = BARE_PAD_PX;
  const padTop = BARE_PAD_PX;
  const padBottom = labels ? GUTTER_PX : BARE_PAD_PX;
  const plotWidth = Math.max(1, width - padLeft - padRight);
  const plotHeight = (plotWidth * (HOURS - 1)) / (WEEKS - 1);
  return {
    width,
    height: Math.round(padTop + plotHeight + padBottom),
    padLeft,
    padRight,
    padTop,
    padBottom,
    plotWidth,
    plotHeight,
    labels,
  };
}

export type DrawOp =
  | { op: "clear"; w: number; h: number; fill: string }
  | { op: "polyline"; points: readonly Point[]; stroke: string; width: number }
  | { op: "text"; text: string; x: number; y: number; fill: string; align: "left" | "right" };

/** Every sixth hour. Four labels fit at any width that has labels at all. */
export function hourLabels(_geometry: PlateGeometry): { text: string; row: number }[] {
  const rows = [0, 6, 12, 18];
  return rows.map((row) => ({ text: String(row).padStart(2, "0"), row }));
}

const LIGHT_PEN = 0.9;
const HEAVY_PEN = 1.6;

export function planPlate(input: {
  layers: readonly ContourLayer[];
  geometry: PlateGeometry;
  palette: Palette;
  labels: boolean;
}): DrawOp[] {
  const { layers, geometry: g, palette, labels } = input;
  const toX = (fx: number) => g.padLeft + (fx / (WEEKS - 1)) * g.plotWidth;
  const toY = (fy: number) => g.padTop + (fy / (HOURS - 1)) * g.plotHeight;

  const ops: DrawOp[] = [
    { op: "clear", w: g.width, h: g.height, fill: palette.bg },
  ];

  for (const layer of layers) {
    for (const line of layer.lines) {
      ops.push({
        op: "polyline",
        points: line.map((p) => ({ x: toX(p.x), y: toY(p.y) })),
        stroke: layer.index ? palette.index : palette.line,
        width: layer.index ? HEAVY_PEN : LIGHT_PEN,
      });
    }
  }

  if (labels) {
    for (const { text, row } of hourLabels(g)) {
      ops.push({
        op: "text",
        text,
        x: g.padLeft - 6,
        y: toY(row) + 4,
        fill: palette.label,
        align: "right",
      });
    }
  }

  return ops;
}

/** Plays the list. The only part that needs a real canvas. */
export function paint(ctx: Ctx2D, ops: readonly DrawOp[]): void {
  for (const op of ops) {
    if (op.op === "clear") {
      ctx.fillStyle = op.fill;
      ctx.fillRect(0, 0, op.w, op.h);
    } else if (op.op === "polyline") {
      if (op.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(op.points[0].x, op.points[0].y);
      for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.width;
      ctx.stroke();
    } else {
      ctx.fillStyle = op.fill;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
```

- [ ] **Step 4: Prove the contour colours clear the graphical-object floor on every theme**

The site's own contrast guard covers text. The plate is line art, so WCAG 1.4.11 applies and the floor is 3:1, not 4.5:1. Add to `app/globals.test.ts`, after the existing `describe("reading surfaces clear 4.5:1 on every theme", ...)`:

```ts
/**
 * Relief draws its contours in --green-dim and --green on --bg. Those are
 * graphical objects rather than text, so the applicable floor is WCAG 1.4.11's
 * 3:1 and not 4.5:1. Asserted here rather than in the tool, because this is
 * where the token blocks are parsed and where a theme is added.
 *
 * Guess before the first run, 2026-09-03: --green-dim on the green theme lands
 * near 4.7:1 by hand calculation. The run is what decides.
 */
describe("relief's contour colours are visible on every theme", () => {
  it.each(THEMES.map((t) => [t[0], t[1]] as const))("%s: an ordinary contour", (_name, vars) => {
    expect(ratio(hex(vars["--green-dim"]), hex(vars["--bg"]))).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES.map((t) => [t[0], t[1]] as const))("%s: an index contour", (_name, vars) => {
    expect(ratio(hex(vars["--green"]), hex(vars["--bg"]))).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 5: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/draw.test.ts app/globals.test.ts`
Expected: PASS. If a theme fails the 3:1 case, the number printed is the finding: the fix is to draw ordinary contours in `--green` on that theme, not to lower the floor. Record the ratios in the ledger either way.

What this proves: the ops list is correct arithmetic and the tokens clear the floor. What it cannot see: the composited pixel. The plate is drawn behind the scanline overlay and the phosphor shader, and a token ratio is not a screen ratio (CLAIMS.md rule 6). Task 12's screenshots are the first thing that looks at the real pixels, and even those do not sample inside a canvas.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/relief/draw.ts lib/tools/relief/draw.test.ts app/globals.test.ts
git commit -m "feat(relief): plan the plate as pure draw ops, coloured only from the theme tokens"
```

---

### Task 6: The SVG a pen plotter can actually draw

**Files:**
- Create: `lib/tools/relief/svg.ts`
- Test: `lib/tools/relief/svg.test.ts`

**Interfaces:**
- Consumes: `ContourLayer` from `./contour`; `HOURS`, `WEEKS`, `Polyline` from `./types`
- Produces: `type Sheet = { widthMm: number; heightMm: number; marginMm: number }`, `A4_LANDSCAPE: Sheet`, `type Fit = { scale; offsetX; offsetY; widthMm; heightMm }`, `fitToSheet(cols, rows, sheet): Fit`, `pathData(line: Polyline, fit: Fit): string`, `plotterSvg(layers: readonly ContourLayer[], sheet?: Sheet): string`

**What a plotter needs, and why each one is a rule here.** A pen plotter is not a printer. It moves one pen and it has one line width, so eight things about the file matter and every one of them is asserted in the tests below:

1. **Physical units on the root element.** `width="297mm" height="210mm"` with `viewBox="0 0 297 210"`, so one user unit is one millimetre. Without a unit, `vpype`, AxiDraw's plugin and Inkscape each guess a DPI and the plot comes out the wrong size in a different way in each.
2. **`fill="none"` on everything.** A filled shape makes the machine scribble the interior until the paper tears.
3. **One stroke width, thin.** The pen decides the real width; the attribute is a hint so the file looks right on screen. Varying it to mean anything is a lie the hardware cannot tell.
4. **No opacity, no gradient, no filter, no CSS, no `style` attribute.** Plotter toolchains read geometry and drop the rest, so anything encoded in style is silently lost.
5. **Polylines, not loose segments.** The pen lifts between paths. This is the entire reason `chainSegments` exists in Task 3.
6. **Closed rings end with `Z` rather than a repeated point,** which tells the toolchain it is a loop and lets it optimise the travel order.
7. **One group per contour level, with an `id`.** That is how a person assigns a different pen or a different pressure per layer.
8. **No text.** A plotter has no font. Text would either be dropped or converted to filled outlines, and rule 2 says what happens then. The hour labels live on the PNG and on the page, and the plotter file's caption on the page says so.

Black strokes and no background rectangle, because that is what the machine does: black ink on the visitor's own white sheet. The phosphor palette belongs on the screen.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/svg.test.ts
import { describe, it, expect } from "vitest";
import { contourLayers } from "./contour";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import { HOURS, WEEKS } from "./types";
import { A4_LANDSCAPE, fitToSheet, pathData, plotterSvg } from "./svg";

const layers = contourLayers(buildHeightmap(demoEvents()).field);
const svg = plotterSvg(layers);

describe("fitToSheet", () => {
  const fit = fitToSheet(WEEKS, HOURS, A4_LANDSCAPE);

  it("fits inside the margins on both axes", () => {
    expect(fit.offsetX).toBeGreaterThanOrEqual(A4_LANDSCAPE.marginMm - 0.001);
    expect(fit.offsetY).toBeGreaterThanOrEqual(A4_LANDSCAPE.marginMm - 0.001);
    expect(fit.offsetX + fit.widthMm).toBeLessThanOrEqual(
      A4_LANDSCAPE.widthMm - A4_LANDSCAPE.marginMm + 0.001,
    );
    expect(fit.offsetY + fit.heightMm).toBeLessThanOrEqual(
      A4_LANDSCAPE.heightMm - A4_LANDSCAPE.marginMm + 0.001,
    );
  });

  it("uses one scale for both axes, so the ground is not stretched", () => {
    expect(fit.widthMm / (WEEKS - 1)).toBeCloseTo(fit.heightMm / (HOURS - 1), 9);
  });

  it("centres what is left over", () => {
    const inner = A4_LANDSCAPE.heightMm - 2 * A4_LANDSCAPE.marginMm;
    expect(fit.offsetY - A4_LANDSCAPE.marginMm).toBeCloseTo((inner - fit.heightMm) / 2, 9);
  });
});

describe("pathData", () => {
  const fit = fitToSheet(WEEKS, HOURS, A4_LANDSCAPE);

  it("closes a ring with Z and does not repeat the first point", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ];
    const d = pathData(ring, fit);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/L/g) ?? []).toHaveLength(2);
  });

  it("leaves an open line open", () => {
    const open = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ];
    const d = pathData(open, fit);
    expect(d.endsWith("Z")).toBe(false);
    expect(d.match(/L/g) ?? []).toHaveLength(2);
  });

  it("rounds to hundredths of a millimetre, which is finer than any plotter", () => {
    for (const n of pathData([{ x: 1 / 3, y: 2 / 7 }, { x: 1, y: 1 }], fit).matchAll(/-?\d+\.?\d*/g)) {
      const decimals = (n[0].split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});

describe("plotterSvg", () => {
  it("declares real millimetres and a matching viewBox", () => {
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('height="210mm"');
    expect(svg).toContain('viewBox="0 0 297 210"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("fills nothing, anywhere", () => {
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/fill="(?!none)/);
  });

  it("carries no style, opacity, gradient or filter for a toolchain to drop", () => {
    for (const banned of ["style=", "opacity", "<linearGradient", "<filter", "<style"]) {
      expect(svg, banned).not.toContain(banned);
    }
  });

  it("has no text, because a plotter has no font", () => {
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("<tspan");
  });

  it("uses one pen width", () => {
    const widths = new Set([...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]));
    expect(widths.size).toBe(1);
  });

  it("writes one path per chained polyline and not one per segment", () => {
    const paths = (svg.match(/<path /g) ?? []).length;
    const lines = layers.reduce((a, l) => a + l.lines.length, 0);
    // Every polyline, plus the neatline.
    expect(paths).toBe(lines + 1);
  });

  it("groups by level so a pen can be assigned per layer", () => {
    const groups = [...svg.matchAll(/<g id="level-(\d)" data-level="([\d.]+)"/g)];
    expect(groups).toHaveLength(layers.length);
    expect(groups.map((m) => Number(m[2]))).toEqual(layers.map((l) => l.level));
  });

  it("draws a neatline around the plot", () => {
    expect(svg).toContain('id="neatline"');
  });

  it("is well formed enough to open, and one element deep at the root", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
  });

  it("survives having nothing to draw", () => {
    const empty = plotterSvg([]);
    expect(empty).toContain("<svg");
    expect(empty).toContain('id="neatline"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/svg.test.ts`
Expected: FAIL, cannot resolve `./svg`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/svg.ts
import type { ContourLayer } from "./contour";
import { HOURS, WEEKS, type Polyline } from "./types";

/**
 * The plotter file.
 *
 * A pen plotter is not a printer: one pen, one width, and a lift between every
 * path. So this file is geometry and nothing else. Physical millimetres on the
 * root element because every toolchain guesses a different DPI without them;
 * `fill="none"` everywhere because a filled shape makes the machine scribble
 * the interior; one group per level because that is how somebody swaps the pen
 * for the index contours; no text at all, because a plotter has no font and
 * would either drop it or convert it to a filled outline.
 *
 * Black on nothing, deliberately. The phosphor palette is for the screen; this
 * comes out as ink on the visitor's own paper.
 */

export type Sheet = { widthMm: number; heightMm: number; marginMm: number };

/** A4 landscape. The field is 52 by 24, so the wide sheet wastes the least paper. */
export const A4_LANDSCAPE: Sheet = { widthMm: 297, heightMm: 210, marginMm: 15 };

/** Fine enough that the pen is the limit. Hundredths of a millimetre. */
const DP = 2;
/** A hint. The pen decides. */
const STROKE_MM = 0.3;

export type Fit = {
  scale: number;
  offsetX: number;
  offsetY: number;
  widthMm: number;
  heightMm: number;
};

export function fitToSheet(cols: number, rows: number, sheet: Sheet): Fit {
  const innerW = sheet.widthMm - 2 * sheet.marginMm;
  const innerH = sheet.heightMm - 2 * sheet.marginMm;
  const scale = Math.min(innerW / Math.max(1, cols - 1), innerH / Math.max(1, rows - 1));
  const widthMm = (cols - 1) * scale;
  const heightMm = (rows - 1) * scale;
  return {
    scale,
    offsetX: sheet.marginMm + (innerW - widthMm) / 2,
    offsetY: sheet.marginMm + (innerH - heightMm) / 2,
    widthMm,
    heightMm,
  };
}

const round = (v: number) => Number(v.toFixed(DP)).toString();

/** Quantised the same way `contour.ts` does, so a ring closed there is closed here. */
const same = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.round(a.x * 1e4) === Math.round(b.x * 1e4) && Math.round(a.y * 1e4) === Math.round(b.y * 1e4);

export function pathData(line: Polyline, fit: Fit): string {
  if (line.length === 0) return "";
  const closed = line.length > 3 && same(line[0], line[line.length - 1]);
  const points = closed ? line.slice(0, -1) : line;
  const at = (p: { x: number; y: number }) =>
    `${round(fit.offsetX + p.x * fit.scale)} ${round(fit.offsetY + p.y * fit.scale)}`;
  const head = `M${at(points[0])}`;
  const rest = points.slice(1).map((p) => `L${at(p)}`).join("");
  return closed ? `${head}${rest}Z` : `${head}${rest}`;
}

export function plotterSvg(
  layers: readonly ContourLayer[],
  sheet: Sheet = A4_LANDSCAPE,
): string {
  const fit = fitToSheet(WEEKS, HOURS, sheet);
  const x0 = round(fit.offsetX);
  const y0 = round(fit.offsetY);
  const x1 = round(fit.offsetX + fit.widthMm);
  const y1 = round(fit.offsetY + fit.heightMm);

  const groups = layers
    .map((layer, i) => {
      const paths = layer.lines
        .map((line) => `<path d="${pathData(line, fit)}"/>`)
        .join("");
      return `<g id="level-${i}" data-level="${layer.level}">${paths}</g>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.widthMm}mm" height="${sheet.heightMm}mm" viewBox="0 0 ${sheet.widthMm} ${sheet.heightMm}">`,
    `<g fill="none" stroke="black" stroke-width="${STROKE_MM}" stroke-linecap="round" stroke-linejoin="round">`,
    groups,
    `<path id="neatline" d="M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/svg.test.ts`
Expected: PASS. What this proves: the file has the structure a plotter toolchain needs and the polylines survived chaining. What it cannot see: a plotter. Nobody in this plan owns one, so the honest claim after this task is "structurally correct, never plotted", and the page's caption does not promise more than that.

- [ ] **Step 5: Record the real counts**

Add a temporary `console.log` in the test to print `layers.reduce((a, l) => a + l.lines.length, 0)`, `plotterSvg(layers).length` and the segment count before chaining. Run, read, delete the line, and put all three in the ledger. That number is what tells a later reviewer whether the chaining is doing its job on real data, and it is the number the plan deliberately does not guess.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/relief/svg.ts lib/tools/relief/svg.test.ts
git commit -m "feat(relief): write a plotter svg in millimetres, strokes only, one group a level"
```

---

### Task 7: The STL, and the proof the solid is closed

**Files:**
- Create: `lib/tools/relief/stl.ts`
- Test: `lib/tools/relief/stl.test.ts`

**Interfaces:**
- Consumes: `Field`, `HOURS`, `WEEKS` from `./types`
- Produces: `CELL_MM = 2`, `BASE_MM = 2`, `RELIEF_MM = 12`, `type Vec3 = [number, number, number]`, `type Triangle = [Vec3, Vec3, Vec3]`, `buildMesh(field: Field): Triangle[]`, `openEdges(triangles: readonly Triangle[]): string[]`, `signedVolume(triangles: readonly Triangle[]): number`, `triangleCount(rows: number, cols: number): number`, `writeBinaryStl(triangles: readonly Triangle[], header?: string): ArrayBuffer`, `STL_HEADER`

**Binary, not ASCII, and why.** ASCII STL writes each triangle as seven lines of decimal text, about 250 bytes against binary's 50. For this mesh that is roughly 1.2 MB against 244 KB, for a file a visitor downloads on a phone. Binary also round-trips the floats exactly instead of through `toFixed`, and every slicer written since 1990 reads it. The one trap is that a binary file whose 80-byte header begins with the word `solid` is read as ASCII by some parsers, so the header here starts with `relief`.

**The byte layout, exactly:**

| Offset | Bytes | Contents |
|---|---|---|
| 0 | 80 | Header text, ASCII, zero-padded. Must not start with `solid`. |
| 80 | 4 | `uint32` little-endian, the triangle count. |
| 84 + 50n | 12 | Normal, three `float32` little-endian. |
| 96 + 50n | 36 | Three vertices, nine `float32` little-endian. |
| 132 + 50n | 2 | `uint16` attribute byte count, always zero. |

Total length is `84 + 50 * n`. Every multi-byte value is little-endian; there is no big-endian STL.

**The mesh, exactly.** The heights are vertex samples, not plates, so the top surface is the `(rows - 1) * (cols - 1)` squares between neighbouring samples, two triangles each. That is "two triangles a cell" as the design says it, and it is the reading that can be watertight; treating each cell as its own flat plate would need four extra wall quads per cell and print as a pin cushion.

- Vertex at sample `(r, c)`: `x = c * CELL_MM`, `y = r * CELL_MM`, `z = BASE_MM + field[r][c] * RELIEF_MM`.
- **Top**, per cell, with `A = (r, c)`, `B = (r, c+1)`, `C = (r+1, c+1)`, `D = (r+1, c)`: triangles `[A, B, C]` and `[A, C, D]`. Both wind counter-clockwise seen from `+z`, so both normals point up, which is outward.
- **Base**, the same grid at `z = 0`, wound the other way: `[A', C', B']` and `[A', D', C']`.
- **Skirt**, one quad per boundary edge, from the top edge down to `z = 0`. `wall(a, b)` takes the two top vertices **in the direction the top surface already winds that boundary edge** and emits `[q0, q1, b]` and `[q0, b, a]`, where `q` is the point directly below at `z = 0`. That produces the reverse of the top's directed edge, which is what makes the pair share it. The perimeter walk is therefore:
  - top edge, `c` from `0` to `cols-2`: `wall(v(0, c), v(0, c+1))`
  - right edge, `r` from `0` to `rows-2`: `wall(v(r, cols-1), v(r+1, cols-1))`
  - bottom edge, `c` from `cols-2` down to `0`: `wall(v(rows-1, c+1), v(rows-1, c))`
  - left edge, `r` from `rows-2` down to `0`: `wall(v(r+1, 0), v(r, 0))`

**Why the base is triangulated on the grid rather than as two big triangles.** This is the trap, and it is the reason the closed-mesh test exists. A base of two triangles has boundary edges spanning a whole side, while the skirt's bottom has one short edge per cell. Those are T-junctions: the long edge appears once and each short edge appears once, so no edge is shared by exactly two triangles, and a slicer either refuses the file or silently repairs it into something else. Meshing the base on the same grid makes every bottom edge match a skirt edge exactly.

**Counts, at 24 by 52:** top `23 * 51 * 2 = 2,346`, base `2,346`, skirt `2 * (51 + 23) * 2 = 296`. Total **4,988** triangles, so **249,484 bytes**. The plate comes out 102mm by 46mm, 2mm to 14mm tall.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/stl.test.ts
import { describe, it, expect } from "vitest";
import { HOURS, WEEKS, type Field } from "./types";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import {
  BASE_MM,
  CELL_MM,
  RELIEF_MM,
  STL_HEADER,
  buildMesh,
  openEdges,
  signedVolume,
  triangleCount,
  writeBinaryStl,
} from "./stl";

const field: Field = buildHeightmap(demoEvents()).field;
const mesh = buildMesh(field);

const tiny: Field = [
  [0, 0.5],
  [1, 0.25],
];

describe("triangleCount", () => {
  it("is the top, the base and the skirt", () => {
    expect(triangleCount(HOURS, WEEKS)).toBe(23 * 51 * 2 + 23 * 51 * 2 + 2 * (51 + 23) * 2);
    expect(triangleCount(HOURS, WEEKS)).toBe(4988);
    expect(triangleCount(2, 2)).toBe(2 + 2 + 2 * (1 + 1) * 2);
  });
});

describe("buildMesh", () => {
  it("makes exactly the triangles the formula says", () => {
    expect(mesh).toHaveLength(triangleCount(HOURS, WEEKS));
    expect(buildMesh(tiny)).toHaveLength(triangleCount(2, 2));
  });

  it("puts the plate where the plan says", () => {
    const xs = mesh.flat().map((v) => v[0]);
    const ys = mesh.flat().map((v) => v[1]);
    const zs = mesh.flat().map((v) => v[2]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe((WEEKS - 1) * CELL_MM);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe((HOURS - 1) * CELL_MM);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBeLessThanOrEqual(BASE_MM + RELIEF_MM + 1e-9);
    // No zero-thickness region: even a flat cell has the base under it.
    expect(zs.filter((z) => z > 0).every((z) => z >= BASE_MM - 1e-9)).toBe(true);
  });

  /**
   * The classic failure. Every directed edge exactly once, and every one with
   * its opposite present, is a closed orientable manifold: each undirected
   * edge is shared by exactly two triangles wound the opposite way. A printer
   * rejects anything less, and the repair some slicers do instead is worse
   * than a rejection because it is silent.
   */
  it("is watertight", () => {
    expect(openEdges(mesh)).toEqual([]);
  });

  it("is watertight on the smallest possible field too", () => {
    expect(openEdges(buildMesh(tiny))).toEqual([]);
  });

  it("winds every face outward, which a positive volume proves", () => {
    const v = signedVolume(mesh);
    const footprint = (WEEKS - 1) * CELL_MM * ((HOURS - 1) * CELL_MM);
    expect(v).toBeGreaterThan(footprint * BASE_MM * 0.99);
    expect(v).toBeLessThan(footprint * (BASE_MM + RELIEF_MM));
  });

  it("refuses a field too small to have a cell in it", () => {
    expect(buildMesh([[0.5]])).toEqual([]);
    expect(buildMesh([])).toEqual([]);
  });
});

describe("openEdges", () => {
  /**
   * Proving the guard can fail. A single triangle is the simplest open mesh
   * there is, and if this returned [] the watertight test above would be
   * decoration.
   */
  it("reports a lone triangle as open", () => {
    const one: [number, number, number][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
    ];
    expect(openEdges(one as never)).toHaveLength(3);
  });

  it("reports a doubled triangle, which has every edge twice the same way round", () => {
    const t: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ];
    expect(openEdges([t, t] as never).length).toBeGreaterThan(0);
  });
});

describe("writeBinaryStl", () => {
  const buffer = writeBinaryStl(mesh);
  const view = new DataView(buffer);

  it("is 84 bytes plus 50 a triangle", () => {
    expect(buffer.byteLength).toBe(84 + 50 * mesh.length);
    expect(buffer.byteLength).toBe(249484);
  });

  it("declares the triangle count little-endian at offset 80", () => {
    expect(view.getUint32(80, true)).toBe(mesh.length);
  });

  it("does not start with the word solid, which some parsers read as ASCII", () => {
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 80));
    expect(header.startsWith("solid")).toBe(false);
    expect(header.startsWith(STL_HEADER.slice(0, 6))).toBe(true);
  });

  it("writes the first triangle's vertices where the layout says", () => {
    const [a] = mesh[0];
    expect(view.getFloat32(96, true)).toBeCloseTo(a[0], 5);
    expect(view.getFloat32(100, true)).toBeCloseTo(a[1], 5);
    expect(view.getFloat32(104, true)).toBeCloseTo(a[2], 5);
    expect(view.getUint16(132, true)).toBe(0);
  });

  it("writes a unit normal for every triangle, never a NaN", () => {
    for (let i = 0; i < mesh.length; i++) {
      const at = 84 + 50 * i;
      const n = [0, 4, 8].map((o) => view.getFloat32(at + o, true));
      expect(Number.isFinite(n[0] + n[1] + n[2])).toBe(true);
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 4);
    }
  });

  it("writes an empty mesh as a valid 84-byte file", () => {
    const empty = writeBinaryStl([]);
    expect(empty.byteLength).toBe(84);
    expect(new DataView(empty).getUint32(80, true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/stl.test.ts`
Expected: FAIL, cannot resolve `./stl`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/stl.ts
import type { Field } from "./types";

/**
 * A year of ground as something a printer can make.
 *
 * Binary STL, not ASCII: 50 bytes a triangle against roughly 250, which for
 * this mesh is 244 KB against about 1.2 MB, and the floats round-trip exactly
 * rather than through decimal text. The one trap is that a binary file whose
 * header begins with "solid" is read as ASCII by some parsers, so the header
 * here begins with "relief".
 *
 * The mesh is three parts and the third one is the interesting one. Top: two
 * triangles for each square between four neighbouring samples. Skirt: one quad
 * per boundary edge, dropped to z = 0. Base: the SAME grid, upside down. The
 * base has to be triangulated on the grid rather than as two big triangles,
 * because a long edge against the skirt's short ones is a T-junction, and a
 * T-junction means no edge is shared by exactly two triangles, which is what a
 * slicer calls "not watertight" before it either refuses the file or silently
 * repairs it into a different object. `openEdges` is the test for that and it
 * is the reason this file has one.
 */

/** Millimetres between samples. 52 columns comes out 102mm wide. */
export const CELL_MM = 2;
/** A floor under the relief, so the print has somewhere to start. */
export const BASE_MM = 2;
/** Full height above the base at a normalised height of 1. */
export const RELIEF_MM = 12;

/** 80 bytes, zero-padded. Deliberately not starting with "solid". */
export const STL_HEADER = "relief | fergusoreilly.dev | binary STL, mm";

export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];

export function triangleCount(rows: number, cols: number): number {
  if (rows < 2 || cols < 2) return 0;
  const cells = (rows - 1) * (cols - 1);
  const perimeter = 2 * (rows - 1) + 2 * (cols - 1);
  return cells * 2 + cells * 2 + perimeter * 2;
}

/**
 * One wall, from the top edge `a` to `b` down to the base.
 *
 * `a` and `b` arrive in the direction the top surface already winds that
 * boundary edge, and this emits the reverse of it, which is what makes the two
 * share the edge with opposite orientation.
 */
function wall(a: Vec3, b: Vec3): Triangle[] {
  const qa: Vec3 = [a[0], a[1], 0];
  const qb: Vec3 = [b[0], b[1], 0];
  return [
    [qa, qb, b],
    [qa, b, a],
  ];
}

export function buildMesh(field: Field): Triangle[] {
  const rows = field.length;
  const cols = rows > 0 ? field[0].length : 0;
  if (rows < 2 || cols < 2) return [];

  const v = (r: number, c: number): Vec3 => [
    c * CELL_MM,
    r * CELL_MM,
    BASE_MM + Math.min(1, Math.max(0, field[r][c])) * RELIEF_MM,
  ];
  const flat = (r: number, c: number): Vec3 => [c * CELL_MM, r * CELL_MM, 0];

  const out: Triangle[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Top. Counter-clockwise seen from +z, so both normals point up.
      const A = v(r, c);
      const B = v(r, c + 1);
      const C = v(r + 1, c + 1);
      const D = v(r + 1, c);
      out.push([A, B, C], [A, C, D]);

      // Base. The same grid, wound the other way, so the normals point down.
      const a = flat(r, c);
      const b = flat(r, c + 1);
      const c2 = flat(r + 1, c + 1);
      const d = flat(r + 1, c);
      out.push([a, c2, b], [a, d, c2]);
    }
  }

  // Skirt, walked so each `wall` call gets the top surface's own direction.
  for (let c = 0; c < cols - 1; c++) out.push(...wall(v(0, c), v(0, c + 1)));
  for (let r = 0; r < rows - 1; r++) out.push(...wall(v(r, cols - 1), v(r + 1, cols - 1)));
  for (let c = cols - 2; c >= 0; c--) out.push(...wall(v(rows - 1, c + 1), v(rows - 1, c)));
  for (let r = rows - 2; r >= 0; r--) out.push(...wall(v(r + 1, 0), v(r, 0)));

  return out;
}

/** Quantised, because a shared vertex is computed twice and floats are floats. */
const vkey = (v: Vec3) => `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;

/**
 * Every directed edge exactly once, and every one with its opposite present.
 * That is a closed, orientable, manifold surface, which is what "watertight"
 * means to a slicer. Returns the offending edges so a failure names them.
 */
export function openEdges(triangles: readonly Triangle[]): string[] {
  const seen = new Map<string, number>();
  for (const [a, b, c] of triangles) {
    const k = [vkey(a), vkey(b), vkey(c)];
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const edge = `${k[i]}|${k[j]}`;
      seen.set(edge, (seen.get(edge) ?? 0) + 1);
    }
  }
  const bad: string[] = [];
  for (const [edge, count] of seen) {
    const [p, q] = edge.split("|");
    if (count !== 1) bad.push(`${edge} appears ${count} times`);
    else if (!seen.has(`${q}|${p}`)) bad.push(`${edge} has no opposite`);
  }
  return bad;
}

/** Positive when the faces wind outward. Six times the tetrahedron sum. */
export function signedVolume(triangles: readonly Triangle[]): number {
  let total = 0;
  for (const [a, b, c] of triangles) {
    total +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return total;
}

function normalOf([a, b, c]: Triangle): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  // A degenerate triangle cannot occur in this mesh, and a zero-length normal
  // would write three NaNs into the file if one ever did.
  return len === 0 ? [0, 0, 0] : [n[0] / len, n[1] / len, n[2] / len];
}

export function writeBinaryStl(
  triangles: readonly Triangle[],
  header: string = STL_HEADER,
): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50 * triangles.length);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode(header).slice(0, 80), 0);
  view.setUint32(80, triangles.length, true);

  let at = 84;
  for (const tri of triangles) {
    for (const vec of [normalOf(tri), tri[0], tri[1], tri[2]]) {
      view.setFloat32(at, vec[0], true);
      view.setFloat32(at + 4, vec[1], true);
      view.setFloat32(at + 8, vec[2], true);
      at += 12;
    }
    view.setUint16(at, 0, true);
    at += 2;
  }
  return buffer;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/stl.test.ts`
Expected: PASS, including `byteLength === 249484`. If the watertight test fails, read the edges it prints: an edge with no opposite is a winding mistake in the perimeter walk, and an edge appearing twice the same way round is a duplicated triangle. Do not loosen `openEdges`.

What this proves: the mesh is a closed orientable manifold with outward normals and the file is laid out as the format says. What it cannot see: a slicer's opinion. Task 13 loads the downloaded file into a slicer or a mesh viewer and records what it says, and until then the honest word is "closed by the edge test", not "prints".

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/relief/stl.ts lib/tools/relief/stl.test.ts
git commit -m "feat(relief): build a closed solid and write it as binary stl"
```

---

### Task 8: CSV in, with the column the visitor picks

**Files:**
- Create: `lib/tools/relief/csv.ts`
- Test: `lib/tools/relief/csv.test.ts`

**Interfaces:**
- Consumes: `ReliefEvent`, `WEEKS`, `MS_WEEK` from `./types`; `weekIndex` from `./heightmap`
- Produces: `MAX_CSV_ROWS = 200000`, `parseCsv(text: string): { headers: string[]; rows: string[][] }`, `type Parsed = { at: number; hour: number }`, `parseWhen(value: string): Parsed | null`, `dateColumnGuess(headers: readonly string[], rows: readonly string[][]): number`, `type CsvReading = { events: ReliefEvent[]; read: number; skipped: number; endMs: number }`, `eventsFromCsv(rows: readonly string[][], column: number): CsvReading`

**The two rules that make this honest.** The window is derived from the file rather than from today, because a bookings export from 2024 should draw 2024 and not fifty-two empty weeks. And a date with no offset is read as it is typed: the hour field verbatim, exactly as the GitHub path does, so a spreadsheet exported in one country draws the same ground when opened in another. Both are on the "can't see" list.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/csv.test.ts
import { describe, it, expect } from "vitest";
import { MS_WEEK, WEEKS } from "./types";
import { dateColumnGuess, eventsFromCsv, parseCsv, parseWhen } from "./csv";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("a,b\n1,2\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps a comma inside quotes", () => {
    expect(parseCsv('a,b\n"one, two",3').rows).toEqual([["one, two", "3"]]);
  });

  it("keeps a newline inside quotes", () => {
    expect(parseCsv('a,b\n"one\ntwo",3').rows).toEqual([["one\ntwo", "3"]]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('a\n"he said ""no"""').rows).toEqual([['he said "no"']]);
  });

  it("survives CRLF, which is what a spreadsheet exports on Windows", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([["1", "2"]]);
  });

  it("strips a UTF-8 byte order mark, which Excel writes and nothing else expects", () => {
    expect(parseCsv("﻿date,n\n2026-01-01,1").headers).toEqual(["date", "n"]);
  });

  it("drops a trailing blank line rather than reading it as a row", () => {
    expect(parseCsv("a\n1\n\n").rows).toEqual([["1"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("parseWhen", () => {
  it("reads an ISO timestamp with an offset and keeps the local hour", () => {
    const p = parseWhen("2026-01-14T21:03:11+01:00");
    expect(p?.hour).toBe(21);
    expect(p?.at).toBe(Date.parse("2026-01-14T21:03:11+01:00"));
  });

  it("keeps the local hour for Z too, which is a zero offset and still local", () => {
    expect(parseWhen("2026-01-14T21:03:11Z")?.hour).toBe(21);
  });

  it("reads a bare timestamp as wall clock, which is what a spreadsheet writes", () => {
    expect(parseWhen("2026-01-14 21:03:11")?.hour).toBe(21);
  });

  it("reads a date with no time as midnight, and says so by putting it in row 0", () => {
    expect(parseWhen("2026-01-14")?.hour).toBe(0);
  });

  it("refuses anything it cannot read rather than guessing a format", () => {
    for (const bad of ["", "not a date", "14/01/2026", "20260114"]) {
      expect(parseWhen(bad), bad).toBeNull();
    }
  });
});

describe("dateColumnGuess", () => {
  it("picks the column that parses most often", () => {
    const headers = ["id", "when", "amount"];
    const rows = [
      ["1", "2026-01-01T09:00:00Z", "10"],
      ["2", "2026-01-02T09:00:00Z", "11"],
    ];
    expect(dateColumnGuess(headers, rows)).toBe(1);
  });

  it("breaks a tie towards the column whose header sounds like a date", () => {
    const headers = ["created", "updated"];
    const rows = [
      ["2026-01-01", "2026-01-01"],
      ["2026-01-02", "2026-01-02"],
    ];
    expect(dateColumnGuess(headers, rows)).toBe(0);
  });

  it("returns -1 when nothing parses, so the page asks rather than guessing", () => {
    expect(dateColumnGuess(["a"], [["x"], ["y"]])).toBe(-1);
  });
});

describe("eventsFromCsv", () => {
  const at = (iso: string) => [iso];

  it("anchors the window on the newest row in the file, not on today", () => {
    const newest = "2024-06-05T12:00:00Z";
    const reading = eventsFromCsv([at(newest), at("2024-06-04T09:00:00Z")], 0);
    expect(reading.endMs).toBe(Date.parse(newest));
    expect(reading.events.map((e) => e.week)).toEqual([WEEKS - 1, WEEKS - 1]);
    expect(reading.events.map((e) => e.hour).sort()).toEqual([9, 12]);
  });

  it("puts a row a year back in the first column", () => {
    const newest = "2024-06-05T12:00:00Z";
    const old = new Date(Date.parse(newest) - 51 * MS_WEEK).toISOString();
    const reading = eventsFromCsv([at(newest), at(old)], 0);
    expect(reading.events.some((e) => e.week === 0)).toBe(true);
  });

  it("counts what it could not read instead of dropping it quietly", () => {
    const reading = eventsFromCsv([at("2026-01-01T00:00:00Z"), at("nonsense"), []], 0);
    expect(reading.read).toBe(1);
    expect(reading.skipped).toBe(2);
  });

  it("drops a row older than the window and counts it as skipped", () => {
    const newest = "2026-06-05T12:00:00Z";
    const ancient = new Date(Date.parse(newest) - 60 * MS_WEEK).toISOString();
    const reading = eventsFromCsv([at(newest), at(ancient)], 0);
    expect(reading.events).toHaveLength(1);
    expect(reading.skipped).toBe(1);
  });

  it("returns an empty reading for an empty file rather than throwing", () => {
    expect(eventsFromCsv([], 0)).toEqual({ events: [], read: 0, skipped: 0, endMs: 0 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/csv.test.ts`
Expected: FAIL, cannot resolve `./csv`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/csv.ts
import { WEEKS, type ReliefEvent } from "./types";
import { weekIndex } from "./heightmap";

/**
 * Any CSV with a date column in it.
 *
 * Hand-written rather than a dependency: RFC 4180 is one state machine, the
 * tool wants the header row and one column, and a parser package would be the
 * only runtime dependency this whole tool needed.
 *
 * Two decisions worth defending. The window is anchored on the newest row in
 * the file rather than on today, so a two-year-old export draws the year it
 * covers instead of fifty-two empty weeks. And a timestamp with no offset is
 * read as wall clock, hour field verbatim, exactly as the GitHub path reads
 * the author's local hour. Both are on the tool's "can't see" list, because
 * both are places where the sheet is answering a slightly different question
 * from the one a visitor might assume.
 */

/** A phone reading a bigger file than this is a phone that stops responding. */
export const MAX_CSV_ROWS = 200_000;

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      table.push(row);
      row = [];
      if (table.length > MAX_CSV_ROWS) break;
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    table.push(row);
  }

  // A trailing newline produces one row of one empty field. It is not a row.
  const real = table.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (real.shift() ?? []).map((h) => h.trim());
  return { headers, rows: real };
}

export type Parsed = { at: number; hour: number };

/**
 * ISO 8601, with or without an offset, and the space-separated variant every
 * spreadsheet writes. Nothing else: `14/01/2026` is either January or the
 * fourteenth of the month depending on which side of an ocean it was written
 * on, and a tool that guesses wrong draws a plausible lie.
 */
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function parseWhen(value: string): Parsed | null {
  const m = ISO.exec(value.trim());
  if (!m) return null;
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  // The instant, for the column. Offsetless input is read as UTC here, which
  // shifts a column boundary by at most half a day and never a row.
  const at = Date.parse(m[7] ? value.trim().replace(" ", "T") : `${value.trim().replace(" ", "T")}Z`);
  if (!Number.isFinite(at)) return null;
  return { at, hour };
}

const DATE_WORDS = /date|time|when|created|at$|_at|day/i;

/** The column most rows parse in. A tie goes to the header that sounds like a date. */
export function dateColumnGuess(
  headers: readonly string[],
  rows: readonly string[][],
): number {
  const sample = rows.slice(0, 50);
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < Math.max(headers.length, sample[0]?.length ?? 0); c++) {
    const hits = sample.filter((r) => parseWhen(r[c] ?? "") !== null).length;
    if (hits === 0) continue;
    const score = hits * 10 + (DATE_WORDS.test(headers[c] ?? "") ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export type CsvReading = {
  events: ReliefEvent[];
  read: number;
  skipped: number;
  /** The instant the window ends: the newest row in the file. */
  endMs: number;
};

export function eventsFromCsv(rows: readonly string[][], column: number): CsvReading {
  const parsed: Parsed[] = [];
  let skipped = 0;
  for (const row of rows) {
    const p = parseWhen(row[column] ?? "");
    if (p) parsed.push(p);
    else skipped++;
  }
  if (parsed.length === 0) return { events: [], read: 0, skipped, endMs: 0 };

  const endMs = Math.max(...parsed.map((p) => p.at));
  const events: ReliefEvent[] = [];
  for (const p of parsed) {
    const week = weekIndex(p.at, endMs);
    if (week === null || week < 0 || week >= WEEKS) {
      skipped++;
      continue;
    }
    events.push({ week, hour: p.hour });
  }
  return { events, read: events.length, skipped, endMs };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/csv.test.ts`
Expected: PASS. What this proves: the parser handles the quoting, the line endings and the byte order mark a real export carries, and the window is taken off the file. What it cannot see: a real export. Task 13 drops one in and records the row and skip counts.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/relief/csv.ts lib/tools/relief/csv.test.ts
git commit -m "feat(relief): read any csv with a date column, anchored on the file's own newest row"
```

---

### Task 9: GitHub in, with a token that goes nowhere

**Files:**
- Create: `lib/tools/relief/github.ts`
- Test: `lib/tools/relief/github.test.ts`

**Interfaces:**
- Consumes: `ReliefEvent`, `WEEKS`, `MS_WEEK` from `./types`; `weekIndex` from `./heightmap`
- Produces: `GITHUB_API = "https://api.github.com"`, `WINDOW_WEEKS = 4`, `WINDOWS = 13`, `PAGE_SIZE = 100`, `MAX_PAGES_PER_WINDOW = 10`, `MAX_COMMITS = 5000`, `SEARCH_INTERVAL_MS = 2200`, `class ReliefAuthError`, `class ReliefRateLimitError`, `class ReliefInputError`, `validUsername(name: string): boolean`, `githubUrl(path: string, params: Record<string, string>): string`, `localHour(iso: string): number | null`, `searchWindows(endMs: number): { since: string; until: string }[]`, `type FetchOptions`, `fetchCommitEvents(options: FetchOptions): Promise<{ events: ReliefEvent[]; truncated: boolean }>`

**Why a token, and which one.** The programme design's sentence stands: the unauthenticated API caps at 60 calls an hour, which is nowhere near a year of commits. Commit search is tighter still, at roughly ten requests a minute unauthenticated against thirty authenticated, so the field is not a nicety. The token needs **no scopes ticked**: a bare token already reads every public repository, and ticking `repo` is the only thing that adds private ones. The page says exactly that.

**Why the search API and not a repository walk.** A walk over a person's repositories is one call to list them plus one call per repository per page, which for anybody with sixty repositories is hundreds of requests against the 5,000-an-hour core limit and minutes of waiting. Commit search takes a date range, so a year is thirteen four-week windows, each paged at 100 up to the API's own 1,000-result ceiling. Thirteen requests at the floor, a few dozen at the top, paced at 2.2 seconds so the per-minute search limit is never the thing that stops it.

**The hour rule, stated once and implemented once.** `localHour` takes the hour field out of the ISO string verbatim, offset and all. It does **not** call `Date` for the row, because `getHours` would answer in the visitor's zone and `getUTCHours` in Greenwich, and the question the sheet asks is what time it was where the author was sitting. `Date.parse` is used only for the column, where the calendar is the right frame.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/relief/github.test.ts
import { describe, it, expect } from "vitest";
import { MS_WEEK, WEEKS } from "./types";
import {
  GITHUB_API,
  MAX_COMMITS,
  PAGE_SIZE,
  ReliefAuthError,
  ReliefInputError,
  ReliefRateLimitError,
  WINDOWS,
  fetchCommitEvents,
  githubUrl,
  localHour,
  searchWindows,
  validUsername,
} from "./github";

const TOKEN = "ghp_notarealtokenatall000000000000000000";
const END = Date.UTC(2026, 8, 3);

type Recorded = { url: string; headers: Record<string, string>; body: unknown };

/** A recording fetch. Answers `items` commits per page and logs every request. */
function stubFetch(pages: (unknown[] | { status: number; headers?: Record<string, string> })[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ url, headers, body: init?.body ?? null });
    const page = pages[Math.min(i++, pages.length - 1)];
    if (Array.isArray(page)) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ total_count: page.length, incomplete_results: false, items: page }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: page.status,
      headers: new Headers(page.headers ?? {}),
      json: async () => ({ message: "no" }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const commit = (iso: string) => ({ commit: { author: { date: iso } } });
const run = (
  pages: Parameters<typeof stubFetch>[0],
  over: Partial<Parameters<typeof fetchCommitEvents>[0]> = {},
) => {
  const { impl, calls } = stubFetch(pages);
  return {
    calls,
    promise: fetchCommitEvents({
      user: "fergo5002",
      token: TOKEN,
      endMs: END,
      fetchImpl: impl,
      sleep: async () => {},
      ...over,
    }),
  };
};

describe("validUsername", () => {
  it("accepts a real one", () => {
    expect(validUsername("fergo5002")).toBe(true);
    expect(validUsername("a-b-c")).toBe(true);
  });

  it("refuses anything that could change the URL", () => {
    for (const bad of ["", "a b", "../x", 'a"', "a/b", "-lead", "trail-", "a".repeat(40), "a:b"]) {
      expect(validUsername(bad), bad).toBe(false);
    }
  });
});

describe("githubUrl", () => {
  it("builds on the API origin and nothing else", () => {
    expect(githubUrl("/search/commits", { q: "author:x" })).toBe(
      `${GITHUB_API}/search/commits?q=author%3Ax`,
    );
  });

  it("refuses an absolute URL", () => {
    expect(() => githubUrl("https://evil.example/x", {})).toThrow(/single-slash/);
  });

  it("refuses a protocol-relative path", () => {
    expect(() => githubUrl("//evil.example/x", {})).toThrow(/single-slash/);
  });

  it("cannot be walked off the origin", () => {
    expect(new URL(githubUrl("/../../x", {})).origin).toBe(GITHUB_API);
  });
});

describe("localHour", () => {
  it("takes the hour off the author's own clock, offset and all", () => {
    expect(localHour("2026-01-14T21:03:11+01:00")).toBe(21);
    expect(localHour("2026-01-14T21:03:11-08:00")).toBe(21);
    expect(localHour("2026-01-14T21:03:11Z")).toBe(21);
  });

  it("does not agree with UTC, which is the whole point", () => {
    const iso = "2026-01-14T23:30:00+05:30";
    expect(localHour(iso)).toBe(23);
    expect(new Date(iso).getUTCHours()).not.toBe(23);
  });

  it("returns null for anything it cannot read", () => {
    expect(localHour("yesterday")).toBeNull();
    expect(localHour("")).toBeNull();
  });
});

describe("searchWindows", () => {
  const windows = searchWindows(END);

  it("covers the year in thirteen four-week windows", () => {
    expect(windows).toHaveLength(WINDOWS);
    expect(WINDOWS * 4).toBe(WEEKS);
  });

  it("ends at the window's end and starts a year before it", () => {
    expect(windows[windows.length - 1].until).toBe(new Date(END).toISOString().slice(0, 10));
    expect(Date.parse(windows[0].since)).toBeLessThanOrEqual(END - (WEEKS - 1) * MS_WEEK);
  });

  it("leaves no gap between windows", () => {
    for (let i = 1; i < windows.length; i++) {
      const gap = Date.parse(windows[i].since) - Date.parse(windows[i - 1].until);
      expect(gap).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });
});

describe("fetchCommitEvents", () => {
  it("turns commits into events on the right row and column", async () => {
    const iso = new Date(END - 3 * MS_WEEK).toISOString().replace(/T.*/, "T21:03:11+01:00");
    const { promise } = run([[commit(iso)], []]);
    const { events } = await promise;
    expect(events[0].hour).toBe(21);
    expect(events[0].week).toBe(WEEKS - 4);
  });

  /**
   * The guard the plan's constraints name. Every request on the API origin,
   * the token in exactly one header, never in a URL and never in a body.
   */
  it("sends the token in one header and puts it nowhere else", async () => {
    const { calls, promise } = run([[commit("2026-08-01T09:00:00Z")], []]);
    await promise;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(`${GITHUB_API}/`)).toBe(true);
      expect(call.url).not.toContain(TOKEN);
      expect(String(call.body ?? "")).not.toContain(TOKEN);
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("asks for a hundred at a time", async () => {
    const { calls, promise } = run([[]]);
    await promise;
    expect(calls[0].url).toContain(`per_page=${PAGE_SIZE}`);
  });

  it("stops paging a window when a short page comes back", async () => {
    const { calls, promise } = run([[commit("2026-08-01T09:00:00Z")]]);
    await promise;
    // One request per window, never a second page after a short one.
    expect(calls).toHaveLength(WINDOWS);
  });

  it("refuses a username that is not one, before any request", async () => {
    const { calls, promise } = run([[]], { user: "a b" });
    await expect(promise).rejects.toBeInstanceOf(ReliefInputError);
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty token, before any request", async () => {
    const { calls, promise } = run([[]], { token: "  " });
    await expect(promise).rejects.toBeInstanceOf(ReliefInputError);
    expect(calls).toHaveLength(0);
  });

  it("says the token was rejected rather than blaming the data", async () => {
    const { promise } = run([{ status: 401 }]);
    await expect(promise).rejects.toBeInstanceOf(ReliefAuthError);
  });

  it("backs off once on a rate limit and gives up saying so", async () => {
    const { promise } = run([{ status: 403, headers: { "retry-after": "1" } }]);
    await expect(promise).rejects.toBeInstanceOf(ReliefRateLimitError);
  });

  it("waits between requests, so the per-minute search limit is never the thing that stops it", async () => {
    const waits: number[] = [];
    const { promise } = run([[]], { sleep: async (ms: number) => void waits.push(ms) });
    await promise;
    expect(waits.length).toBeGreaterThanOrEqual(WINDOWS - 1);
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(2000);
  });

  it("reports progress once per window", async () => {
    const seen: number[] = [];
    const { promise } = run([[]], { onProgress: (done: number) => void seen.push(done) });
    await promise;
    expect(seen[seen.length - 1]).toBe(WINDOWS);
  });

  it("stops at the commit cap and says it truncated", async () => {
    const full = Array.from({ length: PAGE_SIZE }, () => commit("2026-08-01T09:00:00Z"));
    const { promise } = run([full]);
    const { events, truncated } = await promise;
    expect(events.length).toBeLessThanOrEqual(MAX_COMMITS);
    expect(truncated).toBe(true);
  });

  it("drops a commit whose date it cannot read instead of throwing", async () => {
    const { promise } = run([[commit("whenever"), commit("2026-08-01T09:00:00Z")], []]);
    const { events } = await promise;
    expect(events).toHaveLength(1);
  });

  it("stops early when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, promise } = run([[]], { signal: controller.signal });
    await expect(promise).rejects.toThrow(/abort/i);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/github.test.ts`
Expected: FAIL, cannot resolve `./github`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/github.ts
import { MS_WEEK, WEEKS, type ReliefEvent } from "./types";
import { weekIndex } from "./heightmap";

/**
 * A year of commits, from the visitor's own browser, with the visitor's own
 * token.
 *
 * Three things about this file are load-bearing and each has a test.
 *
 * **The origin fence.** Every request is built by `githubUrl`, which refuses
 * anything that is not a single-leading-slash path and then checks the origin
 * of the result. Nothing a visitor types reaches a URL unvalidated: the
 * username goes through `validUsername` first, and the token never reaches a
 * URL at all.
 *
 * **The token's one home.** It is put into the Authorization header and
 * nowhere else. It is not stored, not logged, not sent as a query parameter,
 * and this module has no reference to any storage API. `safety.test.ts` greps
 * the whole tool for one.
 *
 * **The hour.** `localHour` reads the hour field out of the ISO string as
 * written, offset and all, because the question the sheet asks is what time it
 * was where the author was sitting. `Date.parse` is used for the column only,
 * where the calendar is the right frame. Those two readings of one timestamp
 * disagree on purpose and the page says so.
 */

export const GITHUB_API = "https://api.github.com";
/** Four weeks a window, thirteen of them, which is exactly the 52 columns. */
export const WINDOW_WEEKS = 4;
export const WINDOWS = WEEKS / WINDOW_WEEKS;
export const PAGE_SIZE = 100;
/** The search API's own ceiling is 1,000 results, which is ten pages. */
export const MAX_PAGES_PER_WINDOW = 10;
/** Past this the page says it truncated rather than pretending it saw the lot. */
export const MAX_COMMITS = 5000;
/** Commit search allows about thirty requests a minute authenticated. 2.2s is inside it. */
export const SEARCH_INTERVAL_MS = 2200;

export class ReliefInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReliefInputError";
  }
}
export class ReliefAuthError extends Error {
  constructor() {
    super("relief: GitHub refused that token");
    this.name = "ReliefAuthError";
  }
}
export class ReliefRateLimitError extends Error {
  constructor() {
    super("relief: GitHub is rate limiting this token");
    this.name = "ReliefRateLimitError";
  }
}

/** GitHub's own rule: 1 to 39 of letters, digits and hyphens, not starting or ending on one. */
export function validUsername(name: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(name);
}

export function githubUrl(path: string, params: Record<string, string>): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ReliefInputError(`relief: a request path must be a single-slash path, got ${path}`);
  }
  const url = new URL(GITHUB_API + path);
  if (url.origin !== GITHUB_API) {
    throw new ReliefInputError(`relief: refused an off-origin request to ${url.origin}`);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

const ISO_HOUR = /^\d{4}-\d{2}-\d{2}T(\d{2}):/;

/** The hour off the author's own clock. Never `getHours`, never `getUTCHours`. */
export function localHour(iso: string): number | null {
  const m = ISO_HOUR.exec(iso.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function searchWindows(endMs: number): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  for (let i = WINDOWS - 1; i >= 0; i--) {
    const until = endMs - i * WINDOW_WEEKS * MS_WEEK;
    const since = until - WINDOW_WEEKS * MS_WEEK + 24 * 60 * 60 * 1000;
    out.push({ since: day(since), until: day(until) });
  }
  return out;
}

export type FetchOptions = {
  user: string;
  token: string;
  endMs: number;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number, commits: number) => void;
  signal?: AbortSignal;
};

type SearchItem = { commit?: { author?: { date?: string } } };

export async function fetchCommitEvents(
  options: FetchOptions,
): Promise<{ events: ReliefEvent[]; truncated: boolean }> {
  const { user, token, endMs, fetchImpl, sleep, onProgress, signal } = options;
  if (!validUsername(user)) throw new ReliefInputError("relief: that is not a GitHub username");
  if (token.trim() === "") throw new ReliefInputError("relief: a token is needed for a whole year");
  signal?.throwIfAborted();

  const events: ReliefEvent[] = [];
  const windows = searchWindows(endMs);
  let truncated = false;
  let requests = 0;

  for (let w = 0; w < windows.length && !truncated; w++) {
    const { since, until } = windows[w];
    for (let page = 1; page <= MAX_PAGES_PER_WINDOW; page++) {
      signal?.throwIfAborted();
      if (requests > 0) await sleep(SEARCH_INTERVAL_MS);
      requests++;

      const url = githubUrl("/search/commits", {
        q: `author:${user} author-date:${since}..${until}`,
        sort: "author-date",
        order: "desc",
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal,
      });

      if (response.status === 401) throw new ReliefAuthError();
      if (response.status === 403 || response.status === 429) throw new ReliefRateLimitError();
      if (!response.ok) {
        throw new Error(`relief: GitHub answered ${response.status}`);
      }

      const body = (await response.json()) as { items?: SearchItem[] };
      const items = body.items ?? [];
      for (const item of items) {
        const iso = item.commit?.author?.date;
        if (!iso) continue;
        const hour = localHour(iso);
        const at = Date.parse(iso);
        if (hour === null || !Number.isFinite(at)) continue;
        const week = weekIndex(at, endMs);
        if (week === null) continue;
        events.push({ week, hour });
        if (events.length >= MAX_COMMITS) {
          truncated = true;
          break;
        }
      }
      if (truncated || items.length < PAGE_SIZE) break;
    }
    onProgress?.(w + 1, windows.length, events.length);
  }

  return { events, truncated };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/github.test.ts`
Expected: PASS.

What this proves: against a recording stub, every request goes to `api.github.com`, the token is only ever in the Authorization header, the paging and the pacing behave, and the hour is the author's. What it cannot see: GitHub. No test here has touched the real API, so the `Accept` header, the media type, the exact rate-limit response shape and whether commit search still needs a preview header are all **guesses until Task 13 runs it against the live endpoint with a real token**. If the live run comes back 415 or 422, that is the finding to record and fix, not a reason to doubt the pipeline.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/relief/github.ts lib/tools/relief/github.test.ts
git commit -m "feat(relief): read a year of commits from github behind an origin fence"
```

---

### Task 10: The page, the client island, and the three files that come off it

**Files:**
- Create: `lib/tools/relief/download.ts`
- Test: `lib/tools/relief/download.test.ts`
- Create: `app/tools/relief/page.tsx`
- Create: `app/tools/relief/ReliefTool.tsx`
- Create: `app/tools/relief/tool.css`
- Test: `app/tools/relief/page.test.ts`
- Test: `app/tools/relief/ReliefTool.test.ts`
- Test: `lib/tools/relief/safety.test.ts`
- Modify: `content/tools/relief.ts` (the words the page needs and Task 1 did not have)

**Interfaces:**
- Consumes: `ToolPage` (F3), `relief` and `reliefCopy` from `content/tools/relief`, every module in `lib/tools/relief/`, `trackToolRun` from `@/lib/tools/events` (F3), `useSystem` from `@/components/system/SystemProvider`
- Produces: the route `/tools/relief`, which the sitemap and `/llms.txt` pick up on their own through `liveTools`. In `download.ts`: `type PlateSource = "demo" | "github" | "csv"`, `type PlateKind = "png" | "svg" | "stl"`, `PNG_MIME`, `SVG_MIME`, `STL_MIME`, `plateFilename(source, kind, iso): string`, `type SaveEnv`, `saveBlob(blob, name, env): void`, `svgBlob(svg): Blob`, `stlBlob(buffer): Blob`, `canvasBlob(canvas): Promise<Blob>`

**The split, and why it is where it is.** `page.tsx` is a server component and holds nothing but metadata, the schema and the shell. It computes no demo, unlike T1's page, and the difference is the point: T1's worked example is eleven real articles that only exist on the server, whereas Relief's demo is a seed and forty lines of arithmetic. Serialising the demo's field into the RSC payload would put 1,248 floats and a few thousand contour points into the HTML to save a client a millisecond of `Math.exp`. So the seed travels and the client builds the ground. Task 4 wrote the demo as a generator rather than a data blob for exactly this reason, and this is where that decision is spent.

`ReliefTool.tsx` builds the demo in a lazy `useState` initialiser, which runs during the server render as well as on hydration. Both sides run the same seeded generator over the same pure pipeline, so both get the same numbers and there is no hydration mismatch. What the server render cannot do is paint: a canvas has no pixels until a browser gives it a context. So the readout under the plate is server-rendered real text with real numbers in it, and the plate itself draws in the first layout effect after hydration. That is the honest version of "never an empty form": the words are there before any JavaScript runs, the picture arrives a frame later.

**Why the exports live in `lib/` and not in the handler.** The blob-and-anchor dance is four lines and every one of them is a global: `URL.createObjectURL`, `document.createElement`, `click`, `revokeObjectURL`. In a component those four lines are untestable in a node environment and would be the only part of the download path nothing asserted on. In `download.ts` they take an injected `SaveEnv`, so a recording stub exercises the whole sequence, including the ordering trap in the next paragraph.

**The revoke trap, stated once.** Revoking an object URL synchronously after `.click()` cancels the download in some builds of WebKit, because the click starts a fetch of that URL and the URL is gone by the time it runs. So `SaveEnv` carries a `defer`, the component wires it to `window.setTimeout(run, 0)`, and `download.test.ts` asserts the revoke has not happened when `click` returns and has happened after the deferred callback runs. Not revoking at all leaks the blob for the life of the document, which on a 244 KB STL and a page somebody exports six times is a quarter of a megabyte a go.

- [ ] **Step 1: Write the failing tests for the download module**

```ts
// lib/tools/relief/download.test.ts
import { describe, it, expect } from "vitest";
import { reliefCopy } from "@/content/tools/relief";
import {
  PNG_MIME,
  STL_MIME,
  SVG_MIME,
  type SaveEnv,
  canvasBlob,
  plateFilename,
  saveBlob,
  stlBlob,
  svgBlob,
} from "./download";

/** Records the four globals a download touches, in the order they are touched. */
function saver() {
  const calls: string[] = [];
  const deferred: (() => void)[] = [];
  const anchor = { href: "", download: "", rel: "", click: () => calls.push("click") };
  const env: SaveEnv = {
    createObjectURL: () => {
      calls.push("createObjectURL");
      return "blob:relief/one";
    },
    revokeObjectURL: (url) => calls.push(`revokeObjectURL ${url}`),
    anchor: () => {
      calls.push("anchor");
      return anchor;
    },
    defer: (run) => {
      calls.push("defer");
      deferred.push(run);
    },
  };
  return { env, calls, anchor, flush: () => deferred.splice(0).forEach((run) => run()) };
}

describe("plateFilename", () => {
  it("names the file after the tool, the source and the day", () => {
    expect(plateFilename("demo", "png", "2026-09-03T14:22:05.000Z")).toBe("relief-demo-2026-09-03.png");
    expect(plateFilename("csv", "svg", "2026-09-03T00:00:00.000Z")).toBe("relief-csv-2026-09-03.svg");
    expect(plateFilename("github", "stl", "2026-01-09T23:59:59.999Z")).toBe("relief-github-2026-01-09.stl");
  });

  /**
   * The name is on the visitor's disk, not in an event, but it is still the
   * one string the tool writes that outlives the tab. It carries the source
   * and the day and nothing else: no username, no token, no name lifted off
   * the file they dropped in.
   */
  it("carries nothing that came from the visitor", () => {
    // The whole shape, anchored at both ends, so anything interpolated into it
    // later fails here rather than reaching somebody's downloads folder.
    const name = plateFilename("github", "png", "2026-09-03T14:22:05.000Z");
    expect(name).toMatch(/^relief-(demo|github|csv)-\d{4}-\d{2}-\d{2}\.(png|svg|stl)$/);
  });
});

describe("the union types line up with the copy", () => {
  // `PlateSource` and `PlateKind` are declared in lib and the labels live in
  // content. Neither can see the other, so this is the seam that pins them.
  it("has a label for every source and every download", () => {
    expect(Object.keys(reliefCopy.sources).sort()).toEqual(["csv", "demo", "github"]);
    expect(Object.keys(reliefCopy.downloads).sort()).toEqual(["png", "stl", "svg"]);
  });
});

describe("the blobs", () => {
  it("wraps an SVG string as an SVG", async () => {
    const blob = svgBlob("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(blob.type).toBe(`${SVG_MIME};charset=utf-8`);
    expect(await blob.text()).toContain("<svg");
  });

  it("wraps an STL buffer without re-encoding it", async () => {
    const buffer = new ArrayBuffer(134);
    new DataView(buffer).setUint8(0, 0x72);
    const blob = stlBlob(buffer);
    expect(blob.type).toBe(STL_MIME);
    expect(blob.size).toBe(134);
    expect(new Uint8Array(await blob.arrayBuffer())[0]).toBe(0x72);
  });

  it("takes a PNG off a canvas", async () => {
    const canvas = {
      toBlob(cb: (b: Blob | null) => void, type?: string) {
        cb(new Blob([type ?? ""], { type: type ?? "" }));
      },
    };
    const blob = await canvasBlob(canvas);
    expect(blob.type).toBe(PNG_MIME);
  });

  it("rejects rather than saving an empty file when the canvas gives nothing back", async () => {
    const canvas = { toBlob(cb: (b: Blob | null) => void) { cb(null); } };
    await expect(canvasBlob(canvas)).rejects.toThrow(/relief/);
  });
});

describe("saveBlob", () => {
  it("goes through the four globals in the one order that works", () => {
    const { env, calls, anchor, flush } = saver();
    saveBlob(new Blob(["x"]), "relief-demo-2026-09-03.png", env);

    // The revoke is deliberately not here. WebKit cancels a download whose
    // object URL was revoked between the click and the fetch the click starts.
    expect(calls).toEqual(["createObjectURL", "anchor", "click", "defer"]);
    expect(anchor.href).toBe("blob:relief/one");
    expect(anchor.download).toBe("relief-demo-2026-09-03.png");
    expect(anchor.rel).toBe("noopener");

    flush();
    expect(calls.at(-1)).toBe("revokeObjectURL blob:relief/one");
  });

  it("still revokes when the click throws, so a failure does not leak the blob", () => {
    const { env, calls, flush } = saver();
    const angry: SaveEnv = {
      ...env,
      anchor: () => ({ href: "", download: "", rel: "", click: () => { throw new Error("no"); } }),
    };
    expect(() => saveBlob(new Blob(["x"]), "relief-demo-2026-09-03.stl", angry)).toThrow("no");
    flush();
    expect(calls.some((c) => c.startsWith("revokeObjectURL"))).toBe(true);
  });
});

/**
 * The promise on the page is that nothing is uploaded. Every export is a pure
 * function over data already in the tab plus four browser globals, and none of
 * those four is a network call. This asserts it rather than believing it: the
 * whole export path runs with `fetch` replaced by something that counts and
 * throws, and the count has to be zero.
 */
describe("exporting touches no network", () => {
  it("builds and saves all three without a single fetch", async () => {
    const real = globalThis.fetch;
    let reached = 0;
    globalThis.fetch = (() => {
      reached++;
      throw new Error("relief: an export reached the network");
    }) as typeof fetch;

    try {
      const { env } = saver();
      saveBlob(svgBlob("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), plateFilename("demo", "svg", "2026-09-03T00:00:00.000Z"), env);
      saveBlob(stlBlob(new ArrayBuffer(84)), plateFilename("demo", "stl", "2026-09-03T00:00:00.000Z"), env);
      const canvas = { toBlob(cb: (b: Blob | null) => void, type?: string) { cb(new Blob(["png"], { type })); } };
      saveBlob(await canvasBlob(canvas), plateFilename("demo", "png", "2026-09-03T00:00:00.000Z"), env);
    } finally {
      globalThis.fetch = real;
    }

    expect(reached).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd "$WT" && npx vitest run lib/tools/relief/download.test.ts`
Expected: FAIL, cannot resolve `./download`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/relief/download.ts
/**
 * Getting the three files out of the tab.
 *
 * Nothing here uploads anything, and that is the whole design rather than a
 * happy accident: a `Blob` made in the tab, an object URL that only this
 * document can resolve, an anchor clicked in the tab, and the URL released
 * again. No server sees any of it, which is what lets the privacy line stand
 * on two of the three source paths and lets the GitHub path's note say the
 * only thing that ever leaves is the commit search itself.
 *
 * The globals arrive as a `SaveEnv` rather than being reached for directly,
 * because vitest runs in a node environment where none of the four exists.
 * With them injected, `download.test.ts` drives the whole sequence, and the
 * ordering below is a tested fact rather than a hope.
 */

export type PlateSource = "demo" | "github" | "csv";
export type PlateKind = "png" | "svg" | "stl";

export const PNG_MIME = "image/png";
export const SVG_MIME = "image/svg+xml";
/**
 * Registered with IANA in 2019. Plenty of older tools still send
 * `application/sla`, which is the same bytes under a worse name. Nothing in
 * this tool ever reads an STL back, so the only consumer is the slicer the
 * visitor drags it into, and every slicer goes by the extension anyway.
 */
export const STL_MIME = "model/stl";

/**
 * `relief-github-2026-09-03.stl`.
 *
 * The source and the day, and nothing else. Not the username, because a file
 * in a downloads folder is the one artefact of this tool that outlives the
 * tab, and a username in it is a small unasked-for disclosure on a shared
 * machine. Not the dropped file's own name either, for the same reason.
 */
export function plateFilename(source: PlateSource, kind: PlateKind, iso: string): string {
  return `relief-${source}-${iso.slice(0, 10)}.${kind}`;
}

/** The four browser globals a download needs, so a test can be all four. */
export type SaveEnv = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  anchor(): { href: string; download: string; rel: string; click(): void };
  /** Runs after the click has had a chance to start the download. */
  defer(run: () => void): void;
};

/**
 * Hand the browser a file.
 *
 * The revoke is deferred, never synchronous. A click on an anchor whose href
 * is an object URL starts a fetch of that URL, and revoking before the fetch
 * runs cancels the download with no error anywhere. Deferring by one turn of
 * the event loop is enough, and the alternative of never revoking leaks the
 * blob for the life of the document, which on a 244 KB mesh is worth avoiding.
 *
 * The `finally` matters as much: if the click throws, the URL is still
 * released.
 */
export function saveBlob(blob: Blob, name: string, env: SaveEnv): void {
  const url = env.createObjectURL(blob);
  try {
    const a = env.anchor();
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.click();
  } finally {
    env.defer(() => env.revokeObjectURL(url));
  }
}

export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: `${SVG_MIME};charset=utf-8` });
}

export function stlBlob(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], { type: STL_MIME });
}

/** The structural bit of HTMLCanvasElement this needs. The real one satisfies it. */
type BlobCanvas = { toBlob(callback: (blob: Blob | null) => void, type?: string): void };

/**
 * A PNG off the plate.
 *
 * `toBlob` is callback-shaped and can hand back `null` when the canvas is
 * tainted or has no bytes, so this rejects with a named error rather than
 * quietly saving a zero-byte file that looks like a broken export later.
 */
export function canvasBlob(canvas: BlobCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("relief: the canvas gave back no image to save"));
    }, PNG_MIME);
  });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/relief/download.test.ts`
Expected: PASS.

What this proves: the filename carries nothing from the visitor, the three blobs carry the right bytes under the right types, the four globals are touched in the order that works, and the export path makes no network call even when `fetch` is a tripwire. What it cannot see: a real browser. `URL.createObjectURL`, a real anchor click and the download shelf are all stubbed here, so "the file lands in the downloads folder" is unearned until Task 13 drives it on the live site.

- [ ] **Step 5: Give the page its words**

Task 1 wrote the copy the registry needed. The page needs a dozen more strings, and the house rule is that no sentence is built inside a component, so they go in the same file. Append to `reliefCopy` in `content/tools/relief.ts`, before the closing `} as const;`:

```ts
  /* Added with the page. The pure modules return keys and throw named errors;
     every sentence a visitor reads is in this object. */
  sourceLegend: "What to draw",
  drawGithub: "Draw my year",
  stop: "Stop",
  useDemo: "Back to the demo",
  fileLabel: "CSV file",
  noFile: "No file chosen yet, so the sheet below is still the demo.",
  columnLabel: "Which column holds the date",
  plateAlt:
    "A contour plate. Fifty-two weeks left to right, twenty-four hours top to bottom, six levels, every second one drawn heavier. The numbers under it say what is on it.",
  exportsHeading: "Take it away",
  readout: {
    heading: "What is on the sheet",
    events: "Events",
    occupied: "Hours with anything in them",
    busiest: "Busiest hour",
    ceiling: "The top of the scale",
  },
  drawn: "Drawn. {events} events across {occupied} of the 1,248 hours in the year.",
  truncated:
    "Stopped at 5,000 commits. What is drawn is the newest 5,000 and not the whole year, which is worth knowing before you frame it.",
  stopped: "Stopped. Nothing was kept, and the sheet is still the last one it drew.",
  csvRead: "Read {read} rows out of that column and skipped {skipped}.",
  csvCapped:
    "That file runs past 200,000 rows, so only the first 200,000 were read. A phone reading more than that is a phone that stops answering.",
  noDateColumn:
    "No column in that file reads as a date. Relief takes ISO dates, with or without a time and an offset, and the space-separated version a spreadsheet writes. It will not guess at 14/01/2026, because that is two different days depending on who typed it.",
  errors: {
    auth: "GitHub refused that token. Check it has not expired, and that it was pasted whole.",
    rate:
      "GitHub is rate limiting this token. It goes away on its own in a few minutes; a token with no scopes ticked still gets the higher limit, so this usually means another tab is using the same one.",
    input: "That is not a GitHub username, or the token box is empty. A year of commits needs both.",
    other: "Something between here and GitHub went wrong, and it was not the token or the limit.",
    paint:
      "The theme did not hand the plate a colour to draw in. Switch themes at the terminal and it should come back.",
  },
```

Then run `npx vitest run content/voice.test.ts` and expect PASS. The voice lint covers `name`, `blurb`, `privacyNote` and `cantSee`, not these, so read the block back against `LANGUAGE.md` yourself before moving on: British spelling, no em dash, no en dash outside a date.

- [ ] **Step 6: Write the failing coupling tests**

Three files, because they check three different things and a failure should say which. Comments are stripped from every source before matching, so prose about a call can never satisfy a check for the call.

```ts
// app/tools/relief/page.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools } from "@/content/tools";

/**
 * A source-coupling check, not a render.
 *
 * `vitest.config.ts` runs in a node environment with no jsdom, so no React on
 * this route can be mounted. These assert on the source text in the shape of
 * `lib/boot.test.ts`, and everything they cannot see is Task 12's and Task
 * 13's job.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const page = read("app", "tools", "relief", "page.tsx");

describe("the page", () => {
  it("renders through the shared tool shell", () => {
    expect(page).toContain('from "@/components/tools/ToolPage"');
    expect(page).toMatch(/<ToolPage[\s\S]*tool=\{relief\}/);
  });

  it("takes its metadata off the registry entry rather than restating it", () => {
    expect(page).toContain("description: relief.blurb");
    expect(page).toContain("canonical(PATH)");
    expect(page).not.toContain("A year of your activity");
  });

  it("imports its own stylesheet and leaves globals.css alone", () => {
    expect(page).toContain('import "./tool.css"');
  });

  it("holds no state and computes no demo", () => {
    // The demo is a seed and a generator, so it is built in the client island
    // on both renders instead of being serialised into the RSC payload.
    expect(page).not.toContain("useState");
    expect(page).not.toContain("demoEvents");
  });

  it("is listed as a live tool, so the sitemap and llms.txt pick it up", () => {
    expect(liveTools.map((t) => t.slug)).toContain("relief");
  });
});
```

```ts
// app/tools/relief/ReliefTool.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const tool = read("app", "tools", "relief", "ReliefTool.tsx");
const css = read("app", "tools", "relief", "tool.css");

describe("the client island", () => {
  it("is a client component", () => {
    expect(tool.startsWith('"use client"')).toBe(true);
  });

  it("opens on the demo, so the page is never an empty form", () => {
    expect(tool).toMatch(/useState<ReliefEvent\[\]>\(\(\) => demoEvents\(\)\)/);
    expect(tool).toMatch(/useState<PlateSource>\("demo"\)/);
  });

  it("does the arithmetic by calling the tested modules, never by repeating it", () => {
    for (const call of ["buildHeightmap(", "contourLayers(", "checkDensity(", "plateGeometry(", "planPlate(", "paint("]) {
      expect(tool, call).toContain(call);
    }
    expect(tool).not.toContain("Math.log1p");
    expect(tool).not.toContain("marching");
  });

  it("refuses a thin year with the key the guard returned", () => {
    expect(tool).toContain("reliefCopy.refusal[density.reason]");
    expect(tool).toContain("FLAT_RANGE");
  });

  it("reads its colours from the theme and names the error when there are none", () => {
    expect(tool).toContain("paletteFromTokens(");
    expect(tool).toContain("getComputedStyle(document.documentElement)");
    expect(tool).toContain("ReliefPaletteError");
    expect(tool).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("redraws when the theme changes, because the plate is painted in tokens", () => {
    expect(tool).toMatch(/\[layers, geometry, settings\.theme\]/);
  });
});

describe("the token's rules, read off the source", () => {
  it("contains no URL at all, so nothing here can build one", () => {
    // Every request is built by `githubUrl` behind the origin fence. A URL
    // literal in this file is the beginning of a second path out.
    expect(tool).not.toMatch(/https?:\/\//);
  });

  it("has no form, so nothing can be submitted with the token in a query string", () => {
    expect(tool).not.toContain("<form");
    expect(tool).not.toContain("action=");
  });

  it("puts the token in a password field the browser will not remember", () => {
    const field = tool.match(/<input[^>]*value=\{token\}[\s\S]*?\/>/)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).toContain('autoComplete="off"');
    expect(field).not.toContain("name=");
  });

  it("hands the token to exactly one function", () => {
    expect([...tool.matchAll(/fetchCommitEvents\(/g)]).toHaveLength(1);
    expect(tool).toContain("fetchImpl: window.fetch.bind(window)");
  });
});

describe("the exports", () => {
  it("saves all three through the tested module", () => {
    for (const call of ["canvasBlob(", "svgBlob(", "stlBlob(", "saveBlob(", "plateFilename("]) {
      expect(tool, call).toContain(call);
    }
    expect(tool).toContain("plotterSvg(");
    expect(tool).toContain("writeBinaryStl(buildMesh(");
  });

  it("never reaches the network to make a file", () => {
    // Matched, not sliced between two markers. A slice whose start comes after
    // its end is the empty string, and every `not.toContain` on the empty
    // string passes, which is a check that could not fail. So the body is
    // pulled out by a regex and its length asserted first.
    const body = tool.match(/async function onExport\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain("saveBlob(");
    expect(body).not.toContain("fetch");
    expect(body).not.toContain("trackToolRun");
  });
});

describe("what it reports", () => {
  it("records a run with the slug, the outcome and the milliseconds, and nothing else", () => {
    // Three call sites and no more: the GitHub draw, the error it can end in,
    // and the CSV read. None on the demo, because nothing was asked for; none
    // on an export, because the run is the year being drawn and F3's payload
    // has no room to say which of the three files was taken; none on an abort,
    // because the visitor stopping it is not an outcome the tool produced.
    const sent = [...tool.matchAll(/trackToolRun\(\{[\s\S]*?\}\);/g)].map((m) => m[0]);
    expect(sent).toHaveLength(3);
    for (const call of sent) {
      expect(call).toContain('tool: "relief"');
      expect(call).toContain("outcome:");
      expect(call).toContain("ms:");
      expect(call).not.toContain("user");
      expect(call).not.toContain("token");
      expect(call).not.toContain("file");
      expect(call).not.toContain("events.length");
    }
  });
});

describe("the stylesheet", () => {
  it("keeps every input at 16px, which is what stops iOS zooming on focus", () => {
    for (const selector of ["\\.relief__input", "\\.relief__file", "\\.relief__select"]) {
      expect(css, selector).toMatch(new RegExp(`${selector}[^}]*font-size:\\s*16px`));
    }
  });

  it("gives every control a 44px floor, the select included", () => {
    for (const selector of ["\\.relief__button", "\\.relief__file", "\\.relief__select"]) {
      expect(css, selector).toMatch(new RegExp(`${selector}[^}]*min-height:\\s*44px`));
    }
  });

  it("stops the plate pushing the page sideways at 320", () => {
    expect(css).toMatch(/\.relief__plate\s*\{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.relief__plate\s*\{[^}]*width:\s*100%/);
  });

  it("never dims its text with the two tokens that fail on two of the three themes", () => {
    expect(css).not.toMatch(/color:\s*var\(--green-dim\)/);
    expect(css).not.toMatch(/color:\s*var\(--green-faint\)/);
  });

  it("gates its one animation behind reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    // The plate does not animate. SystemProvider owns the only rAF loop.
    expect(css).not.toContain("requestAnimationFrame");
  });
});
```

```ts
// lib/tools/relief/safety.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The promises the whole tool makes, checked across every file at once rather
 * than one module at a time, because the thing that breaks a promise like this
 * is always the file nobody thought to look at.
 *
 * Source greps, so what they prove is that the code does not contain the call.
 * They cannot prove a browser makes no request; Task 13 watches the network
 * panel on the live site for that.
 */
function sources(dir: string[]): { name: string; src: string }[] {
  const base = join(process.cwd(), ...dir);
  return readdirSync(base)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."))
    .map((name) => ({
      name: join(...dir, name),
      src: readFileSync(join(base, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, " "),
    }));
}

const files = [...sources(["lib", "tools", "relief"]), ...sources(["app", "tools", "relief"])];

describe("relief stores nothing, anywhere", () => {
  it("found the files it means to check", () => {
    // A grep suite over an empty list passes and means nothing. Ten modules in
    // lib and two files in app at the end of Task 10.
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(files.map((f) => f.name.replace(/\\/g, "/"))).toContain("app/tools/relief/ReliefTool.tsx");
  });

  // Only names no English sentence contains, because line comments are not
  // stripped here: stripping them would eat the `//` in an https URL and the
  // origin check below depends on those surviving.
  it.each(["localStorage", "sessionStorage", "indexedDB", "document.cookie"])(
    "never touches %s",
    (api) => {
      for (const file of files) expect(file.src, file.name).not.toContain(api);
    },
  );
});

describe("relief has one way out and it is the commit search", () => {
  it.each(["XMLHttpRequest", "sendBeacon", "WebSocket(", "EventSource", "importScripts"])(
    "never uses %s",
    (api) => {
      for (const file of files) expect(file.src, file.name).not.toContain(api);
    },
  );

  /**
   * Stronger than "fetch only in github.ts", and true where that is not: no
   * file in this tool calls `fetch` at all. `github.ts` takes a `fetchImpl`,
   * which is what lets its own tests drive it with a recording stub, and the
   * component hands it the window's own bound copy in exactly one place. So
   * there is one line in the whole tool that can reach a network, and it is
   * named here.
   */
  it("calls fetch nowhere: the only one is the window's, handed over once", () => {
    for (const file of files) {
      expect([...file.src.matchAll(/\bfetch\(/g)].length, file.name).toBe(0);
    }
    const component = files.find((f) => f.name.endsWith("ReliefTool.tsx"));
    expect([...(component?.src.matchAll(/window\.fetch\.bind\(window\)/g) ?? [])]).toHaveLength(1);
    const github = files.find((f) => f.name.endsWith("github.ts"));
    expect(github?.src).toContain("await fetchImpl(url, {");
  });

  it("has an absolute URL in github.ts and nowhere else", () => {
    // The SVG namespace is not an origin anybody can be sent to: it is a
    // required attribute value in the plotter file and no browser fetches it.
    const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"];
    for (const file of files) {
      const urls = (file.src.match(/https?:\/\/[^\s"'`)]+/g) ?? []).filter((u) => !NAMESPACES.includes(u));
      if (file.name.endsWith("github.ts")) expect(urls).toContain("https://api.github.com");
      else expect(urls, file.name).toEqual([]);
    }
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `cd "$WT" && npx vitest run app/tools/relief lib/tools/relief/safety.test.ts`
Expected: FAIL, `ENOENT` on `app/tools/relief/page.tsx` from all three files.

- [ ] **Step 8: Write the server component**

```tsx
// app/tools/relief/page.tsx
import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { relief, reliefCopy } from "@/content/tools/relief";
import { OG_IMAGE, canonical } from "@/lib/seo";
import ReliefTool from "./ReliefTool";
import "./tool.css";

const PATH = "/tools/relief";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Relief",
  description: relief.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `Relief · ${profile.shortName}`,
    description: relief.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/relief`.
 *
 * Thin on purpose. Every other tool page on this site computes a worked
 * example on the server and hands it down as props, because its example is
 * real data that only exists here. Relief's demo is a seed and forty lines of
 * arithmetic, so serialising a 24 by 52 field and a few thousand contour
 * points into the payload would be paying kilobytes to save a millisecond.
 * The seed travels; the client builds the ground on both renders and gets the
 * same numbers, because the generator is deterministic.
 *
 * `ToolPage` puts the privacy line, the privacy note and the "can't see" list
 * around this. None of those words are here.
 */
export default function ReliefPage() {
  return (
    <ToolPage tool={relief} talk={reliefCopy.talk}>
      <ReliefTool />
    </ToolPage>
  );
}
```

- [ ] **Step 9: Write the client component**

```tsx
// app/tools/relief/ReliefTool.tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { reliefCopy } from "@/content/tools/relief";
import { contourLayers } from "@/lib/tools/relief/contour";
import { MAX_CSV_ROWS, dateColumnGuess, eventsFromCsv, parseCsv } from "@/lib/tools/relief/csv";
import { demoEvents } from "@/lib/tools/relief/demo";
import {
  type PlateKind,
  type PlateSource,
  type SaveEnv,
  canvasBlob,
  plateFilename,
  saveBlob,
  stlBlob,
  svgBlob,
} from "@/lib/tools/relief/download";
import {
  type Palette,
  ReliefPaletteError,
  paint,
  paletteFromTokens,
  planPlate,
  plateGeometry,
} from "@/lib/tools/relief/draw";
import {
  ReliefAuthError,
  ReliefInputError,
  ReliefRateLimitError,
  WINDOWS,
  fetchCommitEvents,
} from "@/lib/tools/relief/github";
import { FLAT_RANGE, buildHeightmap, checkDensity } from "@/lib/tools/relief/heightmap";
import { buildMesh, writeBinaryStl } from "@/lib/tools/relief/stl";
import { plotterSvg } from "@/lib/tools/relief/svg";
import { HOURS, WEEKS, type ReliefEvent } from "@/lib/tools/relief/types";
import { trackToolRun } from "@/lib/tools/events";

/**
 * The tool.
 *
 * Thin by design, and the thinness is the plan's whole argument arriving: by
 * this point the bucketing, the ceiling, the smoothing, the contours, the
 * chaining, the ops list, the SVG, the mesh, the CSV parser and the commit
 * search are all pure functions with tests beside them. What is left here is
 * three inputs, one canvas, three buttons and the wiring, and the wiring is
 * what `ReliefTool.test.ts` reads.
 *
 * Four things are load-bearing and each has a check:
 *
 * **It opens drawn.** The demo is built in a lazy initialiser, which runs on
 * the server render and again on hydration. Same seed, same pure pipeline,
 * same numbers, so there is no mismatch and the readout under the plate is
 * real text in the HTML before any script runs.
 *
 * **The token has one home.** It lives in state, goes into `fetchCommitEvents`
 * and nowhere else. There is no URL in this file, no form to submit, and the
 * field is a password input with autocomplete off so no browser offers to
 * remember it. `safety.test.ts` greps the whole tool for a storage API.
 *
 * **The plate does not animate.** `SystemProvider` owns the one
 * `requestAnimationFrame` loop and AGENTS.md forbids a second, so the plate is
 * painted once per change of layers, size or theme. The only motion on the
 * route is a CSS opacity fade, gated behind `prefers-reduced-motion`.
 *
 * **Nothing is uploaded to get a file out.** The three exports are a blob and
 * an anchor, through `download.ts`, which is tested with `fetch` replaced by a
 * tripwire.
 */

const SOURCES: PlateSource[] = ["demo", "github", "csv"];
const CELLS = HOURS * WEEKS;
/** Label size on the plate. The face comes from the page, so there is no font name here. */
const LABEL_PX = 12;
/** Two is enough for a plate of thin lines and halves the pixels on a phone at 3x. */
const MAX_DPR = 2;

const fill = (template: string, values: Record<string, number>): string =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), template);

function messageFor(error: unknown): string {
  if (error instanceof ReliefAuthError) return reliefCopy.errors.auth;
  if (error instanceof ReliefRateLimitError) return reliefCopy.errors.rate;
  if (error instanceof ReliefInputError) return reliefCopy.errors.input;
  return reliefCopy.errors.other;
}

/**
 * Null for the one failure this can have, so the effect that calls it reads
 * straight down instead of assigning into a `let` from inside a `try`, which
 * is where the compiler stops being able to tell whether the value exists.
 * Anything other than a missing token is not ours and is rethrown.
 */
function safePalette(style: CSSStyleDeclaration): Palette | null {
  try {
    return paletteFromTokens((name) => style.getPropertyValue(name));
  } catch (error) {
    if (error instanceof ReliefPaletteError) return null;
    throw error;
  }
}

export default function ReliefTool() {
  const uid = useId();
  const { settings, audio } = useSystem();

  const [source, setSource] = useState<PlateSource>("demo");
  const [events, setEvents] = useState<ReliefEvent[]>(() => demoEvents());
  const [note, setNote] = useState<string>(reliefCopy.demoCaption);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState("");
  const [token, setToken] = useState("");
  const [table, setTable] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [column, setColumn] = useState(-1);
  const [width, setWidth] = useState(720);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<AbortController | null>(null);

  const heightmap = useMemo(() => buildHeightmap(events), [events]);
  const layers = useMemo(() => contourLayers(heightmap.field), [heightmap]);
  const geometry = useMemo(() => plateGeometry(width), [width]);
  /** Task 2 exports the constant; this is the one place it is spent. */
  const flat = heightmap.hi - heightmap.lo < FLAT_RANGE;

  /* The plate is as wide as its box, so the box is measured rather than
     guessed. A ResizeObserver, not a frame callback: this fires when the
     layout changes and at no other time. */
  useEffect(() => {
    const box = frameRef.current;
    if (!box) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /* Paint. Once per change of what is drawn, how big it is, or what colour the
     machine is set to, and never on a frame. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    // One computed-style read for both the colours and the face. Two would be
    // two layout reads in one paint for no gain.
    const style = window.getComputedStyle(document.documentElement);
    const palette = safePalette(style);
    if (!palette) {
      setNote(reliefCopy.errors.paint);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(geometry.width * dpr);
    canvas.height = Math.round(geometry.height * dpr);
    canvas.style.height = `${geometry.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The face is whatever the page is set in, so no font name lives here.
    context.font = `${LABEL_PX}px ${style.fontFamily}`;
    paint(context, planPlate({ layers, geometry, palette, labels: geometry.labels }));
  }, [layers, geometry, settings.theme]);

  /**
   * The one door new events come through. A refused year never replaces the
   * one on the sheet: the message changes and the plate stays, which is more
   * use than an empty page and a sentence.
   */
  function accept(next: ReliefEvent[]): boolean {
    const density = checkDensity(next);
    if (!density.ok) {
      setNote(reliefCopy.refusal[density.reason]);
      return false;
    }
    setEvents(next);
    return true;
  }

  async function onGithub() {
    if (busy) return;
    const started = Date.now();
    const controller = new AbortController();
    runRef.current = controller;
    setBusy(true);
    // `WINDOWS`, not a literal 13, so the line cannot drift from the loop.
    setNote(fill(reliefCopy.drawing, { done: 0, total: WINDOWS, commits: 0 }));

    try {
      const { events: found, truncated } = await fetchCommitEvents({
        user: user.trim(),
        token,
        endMs: Date.now(),
        fetchImpl: window.fetch.bind(window),
        sleep: (ms) => new Promise<void>((done) => window.setTimeout(done, ms)),
        onProgress: (done, total, commits) => setNote(fill(reliefCopy.drawing, { done, total, commits })),
        signal: controller.signal,
      });
      const ok = accept(found);
      if (ok) {
        setSource("github");
        setNote(truncated ? reliefCopy.truncated : fill(reliefCopy.drawn, { events: found.length, occupied: countOccupied(found) }));
      }
      void trackToolRun({ tool: "relief", outcome: ok ? "ok" : "refused", ms: Date.now() - started });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // The visitor stopped it. Not an outcome the tool produced, so no event.
        setNote(reliefCopy.stopped);
        return;
      }
      setNote(messageFor(error));
      void trackToolRun({ tool: "relief", outcome: "error", ms: Date.now() - started });
    } finally {
      runRef.current = null;
      setBusy(false);
    }
  }

  function onStop() {
    runRef.current?.abort();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    const guess = dateColumnGuess(parsed.headers, parsed.rows);
    setTable(parsed);
    setColumn(guess);
    setSource("csv");
    if (guess < 0) {
      setNote(reliefCopy.noDateColumn);
      return;
    }
    if (parsed.rows.length >= MAX_CSV_ROWS) setNote(reliefCopy.csvCapped);
    readColumn(parsed.rows, guess);
  }

  function readColumn(rows: string[][], index: number) {
    const started = Date.now();
    const reading = eventsFromCsv(rows, index);
    const ok = accept(reading.events);
    if (ok) setNote(fill(reliefCopy.csvRead, { read: reading.read, skipped: reading.skipped }));
    void trackToolRun({ tool: "relief", outcome: ok ? "ok" : "refused", ms: Date.now() - started });
  }

  function onDemo() {
    setSource("demo");
    setEvents(demoEvents());
    setNote(reliefCopy.demoCaption);
  }

  const saveEnv: SaveEnv = useMemo(
    () => ({
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      anchor: () => document.createElement("a"),
      defer: (run) => {
        window.setTimeout(run, 0);
      },
    }),
    [],
  );

  async function onExport(kind: PlateKind) {
    const name = plateFilename(source, kind, new Date().toISOString());
    audio.key();
    if (kind === "svg") {
      saveBlob(svgBlob(plotterSvg(layers)), name, saveEnv);
      return;
    }
    if (kind === "stl") {
      saveBlob(stlBlob(writeBinaryStl(buildMesh(heightmap.field))), name, saveEnv);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveBlob(await canvasBlob(canvas), name, saveEnv);
  }

  const userId = `${uid}-user`;
  const tokenId = `${uid}-token`;
  const fileId = `${uid}-file`;
  const columnId = `${uid}-column`;
  const hour = String(heightmap.hiAt.row).padStart(2, "0");

  return (
    <div className="relief">
      <fieldset className="relief__sources">
        <legend className="relief__legend">{reliefCopy.sourceLegend}</legend>
        {SOURCES.map((key) => (
          <button
            key={key}
            type="button"
            className="relief__button"
            aria-pressed={source === key}
            onClick={() => (key === "demo" ? onDemo() : setSource(key))}
          >
            {reliefCopy.sources[key]}
          </button>
        ))}
      </fieldset>

      {source === "github" ? (
        <div className="relief__panel">
          <p className="relief__hint">{reliefCopy.githubHelp}</p>
          <label className="relief__label" htmlFor={userId}>
            {reliefCopy.userLabel}
          </label>
          <input
            id={userId}
            className="relief__input"
            value={user}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <label className="relief__label" htmlFor={tokenId}>
            {reliefCopy.tokenLabel}
          </label>
          <input
            id={tokenId}
            className="relief__input"
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="relief__actions">
            <button type="button" className="relief__button" onClick={onGithub} disabled={busy}>
              {reliefCopy.drawGithub}
            </button>
            <button type="button" className="relief__button" onClick={onStop} disabled={!busy}>
              {reliefCopy.stop}
            </button>
          </div>
        </div>
      ) : null}

      {source === "csv" ? (
        <div className="relief__panel">
          <p className="relief__hint">{reliefCopy.csvHelp}</p>
          <label className="relief__label" htmlFor={fileId}>
            {reliefCopy.fileLabel}
          </label>
          <input
            id={fileId}
            className="relief__file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {table ? (
            <>
              <label className="relief__label" htmlFor={columnId}>
                {reliefCopy.columnLabel}
              </label>
              <select
                id={columnId}
                className="relief__select"
                value={column}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setColumn(next);
                  readColumn(table.rows, next);
                }}
              >
                {table.headers.map((head, i) => (
                  <option key={`${head}-${i}`} value={i}>
                    {head === "" ? `${i + 1}` : head}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="relief__hint">{reliefCopy.noFile}</p>
          )}
        </div>
      ) : null}

      <p className="relief__note" role="status">
        {flat ? reliefCopy.refusal.flat : note}
      </p>

      <div className="relief__frame" ref={frameRef}>
        <canvas ref={canvasRef} className="relief__plate" role="img" aria-label={reliefCopy.plateAlt} />
      </div>

      <h2 className="relief__heading">{reliefCopy.readout.heading}</h2>
      <dl className="relief__readout">
        <div className="relief__row">
          <dt>{reliefCopy.readout.events}</dt>
          <dd>{heightmap.events}</dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.occupied}</dt>
          <dd>
            {heightmap.occupied} of {CELLS}
          </dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.busiest}</dt>
          <dd>
            {hour}:00, week {heightmap.hiAt.col + 1} of {WEEKS},{" "}
            {heightmap.counts[heightmap.hiAt.row][heightmap.hiAt.col]}
          </dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.ceiling}</dt>
          <dd>{heightmap.ceiling}</dd>
        </div>
      </dl>
      <p className="relief__hint">{reliefCopy.method}</p>

      <h2 className="relief__heading">{reliefCopy.exportsHeading}</h2>
      <div className="relief__actions">
        <button type="button" className="relief__button" onClick={() => void onExport("png")}>
          {reliefCopy.downloads.png}
        </button>
        <button type="button" className="relief__button" onClick={() => void onExport("svg")}>
          {reliefCopy.downloads.svg}
        </button>
        <button type="button" className="relief__button" onClick={() => void onExport("stl")}>
          {reliefCopy.downloads.stl}
        </button>
      </div>
      <p className="relief__hint">{reliefCopy.plotterNote}</p>
      <p className="relief__hint">{reliefCopy.stlNote}</p>
    </div>
  );
}

/** The occupied-cell count for the "drawn" line, which the heightmap also reports. */
function countOccupied(events: readonly ReliefEvent[]): number {
  return new Set(events.map((e) => `${e.hour}:${e.week}`)).size;
}
```

Two notes on that file, both worth reading before you type it.

`safePalette` returns null rather than letting the throw reach the effect, and that is not tidiness. Assigning a palette into a `let` from inside a `try` and reading it after the `catch` is the shape TypeScript cannot always follow, and the error it gives ("used before being assigned", or a silent `Palette | undefined` at the call site) is a puzzle to run into at implementation time for no reason. Returning null and testing it is flow the compiler reads on the first pass. The rethrow matters as much: `paletteFromTokens` throws exactly one thing and anything else arriving here belongs to somebody else.

`countOccupied` duplicates a number `buildHeightmap` already computes, and it exists because the "drawn" line is written before `heightmap` has been recomputed from the new events. If that offends, drop the sentence's occupied count and use the readout below it, which is always right. The plan keeps it because a line that says how much of the year had anything in it is the one number that tells a visitor whether their token reached their private repositories.

- [ ] **Step 10: Write the stylesheet**

```css
/* app/tools/relief/tool.css */
/* The route's own rules. `app/globals.css` stays the shell's stylesheet
   (design section 2, rule 2), so nothing here appends to it. */

.relief {
  display: grid;
  gap: var(--sp-4);
}

.relief__sources,
.relief__panel {
  border: 1px solid var(--green-line);
  padding: var(--sp-3);
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.relief__sources {
  grid-auto-flow: column;
  justify-content: start;
}

.relief__legend,
.relief__label {
  display: block;
  font-weight: 600;
}

/* `--green`, not `--green-dim`. `app/globals.test.ts` measured the dim token at
   4.45 against the background on the amber theme and 4.46 on ice, so it passes
   on the theme a developer happens to be looking at and fails on the two a
   visitor reaches by typing four characters at the terminal. */
.relief__hint,
.relief__note {
  color: var(--green);
  margin: 0;
  max-width: 68ch;
}

/* 16px exactly, on all three. Anything smaller and iOS zooms the viewport on
   focus and drops the visitor into a sideways-scrolled page. */
.relief__input,
.relief__file,
.relief__select {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  line-height: 1.5;
  color: var(--green);
  background: var(--bg-panel);
  border: 1px solid var(--green-line);
  padding: 0.5rem 0.75rem;
}

.relief__input:focus-visible,
.relief__file:focus-visible,
.relief__select:focus-visible,
.relief__button:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
}

.relief__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* 44px is the floor `scripts/phone-check.mjs` fails below. */
.relief__button {
  min-height: 44px;
  min-width: 44px;
  padding: 0 1rem;
  font: inherit;
  font-size: 16px;
  color: var(--green);
  background: transparent;
  border: 1px solid var(--green-line);
  cursor: pointer;
}

.relief__button[aria-pressed="true"] {
  color: var(--amber);
  border-color: var(--amber);
}

.relief__button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

/* The frame is what the ResizeObserver measures, so it must be the thing that
   is allowed to be narrower than the page. */
.relief__frame {
  width: 100%;
  overflow: hidden;
}

/* The canvas carries an intrinsic width from its width attribute, which is the
   device-pixel width and is larger than the CSS box at any DPR above 1. Without
   both of these it pushes the page sideways at 320, which is the single most
   likely phone-check failure on this route. */
.relief__plate {
  display: block;
  width: 100%;
  max-width: 100%;
}

.relief__readout {
  margin: 0;
  display: grid;
  gap: 0.35rem;
}

.relief__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-bottom: 1px solid var(--green-line);
  padding-bottom: 0.35rem;
}

.relief__row dt {
  font-weight: 600;
}

.relief__row dd {
  margin: 0;
  color: var(--amber);
}

.relief__heading {
  margin: var(--sp-2) 0 0;
}

/* The one bit of motion on the route, and it is on the figure rather than the
   drawing. There is no progressive draw-on: SystemProvider owns the only rAF
   loop and a second one is forbidden. */
@media (prefers-reduced-motion: no-preference) {
  .relief__frame {
    animation: relief-fade 240ms ease-out both;
  }

  @keyframes relief-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```

- [ ] **Step 11: Run everything that touches the route**

```bash
cd "$WT"
npx tsc --noEmit
npx vitest run app/tools/relief lib/tools/relief content/tools content/voice.test.ts
```

Expected: PASS throughout, `tsc` silent, and `content/tools/index.test.ts` "has a page behind it if it is live" now green, which is the failure Task 1 Step 8 deliberately left standing.

What this proves: the wiring is what the plan says it is, the types line up end to end, and the greps that carry the privacy promises find nothing. What it cannot see: every single thing about how this behaves in a browser. No component was mounted, no canvas was painted, no file was saved. Nothing on this route may be called working yet.

- [ ] **Step 12: Build it and look at what the server sent**

```bash
cd "$WT"
npm run build 2>&1 | tail -8
(npm start > .t2-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/relief > /dev/null && break; done
curl -s http://localhost:3000/tools/relief | grep -c "api.github.com"
curl -s http://localhost:3000/tools/relief | grep -o "Hours with anything in them</dt><dd>[0-9]* of 1248"
curl -s http://localhost:3000/tools/relief | grep -c "<canvas"
curl -s http://localhost:3000/tools/relief | grep -c "Generated, not measured"
curl -s http://localhost:3000/sitemap.xml | grep -c "/tools/relief"
curl -s http://localhost:3000/llms.txt | grep -ci relief
pkill -f "next start" || true
```

Expected: the build succeeds; the first grep returns 1 or more, which is the privacy note rendering through the field Task 1 added to the frozen type; the second prints a real occupied count over 1248, which is the demo pipeline having run during the server render, so the page carries numbers before any script does; the third returns 1; the fourth returns 1, so the demo is labelled as generated rather than passed off as somebody's year; and the last two return 1 or more with neither file edited, which is F3's registry doing its job.

If the second grep prints nothing, the markup differs from the expected shape rather than the number being wrong. Widen it to `grep -o "of 1248"` before concluding anything, and if that is also empty the server render did not run the pipeline, which is a stop-and-fix.

- [ ] **Step 13: Commit**

```bash
cd "$WT"
git add app/tools/relief lib/tools/relief/download.ts lib/tools/relief/download.test.ts lib/tools/relief/safety.test.ts content/tools/relief.ts
git commit -m "feat(relief): add the tool page, its client island and the three exports"
```

---

### Task 11: Prove the tests can fail, then wire the guards into the mutation check

**Files:**
- Temporarily modify then restore: `lib/tools/relief/heightmap.ts`
- Modify: `scripts/mutation-check.mjs` (ten entries)

**Interfaces:**
- Consumes: every module from Tasks 2 to 10
- Produces: ten mutation rows, and the evidence that the suite goes red when the plan's central decision is broken

A guard that survives its own mutation is decoration, and a suite nobody has watched fail is a ritual. This task does both, in that order, and no claim about either belongs in the ledger before its run.

**The one chosen for the demonstration, and why it is not the obvious one.** The obvious choice is `MIN_EVENTS`, and it is the wrong choice: `heightmap.test.ts` asserts against `spread(MIN_EVENTS - 1)`, so the test moves with the constant and setting it to 1 leaves the suite green. That is worth knowing rather than worth hiding, and it is written into the notes below as a limitation of that particular test. The percentile ceiling has no such relativity, it is the decision the whole plan argues for, and three separate tests bite on it.

- [ ] **Step 1: Break the ceiling on purpose and watch the suite notice**

In `lib/tools/relief/heightmap.ts`, change one number:

```ts
export const CEILING_PERCENTILE = 1;
```

Then:

```bash
cd "$WT"
npx vitest run lib/tools/relief/heightmap.test.ts 2>&1 | tail -30
```

Expected: **FAIL**, and specifically these three, not something vague:

- `ceilingFor > steps down from the outlier rather than towards it`, twice over: `ceilingFor([1, 2, 4, 8, 200])` returns 200 instead of 8, and `CEILING_PERCENTILE` is 1 instead of 0.98.
- `normalise > draws the table in the plan`: `normalise(1, ceiling)` is about 0.1307 rather than 0.3155, because the scale is now anchored on the outlier and `log1p(1) / log1p(200)` is what the plan's right-hand column was warning about.
- `normalise > clamps the outlier to the summit instead of letting it set the scale`: `normalise(8, ceiling)` no longer reaches 1.

Paste all three failure lines into the ledger. That paste is the observation. If the suite goes green with the percentile at 1, stop: the ceiling is not tested, and every claim in this plan about outliers is unearned.

- [ ] **Step 2: Put it back and confirm the failure goes with it**

```bash
cd "$WT"
git checkout -- lib/tools/relief/heightmap.ts
npx vitest run lib/tools/relief/heightmap.test.ts 2>&1 | tail -5
```

Expected: PASS. The pair of runs is `CLAIMS.md` rule 3, revert to confirm: the failure appeared when the guard was broken and went when it was restored, which is what earns the word "tested" for the ceiling. It says nothing about the other nine, which is what Step 3 is for.

- [ ] **Step 3: Add the ten mutation rows**

Every anchor below is quoted from the code as this plan wrote it, and every one of them is a regex tolerant of CRLF, because `scripts/mutation-check.mjs` has already been bitten once by a bare `\n` against a CRLF file. **Before running anything, check that each anchor still matches**, since Tasks 2 to 10 may have been typed with different spacing:

```bash
cd "$WT"
node -e '
const { readFileSync } = require("node:fs");
const checks = [
  ["lib/tools/relief/heightmap.ts", /const index = Math\.min\(occupied\.length - 1, Math\.floor\(p \* \(occupied\.length - 1\)\)\);/],
  ["lib/tools/relief/heightmap.ts", /return Math\.min\(1, Math\.log1p\(count\) \/ Math\.log1p\(Math\.max\(1, ceiling\)\)\);/],
  ["lib/tools/relief/heightmap.ts", /const u = h\[\(r - 1 \+ rows\) % rows\]\[c\];/],
  ["lib/tools/relief/heightmap.ts", /const l = row\[Math\.max\(0, c - 1\)\];/],
  ["lib/tools/relief/heightmap.ts", /if \(events\.length < MIN_EVENTS\) return \{ ok: false, reason: "few-events" \};/],
  ["lib/tools/relief/heightmap.ts", /if \(cells\.size < MIN_OCCUPIED_CELLS\) return \{ ok: false, reason: "few-cells" \};/],
  ["lib/tools/relief/draw.ts", /if \(!value\) throw new ReliefPaletteError\(name\);/],
  ["lib/tools/relief/stl.ts", /const qb: Vec3 = \[b\[0\], b\[1\], 0\];/],
  ["lib/tools/relief/github.ts", /if \(!path\.startsWith\("\/"\) \|\| path\.startsWith\("\/\/"\)\) \{/],
  ["lib/tools/relief/csv.ts", /const endMs = Math\.max\(\.\.\.parsed\.map\(\(p\) => p\.at\)\);/],
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

Expected: ten `ok` lines and exit 0. A `MISS` means the anchor has to be rewritten against the file as it was actually typed. **Never loosen the file to fit the anchor**, and never carry a `MISS` into the run: `mutation-check.mjs` reports an unmatched anchor as `ANCHOR-MISS` and counts it as a survivor, which is the right behaviour and is not something to work around.

Then append to the `MUTATIONS` array in `scripts/mutation-check.mjs`, after the command-registry entries:

```js
  // ── relief: ten guards, each with the test that bites on it ──
  {
    name: "relief takes the percentile ceiling upwards into the outlier it exists to ignore",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /Math\.floor\(p \* \(occupied\.length - 1\)\)/,
    replace: "Math.ceil(p * (occupied.length - 1))",
  },
  {
    name: "relief scales counts linearly, so every real hour lands under half a percent",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /return Math\.min\(1, Math\.log1p\(count\) \/ Math\.log1p\(Math\.max\(1, ceiling\)\)\);/,
    replace: "  return Math.min(1, count / Math.max(1, ceiling));",
  },
  {
    name: "relief stops wrapping the hour axis, so a ridge across midnight becomes two",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /const u = h\[\(r - 1 \+ rows\) % rows\]\[c\];/,
    replace: "const u = h[Math.max(0, r - 1)][c];",
  },
  {
    name: "relief wraps the week axis, so the first week of the year touches the last",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /const l = row\[Math\.max\(0, c - 1\)\];/,
    replace: "const l = row[(c - 1 + cols) % cols];",
  },
  {
    name: "relief draws contours around a handful of events instead of refusing",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /if \(events\.length < MIN_EVENTS\)/,
    replace: "if (false)",
  },
  {
    name: "relief draws a year piled into a dozen cells instead of refusing",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /if \(cells\.size < MIN_OCCUPIED_CELLS\)/,
    replace: "if (false)",
  },
  {
    name: "relief paints black on black when a theme token is missing, instead of saying so",
    file: "lib/tools/relief/draw.ts",
    pattern: /if \(!value\) throw new ReliefPaletteError\(name\);/,
    replace: "if (!value) return value;",
  },
  {
    name: "relief lifts the skirt off the base, so the STL is no longer a closed solid",
    file: "lib/tools/relief/stl.ts",
    pattern: /const qb: Vec3 = \[b\[0\], b\[1\], 0\];/,
    replace: "const qb: Vec3 = [b[0], b[1], 0.5];",
  },
  {
    name: "relief's origin fence accepts any path it is handed",
    file: "lib/tools/relief/github.ts",
    pattern: /if \(!path\.startsWith\("\/"\) \|\| path\.startsWith\("\/\/"\)\) \{/,
    replace: "if (false) {",
  },
  {
    name: "relief anchors a CSV's year on today, so a two-year-old export draws 52 empty weeks",
    file: "lib/tools/relief/csv.ts",
    pattern: /const endMs = Math\.max\(\.\.\.parsed\.map\(\(p\) => p\.at\)\);/,
    replace: "  const endMs = Date.now();",
  },
```

Two guards deliberately get no row, and both for the same reason: they are a second door into a module the ten already cover, and each row costs a full run of the suite. `countGrid`'s bounds check is held by `countGrid > ignores an event outside the grid rather than clamping it onto an edge`, and `validUsername`'s regex is held by the username cases in `github.test.ts`. If a later change touches either, add the row then rather than carrying two more twenty-minute rows for the life of the repository.

One row is worth watching more than the others. The STL mutation moves a single base vertex half a millimetre and nothing about the file looks wrong afterwards: it is still the right size, still the right triangle count, still opens in a viewer. The only thing that catches it is `openEdges` finding directed edges that are not paired, which is precisely the check the plan built for the case where a mesh is subtly not a solid. If that row comes back `GREEN`, the closed-solid proof is decoration and the honest word in the ledger drops from "closed by the edge test" to "untested".

- [ ] **Step 4: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs 2>&1 | tail -24
```

Expected: every relief row prints `RED`, and the last line reads `N/N mutations caught.` with no `Survived` block. An `ANCHOR-MISS` is a failure, not a skip.

This run is long. Each mutation runs the whole suite and there are more than seventy rows before these ten, so budget half an hour and do not interleave it with anything that writes to the worktree: the script restores each file by writing the original text back, and a concurrent edit in the same file would be lost.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(relief): mutate the ten guards and prove each one is load-bearing"
```

---

### Task 12: The phone check, at 390 and 320, on a real engine

**Files:**
- Modify: whatever the run names, and only in `app/tools/relief/tool.css`
- Modify: `.github/workflows/ci.yml`, but only if the phone job names its routes rather than reading the sitemap

**Interfaces:**
- Consumes: `scripts/phone-check.mjs` (F3), the production build
- Produces: the phone evidence for T2, pasted verbatim into the ledger

The design's rule, and the one thing this site refuses to fudge: **a resized desktop window does not count.** WebKit at 390 and at 320 because that is what an iPhone renders with, and a throttled Chromium Pixel beside it.

**A canvas page is the one most likely to fail this check, and the reason is worth stating before the run.** A `<canvas>` has an intrinsic width taken from its `width` attribute, and this component sets that attribute to the device-pixel width, which at a DPR of 2 is twice the CSS box and at 3 is three times it. Without `width: 100%` and `max-width: 100%` in the stylesheet the element is 960 CSS pixels wide inside a 320-pixel viewport and the whole page scrolls sideways. Both rules are in `tool.css` and `ReliefTool.test.ts` asserts they are there, so the prediction is a pass. The prediction is not the evidence.

**Predictions, written before the run so the run can prove them wrong (`CLAIMS.md` rule 2). All six are guesses from reading the CSS and none has been observed:**

1. **`overflow`: pass, and this is the likeliest place to be wrong.** The plate is `width: 100%; max-width: 100%` inside `.relief__frame`, which is `overflow: hidden`, and the ResizeObserver sizes the drawing to the frame it measured. The failure mode if the prediction is wrong is a body scroll at 320 with `canvas.relief__plate` named.
2. **`tap-target`: pass, but the select is the one to watch.** Every button carries `min-height: 44px`, and `.relief__select` and `.relief__file` carry it too, which they need: a bare `<select>` on WebKit renders at about 30px and a file input's button is smaller still. The disabled Stop button may or may not be measured by the script, which is unknown behaviour worth reading in `auditInPage` rather than guessing at.
3. **`input-font`: pass.** All three of `.relief__input`, `.relief__file` and `.relief__select` are a literal `16px`.
4. **`contrast`: pass, and least certain of the four.** Hint and note text is `--green` on the page, following T1's measured finding that `--green-dim` fails on two of the three themes. The readout values are `--amber`, which is comfortable against `--bg` on the green theme by token and has never been sampled through the scanline overlay and the phosphor shader on this route.
5. **The check cannot see the plate at all.** It samples text nodes and element boxes. A canvas that painted nothing, painted the wrong colours, or threw inside the effect would pass every one of the four checks, because a blank canvas has no text in it and the right size. Nothing here is evidence that the plate drew. Task 13's `getImageData` count is the first thing that is.
6. **The GitHub and CSV panels are not on screen during the run**, because the page opens on the demo and nothing clicks the source buttons. So the token field, the file input and the select are unmeasured by this run unless the script is pointed at them. That is a real gap and the honest answer is in Step 3.

- [ ] **Step 1: Decide whether CI needs editing at all**

```bash
cd "$WT"
grep -n "phone-check" .github/workflows/ci.yml
```

If the job runs `--from-sitemap`, **change nothing**: a live tool is in the sitemap because `liveTools` puts it there, so `/tools/relief` joins the phone job the moment Task 1's entry says `status: "live"`, and the plan's file-structure table naming `ci.yml` as modified is wrong. Record that in the ledger as a correction to this plan rather than editing the workflow to make the table true. If instead the job names routes with `--routes`, add `/tools/relief` to that list, alphabetically, and nothing else.

- [ ] **Step 2: Build and serve**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -5
(npm start > .t2-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/relief > /dev/null && break; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools/relief
```

Expected: `200`.

- [ ] **Step 3: Run the check and keep the output**

```bash
cd "$WT"
mkdir -p .phone-check
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/relief --out .phone-check | tee .phone-check/t2-first-run.txt
echo "exit: $?"
```

Expected: a header naming `1 route(s) x 3 profiles`, then whatever it finds. **Paste the whole output into the ledger under "T2 first phone-check run" before changing a single line.** That paste is the observation; everything after it is a fix.

Then look at the three screenshots in `.phone-check/` with your own eyes, at 320 in particular, and write down two things the script cannot fail on: whether the plate is legible at that width with the hour labels dropped (`plateGeometry` drops them under 480px), and whether six contour levels at 308 pixels wide read as ground or as moire. Neither is a pass or a fail, both are findings, and if the answer to the second is moire then the level count is the thing to change and the ledger is where the number goes.

The panels the run never opened are the gap named in prediction 6. Close it by hand rather than by assertion: with the built site still serving, open `http://localhost:3000/tools/relief` in a real WebKit at 320 (`npx playwright open --device="iPhone 13" http://localhost:3000/tools/relief` resizes to 390; set 320 in the inspector), click GitHub, click CSV, and look at the token field, the file input and the select. Write what you see. If a control is under a thumb's width there, it is a `tool.css` fix exactly as if the script had named it.

- [ ] **Step 4: Fix each named failure in the file that owns it**

Every fix goes in `app/tools/relief/tool.css`. The thresholds in the script are not touched, and `app/globals.css` is not touched: a shell failure on this route is a shell failure on every route, and that is F3's ground, not T2's. If the run names one, record it in the ledger and leave it.

A `contrast` failure is fixed by using a lighter token on that element (`--green` or `--amber-bright`), never by editing the token: the tokens are proven on all three themes in `app/globals.test.ts` and other surfaces depend on them.

An `overflow` failure naming the canvas is the prediction being wrong, and the fix is in the two rules on `.relief__plate`, not in the component. If the element named is `.relief__frame` or `.relief__sources`, the source buttons have run out of room in their `grid-auto-flow: column` and the fix is to let them wrap.

A `tap-target` failure on something a thumb is meant to hit is fixed by padding it. `data-small-target` is for a control that is deliberately small with a reason a reviewer would accept written into the attribute, and nothing on this page qualifies.

- [ ] **Step 5: Rebuild, re-run, confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .t2-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/relief > /dev/null && break; done
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/relief --out .phone-check
echo "exit: $?"
pkill -f "next start" || true
```

Expected: `exit: 0` and no `FAIL` lines.

What this proves: on WebKit at 390 and 320 and on a throttled Chromium Pixel, the route has no horizontal overflow, no input under 16px, no tap target under 44px, and no sampled text contrast under 4.5:1, in the state the page opens in. What it cannot see: the plate, which is a canvas and carries no text; the two panels that are behind a click; whether any of it is pleasant to use; and a real iPhone GPU. A person still has to look, and Task 13 does that on the live site.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add app/tools/relief/tool.css .github/workflows/ci.yml
git commit -m "fix(relief): meet the phone floors the check named"
```

If the run was clean and nothing changed, skip the commit and say so in the ledger. A clean first run is a finding worth recording, not a step to fake.

---

### Task 13: Documentation, the pull request, and the live check

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above, and the `check` and `mutation` CI jobs required on `main`
- Produces: `/tools/relief` live on `https://fergusoreilly.dev`, with the deployment id and the evidence in the ledger

- [ ] **Step 1: Three sentences in AGENTS.md**

In "Stack and conventions", at the end of the bullet F3 added about `content/tools/` and `ToolPage`, append:

```markdown
  `/tools/relief` draws a year of dated events as contour ground. The marching squares in
  `lib/tools/relief/contour.ts` are lifted from Tigh Sauna's `apps/site/src/lib/survey/terrain.ts`
  and the file says so; the rest of `lib/tools/relief/` is pure and tested, and
  `app/tools/relief/ReliefTool.tsx` is wiring. It adds no dependency: the canvas is the browser's,
  the SVG is a string, and the binary STL is 84 bytes plus 50 a triangle written into a `DataView`.
  `d3-contour`, `three` and `papaparse` were each considered and refused on the record in the plan.
  The GitHub token lives in React state, goes into one `Authorization` header built by
  `githubUrl()` behind an origin fence, and is never written anywhere;
  `lib/tools/relief/safety.test.ts` greps the whole tool for a storage API, for any direct `fetch`
  call at all (there are none: `github.ts` takes a `fetchImpl` and the component hands it
  `window.fetch.bind(window)` in one place), and for any URL literal outside `github.ts`. `draw.ts`
  holds no colour of its own and throws
  `ReliefPaletteError` when a theme token is missing, rather than painting black on black.
```

- [ ] **Step 2: Update PROGRESS.md and the ledger**

`docs/PROGRESS.md`: tick T2 and add a decision-log line naming the three sources, the 98th-percentile `log1p` ceiling, the six levels, the two smoothing passes wrapped on the hour axis, and the closed-solid proof, with the numbers the runs actually produced.

The ledger: set the T2 row to `**pr**`, and put the observations in the Log, each labelled with its rung:

```markdown
- 2026-09-03: T2 built. Observed: tsc clean; N tests passing (was M at baseline); the mutation
  check caught all ten relief guards, the STL skirt row included; the phone check passed on
  /tools/relief at 390, 320 and the throttled Pixel (first time, or after the fixes in Task 12).
  The demo generates E events across C of the 1,248 hours, and the SVG carries L polylines in six
  groups. Not verified at this point: anything on the live site, anything GitHub answers, and any
  slicer's opinion of the mesh.
```

- [ ] **Step 3: Push and open the pull request**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(relief): record the lift, the origin fence and the T2 evidence"
git push -u origin toolshed/t2-relief
gh pr create --title "T2: Relief, a year of activity as contour ground" --body "$(cat <<'BODY'
Adds `/tools/relief`.

A year of dated events drawn the way an Ordnance sheet draws a hillside: 52 weeks across, 24
hours down, six contour levels with every second one heavier. Three sources, one pipeline. A
GitHub username with a token you paste, any CSV with a date column, or a bundled demo so the
page is never an empty form.

Out the other side: a PNG off the canvas, an SVG a pen plotter can draw (strokes only,
millimetres, one group per level so you can change pens), and a binary STL that is a closed
solid, proved by every directed edge appearing exactly once.

No new dependencies. `d3-contour`, `three` and `papaparse` were each considered and refused in
the plan, because the marching squares are 40 lines this repo already owns, an STL is 84 bytes
plus 50 a triangle, and RFC 4180 is one state machine.

The marching squares are lifted from Tigh Sauna's `terrain.ts` and every file that carries
lifted code credits it.

The token is held in React state, goes into one `Authorization` header behind an origin fence,
and touches no storage API anywhere in the tool. `lib/tools/relief/safety.test.ts` greps for
that, for any direct `fetch` call (there are none), and for any URL literal outside `github.ts`.
`ToolEntry` gains one
optional field, `privacyNote`, because "nothing leaves this tab" would be a lie about the GitHub
path and printing a sentence that is not true is the thing this repo takes most seriously.

Two refusals, both stated on the page: under 150 events in the year, or under 30 occupied hours
out of 1,248, it says so instead of drawing rings around single cells.

Ten new guards, ten mutation rows, all caught. The phone check passes at 390 and 320 on WebKit
and on a throttled Chromium Pixel.

Not verified in this PR: anything on the live site, anything GitHub actually answers, and any
slicer's opinion of the mesh. The post-deploy checks follow the merge.
BODY
)"
```

Expected: the PR opens, and the `check` and `mutation` jobs start. Wait for both green. A red `mutation` job with a `Survived` line is a guard that does nothing, and it is fixed by making the test bite, never by deleting the row.

- [ ] **Step 4: Merge, then find the deployment the way AGENTS.md says**

```bash
gh pr merge --squash --delete-branch=false
sleep 20
curl -s "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&target=production&limit=3" \
  -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" | head -c 2000
```

Then read `readyState`, `aliasAssigned` and `meta.githubCommitSha` from `v13/deployments/<id>`. Expected: `READY`, `aliasAssigned` true, and the SHA equal to the squash-merge commit. **Do not** run `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building", and do not trust the CLI's exit code. The `teamId` is not optional: without it the listing is scoped to the wrong account and comes back empty, which reads like a failed deploy.

- [ ] **Step 5: Prove the plate actually drew, on a phone engine, on the live site**

A 200 on the route is not a pass, and neither is a screenshot: the plate is a canvas, so the only thing that can say it drew is the canvas itself. This counts pixels that differ from the background, which is zero for a canvas that never got a context, threw inside the effect, or painted the background over itself.

```bash
cd "$WT"
node --input-type=module -e "$(cat <<'JS'
import { devices, webkit } from "playwright";

const browser = await webkit.launch();
const context = await browser.newContext(devices["iPhone 13"]);
const page = await context.newPage();
const requests = [];
page.on("request", (r) => requests.push(r.url()));
await page.goto("https://fergusoreilly.dev/tools/relief", { waitUntil: "networkidle" });

console.log("lede:", (await page.locator("p.page__lede").first().innerText()).slice(0, 60));
console.log("privacy note:", (await page.locator("p.tool__privacynote").first().innerText()).slice(0, 60));
console.log("readout:", (await page.locator(".relief__readout").first().innerText()).replace(/\n/g, " | "));

const plate = await page.evaluate(() => {
  const c = document.querySelector("canvas.relief__plate");
  if (!(c instanceof HTMLCanvasElement)) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const bg = `${data[0]},${data[1]},${data[2]}`;
  let different = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (`${data[i]},${data[i + 1]},${data[i + 2]}` !== bg) different++;
  }
  return { w: c.width, h: c.height, pixels: data.length / 4, different, bg };
});
console.log("plate:", JSON.stringify(plate));

const external = requests.filter((u) => !u.startsWith("https://fergusoreilly.dev"));
console.log("off-site requests before any export:", JSON.stringify(external));

const download = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "SVG for a plotter" }).click(),
]).then(([d]) => d);
const path = await download.path();
console.log("download:", download.suggestedFilename());
const svg = await (await import("node:fs/promises")).readFile(path, "utf8");
console.log("svg starts:", svg.slice(0, 40).replace(/\n/g, " "));
console.log("svg groups:", (svg.match(/<g /g) ?? []).length, "paths:", (svg.match(/<path /g) ?? []).length);
console.log("svg mm:", /width="\d+(\.\d+)?mm"/.test(svg));

const after = requests.filter((u) => !u.startsWith("https://fergusoreilly.dev"));
console.log("off-site requests after the export:", JSON.stringify(after));

await browser.close();
JS
)"
```

Expected, and each line is the observation for one claim:

- `lede:` the registry blurb, so the shell rendered from the entry.
- `privacy note:` the sentence naming `api.github.com`, live. This is the field T2 added to the frozen type, and its absence would mean the page is printing a privacy line that is not true of one of its three paths.
- `readout:` real numbers, including an occupied count out of 1248. **The page arrived drawn.**
- `plate:` `different` in the tens of thousands against a `pixels` count in the hundreds of thousands. **This is the whole tool.** `different: 0` means the plate is one flat colour and nothing about this page works, whatever the screenshots look like. `plate: null` means the canvas is not there at all.
- `off-site requests before any export:` `[]`, or nothing but the analytics ingest path if PostHog fires on load. Anything resembling `api.github.com` on a page nobody typed a token into is a stop-and-fix.
- `download:` `relief-demo-<today>.svg`. The name carries the source and the day and nothing else.
- `svg starts:` an `<svg` element, `svg groups:` 6, `svg paths:` a real count, `svg mm:` `true`. Six groups is one per contour level, which is what lets somebody change pens.
- `off-site requests after the export:` the same list as before. **This is the "nothing is uploaded" promise, checked on the wire rather than by a grep.**

Then the phone check against production:

```bash
cd "$WT"
node scripts/phone-check.mjs --base https://fergusoreilly.dev --routes /tools/relief
```

Expected: exit 0.

- [ ] **Step 6: Drop a real CSV in, which nothing has done either**

Task 8's tests ran on fixtures written to exercise the parser. This is a file nobody wrote for it, and the repository can produce one in two lines: a header and every commit date in this project, which is exactly the shape a bookings or orders export has and is real data with real gaps in it.

```bash
cd "$WT"
printf 'authored_at\n' > "$TEMP/relief-commits.csv"
git log --date=iso-strict --pretty=%aI >> "$TEMP/relief-commits.csv"
wc -l "$TEMP/relief-commits.csv"

node --input-type=module -e "$(cat <<'JS'
import { devices, webkit } from "playwright";

const file = `${process.env.TEMP}/relief-commits.csv`;
const browser = await webkit.launch();
const page = await (await browser.newContext(devices["iPhone 13"])).newPage();
await page.goto("https://fergusoreilly.dev/tools/relief", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "CSV" }).click();
await page.getByLabel("CSV file").setInputFiles(file);
await page.locator(".relief__note").filter({ hasText: /Read|too thin|too concentrated|No column/ }).first()
  .waitFor({ timeout: 30_000 });
console.log("note:", await page.locator(".relief__note").first().innerText());
console.log("column chosen:", await page.locator(".relief__select").first().inputValue());
console.log("readout:", (await page.locator(".relief__readout").first().innerText()).replace(/\n/g, " | "));
await browser.close();
JS
)"
```

Expected: `column chosen:` `0`, since there is one column and it parses; `note:` the read and skipped counts, with skipped at 0 or 1 (a trailing blank line is not a row and should not be counted); `readout:` an events count matching the rows inside the last 52 weeks, which will be fewer than the file's total because this repository is older than a year, and that is the window doing its job rather than a bug.

If the tool refuses this file with "too thin to contour", that is a true refusal on a real file and it goes in the ledger as one: a repository with under 150 commits in the last year genuinely has nothing to contour. Repeat with a busier export before concluding anything about the parser.

- [ ] **Step 7: Run it against GitHub, which nothing has done yet**

Every test in Task 9 ran against a recording stub. The `Accept` header, the media type, the rate-limit response shape and whether commit search still wants a preview header are all guesses until this runs. Use a token with **no scopes ticked** and never echo it.

```bash
cd "$WT"
GH_RELIEF_USER=fergo5002 node --input-type=module -e "$(cat <<'JS'
import { devices, webkit } from "playwright";

const token = process.env.GH_RELIEF_TOKEN;
if (!token) throw new Error("set GH_RELIEF_TOKEN to a scopeless token before running this");

const browser = await webkit.launch();
const context = await browser.newContext(devices["iPhone 13"]);
const page = await context.newPage();
const statuses = [];
page.on("response", (r) => {
  if (r.url().startsWith("https://api.github.com")) statuses.push(`${r.status()} ${r.url().split("?")[0]}`);
});
await page.goto("https://fergusoreilly.dev/tools/relief", { waitUntil: "networkidle" });

await page.getByRole("button", { name: "GitHub" }).click();
await page.getByLabel("GitHub username").fill(process.env.GH_RELIEF_USER ?? "");
await page.getByLabel("GitHub token").fill(token);
await page.getByRole("button", { name: "Draw my year" }).click();

await page.locator(".relief__note").filter({ hasText: /Drawn|Stopped at|refused|rate/ }).first()
  .waitFor({ timeout: 180_000 });
console.log("note:", await page.locator(".relief__note").first().innerText());
console.log("readout:", (await page.locator(".relief__readout").first().innerText()).replace(/\n/g, " | "));
console.log("github responses:", JSON.stringify(statuses.slice(0, 4)), "total:", statuses.length);
console.log("token in any URL:", statuses.some((s) => s.includes(token)));

await browser.close();
JS
)"
```

Expected: `note:` the drawn line or the truncation line; `readout:` an occupied count well above 30; `github responses:` a list of `200 https://api.github.com/search/commits`; `token in any URL:` `false`.

If GitHub answers `415` or `422`, that is the finding this step exists for and it goes in the ledger with the exact body. The fix is the header or the query in `github.ts`, and it needs a new unit test against the recording stub before it is called fixed. A `403` on the first request with a valid token is the search rate limit, not the token, and the pacing constant is the thing to look at.

- [ ] **Step 8: Take the STL to something that has an opinion**

The closed-solid proof is an edge test, and an edge test is not a slicer.

```bash
cd "$WT"
node --input-type=module -e "$(cat <<'JS'
import { devices, webkit } from "playwright";
import { stat, readFile } from "node:fs/promises";

const browser = await webkit.launch();
const page = await (await browser.newContext(devices["iPhone 13"])).newPage();
await page.goto("https://fergusoreilly.dev/tools/relief", { waitUntil: "networkidle" });
const download = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "STL for a printer" }).click(),
]).then(([d]) => d);
const path = await download.path();
const size = (await stat(path)).size;
const head = await readFile(path);
const count = head.readUInt32LE(80);
console.log("name:", download.suggestedFilename());
console.log("bytes:", size, "header count:", count, "expected bytes:", 84 + count * 50);
console.log("header starts with solid:", head.subarray(0, 5).toString("ascii") === "solid");
await browser.close();
JS
)"
```

Expected: the byte length is exactly `84 + count * 50`, and `header starts with solid` is `false`, which is what stops a parser reading a binary file as ASCII.

Then open the downloaded file in a slicer or a mesh viewer (PrusaSlicer, Bambu Studio, or Windows 3D Viewer) and **write down what it says**, in its words. "No errors detected" and "repaired 4 issues" are different findings and only one of them means the edge test is telling the truth. Until this is done, the word for the mesh in every document is "closed by the edge test", not "prints".

- [ ] **Step 9: Check the event landed and carries nothing**

In PostHog, look for `tool_run` with `tool: "relief"` from the runs above, within a few minutes. There should be one from Step 6's GitHub draw and none from any export, which is the deliberate choice in Task 10: the run is the year being drawn, not the file being saved. If pageviews are arriving but this is not, read the `cookieless_server_hash_mode` note in AGENTS.md before blaming the tool.

Confirm the payload carries `tool`, `outcome` and `ms` and nothing else. A username, a row count or a filename in it is a stop-and-fix.

- [ ] **Step 10: Close the ledger**

Set the T2 row to `**live**` with the deployment uid, and write the final log line stating both halves:

```markdown
- 2026-09-03: T2 live. Verified on https://fergusoreilly.dev/tools/relief with a WebKit iPhone 13:
  the page arrived drawn (readout printed E events across C of 1,248 hours) and the canvas held P
  pixels differing from its background, so the plate really painted; the privacy note naming
  api.github.com rendered under the privacy line; no off-site request was made on load and none
  after an export, so the three files come out of the tab; the SVG downloaded as
  relief-demo-<date>.svg with 6 groups, L paths and millimetre page units; the STL downloaded at
  B bytes matching its own 84 + 50n header count and does not begin with "solid", and <slicer>
  said "<exact words>"; a real scopeless token drew a year from R search requests all answering
  200 with the token in no URL; the phone check passed at 390, 320 and the throttled Pixel; and
  the tool_run event arrived with slug, outcome and milliseconds only.
  Not verified: no pen plotter has drawn the SVG, so "a plotter can draw this" rests on the file
  being strokes in millimetres and nothing else; nothing has been printed, so the mesh is closed
  by an edge test and a viewer's opinion, not by a print; the 98th percentile, the six levels and
  the two smoothing passes are arguments with tests behind them and nobody has measured whether
  any of the three is the right choice; the demo is generated, so "a developer's year looks like
  this" is a model and the page says so; commit times are the author's local clock by design, so
  a laptop on the wrong zone moves the ground and nothing can detect that; the GitHub path was
  driven with one account's year, so nothing is known about how it behaves for somebody with
  5,000-plus commits beyond the truncation line; and nothing has been tried on a physical iPhone,
  only on the WebKit engine one ships.
```

- [ ] **Step 11: Commit the ledger straight to main**

```bash
cd /c/Dev/fergus-portfolio
git checkout main && git pull
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(ledger): T2 relief is live, with what was and was not verified"
git push
```

Docs-only commits may land on `main` directly (AGENTS.md, Commands).

---

## Self-review

Run against the spec with fresh eyes, per the writing-plans skill, after the tasks were written and again after Tasks 10 to 13 were added to a plan that stopped at Task 9. Gaps found were fixed inline before this plan was saved; each is listed with what changed.

**1. Spec coverage.** Walking design section 6, T2, clause by clause, plus the clauses section 6's preamble and section 9 apply to every tool:

| Spec clause | Task |
|---|---|
| `/tools/relief` | 10 |
| "A year of activity as contour ground drawn with `terrain.ts`" | 3 (the lift, credited in every file that carries it), 2 (the field it draws) |
| "52 weeks by 24 hours" | 2 (`WEEKS`, `HOURS`, and the layout `terrain.ts` uses) |
| "a GitHub username (commits...)" | 9 |
| "using the visitor's own token pasted and never stored" | 9 (one header, origin fence), 10 (state, password field, no form, no URL), and `safety.test.ts` |
| "because the unauthenticated API caps at 60 calls an hour" | 9 (why the field exists), 1 (the sentence a visitor reads) |
| "or any CSV with a date column" | 8, 10 (the column picker) |
| "Out: PNG" | 5 (the plate), 10 (the blob) |
| "SVG for a plotter" | 6, 10 |
| "STL for a printer (two triangles a cell)" | 7, 10 |
| "Can't see: private repos without a token" | 1 (`cantSee[0]`) |
| "commit times are the author's local time and the page says so" | 9 (`localHour`, never `getHours`), 1 (`cantSee[1]`) |
| Demo state, never an empty shell (section 6 preamble) | 4, 10 |
| Everything in the browser, nothing uploaded | 10 (`download.ts` with `fetch` as a tripwire), 13 Step 5 (the wire, live) |
| No new dependencies (global constraints, three refusals on the record) | 3, 6, 7, 8 |
| Phone check at 390 and 320 on a real engine (section 9) | 12 |
| Mutation check on every new guard (section 9) | 11 |
| "can't see" list on the page, checked against the code (section 9) | 1 writes it, F3's `ToolPage` renders it, and the reviewer on the PR checks it against `lib/tools/relief/*` |
| "the verifier runs the exact flow, a 200 is not a pass" (section 9) | 13 Steps 5 to 9 |
| `tool_run` with slug and outcome, never the input | 10, live in 13 Step 9 |

**Six gaps found and closed while writing the second half of this plan.**

The first is the worst. `lib/tools/relief/safety.test.ts` was in the file-structure table from the start, described as the grep guards that carry the tool's central promise, and **no task wrote it**. A reader following Tasks 0 to 9 would have shipped a tool whose privacy claim rested on a file that did not exist. It is Task 10 Step 6 now, and it greps both directories rather than one, because the component is the file most likely to reach for storage.

Second, `FLAT_RANGE` was exported by Task 2 with a docblock saying the page says "flat" below it, `reliefCopy.refusal.flat` was written in Task 1, and nothing read either. Both are spent in Task 10's `flat` derivation, and `ReliefTool.test.ts` asserts the constant is referenced, so the dead constant cannot come back.

Third, Task 1's `reliefCopy` had no words for the buttons, the errors, the readout, the file input or the column picker. A page built from it alone would have had to hard-code a dozen strings, against the house rule that all copy lives in `content/`. Task 10 Step 5 appends them to the same object with a note that the voice lint does not cover them, so they have to be read back by hand.

Fourth, the file-structure table says `.github/workflows/ci.yml` is modified so `/tools/relief` joins the phone job's routes. F3's phone job runs `--from-sitemap`, and a live tool is in the sitemap because `liveTools` puts it there, so most likely no edit is needed at all. Task 12 Step 1 checks which it is and records the table as wrong rather than editing a workflow to make a plan true.

Fifth, the exports had no home. Written inline in the component they would have been the one part of the download path that no test in a node environment could reach, and the object-URL revoke ordering, which is a real WebKit trap, would have been an unexamined line. `lib/tools/relief/download.ts` exists for that, and its `SaveEnv` is what makes the four globals testable.

Sixth, nothing in Tasks 0 to 9 ever proved the plate paints. Every draw test runs against a recording stub, which proves the ops list and proves the painter plays it, and neither touches a pixel. Task 13 Step 5 counts pixels differing from the background inside the live canvas, which is the first check in the whole plan that could tell a working plate from a blank one.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code. Seven places name something that has not happened yet and every one is labelled as a prediction with the action to take if it is wrong: the six phone-check guesses (Task 12), the three failure lines expected from the broken ceiling (Task 11 Step 1), the ten anchors that must be checked before the mutation run (Task 11 Step 3), what a real repository's own commit dates do to the CSV path (Task 13 Step 6), GitHub's actual response shape (Task 13 Step 7), the slicer's opinion (Task 13 Step 8), and the contrast ratios from Task 5. That is the `CLAIMS.md` pattern, not a placeholder.

Two numbers in this half are arithmetic rather than measurement and are marked as such: 1,248 is 24 by 52, and `84 + count * 50` is the binary STL layout. Both are checkable on the spot and neither is a claim about a run.

**3. Type consistency.** Checked name by name across tasks:

- `ReliefEvent` is produced in Task 2's `types.ts` and consumed as a value type in 4, 8, 9 and 10. Task 10 imports it from `@/lib/tools/relief/types` and nowhere else, so there is one definition.
- `Heightmap` is produced in Task 2 and consumed in Task 10 for the readout and for `buildMesh(heightmap.field)`. `buildMesh` takes `Field`, and `Heightmap.field` is a `Field`, so the smoothed and normalised grid is what gets extruded, which is the same grid the contours are drawn from. A raw `counts` grid handed to `buildMesh` would compile and print a completely different object; the readout is the only consumer of `counts`.
- `ContourLayer` is produced in Task 3 and consumed by `planPlate` (Task 5) and `plotterSvg` (Task 6). Task 10 computes `layers` once and hands the same array to both, so the plate and the plotter file can never disagree about what was drawn.
- `Ctx2D` (Task 5) is a structural subset of `CanvasRenderingContext2D`, so Task 10 passes the real context with no cast. `setTransform` is called on the real context before `paint`, which is correct: it is not in `Ctx2D` and does not need to be, because the painter never touches the transform.
- `Palette` comes from `paletteFromTokens(read)`, and Task 10's reader is `(name) => style.getPropertyValue(name)`. `getPropertyValue` returns `""` for an unknown property and a leading-space-padded string for a known one; `need()` in Task 5 trims and throws on empty, so both cases are handled by code that already exists.
- `Density`'s `reason` union is `"few-events" | "few-cells"`, and `reliefCopy.refusal` has exactly those two keys plus `flat`. `reliefCopy.refusal[density.reason]` therefore type-checks today and stops compiling the moment a third reason is added to the guard without a sentence, which is the compile-time link that keeps the arithmetic free of prose.
- `PlateSource` and `PlateKind` live in `download.ts`, in `lib`, and the labels live in `content`. Neither can import the other without turning the dependency the wrong way round, so `SOURCES: PlateSource[]` indexed into `reliefCopy.sources[key]` is the compile-time half and `download.test.ts`'s key comparison is the runtime half. Two seams for one join, deliberately, because this is the join a new source would break silently.
- `FetchOptions` (Task 9) wants `fetchImpl: typeof fetch` and `sleep: (ms: number) => Promise<void>`. Task 10 passes `window.fetch.bind(window)`, which satisfies `typeof fetch`, and a `Promise<void>` around `window.setTimeout`. An unbound `window.fetch` would compile and then throw `Illegal invocation` in WebKit, which is why the bind is asserted in `ReliefTool.test.ts` rather than left to the reader.
- `CsvReading` (Task 8) has `read` and `skipped` and Task 10's `csvRead` line uses both by name. `endMs` is deliberately unused in the component: the window is already applied inside `eventsFromCsv`, and using it again would move the year twice.
- `plateFilename(source, kind, iso)` has the same three-parameter shape in Task 10's `onExport`, in `download.test.ts` and in Task 13's expected download names.
- One inconsistency was found and fixed while writing: an earlier draft of `saveBlob` revoked the object URL synchronously in the `finally`, which is the WebKit cancellation trap, and the test asserting the call order would have locked the bug in. `SaveEnv` gained `defer` and the test now asserts the revoke has *not* happened when `click` returns.
- A second was found and fixed: `onExport` originally fired a `tool_run` per download, which would have put three events on one drawn year and made the tool's numbers meaningless, since F3's payload has no field to say which file. The event now fires once per year drawn, in `onGithub` and `readColumn`, and `ReliefTool.test.ts` asserts there are exactly three call sites: those two plus the error the GitHub path can end in.
- A third: `accept()` originally replaced `events` before checking density, so a refused year wiped the sheet and left the visitor with a message and a blank page. It checks first now and a refusal leaves the last good ground on screen.

**4. What this plan cannot see.** In one place, so no reader has to assemble it:

- **No component is ever mounted.** vitest runs in node with no jsdom, so every claim about the page in Tasks 10 to 12 is a claim about its source text. The first thing that exercises React on this route is Task 13.
- **No canvas is ever painted in CI.** `draw.test.ts` proves the ops list and proves the painter plays a list. Whether a real context turns that into visible lines is unknown until Task 13 Step 5 counts pixels, and even that counts pixels rather than judging a picture.
- **Nothing has touched GitHub.** The `Accept` header, the API version header, the search query grammar, the rate-limit response shape and the 1,000-result ceiling are read off documentation and encoded in a stub. Task 13 Step 7 is the first contact.
- **Nothing has been printed and nothing has been plotted.** "Closed by the edge test" and "strokes in millimetres" are the honest words until a slicer and a pen say otherwise, and only the slicer is in this plan.
- **The maths is argued, not measured.** The 98th percentile, six levels, two smoothing passes, a 24 by 52 grid and the 150/30 floors are choices with tests that pin them, not findings. Nobody has looked at a hundred real years and asked whether six levels is right.
- **The demo is a model.** It is generated from a seed, the page says so in `demoCaption`, and no claim about what a developer's year looks like should ever rest on it.
- **The hour is the author's local clock by design**, so a machine on the wrong timezone, a fortnight abroad, a rebase or a bulk import all move the ground and nothing in the tool can detect any of them. Four of the five "can't see" lines exist for this and the fifth for the CSV equivalent.
- **The privacy promise is proved three ways and none of them is a packet capture.** Source greps say the code contains no storage call and no second URL; a recording `fetch` says the token appears in no URL and no body; Task 13 Step 5 says no off-site request is made on load or on export in one real browser session. A visitor with an extension injecting a script into the page is outside all three.
- **Nothing is known about scale.** The pipeline was exercised on a generated year and on fixture CSVs. A 200,000-row export on a three-year-old phone is capped by `MAX_CSV_ROWS` and otherwise unmeasured, and `buildMesh` on a full grid produces 4,988 triangles, which is a number this plan computed rather than timed.
- **Nobody knows whether anybody exports anything.** `tool_run` carries slug, outcome and milliseconds, and there is no room in it for which of the three files was taken. Widening the payload is F3's ground, not T2's, so the question stays unanswered on purpose.
