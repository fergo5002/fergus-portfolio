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

export type HelpGroup = "navigate" | "system" | "physical" | "shell" | "more";

export type CommandDef = {
  name: string;
  aliases?: string[];
  /** One pre-formatted line for HELP_LINES, without the indent. Omitted or hidden: not listed. */
  help?: string;
  /** Which section of `help` the line sits under. Defaults to "shell". */
  group?: HelpGroup;
  /** Position within the section, ascending; ties and omissions fall back to name order. */
  rank?: number;
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

/** The two lines that describe the shell itself. They sit under "shell" and are not commands. */
export const HELP_FOOT: string[] = [
  "    history · echo · date · pwd · clear · help",
  "    tab completes · up/down recalls · ctrl+L clears",
];

/**
 * The sections of `help`, in the order they print. The titles and the order
 * are the ones the site has always had; the registry only decides which
 * commands sit under each. A section with nothing in it is skipped, except
 * "shell", whose two lines are static.
 */
export const HELP_GROUPS: { id: HelpGroup; title: string }[] = [
  { id: "navigate", title: "navigate" },
  { id: "system", title: "system" },
  { id: "physical", title: "physical" },
  { id: "shell", title: "shell" },
  { id: "more", title: "and one more thing" },
];

const byRankThenName = (a: CommandDef, b: CommandDef): number => {
  const ra = a.rank ?? Number.POSITIVE_INFINITY;
  const rb = b.rank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra < rb ? -1 : 1;
  return byNameAsc(a, b);
};

/**
 * The `help` text, from a list of definitions. `help` the command and
 * `HELP_LINES` the export both call this on `listCommands()`, so they cannot
 * disagree. Pure over its argument, and independent of registration order:
 * sections print in `HELP_GROUPS` order and commands by rank, then name.
 */
export function helpLines(defs: CommandDef[]): string[] {
  const listed = defs.filter((d) => !d.hidden && d.help);
  const sections: string[][] = [];
  for (const group of HELP_GROUPS) {
    const own = listed
      .filter((d) => (d.group ?? "shell") === group.id)
      .sort(byRankThenName)
      .map((d) => `    ${d.help}`);
    const lines = group.id === "shell" ? [...own, ...HELP_FOOT] : own;
    if (lines.length === 0) continue;
    sections.push([`  ${group.title}`, ...lines]);
  }
  const body = sections.flatMap((section, i) => (i === 0 ? section : ["", ...section]));
  return [...HELP_HEAD, ...body];
}
