import type { Theme } from "@/lib/system";
import type { ProgramSpec } from "@/lib/arcade/program";
import type { ArcadeSession } from "@/lib/arcade/session";

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
  /** Put the terminal away: minimise the window, or say why the inline one stays. */
  | { kind: "exit" }
  /** Remove these keys from local storage. `Terminal` re-checks ownership before touching any. */
  | { kind: "forget"; keys: string[] };

export type CommandResult =
  | { type: "output"; lines: string[] }
  /**
   * Go somewhere. An internal path is a client navigation; an `https:` link
   * (`open github`) opens in a new tab and the terminal stays where it is.
   */
  | { type: "navigate"; href: string; lines?: string[] }
  | { type: "clear" }
  | { type: "effect"; effect: SystemEffect; lines: string[] }
  /**
   * A program for the terminal to host: a game, or the arcade's own cabinet.
   * The runtime is `lib/arcade/` and `components/arcade/ArcadeScreen.tsx`, and
   * `Terminal` is the only thing allowed to mount it.
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
   *
   * A function rather than an array, so the storage is enumerated only by the
   * one command that wants it. As a value it was read on every command, which
   * meant `help` touched the visitor's storage for nothing.
   */
  storageKeys?: () => string[];
  /** What the presence provider last said. Absent until it has answered once. */
  presence?: number;
  /**
   * How many characters fit on one line of the terminal that is asking, as
   * measured by that terminal. `help` lays itself out in one column when
   * there are fewer than sixty. Absent means wide.
   */
  cols?: number;
  /**
   * What the arcade knows this session: whether the door has been opened, and
   * the last board snapshot the client fetched. Supplied by the Terminal, and
   * read only by `neofetch`, which prints the boards to somebody who has been
   * through the door and nothing at all to anyone else.
   */
  arcade?: ArcadeSession;
  /** The route the visitor is on, for the prompt, `pwd`, `cd ..` and `status`. */
  path?: string;
  /** What the machine is doing, for `status` and the bare toggles (`sound`). */
  fps?: number;
  audio?: boolean;
  crt?: boolean;
  scanlines?: number;
  gravity?: boolean;
  ejected?: boolean;
};

/**
 * Sections reachable from the terminal, and where each one lives. `skills`
 * went with the home page's skills block; `tools` and `contact` became pages.
 * `mcp` is reachable but not listed, like it is in the top bar.
 */
export const SECTION_PATHS = {
  about: "/#about",
  experience: "/experience",
  projects: "/projects",
  writing: "/writing",
  tools: "/tools",
  contact: "/contact",
} as const;

export const SECTIONS = Object.keys(SECTION_PATHS) as (keyof typeof SECTION_PATHS)[];

/** Routes `cd` reaches that `ls` does not list. */
export const UNLISTED_PATHS: Record<string, string> = {
  mcp: "/mcp",
  blog: "/writing",
  posts: "/writing",
  home: "/",
};

/** The prompt's idea of where you are: `~` for home, `~/projects` and so on. */
export function promptPath(path: string | undefined): string {
  if (!path || path === "/") return "~";
  return `~${path.replace(/\/+$/, "")}`;
}

export const ok = (lines: string[]): CommandResult => ({ type: "output", lines });

/**
 * The argument as the old switch saw it: everything after the command word,
 * joined with single spaces, lowercased. Commands that need the original case
 * (`echo`, `cat`'s error line) read `args` directly.
 */
export const argOf = (args: string[]): string => args.join(" ").toLowerCase();

/**
 * Two columns that survive a narrow terminal. Laid out side by side when the
 * widest row fits in `cols`; otherwise each row stacks, the key on its own line
 * and the value indented under it, so a phone never wraps a padded row into
 * the next one's column (2026-11-25: `resume` on a 390px phone read as a heap).
 */
export function columns(rows: [string, string][], cols = 80, indent = 2): string[] {
  if (rows.length === 0) return [];
  const pad = " ".repeat(indent);
  const keyWidth = Math.max(...rows.map(([k]) => k.length)) + 2;
  const widest = Math.max(...rows.map(([, v]) => v.length));
  if (indent + keyWidth + widest <= cols) return rows.map(([k, v]) => `${pad}${k.padEnd(keyWidth)}${v}`.trimEnd());
  return rows.flatMap(([k, v]) => [`${pad}${k}`, `${pad}    ${v}`]);
}

/** Words laid out like `ls`: as many to a line as fit in `cols`. */
export function flow(words: string[], cols = 80, gap = 3): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line}${" ".repeat(gap)}${word}` : word;
    if (line && next.length > cols) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
