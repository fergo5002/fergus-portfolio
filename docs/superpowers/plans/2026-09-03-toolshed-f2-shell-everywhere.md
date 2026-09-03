# F2 The Shell Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The terminal is on every route: inline on the home page as now, and everywhere else in a drawer at the foot of the screen opened by the backtick key, by the prompt in the status bar, or by a tap on that prompt on a phone, with one shared history, an Escape that closes it, two new commands (`forget`, `who`), and the three constitution clauses from the design written into `AGENTS.md`.

**Architecture:** Three small pure modules carry the state: `lib/shell.ts` (the drawer's open/closed machine and the hotkey predicate), `lib/history.ts` (the scrollback and recall list, module-level so they survive client navigation), and `lib/forget.ts` (which keys the site owns and how to remove them over a Storage-like interface). A generic `createStore` in `lib/external-store.ts` turns a reducer into something `useSyncExternalStore` can read. `components/ShellDrawer.tsx` is mounted once in `app/layout.tsx` inside `CrtShell`, renders nothing while closed, and hosts the same `Terminal` component when open. The status bar gets a real `$ prompt` button, 44px in both directions on small screens. `forget` and `who` are a new command module registered through F1's registry; `forget` returns an effect that `Terminal.tsx` applies, so `lib/commands` stays pure.

**Tech Stack:** Next.js 15 (App Router), React 19 (`useSyncExternalStore`, `useId`), TypeScript 5.7, vitest 2 in a `node` environment with no jsdom, hand-written CSS in `app/globals.css`. No new dependencies.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 2 (the three clauses), section 6 (F2), section 8 (segmentation), section 9 (verification standard, including the phone check). Depends on F1 merged: this plan imports `lib/commands/registry.ts` and `lib/commands/shared.ts`.
- From `AGENTS.md`, "The terminal is a real subsystem": **`lib/commands.ts` stays pure ... `Terminal.tsx` is the only place allowed to apply an effect.** `forget` therefore returns `{ kind: "forget", keys }` and never touches storage itself.
- From `AGENTS.md`: **"Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS."** and **"reach for CSS first."** The drawer is CSS; its one animation is a keyframe.
- From `AGENTS.md`: **"Accessibility is non-negotiable: every animation must be gated behind `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a static/instant fallback."** The drawer slides for nobody who asked for stillness: it appears.
- From `AGENTS.md`: **"One frame clock. ... Never start another rAF loop, and never `setState` from inside a frame callback."** Nothing here subscribes to the frame.
- From `AGENTS.md`: **"All editable content lives in `content/*.ts`: never hard-code copy in components."** Command copy stays with the commands in `lib/commands/`, as it does today; the drawer's two labels (`fsh`, `esc`) are chrome, not copy.
- From `AGENTS.md`, the PostHog bullet: **"No cookies, no local storage, no banner."** Stays true for analytics and is restated in the new clause.
- Memory rule, "The phone is the product surface, not a breakpoint (2026-08-30)": the drawer is checked on a real WebKit engine at 390 and 320, not on a resized desktop window. A resized window does not count.
- `content/voice.test.ts` scans every `.ts` and `.tsx` outside tests for em dashes. None may appear in new code, comments included.
- Tests are vitest only, beside the source as `*.test.ts`, `node` environment. Components cannot be mounted; behaviour lives in `lib/` and is tested there, and the wiring is checked by string greps with comments stripped (the pattern in `lib/boot.test.ts` and `components/chrome.test.ts`).
- Frozen interfaces (below) are used with these exact names; adding an export is fine, renaming is not.
- Public repository: pull request on branch `toolshed/f2-shell-everywhere` in its own worktree. Never force-push, never rewrite history, never delete a branch.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`. Every completion note states what was not verified, per `C:\Users\oreil\.claude\CLAIMS.md`.
- `app/globals.css`, `app/layout.tsx` and `AGENTS.md` are CRLF on disk; `components/Terminal.tsx` and `components/system/StatusBar.tsx` are LF. Any multi-line regex in a test or mutation anchor uses `\r?\n`.

## Frozen interfaces (verbatim, shared with every other toolshed plan)

```ts
// lib/commands/registry.ts
export type CommandDef = {
  name: string;
  aliases?: string[];
  help?: string;                 // one line for HELP_LINES; omitted or hidden => not listed
  hidden?: boolean;              // absent from help, completion and ls
  argPool?: string[] | ((ctx: CommandContext) => string[]);  // completion candidates for the first argument
  run: (args: string[], ctx: CommandContext, raw: string) => CommandResult;
};
export function defineCommand(def: CommandDef): CommandDef;
export function registerCommands(defs: CommandDef[]): void;   // alphabetical registration lines live in lib/commands/index.ts
export function listCommands(): CommandDef[];                 // visible only, sorted by name
export function findCommand(word: string): CommandDef | undefined; // by name or alias, hidden included

// lib/commands.ts keeps its existing exports and signatures:
//   SystemEffect, CommandResult, CommandContext, SECTIONS, COMMANDS, HELP_LINES, runCommand(input, ctx), complete(input)
// COMMANDS and HELP_LINES become derived from the registry (visible commands only). runCommand dispatches through findCommand.
// One new CommandResult member:
//   { type: "program"; program: ProgramSpec }

// lib/arcade/program.ts (types only in F1; the runtime is sub-project G0)
export type ProgramHost = { cols: number; rows: number; draw(lines: string[]): void; sound?(name: string): void; exit(): void };
export type ProgramInstance = { tick(dtMs: number): void; key(key: string, down: boolean): void; swipe?(dir: "up" | "down" | "left" | "right"): void; dispose(): void };
export type ProgramSpec = { id: string; title: string; start(host: ProgramHost): ProgramInstance };
```

Interfaces this plan introduces, for X1 (Burn) and every tool that saves state:

```ts
// lib/presence.ts
export type PresenceProvider = { count(): Promise<number> };
export const localPresence: PresenceProvider;          // resolves 1 until Burn replaces it
export function formatWho(count: number): string[];    // ["just you"] for 1 or less

// lib/forget.ts
export const OWNED_PREFIX = "fergusos:";               // every key a tool writes starts with this
export type StorageLike = { readonly length: number; key(i: number): string | null; removeItem(k: string): void };
export function forget(storage: StorageLike): string[]; // removes every owned key, returns them

// lib/commands/shared.ts additions
//   CommandContext.storageKeys?: string[]   every key in local storage, read by Terminal at run time
//   CommandContext.presence?: number        what the presence provider last said
//   SystemEffect | { kind: "forget"; keys: string[] }
```

## File structure

| File | Responsibility |
|---|---|
| `lib/external-store.ts` | `createStore(reduce, initial)`: get, dispatch, subscribe. Notifies only when the reducer returns a new object. |
| `lib/shell.ts` | `ShellState`, `ShellEvent`, `shellReduce`, `isShellHotkey`, the `shellStore` singleton. |
| `lib/history.ts` | `Entry`, `HistoryState`, `HistoryEvent`, `historyReduce`, `WELCOME`, caps, the `historyStore` singleton. |
| `lib/forget.ts` | `OWNED_PREFIX`, `OWNED_KEYS`, `isOwnedKey`, `listKeys`, `ownedKeys`, `removeKeys`, `forget`. |
| `lib/presence.ts` | `PresenceProvider`, `localPresence`, `formatWho`. |
| `lib/system.ts` | `saveSettings` stops writing defaults; `isDefaultSettings`. |
| `lib/commands/session.ts` | `forget` and `who`. |
| `lib/commands/shared.ts` | The two context fields and the effect member. |
| `lib/commands/index.ts` | One import and one array entry for `session`. |
| `components/Terminal.tsx` | Reads the shared history; `variant` and `autoFocus` props; `useId` for its ids; supplies `storageKeys` and `presence`; applies `forget`. |
| `components/ShellDrawer.tsx` | The drawer, the hotkey listener, `summonShell()`. |
| `components/system/StatusBar.tsx` | The `$ prompt` button. |
| `app/layout.tsx` | Mounts `<ShellDrawer />` inside `<CrtShell>`. |
| `app/globals.css` | A new section at the **end of the file**: `.shell*`, `.statusbar__prompt`, their small-screen rules, the keyframe. |
| `components/shell.test.ts` | Coupling greps: layout, drawer, status bar, stylesheet. |
| `components/terminal.test.ts` | Extended: history store, forget effect, storage keys. |
| `scripts/mutation-check.mjs` | Five rows for the new guards. |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md` | The clauses, the state, the ledger. |

Three decisions taken here so nobody has to take them mid-task:

1. **The drawer unmounts when closed.** No hidden-but-focusable input, no `aria-hidden` ancestor over a live control. It can do that because the scrollback lives in `lib/history.ts`, not in component state. Opening slides (under `no-preference`); closing is instant in both modes, and that asymmetry is deliberate: a close is a dismissal, not a scene.
2. **The drawer never opens on `/`.** The home page hosts the terminal inline. There, the backtick and the prompt button put the caret in the inline terminal instead. The reducer refuses `open` while `inline` is true, so this is tested in `lib/shell.test.ts`, not left to a component.
3. **The drawer stays open across client navigation.** `cd projects` typed in the drawer navigates and leaves the drawer where it was, like a terminal panel in an editor. The store is module-level, so nothing has to be done to achieve this, and Escape is one key away.

The stylesheet rules go at the end of the file for an ordering reason worth stating: `.statusbar__readouts { display: contents }` sits at roughly line 2032, after the existing small-screen block near line 1660. A small-screen override placed inside that earlier block would lose to it. A new block at the end wins on order, and `components/shell.test.ts` asserts the order.

---

### Task 0: Worktree and ledger

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: F1 merged to `main`
- Produces: the worktree path `$WT` every later step runs in

- [ ] **Step 1: Confirm F1 is on main, then create the worktree**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git ls-tree --name-only origin/main lib/commands/ | grep -c registry.ts
```

Expected: `1`. If `0`, F1 has not merged; stop, this plan cannot start.

```powershell
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/f2-shell-everywhere
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/f2-shell-everywhere
```

The second command prints the worktree path: `$WT` below.

- [ ] **Step 2: Baseline**

```bash
cd "$WT"
npm ci
npx vitest run
npx tsc --noEmit
```

Expected: green, `tsc` silent. Note the file and test counts.

- [ ] **Step 3: Ledger**

F2 row becomes `| F2 | The shell everywhere | **building** | \`toolshed/f2-shell-everywhere\` | | |` and the log gains `- 2026-09-03: F2 started in its own worktree. Plan: \`docs/superpowers/plans/2026-09-03-toolshed-f2-shell-everywhere.md\`.`

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f2 the shell everywhere starts"
```

---

### Task 1: A store `useSyncExternalStore` can read

**Files:**
- Create: `lib/external-store.ts`
- Test: `lib/external-store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Store<S, E>`, `createStore(reduce, initial)`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/external-store.test.ts
import { describe, it, expect } from "vitest";
import { createStore } from "./external-store";

type S = { n: number };
type E = { type: "inc" } | { type: "noop" };
const reduce = (s: S, e: E): S => (e.type === "inc" ? { n: s.n + 1 } : s);

describe("createStore", () => {
  it("starts at the initial state and reduces on dispatch", () => {
    const store = createStore(reduce, { n: 0 });
    expect(store.get()).toEqual({ n: 0 });
    store.dispatch({ type: "inc" });
    expect(store.get()).toEqual({ n: 1 });
  });

  it("notifies subscribers once per change, and not when the reducer returns the same object", () => {
    const store = createStore(reduce, { n: 0 });
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch({ type: "inc" });
    store.dispatch({ type: "noop" });
    expect(calls).toBe(1);
  });

  it("returns a stable snapshot between changes, which is what useSyncExternalStore needs", () => {
    const store = createStore(reduce, { n: 0 });
    expect(store.get()).toBe(store.get());
    store.dispatch({ type: "inc" });
    expect(store.get()).toBe(store.get());
  });

  it("stops notifying after unsubscribe, even mid-notification", () => {
    const store = createStore(reduce, { n: 0 });
    let a = 0;
    let b = 0;
    const offA = store.subscribe(() => {
      a++;
      offB();
    });
    const offB = store.subscribe(() => b++);
    store.dispatch({ type: "inc" });
    store.dispatch({ type: "inc" });
    expect(a).toBe(2);
    expect(b).toBe(1);
    offA();
    store.dispatch({ type: "inc" });
    expect(a).toBe(2);
  });
});
```

The fourth test pins down that listeners are copied before iteration. Without the copy, removing a listener from inside another listener's callback skips or double-runs a neighbour, depending on the engine, which is the kind of bug that only shows up once React starts unmounting things during a notification.

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/external-store.test.ts
```

Expected: FAIL, `Cannot find module './external-store'`.

- [ ] **Step 3: Write the store**

```ts
// lib/external-store.ts

/**
 * The smallest store `useSyncExternalStore` can read: a reducer, a current
 * state, and listeners. Module-level instances of this are how the drawer and
 * the terminal's history survive client navigation without being persisted
 * anywhere. Nothing here touches the DOM or storage.
 */
export type Store<S, E> = {
  get(): S;
  dispatch(event: E): void;
  subscribe(listener: () => void): () => void;
};

export function createStore<S, E>(reduce: (state: S, event: E) => S, initial: S): Store<S, E> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch(event) {
      const next = reduce(state, event);
      // Same object means nothing changed: no notification, no re-render.
      if (Object.is(next, state)) return;
      state = next;
      // Copied first, so a listener that unsubscribes another mid-loop cannot
      // change what this loop visits.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/external-store.test.ts
```

Expected: PASS, 4 tests. (If the fourth fails with `b` at 2, the copy is missing.)

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/external-store.ts lib/external-store.test.ts
git commit -m "feat(lib): a reducer store for state that outlives a route"
```

---

### Task 2: The drawer's state machine

**Files:**
- Create: `lib/shell.ts`
- Test: `lib/shell.test.ts`

**Interfaces:**
- Consumes: `createStore` from `lib/external-store.ts`
- Produces: `ShellState`, `ShellEvent`, `INITIAL_SHELL`, `shellReduce`, `KeyTarget`, `isShellHotkey`, `shellStore`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/shell.test.ts
import { describe, it, expect } from "vitest";
import { INITIAL_SHELL, createShellStore, isShellHotkey, shellReduce } from "./shell";
import type { ShellState } from "./shell";

const closed: ShellState = { open: false, inline: false };
const open: ShellState = { open: true, inline: false };
const home: ShellState = { open: false, inline: true };

describe("shellReduce", () => {
  it("starts closed and off the inline host", () => {
    expect(INITIAL_SHELL).toEqual(closed);
  });

  it("opens, closes and toggles", () => {
    expect(shellReduce(closed, { type: "open" })).toEqual(open);
    expect(shellReduce(open, { type: "close" })).toEqual(closed);
    expect(shellReduce(closed, { type: "toggle" })).toEqual(open);
    expect(shellReduce(open, { type: "toggle" })).toEqual(closed);
  });

  it("returns the same object when nothing changes, so the store stays quiet", () => {
    expect(shellReduce(closed, { type: "close" })).toBe(closed);
    expect(shellReduce(open, { type: "open" })).toBe(open);
    expect(shellReduce(closed, { type: "route", inline: false })).toBe(closed);
  });

  it("never opens on the inline host: the home page has its own terminal", () => {
    expect(shellReduce(home, { type: "open" })).toBe(home);
    expect(shellReduce(home, { type: "toggle" })).toBe(home);
  });

  it("closes when the route becomes the inline host, and remembers which host it is on", () => {
    expect(shellReduce(open, { type: "route", inline: true })).toEqual(home);
    expect(shellReduce(home, { type: "route", inline: false })).toEqual(closed);
  });

  it("stays open across a navigation between two ordinary routes", () => {
    // A terminal panel in an editor does not close because a file opened.
    expect(shellReduce(open, { type: "route", inline: false })).toBe(open);
  });
});

describe("isShellHotkey", () => {
  const none = { ctrlKey: false, metaKey: false, altKey: false };

  it("is the bare backtick with focus on nothing in particular", () => {
    expect(isShellHotkey("`", none, null)).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "BODY" })).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "a" })).toBe(true);
  });

  it("is not any other key, and not a modified backtick", () => {
    expect(isShellHotkey("~", none, null)).toBe(false);
    expect(isShellHotkey("Escape", none, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, ctrlKey: true }, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, metaKey: true }, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, altKey: true }, null)).toBe(false);
  });

  it("leaves a backtick alone when the person is typing somewhere", () => {
    for (const tagName of ["INPUT", "input", "TEXTAREA", "SELECT"]) {
      expect(isShellHotkey("`", none, { tagName }), tagName).toBe(false);
    }
    expect(isShellHotkey("`", none, { tagName: "DIV", isContentEditable: true })).toBe(false);
  });
});

describe("createShellStore", () => {
  it("wires the reducer to a store that starts at INITIAL_SHELL", () => {
    const store = createShellStore();
    expect(store.get()).toBe(INITIAL_SHELL);
    store.dispatch({ type: "open" });
    expect(store.get().open).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/shell.test.ts
```

Expected: FAIL, `Cannot find module './shell'`.

- [ ] **Step 3: Write the module**

```ts
// lib/shell.ts
import { createStore } from "./external-store";
import type { Store } from "./external-store";

/**
 * The shell drawer's state, kept pure so it can be tested without a DOM.
 *
 * Two facts, one machine. `open` is whether the drawer is showing. `inline` is
 * whether the current route already hosts the terminal in the page (the home
 * page does), in which case the drawer refuses to open: one terminal on a
 * page, never two. `components/ShellDrawer.tsx` feeds the route in and reads
 * the result; nothing else decides.
 */
export type ShellState = {
  open: boolean;
  inline: boolean;
};

export type ShellEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "route"; inline: boolean };

export const INITIAL_SHELL: ShellState = { open: false, inline: false };

export function shellReduce(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case "open":
      return state.inline || state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false } : state;
    case "toggle":
      return shellReduce(state, { type: state.open ? "close" : "open" });
    case "route":
      if (event.inline === state.inline) return state;
      // Arriving on the inline host closes the drawer. Leaving it changes
      // nothing else: a drawer that was open stays open across navigation.
      return { open: event.inline ? false : state.open, inline: event.inline };
  }
}

/** The part of an event target the hotkey rule needs. */
export type KeyTarget = { tagName: string; isContentEditable?: boolean };

/**
 * Whether a keydown should summon the shell: the backtick, unmodified, with
 * focus outside anything a person types into. A backtick typed into the
 * contact form's message is a backtick.
 */
export function isShellHotkey(
  key: string,
  mods: { ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  target: KeyTarget | null,
): boolean {
  if (key !== "`") return false;
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return false;
  if (!target) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target.isContentEditable) return false;
  return true;
}

export function createShellStore(): Store<ShellState, ShellEvent> {
  return createStore(shellReduce, INITIAL_SHELL);
}

/**
 * The one drawer. Module-level so it survives client navigation. Never
 * persisted: a reload starts closed, which is what a reload should do.
 */
export const shellStore = createShellStore();
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/shell.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/shell.ts lib/shell.test.ts
git commit -m "feat(shell): the drawer's state machine and the backtick rule"
```

---

### Task 3: One history, and the Terminal reads it

**Files:**
- Create: `lib/history.ts`
- Test: `lib/history.test.ts`
- Modify: `components/Terminal.tsx` (state moves to the store; `variant`, `autoFocus`, `useId`)
- Modify: `components/terminal.test.ts` (extend)

**Interfaces:**
- Consumes: `createStore`
- Produces: `Entry`, `HistoryState`, `HistoryEvent`, `WELCOME`, `ENTRY_CAP`, `COMMAND_CAP`, `initialHistory()`, `historyReduce`, `historyStore`; `Terminal` props `{ variant?: "inline" | "drawer"; autoFocus?: boolean }`

- [ ] **Step 1: Write the failing tests for the history**

```ts
// lib/history.test.ts
import { describe, it, expect } from "vitest";
import { COMMAND_CAP, ENTRY_CAP, WELCOME, historyReduce, initialHistory } from "./history";

describe("historyReduce", () => {
  it("starts with the welcome and no commands", () => {
    const s = initialHistory();
    expect(s.entries).toEqual([{ cmd: "", lines: WELCOME }]);
    expect(s.commands).toEqual([]);
  });

  it("records a typed command for recall, trimmed, and ignores a blank", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "typed", cmd: "  ls  " });
    expect(s.commands).toEqual(["ls"]);
    const same = historyReduce(s, { type: "typed", cmd: "   " });
    expect(same).toBe(s);
  });

  it("prints an entry into the scrollback", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "print", cmd: "whoami", lines: ["a", "b"] });
    expect(s.entries.at(-1)).toEqual({ cmd: "whoami", lines: ["a", "b"] });
  });

  it("clears the scrollback and keeps the recall list", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "typed", cmd: "ls" });
    s = historyReduce(s, { type: "print", cmd: "ls", lines: ["x"] });
    s = historyReduce(s, { type: "clear" });
    expect(s.entries).toEqual([]);
    expect(s.commands).toEqual(["ls"]);
    expect(historyReduce(s, { type: "clear" })).toBe(s);
  });

  it("caps both lists, dropping the oldest", () => {
    let s = initialHistory();
    for (let i = 0; i < ENTRY_CAP + 5; i++) s = historyReduce(s, { type: "print", cmd: String(i), lines: [] });
    expect(s.entries).toHaveLength(ENTRY_CAP);
    expect(s.entries[0].cmd).toBe("6"); // welcome plus 0..5 fell off
    for (let i = 0; i < COMMAND_CAP + 3; i++) s = historyReduce(s, { type: "typed", cmd: `c${i}` });
    expect(s.commands).toHaveLength(COMMAND_CAP);
    expect(s.commands[0]).toBe("c3");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/history.test.ts
```

Expected: FAIL, `Cannot find module './history'`.

- [ ] **Step 3: Write the history module**

```ts
// lib/history.ts
import { createStore } from "./external-store";
import type { Store } from "./external-store";

/**
 * The terminal's memory: the scrollback and the recall list.
 *
 * Module-level, so `cd projects` typed in the drawer on one route and
 * `history` typed on the home page agree. Never persisted: a reload is a
 * fresh session, and nothing a visitor typed is written anywhere.
 */
export type Entry = { cmd: string; lines: string[] };

export type HistoryState = {
  /** What is on screen. `cmd` is "" for lines the machine printed unprompted. */
  entries: Entry[];
  /** What was typed, for up/down and the `history` command. */
  commands: string[];
};

export type HistoryEvent =
  | { type: "typed"; cmd: string }
  | { type: "print"; cmd: string; lines: string[] }
  | { type: "clear" };

export const WELCOME: string[] = [
  "FergusOS 5.0 'Mass' · interactive shell ready.",
  "tab completes · up/down recalls · try 'help', or 'gravity' if you are brave.",
];

/** Scrollback kept. A drawer open all afternoon must not grow without limit. */
export const ENTRY_CAP = 300;
/** Recall list kept. */
export const COMMAND_CAP = 500;

export const initialHistory = (): HistoryState => ({
  entries: [{ cmd: "", lines: WELCOME }],
  commands: [],
});

export function historyReduce(state: HistoryState, event: HistoryEvent): HistoryState {
  switch (event.type) {
    case "typed": {
      const cmd = event.cmd.trim();
      if (!cmd) return state;
      return { ...state, commands: [...state.commands, cmd].slice(-COMMAND_CAP) };
    }
    case "print":
      return {
        ...state,
        entries: [...state.entries, { cmd: event.cmd, lines: event.lines }].slice(-ENTRY_CAP),
      };
    case "clear":
      return state.entries.length === 0 ? state : { ...state, entries: [] };
  }
}

export const historyStore: Store<HistoryState, HistoryEvent> = createStore(historyReduce, initialHistory());
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/history.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Extend the Terminal coupling test, and see it fail**

Append to `components/terminal.test.ts` (it already has `read`, `code` and `terminal` from F1):

```ts
describe("Terminal reads the shared history", () => {
  it("subscribes to the history store rather than keeping entries in state", () => {
    expect(terminal).toMatch(/useSyncExternalStore\(historyStore\.subscribe, historyStore\.get/);
    expect(terminal).not.toMatch(/useState<Entry\[\]>/);
  });

  it("dispatches typed, print and clear, and nothing else", () => {
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "typed", cmd: raw \}\)/);
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "print", cmd: raw, lines: \[res\.program\.title, "no runtime yet"\] \}\)/);
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "clear" \}\)/);
  });

  it("gives the drawer a way to take focus and its own ids", () => {
    expect(terminal).toMatch(/autoFocus/);
    expect(terminal).toMatch(/useId\(\)/);
    expect(terminal).not.toMatch(/id="term-input"/);
  });
});
```

```bash
cd "$WT"
npx vitest run components/terminal.test.ts
```

Expected: the three new tests FAIL.

- [ ] **Step 6: Rewrite `components/Terminal.tsx`**

The whole file. The effect switch is unchanged apart from returning extra lines (needed by Task 6, harmless now) and the `run` function is the one from F1 with the store in place of `setHistory`/`setCommands`.

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { complete, runCommand } from "@/lib/commands";
import type { SystemEffect } from "@/lib/commands";
import { historyStore, initialHistory } from "@/lib/history";
import { profile } from "@/content/profile";
import Magnetic from "@/components/motion/Magnetic";
import { useSystem } from "@/components/system/SystemProvider";

const HINTS = ["gravity", "eject", "sound on", "neofetch", "sudo hire-me"];

/**
 * The server never dispatches, so its snapshot is the welcome line, built once
 * and handed back by reference: `useSyncExternalStore` requires a stable
 * server snapshot.
 */
const SERVER_HISTORY = initialHistory();
const getServerHistory = () => SERVER_HISTORY;

type Props = {
  /** `inline` on the home page, `drawer` everywhere else. Only the class differs. */
  variant?: "inline" | "drawer";
  /** Put the caret in the input on mount. The drawer wants this; the page does not. */
  autoFocus?: boolean;
};

/**
 * A real (if playful) command line, and the only place in the app allowed to
 * apply a `SystemEffect` or act on a `program` result. Commands like `theme`
 * and `crt` genuinely rewrite the running site: the parser decides what should
 * happen, this decides how.
 *
 * Its memory is not its own. `lib/history.ts` holds the scrollback and the
 * recall list at module level, so the inline terminal on the home page and the
 * drawer on every other route are one shell with one history.
 */
export default function Terminal({ variant = "inline", autoFocus = false }: Props) {
  const { entries, commands } = useSyncExternalStore(historyStore.subscribe, historyStore.get, getServerHistory);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [wiping, setWiping] = useState(false);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Two terminals never mount at once today, but ids are document-global and a
  // duplicate would break every label and describedby on the second one.
  const uid = useId();
  const inputId = `term-input-${uid}`;
  const helpId = `term-help-${uid}`;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const {
    frame,
    settings,
    setTheme,
    setCrtEnabled,
    setScanlines,
    setAudioEnabled,
    setGravity,
    setEjected,
    degauss,
    burstRain,
    audio,
    reducedMotion,
  } = useSystem();

  /** Applies an effect and returns any lines the application itself has to add. */
  const applyEffect = (effect: SystemEffect): string[] => {
    const extra: string[] = [];
    switch (effect.kind) {
      case "theme":
        setTheme(effect.theme);
        degauss();
        break;
      case "crt":
        setCrtEnabled(effect.on);
        break;
      case "scanlines":
        setScanlines(effect.value);
        break;
      case "matrix":
        burstRain(effect.ms);
        break;
      case "degauss":
        degauss();
        break;
      case "gravity":
        setGravity(effect.on);
        break;
      case "eject":
        setEjected(effect.on);
        break;
      case "sound":
        setAudioEnabled(effect.on);
        break;
      case "reboot":
        degauss();
        setWiping(true);
        // Forget that this session already booted, so the machine genuinely
        // comes back up with the full POST rather than snapping to the page.
        try {
          sessionStorage.removeItem("fergusos_booted");
        } catch {
          /* private mode: the reload is still the point */
        }
        window.setTimeout(() => window.location.reload(), 1600);
        break;
    }
    return extra;
  };

  const run = (raw: string) => {
    historyStore.dispatch({ type: "typed", cmd: raw });
    setCursor(null);

    const res = runCommand(raw, {
      history: commands,
      uptimeMs: frame.current.uptimeMs,
      theme: settings.theme,
      reducedMotion,
    });

    if (res.type === "navigate") {
      historyStore.dispatch({ type: "print", cmd: raw, lines: [`-> ${res.href}`] });
      router.push(res.href);
      return;
    }
    if (res.type === "clear") {
      historyStore.dispatch({ type: "clear" });
      return;
    }
    if (res.type === "program") {
      // G0 replaces this with the arcade runtime. Until then the door opens
      // onto a note and the prompt comes straight back.
      historyStore.dispatch({ type: "print", cmd: raw, lines: [res.program.title, "no runtime yet"] });
      return;
    }
    const extra = res.type === "effect" ? applyEffect(res.effect) : [];
    historyStore.dispatch({ type: "print", cmd: raw, lines: [...res.lines, ...extra] });
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    run(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // One click per key that actually does something. Modifiers on their own are
    // silent, because a real keyboard's shift key does not click either.
    if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Tab") {
      audio.key();
    }

    // Escape always releases the field, whatever else is going on. In the
    // drawer, the same keydown reaches the window and closes it.
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }

    if (e.key === "Tab") {
      // Never swallow Shift+Tab, and only swallow forward Tab when there is
      // genuinely something left to complete. Otherwise this input becomes a
      // keyboard trap: focus could never move past the terminal in either
      // direction, which strands keyboard users before the rest of the page
      // (WCAG 2.1.2). Pressing Tab once completes; pressing it again moves on.
      if (e.shiftKey) return;
      const completed = complete(value);
      if (!completed || completed === value) return;
      e.preventDefault();
      setValue(completed);
      return;
    }

    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      historyStore.dispatch({ type: "clear" });
      return;
    }

    if (e.key === "ArrowUp") {
      if (commands.length === 0) return;
      e.preventDefault();
      const next = cursor === null ? commands.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setValue(commands[next]);
      return;
    }

    if (e.key === "ArrowDown") {
      if (cursor === null) return;
      e.preventDefault();
      const next = cursor + 1;
      if (next >= commands.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(next);
        setValue(commands[next]);
      }
    }
  };

  // Inline ghost text showing what Tab would complete to.
  const ghost = useMemo(() => {
    if (!value.trim()) return "";
    const completed = complete(value);
    if (!completed || completed === value || !completed.startsWith(value)) return "";
    return completed.slice(value.length);
  }, [value]);

  return (
    <div
      className={`term term--${variant}${wiping ? " is-wiping" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="term__scroll" ref={scrollRef}>
        {entries.map((entry, i) => (
          <div key={i} className="term__entry">
            {entry.cmd !== "" && (
              <p className="promptline">
                <span className="promptline__user">
                  {profile.user}@{profile.host}
                </span>
                <span className="promptline__sep">:</span>
                <span className="promptline__path">~</span>
                <span className="promptline__dollar">$</span>
                <span className="promptline__cmd">{entry.cmd}</span>
              </p>
            )}
            {entry.lines.map((line, j) => (
              <p key={j} className="term__out">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      <form className="term__form" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="term__label">
          <span className="promptline__user">
            {profile.user}@{profile.host}
          </span>
          <span className="promptline__sep">:</span>
          <span className="promptline__path">~</span>
          <span className="promptline__dollar">$</span>
        </label>
        <span className="term__field">
          {/* The typed half is rendered transparent purely to position the
              suggestion; the input itself stays the single source of truth. */}
          <span className="term__ghost" aria-hidden="true">
            <span className="term__ghost-typed">{value}</span>
            <span className="term__ghost-rest">{ghost}</span>
          </span>
          <input
            id={inputId}
            ref={inputRef}
            className="term__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Terminal command input"
            aria-describedby={helpId}
            placeholder="type 'help'..."
          />
        </span>
      </form>

      <p id={helpId} className="term__srhint">
        Press Tab to complete a command, Up and Down arrows to recall previous commands, and
        Control plus L to clear the screen.
      </p>

      <div className="term__hints" aria-label="Command shortcuts">
        {HINTS.map((h) => (
          <Magnetic key={h} pull={0.3}>
            <button type="button" className="term__hint" onClick={() => run(h)}>
              {h}
            </button>
          </Magnetic>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the coupling test, the suite and the type check**

```bash
cd "$WT"
npx vitest run components/terminal.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: all PASS, `tsc` silent. The F1 checks (`res.type === "program"` before `"effect"`, `res.program.title`, `"no runtime yet"`) still hold.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add lib/history.ts lib/history.test.ts components/Terminal.tsx components/terminal.test.ts
git commit -m "feat(terminal): one history for every route, held outside the component"
```

---

### Task 4: `forget`, and settings that are only written when chosen

**Files:**
- Create: `lib/forget.ts`
- Test: `lib/forget.test.ts`
- Modify: `lib/system.ts` (`saveSettings`, new `isDefaultSettings`, `SettingsStorage`)
- Modify: `lib/system.test.ts` (append a describe block; extend its import from `./system`)

**Interfaces:**
- Consumes: `SETTINGS_KEY`, `DEFAULT_SETTINGS`, `SystemSettings` from `lib/system.ts`
- Produces: `StorageLike`, `OWNED_PREFIX`, `OWNED_KEYS`, `isOwnedKey`, `listKeys`, `ownedKeys`, `removeKeys`, `forget`; `isDefaultSettings`, `saveSettings(settings, storage?)`

Why `saveSettings` changes in this task: `SystemProvider` hydrates settings on mount and its sync effect then calls `saveSettings` on every load, so a visitor who never touched anything has `fergusos_settings` written with the defaults. Under the new clause ("only what the visitor explicitly saved") that is a violation, and it would make `forget` look broken: wipe, reload, and the key is back. From here, settings equal to the defaults remove the key rather than write it.

- [ ] **Step 1: Write the failing tests for forget**

```ts
// lib/forget.test.ts
import { describe, it, expect } from "vitest";
import { OWNED_PREFIX, forget, isOwnedKey, listKeys, ownedKeys, removeKeys } from "./forget";
import type { StorageLike } from "./forget";
import { SETTINGS_KEY } from "./system";

/** An in-memory Storage with the three members the module is allowed to use. */
function fake(initial: Record<string, string> = {}): StorageLike & { keys(): string[] } {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

describe("what the site owns", () => {
  it("is the settings key and anything under the prefix", () => {
    expect(isOwnedKey(SETTINGS_KEY)).toBe(true);
    expect(isOwnedKey(`${OWNED_PREFIX}drift-profile`)).toBe(true);
    expect(isOwnedKey("fergusos_booted")).toBe(false); // session storage, and not local
    expect(isOwnedKey("someone_elses_key")).toBe(false);
    expect(isOwnedKey("")).toBe(false);
  });

  it("filters a key list without touching storage", () => {
    expect(ownedKeys([SETTINGS_KEY, "x", `${OWNED_PREFIX}a`])).toEqual([SETTINGS_KEY, `${OWNED_PREFIX}a`]);
  });
});

describe("listKeys", () => {
  it("reads every key by index", () => {
    expect(listKeys(fake({ a: "1", b: "2" }))).toEqual(["a", "b"]);
    expect(listKeys(fake())).toEqual([]);
  });
});

describe("removeKeys", () => {
  it("removes what it is asked to, in order, and reports it", () => {
    const s = fake({ [SETTINGS_KEY]: "{}", [`${OWNED_PREFIX}a`]: "1", other: "2" });
    expect(removeKeys(s, [`${OWNED_PREFIX}a`, SETTINGS_KEY])).toEqual([`${OWNED_PREFIX}a`, SETTINGS_KEY]);
    expect(s.keys()).toEqual(["other"]);
  });

  it("refuses a key the site does not own, even when asked", () => {
    const s = fake({ other: "2" });
    expect(removeKeys(s, ["other"])).toEqual([]);
    expect(s.keys()).toEqual(["other"]);
  });
});

describe("forget", () => {
  it("removes every owned key and nothing else, and says which", () => {
    const s = fake({
      other_site: "keep",
      [SETTINGS_KEY]: "{}",
      [`${OWNED_PREFIX}drift`]: "1",
      [`${OWNED_PREFIX}arcade`]: "2",
    });
    expect(forget(s)).toEqual([SETTINGS_KEY, `${OWNED_PREFIX}drift`, `${OWNED_PREFIX}arcade`]);
    expect(s.keys()).toEqual(["other_site"]);
  });

  it("collects before it removes, so consecutive owned keys are not skipped", () => {
    // Removing by index while iterating shifts the rest down one, which is
    // exactly the bug this guards against.
    const s = fake({ [`${OWNED_PREFIX}a`]: "1", [`${OWNED_PREFIX}b`]: "2", [`${OWNED_PREFIX}c`]: "3" });
    expect(forget(s)).toHaveLength(3);
    expect(s.length).toBe(0);
  });

  it("returns nothing when there is nothing to forget", () => {
    expect(forget(fake({ other: "x" }))).toEqual([]);
    expect(forget(fake())).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing tests for saveSettings**

Append to `lib/system.test.ts`, and add `DEFAULT_SETTINGS`, `SETTINGS_KEY`, `isDefaultSettings`, `saveSettings` to its existing import from `./system` (keep whatever it already imports):

```ts
describe("saveSettings keeps only what the visitor chose", () => {
  const fake = () => {
    const map = new Map<string, string>();
    return {
      map,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
  };

  it("writes nothing for the defaults, and removes a stale record of them", () => {
    const s = fake();
    s.map.set(SETTINGS_KEY, "stale");
    saveSettings(DEFAULT_SETTINGS, s);
    expect(s.map.has(SETTINGS_KEY)).toBe(false);
  });

  it("writes a setting the visitor changed", () => {
    const s = fake();
    saveSettings({ ...DEFAULT_SETTINGS, theme: "amber" }, s);
    expect(JSON.parse(s.map.get(SETTINGS_KEY) ?? "null")).toMatchObject({ theme: "amber" });
  });

  it("compares every field, not just the theme", () => {
    expect(isDefaultSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, audio: true })).toBe(false);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, crtEnabled: false })).toBe(false);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, scanlines: 0.4 })).toBe(false);
  });

  it("does nothing on the server", () => {
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run both to see them fail**

```bash
cd "$WT"
npx vitest run lib/forget.test.ts lib/system.test.ts
```

Expected: `forget.test.ts` fails on `Cannot find module`; `system.test.ts` fails on `isDefaultSettings` not exported and `saveSettings` ignoring its second argument.

- [ ] **Step 4: Write `lib/forget.ts`**

```ts
// lib/forget.ts
import { SETTINGS_KEY } from "@/lib/system";

/**
 * What the site keeps on the visitor's machine, and how to make it forget.
 *
 * The rule (AGENTS.md, "What the site may keep"): local storage holds only
 * what the visitor explicitly saved, and the `forget` command wipes all of it.
 * For that to be true without a list somebody has to maintain, every key a
 * tool writes starts with `OWNED_PREFIX`. The one older key, the settings,
 * is named here. Nothing else on the site writes local storage: PostHog is
 * cookieless by project setting, and the boot marker is session storage.
 *
 * Pure over a Storage-like interface, so it is tested with a Map and applied
 * by `components/Terminal.tsx` to `window.localStorage`.
 */
export type StorageLike = {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

/** Every key a tool writes starts with this. `forget` needs no list of them. */
export const OWNED_PREFIX = "fergusos:";

/** Keys written under a fixed name, from before the prefix rule. */
export const OWNED_KEYS: readonly string[] = [SETTINGS_KEY];

export function isOwnedKey(key: string): boolean {
  return OWNED_KEYS.includes(key) || (key.length > OWNED_PREFIX.length && key.startsWith(OWNED_PREFIX));
}

/** Every key in the store, by index. Read fully before anything is removed. */
export function listKeys(storage: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) out.push(key);
  }
  return out;
}

export function ownedKeys(keys: readonly string[]): string[] {
  return keys.filter(isOwnedKey);
}

/**
 * Removes the named keys, in order, and returns the ones removed. A key the
 * site does not own is skipped even when named: this function is the last
 * thing between an effect descriptor and somebody else's storage.
 */
export function removeKeys(storage: StorageLike, keys: readonly string[]): string[] {
  const removed: string[] = [];
  for (const key of keys) {
    if (!isOwnedKey(key)) continue;
    storage.removeItem(key);
    removed.push(key);
  }
  return removed;
}

/** Everything the site owns, gone. Returns what went. */
export function forget(storage: StorageLike): string[] {
  return removeKeys(storage, ownedKeys(listKeys(storage)));
}
```

- [ ] **Step 5: Change `saveSettings` in `lib/system.ts`**

Replace the existing `saveSettings` function (and nothing else in the file) with:

```ts
/** The two members `saveSettings` uses, so a test can hand it a Map. */
export type SettingsStorage = Pick<Storage, "setItem" | "removeItem">;

/** True when nothing differs from `DEFAULT_SETTINGS`, field by field. */
export function isDefaultSettings(s: SystemSettings): boolean {
  return (
    s.theme === DEFAULT_SETTINGS.theme &&
    s.crtEnabled === DEFAULT_SETTINGS.crtEnabled &&
    s.scanlines === DEFAULT_SETTINGS.scanlines &&
    s.audio === DEFAULT_SETTINGS.audio
  );
}

/**
 * Persist the settings, or unpersist them. A visitor who has changed nothing
 * has saved nothing, and the site writes nothing for them: the key exists only
 * while something differs from the defaults. That is what lets `forget` mean
 * what it says across a reload, and it is the rule in AGENTS.md ("What the
 * site may keep").
 */
export function saveSettings(settings: SystemSettings, storage?: SettingsStorage): void {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!target) return;
  try {
    if (isDefaultSettings(settings)) target.removeItem(SETTINGS_KEY);
    else target.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota: the site works fine unpersisted */
  }
}
```

`SystemProvider` calls `saveSettings(settings)` with one argument and needs no change.

- [ ] **Step 6: Run the tests to see them pass, then the boot test**

```bash
cd "$WT"
npx vitest run lib/forget.test.ts lib/system.test.ts lib/boot.test.ts
```

Expected: PASS. `boot.test.ts` is run on purpose: the inline pre-paint script reads `SETTINGS_KEY` and already tolerates an absent key ("restores the saved theme" and "survives unparseable settings" both stay green), so a removed key is a state it was built for.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add lib/forget.ts lib/forget.test.ts lib/system.ts lib/system.test.ts
git commit -m "feat(lib): forget knows what the site owns, and defaults are never written"
```

---

### Task 5: Presence, with nobody to count yet

**Files:**
- Create: `lib/presence.ts`
- Test: `lib/presence.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PresenceProvider`, `localPresence`, `formatWho`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/presence.test.ts
import { describe, it, expect } from "vitest";
import { formatWho, localPresence } from "./presence";

describe("localPresence", () => {
  it("counts one: the visitor", async () => {
    await expect(localPresence.count()).resolves.toBe(1);
  });
});

describe("formatWho", () => {
  it("is 'just you' for one, for nothing, and for nonsense", () => {
    expect(formatWho(1)).toEqual(["just you"]);
    expect(formatWho(0)).toEqual(["just you"]);
    expect(formatWho(-4)).toEqual(["just you"]);
    expect(formatWho(Number.NaN)).toEqual(["just you"]);
  });

  it("names the count once there is company", () => {
    const [line] = formatWho(3);
    expect(line).toContain("3");
    expect(line).not.toContain("just you");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/presence.test.ts
```

Expected: FAIL, `Cannot find module './presence'`.

- [ ] **Step 3: Write the module**

```ts
// lib/presence.ts

/**
 * Who else is on the tube.
 *
 * `who` prints presence once Burn (X1) exists: the number of tabs that sent a
 * pointer path in the last minute. Until then there is nobody to count but the
 * visitor, and the provider says so. X1 replaces `localPresence` with one that
 * asks the server; the command and the Terminal do not change.
 */
export type PresenceProvider = { count(): Promise<number> };

export const localPresence: PresenceProvider = {
  count: () => Promise.resolve(1),
};

export function formatWho(count: number): string[] {
  if (!Number.isFinite(count) || count <= 1) return ["just you"];
  return [`${Math.floor(count)} on the tube right now, counting you`];
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/presence.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/presence.ts lib/presence.test.ts
git commit -m "feat(lib): a presence provider that counts just you until burn exists"
```

---

### Task 6: The `forget` and `who` commands, applied by the Terminal

**Files:**
- Modify: `lib/commands/shared.ts` (two context fields, one effect member)
- Create: `lib/commands/session.ts`
- Test: `lib/commands/session.test.ts`
- Modify: `lib/commands/index.ts` (one import, one entry)
- Modify: `components/Terminal.tsx` (supplies `storageKeys` and `presence`; applies `forget`)
- Modify: `components/terminal.test.ts` (extend)

**Interfaces:**
- Consumes: `defineCommand`, `ok`; `ownedKeys`, `listKeys`, `removeKeys` from `lib/forget.ts`; `formatWho`, `localPresence` from `lib/presence.ts`
- Produces: `export const session: CommandDef[]`; `CommandContext.storageKeys`, `CommandContext.presence`; `SystemEffect` `{ kind: "forget"; keys: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/session.test.ts
import { describe, it, expect } from "vitest";
import { session } from "./session";
import type { CommandDef } from "./registry";
import { OWNED_PREFIX } from "@/lib/forget";
import { SETTINGS_KEY } from "@/lib/system";

const def = (name: string): CommandDef => {
  const d = session.find((c) => c.name === name);
  if (!d) throw new Error(`session has no ${name}`);
  return d;
};

describe("forget", () => {
  it("is listed, and completes no argument", () => {
    expect(def("forget").help).toMatch(/^forget\s+/);
    expect(def("forget").hidden).toBeUndefined();
    expect(def("forget").argPool).toBeUndefined();
  });

  it("asks the Terminal to remove exactly the owned keys, and prints them", () => {
    const res = def("forget").run([], { storageKeys: ["theirs", SETTINGS_KEY, `${OWNED_PREFIX}drift`] }, "forget");
    expect(res).toEqual({
      type: "effect",
      effect: { kind: "forget", keys: [SETTINGS_KEY, `${OWNED_PREFIX}drift`] },
      lines: ["forgotten:", `  ${SETTINGS_KEY}`, `  ${OWNED_PREFIX}drift`],
    });
  });

  it("says when there is nothing to forget, and fires no effect", () => {
    expect(def("forget").run([], { storageKeys: ["theirs"] }, "forget")).toEqual({
      type: "output",
      lines: ["nothing to forget"],
    });
    expect(def("forget").run([], {}, "forget")).toEqual({ type: "output", lines: ["nothing to forget"] });
  });
});

describe("who", () => {
  it("prints just you until there is a count above one", () => {
    expect(def("who").run([], {}, "who")).toEqual({ type: "output", lines: ["just you"] });
    expect(def("who").run([], { presence: 1 }, "who")).toEqual({ type: "output", lines: ["just you"] });
    const res = def("who").run([], { presence: 4 }, "who");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines[0]).toContain("4");
  });
});
```

Also append to `components/terminal.test.ts`:

```ts
describe("Terminal applies forget and feeds the session commands", () => {
  it("hands the command the storage keys and the presence count", () => {
    expect(terminal).toMatch(/storageKeys: readStorageKeys\(\)/);
    expect(terminal).toMatch(/presence,/);
    expect(terminal).toMatch(/localPresence\.count\(\)/);
  });

  it("removes exactly the keys the effect names, through the owned-key filter", () => {
    expect(terminal).toMatch(/case "forget":[\s\S]{0,200}removeKeys\(window\.localStorage, effect\.keys\)/);
  });

  it("admits it when storage refuses", () => {
    expect(terminal).toMatch(/storage refused the change/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/session.test.ts components/terminal.test.ts
```

Expected: `session.test.ts` fails on `Cannot find module`; the three new Terminal checks fail.

- [ ] **Step 3: Extend `lib/commands/shared.ts`**

Add the effect member to `SystemEffect` (after `reboot`):

```ts
  | { kind: "reboot" }
  /** Remove these keys from local storage. `Terminal` re-checks ownership before touching any. */
  | { kind: "forget"; keys: string[] };
```

and the two fields to `CommandContext` (after `reducedMotion`):

```ts
  /**
   * Every key in the visitor's local storage, read by the Terminal at run time.
   * `forget` filters them down to the ones the site owns; nothing else reads
   * them, and nothing is ever written here.
   */
  storageKeys?: string[];
  /** What the presence provider last said. Absent until it has answered once. */
  presence?: number;
```

- [ ] **Step 4: Write the session module and register it**

```ts
// lib/commands/session.ts
import { ownedKeys } from "@/lib/forget";
import { formatWho } from "@/lib/presence";
import { defineCommand } from "./registry";
import { ok } from "./shared";

/**
 * The visitor's session: what the site has kept, and who else is here.
 *
 * `forget` is the constitution's promise made typeable (AGENTS.md, "What the
 * site may keep"). It computes the owned keys from the list the Terminal
 * supplies and returns an effect; the Terminal does the removing. That keeps
 * this file pure and the promise testable.
 */
export const session = [
  defineCommand({
    name: "forget",
    help: "forget            wipe what this site saved on your machine",
    run: (_args, ctx) => {
      const keys = ownedKeys(ctx.storageKeys ?? []);
      if (keys.length === 0) return ok(["nothing to forget"]);
      return {
        type: "effect",
        effect: { kind: "forget", keys },
        lines: ["forgotten:", ...keys.map((k) => `  ${k}`)],
      };
    },
  }),

  defineCommand({
    name: "who",
    help: "who               who else is on the tube",
    run: (_args, ctx) => ok(formatWho(ctx.presence ?? 1)),
  }),
];
```

In `lib/commands/index.ts`, add the import in alphabetical position (after `nav`, before `sudo`) and the entry likewise:

```ts
import { nav } from "./nav";
import { session } from "./session";
import { sudo } from "./sudo";

export const MODULES: CommandDef[][] = [effects, hidden, info, nav, session, sudo];
```

- [ ] **Step 5: Wire the Terminal**

In `components/Terminal.tsx`:

Add two imports after the `historyStore` import:

```tsx
import { listKeys, removeKeys } from "@/lib/forget";
import { localPresence } from "@/lib/presence";
```

Add, above the component (after `getServerHistory`):

```tsx
/** Never throws: a browser that refuses storage reads as an empty store. */
function readStorageKeys(): string[] {
  try {
    return listKeys(window.localStorage);
  } catch {
    return [];
  }
}
```

Add a state line beside `wiping`, and an effect after the `autoFocus` effect:

```tsx
  const [presence, setPresence] = useState<number | undefined>(undefined);
```

```tsx
  useEffect(() => {
    let live = true;
    void localPresence.count().then((n) => {
      if (live) setPresence(n);
    });
    return () => {
      live = false;
    };
  }, []);
```

Add the two context fields to the `runCommand` call:

```tsx
    const res = runCommand(raw, {
      history: commands,
      uptimeMs: frame.current.uptimeMs,
      theme: settings.theme,
      reducedMotion,
      storageKeys: readStorageKeys(),
      presence,
    });
```

Add the case to `applyEffect`, before `case "reboot":`:

```tsx
      case "forget":
        // Ownership is re-checked inside removeKeys, so a descriptor cannot
        // reach a key the site does not own however it was built.
        try {
          removeKeys(window.localStorage, effect.keys);
        } catch {
          extra.push("storage refused the change. nothing was removed.");
        }
        break;
```

- [ ] **Step 6: Run the tests, the suite and the type check**

```bash
cd "$WT"
npx vitest run lib/commands/session.test.ts components/terminal.test.ts lib/commands/index.test.ts lib/commands/dispatch.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: all PASS. `index.test.ts` proves `session` is alphabetical and claims no existing name; `dispatch.test.ts` proves `COMMANDS` is still sorted with `forget` and `who` in it (the "hides nothing visible" loop does not list them, and need not). `tsc` proves `applyEffect`'s switch is still exhaustive over the grown `SystemEffect`.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add lib/commands/shared.ts lib/commands/session.ts lib/commands/session.test.ts lib/commands/index.ts components/Terminal.tsx components/terminal.test.ts
git commit -m "feat(commands): forget wipes what the site kept, and who counts just you"
```

---

### Task 7: The drawer

**Files:**
- Create: `components/ShellDrawer.tsx`
- Modify: `app/layout.tsx` (import and mount)
- Modify: `app/globals.css` (new section at the end of the file)
- Test: `components/shell.test.ts` (new)

**Interfaces:**
- Consumes: `shellStore`, `INITIAL_SHELL`, `isShellHotkey` from `lib/shell.ts`; `Terminal` with `variant` and `autoFocus`
- Produces: `ShellDrawer` (default export), `summonShell()` (named export, used by Task 8)

- [ ] **Step 1: Write the failing coupling tests**

```ts
// components/shell.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks for the shell drawer, in the pattern of `lib/boot.test.ts`.
 * The behaviour is in `lib/shell.ts` and tested there; these prove the
 * component, the layout, the status bar and the stylesheet are wired to it.
 * Comments are stripped first so prose cannot satisfy a check for code.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const layout = code(read("app", "layout.tsx"));
const drawer = code(read("components", "ShellDrawer.tsx"));
const css = read("app", "globals.css");

describe("the layout mounts the drawer", () => {
  it("imports ShellDrawer and renders it inside the CrtShell, after main", () => {
    expect(layout).toMatch(/import ShellDrawer from "@\/components\/ShellDrawer";/);
    const open = layout.indexOf("<CrtShell>");
    const close = layout.indexOf("</CrtShell>");
    const main = layout.indexOf("</main>");
    const at = layout.indexOf("<ShellDrawer />");
    expect(at).toBeGreaterThan(main);
    expect(at).toBeLessThan(close);
    expect(open).toBeGreaterThan(-1);
  });
});

describe("the drawer", () => {
  it("routes the backtick through the pure predicate and closes on Escape", () => {
    expect(drawer).toMatch(/isShellHotkey\(e\.key, e, /);
    expect(drawer).toMatch(/e\.key === "Escape"/);
    expect(drawer).toMatch(/shellStore\.dispatch\(\{ type: "close" \}\)/);
  });

  it("tells the store which route it is on", () => {
    expect(drawer).toMatch(/shellStore\.dispatch\(\{ type: "route", inline: path === "\/" \}\)/);
  });

  it("renders nothing while closed, so no hidden input is ever focusable", () => {
    expect(drawer).toMatch(/if \(!state\.open\) return null;/);
  });

  it("mounts the one Terminal, in drawer dress, with focus", () => {
    expect(drawer).toMatch(/<Terminal variant="drawer" autoFocus \/>/);
  });

  it("swallows the backtick so it is not typed into the input it just focused", () => {
    expect(drawer).toMatch(/isShellHotkey\([\s\S]{0,120}\)\) return;\s*e\.preventDefault\(\);/);
  });

  it("hydrates from a closed server snapshot", () => {
    expect(drawer).toMatch(/useSyncExternalStore\(shellStore\.subscribe, shellStore\.get, getServerShell\)/);
  });
});

describe("the stylesheet", () => {
  /** True when `decl` sits inside some block opened by `media`. */
  const insideMedia = (media: string, decl: string): boolean => {
    let from = 0;
    for (;;) {
      const at = css.indexOf(media, from);
      if (at < 0) return false;
      const open = css.indexOf("{", at);
      let depth = 0;
      for (let i = open; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) {
          if (css.slice(open, i).includes(decl)) return true;
          break;
        }
      }
      from = at + media.length;
    }
  };

  it("draws the drawer on the status bar, above the glass and below the chrome", () => {
    const rule = /\.shell \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position: fixed;/);
    expect(rule).toMatch(/bottom: var\(--status-h\);/);
    expect(rule).toMatch(/z-index: 9050;/);
  });

  it("slides only for people who have not asked for stillness", () => {
    expect(css).toMatch(/@keyframes shell-rise/);
    expect(insideMedia("@media (prefers-reduced-motion: no-preference)", "animation: shell-rise")).toBe(true);
    expect(css.split("animation: shell-rise").length - 1).toBe(1);
  });

  it("shrinks with the display when ejected, like the status bar", () => {
    expect(css).toMatch(/html\.is-ejecting \.shell \{\r?\n\s*position: absolute;/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd "$WT"
npx vitest run components/shell.test.ts
```

Expected: FAIL, `ShellDrawer.tsx` does not exist.

- [ ] **Step 3: Write the drawer**

```tsx
// components/ShellDrawer.tsx
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Terminal from "@/components/Terminal";
import { INITIAL_SHELL, isShellHotkey, shellStore } from "@/lib/shell";

const getServerShell = () => INITIAL_SHELL;

/**
 * Open the drawer, or, on the page that already hosts the terminal inline,
 * put the caret in it. The status bar's prompt and the backtick both come here.
 */
export function summonShell(): void {
  if (shellStore.get().inline) {
    const input = document.querySelector<HTMLInputElement>(".term__input");
    input?.scrollIntoView({ block: "center" });
    input?.focus();
    return;
  }
  shellStore.dispatch({ type: "toggle" });
}

/**
 * The terminal on every route that does not host it in the page.
 *
 * Renders nothing while closed: the scrollback lives in `lib/history.ts`, so
 * unmounting loses nothing, and there is never a hidden input to trap focus.
 * `lib/shell.ts` decides whether it may open; this only feeds it the route
 * and the keys. Mounted once, in `app/layout.tsx`, inside the CrtShell so it
 * shrinks with the display when the camera pulls back.
 */
export default function ShellDrawer() {
  const path = usePathname();
  const state = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);

  useEffect(() => {
    shellStore.dispatch({ type: "route", inline: path === "/" });
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!shellStore.get().open) return;
        e.preventDefault();
        shellStore.dispatch({ type: "close" });
        // Focus goes back to the control that represents the drawer on
        // every route, so a keyboard user is not dropped on the body.
        document.querySelector<HTMLElement>(".statusbar__prompt")?.focus();
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!isShellHotkey(e.key, e, target)) return;
      e.preventDefault();
      summonShell();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state.open) return null;

  return (
    <div className="shell" id="shell-drawer" role="region" aria-label="Terminal">
      <div className="shell__bar">
        <span className="shell__title" aria-hidden="true">
          fsh
        </span>
        <button
          type="button"
          className="shell__close"
          onClick={() => {
            shellStore.dispatch({ type: "close" });
            document.querySelector<HTMLElement>(".statusbar__prompt")?.focus();
          }}
          aria-label="Close the terminal"
        >
          esc
        </button>
      </div>
      <Terminal variant="drawer" autoFocus />
    </div>
  );
}
```

`isShellHotkey(e.key, e, target)`: a `KeyboardEvent` has `ctrlKey`, `metaKey` and `altKey`, so it satisfies the predicate's second parameter structurally.

- [ ] **Step 4: Mount it in the layout**

In `app/layout.tsx`, add the import beside the other component imports:

```tsx
import ShellDrawer from "@/components/ShellDrawer";
```

and in the JSX, after `</main>` and before `</CrtShell>`:

```tsx
            <main id="main" className="screen">
              {children}
            </main>
            {/*
              The terminal on every route. Inside CrtShell for the same reason
              the status bar is: it is part of the display and shrinks with it
              when the camera pulls back. Renders nothing until summoned.
            */}
            <ShellDrawer />
          </CrtShell>
```

- [ ] **Step 5: Add the stylesheet section at the end of `app/globals.css`**

Append this as the last thing in the file. The small-screen rules for the status bar prompt are included here too (Task 8 adds the button) so the ordering point in the file structure notes holds in one place.

```css

/* ==========================================================================
   THE SHELL DRAWER
   The terminal on every route that does not host it inline. Bottom-anchored
   on the status bar, above the glass layers (z 9000) and below the status bar
   and nav (z 9100) so the prompt that opens it stays clickable. Opened by the
   backtick, the status bar prompt, or a tap on that prompt; closed by Escape
   or the esc button. `lib/shell.ts` owns whether it is open, `lib/history.ts`
   what it shows, so it unmounts when closed and loses nothing.
   ========================================================================== */
.shell {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--status-h);
  z-index: 9050;
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 520px);
  background: rgba(7, 11, 7, 0.97);
  border-top: 1px solid var(--green-line);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.45);
}
.shell__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 var(--sp-3);
  font-size: 0.7rem;
  color: var(--green-dim);
  border-bottom: 1px solid var(--green-line);
}
.shell__title {
  color: var(--green);
}
.shell__close {
  font: inherit;
  font-size: 0.7rem;
  line-height: 1;
  color: var(--green-dim);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 4px 10px;
  cursor: pointer;
}
.shell__close:hover {
  color: var(--green-bright);
  border-color: var(--green-line);
}
.shell__close:focus-visible {
  outline: 1px solid var(--green);
  outline-offset: 1px;
  color: var(--green-bright);
}
/* The same Terminal, without the framed card look: the drawer is the frame. */
.shell .term {
  border: none;
  border-radius: 0;
  box-shadow: none;
  min-height: 0;
  overflow: hidden;
}
.shell .term__scroll {
  max-height: 38vh;
}

/* Slide only for people who have not asked for stillness. Closing is an
   unmount, so it is instant for everyone. */
@keyframes shell-rise {
  from {
    transform: translateY(14px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .shell {
    animation: shell-rise 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
}

/* Ejected, the drawer is part of the display and shrinks with it. */
html.is-ejecting .shell {
  position: absolute;
}

/* ----- the status bar prompt ----------------------------------------------
   A real button in the status strip: the drawer's handle on every route, and
   on the home page a jump to the inline terminal. */
.statusbar__prompt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  color: var(--amber);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
}
.statusbar__prompt:hover,
.statusbar__prompt[aria-expanded="true"] {
  color: var(--green-bright);
  border-color: var(--green-line);
}
.statusbar__prompt:focus-visible {
  outline: 1px solid var(--green);
  outline-offset: 1px;
  color: var(--green-bright);
}

@media (max-width: 560px) {
  /* Like the machine labels: the glyph carries it on a narrow strip. */
  .statusbar__prompt-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

@media (max-width: 768px) {
  /* ── the shell on a phone ────────────────────────────────────────────────
     The prompt is the tap target for the drawer, so it must be 44px both ways
     while the bar stays 22px tall. The bar's clipping moves onto the readouts
     (which lose `display: contents` here, and this block sits after that rule
     on purpose), and the button hangs its bottom edge on the bar's bottom
     edge, so the extra height sits above the bar over the page, never below
     the viewport where nobody can tap it. */
  .statusbar {
    overflow: visible;
  }
  .statusbar__readouts {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .statusbar__prompt {
    align-self: flex-end;
    align-items: flex-end;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px 4px;
  }
  .shell {
    max-height: 70vh;
  }
  .shell .term__scroll {
    max-height: 30vh;
  }
  .shell__close {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 6: Run the coupling test, the suite, the type check and the build**

```bash
cd "$WT"
npx vitest run components/shell.test.ts
npx vitest run
npx tsc --noEmit
npx next build
```

Expected: all PASS, `tsc` silent, the build clean. `app/globals.test.ts` runs in the suite and its contrast guards are unaffected: the new rules use `--green`, `--green-dim`, `--amber` and `--green-bright` on the existing panel colours, and `.statusbar__prompt` is chrome at 11px, the same as `.machine__btn`.

- [ ] **Step 7: Look at it once, locally, before the phone check**

```bash
cd "$WT"
npx next start -p 3000
```

In a desktop browser at `http://localhost:3000/writing`: press backtick. The drawer rises from the status bar. Type `who`, Enter: `just you`. Press Escape: it goes, and focus lands on the (not yet present) prompt button, which is a no-op until Task 8. Go to `/`: press backtick: the caret lands in the inline terminal and the drawer does not open. Stop the server.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add components/ShellDrawer.tsx app/layout.tsx app/globals.css components/shell.test.ts
git commit -m "feat(shell): the terminal in a drawer on every route, opened by the backtick"
```

---

### Task 8: The prompt in the status bar

**Files:**
- Modify: `components/system/StatusBar.tsx`
- Modify: `components/shell.test.ts` (extend)

**Interfaces:**
- Consumes: `summonShell` from `components/ShellDrawer.tsx`; `shellStore`, `INITIAL_SHELL` from `lib/shell.ts`
- Produces: the `$ prompt` button

- [ ] **Step 1: Extend the coupling test, and see it fail**

Append to `components/shell.test.ts`:

```ts
describe("the status bar prompt", () => {
  const statusBar = code(read("components", "system", "StatusBar.tsx"));

  it("is a real button that summons the shell", () => {
    expect(statusBar).toMatch(/className="statusbar__prompt"/);
    expect(statusBar).toMatch(/onClick=\{summonShell\}/);
    expect(statusBar).toMatch(/<button\s+type="button"\s+className="statusbar__prompt"/);
  });

  it("says whether the drawer is open, except on the page that has no drawer", () => {
    expect(statusBar).toMatch(/aria-expanded=\{shell\.inline \? undefined : shell\.open\}/);
    expect(statusBar).toMatch(/useSyncExternalStore\(shellStore\.subscribe, shellStore\.get, getServerShell\)/);
  });

  it("is 44px both ways on small screens, in a rule that wins on order", () => {
    const mobile = /\.statusbar__prompt \{[^}]*min-height: 44px;[^}]*\}/.exec(css);
    expect(mobile).not.toBeNull();
    expect(mobile?.[0]).toMatch(/min-width: 44px;/);
    expect(mobile?.[0]).toMatch(/align-self: flex-end;/);
    // The override of `.statusbar__readouts { display: contents }` must come
    // after it in the file, or it loses on the cascade with equal specificity.
    const contents = /\.statusbar__readouts \{\r?\n\s*display: contents;/.exec(css);
    const flex = /\.statusbar__readouts \{\r?\n\s*display: flex;/.exec(css);
    expect(contents?.index).toBeGreaterThan(-1);
    expect(flex?.index).toBeGreaterThan(contents?.index ?? Infinity);
  });
});
```

```bash
cd "$WT"
npx vitest run components/shell.test.ts
```

Expected: the first two new tests FAIL; the third passes already (the CSS landed in Task 7) and stays as the guard.

- [ ] **Step 2: Add the button**

In `components/system/StatusBar.tsx`:

Imports: change the React import to `import { useEffect, useRef, useSyncExternalStore } from "react";` and add:

```tsx
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { summonShell } from "@/components/ShellDrawer";

const getServerShell = () => INITIAL_SHELL;
```

Inside the component, after the `useSystem()` line:

```tsx
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
```

In the JSX, after `<MachineControls />` and before the closing `</div>`:

```tsx
      <MachineControls />
      {/* The drawer's handle. On the home page, which hosts the terminal
          inline, it jumps to that instead, and reports no expanded state
          because there is nothing to expand. */}
      <button
        type="button"
        className="statusbar__prompt"
        onClick={summonShell}
        aria-expanded={shell.inline ? undefined : shell.open}
        title={shell.inline ? "Jump to the terminal" : "Open the terminal (backtick)"}
      >
        <span aria-hidden="true">$</span>
        <span className="statusbar__prompt-label">prompt</span>
      </button>
    </div>
```

Update the comment above the `<div className="statusbar">` if it still says the strip "now holds real controls": it does, and the prompt is one more of them. No wording change is required; the comment is already true.

- [ ] **Step 3: Run the test, the suite and the type check**

```bash
cd "$WT"
npx vitest run components/shell.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add components/system/StatusBar.tsx components/shell.test.ts
git commit -m "feat(status): a prompt in the bar that opens the shell, 44px on a phone"
```

---

### Task 9: Mutation rows for the new guards

**Files:**
- Modify: `scripts/mutation-check.mjs` (append to `MUTATIONS`)

**Interfaces:**
- Consumes: the anchors from Tasks 2, 4 and 7
- Produces: five more rows, all expected RED

- [ ] **Step 1: Add the entries**

After the F1 rows, before the closing `];`:

```js
  // ── the shell everywhere (F2) ──
  {
    name: "the drawer opens on the page that already has a terminal",
    file: "lib/shell.ts",
    pattern: /return state\.inline \|\| state\.open \? state : \{ \.\.\.state, open: true \};/,
    replace: "return state.open ? state : { ...state, open: true };",
  },
  {
    name: "a backtick typed into a field summons the shell",
    file: "lib/shell.ts",
    pattern: /if \(tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT"\) return false;/,
    replace: "",
  },
  {
    name: "forget removes a key the site does not own",
    file: "lib/forget.ts",
    pattern: /    if \(!isOwnedKey\(key\)\) continue;/,
    replace: "",
  },
  {
    name: "the defaults are written to storage again",
    file: "lib/system.ts",
    pattern: /if \(isDefaultSettings\(settings\)\) target\.removeItem\(SETTINGS_KEY\);/,
    replace: "if (false) target.removeItem(SETTINGS_KEY);",
  },
  {
    name: "the phone tap target shrinks back under 44px",
    file: "app/globals.css",
    pattern: /(?<lead>\.statusbar__prompt \{\r?\n    align-self: flex-end;[\s\S]{0,120}min-height: )44px;/,
    replace: "$<lead>22px;",
  },
```

- [ ] **Step 2: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs
git status --short
```

Expected: every row RED, five more than after F1, and the tree clean afterwards. Which test catches which: the first two fail `lib/shell.test.ts`; the third `lib/forget.test.ts` ("refuses a key the site does not own"); the fourth `lib/system.test.ts` ("writes nothing for the defaults"); the fifth `components/shell.test.ts` ("is 44px both ways"). A green row means the guard it names is decoration: fix the test, run again.

- [ ] **Step 3: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(mutation): the shell's guards are mutated too"
```

---

### Task 10: The constitution

**Files:**
- Modify: `AGENTS.md` (a new section; a paragraph appended to the terminal section)
- Modify: `docs/PROGRESS.md` (a new entry at the top)

**Interfaces:**
- Consumes: design section 2
- Produces: the rules every later tool is reviewed against

- [ ] **Step 1: Add the new section to AGENTS.md**

Insert it immediately before `## Stack & conventions`:

```markdown
## What the site may keep, and where (amended 2026-09-03 for the toolshed)

Three rules moved when the toolshed programme started. They are the constitution for every tool
that follows, and a reviewer checks a tool against them, not against the spec that proposed it.

**1. State the visitor asked for.** "No cookies, no local storage" was written about analytics and
it stays true for analytics: PostHog is cookieless and nothing identifies a visitor. Beyond
analytics, the site may keep on the visitor's own machine only what the visitor explicitly saved
(a Drift voice profile, arcade initials, a saved report), never anything used to recognise them.
Every such key is either `fergusos_settings` or starts with `fergusos:`, so the `forget` command
can wipe all of it without knowing their names, and it prints what it wiped. Settings equal to the
defaults are not written at all (`saveSettings` removes the key), so a visitor who changed nothing
has nothing stored. Session storage holds one flag, the boot marker, which dies with the tab.
Server-side, the site holds anonymous aggregates only: a heat map of pointer wear, three-letter
initials with a score, per-IP budgets that expire within a day. Nothing keyed to a person.

**2. Styling.** `app/globals.css` stays the shell's stylesheet. A tool may own
`app/tools/<slug>/tool.css`, imported by its own page and nowhere else. Ten tools appending to
one file would spend the programme resolving merge conflicts.

**3. Dependencies.** The "reach for CSS first, earn every dependency" rule holds. The dependencies
this programme earns, each with the reason on its own PR: `@duckdb/duckdb-wasm` (Second Visit),
`@upstash/redis` (budgets, Burn, boards), `@neondatabase/serverless` (census, Tide cache),
`@vercel/blob` (reports), `@vercel/functions` (WebSocket upgrade, if the spike passes),
`playwright-core` plus `@sparticuz/chromium` (On the glass), and `playwright` as a devDependency
for the phone check. Nothing else without an argument.
```

- [ ] **Step 2: Append to the terminal section of AGENTS.md**

At the end of `## The terminal is a real subsystem` (the F1 text), add one paragraph:

```markdown
The terminal is on every route. `app/page.tsx` renders it inline; everywhere else
`components/ShellDrawer.tsx`, mounted once in `app/layout.tsx`, hosts the same component in a
drawer opened by the backtick (when focus is not in a field), by the `$ prompt` button in the status
bar, or by a tap on that button on a phone, and closed by Escape. There is one scrollback and one
recall list, in `lib/history.ts`, module-level and never persisted, so `cd projects` typed in the
drawer and `history` typed on the home page agree. `lib/shell.ts` is the drawer's state machine,
pure and tested, and it never opens on the route that hosts the terminal inline. `forget` returns an
effect like every other command that touches the machine; the Terminal removes the keys.
```

- [ ] **Step 3: Add the PROGRESS.md entry**

At the top, in the file's voice:

```markdown
## 2026-09-03: the shell everywhere

F2 of the toolshed programme. The terminal is a drawer on every route (backtick, the status bar
prompt, or a tap on it), with one history held in `lib/history.ts`. Two commands: `forget`, which
removes every key the site owns from local storage and prints them, and `who`, which says
"just you" until Burn exists. `saveSettings` no longer writes the defaults, so a visitor who
changed nothing has nothing stored, which is the new clause in AGENTS.md made true rather than
asserted. Checked on WebKit at 390 and 320 (see the ledger for what was and was not observed).
Not verified: the real iOS keyboard over the drawer, which headless WebKit does not have.
```

- [ ] **Step 4: Commit**

```bash
cd "$WT"
git add AGENTS.md docs/PROGRESS.md
git commit -m "docs: what the site may keep, and the shell on every route"
```

---

### Task 11: Prove it, ship it, check it live

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above
- Produces: a merged PR, a phone-check record, a live check with its limits stated

- [ ] **Step 1: The full local gate**

```bash
cd "$WT"
npx vitest run
npx tsc --noEmit
npx next build
```

Expected: green, silent, clean. Compare the test count to Task 0's baseline: it should have grown by the new files (external-store 4, shell 10, history 5, forget 8, system +4, presence 3, session 4, terminal +6, shell coupling 13) and shrunk by nothing.

- [ ] **Step 2: The parity container**

```bash
cd "$WT"
docker build -f Dockerfile.parity -t fergus-portfolio-parity .
docker run --rm -d -p 3200:3000 --name fp-parity fergus-portfolio-parity
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/writing
curl -s http://localhost:3200/writing | grep -o 'statusbar__prompt' | head -1
curl -s http://localhost:3200/ | grep -c 'class="term term--inline'
docker stop fp-parity
```

Expected: `200`, `statusbar__prompt` (the button is in the server HTML on every route), `1` (the inline terminal on the home page). The drawer itself is not in the server HTML by design: it renders nothing until summoned.

- [ ] **Step 3: The phone check, on a real WebKit engine**

The rule is real-engine emulation, not a resized window. Playwright is not a dependency of this repo until F3 lands it; the WebKit build already sits in this machine's Playwright browser cache (`%LOCALAPPDATA%\ms-playwright\webkit-2311`, observed 2026-09-03), which the August mobile work downloaded.

Decide which case applies, in this order:

1. `ls "$WT/node_modules/playwright"` succeeds: F3 has merged. Run the script below from `$WT`.
2. Otherwise, install Playwright **outside the repository**, in the session scratchpad, which adds nothing to `package.json` or the lockfile:

```bash
SCRATCH="$HOME/AppData/Local/Temp/claude/pw-check"
mkdir -p "$SCRATCH" && cd "$SCRATCH"
npm init -y > /dev/null
npm install playwright@1
npx playwright install webkit
```

   Run the script from `$SCRATCH` with `NODE_PATH="$SCRATCH/node_modules"`.
3. If neither is possible (no network, or the install is refused), **the WebKit check is unverified**, the ledger says so in those words, and a Chromium device emulation in DevTools at 320 is done as a weaker substitute and labelled as Chromium, not WebKit.

Start the production build first:

```bash
cd "$WT"
npx next start -p 3000 &
```

The script, saved as `phone-check-f2.mjs` in whichever directory has Playwright:

```js
// phone-check-f2.mjs: WebKit iPhone at 390 and 320, driving the drawer on a
// route that does not host the terminal inline. Prints one JSON line per width.
import { webkit, devices } from "playwright";

const base = process.env.BASE ?? "http://localhost:3000";
const route = "/writing";

for (const width of [390, 320]) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const before = await overflow();

  const prompt = page.locator(".statusbar__prompt");
  const box = await prompt.boundingBox();
  await prompt.tap();
  await page.waitForSelector(".shell");

  const shell = await page.locator(".shell").boundingBox();
  const bar = await page.locator(".statusbar").boundingBox();
  const input = page.locator(".shell .term__input");
  const fontSize = await input.evaluate((el) => getComputedStyle(el).fontSize);
  const focused = await page.evaluate(() => document.activeElement?.className ?? "");

  await input.fill("cd arcade");
  await input.press("Enter");
  const out = await page.locator(".shell .term__out").last().textContent();
  const hints = await page.locator(".shell .term__hint").evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().right)),
  );
  const during = await overflow();
  await page.screenshot({ path: `phone-${width}.png` });

  await page.keyboard.press("Escape");
  const closed = (await page.locator(".shell").count()) === 0;
  const after = await page.evaluate(() => document.activeElement?.className ?? "");

  console.log(
    JSON.stringify({
      width,
      overflowBefore: before,
      overflowWithDrawer: during,
      promptBox: box,
      shellBottomOnBarTop: shell && bar ? Math.abs(shell.y + shell.height - bar.y) : null,
      inputFontSize: fontSize,
      caretInDrawer: focused.includes("term__input"),
      output: out,
      hintRightEdges: hints,
      closedOnEscape: closed,
      focusAfterClose: after,
    }),
  );
  await browser.close();
}
```

Run it:

```bash
node phone-check-f2.mjs
```

**What passes, per width.** `overflowBefore` and `overflowWithDrawer` are `0`. `promptBox.width` and `promptBox.height` are at least `44`, and `promptBox.y + promptBox.height` is within 1 of `844`. `shellBottomOnBarTop` is at most `1`. `inputFontSize` is `"16px"`. `caretInDrawer` is `true`. `output` is `arcade: no runtime yet`. Every value in `hintRightEdges` is at most the width. `closedOnEscape` is `true`. `focusAfterClose` contains `statusbar__prompt`.

**What to look at in `phone-320.png` and `phone-390.png`.** The drawer sits on the status bar with its `fsh` bar and `esc` button visible; the prompt line `fergus@portfolio:~$` and the typed command fit on one line or wrap without clipping; the output `arcade: no runtime yet` is readable; the five hint pills wrap onto two or three rows inside the drawer and none is cut at the right edge; the `$` in the status bar is visible at the bottom right and nothing in the bar is clipped by the new `overflow: visible`.

**What would make it fail, and what it cannot see.** Any non-zero overflow means a rule in the new section is wider than the viewport, most likely the hints or the `.shell__bar`. A `promptBox` under 44 means the small-screen block lost the cascade, and the coupling test's order check should already have caught that. `caretInDrawer` false means the `autoFocus` effect did not run inside the tap's task; that is a real finding, not noise, because it is what decides whether iOS shows the keyboard. Headless WebKit has no on-screen keyboard, so whether the drawer stays visible above a real iOS keyboard is **not observed here** and is stated as unverified in the ledger. It also has no phone GPU, so the shader's cost with the drawer open is not measured.

Stop the server (`kill %1`) when done, and delete nothing from the scratchpad; it is not in the repo.

- [ ] **Step 4: Ledger to `pr`, push, open the PR**

Ledger F2 row: `**pr**`. Log line: `- 2026-09-03: F2 built. Phone check on WebKit 390/320: <the JSON, one line each>. PR #<n>.`

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f2 checked on webkit, pr open"
git push -u origin toolshed/f2-shell-everywhere
gh pr create --title "feat(shell): the terminal on every route (toolshed f2)" --body "$(cat <<'EOF'
F2 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, sections 2 and 6).

The terminal is a drawer on every route: backtick, the `$ prompt` in the status bar, or a tap on it (44px on a phone). One history in `lib/history.ts`. `forget` removes every key the site owns and prints them; `who` says "just you" until Burn. `saveSettings` no longer writes the defaults. AGENTS.md gains the three clauses from design section 2.

Tests: pure state machines in `lib/` (shell, history, forget, presence, external-store), the session commands, and coupling greps on the layout, drawer, status bar and stylesheet. Mutation check: five new rows, all red. Parity container served `/writing` with the prompt in the HTML. WebKit iPhone check at 390 and 320 recorded in the ledger.

Not verified: the real iOS keyboard over the drawer; the drawer under `gravity`.

Plan: `docs/superpowers/plans/2026-09-03-toolshed-f2-shell-everywhere.md`.
EOF
)"
```

Fill the PR number into the ledger and commit it as `docs(programme): f2 pr number`.

- [ ] **Step 5: CI, merge**

```bash
cd "$WT"
gh pr checks --watch
gh pr merge --merge
```

No `--delete-branch`.

- [ ] **Step 6: Verify the deploy and the live feature**

```bash
SHA=$(git -C "$WT" rev-parse origin/main)
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=3" \
  | python -c "import sys,json; [print(d['uid'], d['state'], d.get('meta',{}).get('githubCommitSha','')[:7], d.get('target')) for d in json.load(sys.stdin)['deployments']]"
echo "$SHA"
```

Expected: top row `READY`, `production`, short SHA matches. Then in a real browser against `https://fergusoreilly.dev` (run `~/.claude/scripts/instrument-check.js` first if any probe hangs, per `CLAIMS.md`):

1. Open any article under `/writing/`. Press backtick. The drawer rises. Type `cd arcade`, Enter: `arcade: no runtime yet`. This is the design's acceptance line for F2.
2. Press Escape. The drawer goes and the `$` in the status bar has focus (tab once to confirm the ring moves on from it).
3. Click the `$` in the status bar. The drawer opens. Type `theme amber`, Enter. The site turns amber. Type `forget`, Enter: `forgotten:` then `  fergusos_settings`. Reload: the site is green, because the key is gone. Open DevTools, Application, Local Storage: no `fergusos_settings` and nothing under `fergusos:`. This is the design's second acceptance line.
4. Type `forget` again: `nothing to forget`. Type `who`: `just you`.
5. Type `cd projects` in the drawer: the route changes, the drawer stays, and the scrollback still shows the earlier lines. Go to `/`: the inline terminal shows the same scrollback. Press backtick on `/`: the caret lands in the inline terminal and no drawer appears.
6. On the live site through the same WebKit script with `BASE=https://fergusoreilly.dev`, at 320 only: the same JSON line, same pass conditions.
7. Type `gravity` from the drawer, on a machine without reduced motion. Look at whether the drawer's own text falls with the page. Either way, record it; it is a follow-up, not a blocker.

- [ ] **Step 7: Record it, with the limits**

Ledger F2 row to `**live**` with the deployment uid. Log line listing the seven checks and their results, then: `Not verified: the real iOS keyboard over the drawer (headless WebKit has none); the phosphor shader's frame cost with the drawer open on a phone GPU.` Commit the ledger straight to `main`:

```bash
cd /c/Dev/fergus-portfolio
git pull --ff-only
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f2 live"
git push
```

---

## Self-review

**Spec coverage (design section 6, F2, and section 2).** "The terminal opens on every route: inline on the home page as now, and as a drawer everywhere else": Task 7, with the inline rule in Task 2's reducer. "Opened by the backtick key, by the prompt in the status bar, or by a tap target on phones": Task 2 (predicate), Task 7 (listener), Task 8 (button, 44px in Task 7's CSS). "One `Terminal` component, one history, the same registry": Task 3 and Task 7 (`<Terminal variant="drawer" autoFocus />`). "Adds `forget` (wipes every key the site ever wrote to local storage and says which)": Tasks 4 and 6, and Task 4 also stops the defaults being written so the wipe survives a reload. "`who` (prints presence once Burn exists, 'just you' until then)": Tasks 5 and 6, with `PresenceProvider` for X1 to replace. "Amends AGENTS.md with the three clauses in section 2": Task 10, text written out. "Done when `cd arcade` typed on `/writing/anything` routes to the arcade door": Task 11 step 6 item 1 and the phone script. "And when `forget` on a machine with a saved profile leaves local storage empty": Task 11 step 6 item 3. Escape closes: Tasks 2 and 7. Reduced motion: Task 7 CSS, guarded by `components/shell.test.ts`. Phone-first at 320 with a WebKit step and an honest fallback: Task 11 step 3. Section 9's mutation rule: Task 9.

**Placeholder scan.** No "TBD", no "add validation", no "similar to Task N". Every test and every code change is written out, including the whole of `Terminal.tsx` in Task 3 so a reader does not have to reconstruct it from a diff. The phone script and its pass conditions are explicit values, not "check it looks right". One thing that reads like a placeholder and is not: Task 11 step 3 case 3, "the WebKit check is unverified", is the required outcome when the engine cannot be run, per the brief and `CLAIMS.md`.

**Type consistency.** `Store<S, E>` and `createStore` from `lib/external-store.ts` are used by `lib/shell.ts` and `lib/history.ts` with the same names. `ShellState`, `ShellEvent`, `INITIAL_SHELL`, `shellReduce`, `isShellHotkey`, `createShellStore`, `shellStore` are identical across `lib/shell.ts`, its test, `ShellDrawer.tsx`, `StatusBar.tsx` and the mutation rows. `HistoryEvent` has exactly `typed`, `print`, `clear`, and `Terminal.tsx` dispatches only those three; the coupling test pins the three call shapes. `StorageLike` has `length`, `key`, `removeItem`, and the test fake implements exactly those plus its own `keys()`. `SettingsStorage` is `Pick<Storage, "setItem" | "removeItem">` and the test fake supplies both. `CommandContext.storageKeys` and `.presence` are declared in `shared.ts`, supplied by `Terminal.tsx`, and read by `session.ts` under the same names. The effect is `{ kind: "forget"; keys: string[] }` in `shared.ts`, `session.ts`, `session.test.ts` and the `applyEffect` case. `summonShell` is exported from `ShellDrawer.tsx` and imported by `StatusBar.tsx`. `getServerShell` is defined in both `ShellDrawer.tsx` and `StatusBar.tsx` as a local constant, and the two coupling tests match each file's own copy.

**Gaps found and fixed inline.** The first draft applied `forget` and printed the list without saying what happens when `removeItem` throws; the effect now returns extra lines and the Terminal prints "storage refused the change", with a coupling test for the sentence. The first draft put the small-screen prompt rules inside the existing `@media (max-width: 768px)` block, which would have lost to `.statusbar__readouts { display: contents }` further down the file; they now live at the end of the file and `components/shell.test.ts` asserts the order. The first draft left the defaults being written on every load, which would have made `forget` a lie after one reload; Task 4 fixes that at the source.

**Stated limits.** The drawer under `gravity` is observed in Task 11, not designed for. The real iOS keyboard is not observable in headless WebKit and is recorded as unverified. `eject`/`dock` still complete no argument, unchanged from F1.
