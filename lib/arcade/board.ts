import { arcadeCopy, BLOCKED_INITIALS } from "@/content/arcade";

/**
 * The board: three characters and a number, and every rule about both.
 *
 * Anonymous by construction, which is what the constitution in AGENTS.md
 * requires of anything the site keeps on a server. There is no name, no
 * address, no identifier and nothing to join on. F4's budget hashes the
 * visitor's address with a daily salt and this never sees it.
 *
 * The initials rule, in full:
 *
 *  1. uppercase and drop anything outside `INITIALS_ALPHABET`;
 *  2. require exactly three characters left. Truncating "fergus" to "FER" is
 *     the site deciding somebody's initials for them, which is worse than
 *     refusing with a sentence;
 *  3. fold the digits that stand in for letters, so 4SS is ASS;
 *  4. refuse by **exact match** against `BLOCKED_INITIALS`, never substring. On
 *     a three-character string a substring rule is an exact rule with a wider
 *     false-positive surface and nothing to show for it;
 *  5. store the **unfolded** form, so a visitor who typed F0R sees F0R.
 *
 * The blocklist lives in `content/arcade.ts` and is reviewed like copy, because
 * that is what it is.
 */

export const INITIALS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const INITIALS_LENGTH = 3;
export const BOARD_SIZE = 20;

export type BoardRow = { initials: string; score: number };
export type Board = { game: string; rows: BoardRow[] };
export type BoardSnapshot = { available: boolean; boards: Board[]; note?: string };
export type InitialsCheck = { ok: true; initials: string } | { ok: false; reason: string };

const LEET: Record<string, string> = {
  "0": "O",
  "1": "I",
  "3": "E",
  "4": "A",
  "5": "S",
  "7": "T",
  "8": "B",
};

export function normaliseInitials(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => INITIALS_ALPHABET.includes(c)).join("");
}

export function foldLeet(initials: string): string {
  return [...initials].map((c) => LEET[c] ?? c).join("");
}

export function checkInitials(raw: string): InitialsCheck {
  const cleaned = normaliseInitials(raw);
  if (cleaned.length !== INITIALS_LENGTH) return { ok: false, reason: arcadeCopy.initials.shape };
  const folded = foldLeet(cleaned);
  if (BLOCKED_INITIALS.has(folded)) return { ok: false, reason: arcadeCopy.initials.blocked };
  return { ok: true, initials: cleaned };
}

/**
 * The new row folded into the board. `sort` is stable in every runtime this
 * ships to, so on a tie whoever got there first keeps the higher rank.
 */
export function insertScore(rows: readonly BoardRow[], row: BoardRow, size = BOARD_SIZE): BoardRow[] {
  return [...rows, row].sort((a, b) => b.score - a.score).slice(0, size);
}

/** Thousands separators without asking the platform, which does not always agree with itself. */
export function groupDigits(n: number): string {
  const whole = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const digits = String(whole);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

/** Rank, initials, right-aligned score. Two spaces between each, nine columns of prefix. */
export function formatBoard(board: Board, width: number, title: string): string[] {
  if (board.rows.length === 0) return [title, `  ${arcadeCopy.board.empty}`];
  const scoreWidth = Math.max(3, width - 9);
  return [
    title,
    ...board.rows.map((row, i) => {
      const rank = String(i + 1).padStart(2);
      return `${rank}  ${row.initials}  ${groupDigits(row.score).padStart(scoreWidth)}`;
    }),
  ];
}

/**
 * Every board with anything on it. A snapshot that is missing, or that says it
 * is unavailable, prints the sentence instead: never a blank space where a
 * board should be, per the rule that nothing on this site fails silently.
 */
export function formatBoards(
  snapshot: BoardSnapshot | null,
  width: number,
  titles: Record<string, string>,
): string[] {
  if (!snapshot || !snapshot.available) return [...arcadeCopy.board.unavailable];
  const withScores = snapshot.boards.filter((b) => b.rows.length > 0);
  if (withScores.length === 0) return [arcadeCopy.board.empty];
  return withScores.flatMap((board, i) => {
    const block = formatBoard(board, width, titles[board.game] ?? board.game);
    return i === 0 ? block : ["", ...block];
  });
}
