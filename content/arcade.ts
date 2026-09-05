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
  bounce: "breakpoint",
  pong: "phosphor pong",
  snake: "ouroboros",
  under: "under the terminal",
  poker: "circuit poker",
  signal: "dead signal",
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
    /** 31 columns. The longer version this started as ran to 36 and would have been clipped. */
    footer: "up down . enter play . esc quit",
    notReady: "not built yet",
    boardsHeading: "high scores",
  },

  board: {
    /** Two lines because one that said all of it was 41 columns wide. */
    unavailable: ["boards are unavailable.", "the games still play."],
    empty: "no scores yet. be first.",
    /** Printed to the scrollback beside a score the board could not take. */
    scoreLabel: "score",
    /** Printed by neofetch, above the board block, once the door has been found. */
    neofetchHeading: "Arcade",
  },

  bounce: {
    score: "bounces",
    footer: "arrows steer . space flips",
  },

  initials: {
    heading: "three characters for the board",
    /** 27 columns. Naming all four arrows separately ran to 43 and did not fit. */
    footer: "arrows choose . enter posts",
    /** Shown in place, never sent. */
    blocked: "pick another three.",
    /** 24 columns. Spelling out "letters or digits" as a sentence ran to 36. */
    shape: "three letters or digits.",
    /** While the request is in flight. Nothing claims success before the server does. */
    posting: "posting...",
    /** The scrollback line after a successful submit. */
    saved: "arcade: score posted.",
    /** The scrollback line when the board would not take it. */
    refused: "arcade: score not posted.",
  },
} as const;
