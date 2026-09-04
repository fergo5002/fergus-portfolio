import { BOARD_SIZE, INITIALS_LENGTH } from "./board";
import type { Board, BoardRow } from "./board";

/**
 * The board's shape in Redis, over an **injected** client.
 *
 * Nothing here imports `lib/store/redis.ts`. That is not tidiness: F4 is
 * unmerged and Upstash is not provisioned, so a static import would stop this
 * whole sub-project compiling. `BoardRedis` is structural, so a hand-written
 * fake satisfies it in tests and the real Upstash client satisfies it in
 * `app/api/board/route.ts`, which is the only file that knows the store exists.
 *
 * One sorted set per game, member `<initials>#<nonce>`, score the score. The
 * nonce is there because two people may both be FOR and a sorted set holds one
 * of each member. `#` is safe as the separator because it is not in
 * `INITIALS_ALPHABET` and never can be.
 *
 * Five games times twenty rows is a hundred members, which is nothing against
 * a 256 MB free tier. The cost that matters is commands, so a read is one call
 * per game and a write is two.
 */

export type BoardRedis = {
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>;
  zrange(
    key: string,
    start: number,
    stop: number,
    opts: { rev: true; withScores: true },
  ): Promise<(string | number)[]>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
};

export function boardKey(game: string): string {
  return `arcade:board:${game}`;
}

/** Upstash returns member, score, member, score. A row it cannot read is dropped, never guessed at. */
export function parseZrange(flat: readonly (string | number)[]): BoardRow[] {
  const rows: BoardRow[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const initials = String(flat[i]).split("#")[0];
    const score = Number(flat[i + 1]);
    if (initials.length !== INITIALS_LENGTH) continue;
    if (!Number.isFinite(score)) continue;
    rows.push({ initials, score });
  }
  return rows;
}

export async function readBoards(redis: BoardRedis, games: readonly string[]): Promise<Board[]> {
  const boards: Board[] = [];
  for (const game of games) {
    const flat = await redis.zrange(boardKey(game), 0, BOARD_SIZE - 1, { rev: true, withScores: true });
    boards.push({ game, rows: parseZrange(flat) });
  }
  return boards;
}

/**
 * Add, then trim. Rank 0 is the lowest score in a sorted set, so removing
 * ranks 0 to -(BOARD_SIZE + 1) keeps exactly the top twenty and bounds the key
 * whatever anyone does to it.
 */
export async function writeScore(
  redis: BoardRedis,
  game: string,
  initials: string,
  score: number,
  nonce: string,
): Promise<void> {
  const key = boardKey(game);
  await redis.zadd(key, { score, member: `${initials}#${nonce}` });
  await redis.zremrangebyrank(key, 0, -(BOARD_SIZE + 1));
}
