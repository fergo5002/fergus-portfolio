# G0 Arcade Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runtime the terminal hosts, so a game can run as text inside it: a fixed-step loop on the site's one frame clock, a character grid sized from the measured cell, keys and swipes that never scroll the page or steal a keystroke from a field, a door at `cd arcade` that opens a cabinet, and initials boards that survive Redis not existing.

**Architecture:** Everything that can be pure is pure. `lib/arcade/` holds the loop, the grid, the input mapping, the sound vocabulary, the board maths, the two screens the runtime owns (the cabinet and the initials entry) and one worked example, all tested in node with no browser. `components/arcade/ArcadeScreen.tsx` is the only React: it measures a character cell, subscribes to `SystemProvider.onFrame`, writes lines into one `<pre>` through a ref, and routes keys and gestures into whichever `ProgramSpec` is running. `components/Terminal.tsx` gains one branch that swaps its scrollback and prompt for that component and puts them back on exit. `app/api/board` is a thin skin over pure board functions.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.7, vitest 2 in a `node` environment with no jsdom, hand-written CSS in `app/globals.css`, `@upstash/redis` through F4's `getRedis` (already earned by F4, not added here). No new dependencies.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 2 (what the site may keep), section 3 (the estate being reused), section 6 (G0, and G1 to G4 which this exists to make cheap), section 8 (segmentation and frozen interfaces), section 9 (the verification standard).
- **No new dependencies.** Not one. The loop is arithmetic, the grid is strings, the sounds are the synth that already exists.
- **One frame clock.** From `AGENTS.md`: *"`SystemProvider` owns the single `requestAnimationFrame` loop... Never start another rAF loop, and never `setState` from inside a frame callback."* The arcade subscribes with `onFrame` and writes to the DOM through a ref. A `setState` inside a tick is a plan failure, not a style preference.
- **vitest, node environment, no jsdom.** Tests sit beside the source as `*.test.ts` (`vitest.config.ts` includes `**/*.test.ts` only, so a `.tsx` test file is not even collected). No component can be mounted. Everything a game depends on is a pure function tested directly; the React is thin and covered by string-grep coupling checks in the pattern of `lib/boot.test.ts` and `components/terminal.test.ts`, with comments stripped before matching so prose about a call can never satisfy a check for the call.
- **The phone is a first-class size, not a breakpoint.** 320 CSS pixels is a size the grid must work at, and the ladder in `fitGrid` exists for it. **When the grid will not fit, the program does not start:** `ArcadeScreen` calls `onExit` with the refusal from `content/arcade.ts`, the prompt comes straight back and the scrollback is untouched. A game never renders a squashed or clipped grid and never silently drops rows.
- **Every animation gated on reduced motion.** The arcade declines wholesale under `prefers-reduced-motion: reduce`, in the pattern `gravity` and `eject` already use, with a sentence rather than silence. The CSS this plan adds contains no keyframes and no transitions, so there is nothing left to gate, and that is written in the stylesheet rather than assumed.
- **All copy in `content/`.** From `AGENTS.md`: *"All editable content lives in `content/*.ts`: never hard-code copy in components."* `content/arcade.ts` holds every sentence the arcade prints, the game titles, and the initials blocklist. `content/voice.test.ts` already walks the whole source tree for em dashes; `content/arcade.test.ts` adds the width and shape rules.
- **Mutation anchors are CRLF-tolerant.** Every multi-line regex in `scripts/mutation-check.mjs` and in any test uses `\r?\n`. The working tree is mixed: `app/globals.css` and `lib/commands.ts` are CRLF on disk, `components/Terminal.tsx` is LF. An anchor written with a bare `\n` silently matches nothing, and the script reports that as `ANCHOR-MISS`, which is a failure and never a skip.
- **Nothing fails silently.** The rule `/contact` was written for. An unavailable board says so in a sentence. A grid that will not fit says so. A refused set of initials says why.
- **What the site may keep.** Server-side: three-letter initials and a score, nothing keyed to a person, no address stored (F4's `budgetKeyForIp` hashes with a daily salt). Client-side: one key, `fergusos:arcade.initials`, written only when the visitor submits a score, wiped by `forget` through the existing `OWNED_PREFIX` rule with no change to `lib/forget.ts`. The session flag and the board snapshot live at module level and die with the tab, touching no storage at all.
- **The interfaces frozen below are used with these exact names.** G1, G2, G3 and G4 are planned separately and their implementers see only their own file. Adding an export is fine; renaming one is not.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`. Every completion note states what was not verified, per `C:\Users\oreil\.claude\CLAIMS.md`, and never uses a word above the rung it earned.
- The repository is public and `main` requires the `check` and `mutation` GitHub Actions jobs. Code goes through a pull request on branch `toolshed/g0-arcade-runtime` in its own worktree, made through `workspaces.ps1`. Never force-push, never rewrite history, never delete a branch or a worktree.
- Deploys are git-linked, so a merge ships. Deployment state is read from the Vercel API (`v6/deployments` with `teamId`), never from `vercel ls`, which renders `BLOCKED` as `UNKNOWN`.

## Preconditions, and the one that is not met yet

F1 and F2 are `live` in `docs/superpowers/programme/toolshed-ledger.md`, which is everything G0 needs to start: `defineCommand`, the `program` result, `ProgramSpec`, the hidden door and the terminal on every route are all on `main`.

**F4 is not merged.** `lib/store/redis.ts`, `lib/store/errors.ts` and `lib/budget.ts` are on the `toolshed/f4-state-layer` branch, and Upstash has not been provisioned, because two Vercel Marketplace terms acceptances are waiting on Fergus. So:

- Every file in `lib/arcade/` and `components/arcade/` is written with **no import from `lib/store/` or `lib/budget.ts`**. The board's Redis calls are pure functions over an injected client (`BoardRedis`, Task 8), which a hand-written fake satisfies in tests.
- Only `app/api/board/route.ts` imports F4. That is Task 12, and it is deliberately the last code task.
- **If `lib/store/redis.ts` does not exist on `main` when Task 12 is reached, skip Task 12**, note it in the ledger, and open the pull request without the route. Nothing else is blocked: `lib/arcade/board-client.ts` treats a 404 exactly as it treats a network failure and an `{ available: false }` body, so the cabinet prints the same sentence either way and the games still play. Task 13 then omits the two mutation rows that anchor on the route, and Task 15's live check reads the unavailable sentence rather than a board.

That is the whole answer to "what happens when there is no Redis", and it is answered twice over: once at the type level, because nothing in `lib/arcade/` can see the store, and once at runtime, because `StoreUnavailableError` becomes a sentence rather than a stack trace.

## Frozen interfaces (verbatim, shared with the G1 to G4 plans)

These are what a game plan is written against. Copy this block into each of them.

```ts
// lib/arcade/program.ts   (F1 froze the three types; G0 adds ProgramResult, three optional host
//                          members, and widens exit. Nothing is renamed.)
export type ProgramResult = { score?: number; label?: string };

export type ProgramHost = {
  cols: number;
  rows: number;
  draw(lines: string[]): void;
  sound?(name: ArcadeSound): void;
  /** Knock the tube at a grid cell. Feeds the phosphor's impact lights. */
  flash?(col: number, row: number, energy: number): void;
  /** Hand the screen to another program: the cabinet launching a game. */
  run?(spec: ProgramSpec): void;
  /** Leave. A score offers the initials entry; no score returns the prompt. */
  exit(result?: ProgramResult): void;
};

export type ProgramInstance = {
  tick(dtMs: number): void;
  key(key: ArcadeKey, down: boolean): void;
  swipe?(dir: "up" | "down" | "left" | "right"): void;
  dispose(): void;
};

export type ProgramSpec = { id: string; title: string; start(host: ProgramHost): ProgramInstance };

// lib/arcade/loop.ts
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;        // 33.333...
export const MAX_TICKS_PER_FRAME = 4;
export type LoopState = { acc: number; ticks: number };
export function createLoopState(): LoopState;
export function advance(state: LoopState, dtMs: number, tick: (ms: number) => void): number;

// lib/arcade/grid.ts
export type GridSize = { cols: number; rows: number };
export type GridFit = { cols: number; rows: number; scale: number };
export const GRID_SIZES: readonly GridSize[];   // 48x20, 40x18, 32x16, in that order
export const GRID_SCALES: readonly number[];    // 1, 0.9, 0.8
export const MIN_CELL_PX = 6;
export function fitGrid(box: { width: number; height: number }, cell: { width: number; height: number }): GridFit | null;
export function blankGrid(cols: number, rows: number): string[][];
export function put(grid: string[][], col: number, row: number, ch: string): void;
export function write(grid: string[][], col: number, row: number, text: string): void;
export function centre(grid: string[][], row: number, text: string): void;
export function toLines(grid: string[][]): string[];

// lib/arcade/input.ts
export type ArcadeKey = "up" | "down" | "left" | "right" | "fire" | "start" | "pause" | "1" | "2" | "3" | "4" | "5";
export type KeyMods = { ctrlKey: boolean; metaKey: boolean; altKey: boolean };
export type Gesture = { kind: "swipe"; dir: "up" | "down" | "left" | "right" } | { kind: "tap" };
export type Delivery = { swipe: "up" | "down" | "left" | "right" | null; press: ArcadeKey | null };
export function arcadeKey(key: string, mods: KeyMods): ArcadeKey | null;
export function shouldCapture(key: string, mods: KeyMods): boolean;
export function gestureOf(dx: number, dy: number, dtMs: number): Gesture | null;
export function deliverGesture(gesture: Gesture | null, hasSwipe: boolean): Delivery;

// lib/arcade/sound.ts
export type ArcadeSound = "blip" | "wall" | "hit" | "score" | "die";
export type SoundCall =
  | { method: "hover" } | { method: "key" } | { method: "relay" }
  | { method: "thud" } | { method: "impact"; energy: number };
export function soundFor(name: string): SoundCall | null;

// lib/arcade/games.ts
export type ArcadeGame = { id: string; title: string; spec: ProgramSpec | null; board: boolean };
export const ARCADE_GAMES: readonly ArcadeGame[];
export const BOARD_GAMES: readonly string[];
export function findGame(id: string): ArcadeGame | undefined;
export function isReady(game: ArcadeGame): boolean;   // game.spec !== null

// lib/arcade/board.ts
export const INITIALS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const INITIALS_LENGTH = 3;
export const BOARD_SIZE = 20;
export type BoardRow = { initials: string; score: number };
export type Board = { game: string; rows: BoardRow[] };
export type BoardSnapshot = { available: boolean; boards: Board[]; note?: string };
export type InitialsCheck = { ok: true; initials: string } | { ok: false; reason: string };
export function normaliseInitials(raw: string): string;
export function foldLeet(initials: string): string;
export function checkInitials(raw: string): InitialsCheck;
export function insertScore(rows: readonly BoardRow[], row: BoardRow, size?: number): BoardRow[];
export function groupDigits(n: number): string;
export function formatBoard(board: Board, width: number, title: string): string[];
export function formatBoards(snapshot: BoardSnapshot | null, width: number, titles: Record<string, string>): string[];

// lib/arcade/board-store.ts   (no import from lib/store: the client is injected)
export type BoardRedis = {
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>;
  zrange(key: string, start: number, stop: number, opts: { rev: true; withScores: true }): Promise<(string | number)[]>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
};
export function boardKey(game: string): string;                       // arcade:board:<game>
export function parseZrange(flat: readonly (string | number)[]): BoardRow[];
export function readBoards(redis: BoardRedis, games: readonly string[]): Promise<Board[]>;
export function writeScore(redis: BoardRedis, game: string, initials: string, score: number, nonce: string): Promise<void>;

// lib/arcade/board-client.ts
export type SubmitResult = { ok: true; board: Board } | { ok: false; reason: string };
export function fetchBoards(fetchImpl?: typeof fetch): Promise<BoardSnapshot>;
export function submitScore(entry: { game: string; initials: string; score: number }, fetchImpl?: typeof fetch): Promise<SubmitResult>;

// lib/arcade/session.ts   (module level, never persisted, dies with the tab)
export type ArcadeSession = { seen: boolean; boards: BoardSnapshot | null };
export const INITIALS_KEY = "fergusos:arcade.initials";
export function arcadeSession(): ArcadeSession;
export function markArcadeSeen(): void;
export function setArcadeBoards(boards: BoardSnapshot): void;
export function resetArcadeSession(): void;                            // tests only
export function loadInitials(storage: Pick<Storage, "getItem">): string | null;
export function saveInitials(storage: Pick<Storage, "setItem">, initials: string): void;

// lib/arcade/cabinet.ts
export type CabinetState = { index: number; note: string | null };
export function initialCabinetState(): CabinetState;
export function cabinetReduce(state: CabinetState, key: ArcadeKey, games: readonly ArcadeGame[]): { state: CabinetState; launch: ArcadeGame | null };
export function cabinetView(state: CabinetState, games: readonly ArcadeGame[], boards: BoardSnapshot | null, cols: number, rows: number): string[];
export function createCabinet(): ProgramSpec;                          // id "arcade", title from content

// lib/arcade/initials.ts
export type InitialsState = { chars: [number, number, number]; cursor: 0 | 1 | 2; note: string | null };
export function initialInitialsState(seed?: string | null): InitialsState;
export function initialsValue(state: InitialsState): string;
export function initialsReduce(state: InitialsState, key: ArcadeKey): { state: InitialsState; submit: string | null };
export function initialsView(state: InitialsState, game: string, score: number, cols: number, rows: number): string[];
export function createInitialsProgram(opts: { game: string; score: number; seed: string | null; onSubmit(initials: string): void }): ProgramSpec;

// lib/commands/shared.ts   (one additive field)
export type CommandContext = { /* ...everything it has today... */ arcade?: ArcadeSession };
```

**Why widening `exit` is safe.** `exit(): void` becomes `exit(result?: ProgramResult): void`. A caller that writes `host.exit()` still compiles, and a test double that implements `exit: () => {}` is still assignable, because a function with fewer parameters is assignable to one with more. Narrowing `key`'s first parameter from `string` to `ArcadeKey` is safe in the other direction, for the same reason turned round: parameter positions are contravariant, so an implementation typed `(key: string, down: boolean)` still satisfies the narrower type. Task 6 asserts both with a compile-time fixture rather than leaving it as an argument.

**What a game plan has to do, in full.** This is the payoff and it is deliberately three lines:

1. Write `lib/arcade/<game>.ts` exporting a `ProgramSpec`, with its state reducer and its view as pure functions beside it, and `lib/arcade/<game>.test.ts` driving the reducer.
2. Add one import line and one entry to `ARCADE_GAMES` in `lib/arcade/games.ts` (alphabetical, so two pull requests rarely collide), and its title to `arcadeCopy.games` in `content/arcade.ts`.
3. Nothing else. No React, no CSS, no route, no key handling, no board wiring. `host.exit({ score })` is the entire board integration, and the runtime does the rest.

## File structure

| File | Responsibility |
|---|---|
| `lib/arcade/program.ts` (modify) | The frozen types, plus `ProgramResult` and the three optional host members |
| `lib/arcade/loop.ts` (+ `.test.ts`) | Fixed timestep over a frame delta. Arithmetic only |
| `lib/arcade/grid.ts` (+ `.test.ts`) | `fitGrid` and the five drawing helpers. Strings only |
| `lib/arcade/input.ts` (+ `.test.ts`) | The key vocabulary, the capture rule, gestures, and how a gesture is delivered |
| `lib/arcade/sound.ts` (+ `.test.ts`) | The five sound names and what each one is on the synth |
| `lib/arcade/bounce.ts` (+ `.test.ts`) | The worked example. Kept, shipped, and the rig every runtime test drives |
| `lib/arcade/games.ts` (+ `.test.ts`) | The game list. One line per game plan |
| `lib/arcade/board.ts` (+ `.test.ts`) | Initials, the blocklist, the top twenty, the printed board |
| `lib/arcade/board-store.ts` (+ `.test.ts`) | The Redis shape, over an injected client. No `lib/store` import |
| `lib/arcade/board-client.ts` (+ `.test.ts`) | The browser half. Everything that is not a good answer is "unavailable" |
| `lib/arcade/session.ts` (+ `.test.ts`) | The session flag, the last snapshot, the one saved key |
| `lib/arcade/cabinet.ts` (+ `.test.ts`) | The door's screen: the game list and the boards |
| `lib/arcade/initials.ts` (+ `.test.ts`) | Three characters, entered with the same five keys |
| `components/arcade/ArcadeScreen.tsx` | The only React. Measure, subscribe, draw, route input |
| `components/arcade/arcade.test.ts` | Coupling greps on the component |
| `components/Terminal.tsx` (modify) | One branch: host the program, put the prompt back on exit |
| `components/terminal.test.ts` (modify) | The branch's greps replace F1's "no runtime yet" ones |
| `lib/commands/hidden.ts` (modify) | The door opens the cabinet, or declines under reduced motion |
| `lib/commands/hidden.test.ts`, `dispatch.test.ts` (modify) | Both assert F1's placeholder string today |
| `lib/commands/info.ts` (modify), `lib/commands.test.ts` | `neofetch` prints the boards, once the door has been opened |
| `lib/commands/shared.ts` (modify) | `CommandContext.arcade`, and one stale docblock |
| `app/api/board/route.ts` (+ `route.test.ts`) | GET the boards, POST a score. The only file that imports F4 |
| `app/globals.css` (modify) | `.arcade` and `.term--program`, beside `.term`. No keyframes |
| `content/arcade.ts` (+ `.test.ts`) | Every sentence, every title, the blocklist |
| `scripts/mutation-check.mjs` (modify) | Nineteen new rows, plus two if the route lands |
| `AGENTS.md`, `docs/PROGRESS.md`, the ledger | The rule, the state, the log |

Each `lib/arcade/*.ts` file is one responsibility and its test sits beside it, which is the pattern the rest of `lib/` already follows. The split is not by layer: it is by what changes together. A game plan touches `games.ts` and `content/arcade.ts` and nothing else, so those two are the only shared files with a registration line in them, and both are alphabetical.

**Why the CSS goes in `app/globals.css` and not a `tool.css`.** The programme's rule is that *a tool* may own `app/tools/<slug>/tool.css`. The arcade is not a tool and has no route: it lives inside the terminal, which is chrome, and its stylesheet is the shell's. Ten tools appending to one file is the problem that rule solves; one arcade adding thirty lines beside `.term` is not that.

## The decisions this plan makes, and why

**Thirty ticks a second.** A character cell is the smallest thing that can change, so a tick that cannot move anything into a new cell is work nobody can see. At 48 columns, one cell a tick crosses the screen in 1.6 seconds, which is a Pong ball; anything slower counts ticks, and Snake will move every fourth. Worst case a key waits one tick and one frame, about 50ms, which is the edge of noticeable. Sixty would double the cost for no visible change and halve every speed constant a game has to pick. Ten would make a paddle feel sticky. The tick is fixed, so a game runs at the same speed on a 60Hz laptop and a 120Hz phone, and a test can drive 600 ticks in a millisecond with no clock at all.

**The loop leans on two things the provider already does.** `SystemProvider` clamps its delta to 64ms and does not call subscribers at all while `document.hidden`. So a backgrounded tab pauses the game, banks nothing, and produces no catch-up burst on return, which is the correct behaviour and it costs nothing to get. `MAX_TICKS_PER_FRAME` is belt and braces for a caller that is not the provider, and every test is one.

**The grid is measured, never assumed.** `ArcadeScreen` renders a hidden probe span of 100 zeroes at the grid's own font and divides `getBoundingClientRect().width` by 100. The rect, not `offsetWidth`: `offsetWidth` rounds to a whole pixel, and at 48 columns a half-pixel error is two columns of overflow. The box it has to fit into is the grid element's own content box, read the same way. `fitGrid` then walks the scale ladder outermost, so every board is tried at full size before any type is shrunk: 40 by 18 at 16px beats 48 by 20 at fourteen and a bit, because the board is made of characters and a character has to be readable first.

**Legibility at 320.** The base cell size is 15px on a narrow screen and 16px above 600px, set as `--arcade-font` in CSS and multiplied by `--arcade-scale` from the fit. At 320 the terminal's content box is about 296px, so 32 columns need a 9.25px advance, and a 15px monospace advance is about 9px. That fits. Sixteen rows at line-height 1.25 need about 300px of height and the drawer offers about 288, so the fit lands on scale 0.9 and 32 by 16 stays whole. `MIN_CELL_PX` is 6: below that a glyph on a phone is a smudge, and the runtime would rather refuse than serve one.

**The shader does not draw the glyphs, and this plan does not pretend it does.** `PhosphorScreen`'s sim pass is fed by emitters (the beam, the pointer, taps, degauss rings and physics impacts); it does not sample the DOM, so a moving character gets no persistence trail from it for free. What a glyph does get is the glass over the top (curvature, grille, scanlines, aberration) and the phosphor text-shadow the terminal already carries. The one honest way to make the tube answer a game event is the seam that already exists: `pushImpact` on the system frame, which the shader reads and lights in the same frame the synth clicks. That is what `host.flash(col, row, energy)` is, and it is capped at one call a tick so a game cannot flood `MAX_FRAME_IMPACTS` and starve the physics stage. No CSS trail is added, because a faked trail under a real CRT shader looks like two effects disagreeing.

**`neofetch` prints the boards, but only after the door has been opened.** The spec says both that `top` is the one hint and that `neofetch` prints the boards. A permanent `PHOSPHOR PONG  4200  FOR` block in `neofetch` is a second hint, and a louder one. So `lib/arcade/session.ts` holds a module-level `seen` flag, set by `Terminal` when it hosts a program, and `neofetch` prints the board block only when it is set. The flag is never persisted and never written to storage, so a reload puts the machine back to one hint. If Fergus would rather it always printed, deleting one guard line does it, and that guard has a mutation row.

**A refused set of initials is refused twice.** The same `checkInitials` runs in the entry screen, so the visitor sees why before anything is sent, and again in the route, because a client-side check is a courtesy and never a control.

---

### Task 0: Worktree, baseline, ledger

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (the G0 row and the log)

**Interfaces:**
- Consumes: nothing
- Produces: the worktree path every later step runs in, called `$WT` below, and the baseline test counts Task 15 compares against

- [ ] **Step 1: Create the worktree through the safe wrapper**

From PowerShell:

```powershell
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/g0-arcade-runtime
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/g0-arcade-runtime
```

Expected: the second command prints the sibling worktree path. Never `git-wt remove`, never `--clobber`, never delete a branch.

- [ ] **Step 2: Install from the lockfile and record the baseline**

```bash
cd "$WT"
npm ci
npx vitest run 2>&1 | tail -5
npx tsc --noEmit
ls lib/store/redis.ts 2>/dev/null || echo "F4 NOT MERGED: Task 12 is conditional"
```

Expected: every test green, `tsc` silent. Write the file count and test count down; Task 15 compares. The last line tells you now, rather than in Task 12, whether the board route can be built.

- [ ] **Step 3: Mark G0 building in the ledger**

The G0 row becomes:

```markdown
| G0 | Arcade runtime | **building** | `toolshed/g0-arcade-runtime` | | |
```

and the log gains:

```markdown
- 2026-09-04: G0 started in its own worktree. Plan: `docs/superpowers/plans/2026-09-04-toolshed-g0-arcade-runtime.md`. F4 state at start: <merged | not merged>, which decides whether Task 12 runs.
```

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): g0 arcade runtime starts"
```

---

### Task 1: Prove the suite can go red

**Files:**
- Create then delete: `lib/arcade/canary.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: evidence, recorded in the ledger, that a failing assertion in this directory actually fails the runner and the CI gate

Every task below ends with "run the test and watch it pass". That claim is worth nothing unless a failing test in this exact place, in this exact runner, actually goes red. `vitest.config.ts` includes `**/*.test.ts`, and `lib/arcade/` is a new directory: if the glob or an ignore rule kept it out, every test in this plan would pass by never running. Prove it once, here, and never wonder again.

- [ ] **Step 1: Write a test that must fail**

```ts
import { describe, it, expect } from "vitest";

/** Deleted at the end of this task. It exists to prove the runner sees this directory. */
describe("the canary", () => {
  it("is collected from lib/arcade and can fail", () => {
    expect(1 + 1).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and read the output**

```bash
cd "$WT"
npx vitest run lib/arcade/canary.test.ts; echo "exit: $?"
```

Expected, and all three matter:
1. the file is **collected** (`lib/arcade/canary.test.ts` appears in the output, not "No test files found"),
2. the assertion fails with `expected 2 to be 3`,
3. `exit: 1`.

If it says no test files were found, the glob or an ignore rule is the problem and nothing else in this plan can be trusted until it is fixed. If it exits 0 with a failure printed, the runner is not the gate and CI is not either.

- [ ] **Step 3: Prove the whole suite carries the failure**

```bash
cd "$WT"
npx vitest run 2>&1 | tail -5; echo "exit: ${PIPESTATUS[0]}"
```

Expected: `1 failed` in the summary and a non-zero exit. This is what CI's `npm test` step runs, so this is the gate.

- [ ] **Step 4: Delete the canary and confirm green returns**

```bash
cd "$WT"
rm lib/arcade/canary.test.ts
npx vitest run 2>&1 | tail -5; echo "exit: $?"
```

Expected: back to the Task 0 baseline, exit 0.

- [ ] **Step 5: Record it in the ledger and commit**

Log line: `- 2026-09-04: G0 canary. A failing test in lib/arcade/ is collected, fails, and exits 1; the full run carries it. Observed, not assumed.`

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): the arcade's tests can fail"
```

---

### Task 2: The copy, and the words the arcade is allowed to print

**Files:**
- Create: `content/arcade.ts`
- Create: `content/arcade.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `arcadeCopy`, `BLOCKED_INITIALS`, `GAME_TITLES`. Everything downstream reads its words from here and hard-codes none.

Content imports nothing from `lib/`, so `lib/arcade/games.ts` can import this without a cycle.

- [ ] **Step 1: Write the failing test**

Create `content/arcade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { arcadeCopy, BLOCKED_INITIALS, GAME_TITLES, NARROW_COLS } from "@/content/arcade";

/**
 * The arcade's copy is drawn into a character grid, so a sentence that is
 * wider than the narrowest grid is not a style problem, it is a truncation.
 * These assertions are the reason `content/arcade.ts` reads oddly short.
 */

const gridStrings = (): { where: string; text: string }[] => [
  { where: "cabinet.title", text: arcadeCopy.cabinet.title },
  { where: "cabinet.footer", text: arcadeCopy.cabinet.footer },
  { where: "cabinet.notReady", text: arcadeCopy.cabinet.notReady },
  { where: "cabinet.boardsHeading", text: arcadeCopy.cabinet.boardsHeading },
  ...arcadeCopy.board.unavailable.map((text, i) => ({ where: `board.unavailable[${i}]`, text })),
  { where: "board.empty", text: arcadeCopy.board.empty },
  { where: "initials.heading", text: arcadeCopy.initials.heading },
  { where: "initials.footer", text: arcadeCopy.initials.footer },
  { where: "initials.blocked", text: arcadeCopy.initials.blocked },
  { where: "initials.shape", text: arcadeCopy.initials.shape },
  { where: "initials.posting", text: arcadeCopy.initials.posting },
  { where: "bounce.footer", text: arcadeCopy.bounce.footer },
  ...Object.entries(GAME_TITLES).map(([id, title]) => ({ where: `GAME_TITLES.${id}`, text: title })),
];
// `declined` and `noRoom` are deliberately absent: they are printed into the
// terminal's scrollback, which wraps, not into the grid, which does not.

describe("arcade copy fits the narrowest grid", () => {
  it("keeps every string drawn in the grid inside 32 columns", () => {
    for (const { where, text } of gridStrings()) {
      expect(text.length, `${where}: ${text.length} columns`).toBeLessThanOrEqual(NARROW_COLS);
    }
  });

  it("leaves a title room for the cabinet's cursor, number and brackets", () => {
    // The cabinet draws "> 5 (under the terminal)" from column 1, so a title
    // costs six columns of furniture before it costs anything for itself.
    for (const [id, title] of Object.entries(GAME_TITLES)) {
      expect(title.length, id).toBeLessThanOrEqual(NARROW_COLS - 6);
    }
  });
});

describe("the initials blocklist", () => {
  it("holds only three-character uppercase entries", () => {
    for (const entry of BLOCKED_INITIALS) {
      expect(entry, entry).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("holds nothing that the leet fold would have rewritten", () => {
    // The check runs on the folded form, so an entry containing 0, 1, 3, 4, 5,
    // 7 or 8 could never match anything and would be a dead line pretending to
    // be a guard.
    for (const entry of BLOCKED_INITIALS) {
      expect(entry, entry).not.toMatch(/[01345780]/);
    }
  });

  it("is a set, so a duplicate cannot hide in it", () => {
    expect(BLOCKED_INITIALS.size).toBeGreaterThan(15);
  });
});

describe("the refusals say what happened", () => {
  it("declines the arcade under reduced motion in three lines that name the reason", () => {
    expect(arcadeCopy.declined).toHaveLength(3);
    expect(arcadeCopy.declined[0]).toBe("arcade: declined.");
    expect(arcadeCopy.declined.join(" ")).toContain("reduced motion");
  });

  it("says the screen is too small rather than drawing a clipped one", () => {
    expect(arcadeCopy.noRoom[0]).toBe("arcade: not enough glass.");
    expect(arcadeCopy.noRoom.join(" ")).toMatch(/32 columns/);
  });

  it("says the boards are unavailable and that the games still play", () => {
    const sentence = arcadeCopy.board.unavailable.join(" ");
    expect(sentence).toContain("unavailable");
    expect(sentence).toContain("still play");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "$WT"
npx vitest run content/arcade.test.ts
```

Expected: FAIL, `Failed to resolve import "@/content/arcade"`.

- [ ] **Step 3: Write the content file**

Create `content/arcade.ts`:

```ts
/**
 * Every word the arcade prints, per the house rule that copy lives in
 * `content/` and never in a component or a lib module.
 *
 * Two constraints that do not apply to the rest of `content/`. Each string
 * here is drawn into a character grid that is 32 columns wide on a phone, so
 * length is correctness rather than taste, and `content/arcade.test.ts`
 * enforces it. And the tone is the terminal's: lower case, flat, no
 * exclamation marks, the same voice `gravity: declined.` is written in.
 */

/** The narrowest grid the runtime will draw, from `GRID_SIZES` in lib/arcade/grid.ts. */
export const NARROW_COLS = 32;

/** Game titles, by id. A game plan adds one line here and one in lib/arcade/games.ts. */
export const GAME_TITLES: Record<string, string> = {
  bounce: "bounce",
  pong: "phosphor pong",
  snake: "snake",
  under: "under the terminal",
  poker: "six-max poker",
};

/**
 * Three characters from a 36-character alphabet is 46,656 strings, so the set
 * worth refusing is small and can simply be listed. The rule, in full:
 *
 *  1. uppercase the input and drop anything outside the alphabet;
 *  2. require exactly three characters left, and refuse with a sentence
 *     otherwise rather than silently truncating somebody's initials;
 *  3. fold the digits that stand in for letters (0 to O, 1 to I, 3 to E,
 *     4 to A, 5 to S, 7 to T, 8 to B);
 *  4. refuse if the folded form is in this set, by exact match only. Never a
 *     substring: on a three-character string every substring rule is an exact
 *     match with extra steps and a wider false-positive surface.
 *
 * This is not moderation and it is not claimed to be. It stops the obvious
 * ones. Nothing a visitor types is ever shown as free text, so the cost of a
 * miss is three characters beside a number, and adding a line fixes it.
 * Entries are pre-folded (no digits), which the test enforces, because an
 * entry containing a digit could never match and would be decoration.
 */
export const BLOCKED_INITIALS: ReadonlySet<string> = new Set([
  "ASS", "CCK", "CNT", "COK", "CUM", "DIK", "FAG", "FCK", "FUC", "FUK",
  "JIZ", "KKK", "NGR", "NIG", "PIS", "SHT", "SLT", "SPC", "TIT", "TWT",
  "VAG", "WOG",
]);

export const arcadeCopy = {
  /** Under prefers-reduced-motion, in the shape `gravity` and `eject` use. */
  declined: [
    "arcade: declined.",
    "your system asks for reduced motion, and a",
    "game is motion all the way down. try neofetch.",
  ],

  /** When `fitGrid` returns null: said plainly, never a clipped grid. */
  noRoom: [
    "arcade: not enough glass.",
    "this screen cannot hold 32 columns by 16 rows",
    "at a size anyone could read. turn the phone",
    "upright, or open the terminal somewhere bigger.",
  ],

  /** The one line printed to the scrollback when a program exits with no score. */
  left: "arcade: back to the prompt.",

  /** Named in the accessible description and on the exit control, not drawn in the grid. */
  screenLabel: "Arcade screen",
  screenHelp:
    "A game drawn as characters. Arrow keys or WASD move, space fires, Escape leaves and returns you to the prompt. There is also an exit button after the screen.",
  exitLabel: "Leave the arcade",

  cabinet: {
    title: "FERGUSOS ARCADE",
    footer: "up down pick . enter play . esc quit",
    notReady: "not built yet",
    boardsHeading: "high scores",
  },

  board: {
    /** Two lines because one that said all of it was 41 columns wide. */
    unavailable: ["boards are unavailable.", "the games still play."],
    empty: "no scores yet. be first.",
    /** Printed by neofetch, above the board block, once the door has been found. */
    neofetchHeading: "Arcade",
  },

  bounce: {
    score: "bounces",
    footer: "arrows steer . space flips",
  },

  initials: {
    heading: "three characters for the board",
    footer: "up down letter . left right move . enter ok",
    /** Shown in place, never sent. */
    blocked: "pick another three.",
    shape: "three characters, letters or digits.",
    /** While the request is in flight. Nothing claims success before the server does. */
    posting: "posting...",
    /** The scrollback line after a successful submit. */
    saved: "arcade: score posted.",
    /** The scrollback line when the board would not take it. */
    refused: "arcade: score not posted.",
  },
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$WT"
npx vitest run content/arcade.test.ts content/voice.test.ts
```

Expected: both green. `voice.test.ts` is run here because it scans the whole tree for em dashes and this is the first new copy.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add content/arcade.ts content/arcade.test.ts
git commit -m "feat(arcade): the words the arcade is allowed to print"
```

---

### Task 3: The loop

**Files:**
- Create: `lib/arcade/loop.ts`
- Create: `lib/arcade/loop.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `TICK_HZ`, `TICK_MS`, `MAX_TICKS_PER_FRAME`, `LoopState`, `createLoopState()`, `advance(state, dtMs, tick)`

- [ ] **Step 1: Write the failing test**

Create `lib/arcade/loop.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { advance, createLoopState, MAX_TICKS_PER_FRAME, TICK_HZ, TICK_MS } from "@/lib/arcade/loop";

/** Count calls and the ms each was handed. */
function counter() {
  const calls: number[] = [];
  return { calls, tick: (ms: number) => calls.push(ms) };
}

describe("the tick rate", () => {
  it("is thirty a second", () => {
    expect(TICK_HZ).toBe(30);
    expect(TICK_MS).toBeCloseTo(33.3333, 3);
  });
});

describe("advance", () => {
  it("does not tick until a whole timestep has passed", () => {
    const s = createLoopState();
    const c = counter();
    expect(advance(s, 16, c.tick)).toBe(0);
    expect(c.calls).toEqual([]);
  });

  it("ticks once when two 16ms frames have added up", () => {
    const s = createLoopState();
    const c = counter();
    advance(s, 16.667, c.tick);
    expect(advance(s, 16.667, c.tick)).toBe(1);
    expect(c.calls).toEqual([TICK_MS]);
  });

  it("hands every tick the fixed timestep, never the frame delta", () => {
    const s = createLoopState();
    const c = counter();
    advance(s, 100, c.tick);
    expect(new Set(c.calls)).toEqual(new Set([TICK_MS]));
  });

  it("keeps the remainder, so speed does not drift over a second", () => {
    // A 60fps second is 60 frames of 16.667ms, which is 30 ticks exactly.
    // Dropping the remainder each frame would give 30 ticks in 66 frames.
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 60; i++) advance(s, 16.6667, c.tick);
    expect(c.calls.length).toBe(30);
  });

  it("carries the remainder across frames rather than dropping it each time", () => {
    // Five 20ms frames are 100ms, which is three whole ticks. Zeroing the
    // accumulator after a tick instead of subtracting one timestep gives two,
    // and a game would then run a sixth slower than it should on that frame
    // pattern. The 60fps case above cannot see this, because 16.67 divides
    // into 33.33 exactly twice.
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 5; i++) advance(s, 20, c.tick);
    expect(c.calls.length).toBe(3);
  });

  it("runs the same number of ticks at 120fps as at 60fps", () => {
    const a = createLoopState();
    const b = createLoopState();
    const ca = counter();
    const cb = counter();
    for (let i = 0; i < 60; i++) advance(a, 16.6667, ca.tick);
    for (let i = 0; i < 120; i++) advance(b, 8.3333, cb.tick);
    expect(cb.calls.length).toBe(ca.calls.length);
  });

  it("refuses to run a banked backlog after a stall", () => {
    const s = createLoopState();
    const c = counter();
    // Ten seconds of stall. Running 300 ticks would teleport a ball across the
    // screen nine times; the player did not live through that time.
    expect(advance(s, 10_000, c.tick)).toBe(MAX_TICKS_PER_FRAME);
    expect(s.acc).toBe(0);
  });

  it("ignores a delta that is zero, negative or not a number", () => {
    const s = createLoopState();
    const c = counter();
    expect(advance(s, 0, c.tick)).toBe(0);
    expect(advance(s, -50, c.tick)).toBe(0);
    expect(advance(s, Number.NaN, c.tick)).toBe(0);
    expect(s.acc).toBe(0);
    expect(c.calls).toEqual([]);
  });

  it("counts every tick it has ever run", () => {
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 10; i++) advance(s, 33.334, c.tick);
    expect(s.ticks).toBe(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "$WT"
npx vitest run lib/arcade/loop.test.ts
```

Expected: FAIL, `Failed to resolve import "@/lib/arcade/loop"`.

- [ ] **Step 3: Write the loop**

Create `lib/arcade/loop.ts`:

```ts
/**
 * The arcade's clock.
 *
 * The site has exactly one `requestAnimationFrame` loop and it lives in
 * `components/system/SystemProvider.tsx` (AGENTS.md, "One frame clock"). The
 * arcade never starts a second one: it subscribes with `onFrame` and turns the
 * frame deltas it is handed into a whole number of fixed ticks. That is what
 * makes a game a pure function of state and input, drivable in node with no
 * browser, and the same speed on a 60Hz laptop and a 120Hz phone.
 *
 * Thirty a second, and the reason is the grid. A character cell is the smallest
 * thing that can change, so a tick that cannot move anything into a new cell is
 * work nobody can see. At 48 columns one cell a tick crosses the screen in 1.6
 * seconds, which is a Pong ball; slower things count ticks. Worst case a key
 * waits one tick and one frame, about 50ms. Sixty would double the cost for no
 * visible change.
 *
 * Two things the provider already guarantees, which this leans on: it clamps
 * its delta to 64ms, and it does not call subscribers at all while
 * `document.hidden`. So a backgrounded tab pauses the game, banks nothing, and
 * produces no catch-up burst on return. `MAX_TICKS_PER_FRAME` is belt and
 * braces for a caller that is not the provider, and every test is one.
 */

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

/**
 * The most ticks one frame may run. Beyond this the backlog is dropped rather
 * than played: a stall is not time the player lived through, and running it
 * teleports everything on screen.
 */
export const MAX_TICKS_PER_FRAME = 4;

export type LoopState = {
  /** Unspent milliseconds, carried between frames so speed does not drift. */
  acc: number;
  /** Every tick since the loop started. Games seed effects off it. */
  ticks: number;
};

export function createLoopState(): LoopState {
  return { acc: 0, ticks: 0 };
}

/**
 * Advance by one frame. Calls `tick` once per whole timestep, always with
 * `TICK_MS` and never with the frame delta, and returns how many times it did.
 */
export function advance(state: LoopState, dtMs: number, tick: (ms: number) => void): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  state.acc += dtMs;
  let steps = 0;
  while (state.acc >= TICK_MS) {
    if (steps >= MAX_TICKS_PER_FRAME) {
      state.acc = 0;
      break;
    }
    state.acc -= TICK_MS;
    state.ticks++;
    steps++;
    tick(TICK_MS);
  }
  return steps;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$WT"
npx vitest run lib/arcade/loop.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/arcade/loop.ts lib/arcade/loop.test.ts
git commit -m "feat(arcade): a fixed timestep on the one frame clock"
```

---

### Task 4: The grid

**Files:**
- Create: `lib/arcade/grid.ts`
- Create: `lib/arcade/grid.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `GRID_SIZES`, `GRID_SCALES`, `MIN_CELL_PX`, `GridSize`, `GridFit`, `fitGrid`, `blankGrid`, `put`, `write`, `centre`, `toLines`

- [ ] **Step 1: Write the failing test**

Create `lib/arcade/grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  blankGrid, centre, fitGrid, GRID_SCALES, GRID_SIZES, MIN_CELL_PX, put, toLines, write,
} from "@/lib/arcade/grid";

describe("the size ladder", () => {
  it("runs biggest first and ends at the phone size", () => {
    expect(GRID_SIZES[0]).toEqual({ cols: 48, rows: 20 });
    expect(GRID_SIZES[GRID_SIZES.length - 1]).toEqual({ cols: 32, rows: 16 });
  });

  it("never shrinks the type below the point a glyph stops being one", () => {
    expect(MIN_CELL_PX).toBe(6);
    expect(GRID_SCALES[0]).toBe(1);
  });
});

describe("fitGrid", () => {
  // A 16px monospace advance is about 9.6px wide and 20px tall at line-height 1.25.
  const cell = { width: 9.6, height: 20 };

  it("takes the biggest board that fits a desktop terminal", () => {
    expect(fitGrid({ width: 640, height: 460 }, cell)).toEqual({ cols: 48, rows: 20, scale: 1 });
  });

  it("drops a size rather than a scale when the width is the problem", () => {
    // 40 columns need 384px; 48 need 461.
    expect(fitGrid({ width: 400, height: 460 }, cell)).toEqual({ cols: 40, rows: 18, scale: 1 });
  });

  it("shrinks the type only once the smallest board has failed at full size", () => {
    // A 320-wide phone: 32 columns at 15px (9px advance, 18.75px line) need
    // 288 by 300, and the drawer offers about 296 by 288. Width is fine, height
    // is not, so full size is exhausted and nine tenths is the answer.
    const phone = { width: 9, height: 18.75 };
    expect(fitGrid({ width: 296, height: 288 }, phone)).toEqual({ cols: 32, rows: 16, scale: 0.9 });
  });

  it("prefers a smaller board at full size to a bigger one at nine tenths", () => {
    // 48 columns fit at 0.9 (415px) but not at 1 (461px); 40 fit at 1 (384px).
    // Readable type wins, because the board is made of characters.
    expect(fitGrid({ width: 430, height: 460 }, cell)).toEqual({ cols: 40, rows: 18, scale: 1 });
  });

  it("refuses rather than drawing a grid nobody can read", () => {
    expect(fitGrid({ width: 200, height: 120 }, cell)).toBeNull();
  });

  it("refuses when the scale would take the cell under the legibility floor", () => {
    // A 7px cell at 0.8 is 5.6px, under MIN_CELL_PX, so no scale is allowed
    // and the only question left is whether full size fits. It does not.
    expect(fitGrid({ width: 200, height: 400 }, { width: 7, height: 9 })).toBeNull();
  });

  it("refuses a cell it could not have measured", () => {
    expect(fitGrid({ width: 999, height: 999 }, { width: 0, height: 0 })).toBeNull();
    expect(fitGrid({ width: 999, height: 999 }, { width: Number.NaN, height: 20 })).toBeNull();
  });
});

describe("drawing", () => {
  it("starts blank and stays rectangular", () => {
    const g = blankGrid(6, 3);
    expect(toLines(g)).toEqual(["      ", "      ", "      "]);
  });

  it("puts one character where it is told", () => {
    const g = blankGrid(4, 2);
    put(g, 2, 1, "o");
    expect(toLines(g)).toEqual(["    ", "  o "]);
  });

  it("writes a string from a column", () => {
    const g = blankGrid(8, 1);
    write(g, 2, 0, "abc");
    expect(toLines(g)).toEqual(["  abc   "]);
  });

  it("centres a string, rounding left on an odd gap", () => {
    const g = blankGrid(7, 1);
    centre(g, 0, "abcd");
    expect(toLines(g)).toEqual([" abcd  "]);
  });

  it("clips at the edges instead of throwing or growing the grid", () => {
    // A game with an off-by-one should misdraw for one frame, not take the
    // terminal down with it.
    const g = blankGrid(4, 2);
    expect(() => {
      put(g, -1, 0, "x");
      put(g, 9, 0, "x");
      put(g, 0, 5, "x");
      write(g, 3, 0, "abcd");
      write(g, -2, 1, "abcd");
    }).not.toThrow();
    expect(toLines(g)).toEqual(["   a", "cd  "]);
  });

  it("ignores an empty write rather than blanking a cell", () => {
    const g = blankGrid(3, 1);
    write(g, 0, 0, "");
    put(g, 0, 0, "");
    expect(toLines(g)).toEqual(["   "]);
  });

  it("returns exactly rows lines of exactly cols characters", () => {
    const lines = toLines(blankGrid(48, 20));
    expect(lines).toHaveLength(20);
    for (const line of lines) expect(line).toHaveLength(48);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "$WT"
npx vitest run lib/arcade/grid.test.ts
```

Expected: FAIL, `Failed to resolve import "@/lib/arcade/grid"`.

- [ ] **Step 3: Write the grid**

Create `lib/arcade/grid.ts`:

```ts
/**
 * The screen a program draws on: a rectangle of characters, and the rule for
 * how big that rectangle is allowed to be.
 *
 * The size is chosen from the **measured** character cell, never assumed.
 * `components/arcade/ArcadeScreen.tsx` renders a probe of 100 zeroes at the
 * grid's own font and divides `getBoundingClientRect().width` by 100. The rect
 * and not `offsetWidth`: `offsetWidth` rounds to a whole pixel, and at 48
 * columns a half-pixel error is two columns of overflow on a phone.
 *
 * The ladders are walked **scale outermost**, so every board is tried at full
 * size before any type is shrunk: a 40 by 18 board at 16px beats a 48 by 20 at
 * fourteen and a bit, because the board is made of characters and a character
 * has to be readable first. Only when nothing fits at full size does the scale
 * drop, and it never drops below `MIN_CELL_PX`. When nothing fits at all this
 * returns null, the runtime refuses to start the program and says so. It never
 * clips and it never drops rows.
 */

export type GridSize = { cols: number; rows: number };
export type GridFit = { cols: number; rows: number; scale: number };

/** Biggest first. 48 by 20 is the desktop board, 32 by 16 the phone's. */
export const GRID_SIZES: readonly GridSize[] = [
  { cols: 48, rows: 20 },
  { cols: 40, rows: 18 },
  { cols: 32, rows: 16 },
];

/** Multiplies the CSS cell size. Full size first: shrinking type is the last resort. */
export const GRID_SCALES: readonly number[] = [1, 0.9, 0.8];

/** Below this a glyph on a phone is a smudge, and the runtime would rather refuse. */
export const MIN_CELL_PX = 6;

export function fitGrid(
  box: { width: number; height: number },
  cell: { width: number; height: number },
): GridFit | null {
  if (!Number.isFinite(cell.width) || !Number.isFinite(cell.height)) return null;
  if (cell.width <= 0 || cell.height <= 0) return null;
  for (const scale of GRID_SCALES) {
    const w = cell.width * scale;
    const h = cell.height * scale;
    if (w < MIN_CELL_PX) continue;
    for (const size of GRID_SIZES) {
      if (size.cols * w > box.width) continue;
      if (size.rows * h > box.height) continue;
      return { cols: size.cols, rows: size.rows, scale };
    }
  }
  return null;
}

/* ── drawing ─────────────────────────────────────────────────────────────── */

/**
 * Every helper below clips silently at the edges. A game with an off-by-one
 * should misdraw for one frame; it should not throw inside a frame callback,
 * where nothing catches it and the whole terminal goes with it.
 */

export function blankGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
}

export function put(grid: string[][], col: number, row: number, ch: string): void {
  if (ch.length === 0) return;
  const line = grid[row];
  if (!line) return;
  if (col < 0 || col >= line.length) return;
  line[col] = ch[0];
}

export function write(grid: string[][], col: number, row: number, text: string): void {
  for (let i = 0; i < text.length; i++) put(grid, col + i, row, text[i]);
}

export function centre(grid: string[][], row: number, text: string): void {
  const cols = grid[row]?.length ?? 0;
  write(grid, Math.floor((cols - text.length) / 2), row, text);
}

export function toLines(grid: string[][]): string[] {
  return grid.map((line) => line.join(""));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$WT"
npx vitest run lib/arcade/grid.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/arcade/grid.ts lib/arcade/grid.test.ts
git commit -m "feat(arcade): a character grid sized from the measured cell"
```

---

### Task 5: Input, and the page that must not scroll under the player

**Files:**
- Create: `lib/arcade/input.ts`
- Create: `lib/arcade/input.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ArcadeKey`, `KeyMods`, `Gesture`, `Delivery`, `arcadeKey`, `shouldCapture`, `gestureOf`, `deliverGesture`

`ArcadeKey` is the whole vocabulary a game ever sees. Mapping WASD, the arrows and a swipe onto one small set here is most of what makes G1 to G4 cheap: no game re-implements it, and no game has to decide what a phone does.

- [ ] **Step 1: Write the failing test**

Create `lib/arcade/input.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { arcadeKey, deliverGesture, gestureOf, shouldCapture } from "@/lib/arcade/input";

const NO_MODS = { ctrlKey: false, metaKey: false, altKey: false };

describe("arcadeKey", () => {
  it("maps the arrows", () => {
    expect(arcadeKey("ArrowUp", NO_MODS)).toBe("up");
    expect(arcadeKey("ArrowDown", NO_MODS)).toBe("down");
    expect(arcadeKey("ArrowLeft", NO_MODS)).toBe("left");
    expect(arcadeKey("ArrowRight", NO_MODS)).toBe("right");
  });

  it("maps WASD in either case", () => {
    expect(arcadeKey("w", NO_MODS)).toBe("up");
    expect(arcadeKey("W", NO_MODS)).toBe("up");
    expect(arcadeKey("D", NO_MODS)).toBe("right");
  });

  it("maps the space bar to fire and enter to start", () => {
    expect(arcadeKey(" ", NO_MODS)).toBe("fire");
    expect(arcadeKey("Enter", NO_MODS)).toBe("start");
  });

  it("maps the first five digits to themselves, for picking a game", () => {
    expect(arcadeKey("3", NO_MODS)).toBe("3");
    expect(arcadeKey("6", NO_MODS)).toBeNull();
  });

  it("never claims Escape, because the runtime handles it before asking", () => {
    expect(arcadeKey("Escape", NO_MODS)).toBeNull();
  });

  it("lets every modifier chord through to the browser", () => {
    // Cmd+R, Ctrl+L, Alt+ArrowLeft. Swallowing these is how a game traps
    // somebody in a tab.
    expect(arcadeKey("r", { ...NO_MODS, metaKey: true })).toBeNull();
    expect(arcadeKey("ArrowLeft", { ...NO_MODS, altKey: true })).toBeNull();
    expect(arcadeKey(" ", { ...NO_MODS, ctrlKey: true })).toBeNull();
  });

  it("ignores keys nobody mapped", () => {
    expect(arcadeKey("q", NO_MODS)).toBeNull();
    expect(arcadeKey("F5", NO_MODS)).toBeNull();
    expect(arcadeKey("Tab", NO_MODS)).toBeNull();
  });
});

describe("shouldCapture", () => {
  it("captures exactly the keys with a meaning, so the page cannot scroll under the player", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]) {
      expect(shouldCapture(k, NO_MODS), k).toBe(true);
    }
  });

  it("captures nothing else, so Tab still moves focus and F5 still reloads", () => {
    for (const k of ["Tab", "F5", "Escape", "q", "/"]) {
      expect(shouldCapture(k, NO_MODS), k).toBe(false);
    }
  });
});

describe("gestureOf", () => {
  it("reads a short still touch as a tap", () => {
    expect(gestureOf(2, -3, 120)).toEqual({ kind: "tap" });
  });

  it("reads a long drag on one axis as a swipe, with y growing downward", () => {
    expect(gestureOf(60, 5, 200)).toEqual({ kind: "swipe", dir: "right" });
    expect(gestureOf(-60, 5, 200)).toEqual({ kind: "swipe", dir: "left" });
    expect(gestureOf(4, 60, 200)).toEqual({ kind: "swipe", dir: "down" });
    expect(gestureOf(4, -60, 200)).toEqual({ kind: "swipe", dir: "up" });
  });

  it("refuses a diagonal rather than guessing which way it leaned", () => {
    expect(gestureOf(40, 38, 200)).toBeNull();
  });

  it("refuses a slow drag, which is a scroll attempt and not a swipe", () => {
    expect(gestureOf(60, 0, 1500)).toBeNull();
  });

  it("refuses a movement too small to be either", () => {
    expect(gestureOf(15, 0, 400)).toBeNull();
  });
});

describe("deliverGesture", () => {
  it("sends a swipe to a program that wants swipes", () => {
    expect(deliverGesture({ kind: "swipe", dir: "up" }, true)).toEqual({ swipe: "up", press: null });
  });

  it("turns a swipe into a key press for a program that does not, and never both", () => {
    expect(deliverGesture({ kind: "swipe", dir: "up" }, false)).toEqual({ swipe: null, press: "up" });
  });

  it("makes a tap the fire button, which is how a phone plays without a keyboard", () => {
    expect(deliverGesture({ kind: "tap" }, true)).toEqual({ swipe: null, press: "fire" });
  });

  it("delivers nothing for nothing", () => {
    expect(deliverGesture(null, true)).toEqual({ swipe: null, press: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "$WT"
npx vitest run lib/arcade/input.test.ts
```

Expected: FAIL, `Failed to resolve import "@/lib/arcade/input"`.

- [ ] **Step 3: Write the input module**

Create `lib/arcade/input.ts`:

```ts
/**
 * Every input a program will ever see, and the rule for which keys the arcade
 * takes off the page.
 *
 * `ArcadeKey` is the whole vocabulary. Mapping the arrows, WASD, the space bar
 * and a swipe onto one small set here is most of what makes a game plan cheap:
 * no game re-implements it, and no game has to decide what a phone does.
 *
 * Two rules are load-bearing rather than tidy:
 *
 *  - **A modifier chord is never claimed.** Cmd+R, Ctrl+L, Alt+Left. Swallowing
 *    one of those traps somebody in a tab, and a game is not worth that.
 *  - **Only a key with a meaning is captured.** `shouldCapture` is what
 *    `ArcadeScreen` calls before `preventDefault`, so the arrows and the space
 *    bar stop scrolling the page under the player, and Tab still moves focus
 *    out of the game (WCAG 2.1.2, the same rule that shaped the terminal's
 *    Tab handling).
 *
 * Escape is deliberately absent from the map. The runtime handles it before it
 * asks this module anything, because Escape always exits and a program must
 * never be able to hold on to it.
 */

export type ArcadeKey =
  | "up" | "down" | "left" | "right"
  | "fire" | "start" | "pause"
  | "1" | "2" | "3" | "4" | "5";

export type KeyMods = { ctrlKey: boolean; metaKey: boolean; altKey: boolean };

const KEY_MAP: Record<string, ArcadeKey> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  " ": "fire",
  Enter: "start",
  p: "pause",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

export function arcadeKey(key: string, mods: KeyMods): ArcadeKey | null {
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return null;
  const lookup = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[lookup] ?? null;
}

/** Whether this keydown should have its default action prevented. */
export function shouldCapture(key: string, mods: KeyMods): boolean {
  return arcadeKey(key, mods) !== null;
}

/* ── touch ───────────────────────────────────────────────────────────────── */

export const SWIPE_MIN_PX = 24;
export const SWIPE_MAX_MS = 600;
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 300;
/** How much longer the moving axis must be before a drag counts as one direction. */
export const SWIPE_DOMINANCE = 1.5;

export type Gesture =
  | { kind: "swipe"; dir: "up" | "down" | "left" | "right" }
  | { kind: "tap" };

/** `dy` is in screen coordinates, so a positive `dy` is a downward swipe. */
export function gestureOf(dx: number, dy: number, dtMs: number): Gesture | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= TAP_MAX_PX && ay <= TAP_MAX_PX && dtMs <= TAP_MAX_MS) return { kind: "tap" };
  if (dtMs > SWIPE_MAX_MS) return null;
  if (ax >= SWIPE_MIN_PX && ax >= ay * SWIPE_DOMINANCE) {
    return { kind: "swipe", dir: dx > 0 ? "right" : "left" };
  }
  if (ay >= SWIPE_MIN_PX && ay >= ax * SWIPE_DOMINANCE) {
    return { kind: "swipe", dir: dy > 0 ? "down" : "up" };
  }
  return null;
}

export type Delivery = { swipe: "up" | "down" | "left" | "right" | null; press: ArcadeKey | null };

/**
 * How a gesture reaches a program. A program that implements `swipe` gets the
 * swipe; one that does not gets the matching key press instead. Never both: a
 * game that implemented both would turn one flick into two moves.
 */
export function deliverGesture(gesture: Gesture | null, hasSwipe: boolean): Delivery {
  if (!gesture) return { swipe: null, press: null };
  if (gesture.kind === "tap") return { swipe: null, press: "fire" };
  if (hasSwipe) return { swipe: gesture.dir, press: null };
  return { swipe: null, press: gesture.dir };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$WT"
npx vitest run lib/arcade/input.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/arcade/input.ts lib/arcade/input.test.ts
git commit -m "feat(arcade): one key vocabulary for keyboards and thumbs"
```

---

### Task 6: Sound, and the three additions to the frozen program types

**Files:**
- Create: `lib/arcade/sound.ts`
- Create: `lib/arcade/sound.test.ts`
- Modify: `lib/arcade/program.ts`
- Create: `lib/arcade/program.test.ts`

**Interfaces:**
- Consumes: `ArcadeKey` from Task 5
- Produces: `ArcadeSound`, `SoundCall`, `soundFor`, and the amended `ProgramHost`, `ProgramInstance`, `ProgramResult`

- [ ] **Step 1: Write the failing tests**

Create `lib/arcade/sound.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ARCADE_SOUNDS, soundFor } from "@/lib/arcade/sound";

describe("the sound vocabulary", () => {
  it("is exactly five names, so a game plan can list them", () => {
    expect(Object.keys(ARCADE_SOUNDS).sort()).toEqual(["blip", "die", "hit", "score", "wall"]);
  });

  it("names only methods TubeAudio actually has", () => {
    // Checked against lib/audio.ts by hand, and asserted here so a rename
    // there fails a test rather than going quiet on a live page.
    const allowed = new Set(["hover", "key", "relay", "thud", "impact"]);
    for (const call of Object.values(ARCADE_SOUNDS)) expect(allowed.has(call.method), call.method).toBe(true);
  });

  it("makes a wall quieter than a hit", () => {
    const wall = ARCADE_SOUNDS.wall;
    const hit = ARCADE_SOUNDS.hit;
    if (wall.method !== "impact" || hit.method !== "impact") throw new Error("both are impacts");
    expect(wall.energy).toBeLessThan(hit.energy);
  });

  it("keeps every impact energy inside the range impactGain answers to", () => {
    for (const call of Object.values(ARCADE_SOUNDS)) {
      if (call.method !== "impact") continue;
      expect(call.energy).toBeGreaterThan(0.04);
      expect(call.energy).toBeLessThanOrEqual(1);
    }
  });

  it("returns null for a name nobody defined, rather than a silent default", () => {
    expect(soundFor("blip")).toEqual({ method: "hover" });
    expect(soundFor("bleep")).toBeNull();
    expect(soundFor("")).toBeNull();
  });
});
```

Create `lib/arcade/program.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "@/lib/arcade/program";

/**
 * A compile-time fixture as much as a test. G0 widens `exit` and narrows
 * `key`'s first parameter, and both are claimed to be compatible with anything
 * written against F1's shapes. If either claim were wrong, this file would not
 * typecheck, and `npx tsc --noEmit` is part of the CI gate.
 */

/** Written the way F1 froze it: no result parameter, `key` typed as a string. */
const oldStyleHost: ProgramHost = {
  cols: 48,
  rows: 20,
  draw: () => {},
  exit: () => {},
};

const oldStyleInstance: ProgramInstance = {
  tick: (_dtMs: number) => {},
  key: (_key: string, _down: boolean) => {},
  dispose: () => {},
};

describe("the frozen program types", () => {
  it("still accepts a host written before the additions", () => {
    expect(oldStyleHost.cols).toBe(48);
    expect(() => oldStyleHost.exit()).not.toThrow();
  });

  it("still accepts an instance whose key takes a plain string", () => {
    expect(() => oldStyleInstance.key("up", true)).not.toThrow();
  });

  it("lets a host be called with a score", () => {
    let got: number | undefined;
    const host: ProgramHost = { ...oldStyleHost, exit: (result) => { got = result?.score; } };
    host.exit({ score: 12 });
    expect(got).toBe(12);
  });

  it("makes the three additions optional, so nothing has to implement them", () => {
    const spec: ProgramSpec = { id: "x", title: "x", start: () => oldStyleInstance };
    expect(spec.start(oldStyleHost).dispose).toBeTypeOf("function");
    expect(oldStyleHost.flash).toBeUndefined();
    expect(oldStyleHost.run).toBeUndefined();
    expect(oldStyleHost.sound).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run lib/arcade/sound.test.ts lib/arcade/program.test.ts
```

Expected: `sound.test.ts` FAILs with `Failed to resolve import "@/lib/arcade/sound"`; `program.test.ts` FAILs on `oldStyleHost.exit({ score: 12 })`, because `exit` takes no argument yet.

- [ ] **Step 3: Write the sound module**

Create `lib/arcade/sound.ts`:

```ts
/**
 * The five noises a game may ask for, and what each one is on the synth.
 *
 * `lib/audio.ts` synthesises everything from oscillators and shaped noise;
 * there is not one audio file in the repo and there must not be. A game names
 * a feeling, this decides what that is, and `ArcadeScreen` makes the call. Two
 * consequences worth stating:
 *
 *  - A game never touches `TubeAudio` and never reads the sound setting. Every
 *    method on the synth is inert until `enable()` has run inside a gesture,
 *    and `sound off` drops the master gain, so `sound on|off` is respected by
 *    construction. A second opinion about whether sound is on is how the two
 *    drift apart, which is why `ArcadeScreen` is grepped for the absence of
 *    `settings.audio`.
 *  - An unknown name makes no noise and is not a crash. `soundFor` returns
 *    null and the runtime does nothing, which is the right answer for a
 *    mistyped name in a game that is otherwise fine.
 */

export type ArcadeSound = "blip" | "wall" | "hit" | "score" | "die";

export type SoundCall =
  | { method: "hover" }
  | { method: "key" }
  | { method: "relay" }
  | { method: "thud" }
  | { method: "impact"; energy: number };

export const ARCADE_SOUNDS: Record<ArcadeSound, SoundCall> = {
  /** A cursor moving. Deliberately almost subliminal. */
  blip: { method: "hover" },
  /** A ball off a wall. Under a hit, so a rally has a shape. */
  wall: { method: "impact", energy: 0.18 },
  /** A ball off a paddle, a snake eating, a hit landing. */
  hit: { method: "impact", energy: 0.42 },
  /** A point. The relay clunk, because a score is a mechanism moving. */
  score: { method: "relay" },
  /** Game over. */
  die: { method: "thud" },
};

export function soundFor(name: string): SoundCall | null {
  return (ARCADE_SOUNDS as Record<string, SoundCall>)[name] ?? null;
}
```

- [ ] **Step 4: Amend the program types**

In `lib/arcade/program.ts`, replace the whole file with this. The three original type names and every member they had are unchanged; the docblock records what G0 added and why each addition is compatible.

```ts
import type { ArcadeKey } from "./input";
import type { ArcadeSound } from "./sound";

/**
 * What a program (a game, in practice) is allowed to see of the terminal, and
 * what the terminal is allowed to ask of it.
 *
 * Frozen by the toolshed design (section 8): every game plan is written against
 * these names. Add to them if a game needs more; never rename.
 *
 * G0 built the runtime and added, without renaming anything:
 *
 *  - `ProgramResult`, and `exit(result?)`. Widening a method with an optional
 *    parameter is compatible in both directions: `host.exit()` still compiles,
 *    and a host implementing `exit: () => {}` is still assignable, because a
 *    function taking fewer parameters is assignable to one taking more.
 *  - `flash`, so a game can knock the tube. The runtime turns grid coordinates
 *    into a `pushImpact` on the system frame, which is the seam the shader and
 *    the synth already read in the same frame. It is capped at one call a tick
 *    so a game cannot fill `MAX_FRAME_IMPACTS` and starve the physics stage.
 *  - `run`, so the cabinet can hand the screen to the game it launches.
 *  - `key`'s first parameter narrowed from `string` to `ArcadeKey`. Compatible
 *    for the same reason turned round: parameter positions are contravariant,
 *    so an implementation typed `(key: string, ...)` still satisfies it. What
 *    it buys is an exhaustive switch in every game.
 *
 * `lib/arcade/program.test.ts` is the compile-time proof of both claims.
 */

export type ProgramResult = {
  /** Offered to the board when the game has one. Omit and the prompt returns. */
  score?: number;
  /** A short line for the scrollback, in place of the default. */
  label?: string;
};

export type ProgramHost = {
  cols: number;
  rows: number;
  draw(lines: string[]): void;
  sound?(name: ArcadeSound): void;
  flash?(col: number, row: number, energy: number): void;
  run?(spec: ProgramSpec): void;
  exit(result?: ProgramResult): void;
};

export type ProgramInstance = {
  tick(dtMs: number): void;
  key(key: ArcadeKey, down: boolean): void;
  swipe?(dir: "up" | "down" | "left" | "right"): void;
  dispose(): void;
};

export type ProgramSpec = {
  id: string;
  title: string;
  start(host: ProgramHost): ProgramInstance;
};
```

- [ ] **Step 5: Run the tests and the typechecker**

```bash
cd "$WT"
npx vitest run lib/arcade/sound.test.ts lib/arcade/program.test.ts
npx tsc --noEmit
```

Expected: both files PASS (9 tests), `tsc` silent. `tsc` matters more than the assertions here: it is what proves the widening did not break `components/Terminal.tsx`, which still holds F1's `program` branch.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/arcade/sound.ts lib/arcade/sound.test.ts lib/arcade/program.ts lib/arcade/program.test.ts
git commit -m "feat(arcade): five sounds, and three additions to the program contract"
```

---

### Task 7: `bounce`, the worked example, and the game list

**Files:**
- Create: `lib/arcade/bounce.ts`
- Create: `lib/arcade/bounce.test.ts`
- Create: `lib/arcade/games.ts`
- Create: `lib/arcade/games.test.ts`

**Interfaces:**
- Consumes: `blankGrid`, `centre`, `put`, `toLines`, `write` (Task 4), `ArcadeKey` (Task 5), the program types (Task 6), `GAME_TITLES` and `arcadeCopy.bounce` (Task 2)
- Produces: `bounce` (a `ProgramSpec`), `initialBounceState`, `stepBounce`, `steerBounce`, `bounceView`, `BOUNCE_STEP_TICKS`; and `ArcadeGame`, `ARCADE_GAMES`, `BOARD_GAMES`, `findGame`, `isReady`

**`bounce` is kept, not deleted.** It ships in the cabinet as a fifth entry. Three reasons, and the first is the one that decided it: every runtime test in this plan drives `bounce`, so the thing the tests prove and the thing a visitor plays are the same object and cannot drift apart. Second, it gives Task 15's live check something real to run before G1 exists, which is the difference between "the runtime is deployed" and "the runtime works in production". Third, it is the smallest complete example a G1 to G4 implementer can read: a reducer, a view, a spec, and a board, in about eighty lines.

- [ ] **Step 1: Write the failing tests**

Create `lib/arcade/bounce.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BOUNCE_STEP_TICKS, bounce, bounceView, initialBounceState, stepBounce, steerBounce,
} from "@/lib/arcade/bounce";
import type { ProgramHost } from "@/lib/arcade/program";

const COLS = 12;
const ROWS = 6;

/** Run whole steps: the state only moves on every BOUNCE_STEP_TICKS-th tick. */
function steps(state: ReturnType<typeof initialBounceState>, n: number): string[] {
  const hits: string[] = [];
  for (let i = 0; i < n * BOUNCE_STEP_TICKS; i++) hits.push(stepBounce(state, COLS, ROWS));
  return hits.filter((h) => h === "wall");
}

describe("bounce", () => {
  it("starts in the middle, moving down and to the right", () => {
    const s = initialBounceState(COLS, ROWS);
    expect(s).toMatchObject({ x: 6, y: 3, dx: 1, dy: 1, bounces: 0 });
  });

  it("moves one cell every third tick and not before", () => {
    const s = initialBounceState(COLS, ROWS);
    stepBounce(s, COLS, ROWS);
    stepBounce(s, COLS, ROWS);
    expect(s.x).toBe(6);
    stepBounce(s, COLS, ROWS);
    expect(s.x).toBe(7);
  });

  it("turns at a wall instead of leaving the grid", () => {
    const s = initialBounceState(COLS, ROWS);
    for (let i = 0; i < 60 * BOUNCE_STEP_TICKS; i++) {
      stepBounce(s, COLS, ROWS);
      expect(s.x, "x stayed on the grid").toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(COLS);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(ROWS);
    }
    expect(s.bounces).toBeGreaterThan(0);
  });

  it("reports the wall it hit, once, on the step it hit it", () => {
    const s = initialBounceState(COLS, ROWS);
    const hits = steps(s, 40);
    expect(hits.length).toBe(s.bounces);
  });

  it("steers with the four directions and reverses on fire", () => {
    const s = initialBounceState(COLS, ROWS);
    steerBounce(s, "left");
    expect(s.dx).toBe(-1);
    steerBounce(s, "up");
    expect(s.dy).toBe(-1);
    steerBounce(s, "fire");
    expect([s.dx, s.dy]).toEqual([1, 1]);
  });

  it("ignores a key it has no use for", () => {
    const s = initialBounceState(COLS, ROWS);
    const before = { ...s };
    steerBounce(s, "pause");
    steerBounce(s, "3");
    expect(s).toMatchObject(before);
  });

  it("draws a rectangle with the glyph where the state says", () => {
    const s = initialBounceState(COLS, ROWS);
    const lines = bounceView(s, COLS, ROWS);
    expect(lines).toHaveLength(ROWS);
    for (const line of lines) expect(line).toHaveLength(COLS);
    expect(lines[3][6]).toBe("O");
  });
});

describe("bounce as a program", () => {
  function fakeHost(): { host: ProgramHost; drawn: string[][]; sounds: string[]; result: { got?: unknown } } {
    const drawn: string[][] = [];
    const sounds: string[] = [];
    const result: { got?: unknown } = {};
    return {
      drawn,
      sounds,
      result,
      host: {
        cols: COLS,
        rows: ROWS,
        draw: (lines) => drawn.push(lines),
        sound: (name) => sounds.push(name),
        flash: () => {},
        exit: (r) => {
          result.got = r ?? null;
        },
      },
    };
  }

  it("draws on the first tick, so the screen is never blank", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    p.tick(33.334);
    expect(f.drawn.length).toBeGreaterThan(0);
    p.dispose();
  });

  it("clicks the tube when it hits a wall", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    for (let i = 0; i < 200; i++) p.tick(33.334);
    expect(f.sounds).toContain("wall");
    p.dispose();
  });

  it("hands its bounces to the board on the way out", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    for (let i = 0; i < 200; i++) p.tick(33.334);
    p.key("start", true);
    expect(f.result.got).toMatchObject({ score: expect.any(Number) });
    p.dispose();
  });

  it("says who it is", () => {
    expect(bounce.id).toBe("bounce");
    expect(bounce.title.length).toBeGreaterThan(0);
  });
});
```

Create `lib/arcade/games.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ARCADE_GAMES, BOARD_GAMES, findGame, isReady } from "@/lib/arcade/games";
import { GAME_TITLES } from "@/content/arcade";

describe("the game list", () => {
  it("holds the four games the design names, plus the worked example", () => {
    expect(ARCADE_GAMES.map((g) => g.id)).toEqual(["bounce", "poker", "pong", "snake", "under"]);
  });

  it("stays alphabetical by id, so two game pull requests rarely collide", () => {
    const ids = ARCADE_GAMES.map((g) => g.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("gives every game an id a command argument and a Redis key can both carry", () => {
    for (const g of ARCADE_GAMES) expect(g.id, g.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("takes every title from content, never from code", () => {
    for (const g of ARCADE_GAMES) expect(g.title).toBe(GAME_TITLES[g.id]);
  });

  it("has exactly one game ready today, and it is the worked example", () => {
    expect(ARCADE_GAMES.filter(isReady).map((g) => g.id)).toEqual(["bounce"]);
  });

  it("gives every game a board, because every game plan wants one", () => {
    expect(BOARD_GAMES).toEqual(ARCADE_GAMES.map((g) => g.id));
  });

  it("finds a game by id and nothing by a name nobody registered", () => {
    expect(findGame("pong")?.title).toBe(GAME_TITLES.pong);
    expect(findGame("tetris")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run lib/arcade/bounce.test.ts lib/arcade/games.test.ts
```

Expected: both FAIL on unresolved imports.

- [ ] **Step 3: Write `bounce`**

Create `lib/arcade/bounce.ts`:

```ts
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { blankGrid, centre, put, toLines, write } from "./grid";
import type { ArcadeKey } from "./input";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "./program";

/**
 * The worked example, and the runtime's own test rig.
 *
 * It does one thing: a character crosses the grid and turns at the walls. The
 * arrows and a swipe steer it, fire reverses it, every wall knocks the tube,
 * and `start` cashes the bounces in at the board. It is not a game and it is
 * not pretending to be one.
 *
 * It is kept rather than deleted once the runtime is proven. Every runtime test
 * drives this object, so what the tests prove and what a visitor plays cannot
 * drift apart; it gives the post-deploy check something real to run before G1
 * exists; and it is the smallest complete example a game plan can read, which
 * is the whole shape: a reducer, a view, a spec.
 */

/** One cell every third tick, which is ten cells a second at 30Hz. */
export const BOUNCE_STEP_TICKS = 3;
export const BOUNCE_GLYPH = "O";

export type BounceState = {
  x: number;
  y: number;
  dx: -1 | 1;
  dy: -1 | 1;
  bounces: number;
  ticks: number;
};

export function initialBounceState(cols: number, rows: number): BounceState {
  return { x: Math.floor(cols / 2), y: Math.floor(rows / 2), dx: 1, dy: 1, bounces: 0, ticks: 0 };
}

/**
 * One tick. Mutates in place, the way `advance` does, and returns whether this
 * tick hit a wall so the host can flash and click on the same frame.
 */
export function stepBounce(state: BounceState, cols: number, rows: number): "none" | "wall" {
  state.ticks++;
  if (state.ticks % BOUNCE_STEP_TICKS !== 0) return "none";
  let hit = false;
  if (state.x + state.dx < 0 || state.x + state.dx >= cols) {
    state.dx = state.dx === 1 ? -1 : 1;
    hit = true;
  }
  if (state.y + state.dy < 0 || state.y + state.dy >= rows) {
    state.dy = state.dy === 1 ? -1 : 1;
    hit = true;
  }
  state.x += state.dx;
  state.y += state.dy;
  if (hit) state.bounces++;
  return hit ? "wall" : "none";
}

export function steerBounce(state: BounceState, key: ArcadeKey): BounceState {
  switch (key) {
    case "up":
      state.dy = -1;
      break;
    case "down":
      state.dy = 1;
      break;
    case "left":
      state.dx = -1;
      break;
    case "right":
      state.dx = 1;
      break;
    case "fire":
      state.dx = state.dx === 1 ? -1 : 1;
      state.dy = state.dy === 1 ? -1 : 1;
      break;
    default:
      break;
  }
  return state;
}

export function bounceView(state: BounceState, cols: number, rows: number): string[] {
  const grid = blankGrid(cols, rows);
  write(grid, 0, 0, `${arcadeCopy.bounce.score} ${state.bounces}`);
  put(grid, state.x, state.y, BOUNCE_GLYPH);
  centre(grid, rows - 1, arcadeCopy.bounce.footer);
  return toLines(grid);
}

export const bounce: ProgramSpec = {
  id: "bounce",
  title: GAME_TITLES.bounce,
  start(host: ProgramHost): ProgramInstance {
    const state = initialBounceState(host.cols, host.rows);
    const render = () => host.draw(bounceView(state, host.cols, host.rows));
    render();
    return {
      tick() {
        if (stepBounce(state, host.cols, host.rows) === "wall") {
          host.sound?.("wall");
          host.flash?.(state.x, state.y, 0.3);
        }
        render();
      },
      key(key, down) {
        if (!down) return;
        if (key === "start") {
          host.exit({ score: state.bounces });
          return;
        }
        steerBounce(state, key);
        render();
      },
      swipe(dir) {
        steerBounce(state, dir);
        render();
      },
      dispose() {
        /* nothing to release: no timers, no listeners, no buffers */
      },
    };
  },
};
```

- [ ] **Step 4: Write the game list**

Create `lib/arcade/games.ts`:

```ts
import { GAME_TITLES } from "@/content/arcade";
import { bounce } from "./bounce";
import type { ProgramSpec } from "./program";

/**
 * Every game the cabinet knows about.
 *
 * **This is the file a game plan edits, and it edits two lines: an import and
 * an entry.** G1 adds `import { pong } from "./pong";` and swaps `spec: null`
 * for `spec: pong` on the `pong` row. Nothing else in the runtime, the
 * terminal, the stylesheet or the route changes when a game arrives.
 *
 * The list is alphabetical by id for the same reason `lib/commands/index.ts`
 * is: four game branches will be open at once and two pull requests that touch
 * different lines merge without a conflict.
 *
 * `spec: null` is the whole "not built yet" mechanism. There is no status
 * field to forget to update, because the field would be derivable from the
 * spec and a derivable field is a field that goes stale.
 */

export type ArcadeGame = {
  id: string;
  title: string;
  spec: ProgramSpec | null;
  /** Whether a score from this game is offered to the initials board. */
  board: boolean;
};

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  { id: "bounce", title: GAME_TITLES.bounce, spec: bounce, board: true },
  { id: "poker", title: GAME_TITLES.poker, spec: null, board: true },
  { id: "pong", title: GAME_TITLES.pong, spec: null, board: true },
  { id: "snake", title: GAME_TITLES.snake, spec: null, board: true },
  { id: "under", title: GAME_TITLES.under, spec: null, board: true },
];

export function isReady(game: ArcadeGame): boolean {
  return game.spec !== null;
}

export function findGame(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}

/** The games with a board, which is what `api/board` and `neofetch` iterate. */
export const BOARD_GAMES: readonly string[] = ARCADE_GAMES.filter((g) => g.board).map((g) => g.id);
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "$WT"
npx vitest run lib/arcade/bounce.test.ts lib/arcade/games.test.ts
npx tsc --noEmit
```

Expected: PASS, 18 tests, `tsc` silent.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/arcade/bounce.ts lib/arcade/bounce.test.ts lib/arcade/games.ts lib/arcade/games.test.ts
git commit -m "feat(arcade): a bouncing character, and the list a game plan edits"
```

---

### Task 8: The board: three characters, a score, and no Redis

**Files:**
- Create: `lib/arcade/board.ts`, `lib/arcade/board.test.ts`
- Create: `lib/arcade/board-store.ts`, `lib/arcade/board-store.test.ts`
- Create: `lib/arcade/board-client.ts`, `lib/arcade/board-client.test.ts`
- Create: `lib/arcade/session.ts`, `lib/arcade/session.test.ts`

**Interfaces:**
- Consumes: `BLOCKED_INITIALS` and `arcadeCopy` (Task 2)
- Produces: everything in the board half of the frozen block

Nothing in this task imports `lib/store/` or `lib/budget.ts`. `BoardRedis` is a structural type with the three methods used, so a hand-written fake satisfies it and so does the real Upstash client when F4 lands.

- [ ] **Step 1: Write the failing tests**

Create `lib/arcade/board.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BOARD_SIZE, checkInitials, foldLeet, formatBoard, formatBoards, groupDigits,
  insertScore, normaliseInitials,
} from "@/lib/arcade/board";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";

describe("normaliseInitials", () => {
  it("uppercases and drops everything outside the alphabet", () => {
    expect(normaliseInitials("f o r")).toBe("FOR");
    expect(normaliseInitials("a-b!c")).toBe("ABC");
  });

  it("keeps digits, which are part of the alphabet", () => {
    expect(normaliseInitials("f0r")).toBe("F0R");
  });
});

describe("foldLeet", () => {
  it("rewrites the seven digits that stand in for letters", () => {
    expect(foldLeet("F4G")).toBe("FAG");
    expect(foldLeet("N1G")).toBe("NIG");
    expect(foldLeet("4SS")).toBe("ASS");
    expect(foldLeet("5H7")).toBe("SHT");
  });

  it("leaves 2, 6 and 9 alone, because they stand in for nothing", () => {
    expect(foldLeet("269")).toBe("269");
  });
});

describe("checkInitials", () => {
  it("accepts three characters and hands back the unfolded form", () => {
    expect(checkInitials("for")).toEqual({ ok: true, initials: "FOR" });
    expect(checkInitials("F0R")).toEqual({ ok: true, initials: "F0R" });
  });

  it("refuses a length that is not three, and says which rule it broke", () => {
    expect(checkInitials("ab")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
    expect(checkInitials("abcd")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
    expect(checkInitials("")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
  });

  it("truncates nothing, because deciding somebody's initials for them is worse than refusing", () => {
    expect(checkInitials("fergus").ok).toBe(false);
  });

  it("refuses the blocklist", () => {
    expect(checkInitials("ass").ok).toBe(false);
    expect(checkInitials("KKK")).toEqual({ ok: false, reason: arcadeCopy.initials.blocked });
  });

  it("refuses the blocklist through the leet fold, which is the whole point of the fold", () => {
    expect(checkInitials("4ss").ok).toBe(false);
    expect(checkInitials("N1G").ok).toBe(false);
    expect(checkInitials("5H7").ok).toBe(false);
  });

  it("matches exactly, never as a substring, so an innocent three stays innocent", () => {
    // "CNT" is blocked. "CAN", "TAN" and "NCT" are not, and a substring rule on
    // a three-character string would be an exact rule with a wider blast radius.
    for (const ok of ["CAN", "TAN", "NCT", "BUM", "GIT"]) {
      expect(checkInitials(ok).ok, ok).toBe(true);
    }
  });
});

describe("insertScore", () => {
  it("sorts by score, highest first", () => {
    const rows = insertScore([{ initials: "AAA", score: 10 }], { initials: "BBB", score: 20 });
    expect(rows.map((r) => r.initials)).toEqual(["BBB", "AAA"]);
  });

  it("keeps only the top twenty", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ initials: "AAA", score: i }));
    expect(insertScore(many, { initials: "ZZZ", score: 100 })).toHaveLength(BOARD_SIZE);
  });

  it("drops the lowest, not the newest", () => {
    const many = Array.from({ length: BOARD_SIZE }, (_, i) => ({ initials: "AAA", score: i + 10 }));
    const rows = insertScore(many, { initials: "ZZZ", score: 500 });
    expect(rows[0]).toEqual({ initials: "ZZZ", score: 500 });
    expect(rows.some((r) => r.score === 10)).toBe(false);
  });

  it("lets whoever got there first keep the rank on a tie", () => {
    const rows = insertScore([{ initials: "OLD", score: 50 }], { initials: "NEW", score: 50 });
    expect(rows.map((r) => r.initials)).toEqual(["OLD", "NEW"]);
  });

  it("does not modify the array it was given", () => {
    const original = [{ initials: "AAA", score: 1 }];
    insertScore(original, { initials: "BBB", score: 2 });
    expect(original).toHaveLength(1);
  });
});

describe("groupDigits", () => {
  it("groups in threes without asking the platform", () => {
    // Never toLocaleString: node and a browser can pick different separators,
    // and the board would then print differently on the server and the client.
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1,000");
    expect(groupDigits(1234567)).toBe("1,234,567");
  });

  it("floors and refuses to print a negative", () => {
    expect(groupDigits(12.9)).toBe("12");
    expect(groupDigits(-5)).toBe("0");
  });
});

describe("formatBoard", () => {
  const board = { game: "pong", rows: [{ initials: "FOR", score: 4200 }, { initials: "CKK", score: 910 }] };

  it("fits the narrowest grid, every line", () => {
    for (const line of formatBoard(board, 32, GAME_TITLES.pong)) {
      expect(line.length, line).toBeLessThanOrEqual(32);
    }
  });

  it("ranks, names and right-aligns the score", () => {
    const lines = formatBoard(board, 24, GAME_TITLES.pong);
    expect(lines[0]).toBe(GAME_TITLES.pong);
    expect(lines[1]).toBe(" 1  FOR          4,200");
    expect(lines[2]).toBe(" 2  CKK            910");
  });

  it("says the board is empty rather than printing a heading over nothing", () => {
    const lines = formatBoard({ game: "pong", rows: [] }, 32, GAME_TITLES.pong);
    expect(lines[1]).toContain(arcadeCopy.board.empty);
  });
});

describe("formatBoards", () => {
  it("says so, in a sentence, when there is no board to print", () => {
    const lines = formatBoards({ available: false, boards: [] }, 32, GAME_TITLES);
    expect(lines).toEqual([...arcadeCopy.board.unavailable]);
  });

  it("treats never having asked the same as having been told no", () => {
    expect(formatBoards(null, 32, GAME_TITLES)).toEqual([...arcadeCopy.board.unavailable]);
  });

  it("prints one block per game that has any scores", () => {
    const snapshot = {
      available: true,
      boards: [
        { game: "pong", rows: [{ initials: "FOR", score: 10 }] },
        { game: "snake", rows: [] },
      ],
    };
    const lines = formatBoards(snapshot, 32, GAME_TITLES);
    expect(lines.join("\n")).toContain(GAME_TITLES.pong);
    expect(lines.join("\n")).not.toContain(GAME_TITLES.snake);
  });

  it("says the same empty sentence when every game is empty", () => {
    const snapshot = { available: true, boards: [{ game: "pong", rows: [] }] };
    expect(formatBoards(snapshot, 32, GAME_TITLES)).toEqual([arcadeCopy.board.empty]);
  });
});
```

Create `lib/arcade/board-store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BOARD_SIZE } from "@/lib/arcade/board";
import { boardKey, parseZrange, readBoards, writeScore } from "@/lib/arcade/board-store";
import type { BoardRedis } from "@/lib/arcade/board-store";

function fakeRedis(data: Record<string, (string | number)[]> = {}) {
  const calls: string[] = [];
  const redis: BoardRedis = {
    zadd: async (key, entry) => {
      calls.push(`zadd ${key} ${entry.score} ${entry.member}`);
    },
    zrange: async (key) => data[key] ?? [],
    zremrangebyrank: async (key, start, stop) => {
      calls.push(`trim ${key} ${start} ${stop}`);
    },
  };
  return { redis, calls };
}

describe("the key", () => {
  it("is namespaced, so nothing else in the database can collide with it", () => {
    expect(boardKey("pong")).toBe("arcade:board:pong");
  });
});

describe("parseZrange", () => {
  it("reads the flat member, score, member, score array Upstash returns", () => {
    expect(parseZrange(["FOR#a1b2c3d4", 4200, "CKK#deadbeef", 910])).toEqual([
      { initials: "FOR", score: 4200 },
      { initials: "CKK", score: 910 },
    ]);
  });

  it("takes the score as a number even when the transport made it a string", () => {
    expect(parseZrange(["FOR#a1b2c3d4", "4200"])).toEqual([{ initials: "FOR", score: 4200 }]);
  });

  it("skips a row it cannot read rather than putting NaN on the board", () => {
    expect(parseZrange(["FOR#x", "not a number", "TOOLONG#x", 5, "CKK#x", 10])).toEqual([
      { initials: "CKK", score: 10 },
    ]);
  });

  it("survives an odd-length array", () => {
    expect(parseZrange(["FOR#x"])).toEqual([]);
  });
});

describe("readBoards", () => {
  it("asks for the top twenty of each game, highest first", () => {
    const seen: unknown[] = [];
    const redis: BoardRedis = {
      zadd: async () => {},
      zrange: async (key, start, stop, opts) => {
        seen.push([key, start, stop, opts]);
        return [];
      },
      zremrangebyrank: async () => {},
    };
    return readBoards(redis, ["pong"]).then(() => {
      expect(seen[0]).toEqual(["arcade:board:pong", 0, BOARD_SIZE - 1, { rev: true, withScores: true }]);
    });
  });

  it("returns one board per game, in the order asked", async () => {
    const { redis } = fakeRedis({ "arcade:board:pong": ["FOR#x", 1] });
    const boards = await readBoards(redis, ["pong", "snake"]);
    expect(boards.map((b) => b.game)).toEqual(["pong", "snake"]);
    expect(boards[1].rows).toEqual([]);
  });
});

describe("writeScore", () => {
  it("adds the entry then trims everything below the top twenty", async () => {
    const { redis, calls } = fakeRedis();
    await writeScore(redis, "pong", "FOR", 4200, "a1b2c3d4");
    expect(calls).toEqual([
      "zadd arcade:board:pong 4200 FOR#a1b2c3d4",
      `trim arcade:board:pong 0 ${-(BOARD_SIZE + 1)}`,
    ]);
  });
});
```

Create `lib/arcade/board-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchBoards, readSnapshot, submitScore } from "@/lib/arcade/board-client";
import { arcadeCopy } from "@/content/arcade";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("readSnapshot", () => {
  it("accepts a well-formed available snapshot", () => {
    const body = { available: true, boards: [{ game: "pong", rows: [{ initials: "FOR", score: 10 }] }] };
    expect(readSnapshot(body)).toEqual(body);
  });

  it("treats anything it does not recognise as unavailable", () => {
    for (const body of [null, 42, "boards", {}, { available: true }, { available: true, boards: {} }]) {
      expect(readSnapshot(body).available, JSON.stringify(body)).toBe(false);
    }
  });

  it("drops a row it cannot trust rather than rendering it", () => {
    const body = {
      available: true,
      boards: [{ game: "pong", rows: [{ initials: "FOR", score: 10 }, { initials: "TOOLONG", score: 1 }, { initials: "CKK", score: "x" }] }],
    };
    expect(readSnapshot(body).boards[0].rows).toEqual([{ initials: "FOR", score: 10 }]);
  });
});

describe("fetchBoards", () => {
  it("returns the boards when the route answers properly", async () => {
    const body = { available: true, boards: [{ game: "pong", rows: [] }] };
    const snapshot = await fetchBoards(async () => jsonResponse(body));
    expect(snapshot.available).toBe(true);
  });

  it("says unavailable when the route is not there at all, which is today", async () => {
    // F4 is unmerged, so `app/api/board` may not exist. A 404 has to read the
    // same as a store that is missing, or the arcade breaks on the way to it.
    const snapshot = await fetchBoards(async () => new Response("Not found", { status: 404 }));
    expect(snapshot).toMatchObject({ available: false, boards: [] });
  });

  it("says unavailable when the store is missing behind a 200", async () => {
    const snapshot = await fetchBoards(async () => jsonResponse({ available: false, boards: [] }));
    expect(snapshot.available).toBe(false);
  });

  it("says unavailable when the network throws, and never rethrows", async () => {
    const snapshot = await fetchBoards(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(snapshot.available).toBe(false);
  });

  it("says unavailable when the body is not JSON", async () => {
    const snapshot = await fetchBoards(async () => new Response("<!doctype html>", { status: 200 }));
    expect(snapshot.available).toBe(false);
  });
});

describe("submitScore", () => {
  it("refuses locally before it sends anything, so the visitor sees why", async () => {
    let called = false;
    const result = await submitScore({ game: "pong", initials: "KKK", score: 10 }, async () => {
      called = true;
      return jsonResponse({});
    });
    expect(called).toBe(false);
    expect(result).toEqual({ ok: false, reason: arcadeCopy.initials.blocked });
  });

  it("posts the cleaned initials and a whole score", async () => {
    let sent: unknown = null;
    await submitScore({ game: "pong", initials: " f o r ", score: 42.7 }, async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body));
      return jsonResponse({ ok: true, board: { game: "pong", rows: [] } });
    });
    expect(sent).toEqual({ game: "pong", initials: "FOR", score: 42 });
  });

  it("hands back the board the server returned", async () => {
    const board = { game: "pong", rows: [{ initials: "FOR", score: 42 }] };
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ ok: true, board }));
    expect(result).toEqual({ ok: true, board });
  });

  it("passes the server's own sentence through when it refuses", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ reason: "three a day is the limit. try tomorrow." }, 429));
    expect(result).toEqual({ ok: false, reason: "three a day is the limit. try tomorrow." });
  });

  it("refuses to print a server sentence long enough to break the grid", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ reason: "x".repeat(400) }, 429));
    expect(result).toEqual({ ok: false, reason: arcadeCopy.initials.refused });
  });

  it("never throws, whatever the network does", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 1 }, async () => {
      throw new Error("offline");
    });
    expect(result.ok).toBe(false);
  });
});
```

Create `lib/arcade/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  arcadeSession, INITIALS_KEY, loadInitials, markArcadeSeen, resetArcadeSession,
  saveInitials, setArcadeBoards,
} from "@/lib/arcade/session";
import { OWNED_PREFIX, isOwnedKey } from "@/lib/forget";

beforeEach(() => resetArcadeSession());

describe("the session", () => {
  it("starts with the door unfound and no boards", () => {
    expect(arcadeSession()).toEqual({ seen: false, boards: null });
  });

  it("remembers that the door was opened", () => {
    markArcadeSeen();
    expect(arcadeSession().seen).toBe(true);
  });

  it("holds the last snapshot the client fetched", () => {
    setArcadeBoards({ available: true, boards: [] });
    expect(arcadeSession().boards).toEqual({ available: true, boards: [] });
  });
});

describe("the one key the arcade may write", () => {
  it("is under the prefix forget already wipes, so forget needs no change", () => {
    expect(INITIALS_KEY.startsWith(OWNED_PREFIX)).toBe(true);
    expect(isOwnedKey(INITIALS_KEY)).toBe(true);
  });

  it("round-trips three characters", () => {
    const store = new Map<string, string>();
    saveInitials({ setItem: (k, v) => void store.set(k, v) }, "FOR");
    expect(store.get(INITIALS_KEY)).toBe("FOR");
    expect(loadInitials({ getItem: (k) => store.get(k) ?? null })).toBe("FOR");
  });

  it("writes nothing for initials that would never have been accepted", () => {
    const store = new Map<string, string>();
    saveInitials({ setItem: (k, v) => void store.set(k, v) }, "no");
    expect(store.size).toBe(0);
  });

  it("reads a missing, malformed or hostile value as nothing saved", () => {
    expect(loadInitials({ getItem: () => null })).toBeNull();
    expect(loadInitials({ getItem: () => "" })).toBeNull();
    expect(loadInitials({ getItem: () => "a very long string" })).toBeNull();
  });

  it("survives storage that throws, because private mode does", () => {
    expect(() => saveInitials({ setItem: () => { throw new Error("quota"); } }, "FOR")).not.toThrow();
    expect(loadInitials({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run lib/arcade/board.test.ts lib/arcade/board-store.test.ts lib/arcade/board-client.test.ts lib/arcade/session.test.ts
```

Expected: four files FAIL on unresolved imports.

- [ ] **Step 3: Write `lib/arcade/board.ts`**

```ts
import { arcadeCopy, BLOCKED_INITIALS } from "@/content/arcade";

/**
 * The board: three characters and a number, and every rule about both.
 *
 * Anonymous by construction, which is what the constitution in AGENTS.md
 * requires of anything the site keeps on a server. There is no name, no
 * address, no identifier and nothing to join on. F4's budget hashes the
 * visitor's address with a daily salt and this never sees it.
 *
 * The initials rule, in full:
 *
 *  1. uppercase and drop anything outside `INITIALS_ALPHABET`;
 *  2. require exactly three characters left. Truncating "fergus" to "FER" is
 *     the site deciding somebody's initials for them, which is worse than
 *     refusing with a sentence;
 *  3. fold the digits that stand in for letters, so 4SS is ASS;
 *  4. refuse by **exact match** against `BLOCKED_INITIALS`, never substring. On
 *     a three-character string a substring rule is an exact rule with a wider
 *     false-positive surface and nothing to show for it;
 *  5. store the **unfolded** form, so a visitor who typed F0R sees F0R.
 *
 * The blocklist lives in `content/arcade.ts` and is reviewed like copy, because
 * that is what it is.
 */

export const INITIALS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const INITIALS_LENGTH = 3;
export const BOARD_SIZE = 20;

export type BoardRow = { initials: string; score: number };
export type Board = { game: string; rows: BoardRow[] };
export type BoardSnapshot = { available: boolean; boards: Board[]; note?: string };
export type InitialsCheck = { ok: true; initials: string } | { ok: false; reason: string };

const LEET: Record<string, string> = {
  "0": "O",
  "1": "I",
  "3": "E",
  "4": "A",
  "5": "S",
  "7": "T",
  "8": "B",
};

export function normaliseInitials(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => INITIALS_ALPHABET.includes(c)).join("");
}

export function foldLeet(initials: string): string {
  return [...initials].map((c) => LEET[c] ?? c).join("");
}

export function checkInitials(raw: string): InitialsCheck {
  const cleaned = normaliseInitials(raw);
  if (cleaned.length !== INITIALS_LENGTH) return { ok: false, reason: arcadeCopy.initials.shape };
  const folded = foldLeet(cleaned);
  if (BLOCKED_INITIALS.has(folded)) return { ok: false, reason: arcadeCopy.initials.blocked };
  return { ok: true, initials: cleaned };
}

/**
 * The new row folded into the board. `sort` is stable in every runtime this
 * ships to, so on a tie whoever got there first keeps the higher rank.
 */
export function insertScore(rows: readonly BoardRow[], row: BoardRow, size = BOARD_SIZE): BoardRow[] {
  return [...rows, row].sort((a, b) => b.score - a.score).slice(0, size);
}

/** Thousands separators without asking the platform, which does not always agree with itself. */
export function groupDigits(n: number): string {
  const whole = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const digits = String(whole);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

/** Rank, initials, right-aligned score. Two spaces between each, nine columns of prefix. */
export function formatBoard(board: Board, width: number, title: string): string[] {
  if (board.rows.length === 0) return [title, `  ${arcadeCopy.board.empty}`];
  const scoreWidth = Math.max(3, width - 9);
  return [
    title,
    ...board.rows.map((row, i) => {
      const rank = String(i + 1).padStart(2);
      return `${rank}  ${row.initials}  ${groupDigits(row.score).padStart(scoreWidth)}`;
    }),
  ];
}

/**
 * Every board with anything on it. A snapshot that is missing, or that says it
 * is unavailable, prints the sentence instead: never a blank space where a
 * board should be, per the rule that nothing on this site fails silently.
 */
export function formatBoards(
  snapshot: BoardSnapshot | null,
  width: number,
  titles: Record<string, string>,
): string[] {
  if (!snapshot || !snapshot.available) return [...arcadeCopy.board.unavailable];
  const withScores = snapshot.boards.filter((b) => b.rows.length > 0);
  if (withScores.length === 0) return [arcadeCopy.board.empty];
  return withScores.flatMap((board, i) => {
    const block = formatBoard(board, width, titles[board.game] ?? board.game);
    return i === 0 ? block : ["", ...block];
  });
}
```

- [ ] **Step 4: Write `lib/arcade/board-store.ts`**

```ts
import { BOARD_SIZE, INITIALS_LENGTH } from "./board";
import type { Board, BoardRow } from "./board";

/**
 * The board's shape in Redis, over an **injected** client.
 *
 * Nothing here imports `lib/store/redis.ts`. That is not tidiness: F4 is
 * unmerged and Upstash is not provisioned, so a static import would stop this
 * whole sub-project compiling. `BoardRedis` is structural, so a hand-written
 * fake satisfies it in tests and the real Upstash client satisfies it in
 * `app/api/board/route.ts`, which is the only file that knows the store exists.
 *
 * One sorted set per game, member `<initials>#<nonce>`, score the score. The
 * nonce is there because two people may both be FOR and a sorted set holds one
 * of each member. `#` is safe as the separator because it is not in
 * `INITIALS_ALPHABET` and never can be.
 *
 * Five games times twenty rows is a hundred members, which is nothing against
 * a 256 MB free tier. The cost that matters is commands, so a read is one call
 * per game and a write is two.
 */

export type BoardRedis = {
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>;
  zrange(
    key: string,
    start: number,
    stop: number,
    opts: { rev: true; withScores: true },
  ): Promise<(string | number)[]>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
};

export function boardKey(game: string): string {
  return `arcade:board:${game}`;
}

/** Upstash returns member, score, member, score. A row it cannot read is dropped, never guessed at. */
export function parseZrange(flat: readonly (string | number)[]): BoardRow[] {
  const rows: BoardRow[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const initials = String(flat[i]).split("#")[0];
    const score = Number(flat[i + 1]);
    if (initials.length !== INITIALS_LENGTH) continue;
    if (!Number.isFinite(score)) continue;
    rows.push({ initials, score });
  }
  return rows;
}

export async function readBoards(redis: BoardRedis, games: readonly string[]): Promise<Board[]> {
  const boards: Board[] = [];
  for (const game of games) {
    const flat = await redis.zrange(boardKey(game), 0, BOARD_SIZE - 1, { rev: true, withScores: true });
    boards.push({ game, rows: parseZrange(flat) });
  }
  return boards;
}

/**
 * Add, then trim. Rank 0 is the lowest score in a sorted set, so removing
 * ranks 0 to -(BOARD_SIZE + 1) keeps exactly the top twenty and bounds the key
 * whatever anyone does to it.
 */
export async function writeScore(
  redis: BoardRedis,
  game: string,
  initials: string,
  score: number,
  nonce: string,
): Promise<void> {
  const key = boardKey(game);
  await redis.zadd(key, { score, member: `${initials}#${nonce}` });
  await redis.zremrangebyrank(key, 0, -(BOARD_SIZE + 1));
}
```

- [ ] **Step 5: Write `lib/arcade/board-client.ts`**

```ts
import { arcadeCopy } from "@/content/arcade";
import { checkInitials, INITIALS_LENGTH } from "./board";
import type { Board, BoardRow, BoardSnapshot } from "./board";

/**
 * The browser's half of the board, and the file that makes "there is no Redis"
 * a sentence rather than a crash.
 *
 * **Everything that is not a well-formed available snapshot is unavailable.** A
 * 404 because `app/api/board` is not deployed yet, a 500 because the store
 * threw, a 200 carrying `available: false` because `getRedis` threw
 * `StoreUnavailableError`, an HTML error page from a proxy, a network failure
 * on a train: one answer, one sentence, and the games still play. That is the
 * whole contract, and it is why G0 can ship before F4.
 *
 * Nothing here trusts the shape of what came back. The board is drawn into a
 * fixed grid, so a row with seven-character initials or a NaN score is not a
 * cosmetic problem, it is a broken screen.
 */

export type SubmitResult = { ok: true; board: Board } | { ok: false; reason: string };

const UNAVAILABLE: BoardSnapshot = { available: false, boards: [], note: arcadeCopy.board.unavailable[0] };

/** Longer than this cannot be drawn on the narrowest grid, so it is not shown. */
const MAX_SERVER_REASON = 60;

function readRow(value: unknown): BoardRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as { initials?: unknown; score?: unknown };
  if (typeof row.initials !== "string" || row.initials.length !== INITIALS_LENGTH) return null;
  if (typeof row.score !== "number" || !Number.isFinite(row.score)) return null;
  return { initials: row.initials, score: row.score };
}

function readBoard(value: unknown): Board | null {
  if (typeof value !== "object" || value === null) return null;
  const board = value as { game?: unknown; rows?: unknown };
  if (typeof board.game !== "string") return null;
  if (!Array.isArray(board.rows)) return null;
  return { game: board.game, rows: board.rows.map(readRow).filter((r): r is BoardRow => r !== null) };
}

export function readSnapshot(value: unknown): BoardSnapshot {
  if (typeof value !== "object" || value === null) return UNAVAILABLE;
  const body = value as { available?: unknown; boards?: unknown };
  if (body.available !== true) return UNAVAILABLE;
  if (!Array.isArray(body.boards)) return UNAVAILABLE;
  const boards = body.boards.map(readBoard).filter((b): b is Board => b !== null);
  return { available: true, boards };
}

export async function fetchBoards(fetchImpl: typeof fetch = fetch): Promise<BoardSnapshot> {
  try {
    const response = await fetchImpl("/api/board", { headers: { accept: "application/json" } });
    if (!response.ok) return UNAVAILABLE;
    return readSnapshot(await response.json());
  } catch {
    return UNAVAILABLE;
  }
}

export async function submitScore(
  entry: { game: string; initials: string; score: number },
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  // Checked here so the visitor is told before anything is sent. Checked again
  // in the route, because a client-side check is a courtesy, never a control.
  const check = checkInitials(entry.initials);
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    const response = await fetchImpl("/api/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        game: entry.game,
        initials: check.initials,
        score: Math.max(0, Math.floor(entry.score)),
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, reason: serverReason(body) };
    const board = readBoard((body as { board?: unknown } | null)?.board);
    if (!board) return { ok: false, reason: arcadeCopy.initials.refused };
    return { ok: true, board };
  } catch {
    return { ok: false, reason: arcadeCopy.initials.refused };
  }
}

function serverReason(body: unknown): string {
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason !== "string") return arcadeCopy.initials.refused;
  if (reason.length === 0 || reason.length > MAX_SERVER_REASON) return arcadeCopy.initials.refused;
  return reason;
}
```

- [ ] **Step 6: Write `lib/arcade/session.ts`**

```ts
import { checkInitials } from "./board";
import type { BoardSnapshot } from "./board";

/**
 * What the arcade remembers, and it is deliberately almost nothing.
 *
 * Two facts at module level, which die with the tab and touch no storage at
 * all: whether the door has been opened in this session, and the last board
 * snapshot the client fetched. `neofetch` prints the boards only once `seen`
 * is true, so `top` stays the single hint at the door and a reload puts the
 * machine back to one hint.
 *
 * One thing is saved, and only when the visitor asks: the initials they posted
 * a score under, so the entry screen is pre-filled next time. It is under
 * `OWNED_PREFIX`, so `forget` wipes it with no change to `lib/forget.ts`, and
 * that is exactly the constitution's rule: the site may keep what the visitor
 * explicitly saved and nothing used to recognise them.
 */

export type ArcadeSession = { seen: boolean; boards: BoardSnapshot | null };

export const INITIALS_KEY = "fergusos:arcade.initials";

let session: ArcadeSession = { seen: false, boards: null };

export function arcadeSession(): ArcadeSession {
  return session;
}

export function markArcadeSeen(): void {
  if (session.seen) return;
  session = { ...session, seen: true };
}

export function setArcadeBoards(boards: BoardSnapshot): void {
  session = { ...session, boards };
}

/** Tests only. Module state that cannot be reset makes every test order-dependent. */
export function resetArcadeSession(): void {
  session = { seen: false, boards: null };
}

export function loadInitials(storage: Pick<Storage, "getItem">): string | null {
  try {
    const raw = storage.getItem(INITIALS_KEY);
    if (raw === null) return null;
    const check = checkInitials(raw);
    return check.ok ? check.initials : null;
  } catch {
    return null;
  }
}

export function saveInitials(storage: Pick<Storage, "setItem">, initials: string): void {
  const check = checkInitials(initials);
  if (!check.ok) return;
  try {
    storage.setItem(INITIALS_KEY, check.initials);
  } catch {
    /* private mode or quota: not saving it costs nothing */
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd "$WT"
npx vitest run lib/arcade/
npx tsc --noEmit
```

Expected: PASS. About 60 tests across the seven arcade files so far, `tsc` silent.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add lib/arcade/board.ts lib/arcade/board.test.ts lib/arcade/board-store.ts lib/arcade/board-store.test.ts lib/arcade/board-client.ts lib/arcade/board-client.test.ts lib/arcade/session.ts lib/arcade/session.test.ts
git commit -m "feat(arcade): three characters, a score, and a board that survives no redis"
```

---

### Task 9: The two screens the runtime owns

**Files:**
- Create: `lib/arcade/cabinet.ts`, `lib/arcade/cabinet.test.ts`
- Create: `lib/arcade/initials.ts`, `lib/arcade/initials.test.ts`

**Interfaces:**
- Consumes: the grid helpers, `ArcadeKey`, `ARCADE_GAMES`, `isReady`, `checkInitials`, `formatBoard`, `INITIALS_ALPHABET`, `arcadeCopy`
- Produces: `initialCabinetState`, `cabinetReduce`, `cabinetView`, `createCabinet`, `initialInitialsState`, `initialsValue`, `initialsReduce`, `initialsView`, `createInitialsProgram`

Both follow the pattern every game plan copies: a state type, a pure reducer over `ArcadeKey`, a pure view returning `rows` lines of `cols` characters, and a thin `ProgramSpec` that wires them to a host.

- [ ] **Step 1: Write the failing tests**

Create `lib/arcade/cabinet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cabinetReduce, cabinetView, createCabinet, initialCabinetState } from "@/lib/arcade/cabinet";
import type { ArcadeGame } from "@/lib/arcade/games";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import type { ProgramHost, ProgramSpec } from "@/lib/arcade/program";

const READY: ArcadeGame = { id: "bounce", title: "bounce", spec: { id: "bounce", title: "bounce", start: () => ({ tick: () => {}, key: () => {}, dispose: () => {} }) }, board: true };
const PLANNED: ArcadeGame = { id: "pong", title: GAME_TITLES.pong, spec: null, board: true };
const GAMES = [READY, PLANNED];

describe("cabinetReduce", () => {
  it("moves the cursor and wraps at both ends", () => {
    let s = initialCabinetState();
    expect(s.index).toBe(0);
    s = cabinetReduce(s, "up", GAMES).state;
    expect(s.index).toBe(1);
    s = cabinetReduce(s, "down", GAMES).state;
    expect(s.index).toBe(0);
  });

  it("launches the selected game on enter and on fire", () => {
    const s = initialCabinetState();
    expect(cabinetReduce(s, "start", GAMES).launch).toBe(READY);
    expect(cabinetReduce(s, "fire", GAMES).launch).toBe(READY);
  });

  it("says a game is not built rather than launching nothing", () => {
    const s = { index: 1, note: null };
    const out = cabinetReduce(s, "start", GAMES);
    expect(out.launch).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.cabinet.notReady);
  });

  it("jumps straight to a game on its digit", () => {
    const out = cabinetReduce(initialCabinetState(), "2", GAMES);
    expect(out.state.index).toBe(1);
    expect(out.launch).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.cabinet.notReady);
  });

  it("ignores a digit past the end of the list", () => {
    const out = cabinetReduce(initialCabinetState(), "5", GAMES);
    expect(out.state.index).toBe(0);
  });

  it("clears the note as soon as the cursor moves", () => {
    const out = cabinetReduce({ index: 1, note: "stale" }, "up", GAMES);
    expect(out.state.note).toBeNull();
  });
});

describe("cabinetView", () => {
  const render = (cols: number, rows: number) =>
    cabinetView(initialCabinetState(), GAMES, { available: true, boards: [{ game: "bounce", rows: [{ initials: "FOR", score: 12 }] }] }, cols, rows);

  it("fills the grid exactly, at both sizes", () => {
    for (const [cols, rows] of [[48, 20], [32, 16]] as const) {
      const lines = render(cols, rows);
      expect(lines, `${cols}x${rows}`).toHaveLength(rows);
      for (const line of lines) expect(line.length, line).toBe(cols);
    }
  });

  it("names every game, and marks the ones nobody has built", () => {
    const text = render(48, 20).join("\n");
    expect(text).toContain("bounce");
    expect(text).toContain(GAME_TITLES.pong);
    expect(text).toContain(`(${GAME_TITLES.pong})`);
  });

  it("puts a cursor on the selection and nowhere else", () => {
    const lines = render(48, 20);
    expect(lines.filter((l) => l.trimStart().startsWith(">"))).toHaveLength(1);
  });

  it("prints the selected game's board", () => {
    expect(render(48, 20).join("\n")).toContain("FOR");
  });

  it("prints the unavailable sentence when there is no board", () => {
    const lines = cabinetView(initialCabinetState(), GAMES, null, 32, 16);
    expect(lines.join("\n")).toContain(arcadeCopy.board.unavailable[0]);
  });

  it("shows the note in place of the footer when there is one", () => {
    const lines = cabinetView({ index: 1, note: arcadeCopy.cabinet.notReady }, GAMES, null, 48, 20);
    expect(lines.join("\n")).toContain(arcadeCopy.cabinet.notReady);
  });
});

describe("createCabinet", () => {
  function host(overrides: Partial<ProgramHost> = {}): ProgramHost {
    return { cols: 48, rows: 20, draw: () => {}, exit: () => {}, ...overrides };
  }

  it("is the program the door returns", () => {
    const cabinet = createCabinet();
    expect(cabinet.id).toBe("arcade");
    expect(cabinet.title).toBe(arcadeCopy.cabinet.title);
  });

  it("draws as soon as it starts, so the screen is never blank", () => {
    let drawn = 0;
    const p = createCabinet().start(host({ draw: () => void drawn++ }));
    expect(drawn).toBe(1);
    p.dispose();
  });

  it("hands the screen to the game it launches", () => {
    let ran: ProgramSpec | null = null;
    const p = createCabinet().start(host({ run: (spec) => void (ran = spec) }));
    p.key("start", true);
    expect(ran).not.toBeNull();
    p.dispose();
  });

  it("acts on the key going down, never on the key coming up", () => {
    let ran = 0;
    const p = createCabinet().start(host({ run: () => void ran++ }));
    p.key("start", true);
    p.key("start", false);
    expect(ran).toBe(1);
    p.dispose();
  });
});
```

Create `lib/arcade/initials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createInitialsProgram, initialInitialsState, initialsReduce, initialsValue, initialsView,
} from "@/lib/arcade/initials";
import { arcadeCopy } from "@/content/arcade";
import type { ProgramHost } from "@/lib/arcade/program";

describe("initialInitialsState", () => {
  it("starts at AAA when nothing was saved", () => {
    expect(initialsValue(initialInitialsState(null))).toBe("AAA");
  });

  it("starts at what the visitor used last time", () => {
    expect(initialsValue(initialInitialsState("FOR"))).toBe("FOR");
  });

  it("ignores a saved value it would not have accepted", () => {
    expect(initialsValue(initialInitialsState("nonsense"))).toBe("AAA");
  });
});

describe("initialsReduce", () => {
  it("walks the alphabet forwards on up and backwards on down, wrapping", () => {
    let s = initialInitialsState(null);
    s = initialsReduce(s, "up").state;
    expect(initialsValue(s)).toBe("BAA");
    s = initialsReduce(s, "down").state;
    s = initialsReduce(s, "down").state;
    // A wraps back round to the last character of the alphabet, which is 9.
    expect(initialsValue(s)).toBe("9AA");
  });

  it("moves the cursor and stops at both ends", () => {
    let s = initialInitialsState(null);
    s = initialsReduce(s, "left").state;
    expect(s.cursor).toBe(0);
    s = initialsReduce(s, "right").state;
    s = initialsReduce(s, "right").state;
    s = initialsReduce(s, "right").state;
    expect(s.cursor).toBe(2);
  });

  it("submits on enter", () => {
    expect(initialsReduce(initialInitialsState("FOR"), "start").submit).toBe("FOR");
  });

  it("refuses a blocked set in place, without submitting it", () => {
    const out = initialsReduce(initialInitialsState("ASS"), "start");
    expect(out.submit).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.initials.blocked);
  });

  it("clears the note the moment the visitor changes anything", () => {
    const blocked = initialsReduce(initialInitialsState("ASS"), "start").state;
    expect(initialsReduce(blocked, "up").state.note).toBeNull();
  });
});

describe("initialsView", () => {
  it("fills the grid exactly, at both sizes", () => {
    for (const [cols, rows] of [[48, 20], [32, 16]] as const) {
      const lines = initialsView(initialInitialsState("FOR"), "bounce", 4200, cols, rows);
      expect(lines).toHaveLength(rows);
      for (const line of lines) expect(line.length).toBe(cols);
    }
  });

  it("shows the three characters, the score, and which character is being changed", () => {
    const text = initialsView(initialInitialsState("FOR"), "bounce", 4200, 48, 20).join("\n");
    expect(text).toContain("F O R");
    expect(text).toContain("4,200");
    expect(text).toContain(arcadeCopy.initials.footer);
  });
});

describe("createInitialsProgram", () => {
  const host = (overrides: Partial<ProgramHost> = {}): ProgramHost => ({
    cols: 48, rows: 20, draw: () => {}, exit: () => {}, ...overrides,
  });

  it("submits once, whatever the visitor presses after that", () => {
    const got: string[] = [];
    const p = createInitialsProgram({
      game: "bounce",
      score: 12,
      seed: "FOR",
      onSubmit: (initials) => got.push(initials),
    }).start(host());
    p.key("start", true);
    p.key("start", true);
    p.key("up", true);
    expect(got).toEqual(["FOR"]);
    p.dispose();
  });

  it("does not exit itself, because the server has not answered yet", () => {
    // The runtime exits with what the server said. Exiting here would print
    // "score posted" before anything had been posted, which is the failure the
    // contact form's spam filter was rewritten to stop making.
    let exited = 0;
    const p = createInitialsProgram({
      game: "bounce", score: 12, seed: "FOR", onSubmit: () => {},
    }).start(host({ exit: () => void exited++ }));
    p.key("start", true);
    expect(exited).toBe(0);
    p.dispose();
  });

  it("says it is posting rather than leaving a dead screen", () => {
    let last: string[] = [];
    const p = createInitialsProgram({
      game: "bounce", score: 12, seed: "FOR", onSubmit: () => {},
    }).start(host({ draw: (lines) => void (last = lines) }));
    p.key("start", true);
    expect(last.join("\n")).toContain(arcadeCopy.initials.posting);
    p.dispose();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run lib/arcade/cabinet.test.ts lib/arcade/initials.test.ts
```

Expected: both FAIL on unresolved imports.

- [ ] **Step 3: Write the cabinet**

Create `lib/arcade/cabinet.ts`:

```ts
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import type { BoardSnapshot } from "./board";
import { formatBoard } from "./board";
import { ARCADE_GAMES, isReady } from "./games";
import type { ArcadeGame } from "./games";
import { blankGrid, centre, toLines, write } from "./grid";
import type { ArcadeKey } from "./input";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "./program";

/**
 * What `cd arcade` opens: the game list, drawn in the grid, with the selected
 * game's board under it.
 *
 * It is a program like any other, which is what lets it use the runtime's own
 * loop, keys, swipes and Escape rather than a second set of everything. It
 * hands the screen to a game through `host.run`, and a game that has not been
 * built yet says so in place rather than launching nothing.
 *
 * Only the selected game's board is drawn. Five boards do not fit in sixteen
 * rows, and a cursor that changes what is under it is a better answer than a
 * list nobody can read.
 */

export type CabinetState = {
  index: number;
  /** A one-line answer to the last key, shown in place of the footer. */
  note: string | null;
};

export function initialCabinetState(): CabinetState {
  return { index: 0, note: null };
}

export function cabinetReduce(
  state: CabinetState,
  key: ArcadeKey,
  games: readonly ArcadeGame[],
): { state: CabinetState; launch: ArcadeGame | null } {
  if (games.length === 0) return { state, launch: null };
  const pick = (index: number): { state: CabinetState; launch: ArcadeGame | null } => {
    const game = games[index];
    if (!game) return { state, launch: null };
    if (!isReady(game)) return { state: { index, note: arcadeCopy.cabinet.notReady }, launch: null };
    return { state: { index, note: null }, launch: game };
  };

  switch (key) {
    case "up":
      return { state: { index: (state.index - 1 + games.length) % games.length, note: null }, launch: null };
    case "down":
      return { state: { index: (state.index + 1) % games.length, note: null }, launch: null };
    case "start":
    case "fire":
      return pick(state.index);
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      return Number(key) - 1 < games.length ? pick(Number(key) - 1) : { state, launch: null };
    default:
      return { state, launch: null };
  }
}

export function cabinetView(
  state: CabinetState,
  games: readonly ArcadeGame[],
  boards: BoardSnapshot | null,
  cols: number,
  rows: number,
): string[] {
  const grid = blankGrid(cols, rows);
  centre(grid, 0, arcadeCopy.cabinet.title);

  games.forEach((game, i) => {
    const cursor = i === state.index ? ">" : " ";
    const label = isReady(game) ? game.title : `(${game.title})`;
    write(grid, 1, 2 + i, `${cursor} ${i + 1} ${label}`);
  });

  const boardTop = 3 + games.length;
  const selected = games[state.index];
  const board = boards?.available ? boards.boards.find((b) => b.game === selected?.id) : undefined;
  const panel = board
    ? formatBoard(board, cols - 2, GAME_TITLES[board.game] ?? board.game)
    : [...arcadeCopy.board.unavailable];
  const room = rows - 1 - boardTop;
  write(grid, 1, boardTop - 1, arcadeCopy.cabinet.boardsHeading);
  panel.slice(0, Math.max(0, room)).forEach((line, i) => write(grid, 1, boardTop + i, line));

  centre(grid, rows - 1, state.note ?? arcadeCopy.cabinet.footer);
  return toLines(grid);
}

/**
 * The cabinet reads the board snapshot off the session rather than being handed
 * one. That is what lets it need no member outside `ProgramInstance`, so the
 * frozen type stays frozen and there is no cast anywhere in the arcade.
 * `ArcadeScreen` fetches once, calls `setArcadeBoards`, and the next tick's
 * redraw picks it up.
 */
export function createCabinet(): ProgramSpec {
  return {
    id: "arcade",
    title: arcadeCopy.cabinet.title,
    start(host: ProgramHost): ProgramInstance {
      let state = initialCabinetState();
      const render = () =>
        host.draw(cabinetView(state, ARCADE_GAMES, arcadeSession().boards, host.cols, host.rows));
      render();
      return {
        tick() {
          /* Nothing moves here, but the runtime ticks it anyway so the cabinet
             and a game are the same kind of thing to the host. The redraw is
             what lets a board arriving mid-session appear without a poke. */
          render();
        },
        key(key, down) {
          if (!down) return;
          const out = cabinetReduce(state, key, ARCADE_GAMES);
          state = out.state;
          host.sound?.("blip");
          if (out.launch?.spec && host.run) {
            host.run(out.launch.spec);
            return;
          }
          render();
        },
        swipe(dir) {
          if (dir !== "up" && dir !== "down") return;
          state = cabinetReduce(state, dir, ARCADE_GAMES).state;
          render();
        },
        dispose() {
          /* no timers, no listeners */
        },
      };
    },
  };
}
```

`import { arcadeSession } from "./session";` goes at the top with the rest. Redrawing thirty times a second costs one string build and no DOM write at all, because `ArcadeScreen` only touches `textContent` when the text has changed.

- [ ] **Step 4: Write the initials entry**

Create `lib/arcade/initials.ts`:

```ts
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { checkInitials, groupDigits, INITIALS_ALPHABET, INITIALS_LENGTH, normaliseInitials } from "./board";
import { blankGrid, centre, toLines } from "./grid";
import type { ArcadeKey } from "./input";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "./program";

/**
 * Three characters for the board, entered the way a cabinet does it: up and
 * down walk the alphabet, left and right move between the three, enter posts.
 *
 * The same five keys the games use, so a phone can do it with swipes and taps
 * and nothing needs a keyboard. Escape is not handled here: the runtime takes
 * it first and always, which means skipping the board is the same gesture as
 * leaving the game, and there is one way out of everything.
 *
 * `checkInitials` runs here so a refusal is shown in place, before anything is
 * sent. The route runs it again, because this one is a courtesy.
 */

export type InitialsState = {
  chars: [number, number, number];
  cursor: 0 | 1 | 2;
  note: string | null;
};

const indexOf = (ch: string): number => Math.max(0, INITIALS_ALPHABET.indexOf(ch));

export function initialInitialsState(seed?: string | null): InitialsState {
  const cleaned = seed ? normaliseInitials(seed) : "";
  const base = cleaned.length === INITIALS_LENGTH ? cleaned : "AAA";
  return { chars: [indexOf(base[0]), indexOf(base[1]), indexOf(base[2])], cursor: 0, note: null };
}

export function initialsValue(state: InitialsState): string {
  return state.chars.map((i) => INITIALS_ALPHABET[i]).join("");
}

export function initialsReduce(
  state: InitialsState,
  key: ArcadeKey,
): { state: InitialsState; submit: string | null } {
  const chars: [number, number, number] = [...state.chars];
  const size = INITIALS_ALPHABET.length;
  switch (key) {
    case "up":
      chars[state.cursor] = (chars[state.cursor] + 1) % size;
      return { state: { ...state, chars, note: null }, submit: null };
    case "down":
      chars[state.cursor] = (chars[state.cursor] - 1 + size) % size;
      return { state: { ...state, chars, note: null }, submit: null };
    case "left":
      return { state: { ...state, cursor: Math.max(0, state.cursor - 1) as 0 | 1 | 2, note: null }, submit: null };
    case "right":
      return { state: { ...state, cursor: Math.min(2, state.cursor + 1) as 0 | 1 | 2, note: null }, submit: null };
    case "start":
    case "fire": {
      const check = checkInitials(initialsValue(state));
      if (!check.ok) return { state: { ...state, note: check.reason }, submit: null };
      return { state, submit: check.initials };
    }
    default:
      return { state, submit: null };
  }
}

export function initialsView(
  state: InitialsState,
  game: string,
  score: number,
  cols: number,
  rows: number,
): string[] {
  const grid = blankGrid(cols, rows);
  const middle = Math.floor(rows / 2);
  centre(grid, middle - 4, GAME_TITLES[game] ?? game);
  centre(grid, middle - 3, groupDigits(score));
  centre(grid, middle - 1, arcadeCopy.initials.heading);
  // Spaced out so the caret under the selected character is unambiguous.
  centre(grid, middle + 1, initialsValue(state).split("").join(" "));
  centre(grid, middle + 2, ["  ", "  ", "  "].map((_, i) => (i === state.cursor ? "^" : " ")).join(" "));
  centre(grid, rows - 1, state.note ?? arcadeCopy.initials.footer);
  return toLines(grid);
}

export function createInitialsProgram(opts: {
  game: string;
  score: number;
  seed: string | null;
  onSubmit(initials: string): void;
}): ProgramSpec {
  return {
    id: "initials",
    title: arcadeCopy.initials.heading,
    start(host: ProgramHost): ProgramInstance {
      let state = initialInitialsState(opts.seed);
      let done = false;
      const render = () => host.draw(initialsView(state, opts.game, opts.score, host.cols, host.rows));
      render();
      return {
        tick() {
          /* nothing moves */
        },
        key(key, down) {
          if (!down || done) return;
          const out = initialsReduce(state, key);
          state = out.state;
          if (out.submit) {
            // Handing over, not finishing. The runtime posts the score and
            // exits with what the server actually said. Nothing here claims a
            // score was posted before it was: that is the rule the contact
            // form's spam filter was rewritten for.
            done = true;
            state = { ...state, note: arcadeCopy.initials.posting };
            render();
            host.sound?.("score");
            opts.onSubmit(out.submit);
            return;
          }
          host.sound?.("blip");
          render();
        },
        swipe(dir) {
          if (done) return;
          state = initialsReduce(state, dir).state;
          render();
        },
        dispose() {
          done = true;
        },
      };
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "$WT"
npx vitest run lib/arcade/cabinet.test.ts lib/arcade/initials.test.ts
npx tsc --noEmit
```

Expected: PASS, 23 tests, `tsc` silent.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/arcade/cabinet.ts lib/arcade/cabinet.test.ts lib/arcade/initials.ts lib/arcade/initials.test.ts
git commit -m "feat(arcade): the cabinet and the initials entry"
```

---

### Task 10: `ArcadeScreen`, the Terminal's branch, and the stylesheet

**Files:**
- Create: `components/arcade/ArcadeScreen.tsx`
- Create: `components/arcade/arcade.test.ts`
- Modify: `components/Terminal.tsx`
- Modify: `components/terminal.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: every pure module above, `useSystem()` (`frame`, `onFrame`, `audio`, `reducedMotion`), `pushImpact` from `@/lib/system`
- Produces: `ArcadeScreen` (default export, props `{ program: ProgramSpec; onExit(lines: string[]): void }`)

This is the only React in the sub-project and it is deliberately dull: it measures, subscribes, writes text into one node, and routes input. Every decision it could have made lives in a pure module, which is why the tests below are greps rather than behaviour.

- [ ] **Step 1: Write the failing coupling tests**

Create `components/arcade/arcade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks, in the pattern of `lib/boot.test.ts` and
 * `components/terminal.test.ts`, and worth being honest about what they are.
 *
 * Vitest runs in a `node` environment with no DOM, so this component cannot be
 * mounted. Everything it decides has been pushed into `lib/arcade/`, where it
 * is tested properly. What is left is whether this file calls those functions,
 * and these greps close that hole and nothing more. Comments are stripped
 * first, so prose about a call can never satisfy a check for the call: that
 * exact hole let a missing `audio.key()` ship on 2026-08-20.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const screen = code(read("components", "arcade", "ArcadeScreen.tsx"));

describe("the arcade runs on the one frame clock", () => {
  it("subscribes to the system loop and never starts its own", () => {
    expect(screen).toMatch(/onFrame\(/);
    expect(screen).not.toMatch(/requestAnimationFrame/);
    expect(screen).not.toMatch(/setInterval/);
  });

  it("turns the frame delta into fixed ticks rather than ticking on the frame", () => {
    expect(screen).toMatch(/advance\(\s*loopRef\.current,\s*dt,/);
  });

  it("never calls setState from inside the frame callback", () => {
    // The rule from AGENTS.md. The frame callback is the arrow passed to
    // onFrame; nothing in it may schedule a render.
    const body = screen.slice(screen.indexOf("onFrame("), screen.indexOf("onFrame(") + 600);
    expect(body).not.toMatch(/set[A-Z]\w*\(/);
  });
});

describe("the screen is measured, not assumed", () => {
  it("measures a probe with the rect, not offsetWidth", () => {
    expect(screen).toMatch(/getBoundingClientRect\(\)/);
    expect(screen).not.toMatch(/offsetWidth/);
  });

  it("divides the probe by its length instead of measuring one glyph", () => {
    expect(screen).toMatch(/\/\s*PROBE_LENGTH/);
  });

  it("asks fitGrid, and refuses in a sentence when it says no", () => {
    expect(screen).toMatch(/fitGrid\(/);
    // The whole statement, not just the copy reference: a mutation that
    // disarmed the guard would leave the reference behind and this grep would
    // have gone on passing over a grid that clipped instead of refusing.
    expect(screen).toMatch(/if \(measured && !fit\) leave\(\[\.\.\.arcadeCopy\.noRoom\]\);/);
  });

  it("re-measures when the box changes size", () => {
    expect(screen).toMatch(/new ResizeObserver\(/);
    expect(screen).toMatch(/\.disconnect\(\)/);
  });
});

describe("drawing", () => {
  it("writes text through a ref and not through state", () => {
    expect(screen).toMatch(/preRef\.current\.textContent = /);
    expect(screen).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("skips the write when nothing changed", () => {
    expect(screen).toMatch(/if \(next === lastDrawnRef\.current\) return;/);
  });
});

describe("input", () => {
  it("owns every key that reaches it, so the drawer keeps none of them", () => {
    // Counted, not merely present: keydown and keyup each need one, and a grep
    // for "at least one" would pass with the keydown's removed, which is the
    // one that keeps Escape and the backtick away from the drawer.
    expect(screen.match(/e\.stopPropagation\(\)/g) ?? []).toHaveLength(2);
  });

  it("lets Escape out first, before the program sees anything", () => {
    const esc = screen.indexOf('e.key === "Escape"');
    const map = screen.indexOf("arcadeKey(e.key");
    expect(esc).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(esc);
  });

  it("stops the page scrolling under the player", () => {
    expect(screen).toMatch(/if \(shouldCapture\(e\.key, mods\)\) e\.preventDefault\(\);/);
  });

  it("ignores an auto-repeat, so a held key is one press", () => {
    expect(screen).toMatch(/e\.repeat/);
  });

  it("routes a gesture through deliverGesture rather than deciding itself", () => {
    expect(screen).toMatch(/deliverGesture\(\s*gestureOf\(/);
  });
});

describe("sound and light", () => {
  it("goes through the vocabulary, never straight at the synth", () => {
    expect(screen).toMatch(/soundFor\(name\)/);
  });

  it("never forms a second opinion about whether sound is on", () => {
    // TubeAudio is inert until enabled and muted by `sound off`. A component
    // that also checked would be a second switch that can disagree.
    expect(screen).not.toMatch(/settings\.audio/);
  });

  it("lights the tube through the frame the shader already reads", () => {
    expect(screen).toMatch(/pushImpact\(frame\.current,/);
  });

  it("caps the light to one a frame, so physics keeps its slots", () => {
    expect(screen).toMatch(/flashesRef\.current >= 1/);
  });
});

describe("leaving", () => {
  it("declines when the system asks for reduced motion, even mid-game", () => {
    expect(screen).toMatch(/reducedMotion/);
    expect(screen).toMatch(/arcadeCopy\.declined/);
  });

  it("offers the board only when there is a board to offer", () => {
    expect(screen).toMatch(/createInitialsProgram\(/);
    expect(screen).toMatch(/\.available/);
  });

  it("prints what the server said, not what it hoped", () => {
    expect(screen).toMatch(/result\.ok \? arcadeCopy\.initials\.saved : result\.reason/);
  });

  it("has an exit control for a screen with no Escape key on it", () => {
    expect(screen).toMatch(/className="arcade__exit"/);
    expect(screen).toMatch(/arcadeCopy\.exitLabel/);
  });
});
```

Two edits to `components/terminal.test.ts`, which asserts F1's placeholder in two separate blocks. First, inside `describe("Terminal reads the shared history")`, the "dispatches typed, print and clear" test names the old line; replace its middle assertion:

```ts
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "print", cmd: programCmd\.current, lines \}\)/);
```

Second, replace the whole `describe("Terminal and a program result")` block with:

```ts
describe("Terminal and a program result", () => {
  it("gives a program result a branch of its own before the output branches", () => {
    const at = terminal.indexOf('res.type === "program"');
    const effectAt = terminal.indexOf('res.type === "effect"');
    expect(at).toBeGreaterThan(-1);
    expect(effectAt).toBeGreaterThan(at);
  });

  it("hosts the program rather than printing an apology about it", () => {
    expect(terminal).toMatch(/setProgram\(res\.program\)/);
    expect(terminal).not.toMatch(/"no runtime yet"/);
  });

  it("marks the arcade found, which is what lets neofetch print the boards", () => {
    expect(terminal).toMatch(/markArcadeSeen\(\)/);
  });

  it("swaps the prompt for the screen and puts it back", () => {
    expect(terminal).toMatch(/program \? \(/);
    expect(terminal).toMatch(/<ArcadeScreen/);
    expect(terminal).toMatch(/inputRef\.current\?\.focus\(\)/);
  });

  it("keeps the scrollback, and echoes the command that opened the door", () => {
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "print", cmd: programCmd\.current, lines \}\)/);
  });

  it("hands the commands the session, so neofetch can read it", () => {
    expect(terminal).toMatch(/arcade: arcadeSession\(\)/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run components/arcade/arcade.test.ts components/terminal.test.ts
```

Expected: `arcade.test.ts` fails to read a file that does not exist; `terminal.test.ts` fails on `setProgram` and on `"no runtime yet"` still being present.

- [ ] **Step 3: Write `ArcadeScreen`**

Create `components/arcade/ArcadeScreen.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { arcadeCopy } from "@/content/arcade";
import { submitScore } from "@/lib/arcade/board-client";
import { fetchBoards } from "@/lib/arcade/board-client";
import { findGame } from "@/lib/arcade/games";
import { fitGrid } from "@/lib/arcade/grid";
import type { GridFit } from "@/lib/arcade/grid";
import { createInitialsProgram } from "@/lib/arcade/initials";
import { arcadeKey, deliverGesture, gestureOf, shouldCapture } from "@/lib/arcade/input";
import { advance, createLoopState } from "@/lib/arcade/loop";
import type { ProgramInstance, ProgramResult, ProgramSpec } from "@/lib/arcade/program";
import type { ProgramHost } from "@/lib/arcade/program";
import { arcadeSession, loadInitials, saveInitials, setArcadeBoards } from "@/lib/arcade/session";
import { soundFor } from "@/lib/arcade/sound";
import { pushImpact } from "@/lib/system";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * The arcade's only React, and deliberately the dullest file in it.
 *
 * It measures a character cell, subscribes to the site's one frame clock,
 * writes lines into one `<pre>` through a ref, and routes keys and gestures
 * into whichever program is running. Every decision it could have made lives
 * in `lib/arcade/`, where it is tested in node without a browser.
 *
 * Four things here are load-bearing and each has a grep in
 * `components/arcade/arcade.test.ts`:
 *
 *  - **No second rAF loop, and no setState in a frame callback.** AGENTS.md,
 *    "One frame clock". The grid is written with `textContent`, and only when
 *    the text has actually changed.
 *  - **The arcade owns every key that reaches it.** One `stopPropagation` on
 *    keydown, and the drawer's window listener never sees Escape or a backtick
 *    while a game is running. Neither `lib/shell.ts` nor `ShellDrawer.tsx`
 *    needs to know this component exists.
 *  - **Escape is taken before the program is asked.** A program cannot hold on
 *    to it, so there is exactly one way out of everything, and the exit button
 *    beside the screen is the same way out for a phone.
 *  - **Nothing claims a score was posted until the server says so.** The
 *    initials screen hands over and waits; this posts, and exits with whatever
 *    came back.
 */

const PROBE_LENGTH = 100;
const PROBE = "0".repeat(PROBE_LENGTH);

type Props = {
  program: ProgramSpec;
  /** Lines for the scrollback, and the prompt back. Called exactly once. */
  onExit: (lines: string[]) => void;
};

export default function ArcadeScreen({ program, onExit }: Props) {
  const { frame, onFrame, audio, reducedMotion } = useSystem();

  const wrapRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);

  const runningRef = useRef<{ spec: ProgramSpec; instance: ProgramInstance } | null>(null);
  const loopRef = useRef(createLoopState());
  const lastDrawnRef = useRef("");
  const flashesRef = useRef(0);
  const rectRef = useRef<DOMRect | null>(null);
  const rectStaleRef = useRef(true);
  const pointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const exitedRef = useRef(false);
  const postedRef = useRef(false);
  const seedRef = useRef<string | null>(null);

  const [fit, setFit] = useState<GridFit | null>(null);
  const [measured, setMeasured] = useState(false);

  const helpId = `arcade-help-${useId()}`;

  /* ── leaving ───────────────────────────────────────────────────────────── */

  const leave = useCallback(
    (lines: string[]) => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      runningRef.current?.instance.dispose();
      runningRef.current = null;
      onExit(lines);
    },
    [onExit],
  );

  /* ── the host ──────────────────────────────────────────────────────────── */

  const startProgram = useCallback(
    (spec: ProgramSpec, host: ProgramHost) => {
      runningRef.current?.instance.dispose();
      lastDrawnRef.current = "";
      loopRef.current = createLoopState();
      runningRef.current = { spec, instance: spec.start(host) };
    },
    [],
  );

  useEffect(() => {
    if (!measured || !fit) return;

    const post = (game: string, initials: string, score: number) => {
      postedRef.current = true;
      try {
        saveInitials(window.localStorage, initials);
      } catch {
        /* storage refused: nothing was saved, and nothing else changes */
      }
      void submitScore({ game, initials, score }).then((result) => {
        leave([result.ok ? arcadeCopy.initials.saved : result.reason]);
      });
    };

    const finish = (result?: ProgramResult) => {
      const running = runningRef.current;
      const game = running ? findGame(running.spec.id) : undefined;
      const score = result?.score;
      const boards = arcadeSession().boards;
      if (
        !postedRef.current &&
        game?.board &&
        typeof score === "number" &&
        score > 0 &&
        boards?.available === true
      ) {
        startProgram(
          createInitialsProgram({
            game: game.id,
            score,
            seed: seedRef.current,
            onSubmit: (initials) => post(game.id, initials, score),
          }),
          host,
        );
        return;
      }
      leave([result?.label ?? arcadeCopy.left]);
    };

    const host: ProgramHost = {
      cols: fit.cols,
      rows: fit.rows,
      draw: (lines) => {
        const next = lines.join("\n");
        if (next === lastDrawnRef.current) return;
        lastDrawnRef.current = next;
        if (preRef.current) preRef.current.textContent = next;
      },
      sound: (name) => {
        const call = soundFor(name);
        if (!call) return;
        switch (call.method) {
          case "hover":
            audio.hover();
            break;
          case "key":
            audio.key();
            break;
          case "relay":
            audio.relay();
            break;
          case "thud":
            audio.thud();
            break;
          case "impact":
            audio.impact(call.energy);
            break;
        }
      },
      flash: (col, row, energy) => {
        // One a frame. The shader lights MAX_FRAME_IMPACTS and the physics
        // stage shares them, so a game that flashed every tick could starve it.
        if (flashesRef.current >= 1) return;
        if (rectStaleRef.current || !rectRef.current) {
          rectRef.current = preRef.current?.getBoundingClientRect() ?? null;
          rectStaleRef.current = false;
        }
        const rect = rectRef.current;
        if (!rect) return;
        flashesRef.current++;
        pushImpact(frame.current, {
          x: (rect.left + ((col + 0.5) / fit.cols) * rect.width) / window.innerWidth,
          y: (rect.top + ((row + 0.5) / fit.rows) * rect.height) / window.innerHeight,
          energy,
          at: performance.now(),
        });
      },
      run: (spec) => startProgram(spec, host),
      exit: (result) => finish(result),
    };

    startProgram(program, host);

    const unsubscribe = onFrame((_time, dt) => {
      const instance = runningRef.current?.instance;
      if (!instance) return;
      flashesRef.current = 0;
      advance(loopRef.current, dt, (ms) => instance.tick(ms));
    });

    return () => {
      unsubscribe();
      runningRef.current?.instance.dispose();
      runningRef.current = null;
    };
  }, [measured, fit, program, onFrame, audio, frame, leave, startProgram]);

  /* ── measuring ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const box = screenRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;

    const measure = () => {
      const probeRect = probe.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      rectStaleRef.current = true;
      const next = fitGrid(
        { width: boxRect.width, height: boxRect.height },
        { width: probeRect.width / PROBE_LENGTH, height: probeRect.height },
      );
      setFit((current) => {
        if (current && next && current.cols === next.cols && current.rows === next.rows && current.scale === next.scale) {
          return current;
        }
        return next;
      });
      setMeasured(true);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const onScroll = () => {
      rectStaleRef.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /** No room is a sentence, never a clipped grid. */
  useEffect(() => {
    if (measured && !fit) leave([...arcadeCopy.noRoom]);
  }, [measured, fit, leave]);

  /** The preference can change while a game is running, and it wins when it does. */
  useEffect(() => {
    if (reducedMotion) leave([...arcadeCopy.declined]);
  }, [reducedMotion, leave]);

  /** Focus follows the screen, so the first key goes to the game and not the page. */
  useEffect(() => {
    wrapRef.current?.focus();
  }, []);

  /** The boards, and the initials the visitor last used. Both are optional. */
  useEffect(() => {
    try {
      seedRef.current = loadInitials(window.localStorage);
    } catch {
      seedRef.current = null;
    }
    let live = true;
    void fetchBoards().then((snapshot) => {
      if (live) setArcadeBoards(snapshot);
    });
    return () => {
      live = false;
    };
  }, []);

  /* ── input ─────────────────────────────────────────────────────────────── */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The arcade owns every key that reaches it: this is what keeps Escape
    // from also closing the drawer and a backtick from toggling it.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      leave([arcadeCopy.left]);
      return;
    }
    const mods = { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
    if (shouldCapture(e.key, mods)) e.preventDefault();
    if (e.repeat) return;
    const key = arcadeKey(e.key, mods);
    if (!key) return;
    runningRef.current?.instance.key(key, true);
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const key = arcadeKey(e.key, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    if (!key) return;
    runningRef.current?.instance.key(key, false);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    wrapRef.current?.focus();
    pointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    const instance = runningRef.current?.instance;
    if (!start || !instance) return;
    const delivery = deliverGesture(
      gestureOf(e.clientX - start.x, e.clientY - start.y, performance.now() - start.t),
      typeof instance.swipe === "function",
    );
    if (delivery.swipe) instance.swipe?.(delivery.swipe);
    if (delivery.press) {
      instance.key(delivery.press, true);
      instance.key(delivery.press, false);
    }
  };

  return (
    <div
      className="arcade"
      ref={wrapRef}
      role="application"
      aria-label={arcadeCopy.screenLabel}
      aria-describedby={helpId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="arcade__screen" ref={screenRef}>
        <pre
          className="arcade__grid"
          ref={preRef}
          aria-hidden="true"
          data-cols={fit?.cols}
          data-rows={fit?.rows}
          data-scale={fit?.scale}
          style={fit ? ({ "--arcade-scale": String(fit.scale) } as CSSProperties) : undefined}
        />
        {/* Measured at scale 1, because fitGrid applies the scale itself. */}
        <span className="arcade__probe" ref={probeRef} aria-hidden="true">
          {PROBE}
        </span>
      </div>
      <p id={helpId} className="arcade__srhelp">
        {arcadeCopy.screenHelp}
      </p>
      <div className="arcade__foot">
        <button
          type="button"
          className="arcade__exit"
          onClick={() => leave([arcadeCopy.left])}
          aria-label={arcadeCopy.exitLabel}
        >
          esc
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the Terminal**

Four edits to `components/Terminal.tsx`.

Imports, after the existing `@/lib/presence` line:

```tsx
import ArcadeScreen from "@/components/arcade/ArcadeScreen";
import { arcadeSession, markArcadeSeen } from "@/lib/arcade/session";
import type { ProgramSpec } from "@/lib/arcade/program";
```

State and a ref, beside the existing `useState` calls:

```tsx
  const [program, setProgram] = useState<ProgramSpec | null>(null);
  /** The command that opened the door, so the exit line echoes under it. */
  const programCmd = useRef("");
```

Replace the whole `if (res.type === "program")` block in `run`:

```tsx
    if (res.type === "program") {
      programCmd.current = raw;
      markArcadeSeen();
      setProgram(res.program);
      return;
    }
```

Pass the session into the command context, beside `presence`:

```tsx
      arcade: arcadeSession(),
```

Put the prompt back when the program goes, after the other effects:

```tsx
  // "Escape always exits, always restores the prompt, always leaves the
  // history intact." The scrollback lives in lib/history.ts and is untouched;
  // this is the focus half of that promise.
  const hadProgram = useRef(false);
  useEffect(() => {
    if (program) {
      hadProgram.current = true;
      return;
    }
    if (!hadProgram.current) return;
    hadProgram.current = false;
    inputRef.current?.focus();
  }, [program]);
```

And wrap the body. The opening `<div>` gains the class, and everything between it and its close becomes the alternative branch:

```tsx
    <div
      className={`term term--${variant}${program ? " term--program" : ""}${wiping ? " is-wiping" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      {program ? (
        <ArcadeScreen
          program={program}
          onExit={(lines) => {
            setProgram(null);
            historyStore.dispatch({ type: "print", cmd: programCmd.current, lines });
          }}
        />
      ) : (
        <>
          {/* the existing term__scroll, term__form, term__srhint and
              term__hints, unchanged */}
        </>
      )}
    </div>
```

- [ ] **Step 5: Write the stylesheet block**

Append to `app/globals.css`, immediately after the `.term__hint:hover` rule that closes the interactive terminal block (the file is CRLF, so keep the line endings the editor gives you):

```css
/* ----- the arcade --------------------------------------------------------
   A program running inside the terminal. It replaces the scrollback and the
   prompt for as long as it runs, so it gets the terminal's whole box.

   There is not one keyframe or transition in this block, so there is nothing
   to gate behind prefers-reduced-motion: the arcade declines under `reduce`
   before it can start (lib/commands/hidden.ts), and ArcadeScreen leaves if the
   preference changes mid-game. The only thing that moves is the glyphs, which
   is the game.

   Colours are the terminal's own: --green-bright on the terminal's ground,
   which is the pairing every other line of terminal text already uses. Nothing
   here uses --green-dim, which app/globals.test.ts documents as under 4.5:1 on
   the amber and ice phosphors. */
.arcade {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  outline: none;
  /* Inline on the home page the terminal has no height of its own, so the
     arcade asks for one. In the drawer it fills what the drawer allows. */
  height: min(56vh, 440px);
}
.arcade:focus-visible {
  outline: 1px solid var(--green);
  outline-offset: 2px;
}
.arcade__screen {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.arcade__grid {
  --arcade-font: 15px;
  margin: 0;
  font-family: inherit;
  font-size: calc(var(--arcade-font) * var(--arcade-scale, 1));
  line-height: 1.25;
  letter-spacing: 0;
  color: var(--green-bright);
  text-shadow: var(--glow);
  white-space: pre;
  /* A finger on the grid is an input, never a scroll. */
  touch-action: none;
  overscroll-behavior: contain;
  -webkit-user-select: none;
  user-select: none;
}
/* Measured at scale 1: fitGrid applies the scale itself, so a probe that
   inherited it would measure the answer instead of the question. */
.arcade__probe {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
  font-family: inherit;
  font-size: var(--arcade-font, 15px);
  line-height: 1.25;
  white-space: pre;
}
.arcade__srhelp {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.arcade__foot {
  display: flex;
  justify-content: flex-end;
}
.arcade__exit {
  font: inherit;
  font-size: 0.72rem;
  line-height: 1;
  color: var(--green);
  background: transparent;
  border: 1px solid var(--green-line);
  border-radius: 3px;
  /* 44 by 44, because on a phone this is the only way out: there is no
     Escape key on the glass. */
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}
.arcade__exit:hover,
.arcade__exit:focus-visible {
  color: var(--green-bright);
}
@media (min-width: 601px) {
  .arcade__grid {
    --arcade-font: 16px;
  }
}
/* In the drawer the height comes from the drawer, not from the arcade. */
.shell .term--program {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.shell .term--program .arcade {
  height: auto;
  flex: 1 1 auto;
  min-height: 0;
}
```

- [ ] **Step 6: Run everything**

```bash
cd "$WT"
npx vitest run
npx tsc --noEmit
npm run build
```

Expected: green, silent, and a clean build. `npm run build` is here rather than at the end because this is the first task that adds a component to the client bundle, and a client component importing something server-only fails at build time, not at test time.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add components/arcade/ components/Terminal.tsx components/terminal.test.ts app/globals.css
git commit -m "feat(arcade): the terminal hosts a program"
```

---

### Task 11: The door, the refusal, and `neofetch`

**Files:**
- Modify: `lib/commands/hidden.ts`
- Modify: `lib/commands/hidden.test.ts` (exists since F1; its "closed until G0" test is replaced)
- Modify: `lib/commands/dispatch.test.ts` (two assertions on the placeholder string)
- Modify: `lib/commands/info.ts`
- Modify: `lib/commands.test.ts` (the `neofetch` coverage lives there)
- Modify: `lib/commands/shared.ts`

**Three files on `main` assert the string `"arcade: no runtime yet"` and all three change here.** `grep -rn "no runtime yet" --include=*.ts --include=*.tsx .` finds them: `lib/commands/hidden.ts` (the command), `lib/commands/hidden.test.ts` and `lib/commands/dispatch.test.ts` (the assertions), plus a docblock in `lib/commands/shared.ts` and the two greps in `components/terminal.test.ts` that Task 10 already handled. Leave any of them and the suite goes red for the right reason, which is the point of having written them.

**Interfaces:**
- Consumes: `createCabinet`, `ARCADE_GAMES`, `findGame`, `formatBoards`, `arcadeSession`, `arcadeCopy`, `GAME_TITLES`
- Produces: `ARCADE_DECLINED`, the `arcade` command's real behaviour, `CommandContext.arcade`

- [ ] **Step 1: Write the failing tests**

In `lib/commands/hidden.test.ts`, keep the two structural tests (`holds the arcade door, hidden, with no help and no completion` and `marks everything in it hidden, by construction`), delete the one called `is closed until G0 supplies a runtime`, and add these two describes, with the imports at the top:

```ts
import { describe, it, expect } from "vitest";
import { COMMANDS, HELP_LINES, complete, runCommand } from "@/lib/commands";
import { hidden } from "./hidden";
import { ARCADE_DECLINED } from "./hidden";
import { GAME_TITLES } from "@/content/arcade";

describe("the door", () => {
  it("opens the cabinet", () => {
    const res = runCommand("arcade");
    expect(res.type).toBe("program");
    if (res.type !== "program") return;
    expect(res.program.id).toBe("arcade");
  });

  it("opens the same cabinet through cd, which is how it is meant to be found", () => {
    expect(runCommand("cd arcade").type).toBe("program");
  });

  it("starts a named game straight from the door", () => {
    const res = runCommand("cd arcade bounce");
    expect(res.type).toBe("program");
    if (res.type !== "program") return;
    expect(res.program.id).toBe("bounce");
  });

  it("says so, rather than opening the cabinet, when the game is not built", () => {
    const res = runCommand("arcade pong");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).toContain(GAME_TITLES.pong);
  });

  it("says so when the name is not a game at all", () => {
    const res = runCommand("arcade tetris");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).toContain("tetris");
  });

  it("declines under reduced motion, in a sentence, and starts nothing", () => {
    const res = runCommand("arcade", { reducedMotion: true });
    expect(res).toEqual({ type: "output", lines: ARCADE_DECLINED });
  });

  it("declines through cd as well, because the door is one door", () => {
    expect(runCommand("cd arcade", { reducedMotion: true }).type).toBe("output");
  });
});

describe("the door stays shut to everything that lists commands", () => {
  it("is absent from help", () => {
    expect(HELP_LINES.join("\n")).not.toContain("arcade");
  });

  it("is absent from the completion list", () => {
    expect(COMMANDS).not.toContain("arcade");
    expect(complete("arc")).toBeNull();
    expect(complete("arcade ")).toBeNull();
  });

  it("is absent from ls", () => {
    const res = runCommand("ls");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).not.toContain("arcade");
  });

  it("is still the one hint in top", () => {
    const res = runCommand("top");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("arcade");
  });
});
```

In `lib/commands/dispatch.test.ts`, replace the test named `open as \`cd <name>\`, and the arcade is closed until G0` with:

```ts
  it("open as `cd <name>`, and the arcade opens onto a program", () => {
    for (const input of ["cd arcade", "arcade"]) {
      const res = runCommand(input);
      expect(res.type, input).toBe("program");
      if (res.type !== "program") continue;
      expect(res.program.id).toBe("arcade");
    }
  });
```

The two tests around it (`are absent from COMMANDS, HELP_LINES, completion and ls` and `get their one hint from top`) are unchanged and are the ones that keep the door shut.

Add to `lib/commands.test.ts`, which holds the `neofetch` coverage today, beside its existing block:

```ts
describe("neofetch and the boards", () => {
  const boards = {
    available: true,
    boards: [{ game: "bounce", rows: [{ initials: "FOR", score: 12 }] }],
  };

  it("says nothing about the arcade to somebody who has not found it", () => {
    const res = runCommand("neofetch", { arcade: { seen: false, boards } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).not.toContain("FOR");
  });

  it("prints the boards once the door has been opened", () => {
    const res = runCommand("neofetch", { arcade: { seen: true, boards } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("FOR");
  });

  it("says the boards are unavailable rather than printing a gap", () => {
    const res = runCommand("neofetch", { arcade: { seen: true, boards: null } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("unavailable");
  });

  it("is unchanged for a context with no arcade at all", () => {
    const before = runCommand("neofetch", {});
    const after = runCommand("neofetch", { arcade: { seen: false, boards: null } });
    expect(before).toEqual(after);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd "$WT"
npx vitest run lib/commands/hidden.test.ts lib/commands/dispatch.test.ts lib/commands.test.ts
```

Expected: the door tests fail because `arcade` still returns `"arcade: no runtime yet"`; the `neofetch` tests fail on `ctx.arcade` not existing.

- [ ] **Step 3: Add the field to the context**

In `lib/commands/shared.ts`, correct the docblock on the `program` member of `CommandResult`, which still describes F1's placeholder:

```ts
  /**
   * A program for the terminal to host: a game, or the arcade's own cabinet.
   * The runtime is `lib/arcade/` and `components/arcade/ArcadeScreen.tsx`, and
   * `Terminal` is the only thing allowed to mount it.
   */
```

Then add the import and the field to `CommandContext`, after `presence`:

```ts
import type { ArcadeSession } from "@/lib/arcade/session";
```

```ts
  /**
   * What the arcade knows this session: whether the door has been opened, and
   * the last board snapshot the client fetched. Supplied by the Terminal, and
   * read only by `neofetch`, which prints the boards to somebody who has been
   * through the door and nothing at all to anyone else.
   */
  arcade?: ArcadeSession;
```

- [ ] **Step 4: Open the door**

Replace `lib/commands/hidden.ts` with:

```ts
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { createCabinet } from "@/lib/arcade/cabinet";
import { findGame, isReady } from "@/lib/arcade/games";
import { defineCommand } from "./registry";
import { argOf, ok } from "./shared";

/**
 * Doors. Nothing in this file appears in help, completion or ls. A door is
 * reached by name or as `cd <name>`, and the only hint anywhere is the
 * `arcade` row in `top`.
 *
 * `arcade` with no argument returns the cabinet, and `arcade <game>` returns
 * that game, so `cd arcade bounce` skips the list. Both are `{ type:
 * "program" }`: this file starts nothing and draws nothing, because
 * `lib/commands.ts` is pure and `components/Terminal.tsx` is the only thing
 * allowed to act on a result.
 */

/**
 * The refusal, as a named constant and a one-line guard, so
 * `scripts/mutation-check.mjs` can anchor on the guard and prove the tests
 * notice when it goes. Same shape as `GRAVITY_DECLINED` and `EJECT_DECLINED`
 * in `lib/commands/effects.ts`, and the same reason: a game is motion all the
 * way down and there is no still version of one.
 */
export const ARCADE_DECLINED: string[] = [...arcadeCopy.declined];

export const hidden = [
  defineCommand({
    name: "arcade",
    hidden: true,
    run: (args, ctx) => {
      if (ctx.reducedMotion) return ok(ARCADE_DECLINED);
      const wanted = argOf(args);
      if (!wanted) return { type: "program", program: createCabinet() };
      const game = findGame(wanted);
      if (!game) return ok([`arcade: no game called '${wanted}'`]);
      if (!isReady(game) || !game.spec) {
        return ok([`${GAME_TITLES[game.id] ?? game.id}: ${arcadeCopy.cabinet.notReady}`]);
      }
      return { type: "program", program: game.spec };
    },
  }),
];
```

- [ ] **Step 5: Teach `neofetch` the boards**

In `lib/commands/info.ts`, add the imports:

```ts
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { formatBoards } from "@/lib/arcade/board";
```

and append to the `neofetch` function, replacing its `return out;`:

```ts
  return [...out, ...arcadeBlock(ctx)];
}

/**
 * The boards, printed only to somebody who has been through the door this
 * session. The spec asks `neofetch` to print the boards and also asks `top` to
 * be the one hint; a permanent block of high scores in `neofetch` would be a
 * second hint and a louder one, so the session flag settles it. It is never
 * persisted, so a reload puts the machine back to one hint.
 */
function arcadeBlock(ctx: CommandContext): string[] {
  if (!ctx.arcade?.seen) return [];
  return ["", arcadeCopy.board.neofetchHeading, ...formatBoards(ctx.arcade.boards, 40, GAME_TITLES)];
}
```

- [ ] **Step 6: Run the tests**

```bash
cd "$WT"
npx vitest run
npx tsc --noEmit
```

Expected: green throughout, and in particular no remaining hit for:

```bash
grep -rn "no runtime yet" --include=*.ts --include=*.tsx . | grep -v node_modules
```

which should print nothing. That grep is the check that every one of the five places F1 left a placeholder has been dealt with.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add lib/commands/hidden.ts lib/commands/hidden.test.ts lib/commands/dispatch.test.ts lib/commands/info.ts lib/commands/shared.ts lib/commands.test.ts
git commit -m "feat(arcade): the door opens onto the cabinet"
```

---

### Task 12: `app/api/board`, and what happens when there is no Redis

**Conditional.** Run this task only if `lib/store/redis.ts` exists on `main` (F4 merged). If it does not, skip to Task 13, drop the two board-route rows from the mutation list, and record the skip in the ledger. Everything already built works without it: `fetchBoards` reads a 404 as unavailable, the cabinet prints the sentence, and the games play.

**Files:**
- Create: `app/api/board/route.ts`
- Create: `app/api/board/route.test.ts`
- Modify: `.env.example` (no new variables; a line saying the board shares Redis with the budgets)

**Interfaces:**
- Consumes: `getRedis` and `StoreUnavailableError` from `lib/store/`, `takeBudget` and `budgetKeyForIp` from `lib/budget.ts`, and the pure board modules
- Produces: `GET /api/board`, `POST /api/board`, and `BOARD_BUDGETS`

- [ ] **Step 1: Write the failing test**

Create `app/api/board/route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The route is glue: every decision it makes lives in `lib/arcade/board.ts`,
 * `lib/arcade/board-store.ts` and F4's `lib/budget.ts`, all tested directly.
 * These greps check the glue is wired the way the plan says, and in particular
 * that a missing store becomes a sentence rather than a 500.
 */

const code = readFileSync(join(process.cwd(), "app", "api", "board", "route.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

describe("the board route", () => {
  it("runs on node and is never prerendered", () => {
    expect(code).toMatch(/export const runtime = "nodejs";/);
    expect(code).toMatch(/export const dynamic = "force-dynamic";/);
  });

  it("turns a missing store into an available:false body, not an error", () => {
    expect(code).toMatch(/if \(error instanceof StoreUnavailableError\) return unavailableResponse\(\);/);
  });

  it("budgets both the read and the write", () => {
    expect(code.match(/takeBudget\(/g) ?? []).toHaveLength(3);
    expect(code).toMatch(/budgetKeyForIp\(request\.headers\)/);
  });

  it("re-checks the initials on the server, whatever the client sent", () => {
    expect(code).toMatch(/checkInitials\(/);
  });

  it("refuses a game nobody registered", () => {
    expect(code).toMatch(/BOARD_GAMES\.includes\(/);
  });

  it("stores a random member so two people can both be FOR", () => {
    expect(code).toMatch(/randomUUID\(\)/);
  });

  it("keeps nothing that identifies anybody", () => {
    // The constitution in AGENTS.md: anonymous aggregates only. The address
    // reaches budgetKeyForIp, which hashes it with a daily salt, and never
    // reaches the board.
    expect(code).not.toMatch(/x-forwarded-for/i);
    expect(code).not.toMatch(/writeScore\([^)]*headers/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "$WT"
npx vitest run app/api/board/route.test.ts
```

Expected: FAIL, `ENOENT` on `app/api/board/route.ts`.

- [ ] **Step 3: Write the route**

Create `app/api/board/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { arcadeCopy } from "@/content/arcade";
import { BOARD_GAMES } from "@/lib/arcade/games";
import { checkInitials, insertScore } from "@/lib/arcade/board";
import type { BoardSnapshot } from "@/lib/arcade/board";
import { readBoards, writeScore } from "@/lib/arcade/board-store";
import { budgetKeyForIp, takeBudget } from "@/lib/budget";
import { getRedis } from "@/lib/store/redis";
import { StoreUnavailableError } from "@/lib/store/errors";

/**
 * `/api/board`: three characters and a score, per game, top twenty.
 *
 * ## What it keeps, and what it cannot
 *
 * A sorted set per game holding `<initials>#<nonce>` against a number. No
 * address, no identifier, nothing to join on, and no way back to a person.
 * F4's `budgetKeyForIp` hashes the address with a daily salt for the counter
 * and this route never sees the raw value. That is the constitution in
 * AGENTS.md: server-side, anonymous aggregates only.
 *
 * ## When the store is not there
 *
 * `getRedis()` throws `StoreUnavailableError` when its variables are missing,
 * which is production's state until F4's Upstash provisioning lands. That is
 * answered with **200 and `available: false`**, not a 500 and not a 503,
 * because an absent board is a normal state of this site rather than a fault
 * in this request, and the client draws a sentence from it. A budget refusal
 * is the opposite: it is about this caller, so it is a 429 carrying the
 * sentence to print. Anything else genuinely unexpected is left to throw and
 * become a 500, which `lib/arcade/board-client.ts` also reads as unavailable,
 * so a visitor never sees a broken screen either way.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400;

/**
 * Chosen against the free tier's 500,000 commands a month: a read is one
 * command per game and a write is two, so the global caps below cost at most
 * about 90,000 commands in a month at the ceiling.
 */
export const BOARD_BUDGETS = {
  readPerIp: 120,
  writePerIp: 20,
  writeGlobal: 2_000,
};

const UNAVAILABLE: BoardSnapshot = {
  available: false,
  boards: [],
  note: arcadeCopy.board.unavailable.join(" "),
};

function unavailableResponse(): Response {
  return Response.json(UNAVAILABLE, { status: 200 });
}

function refused(reason: string, retryAfterSec: number): Response {
  return Response.json({ ok: false, reason }, {
    status: 429,
    headers: { "retry-after": String(retryAfterSec) },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const budget = await takeBudget({
      tool: "arcade-board",
      scope: "ip",
      key: budgetKeyForIp(request.headers),
      limit: BOARD_BUDGETS.readPerIp,
      windowSec: DAY,
    });
    if (!budget.ok) return refused(budget.reason, budget.retryAfterSec);
    const boards = await readBoards(getRedis(), BOARD_GAMES);
    return Response.json({ available: true, boards } satisfies BoardSnapshot);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return unavailableResponse();
    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: arcadeCopy.initials.refused }, { status: 400 });
  }
  const { game, initials, score } = (body ?? {}) as {
    game?: unknown;
    initials?: unknown;
    score?: unknown;
  };

  if (typeof game !== "string" || !BOARD_GAMES.includes(game)) {
    return Response.json({ ok: false, reason: arcadeCopy.initials.refused }, { status: 400 });
  }
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10_000_000) {
    return Response.json({ ok: false, reason: arcadeCopy.initials.refused }, { status: 400 });
  }
  // Checked again here whatever the client did with it: a client-side check is
  // a courtesy, never a control.
  const check = checkInitials(typeof initials === "string" ? initials : "");
  if (!check.ok) return Response.json({ ok: false, reason: check.reason }, { status: 400 });

  try {
    const perIp = await takeBudget({
      tool: "arcade-board-write",
      scope: "ip",
      key: budgetKeyForIp(request.headers),
      limit: BOARD_BUDGETS.writePerIp,
      windowSec: DAY,
    });
    if (!perIp.ok) return refused(perIp.reason, perIp.retryAfterSec);
    const global = await takeBudget({
      tool: "arcade-board-write",
      scope: "global",
      key: "all",
      limit: BOARD_BUDGETS.writeGlobal,
      windowSec: DAY,
    });
    if (!global.ok) return refused(global.reason, global.retryAfterSec);

    const redis = getRedis();
    const whole = Math.floor(score);
    await writeScore(redis, game, check.initials, whole, randomUUID().slice(0, 8));
    const [board] = await readBoards(redis, [game]);
    return Response.json({
      ok: true,
      board: board ?? { game, rows: insertScore([], { initials: check.initials, score: whole }) },
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) return unavailableResponse();
    throw error;
  }
}
```

- [ ] **Step 4: Prove the unavailable path against a real request**

```bash
cd "$WT"
env -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN -u KV_REST_API_URL -u KV_REST_API_TOKEN npm run build
env -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN -u KV_REST_API_URL -u KV_REST_API_TOKEN npm start &
sleep 4
curl -s -i http://localhost:3000/api/board | head -20
curl -s -i -X POST http://localhost:3000/api/board -H 'content-type: application/json' -d '{"game":"bounce","initials":"FOR","score":12}' | head -20
kill %1
```

Expected, and this is the acceptance criterion for the whole "no Redis" question: both answer **200** with `{"available":false,...}`, the process logs no unhandled error, and nothing 500s. If either returns a 500, the `StoreUnavailableError` branch is not catching what is actually thrown, and the fix is in this route rather than in the client.

- [ ] **Step 5: Run the tests and commit**

```bash
cd "$WT"
npx vitest run
npx tsc --noEmit
git add app/api/board/ .env.example
git commit -m "feat(arcade): a board that answers when there is nothing behind it"
```

---

### Task 13: The mutation rows

**Files:**
- Modify: `scripts/mutation-check.mjs` (append to `MUTATIONS`)

**Interfaces:**
- Consumes: the guards written in Tasks 3 to 12
- Produces: nineteen more rows, all expected RED, plus two more when Task 12 ran

Every anchor below is a single line, or uses `\r?\n` where it is not. The working tree is mixed: `app/globals.css` and `lib/commands.ts` are CRLF, `components/Terminal.tsx` is LF, and the files this plan creates will be whatever the editor gives them. A bare `\n` in a multi-line anchor matches nothing and is reported as `ANCHOR-MISS`, which is a failure, never a skip.

- [ ] **Step 1: Add the entries**

After the last existing entry in `MUTATIONS`, before the closing `];`:

```js
  // ── the arcade runtime (G0) ──
  {
    name: "the arcade stops declining under reduced motion",
    file: "lib/commands/hidden.ts",
    pattern: /if \(ctx\.reducedMotion\) return ok\(ARCADE_DECLINED\);/,
    replace: "if (false) return ok(ARCADE_DECLINED);",
  },
  {
    name: "the door launches a game nobody has built",
    file: "lib/commands/hidden.ts",
    pattern: /if \(!isReady\(game\) \|\| !game\.spec\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the loop plays back a stall instead of dropping it",
    file: "lib/arcade/loop.ts",
    pattern: /if \(steps >= MAX_TICKS_PER_FRAME\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the loop throws its remainder away, so speed drifts with the frame rate",
    file: "lib/arcade/loop.ts",
    pattern: /    state\.acc -= TICK_MS;/,
    replace: "    state.acc = 0;",
  },
  {
    name: "the grid draws a glyph too small to be one",
    file: "lib/arcade/grid.ts",
    pattern: /if \(w < MIN_CELL_PX\) continue;/,
    replace: "if (false) continue;",
  },
  {
    name: "a screen with no room gets a clipped grid instead of a sentence",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(measured && !fit\) leave\(\[\.\.\.arcadeCopy\.noRoom\]\);/,
    replace: "if (false) leave([...arcadeCopy.noRoom]);",
  },
  {
    name: "the arrows scroll the page out from under the player",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(shouldCapture\(e\.key, mods\)\) e\.preventDefault\(\);/,
    replace: ";",
  },
  {
    name: "Escape stops leaving the arcade",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(e\.key === "Escape"\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the arcade's keys reach the drawer, so one Escape closes both",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    e\.stopPropagation\(\);\r?\n    if \(e\.key === "Escape"\) \{/,
    replace: '    if (e.key === "Escape") {',
  },
  {
    name: "the grid is rewritten every frame whether or not it changed",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(next === lastDrawnRef\.current\) return;/,
    replace: ";",
  },
  {
    name: "a score is reported as posted before the server answered",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /leave\(\[result\.ok \? arcadeCopy\.initials\.saved : result\.reason\]\);/,
    replace: "leave([arcadeCopy.initials.saved]);",
  },
  {
    name: "initials skip the blocklist",
    file: "lib/arcade/board.ts",
    pattern: /if \(BLOCKED_INITIALS\.has\(folded\)\)/,
    replace: "if (false)",
  },
  {
    name: "initials stop being folded, so 4SS gets on the board",
    file: "lib/arcade/board.ts",
    pattern: /  const folded = foldLeet\(cleaned\);/,
    replace: "  const folded = cleaned;",
  },
  {
    name: "initials are truncated rather than refused, so the site picks them for you",
    file: "lib/arcade/board.ts",
    pattern: /if \(cleaned\.length !== INITIALS_LENGTH\)/,
    replace: "if (cleaned.length < INITIALS_LENGTH)",
  },
  {
    name: "the board keeps every score ever posted",
    file: "lib/arcade/board.ts",
    pattern: /\.sort\(\(a, b\) => b\.score - a\.score\)\.slice\(0, size\)/,
    replace: ".sort((a, b) => b.score - a.score)",
  },
  {
    name: "the client trusts a body that never said it was available",
    file: "lib/arcade/board-client.ts",
    pattern: /  if \(body\.available !== true\) return UNAVAILABLE;/,
    replace: "  if (false) return UNAVAILABLE;",
  },
  {
    name: "a network failure becomes a crash instead of a sentence",
    file: "lib/arcade/board-client.ts",
    pattern: /  \} catch \{\r?\n    return UNAVAILABLE;\r?\n  \}/,
    replace: "  } catch (error) {\n    throw error;\n  }",
  },
  {
    name: "neofetch prints the boards to somebody who never found the door",
    file: "lib/commands/info.ts",
    pattern: /if \(!ctx\.arcade\?\.seen\) return \[\];/,
    replace: "if (false) return [];",
  },
  {
    name: "the cabinet launches a game with no program behind it",
    file: "lib/arcade/cabinet.ts",
    pattern: /if \(!isReady\(game\)\) return \{ state: \{ index, note: arcadeCopy\.cabinet\.notReady \}, launch: null \};/,
    replace: "if (false) return { state: { index, note: arcadeCopy.cabinet.notReady }, launch: null };",
  },
```

And, **only if Task 12 ran**, two more:

```js
  {
    name: "a missing store takes the board route down instead of answering",
    file: "app/api/board/route.ts",
    pattern: /if \(error instanceof StoreUnavailableError\) return unavailableResponse\(\);/,
    replace: "if (false) return unavailableResponse();",
  },
  {
    name: "the route trusts whatever initials the client sent",
    file: "app/api/board/route.ts",
    pattern: /const check = checkInitials\(typeof initials === "string" \? initials : ""\);/,
    replace: 'const check = { ok: true, initials: String(initials) };',
  },
```

- [ ] **Step 2: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs 2>&1 | tail -40
git status --short
```

Expected: every row RED, including the new ones, and a clean tree afterwards apart from the script itself. It takes a while: about 95 suite runs at the time of writing.

Which test catches which, so a green row can be diagnosed rather than guessed at:

| Mutation | The test that must fail |
|---|---|
| reduced motion, door launches an unbuilt game | `lib/commands/hidden.test.ts` |
| loop stall, loop remainder | `lib/arcade/loop.test.ts`, "refuses to run a banked backlog" and "keeps the remainder" |
| min cell | `lib/arcade/grid.test.ts`, "refuses when the scale would take the cell under the legibility floor" |
| the five `ArcadeScreen` rows | `components/arcade/arcade.test.ts` greps |
| the four `board.ts` rows | `lib/arcade/board.test.ts` |
| the two `board-client.ts` rows | `lib/arcade/board-client.test.ts` |
| neofetch | the `neofetch and the boards` block |
| cabinet | `lib/arcade/cabinet.test.ts`, "says a game is not built" |
| the two route rows | `app/api/board/route.test.ts` |

If a row comes back GREEN, the guard it names is decoration: find the test that should have failed, make it fail, and run again. If a row reports `ANCHOR-MISS`, the code on disk and the code in this plan differ; fix the code to match the plan, since every anchor here was written against the code above.

- [ ] **Step 3: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(mutation): the arcade's guards are mutated too"
```

---

### Task 14: The phone check, at 390 and 320, on real WebKit

**Files:**
- Create then delete: `phone-arcade.mjs` in a scratch directory outside the repository
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (the predictions, then the readings)

**Interfaces:**
- Consumes: a production build of the branch
- Produces: measurements at both widths, against predictions written first

**Write the predictions into the ledger before running anything.** That is the point of the task: a measurement taken after the expectation is written is evidence, and one taken before it is a story you can fit to whatever came back. If a reading disagrees, the reading wins and the disagreement is the finding.

- [ ] **Step 1: Write the predictions down and commit them**

Append to the ledger log, before any browser is opened:

```markdown
- 2026-09-04: G0 phone-check predictions, written before the run.
  - `/writing/why-presterly-wound-down`, WebKit iPhone at **390 by 844**, drawer open, `cd arcade`: the grid picks **40 by 18 at scale 1**. Working: 390 less about 24px of terminal padding is ~366 usable; 48 columns need 461 and do not fit, 40 need 384 at a 9.6px advance and do; the drawer allows about 410px of height and 18 rows need 337.
  - The same route at **320 by 568**: **32 by 16 at scale 0.8**, so a 12px cell. Working: 296 usable width rules out 40 columns; at full size 16 rows need 300px against about 245 available, 0.9 needs 270 and still does not fit, 0.8 needs 240 and does.
  - Home page, inline terminal, **390 by 844**: **32 by 16 at scale 1**. The page container is narrower than the drawer and the arcade asks for min(56vh, 440px) of height.
  - Everywhere: no horizontal overflow on the document, the grid does not scroll inside itself, the exit control is at least 44 by 44, and a swipe moves the character.
  - If the 320 reading comes back null (the refusal), that is not a failure of the run: it is the sentence in `arcadeCopy.noRoom` doing its job, and the finding is that the drawer is too short for the smallest board, which is a CSS decision for Fergus rather than a bug to hide.
```

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): g0 phone-check predictions, written first"
```

- [ ] **Step 2: Build and serve the branch**

```bash
cd "$WT"
npm run build
npm start &
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

Expected: `200`. Serve the **production build**, never `npm run dev`: F3's run was re-taken because its predecessor measured a stale build, and that is in the ledger.

- [ ] **Step 3: Drive real WebKit at both widths**

If `scripts/phone-check.mjs` exists on `main` (F3 merged), run it first for the route-level floors:

```bash
cd "$WT"
node scripts/phone-check.mjs http://localhost:3000/writing/why-presterly-wound-down
```

Either way, the arcade needs its own run, because the checker walks a route and the arcade only exists after a command. Write this to a scratch file outside the repository, so nothing untracked lands in the working tree:

```js
// C:/Users/oreil/AppData/Local/Temp/claude/phone-arcade.mjs
import { devices, webkit } from "playwright";

const BASE = "http://localhost:3000";
const CASES = [
  { name: "drawer 390", path: "/writing/why-presterly-wound-down", width: 390, height: 844, drawer: true },
  { name: "drawer 320", path: "/writing/why-presterly-wound-down", width: 320, height: 568, drawer: true },
  { name: "inline 390", path: "/", width: 390, height: 844, drawer: false },
];

const browser = await webkit.launch();
for (const testCase of CASES) {
  const context = await browser.newContext({
    ...devices["iPhone 12"],
    viewport: { width: testCase.width, height: testCase.height },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(BASE + testCase.path, { waitUntil: "networkidle" });
  if (testCase.drawer) await page.click(".statusbar__prompt");
  await page.click(".term__input");
  await page.fill(".term__input", "cd arcade");
  await page.press(".term__input", "Enter");
  await page.waitForSelector(".arcade__grid", { timeout: 5000 }).catch(() => null);

  const reading = await page.evaluate(() => {
    const grid = document.querySelector(".arcade__grid");
    const exit = document.querySelector(".arcade__exit");
    const doc = document.documentElement;
    if (!grid) {
      return { refused: true, overflow: doc.scrollWidth - doc.clientWidth };
    }
    const style = getComputedStyle(grid);
    const exitRect = exit?.getBoundingClientRect();
    return {
      refused: false,
      cols: grid.dataset.cols,
      rows: grid.dataset.rows,
      scale: grid.dataset.scale,
      fontPx: parseFloat(style.fontSize),
      colour: style.color,
      gridOverflow: grid.scrollWidth - grid.clientWidth,
      overflow: doc.scrollWidth - doc.clientWidth,
      exit: exitRect ? [Math.round(exitRect.width), Math.round(exitRect.height)] : null,
      firstLine: (grid.textContent ?? "").split("\n")[0],
    };
  });
  console.log(testCase.name, JSON.stringify(reading));

  // A swipe has to change something, or the phone cannot play.
  if (!reading.refused) {
    const box = await page.locator(".arcade__grid").boundingBox();
    await page.locator(".arcade__grid").click();
    await page.keyboard.press("2");
    const afterKey = await page.evaluate(() => document.querySelector(".arcade__grid")?.textContent ?? "");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2 + 70, { steps: 6 });
    await page.mouse.up();
    const afterSwipe = await page.evaluate(() => document.querySelector(".arcade__grid")?.textContent ?? "");
    console.log(testCase.name, "swipe changed the screen:", afterKey !== afterSwipe);

    // Escape returns the prompt and leaves the scrollback alone.
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => ({
      prompt: Boolean(document.querySelector(".term__input")),
      scrollback: (document.querySelector(".term__scroll")?.textContent ?? "").includes("cd arcade"),
      drawerStillOpen: Boolean(document.querySelector("#shell-drawer")),
    }));
    console.log(testCase.name, "after escape:", JSON.stringify(back));
  }
  await context.close();
}
await browser.close();
```

```bash
npx --yes playwright@1.55.0 install webkit
node "C:/Users/oreil/AppData/Local/Temp/claude/phone-arcade.mjs"
```

`npx --yes playwright@1.55.0` is used on purpose: it installs into the npx cache and adds nothing to `package.json` or the lockfile. `playwright` as a devDependency is F3's to earn, and this plan adds no dependency.

- [ ] **Step 4: Compare against the predictions, and fix what is wrong in the page**

Pass criteria, all of which must hold at both widths:

1. `overflow` is zero or negative on the document.
2. `gridOverflow` is zero: the grid does not scroll inside itself, which would mean it is drawing wider than it measured.
3. `fontPx` is at least 11. Below that the type is a smudge on a real phone, whatever the ratios say.
4. `exit` is at least `[44, 44]`.
5. `swipe changed the screen` is `true`.
6. After Escape: `prompt` true, `scrollback` true (the history survived), `drawerStillOpen` true (the first Escape left the game, not the shell).
7. `colour` against the terminal's ground is at least 4.5:1. `--green-bright` on `#070b07` is what every other line of terminal text already uses, so a failure here is a finding about the theme rather than about the arcade, and it goes in the ledger either way.

Where a reading disagrees with a prediction, write both down and say which is right. Where a criterion fails, **fix the page, not the criterion**, and prove the fix by reverting it and watching the failure come back. That is the standing rule, and F3's run is in the ledger as the example of what happens when a checker is adjusted to fit a page.

- [ ] **Step 5: Record the readings and commit**

Append the readings under the predictions, naming what was measured and what was not: no real device, no phone GPU, one browser engine on a desktop kernel, and the emulated `iPhone 12` user agent rather than a phone.

```bash
cd "$WT"
kill %1
rm "C:/Users/oreil/AppData/Local/Temp/claude/phone-arcade.mjs"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): g0 phone readings at 390 and 320"
```

---

### Task 15: Docs, pull request, deploy, live check

**Files:**
- Modify: `AGENTS.md` (the section "The terminal is a real subsystem", plus one clause in "What the site may keep")
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above
- Produces: a merged pull request, a `READY` deployment, and a live check with its limits stated

- [ ] **Step 1: Amend AGENTS.md**

In "The terminal is a real subsystem", replace the last sentence of the first paragraph (the one ending "and the `arcade` row in `top` is the one hint") with:

```markdown
A `hidden: true` command is absent from help, completion and `ls`, and is reachable only by name or
through `cd <name>`: that is the door to the arcade, and the `arcade` row in `top` is the one hint.
Since 2026-09-04 that door opens something. `lib/arcade/` is a program runtime the terminal hosts:
a fixed 30Hz tick driven by `SystemProvider`'s one rAF clock, a character grid sized from the
measured cell (48 by 20 down to 32 by 16, and a sentence rather than a clipped grid when even the
smallest will not fit), one key vocabulary for arrows, WASD and swipes, and `Escape` always exiting
to the prompt with the scrollback intact. A game is a `ProgramSpec` in `lib/arcade/<game>.ts` plus
one line in `ARCADE_GAMES`; it writes no React, no CSS and no route. The arcade declines under
`prefers-reduced-motion: reduce` the way `gravity` and `eject` do, in a sentence.
```

In "What the site may keep", the first clause already names "arcade initials" as an example. Add after the sentence about `fergusos:`:

```markdown
The arcade writes exactly one key, `fergusos:arcade.initials`, and only when a visitor posts a
score. Whether the door has been found this session, and the last board it read, live at module
level in `lib/arcade/session.ts` and die with the tab: nothing about the arcade is persisted except
the three characters somebody chose.
```

- [ ] **Step 2: Add the PROGRESS.md entry**

At the top of `docs/PROGRESS.md`, in the file's voice:

```markdown
## 2026-09-04: the arcade runtime

G0 of the toolshed programme. `cd arcade` opens a cabinet instead of printing an apology.
`lib/arcade/` is a fixed 30Hz loop on the site's one frame clock, a character grid measured from
the font rather than assumed, one key vocabulary covering the arrows, WASD, swipes and taps, five
synth sounds, and a board of three-letter initials. A game is now a file and one line in a list.
`bounce` ships as the worked example and is the fixture every runtime test drives.

Not verified: the board against a real Redis, because F4 is <merged | still unmerged> and Upstash
is not provisioned; the live board therefore reads "boards are unavailable", which is the path
that was tested. No real device, only a WebKit iPhone emulation at 390 and 320.
```

- [ ] **Step 3: Commit, push, open the pull request**

Move the ledger's G0 row to `**pr**`.

```bash
cd "$WT"
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(arcade): the door opens onto a runtime now"
git push -u origin toolshed/g0-arcade-runtime
gh pr create --title "feat(arcade): the arcade runtime (toolshed g0)" --body-file - <<'BODY'
G0 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6).

The terminal can host a program. `lib/arcade/` is the loop (fixed 30Hz on `SystemProvider`'s one rAF clock), the grid (48x20 down to 32x16, chosen from the measured character cell, a sentence when nothing fits), the input (one vocabulary for arrows, WASD, swipes and taps; the page never scrolls under the player; Escape always exits to the prompt with the scrollback intact), five synth sounds, and the boards.

`cd arcade` opens the cabinet. It stays out of `help`, completion and `ls`; `top` is still the one hint; `neofetch` prints the boards only to somebody who has been through the door. The arcade declines under `prefers-reduced-motion: reduce` in a sentence, the way `gravity` and `eject` do.

**A game plan is now three lines of work**: a `ProgramSpec` in `lib/arcade/<game>.ts`, one entry in `ARCADE_GAMES`, one title in `content/arcade.ts`. No React, no CSS, no route, no board wiring.

Tests: every decision is a pure function tested in node; the React is greps in the pattern of `lib/boot.test.ts`. Mutation check: nineteen new rows, all red. Phone: real WebKit iPhone at 390 and 320, predictions written into the ledger first.

Not verified: the board against a real Redis (F4 unmerged, Upstash unprovisioned), so the tested and shipped path is the unavailable one. No real device.

Plan: `docs/superpowers/plans/2026-09-04-toolshed-g0-arcade-runtime.md`.
BODY
```

Fill the pull request number into the ledger row and the log, and commit that as `docs(programme): g0 pr number`.

- [ ] **Step 4: Wait for CI, then merge**

```bash
cd "$WT"
gh pr checks --watch
gh pr merge --merge
```

Expected: `check` and `mutation` both pass before the merge is allowed. Do not pass `--delete-branch`; repository hygiene owns branch removal.

- [ ] **Step 5: Confirm the deployment from the API**

Never `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building".

```bash
SHA=$(git -C "$WT" rev-parse origin/main)
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=3&target=production" \
  | python -c "import sys,json; [print(d['uid'], d['state'], d.get('meta',{}).get('githubCommitSha','')[:7], d.get('target')) for d in json.load(sys.stdin)['deployments']]"
echo "$SHA"
```

Expected: the top row is `READY`, `production`, and its short SHA matches. Then confirm the alias:

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v13/deployments/<uid>?teamId=team_SW7xEyTEz5ftQj3cIxulWxKG" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['readyState'], d.get('aliasAssigned'))"
```

- [ ] **Step 6: Exercise the live flow, not the route**

Against `https://fergusoreilly.dev` in a real browser (the Playwright MCP or the Chrome MCP). Run `~/.claude/scripts/instrument-check.js` first if any probe behaves oddly: a hidden tab is the default state for MCP browser work and it is what produced three wrong diagnoses on 2026-08-21.

1. Home page, click the terminal, type `help`, Enter. Look for: no `arcade` anywhere in the output.
2. Type `arc`, press Tab. Look for: nothing completes.
3. Type `ls`, Enter. Look for: the six sections and no `arcade`.
4. Type `top`, Enter. Look for: one `arcade` row. This is the only hint and it must still be there.
5. Type `cd arcade`, Enter. Look for: the grid, the cabinet title, five games, four in brackets, and a board panel reading the unavailable sentence (or a real board, if F4 landed first).
6. Press the down arrow twice. Look for: the cursor moving, and the page **not** scrolling.
7. Press Enter on `phosphor pong`. Look for: `not built yet` on the footer line, and no crash.
8. Press `1`, then Enter. Look for: `bounce` running, a character moving about ten cells a second, and the bounce counter climbing.
9. Press Escape. Look for: the prompt back with the caret in it, `cd arcade` still in the scrollback above, and the earlier `help` and `top` output still there.
10. Type `neofetch`, Enter. Look for: the usual block, plus an `Arcade` heading and the board block. Reload the page and type `neofetch` again: the block must be **gone**, because the session flag died with the reload.
11. Turn on reduced motion at the operating system level, reload, type `cd arcade`. Look for: three lines starting `arcade: declined.` and no grid.
12. Open a writing page, press the backtick to open the drawer, type `cd arcade`. Look for: the grid in the drawer. Press Escape once: the game leaves and **the drawer stays open**. Press Escape again: the drawer closes.
13. Read the browser console throughout. Look for: zero errors.

- [ ] **Step 7: Record it, with the limits**

Move the ledger's G0 row to `**live**` with the deployment uid, and write the log line naming what was checked and what was not. What this check cannot cover, and must say so:

- the board against a real Redis, if F4 was still unmerged: the only path exercised was the unavailable one, so "the board works" is not a claim this run earns;
- a real phone, as opposed to a WebKit emulation at 390 and 320;
- the four games, which do not exist;
- the shader's cost with a game running on a phone GPU;
- audio, unless `sound on` was typed during the run, in which case say so.

Then commit the ledger straight to `main` as a docs-only change:

```bash
cd /c/Dev/fergus-portfolio
git pull --ff-only
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): g0 live"
git push
```

---

## Self-review

Run against the spec with fresh eyes, per the skill. Issues found were fixed inline rather than noted; what follows is what the check covered and the three things it changed.

**1. Spec coverage.** Section 6, G0, sentence by sentence:

| Spec sentence | Where it lands |
|---|---|
| "`lib/arcade/`: a program loop the terminal hosts" | Tasks 3 to 10 |
| "A text grid (48 by 20 on desktop, 32 by 16 at 320)" | Task 4, `GRID_SIZES`, measured not assumed, with a 40 by 18 rung between them so a 400px box is not forced down to the phone size |
| "a fixed-step tick" | Task 3, 30Hz, defended in the decisions section and in the module docblock |
| "key handling and swipe handling" | Task 5, and the routing in Task 10 |
| "`Escape` always exits and always restores the prompt" | Task 10: taken before the program is asked, plus the focus effect in `Terminal.tsx`, plus live check items 9 and 12 |
| "a sound hook into the synth" | Task 6 |
| "the phosphor persistence doing the trails for free" | Task 6 and the decisions section, **corrected**: the shader does not sample the DOM, so there is no free trail. What is real is the glass over the top, the text glow the terminal already has, and `host.flash`, which pushes an impact onto the frame the shader and the synth both read. Saying "free trails" without checking would have been the exact "consistent with" failure `CLAIMS.md` names |
| "The door: `cd arcade` (hidden) prints the cabinet and the game list" | Task 11 and Task 9. The cabinet is a program drawn in the grid, not printed text, which is what "drawn in the grid" in the brief asks for |
| "`top` shows an `arcade` process as the one hint" | Unchanged from F1, asserted in Task 11's tests |
| "`api/board`: three-letter initials and a score, per game, top twenty, in Redis" | Tasks 8 and 12 |
| "initials filtered against a short blocklist" | Task 2 (the list and the rule) and Task 8 (the check), with the rule written out and the fold tested |
| "the board printed by `neofetch` and inside the cabinet" | Task 11 and Task 9 |
| "Reduced motion declines the arcade the way it declines gravity, with a sentence" | Task 2's copy, Task 11's guard, and Task 10's mid-game exit |

Section 8's frozen interfaces: reproduced verbatim at the top, with the three additions to `program.ts` justified and proven compatible by a compile-time fixture. Section 9's standard: tests first with the pure logic in `lib/` and thin React; the phone check on real engines at 390 and 320; the mutation check whenever a guard is touched; a hosted route proving its budget refuses; the verifier exercising the flow rather than the status code; and every completion note stating its limits.

**2. Placeholder scan.** Every code step carries the code. No "TBD", no "similar to Task N", no "add error handling". Four things were fixed on this pass:

- Task 11 said "create `lib/commands/hidden.test.ts`" and left the rest of F1's placeholder unaccounted for. `grep -rn "no runtime yet"` finds it in **five** places, not one: the command, two test files (`hidden.test.ts` and `dispatch.test.ts`), a docblock in `shared.ts`, and two greps in `components/terminal.test.ts`. All five are now named, the grep itself is the acceptance check at the end of Task 11, and the file structure table says "modify" where the file already exists.

- Task 9 originally showed a wrong `createCabinet` with a cast onto the frozen `ProgramInstance` type and then corrected it in prose. A plan that shows the wrong version first is a plan whose reader implements the wrong version, so the cast is gone and the cabinet reads the session instead.
- Task 4's `fitGrid` walked the size ladder outside the scale ladder, which would have picked 48 columns at eight tenths over 40 at full size. The loops are swapped, the docblock says which and why, and a test pins it.
- Task 9's initials program called `host.exit()` on submit, which would have printed "score posted" before anything was posted: the same failure as a spam filter reporting a caught message as sent. It now hands over and waits, `ArcadeScreen` exits with what the server actually said, and there is a mutation row on that ternary.

**3. Type consistency.** `ArcadeKey` is the first parameter of `ProgramInstance.key`, the return of `arcadeKey`, the `press` in `Delivery`, and the input to `cabinetReduce` and `initialsReduce`. `BoardSnapshot` is what `fetchBoards` returns, what `setArcadeBoards` takes, what `formatBoards` and `cabinetView` read, and what the route's GET body is. `Board` and `BoardRow` are the same shapes in `board.ts`, `board-store.ts`, `board-client.ts` and the route. `ProgramSpec` is what `createCabinet`, `createInitialsProgram`, `bounce` and `ArcadeGame.spec` all are. `arcadeCopy.board.unavailable` is an array everywhere it is used, including the content test and the route's `note`. `GAME_TITLES` is `Record<string, string>` in content, in `games.ts`, in `formatBoards` and in `initialsView`.

**4. Three things this plan does not do, said plainly.**

- **It does not prove the board against a real Redis.** F4 is unmerged and Upstash is unprovisioned, so every Redis path is proven against a hand-written fake and one real request with the variables unset. When the stores land, the honest follow-up is one session: post a score, read it back from two function instances, and check the key holds twenty rows and not twenty-one.
- **It does not make the arcade usable by a screen reader.** A text-grid game is not operable by one, and dressing it in ARIA would repeat the `aria-label` mistake AGENTS.md already names. What it does instead is tell the truth: `role="application"` with a described control scheme, the grid itself `aria-hidden`, and a real focusable exit button.
- **It does not add a persistence trail behind a moving glyph.** The honest options were a faked CSS trail, which would fight the real shader, or emitting into the sim buffer, which has no public seam. `host.flash` is the seam that does exist and it is capped at one impact a frame. If a real trail is wanted later, it is a change to `PhosphorScreen`, and per AGENTS.md that means measuring pixels with `gl.readPixels` rather than tuning a constant by eye.
