# F1 Command Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lib/commands.ts` becomes a thin dispatcher over `lib/commands/*.ts` modules, each declaring its commands with `defineCommand`, so `help`, tab completion and `ls` derive from one registry, a hidden command is provably absent from all three, and a `program` result exists for the arcade runtime (G0) to pick up.

**Architecture:** The types and the `SECTIONS` list move into `lib/commands/shared.ts`. A small registry (`lib/commands/registry.ts`) holds a name map and an alias map. Five modules (`nav`, `info`, `effects`, `sudo`, `hidden`) each export an array of `defineCommand` results, and `lib/commands/index.ts` registers them in alphabetical lines. `lib/commands.ts` keeps every export it has today: `COMMANDS` and `HELP_LINES` are computed from `listCommands()` at import, `runCommand` looks the first word up with `findCommand` and calls its `run`, and `complete` reads `argPool` off the matched command. The existing `lib/commands.test.ts` passes without a single edit, which is the acceptance test. `Terminal.tsx` gains one branch for the new `program` result.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.7, vitest 2 in a `node` environment with no jsdom. No new dependencies.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6 (F1), section 8 (segmentation, frozen interfaces, one sub-project one worktree one PR), section 9 (verification standard).
- From `AGENTS.md`, "The terminal is a real subsystem": **`lib/commands.ts` stays pure. Commands that change the running site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`, `sudo rm -rf /`) return an `effect` descriptor; `Terminal.tsx` is the only place allowed to apply one. Keep it that way: it is why the whole command surface is unit-testable without a DOM.** The same rule now covers the `program` result: `Terminal.tsx` is the only thing that acts on it.
- From `AGENTS.md`: **"All editable content lives in `content/*.ts`: never hard-code copy in components."** Command copy already lives in `lib/commands.ts` and stays with the commands; nothing moves into a component.
- From `AGENTS.md`: **"Accessibility is non-negotiable: every animation must be gated behind `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS)."** F1 adds no animation. The reduced-motion refusals in `gravity` and `eject` move file but do not change.
- From `AGENTS.md`: **"Before shipping anything that touches ... any of the brightness constants, run `node scripts/mutation-check.mjs`."** Four guards move file in this plan (the two reduced-motion refusals, the scanlines range, the theme check) and three are new (the hidden flag, the door, the sort). All seven get mutation entries in Task 9. A guard that survives its own mutation is decoration.
- `content/voice.test.ts` scans every `.ts` and `.tsx` outside tests for em dashes. None may appear in new code, comments included.
- Tests are vitest only, beside the source as `*.test.ts`, `node` environment. React components cannot be mounted; component behaviour is tested by moving logic into `lib/` and by string-grep coupling checks (the pattern in `lib/boot.test.ts` and `components/chrome.test.ts`), with comments stripped before matching so prose about a call cannot satisfy a check for the call.
- No new dependencies. Hand-written CSS only (none needed here).
- Behavioural parity: `lib/commands.test.ts` is not edited. If a step needs it changed, the step is wrong.
- Frozen interfaces below are used with these exact names. Other plans are being written against them in parallel. Adding an export is fine; renaming one is not.
- Public repository since F0: code goes through a pull request on branch `toolshed/f1-command-registry` in its own worktree. Never force-push, never rewrite history, never delete a branch.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`. Every completion note states what was not verified, per `C:\Users\oreil\.claude\CLAIMS.md`.
- Working tree line endings are mixed (`lib/commands.ts` and `app/globals.css` are CRLF on disk, `components/Terminal.tsx` is LF). Any multi-line regex in a test or a mutation anchor uses `\r?\n`.

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

Two facts about how these are read, settled here so every module agrees:

- `help` is the **whole pre-formatted line** after the four-space indent, exactly as the lines in today's `HELP_LINES` are written (`"cd <section>      jump to a section"`, usage padded to 18 characters by hand). The registry prepends the indent and nothing else. A command with no `help` and no `hidden` is completable and runnable but not listed: that is how `history`, `echo`, `date`, `pwd`, `clear` and `help` itself stay on the one footer line they share today.
- `argPool` as a function is called with an empty context from `complete(input)`, because that signature has no context to give. The function form exists for pools that depend on runtime state (G0's game list); every pool in F1 is a plain array.

## File structure

| File | Responsibility |
|---|---|
| `lib/arcade/program.ts` | The three program types, nothing else. G0 adds the runtime beside it. |
| `lib/commands/shared.ts` | `SystemEffect`, `CommandResult`, `CommandContext`, `SECTIONS`, and two one-line helpers every module uses (`ok`, `argOf`). No imports from `lib/commands.ts`, so no cycle. |
| `lib/commands/registry.ts` | The frozen five, plus `helpLines(defs)` so `help` and `HELP_LINES` are one function. |
| `lib/commands/nav.ts` | `help`, `whoami`, `ls`, `cd` (including the door rule), `open`, `cat`, `pwd`. |
| `lib/commands/info.ts` | `contact`, `resume`, `neofetch`, `uptime`, `top` (with the `arcade` process), `history`, `date`, `echo`. |
| `lib/commands/effects.ts` | `theme`, `crt`, `scanlines`, `matrix`, `degauss`, `gravity`, `eject`, `dock`, `sound`, `clear`. |
| `lib/commands/sudo.ts` | `sudo`. |
| `lib/commands/hidden.ts` | `arcade`, hidden, closed until G0. |
| `lib/commands/index.ts` | One import and one array entry per module, alphabetical. Registers on import. |
| `lib/commands.ts` | Re-exports the types and `SECTIONS`; derives `COMMANDS` and `HELP_LINES`; `runCommand`, `complete`, `sharedPrefix`. |
| `components/Terminal.tsx` | One new branch: a `program` result prints the title and "no runtime yet". |
| `components/terminal.test.ts` | Coupling greps on `Terminal.tsx` (new file; F2 extends it). |
| `scripts/mutation-check.mjs` | Six new entries for the guards this plan moves or adds. |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md` | The rule, the state, the ledger. |

One resolution trap, named once: `@/lib/commands` must keep resolving to the **file** `lib/commands.ts`, not the **directory** `lib/commands/`. TypeScript's `bundler` resolution, Vite and webpack all try the path with an extension before they try a directory index, so the file wins. The existing `lib/commands.test.ts` importing `runCommand` from `@/lib/commands` is the guard: if resolution ever flipped to `index.ts`, that import would fail at the first test. `lib/commands.ts` itself imports the barrel as `./commands/index`, with the `/index` written out.

---

### Task 0: Worktree and ledger

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (the F1 row and the log)

**Interfaces:**
- Consumes: nothing
- Produces: the worktree path `$WT` every later step runs in

- [ ] **Step 1: Create the worktree through the safe wrapper**

From PowerShell:

```powershell
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/f1-command-registry
& C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/f1-command-registry
```

Expected: the second command prints the sibling worktree path. Call it `$WT` below. Never `git-wt remove`, never `--clobber`.

- [ ] **Step 2: Install from the lockfile and prove the baseline**

```bash
cd "$WT"
npm ci
npx vitest run
npx tsc --noEmit
```

Expected: every test green (33 files, about 1,008 tests at the time of writing), `tsc` silent. Record the counts; Task 10 compares against them.

- [ ] **Step 3: Mark F1 building in the ledger**

In `docs/superpowers/programme/toolshed-ledger.md`, the F1 row becomes:

```markdown
| F1 | Command registry | **building** | `toolshed/f1-command-registry` | | |
```

and the log gains:

```markdown
- 2026-09-03: F1 started in its own worktree. Plan: `docs/superpowers/plans/2026-09-03-toolshed-f1-command-registry.md`.
```

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f1 command registry starts"
```

---

### Task 1: The program types, the shared module, and the Terminal's program branch

**Files:**
- Create: `lib/arcade/program.ts`
- Create: `lib/commands/shared.ts`
- Modify: `lib/commands.ts` (delete the type block and `SECTIONS`; re-export them)
- Modify: `components/Terminal.tsx` (the `run` function)
- Test: `components/terminal.test.ts` (new)

**Interfaces:**
- Consumes: `Theme` from `lib/system.ts`
- Produces: `ProgramHost`, `ProgramInstance`, `ProgramSpec`; `SystemEffect`, `CommandResult` (now with `program`), `CommandContext`, `SECTIONS`, `ok`, `argOf`; the one `Terminal` branch that G0 replaces

The types move as they are. The one addition, the `program` member on `CommandResult`, is not free: `Terminal.tsx` reads `res.lines` after its `navigate` and `clear` early returns, and a union member without `lines` turns that line into a type error. So the Terminal's branch for a program result lands in this task, under `tsc`'s compulsion, with its coupling test written first.

- [ ] **Step 1: Write the failing coupling test**

```ts
// components/terminal.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks on `Terminal.tsx`, in the pattern of `lib/boot.test.ts`.
 *
 * Vitest runs in a `node` environment with no DOM, so the component cannot be
 * mounted. What can be checked is that the source contains the calls the pure
 * modules depend on it making. Comments are stripped first so prose about a
 * call can never satisfy a check for the call: that exact hole let a missing
 * `audio.key()` ship on 2026-08-20.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const terminal = code(read("components", "Terminal.tsx"));

describe("Terminal and a program result", () => {
  it("gives a program result a branch of its own before the output branches", () => {
    const at = terminal.indexOf('res.type === "program"');
    const effectAt = terminal.indexOf('res.type === "effect"');
    expect(at).toBeGreaterThan(-1);
    expect(effectAt).toBeGreaterThan(at);
  });

  it("prints the program's title and says there is no runtime", () => {
    expect(terminal).toMatch(/res\.program\.title/);
    expect(terminal).toMatch(/"no runtime yet"/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd "$WT"
npx vitest run components/terminal.test.ts
```

Expected: FAIL on both, `Terminal.tsx` has no such branch.

- [ ] **Step 3: Write the program types**

```ts
// lib/arcade/program.ts

/**
 * What a program (a game, in practice) is allowed to see of the terminal, and
 * what the terminal is allowed to ask of it.
 *
 * Types only. The runtime that hosts a program, ticks it, draws its grid and
 * routes keys and swipes to it is sub-project G0. Until then a `program` result
 * from a command makes the Terminal print the title and hand the prompt back.
 *
 * Frozen by the toolshed design (section 8): every game plan is written against
 * these names. Add to them if a game needs more; never rename.
 */

export type ProgramHost = {
  cols: number;
  rows: number;
  draw(lines: string[]): void;
  sound?(name: string): void;
  exit(): void;
};

export type ProgramInstance = {
  tick(dtMs: number): void;
  key(key: string, down: boolean): void;
  swipe?(dir: "up" | "down" | "left" | "right"): void;
  dispose(): void;
};

export type ProgramSpec = {
  id: string;
  title: string;
  start(host: ProgramHost): ProgramInstance;
};
```

- [ ] **Step 4: Write the shared module**

The docblocks are the ones from `lib/commands.ts` today, moved with the types they describe.

```ts
// lib/commands/shared.ts
import type { Theme } from "@/lib/system";
import type { ProgramSpec } from "@/lib/arcade/program";

/**
 * Side effects a command can ask the host page to perform. `runCommand` stays a
 * pure function of its inputs: it describes what should happen to the machine
 * and the Terminal component is the only thing that actually touches it. That is
 * what keeps commands like `theme` and `matrix`, which visibly rewrite the whole
 * site, unit-testable.
 */
export type SystemEffect =
  | { kind: "theme"; theme: Theme }
  | { kind: "crt"; on: boolean }
  | { kind: "scanlines"; value: number }
  | { kind: "matrix"; ms: number }
  | { kind: "degauss" }
  | { kind: "gravity"; on: boolean }
  | { kind: "eject"; on: boolean }
  | { kind: "sound"; on: boolean }
  | { kind: "reboot" };

export type CommandResult =
  | { type: "output"; lines: string[] }
  | { type: "navigate"; href: string }
  | { type: "clear" }
  | { type: "effect"; effect: SystemEffect; lines: string[] }
  /**
   * A program for the terminal to host. The runtime is sub-project G0; until it
   * lands, Terminal prints the title and "no runtime yet" and returns the prompt.
   */
  | { type: "program"; program: ProgramSpec };

/** Everything a command may need to know about the running machine. */
export type CommandContext = {
  history?: string[];
  now?: Date;
  uptimeMs?: number;
  theme?: Theme;
  /**
   * Whether the visitor has asked for reduced motion. The commands that take
   * over the viewport refuse in that case, and say so rather than printing a
   * confident line about something that is not going to happen.
   */
  reducedMotion?: boolean;
};

/** Sections reachable from the terminal. */
export const SECTIONS = [
  "about",
  "skills",
  "experience",
  "projects",
  "writing",
  "contact",
] as const;

export const ok = (lines: string[]): CommandResult => ({ type: "output", lines });

/**
 * The argument as the old switch saw it: everything after the command word,
 * joined with single spaces, lowercased. Commands that need the original case
 * (`echo`, `cat`'s error line) read `args` directly.
 */
export const argOf = (args: string[]): string => args.join(" ").toLowerCase();
```

- [ ] **Step 5: Point `lib/commands.ts` at the shared module**

In `lib/commands.ts`, delete the `SystemEffect`, `CommandResult` and `CommandContext` type declarations with their docblocks, delete the `SECTIONS` declaration and its comment, and delete the local `const ok = ...` line. Replace the import block at the top of the file with:

```ts
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { articles } from "@/content/articles";
import { formatUptime, isTheme } from "@/lib/system";
import { SECTIONS, ok } from "./commands/shared";

export type { SystemEffect, CommandResult, CommandContext } from "./commands/shared";
export { SECTIONS } from "./commands/shared";
```

The `import type { Theme }` line goes: nothing left in the file uses it. Everything else in the file stays exactly as it is for now.

- [ ] **Step 6: Watch the type checker ask for the branch**

```bash
cd "$WT"
npx vitest run lib/commands.test.ts
npx tsc --noEmit
```

Expected: the tests all pass, same count as before (nothing about behaviour has moved). `tsc` reports one error, in `components/Terminal.tsx` at the `res.lines` inside `setHistory`, of the form `Property 'lines' does not exist on type '{ type: "program"; program: ProgramSpec; }'`. That is the union doing its job: a program result has no lines to print, and the component has to say what it does with one.

- [ ] **Step 7: Add the branch**

In `components/Terminal.tsx`, inside `run`, after the `clear` branch and before `if (res.type === "effect") applyEffect(res.effect);`, add:

```tsx
    if (res.type === "program") {
      // G0 replaces this with the arcade runtime. Until then the door opens
      // onto a note and the prompt comes straight back.
      setHistory((h) => [...h, { cmd: raw, lines: [res.program.title, "no runtime yet"] }]);
      return;
    }
```

So the run function reads, in order: `navigate`, `clear`, `program`, then `effect` and the shared output line.

- [ ] **Step 8: Run the coupling test, the suite and the type check**

```bash
cd "$WT"
npx vitest run components/terminal.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: all PASS, `tsc` silent. With `program` returned early, `res.lines` is reached only on `output | effect`.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add lib/arcade/program.ts lib/commands/shared.ts lib/commands.ts components/Terminal.tsx components/terminal.test.ts
git commit -m "refactor(commands): move the shared types out, and teach the terminal a program result"
```

---

### Task 2: The registry

**Files:**
- Create: `lib/commands/registry.ts`
- Test: `lib/commands/registry.test.ts`

**Interfaces:**
- Consumes: `CommandContext`, `CommandResult` from `lib/commands/shared.ts`
- Produces: the frozen five, plus `helpLines(defs: CommandDef[]): string[]`, `HELP_HEAD`, `HELP_FOOT`

Vitest gives each test file its own module graph, so this file's registry starts empty and nothing it registers leaks into another file. The tests below rely on that.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/registry.test.ts
import { describe, it, expect } from "vitest";
import {
  HELP_FOOT,
  HELP_HEAD,
  defineCommand,
  findCommand,
  helpLines,
  listCommands,
  registerCommands,
} from "./registry";
import type { CommandDef } from "./registry";
import { ok } from "./shared";

const cmd = (name: string, extra: Partial<CommandDef> = {}): CommandDef =>
  defineCommand({ name, run: () => ok([name]), ...extra });

describe("defineCommand", () => {
  it("returns the definition it was given", () => {
    const def = cmd("alpha");
    expect(def.name).toBe("alpha");
    expect(def.run([], {}, "alpha")).toEqual({ type: "output", lines: ["alpha"] });
  });

  it("refuses a name the parser could never match", () => {
    // runCommand lowercases the first word and splits on whitespace, so a name
    // with a capital or a space is a command nobody can type.
    expect(() => cmd("Bad")).toThrow(/name/);
    expect(() => cmd("two words")).toThrow(/name/);
    expect(() => cmd("")).toThrow(/name/);
  });
});

describe("registerCommands and findCommand", () => {
  it("finds a command by its name and by each alias, hidden included", () => {
    registerCommands([
      cmd("zeta", { aliases: ["z", "zz"] }),
      cmd("secret", { hidden: true }),
    ]);
    expect(findCommand("zeta")?.name).toBe("zeta");
    expect(findCommand("z")?.name).toBe("zeta");
    expect(findCommand("zz")?.name).toBe("zeta");
    expect(findCommand("secret")?.name).toBe("secret");
    expect(findCommand("nope")).toBeUndefined();
  });

  it("re-registering a name replaces it and drops its old aliases", () => {
    // Fast Refresh re-runs a changed module against a registry that kept its
    // state, so a throw here would break every edit in development. Real
    // duplicates are caught by index.test.ts over the source arrays instead.
    registerCommands([cmd("beta", { aliases: ["b"] })]);
    registerCommands([cmd("beta", { aliases: ["bb"] })]);
    expect(findCommand("b")).toBeUndefined();
    expect(findCommand("bb")?.name).toBe("beta");
  });
});

describe("listCommands", () => {
  it("sorts by name whatever the registration order, and leaves hidden ones out", () => {
    registerCommands([cmd("mu"), cmd("kappa", { hidden: true }), cmd("delta"), cmd("lambda")]);
    const names = listCommands().map((c) => c.name);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("delta");
    expect(names).toContain("lambda");
    expect(names).not.toContain("kappa");
  });
});

describe("helpLines", () => {
  const a = cmd("apple", { help: "apple             a fruit" });
  const b = cmd("banana", { help: "banana            another" });
  const quiet = cmd("quiet");
  const hid = cmd("hid", { help: "hid               never seen", hidden: true });

  it("is the same whichever order the modules registered in", () => {
    expect(helpLines([b, quiet, hid, a])).toEqual(helpLines([a, b, hid, quiet]));
  });

  it("opens with the header and closes with the footer", () => {
    const lines = helpLines([a]);
    expect(lines.slice(0, HELP_HEAD.length)).toEqual(HELP_HEAD);
    expect(lines.slice(-HELP_FOOT.length)).toEqual(HELP_FOOT);
  });

  it("indents each listed line by four and lists only commands with help that are not hidden", () => {
    const lines = helpLines([b, quiet, hid, a]);
    const body = lines.slice(HELP_HEAD.length, -HELP_FOOT.length);
    expect(body).toEqual(["    apple             a fruit", "    banana            another"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/registry.test.ts
```

Expected: FAIL, `Cannot find module './registry'`.

- [ ] **Step 3: Write the registry**

```ts
// lib/commands/registry.ts
import type { CommandContext, CommandResult } from "./shared";

/**
 * The command registry.
 *
 * Every command on the site is a `defineCommand` in one of the modules under
 * `lib/commands/`, registered from `lib/commands/index.ts`. `lib/commands.ts`
 * derives `COMMANDS` and `HELP_LINES` from `listCommands()` and dispatches
 * through `findCommand()`, so a command is listed by being visible rather than
 * by being added to three lists by hand, and a hidden command is absent from
 * help, completion and `ls` by construction.
 *
 * Frozen by the toolshed design (section 8). Add exports if a later sub-project
 * needs one; never rename these.
 */

export type CommandDef = {
  name: string;
  aliases?: string[];
  /** One pre-formatted line for HELP_LINES, without the indent. Omitted or hidden: not listed. */
  help?: string;
  /** Absent from help, completion and ls. Reachable by name, and through `cd <name>`. */
  hidden?: boolean;
  /** Completion candidates for the first argument. The function form is called with an empty context by `complete()`. */
  argPool?: string[] | ((ctx: CommandContext) => string[]);
  run: (args: string[], ctx: CommandContext, raw: string) => CommandResult;
};

const byName = new Map<string, CommandDef>();
const byAlias = new Map<string, CommandDef>();

/** What `runCommand` can match: it lowercases the first word and splits on whitespace. */
const NAME = /^[a-z][a-z0-9-]*$/;

export function defineCommand(def: CommandDef): CommandDef {
  if (!NAME.test(def.name)) {
    throw new Error(`command name must match ${NAME}: '${def.name}'`);
  }
  return def;
}

/**
 * Registers or replaces. Replacing rather than throwing is deliberate: Fast
 * Refresh re-evaluates a changed command module against a registry that kept
 * its state, and a throw there would break every edit in development. Real
 * duplicates across modules are caught by `index.test.ts`.
 */
export function registerCommands(defs: CommandDef[]): void {
  for (const def of defs) {
    const previous = byName.get(def.name);
    if (previous) {
      for (const alias of previous.aliases ?? []) byAlias.delete(alias);
    }
    byName.set(def.name, def);
    for (const alias of def.aliases ?? []) byAlias.set(alias, def);
  }
}

const byNameAsc = (a: CommandDef, b: CommandDef): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** Visible commands, sorted by name. Registration order never shows. */
export function listCommands(): CommandDef[] {
  return [...byName.values()].filter((d) => !d.hidden).sort(byNameAsc);
}

/** By name first, then alias. Hidden commands are found: that is how a door opens. */
export function findCommand(word: string): CommandDef | undefined {
  return byName.get(word) ?? byAlias.get(word);
}

export const HELP_HEAD: string[] = ["FergusOS 5.0 · command reference", ""];

export const HELP_FOOT: string[] = [
  "",
  "    history · echo · date · pwd · clear · help",
  "    tab completes · up/down recalls · ctrl+L clears",
];

/**
 * The `help` text, from a list of definitions. `help` the command and
 * `HELP_LINES` the export both call this on `listCommands()`, so they cannot
 * disagree. Pure over its argument so the order test needs no registry.
 */
export function helpLines(defs: CommandDef[]): string[] {
  const listed = defs
    .filter((d) => !d.hidden && d.help)
    .sort(byNameAsc)
    .map((d) => `    ${d.help}`);
  return [...HELP_HEAD, ...listed, ...HELP_FOOT];
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/registry.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/registry.ts lib/commands/registry.test.ts
git commit -m "feat(commands): a registry with names, aliases, hidden commands and derived help"
```

---

### Task 3: The nav module

**Files:**
- Create: `lib/commands/nav.ts`
- Test: `lib/commands/nav.test.ts`

**Interfaces:**
- Consumes: `defineCommand`, `findCommand`, `helpLines`, `listCommands` from `./registry`; `SECTIONS`, `argOf`, `ok` from `./shared`
- Produces: `export const nav: CommandDef[]` with `help`, `whoami`, `ls`, `cd`, `open`, `cat`, `pwd`

The switch cases move verbatim. The only new line is the door rule in `cd`: a hidden command is reachable as `cd <name>`. Nothing hidden is registered in this test file, so the door is exercised in Task 8, where the whole registry is loaded.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/nav.test.ts
import { describe, it, expect } from "vitest";
import { nav } from "./nav";
import type { CommandDef } from "./registry";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

const def = (name: string): CommandDef => {
  const d = nav.find((c) => c.name === name);
  if (!d) throw new Error(`nav has no ${name}`);
  return d;
};
const run = (name: string, ...args: string[]) => def(name).run(args, {}, [name, ...args].join(" "));

describe("the nav module", () => {
  it("carries exactly the navigation commands", () => {
    expect(nav.map((c) => c.name).sort()).toEqual(["cat", "cd", "help", "ls", "open", "pwd", "whoami"]);
  });

  it("keeps the aliases the switch had", () => {
    expect(def("help").aliases).toEqual(["?", "man"]);
    expect(def("ls").aliases).toEqual(["dir"]);
  });

  it("cd strips slashes, routes sections, and goes home on nothing", () => {
    expect(run("cd", "/projects/")).toEqual({ type: "navigate", href: "/projects" });
    expect(run("cd", "experience")).toEqual({ type: "navigate", href: "/experience" });
    expect(run("cd", "blog")).toEqual({ type: "navigate", href: "/writing" });
    expect(run("cd", "skills")).toEqual({ type: "navigate", href: "/#skills" });
    expect(run("cd")).toEqual({ type: "navigate", href: "/" });
    expect(run("cd", "~")).toEqual({ type: "navigate", href: "/" });
  });

  it("cd refuses a section that does not exist, and nothing hidden is registered here", () => {
    expect(run("cd", "nowhere")).toEqual({ type: "output", lines: ["cd: no such section: nowhere"] });
    expect(run("cd", "arcade")).toEqual({ type: "output", lines: ["cd: no such section: arcade"] });
  });

  it("cd completes sections and only sections", () => {
    expect(def("cd").argPool).toEqual(["about", "skills", "experience", "projects", "writing", "contact"]);
  });

  it("open matches slug, title and prefix, and lists on nothing", () => {
    const first = projects[0];
    expect(run("open", first.slug)).toEqual({ type: "navigate", href: `/projects#${first.slug}` });
    expect(run("open", first.slug.slice(0, 3))).toMatchObject({ type: "navigate" });
    const none = run("open");
    if (none.type !== "output") throw new Error("expected output");
    expect(none.lines.join(" ")).toContain(first.slug);
    expect(run("open", "zzzz")).toEqual({ type: "output", lines: ["open: no project matching 'zzzz'"] });
    expect(def("open").argPool).toEqual(projects.map((p) => p.slug));
  });

  it("cat reads the bio and keeps the typed case in its error", () => {
    expect(run("cat", "about.txt")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "About")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "Secrets.txt")).toEqual({
      type: "output",
      lines: ["cat: Secrets.txt: No such file or directory"],
    });
    expect(def("cat").argPool).toEqual(["about.txt"]);
  });

  it("whoami, ls and pwd read the profile and the sections", () => {
    expect(run("whoami")).toEqual({ type: "output", lines: [profile.name, profile.tagline] });
    expect(run("pwd")).toEqual({ type: "output", lines: [`/home/${profile.user}`] });
    const ls = run("ls");
    if (ls.type !== "output") throw new Error("expected output");
    expect(ls.lines[0]).toBe("sections/");
    expect(ls.lines[1]).toContain("projects");
  });

  it("help reads the registry rather than carrying a list of its own", () => {
    const res = run("help");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines[0]).toBe("FergusOS 5.0 · command reference");
    expect(res.lines.at(-1)).toContain("tab completes");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/nav.test.ts
```

Expected: FAIL, `Cannot find module './nav'`.

- [ ] **Step 3: Write the module**

```ts
// lib/commands/nav.ts
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { defineCommand, findCommand, helpLines, listCommands } from "./registry";
import { SECTIONS, argOf, ok } from "./shared";

/** Getting around: the sections, the projects, the bio, and `help` itself. */
export const nav = [
  defineCommand({
    name: "help",
    aliases: ["?", "man"],
    run: () => ok(helpLines(listCommands())),
  }),

  defineCommand({
    name: "whoami",
    help: "whoami            who is this",
    run: () => ok([profile.name, profile.tagline]),
  }),

  defineCommand({
    name: "ls",
    aliases: ["dir"],
    help: "ls                list sections",
    run: () => ok(["sections/", "  " + SECTIONS.join("   ")]),
  }),

  defineCommand({
    name: "cd",
    help: "cd <section>      jump to a section",
    argPool: [...SECTIONS],
    run: (args, ctx, raw) => {
      const dest = argOf(args).replace(/^\/+|\/+$/g, "");
      if (dest === "" || dest === "~" || dest === "home") return { type: "navigate", href: "/" };
      if (dest === "projects") return { type: "navigate", href: "/projects" };
      if (dest === "experience") return { type: "navigate", href: "/experience" };
      if (dest === "writing" || dest === "blog" || dest === "posts")
        return { type: "navigate", href: "/writing" };
      if (dest === "about" || dest === "skills" || dest === "contact")
        return { type: "navigate", href: `/#${dest}` };
      // Doors. A hidden command is reachable as `cd <name>` and listed nowhere:
      // not in help, not in completion, not in ls. Anything after the name goes
      // to the door, so `cd arcade pong` can mean something once G0 exists.
      const door = findCommand(dest);
      if (door?.hidden) return door.run(args.slice(1), ctx, raw);
      return ok([`cd: no such section: ${dest}`]);
    },
  }),

  defineCommand({
    name: "open",
    help: "open <project>    open a project by name",
    argPool: projects.map((p) => p.slug),
    run: (args) => {
      const arg = argOf(args);
      if (!arg) return ok(["open: name a project", "  " + projects.map((p) => p.slug).join("  ")]);
      const match = projects.find(
        (p) => p.slug === arg || p.title.toLowerCase() === arg || p.slug.startsWith(arg),
      );
      if (!match) return ok([`open: no project matching '${arg}'`]);
      return { type: "navigate", href: `/projects#${match.slug}` };
    },
  }),

  defineCommand({
    name: "cat",
    help: "cat about.txt     read the bio",
    argPool: ["about.txt"],
    run: (args) => {
      const arg = argOf(args);
      if (arg === "about.txt" || arg === "about") return ok(profile.bio);
      return ok([`cat: ${args[0] ?? ""}: No such file or directory`]);
    },
  }),

  defineCommand({
    name: "pwd",
    run: () => ok([`/home/${profile.user}`]),
  }),
];
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/nav.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/nav.ts lib/commands/nav.test.ts
git commit -m "feat(commands): the nav module, with cd as the door to hidden commands"
```

---

### Task 4: The info module

**Files:**
- Create: `lib/commands/info.ts`
- Test: `lib/commands/info.test.ts`

**Interfaces:**
- Consumes: `defineCommand` from `./registry`; `argOf`, `ok` from `./shared`; `formatUptime` from `lib/system.ts`; `profile`, `projects`, `experience`, `articles` from `content/`
- Produces: `export const info: CommandDef[]` with `contact`, `resume`, `neofetch`, `uptime`, `top`, `history`, `date`, `echo`

`top` gains one row, `arcade`, which the design (section 6, G0) names as the single hint that the door exists. Everything else moves verbatim.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/info.test.ts
import { describe, it, expect } from "vitest";
import { info } from "./info";
import type { CommandDef } from "./registry";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

const def = (name: string): CommandDef => {
  const d = info.find((c) => c.name === name);
  if (!d) throw new Error(`info has no ${name}`);
  return d;
};
const lines = (name: string, args: string[] = [], ctx = {}): string[] => {
  const res = def(name).run(args, ctx, [name, ...args].join(" "));
  if (res.type !== "output") throw new Error(`${name} did not print`);
  return res.lines;
};

describe("the info module", () => {
  it("carries exactly the informational commands", () => {
    expect(info.map((c) => c.name).sort()).toEqual([
      "contact", "date", "echo", "history", "neofetch", "resume", "top", "uptime",
    ]);
    expect(def("resume").aliases).toEqual(["cv"]);
    expect(def("top").aliases).toEqual(["ps"]);
  });

  it("top lists an arcade process, and it is the only hint the door gets", () => {
    const out = lines("top");
    expect(out[0]).toContain("PID");
    expect(out.some((l) => /\barcade$/.test(l))).toBe(true);
    // One row. Not a banner, not a comment, not a second line about it.
    expect(out.filter((l) => l.includes("arcade"))).toHaveLength(1);
  });

  it("neofetch and uptime read the context, not the clock", () => {
    const neo = lines("neofetch", [], { uptimeMs: 3_725_000, theme: "amber" }).join("\n");
    expect(neo).toContain("01:02:05");
    expect(neo).toContain("amber");
    expect(neo).toContain(profile.user);
    expect(lines("uptime", [], { uptimeMs: 65_000 })[0]).toContain("00:01:05");
  });

  it("date uses the injected clock", () => {
    const now = new Date("2026-09-03T09:00:00Z");
    expect(lines("date", [], { now })[0]).toBe(now.toString());
  });

  it("history numbers prior commands and says when there are none", () => {
    expect(lines("history")[0]).toContain("no history");
    const out = lines("history", [], { history: ["whoami", "ls"] });
    expect(out).toEqual(["   1  whoami", "   2  ls"]);
  });

  it("echo keeps the typed case and collapses the whitespace the parser already split", () => {
    expect(lines("echo", ["Hello", "World"])).toEqual(["Hello World"]);
  });

  it("resume names every project, and contact every profile", () => {
    const cv = lines("resume").join("\n");
    for (const p of projects) expect(cv).toContain(p.slug);
    const contact = lines("contact").join("\n");
    for (const c of profile.contact) expect(contact).toContain(`${c.label}: ${c.value}`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/info.test.ts
```

Expected: FAIL, `Cannot find module './info'`.

- [ ] **Step 3: Write the module**

```ts
// lib/commands/info.ts
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { articles } from "@/content/articles";
import { formatUptime } from "@/lib/system";
import { defineCommand } from "./registry";
import { ok } from "./shared";
import type { CommandContext } from "./shared";

function neofetch(ctx: CommandContext): string[] {
  const art = [
    "      ▄▄▄▄▄▄▄▄▄      ",
    "    ▄█████████████▄  ",
    "   ███▀  ▄▄▄  ▀███▄  ",
    "  ███   █████   ███  ",
    "  ███   ▀▀▀▀▀   ███  ",
    "   ▀███▄▄   ▄▄███▀   ",
    "     ▀█████████▀     ",
    "        ▀▀▀▀▀        ",
  ];
  const info = [
    `${profile.user}@${profile.host}`,
    "─────────────────────────",
    `OS       FergusOS 5.0 "Mass"`,
    `Host     Trinity College Dublin`,
    `Kernel   next-15 · react-19 · webgl · webaudio`,
    `Uptime   ${formatUptime(ctx.uptimeMs ?? 0)}`,
    `Shell    fsh 4.0`,
    `Display  ${ctx.theme ?? "green"} phosphor · 4:3`,
    `Role     Co-Founder & CTO, Presterly`,
    `Repos    ${projects.length} shipped · ${experience.length} posts`,
    // By label, not by index: `contact` has grown before and index 0 only
    // happens to be the email.
    `Contact  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
  ];
  const rows = Math.max(art.length, info.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    out.push(`${(art[i] ?? " ".repeat(21)).padEnd(23)}${info[i] ?? ""}`);
  }
  return out;
}

function top(): string[] {
  const rows = [
    ["1", "fergus", "38.2", "12.4", "presterly-engine"],
    ["7", "fergus", "22.9", "18.1", "prediction-worker"],
    ["12", "fergus", "11.4", "6.2", "whatsapp-bridge"],
    ["19", "fergus", "8.7", "4.0", "trinity-coursework"],
    ["24", "root", "4.1", "2.2", "phosphor-shader"],
    // The one hint that `cd arcade` exists. Not in help, not in completion,
    // not in ls: a process in the table is all a visitor is given.
    ["28", "fergus", "0.1", "0.8", "arcade"],
    ["31", "fergus", "0.4", "0.9", "sleep"],
  ];
  return [
    "  PID  USER     %CPU  %MEM  COMMAND",
    ...rows.map(
      ([pid, user, cpu, mem, cmd]) =>
        `${pid.padStart(5)}  ${user.padEnd(7)}${cpu.padStart(5)} ${mem.padStart(5)}  ${cmd}`,
    ),
    "",
    "load average: 0.94, 1.12, 0.88",
  ];
}

function resume(): string[] {
  const out: string[] = [`${profile.name} · ${profile.tagline}`, profile.education, ""];
  for (const item of experience) {
    out.push(`${item.dates.padEnd(22)}${item.org} · ${item.role}`);
  }
  out.push("", "projects/");
  for (const p of projects) {
    out.push(`  ${p.slug.padEnd(22)}${p.tagline}`);
  }
  out.push("", "writing/");
  for (const a of articles) {
    out.push(`  ${a.date.padEnd(22)}${a.title}`);
  }
  out.push("", `contact: ${profile.contact.map((c) => c.value).join("  ·  ")}`);
  return out;
}

/** Things the machine can tell you about itself and its owner. */
export const info = [
  defineCommand({
    name: "contact",
    help: "contact           show contact details",
    run: () => ok(profile.contact.map((c) => `${c.label}: ${c.value}`)),
  }),

  defineCommand({
    name: "resume",
    aliases: ["cv"],
    help: "resume            print the short CV",
    run: () => ok(resume()),
  }),

  defineCommand({
    name: "neofetch",
    help: "neofetch          system summary",
    run: (_args, ctx) => ok(neofetch(ctx)),
  }),

  defineCommand({
    name: "uptime",
    help: "uptime            session uptime",
    run: (_args, ctx) => ok([`up ${formatUptime(ctx.uptimeMs ?? 0)}  ·  1 user  ·  load average: 0.94`]),
  }),

  defineCommand({
    name: "top",
    aliases: ["ps"],
    help: "top               running processes",
    run: () => ok(top()),
  }),

  defineCommand({
    name: "history",
    run: (_args, ctx) => {
      const h = ctx.history ?? [];
      if (h.length === 0) return ok(["(no history yet)"]);
      return ok(h.map((line, i) => `${String(i + 1).padStart(4)}  ${line}`));
    },
  }),

  defineCommand({
    name: "echo",
    run: (args) => ok([args.join(" ")]),
  }),

  defineCommand({
    name: "date",
    run: (_args, ctx) => ok([(ctx.now ?? new Date()).toString()]),
  }),
];
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/info.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/info.ts lib/commands/info.test.ts
git commit -m "feat(commands): the info module, and top shows an arcade process"
```

---

### Task 5: The effects module

**Files:**
- Create: `lib/commands/effects.ts`
- Test: `lib/commands/effects.test.ts`

**Interfaces:**
- Consumes: `defineCommand` from `./registry`; `argOf`, `ok` from `./shared`; `isTheme` from `lib/system.ts`
- Produces: `export const effects: CommandDef[]` with `theme`, `crt`, `scanlines`, `matrix`, `degauss`, `gravity`, `eject`, `dock`, `sound`, `clear`

Two things to notice. The reduced-motion refusals become single-line guards over named constants so the mutation anchors in Task 10 are stable. And `eject` and `dock` share one implementation through a factory keyed on the name, which is what the old `case "eject": case "dock":` did with `cmd`.

Parity is kept exactly: `eject` and `dock` have no `argPool`, because today `complete("eject o")` returns `null`. Giving them `on`/`off` is an obvious improvement and it is deliberately not done here, so the acceptance test stays "the old tests pass and nothing else changed".

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/effects.test.ts
import { describe, it, expect } from "vitest";
import { effects, EJECT_DECLINED, GRAVITY_DECLINED } from "./effects";
import type { CommandDef } from "./registry";

const def = (name: string): CommandDef => {
  const d = effects.find((c) => c.name === name);
  if (!d) throw new Error(`effects has no ${name}`);
  return d;
};
const run = (name: string, args: string[] = [], ctx = {}) =>
  def(name).run(args, ctx, [name, ...args].join(" "));

describe("the effects module", () => {
  it("carries exactly the commands that touch the machine", () => {
    expect(effects.map((c) => c.name).sort()).toEqual([
      "clear", "crt", "degauss", "dock", "eject", "gravity", "matrix", "scanlines", "sound", "theme",
    ]);
    expect(def("clear").aliases).toEqual(["cls"]);
  });

  it("theme reports, rejects, or fires, and completes the three phosphors", () => {
    expect(run("theme", [], { theme: "ice" })).toMatchObject({ type: "output" });
    expect(run("theme", ["purple"])).toMatchObject({ type: "output" });
    expect(run("theme", ["amber"])).toEqual({
      type: "effect",
      effect: { kind: "theme", theme: "amber" },
      lines: ["phosphor -> amber"],
    });
    expect(def("theme").argPool).toEqual(["green", "amber", "ice"]);
  });

  it("scanlines maps a percentage and refuses the rest", () => {
    expect(run("scanlines", ["40"])).toMatchObject({ effect: { kind: "scanlines", value: 0.4 } });
    for (const bad of [["140"], ["-3"], ["lots"], []]) {
      expect(run("scanlines", bad)).toEqual({ type: "output", lines: ["usage: scanlines <0-100>"] });
    }
  });

  it("gravity and eject decline under reduced motion with the named sentences", () => {
    expect(run("gravity", [], { reducedMotion: true })).toEqual({ type: "output", lines: GRAVITY_DECLINED });
    expect(run("eject", [], { reducedMotion: true })).toEqual({ type: "output", lines: EJECT_DECLINED });
    // The way back is never declined.
    expect(run("gravity", ["off"], { reducedMotion: true })).toMatchObject({ type: "effect" });
    expect(run("dock", [], { reducedMotion: true })).toMatchObject({ effect: { kind: "eject", on: false } });
  });

  it("eject and dock are two names for one behaviour", () => {
    expect(run("eject")).toMatchObject({ effect: { kind: "eject", on: true } });
    expect(run("eject", ["off"])).toMatchObject({ effect: { kind: "eject", on: false } });
    expect(run("dock")).toMatchObject({ effect: { kind: "eject", on: false } });
    expect(run("dock", ["on"])).toMatchObject({ effect: { kind: "eject", on: true } });
    // Parity with the switch: neither completes an argument yet.
    expect(def("eject").argPool).toBeUndefined();
    expect(def("dock").argPool).toBeUndefined();
  });

  it("crt, sound and gravity complete on and off", () => {
    for (const name of ["crt", "sound", "gravity"]) expect(def(name).argPool).toEqual(["on", "off"]);
    expect(run("crt", ["maybe"])).toEqual({ type: "output", lines: ["usage: crt on|off"] });
    expect(run("sound")).toEqual({ type: "output", lines: ["usage: sound on|off"] });
  });

  it("matrix, degauss and clear are what they were", () => {
    expect(run("matrix")).toMatchObject({ effect: { kind: "matrix", ms: 9000 } });
    expect(run("degauss")).toEqual({ type: "effect", effect: { kind: "degauss" }, lines: ["*THWOMP*"] });
    expect(run("clear")).toEqual({ type: "clear" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/effects.test.ts
```

Expected: FAIL, `Cannot find module './effects'`.

- [ ] **Step 3: Write the module**

```ts
// lib/commands/effects.ts
import { isTheme } from "@/lib/system";
import { defineCommand } from "./registry";
import type { CommandDef } from "./registry";
import { argOf, ok } from "./shared";

/**
 * Commands that change the running site. Every one returns an effect
 * descriptor and touches nothing itself; `components/Terminal.tsx` is the only
 * place that applies one. That is what keeps them testable without a DOM.
 */

/**
 * The refusals, as named constants and one-line guards, so
 * `scripts/mutation-check.mjs` can anchor on the guard and prove the tests
 * notice when it goes.
 */
export const GRAVITY_DECLINED: string[] = [
  "gravity: declined.",
  "your system asks for reduced motion, and there is no still version of",
  "this one. everything on the page stays where it is.",
];

export const EJECT_DECLINED: string[] = [
  "eject: declined.",
  "your system asks for reduced motion. the camera stays where it is.",
];

/**
 * `eject` with no argument pulls back, `dock` pushes in; either accepts an
 * explicit on/off so the two names stay one behaviour rather than two.
 */
function ejectOrDock(mode: "eject" | "dock"): CommandDef["run"] {
  return (args, ctx) => {
    const arg = argOf(args);
    const on = mode === "eject" ? arg !== "off" : arg === "on";
    if (on && ctx.reducedMotion) return ok(EJECT_DECLINED);
    return {
      type: "effect",
      effect: { kind: "eject", on },
      lines: on ? ["stepping back from the glass..."] : ["back against the tube."],
    };
  };
}

export const effects = [
  defineCommand({
    name: "theme",
    help: "theme <name>      green · amber · ice",
    argPool: ["green", "amber", "ice"],
    run: (args, ctx) => {
      const arg = argOf(args);
      if (!arg) return ok([`theme: ${ctx.theme ?? "green"}`, "usage: theme green|amber|ice"]);
      if (!isTheme(arg)) return ok([`theme: unknown phosphor '${arg}'`, "try: green · amber · ice"]);
      return { type: "effect", effect: { kind: "theme", theme: arg }, lines: [`phosphor -> ${arg}`] };
    },
  }),

  defineCommand({
    name: "crt",
    help: "crt <on|off>      toggle the tube",
    argPool: ["on", "off"],
    run: (args) => {
      const arg = argOf(args);
      if (arg !== "on" && arg !== "off") return ok(["usage: crt on|off"]);
      return {
        type: "effect",
        effect: { kind: "crt", on: arg === "on" },
        lines: [arg === "on" ? "tube warming up..." : "tube off. flat pixels restored."],
      };
    },
  }),

  defineCommand({
    name: "scanlines",
    help: "scanlines <0-100> set mask intensity",
    run: (args) => {
      const arg = argOf(args);
      const n = Number(arg);
      if (!arg || !Number.isFinite(n) || n < 0 || n > 100) return ok(["usage: scanlines <0-100>"]);
      return {
        type: "effect",
        effect: { kind: "scanlines", value: n / 100 },
        lines: [`mask intensity -> ${Math.round(n)}%`],
      };
    },
  }),

  defineCommand({
    name: "matrix",
    help: "matrix            let it rain",
    run: () => ({
      type: "effect",
      effect: { kind: "matrix", ms: 9000 },
      lines: ["wake up, neo...", "following the white rabbit for 9 seconds."],
    }),
  }),

  defineCommand({
    name: "degauss",
    help: "degauss           thump the magnets",
    run: () => ({ type: "effect", effect: { kind: "degauss" }, lines: ["*THWOMP*"] }),
  }),

  defineCommand({
    name: "gravity",
    help: "gravity           drop the page. drag it. throw it.",
    argPool: ["on", "off"],
    run: (args, ctx) => {
      const arg = argOf(args);
      const on = arg !== "off" && arg !== "0";
      if (on && ctx.reducedMotion) return ok(GRAVITY_DECLINED);
      return {
        type: "effect",
        effect: { kind: "gravity", on },
        lines: on
          ? ["gravity: 9.81 m/s² restored.", "drag a word · space shakes the tube · esc puts it back"]
          : ["gravity: released. reassembling."],
      };
    },
  }),

  defineCommand({
    name: "eject",
    help: "eject / dock      pull the camera back off the glass",
    run: ejectOrDock("eject"),
  }),

  defineCommand({
    name: "dock",
    run: ejectOrDock("dock"),
  }),

  defineCommand({
    name: "sound",
    help: "sound <on|off>    the tube has a voice",
    argPool: ["on", "off"],
    run: (args) => {
      const arg = argOf(args);
      if (arg !== "on" && arg !== "off") return ok(["usage: sound on|off"]);
      const on = arg === "on";
      return {
        type: "effect",
        effect: { kind: "sound", on },
        lines: on
          ? [
              "audio: unmuted. silent at rest, so it only speaks when you do something.",
              "(everything you hear is synthesised at runtime. there are no audio files.)",
            ]
          : ["audio: muted."],
      };
    },
  }),

  defineCommand({
    name: "clear",
    aliases: ["cls"],
    run: () => ({ type: "clear" }),
  }),
];
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/effects.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/effects.ts lib/commands/effects.test.ts
git commit -m "feat(commands): the effects module, with the refusals as anchored guards"
```

---

### Task 6: The sudo module and the hidden door

**Files:**
- Create: `lib/commands/sudo.ts`
- Create: `lib/commands/hidden.ts`
- Test: `lib/commands/sudo.test.ts`
- Test: `lib/commands/hidden.test.ts`

**Interfaces:**
- Consumes: `defineCommand` from `./registry`; `argOf`, `ok` from `./shared`; `profile`
- Produces: `export const sudo: CommandDef[]`; `export const hidden: CommandDef[]` with `arcade` (`hidden: true`, output `"arcade: no runtime yet"`)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/sudo.test.ts
import { describe, it, expect } from "vitest";
import { sudo } from "./sudo";
import { profile } from "@/content/profile";

const run = (...args: string[]) => sudo[0].run(args, {}, ["sudo", ...args].join(" "));

describe("sudo", () => {
  it("is one command", () => {
    expect(sudo.map((c) => c.name)).toEqual(["sudo"]);
    expect(sudo[0].help).toBe("sudo hire-me      ;)");
  });

  it("hire-me prints the email, in either spelling", () => {
    const email = profile.contact.find((c) => c.label === "email")?.value ?? "";
    for (const args of [["hire-me"], ["hire", "me"], ["Hire-Me"]]) {
      const res = run(...args);
      if (res.type !== "output") throw new Error("expected output");
      expect(res.lines[0]).toContain("granted");
      expect(res.lines.join("\n")).toContain(email);
    }
  });

  it("rm -rf / reboots rather than pretending to delete anything", () => {
    const res = run("rm", "-rf", "/");
    expect(res).toMatchObject({ type: "effect", effect: { kind: "reboot" } });
    if (res.type === "effect") expect(res.lines.join("\n")).toContain("kernel panic");
    expect(run("rm", "-rf", "/*")).toMatchObject({ effect: { kind: "reboot" } });
  });

  it("anything else needs no permission theatrics", () => {
    expect(run("make", "tea")).toEqual({
      type: "output",
      lines: ["sudo: make tea: no permission theatrics needed here"],
    });
    expect(run()).toEqual({ type: "output", lines: ["sudo: command: no permission theatrics needed here"] });
  });
});
```

```ts
// lib/commands/hidden.test.ts
import { describe, it, expect } from "vitest";
import { hidden } from "./hidden";

describe("the hidden module", () => {
  it("holds the arcade door, hidden, with no help and no completion", () => {
    const arcade = hidden.find((c) => c.name === "arcade");
    if (!arcade) throw new Error("no arcade");
    expect(arcade.hidden).toBe(true);
    expect(arcade.help).toBeUndefined();
    expect(arcade.argPool).toBeUndefined();
  });

  it("is closed until G0 supplies a runtime", () => {
    const arcade = hidden.find((c) => c.name === "arcade")!;
    expect(arcade.run([], {}, "arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
  });

  it("marks everything in it hidden, by construction", () => {
    for (const c of hidden) expect(c.hidden, c.name).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/sudo.test.ts lib/commands/hidden.test.ts
```

Expected: FAIL on both, `Cannot find module`.

- [ ] **Step 3: Write both modules**

```ts
// lib/commands/sudo.ts
import { profile } from "@/content/profile";
import { defineCommand } from "./registry";
import { argOf, ok } from "./shared";

/** The one command that pretends to need permission. */
export const sudo = [
  defineCommand({
    name: "sudo",
    help: "sudo hire-me      ;)",
    run: (args) => {
      const arg = argOf(args);
      if (arg === "hire-me" || arg === "hire me")
        return ok([
          "[sudo] access granted ✓",
          "excellent choice. let's talk.",
          `  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
        ]);
      if (arg === "rm -rf /" || arg === "rm -rf /*")
        return {
          type: "effect",
          effect: { kind: "reboot" },
          lines: [
            "rm: descending into /",
            "removing /dev/ambition ... failed: resource busy",
            "removing /usr/bin/discipline ... failed: resource busy",
            "kernel panic. nothing left to delete.",
          ],
        };
      return ok([`sudo: ${arg || "command"}: no permission theatrics needed here`]);
    },
  }),
];
```

```ts
// lib/commands/hidden.ts
import { defineCommand } from "./registry";
import { ok } from "./shared";

/**
 * Doors. Nothing in this file appears in help, completion or ls. A door is
 * reached by name or as `cd <name>`, and the only hint anywhere is the
 * `arcade` row in `top`.
 *
 * G0 replaces the arcade's `run` with `{ type: "program", program }` and the
 * Terminal hands that to the runtime. Until then the door exists and is closed.
 */
export const hidden = [
  defineCommand({
    name: "arcade",
    hidden: true,
    run: () => ok(["arcade: no runtime yet"]),
  }),
];
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/sudo.test.ts lib/commands/hidden.test.ts
```

Expected: PASS, 4 and 3 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/sudo.ts lib/commands/sudo.test.ts lib/commands/hidden.ts lib/commands/hidden.test.ts
git commit -m "feat(commands): sudo on its own, and a hidden arcade door that is closed"
```

---

### Task 7: The registration file

**Files:**
- Create: `lib/commands/index.ts`
- Test: `lib/commands/index.test.ts`

**Interfaces:**
- Consumes: the five module arrays; `registerCommands`
- Produces: `export const MODULES: CommandDef[][]`; registration as a side effect of import

- [ ] **Step 1: Write the failing tests**

```ts
// lib/commands/index.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "./index";
import { findCommand } from "./registry";

describe("the registration file", () => {
  it("never claims one name or alias twice across modules", () => {
    // The registry replaces on re-registration (for Fast Refresh), so this is
    // the place a genuine duplicate is caught.
    const owner = new Map<string, string>();
    for (const defs of MODULES) {
      for (const d of defs) {
        for (const word of [d.name, ...(d.aliases ?? [])]) {
          expect(owner.has(word), `'${word}' is claimed by ${owner.get(word)} and ${d.name}`).toBe(false);
          owner.set(word, d.name);
        }
      }
    }
  });

  it("registers everything on import", () => {
    for (const defs of MODULES) for (const d of defs) expect(findCommand(d.name)).toBe(d);
  });

  it("keeps its module imports alphabetical, so two pull requests rarely collide", () => {
    const src = readFileSync(join(process.cwd(), "lib", "commands", "index.ts"), "utf8");
    const mods = [...src.matchAll(/^import \{ \w+ \} from "\.\/(\w+)";\r?$/gm)]
      .map((m) => m[1])
      .filter((m) => m !== "registry");
    expect(mods.length).toBe(MODULES.length);
    expect(mods).toEqual([...mods].sort());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/index.test.ts
```

Expected: FAIL, `Cannot find module './index'`.

- [ ] **Step 3: Write the file**

```ts
// lib/commands/index.ts
import { registerCommands } from "./registry";
import type { CommandDef } from "./registry";
import { effects } from "./effects";
import { hidden } from "./hidden";
import { info } from "./info";
import { nav } from "./nav";
import { sudo } from "./sudo";

/**
 * Every command module, alphabetical by module. A new module is one import
 * line and one entry here, both in alphabetical position, so two pull requests
 * adding modules rarely touch the same line. `index.test.ts` checks the order
 * and that no name or alias is claimed twice.
 *
 * Importing this file registers everything. `lib/commands.ts` imports it as
 * `./commands/index`, with the `/index` written out, so it can never be
 * mistaken for `lib/commands.ts` itself.
 */
export const MODULES: CommandDef[][] = [effects, hidden, info, nav, sudo];

for (const defs of MODULES) registerCommands(defs);
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd "$WT"
npx vitest run lib/commands/index.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/commands/index.ts lib/commands/index.test.ts
git commit -m "feat(commands): register the modules in alphabetical lines"
```

---

### Task 8: `lib/commands.ts` becomes the dispatcher

**Files:**
- Modify: `lib/commands.ts` (the whole file after the re-exports from Task 1)
- Test: `lib/commands/dispatch.test.ts` (new)
- Test: `lib/commands.test.ts` (**unchanged**, run as the acceptance test)

**Interfaces:**
- Consumes: `./commands/index` (side effect), `findCommand`, `helpLines`, `listCommands` from `./commands/registry`, `ok` from `./commands/shared`
- Produces: `COMMANDS: readonly string[]`, `HELP_LINES: string[]`, `runCommand(input, ctx?)`, `complete(input)`, unchanged in name and shape

`COMMANDS` was a literal tuple (`as const`). It becomes `readonly string[]`. Nothing in the repo reads its element type (checked with `grep -rn "COMMANDS" --include=*.ts --include=*.tsx`: only `lib/commands.ts` and `complete()` use it), so this is not a visible change.

- [ ] **Step 1: Write the new tests, which fail against the switch**

```ts
// lib/commands/dispatch.test.ts
import { describe, it, expect } from "vitest";
import { COMMANDS, HELP_LINES, complete, runCommand } from "@/lib/commands";
import { defineCommand, registerCommands } from "@/lib/commands/registry";
import type { ProgramSpec } from "@/lib/arcade/program";

/**
 * The properties the registry buys, proven through the public surface. The
 * behavioural parity of every existing command is `lib/commands.test.ts`,
 * which this plan leaves untouched on purpose.
 */

describe("hidden commands", () => {
  it("are absent from COMMANDS, HELP_LINES, completion and ls", () => {
    expect(COMMANDS).not.toContain("arcade");
    expect(HELP_LINES.join("\n")).not.toContain("arcade");
    expect(complete("arc")).toBeNull();
    expect(complete("arcade ")).toBeNull();
    expect(complete("cd arc")).toBeNull();
    const ls = runCommand("ls");
    if (ls.type !== "output") throw new Error("expected output");
    expect(ls.lines.join(" ")).not.toContain("arcade");
  });

  it("open as `cd <name>`, and the arcade is closed until G0", () => {
    expect(runCommand("cd arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
    expect(runCommand("arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
  });

  it("get their one hint from top", () => {
    const res = runCommand("top");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines.join("\n")).toContain("arcade");
  });
});

describe("aliases", () => {
  it.each([
    ["dir", "ls"],
    ["cv", "resume"],
    ["ps", "top"],
    ["cls", "clear"],
    ["?", "help"],
    ["man", "help"],
  ])("%s runs as %s", (alias, name) => {
    expect(runCommand(alias)).toEqual(runCommand(name));
  });

  it("are not offered by completion, exactly as before", () => {
    expect(complete("di")).toBeNull();
    expect(complete("cl")).toBe("clear");
  });
});

describe("derived lists", () => {
  it("COMMANDS is sorted and hides nothing visible", () => {
    expect([...COMMANDS]).toEqual([...COMMANDS].sort());
    for (const name of ["help", "whoami", "ls", "cd", "cat", "contact", "resume", "open", "neofetch",
      "uptime", "top", "theme", "crt", "scanlines", "matrix", "degauss", "gravity", "eject", "dock",
      "sound", "history", "echo", "date", "pwd", "clear", "sudo"]) {
      expect(COMMANDS, name).toContain(name);
    }
  });

  it("help the command prints HELP_LINES the export", () => {
    expect(runCommand("help")).toEqual({ type: "output", lines: HELP_LINES });
  });

  it("HELP_LINES is sorted between its header and footer", () => {
    const body = HELP_LINES.filter((l) => l.startsWith("    ") && !l.includes("·"));
    const names = body.map((l) => l.trim().split(/\s+/)[0]);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("gravity");
    expect(names).toContain("sudo");
  });
});

describe("a program result", () => {
  const spec: ProgramSpec = {
    id: "zz-probe",
    title: "zz probe",
    start: () => ({ tick() {}, key() {}, dispose() {} }),
  };
  registerCommands([
    defineCommand({ name: "zz-probe", hidden: true, run: () => ({ type: "program", program: spec }) }),
  ]);

  it("comes back from runCommand untouched", () => {
    const res = runCommand("zz-probe");
    expect(res.type).toBe("program");
    if (res.type === "program") expect(res.program).toBe(spec);
  });

  it("comes through the cd door too", () => {
    expect(runCommand("cd zz-probe")).toEqual({ type: "program", program: spec });
  });

  it("stays out of the derived lists even when registered late", () => {
    // COMMANDS and HELP_LINES are computed once at import; a late hidden
    // registration is invisible either way, and this pins that down.
    expect(COMMANDS).not.toContain("zz-probe");
    expect(complete("zz")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd "$WT"
npx vitest run lib/commands/dispatch.test.ts
```

Expected: FAIL. `cd arcade` prints `cd: no such section: arcade`; `runCommand("zz-probe")` prints `command not found`; the `help` line for `sudo` is under "and one more thing" rather than sorted. Some assertions pass by accident (the aliases already work); that is fine, the file as a whole is red.

- [ ] **Step 3: Replace the body of `lib/commands.ts`**

The whole file becomes:

```ts
// lib/commands.ts
import "./commands/index";
import { findCommand, helpLines, listCommands } from "./commands/registry";
import { ok } from "./commands/shared";

export type { SystemEffect, CommandResult, CommandContext } from "./commands/shared";
export { SECTIONS } from "./commands/shared";
export type { CommandDef } from "./commands/registry";
import type { CommandContext, CommandResult } from "./commands/shared";

/**
 * The terminal's front door. Pure: no DOM, router or system access. Callers act
 * on the returned CommandResult, and `components/Terminal.tsx` is the only one
 * allowed to apply an effect or host a program.
 *
 * Every command lives in a module under `lib/commands/` and is registered by
 * `lib/commands/index.ts`, which the first import above evaluates before
 * anything here runs. The two lists below are snapshots of the registry taken
 * at that moment: visible commands only, sorted by name.
 */

/** Every visible command name, for tab completion. */
export const COMMANDS: readonly string[] = listCommands().map((c) => c.name);

/** The `help` text. Same function `help` the command calls, so they cannot differ. */
export const HELP_LINES: string[] = helpLines(listCommands());

export function runCommand(input: string, ctx: CommandContext = {}): CommandResult {
  const raw = input.trim();
  if (!raw) return ok([]);

  const [rawCmd, ...args] = raw.split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  const def = findCommand(cmd);
  if (!def) return ok([`command not found: ${cmd}`, "type 'help' to see what's available"]);
  return def.run(args, ctx, raw);
}

/**
 * Tab completion. Completes the command name on the first token, and the
 * argument (section, project, theme...) once a command with an `argPool` is
 * typed. Hidden commands complete nothing, not even their arguments. Returns
 * the full replacement line, or null when there is nothing to add.
 */
export function complete(input: string): string | null {
  const hasTrailingSpace = /\s$/.test(input);
  const parts = input.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return null;

  // Completing the command itself.
  if (parts.length === 1 && !hasTrailingSpace) {
    const prefix = parts[0].toLowerCase();
    const hits = COMMANDS.filter((c) => c.startsWith(prefix));
    if (hits.length === 0) return null;
    return sharedPrefix(hits, prefix);
  }

  const def = findCommand(parts[0].toLowerCase());
  if (!def || def.hidden || !def.argPool) return null;
  // `complete` has no context to give, so a pool function sees an empty one.
  const pool = typeof def.argPool === "function" ? def.argPool({}) : def.argPool;

  const argPrefix = hasTrailingSpace ? "" : (parts[parts.length - 1]?.toLowerCase() ?? "");
  const hits = pool.filter((p) => p.startsWith(argPrefix));
  if (hits.length === 0) return null;

  const completed = sharedPrefix(hits, argPrefix);
  const head = hasTrailingSpace ? parts : parts.slice(0, -1);
  return `${head.join(" ")} ${completed}`;
}

/** Longest common prefix of the candidates, never shorter than what was typed. */
function sharedPrefix(candidates: string[], typed: string): string {
  if (candidates.length === 1) return candidates[0];
  let prefix = candidates[0];
  for (const c of candidates.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < c.length && prefix[i] === c[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.length > typed.length ? prefix : typed;
}
```

Everything that was between the old imports and `runCommand` (the `COMMANDS` tuple, the hand-written `HELP_LINES`, `neofetch`, `top`, `resume`) and the whole `switch` are gone. The `content/` and `lib/system` imports go with them.

- [ ] **Step 4: Run the acceptance test and the new one**

```bash
cd "$WT"
npx vitest run lib/commands.test.ts lib/commands/dispatch.test.ts
git diff --stat -- lib/commands.test.ts
```

Expected: both files PASS; the `git diff --stat` line for `lib/commands.test.ts` prints nothing, because the file was not touched. If any old test fails, the fix goes in the module that owns the command, never in the test.

- [ ] **Step 5: Run everything and the type check**

```bash
cd "$WT"
npx vitest run
npx tsc --noEmit
```

Expected: green, `tsc` silent. The `program` branch from Task 1 is what keeps `res.lines` well-typed in `Terminal.tsx` now that a real `program` result can come back through `runCommand`.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/commands.ts lib/commands/dispatch.test.ts
git commit -m "refactor(commands): dispatch through the registry, tests unchanged"
```

---

### Task 9: The mutation check learns the moved guards

**Files:**
- Modify: `scripts/mutation-check.mjs` (append to `MUTATIONS`)

**Interfaces:**
- Consumes: the anchors written in Tasks 3, 5, 6 and 2
- Produces: seven more rows in the run, all expected RED

The script breaks each guard, runs `npx vitest run --silent`, restores the file, and reports. A guard that survives is decoration. Nothing in the existing table anchors on `lib/commands.ts` or `Terminal.tsx` (checked: `grep -n "lib/commands\|Terminal.tsx" scripts/mutation-check.mjs` prints nothing), so the file move breaks no existing anchor.

- [ ] **Step 1: Add the entries**

After the last existing entry in the `MUTATIONS` array, before the closing `];`, add:

```js
  // ── the command registry (F1): guards that moved out of one switch ──
  {
    name: "gravity stops declining under reduced motion",
    file: "lib/commands/effects.ts",
    pattern: /if \(on && ctx\.reducedMotion\) return ok\(GRAVITY_DECLINED\);/,
    replace: "if (false) return ok(GRAVITY_DECLINED);",
  },
  {
    name: "eject stops declining under reduced motion",
    file: "lib/commands/effects.ts",
    pattern: /if \(on && ctx\.reducedMotion\) return ok\(EJECT_DECLINED\);/,
    replace: "if (false) return ok(EJECT_DECLINED);",
  },
  {
    name: "scanlines accepts values above 100",
    file: "lib/commands/effects.ts",
    pattern: /n < 0 \|\| n > 100\)/,
    replace: "n < 0 || n > 1000)",
  },
  {
    name: "theme fires an effect for a phosphor that does not exist",
    file: "lib/commands/effects.ts",
    pattern: /if \(!isTheme\(arg\)\)/,
    replace: "if (false)",
  },
  {
    name: "the arcade door is no longer hidden",
    file: "lib/commands/hidden.ts",
    pattern: /hidden: true,/,
    replace: "hidden: false,",
  },
  {
    name: "cd stops opening doors",
    file: "lib/commands/nav.ts",
    pattern: /if \(door\?\.hidden\) return door\.run/,
    replace: "if (false) return door.run",
  },
  {
    name: "the registry stops sorting, so help follows registration order",
    file: "lib/commands/registry.ts",
    pattern: /\.filter\(\(d\) => !d\.hidden\)\.sort\(byNameAsc\)/,
    replace: ".filter((d) => !d.hidden)",
  },
```

- [ ] **Step 2: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs
```

Expected: every row RED, including the seven new ones, and the working tree clean afterwards (`git status --short` prints only the script). Takes several minutes: about 47 suite runs. If any new row is green, the guard it names is not covered: find which test should have failed, make it fail, and run again. If a row reports a missing anchor, the code in the plan and the code on disk differ; fix the code to match the plan (the anchors are single-line on purpose).

Which test catches which: the reduced-motion rows fail `lib/commands.test.ts` "reduced motion" and `effects.test.ts`; scanlines fails "rejects out-of-range"; theme fails "rejects an unknown phosphor"; the hidden flag and the door fail `dispatch.test.ts` "hidden commands"; the sort fails `registry.test.ts` "sorts by name" and `dispatch.test.ts` "COMMANDS is sorted".

- [ ] **Step 3: Commit**

```bash
cd "$WT"
git status --short
git add scripts/mutation-check.mjs
git commit -m "test(mutation): the registry's guards are mutated too"
```

---

### Task 10: Docs, pull request, deploy, live check

**Files:**
- Modify: `AGENTS.md` (the section "The terminal is a real subsystem")
- Modify: `docs/PROGRESS.md` (a new entry at the top)
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above
- Produces: a merged PR and a live check with its limits stated

- [ ] **Step 1: Rewrite the terminal section of AGENTS.md**

Replace the whole section headed `## The terminal is a real subsystem` (one paragraph today) with:

```markdown
## The terminal is a real subsystem

`lib/commands.ts` stays **pure**, and since 2026-09-03 it is a thin dispatcher over a registry.
Every command is a `defineCommand({ name, aliases, help, hidden, argPool, run })` in one of the
modules under `lib/commands/` (`nav`, `info`, `effects`, `sudo`, `hidden`, and whatever a later
sub-project adds), registered from `lib/commands/index.ts`, where the lines stay alphabetical so
two pull requests rarely collide. `COMMANDS`, `HELP_LINES` and `complete()` are derived from the
registry, so a command is listed by being visible, not by being added to three lists. A
`hidden: true` command is absent from help, completion and `ls`, and is reachable only by name or
through `cd <name>`: that is the door to the arcade, and the `arcade` row in `top` is the one hint.

Commands that change the running site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`,
`sudo rm -rf /`) return an `effect` descriptor, and a program (a game) returns
`{ type: "program", program }`. `Terminal.tsx` is the only place allowed to act on either. Keep it
that way: it is why the whole command surface is unit-testable without a DOM. To add a command,
add a `defineCommand` to the right module (or a new module with its registration line) and a test
beside it. Run `node scripts/mutation-check.mjs` if you touch a guard: the reduced-motion
refusals, the scanlines range, the theme check, the hidden flag and the door are all mutated by it.
```

- [ ] **Step 2: Add the PROGRESS.md entry**

At the top of `docs/PROGRESS.md`, in the file's existing voice:

```markdown
## 2026-09-03: the command registry

F1 of the toolshed programme. `lib/commands.ts` is a dispatcher over `lib/commands/*.ts`, each
command a `defineCommand`, help and completion derived from the registry, and `cd arcade` a hidden
door that prints "arcade: no runtime yet" until G0. `lib/commands.test.ts` passed unchanged, which
was the acceptance test. Seven guards were added to the mutation check and all seven went red.
Not verified: nothing a visitor sees changed except the order of `help`, which is now alphabetical
rather than grouped, and that was checked live by typing it.
```

- [ ] **Step 3: Move the ledger row to `pr`, commit, push, open the PR**

Ledger F1 row: `**pr**` with the PR number once it exists. Log line: `- 2026-09-03: F1 built, every mutation row red (seven added), PR #<n> open.`

```bash
cd "$WT"
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(commands): the registry is the rule now"
git push -u origin toolshed/f1-command-registry
gh pr create --title "feat(commands): the command registry (toolshed f1)" --body "$(cat <<'EOF'
F1 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6).

`lib/commands.ts` becomes a dispatcher over `lib/commands/*.ts`. `COMMANDS`, `HELP_LINES` and `complete()` derive from the registry. `cd arcade` is a hidden door, closed until G0. `top` shows an `arcade` process.

Acceptance: `lib/commands.test.ts` is untouched and green. New tests: registry, each module, dispatch, and a coupling check on `Terminal.tsx`. Mutation check: seven new rows, all red.

Not verified: the live `help` order, until the deploy lands and Task 10 step 5 runs.

Plan: `docs/superpowers/plans/2026-09-03-toolshed-f1-command-registry.md`.
EOF
)"
```

Then fill the PR number into the ledger row and log, and commit that as `docs(programme): f1 pr number`.

- [ ] **Step 4: Wait for CI, merge**

```bash
cd "$WT"
gh pr checks --watch
gh pr merge --merge
```

Expected: `check` and `mutation` both pass before the merge is allowed. Do not pass `--delete-branch`; repository hygiene owns branch removal.

- [ ] **Step 5: Verify the deploy and the live feature**

Read the deployment state from the API, never from `vercel ls`. The ids are the ones the F0 plan recorded (team `larry-pm`, `team_SW7xEyTEz5ftQj3cIxulWxKG`, project `prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx`, token `VERCEL_TOKEN_PERSONAL`):

```bash
SHA=$(git -C "$WT" rev-parse origin/main)
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=3" \
  | python -c "import sys,json; [print(d['uid'], d['state'], d.get('meta',{}).get('githubCommitSha','')[:7], d.get('target')) for d in json.load(sys.stdin)['deployments']]"
echo "$SHA"
```

Expected: the top row is `READY`, `production`, and its short SHA matches `$SHA`. Then, in a real browser against `https://fergusoreilly.dev` (the Playwright MCP or the Chrome MCP; run `~/.claude/scripts/instrument-check.js` first if any probe misbehaves, per `CLAIMS.md`):

1. Click the terminal, type `help`, Enter. Look for: the header line, then an alphabetical list starting `cat`, `cd`, `contact`, and `sudo hire-me      ;)` in sorted position rather than at the foot.
2. Type `arc` and press Tab. Look for: nothing completes.
3. Type `cd arcade`, Enter. Look for: `arcade: no runtime yet`.
4. Type `top`, Enter. Look for: one `arcade` row.
5. Type `gravity` on a machine with reduced motion off. Look for: the page drops. Then `dock`, `eject off`. This proves the effects still reach `Terminal.tsx` through the re-exported types.

- [ ] **Step 6: Record it, with the limits**

Ledger F1 row to `**live**` with the deployment uid. Log line naming what was checked (the five items) and what was not: no phone check (F1 changes no layout), no Docker parity build (no dependency or build config changed; the CI `check` job's `next build` is the build evidence). Commit the ledger straight to `main` as a docs-only change:

```bash
cd /c/Dev/fergus-portfolio
git pull --ff-only
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f1 live"
git push
```

---

## Self-review

**Spec coverage (design section 6, F1).** "`lib/commands.ts` becomes a dispatcher over `lib/commands/*.ts` modules, each exporting `defineCommand(...)`": Tasks 3 to 8. "`COMMANDS`, `HELP_LINES` and `complete()` derive from the registry": Task 8, tested in `dispatch.test.ts`. "A `hidden: true` command is absent from all three": Task 8 test "hidden commands", plus `ls` (absent by construction, asserted anyway). "One new result kind, `program`, which `Terminal` hands to the arcade runtime (G0) and which, until G0 lands, prints 'no runtime' and exits": Task 1 (the type and the Terminal branch, with `tsc` as the reason they share a task), Task 8 (dispatch test with a registered probe). "Done when the existing `commands.test.ts` passes unchanged": Task 8 Step 4 checks the diff is empty. "`top` shows an `arcade` process as the one hint" (from G0's paragraph, pulled forward by the brief): Task 4. Section 8's frozen interfaces: reproduced verbatim and used by name. Section 9's mutation rule: Task 9.

**Placeholder scan.** Every code step has the code. No "TBD", no "similar to Task N" (the `def`/`run` helpers are repeated in each test file on purpose, because a reader may open one file). First draft had a mistyped import in Task 5 Step 3 with a note asking the engineer to correct it; that is a placeholder by another name, so the line is now written correctly and the note is gone.

**Type consistency.** `ok` and `argOf` come from `./shared` everywhere. `helpLines`, `HELP_HEAD`, `HELP_FOOT`, `listCommands`, `findCommand`, `registerCommands`, `defineCommand` are the same names in registry, modules, `lib/commands.ts` and every test. `GRAVITY_DECLINED` and `EJECT_DECLINED` are exported from `effects.ts` and imported by `effects.test.ts` and anchored by the mutation rows. `MODULES` is exported from `index.ts` and read by `index.test.ts`. The `program` result carries `program: ProgramSpec` in `shared.ts`, `dispatch.test.ts` and `Terminal.tsx`. `COMMANDS` is `readonly string[]` and `dispatch.test.ts` spreads it before sorting, which is valid on a readonly array.

**Two things this plan does not do, said plainly.** It does not give `eject` and `dock` an argument pool (parity first; a one-line follow-up). It does not change what a hidden command typed by name does: `arcade` on its own works exactly like `cd arcade`, because `findCommand` includes hidden commands by design, and that is stated in the tests rather than hidden.
