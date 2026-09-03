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
