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
  | { kind: "reboot" }
  /** Remove these keys from local storage. `Terminal` re-checks ownership before touching any. */
  | { kind: "forget"; keys: string[] };

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
  /**
   * Every key in the visitor's local storage, read by the Terminal at run time.
   * `forget` filters them down to the ones the site owns; nothing else reads
   * them, and nothing is ever written here.
   */
  storageKeys?: string[];
  /** What the presence provider last said. Absent until it has answered once. */
  presence?: number;
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
