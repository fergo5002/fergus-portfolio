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
  centre(grid, middle + 2, [0, 1, 2].map((i) => (i === state.cursor ? "^" : " ")).join(" "));
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
