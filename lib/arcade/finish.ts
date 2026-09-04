import { arcadeCopy } from "@/content/arcade";
import { groupDigits } from "./board";

/**
 * What happens when a program exits, decided here rather than in React.
 *
 * `ArcadeScreen`'s docblock claims every decision it could have made lives in
 * `lib/arcade/`. This is the one that did not: a five-clause predicate about
 * whether a score reaches the board, guarded only by a grep for the name of the
 * function it calls. A grep cannot tell `> 0` from `>= 0`, so the predicate is
 * a pure function with a table of cases behind it and the component keeps the
 * wiring.
 *
 * The second half matters more than it looks. A score that cannot be posted
 * used to fall through to the same "back to the prompt" line Escape prints, so
 * a visitor who cashed in forty bounces was told nothing at all. With F4
 * unmerged that is every score, and it is exactly the failure `/contact` had a
 * rule written about. Now it says what the score was and why it went nowhere.
 */

export type FinishInput = {
  /** A score has already been posted this session, so do not ask again. */
  posted: boolean;
  /** Whether this game has a board at all. */
  board: boolean;
  score?: number;
  /** Whether the last board snapshot said the server could take a score. */
  available: boolean;
  /** A program's own parting line, if it gave one. */
  label?: string;
};

export type FinishOutcome =
  | { kind: "initials"; score: number }
  | { kind: "leave"; lines: string[] };

/** The board route applies the same ceiling again. Internal games are not a trust boundary. */
export const MAX_PROGRAM_SCORE = 10_000_000;

export function isProgramScore(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score) && score > 0 && score <= MAX_PROGRAM_SCORE;
}

export function finishOutcome(input: FinishInput): FinishOutcome {
  const hasScore = input.board && isProgramScore(input.score);
  if (!input.posted && hasScore && input.available) {
    return { kind: "initials", score: input.score as number };
  }
  if (!input.posted && hasScore) {
    // The board cannot take it. Say the number out loud and say why, rather
    // than printing the same line a plain Escape prints.
    return {
      kind: "leave",
      lines: [
        `${arcadeCopy.board.scoreLabel}: ${groupDigits(input.score as number)}`,
        ...arcadeCopy.board.unavailable,
      ],
    };
  }
  return { kind: "leave", lines: [input.label ?? arcadeCopy.left] };
}
