import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { checkInitials, insertScore, type Board, type BoardSnapshot } from "./board";
import { GAME_IDS, type GameId } from "./engine";

/** One bounded document, optimistic concurrency, no identity or address storage. */
export const DAY_LIMIT = 40;
export const MONTH_LIMIT = 600;
const MAX_SCORE = 10_000_000;
type Receipt = { id: string; at: number; entry: string };
export type Ledger = { version: 2; day: string; month: string; dayCount: number; monthCount: number; boards: Record<string, Board>; receipts: Receipt[] };
export type BoardRepository = {
  read(): Promise<{ ledger: Ledger | null; version: string | null }>;
  /** false means another writer won; caller must read again. */
  write(ledger: Ledger, expectedVersion: string | null): Promise<boolean>;
};
export class ScoreError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const date = (at: number) => new Date(at).toISOString().slice(0, 10);
export function emptyLedger(at = Date.now()): Ledger { return { version: 2, day: date(at), month: date(at).slice(0, 7), dayCount: 0, monthCount: 0, boards: {}, receipts: [] }; }
function key(game: string, scope: string, day: string) { return `${scope}:${game}${game === "under" ? `:${day}` : ""}`; }
function signature(body: string, secret: string) { return createHmac("sha256", secret).update(`fergusos-arcade-v2:${body}`).digest("base64url"); }
export function issueTicket(game: string, scope: string, secret: string, now = Date.now()) {
  if (!GAME_IDS.includes(game as GameId)) throw new ScoreError("That cabinet does not exist.");
  const body = Buffer.from(JSON.stringify({ game, scope, at: now, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}
export function verifyTicket(ticket: unknown, game: string, scope: string, secret: string, now = Date.now()): { game: GameId; at: number; nonce: string } {
  if (typeof ticket !== "string" || ticket.length > 600) throw new ScoreError("Start a new run before posting a score.");
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra || !/^[A-Za-z0-9_-]{43}$/.test(sig)) throw new ScoreError("The run receipt is invalid.");
  const expected = signature(body, secret);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new ScoreError("The run receipt is invalid.");
  let claim;
  try { claim = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { throw new ScoreError("The run receipt is invalid."); }
  if (claim.game !== game || claim.scope !== scope || !Number.isSafeInteger(claim.at) || typeof claim.nonce !== "string" || !/^[a-f0-9]{32}$/.test(claim.nonce)) throw new ScoreError("The receipt belongs to another run.");
  if (now - claim.at < 8000) throw new ScoreError("Play for at least eight seconds before posting.");
  if (now - claim.at > 7_200_000) throw new ScoreError("This run expired. Start a new run.");
  if (game === "under" && date(now) !== date(claim.at)) throw new ScoreError("A new daily dungeon has started. Play again.");
  return claim;
}
export function boardSnapshot(ledger: Ledger | null, scope: string, now = Date.now()): BoardSnapshot {
  return { available: true, boards: GAME_IDS.map(game => ledger?.boards[key(game, scope, date(now))] ?? { game, rows: [] }) };
}
export async function recordScore(repo: BoardRepository, raw: unknown, scope: string, secret: string, now = Date.now()): Promise<Board> {
  if (!raw || typeof raw !== "object") throw new ScoreError("The score is invalid.");
  const e = raw as { game?: unknown; score?: unknown; initials?: unknown; ticket?: unknown };
  if (typeof e.game !== "string" || !GAME_IDS.includes(e.game as GameId)) throw new ScoreError("That cabinet does not exist.");
  if (typeof e.score !== "number" || !Number.isSafeInteger(e.score) || e.score <= 0 || e.score > MAX_SCORE) throw new ScoreError("The score is invalid.");
  if (typeof e.initials !== "string" || e.initials.length > 12) throw new ScoreError("Use three letters or digits.");
  const check = checkInitials(e.initials); if (!check.ok) throw new ScoreError(check.reason);
  verifyTicket(e.ticket, e.game, scope, secret, now);
  const id = createHash("sha256").update(e.ticket as string).digest("hex");
  const entry = `${scope}:${e.game}:${check.initials}:${e.score}`, day = date(now), boardKey = key(e.game, scope, day);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repo.read(), ledger = current.ledger ?? emptyLedger(now);
    const receipt = ledger.receipts.find(r => r.id === id);
    if (receipt) {
      if (receipt.entry !== entry) throw new ScoreError("This run has already posted a different score.");
      return ledger.boards[boardKey] ?? { game: e.game, rows: [] };
    }
    if (ledger.day !== day) { ledger.day = day; ledger.dayCount = 0; }
    if (ledger.month !== day.slice(0, 7)) { ledger.month = day.slice(0, 7); ledger.monthCount = 0; }
    if (ledger.dayCount >= DAY_LIMIT || ledger.monthCount >= MONTH_LIMIT) throw new ScoreError("The board's free-tier posting budget is full. Try later.", 429);
    const existing = ledger.boards[boardKey]?.rows ?? [];
    // A daily dungeon retains one best entry for each chosen set of initials.
    const rows = e.game === "under" ? existing.filter(row => row.initials !== check.initials) : existing;
    const previous = e.game === "under" ? existing.find(row => row.initials === check.initials)?.score ?? 0 : 0;
    const board = { game: e.game, rows: insertScore(rows, { initials: check.initials, score: Math.max(previous, e.score) }) };
    ledger.boards[boardKey] = board;
    for (const k of Object.keys(ledger.boards)) if (k.includes(":under:") && !k.endsWith(day)) delete ledger.boards[k];
    ledger.dayCount++; ledger.monthCount++;
    ledger.receipts = [...ledger.receipts.filter(r => now - r.at <= 7_200_000), { id, at: now, entry }];
    if (await repo.write(ledger, current.version)) return board;
  }
  throw new ScoreError("The board is busy. Your score is here; try posting again.", 503);
}
