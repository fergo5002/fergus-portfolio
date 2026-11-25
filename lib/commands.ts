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

/**
 * Every completion still open for what has been typed, when there is more than
 * one. A real shell lists them on a second Tab; here the Terminal shows them
 * under the prompt as you type, because Tab with nothing to add has to move
 * focus on (the keyboard-trap rule in `components/Terminal.tsx`). Empty when
 * there is nothing to choose between.
 */
export function candidates(input: string): string[] {
  const hasTrailingSpace = /\s$/.test(input);
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  let hits: string[];
  if (parts.length === 1 && !hasTrailingSpace) {
    const prefix = parts[0].toLowerCase();
    hits = COMMANDS.filter((c) => c.startsWith(prefix));
  } else {
    const def = findCommand(parts[0].toLowerCase());
    if (!def || def.hidden || !def.argPool || (parts.length > 2 || (parts.length === 2 && hasTrailingSpace))) return [];
    const pool = typeof def.argPool === "function" ? def.argPool({}) : def.argPool;
    const argPrefix = hasTrailingSpace ? "" : (parts[1]?.toLowerCase() ?? "");
    hits = pool.filter((p) => p.startsWith(argPrefix));
  }
  return hits.length > 1 ? hits : [];
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
