import { describe, expect, it } from "vitest";
import { boardSnapshot, emptyLedger, issueTicket, verifyTicket, recordScore, ScoreError, type BoardRepository, type Ledger } from "./score-service";

const now = Date.UTC(2026, 8, 5, 12), secret = "a-unit-test-secret-never-used-in-production";
function repository(initial: Ledger | null = null) {
  let doc: Ledger | null = initial ? structuredClone(initial) : null, version = 0;
  const repo: BoardRepository = {
    read: async () => ({ ledger: doc ? structuredClone(doc) : null, version: String(version) }),
    write: async (next, expected) => { if (expected !== String(version)) return false; doc = structuredClone(next); version++; return true; },
  };
  return { repo, get: () => doc, count: () => version };
}
describe("run receipts", () => {
  it("binds a run to the game, namespace and a finite lifetime", () => {
    const ticket = issueTicket("poker", "test", secret, now);
    expect(verifyTicket(ticket, "poker", "test", secret, now + 10000).game).toBe("poker");
    for (const [game, scope, time] of [["signal", "test", now + 10000], ["poker", "production", now + 10000], ["poker", "test", now + 1], ["poker", "test", now + 7_200_001]] as const) expect(() => verifyTicket(ticket, game, scope, secret, time)).toThrow(ScoreError);
    expect(() => verifyTicket(ticket + "x", "poker", "test", secret, now + 10000)).toThrow(ScoreError);
    const [body, sig] = ticket.split(".");
    const tampered = `${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    expect(() => verifyTicket(tampered, "poker", "test", secret, now + 10000)).toThrow(ScoreError);
  });
});
describe("persistent score writes", () => {
  it("keeps both concurrent scores and makes retry idempotent", async () => {
    const r = repository();
    const a = { game: "poker", initials: "AAA", score: 120, ticket: issueTicket("poker", "test", secret, now) };
    const b = { game: "poker", initials: "BBB", score: 160, ticket: issueTicket("poker", "test", secret, now) };
    await Promise.all([recordScore(r.repo, a, "test", secret, now + 10000), recordScore(r.repo, b, "test", secret, now + 10000)]);
    const retry = await recordScore(r.repo, a, "test", secret, now + 10000);
    expect(retry.rows.map(r => r.score)).toEqual([160, 120]); expect(r.count()).toBe(2);
  });
  it("rejects unknown games, bad initials, invalid scores and altered retries", async () => {
    const r = repository(), ticket = issueTicket("poker", "test", secret, now);
    for (const score of [-1, NaN, Infinity, 1.5, 10_000_001]) await expect(recordScore(r.repo, { game: "poker", initials: "AAA", score, ticket }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
    await expect(recordScore(r.repo, { game: "poker", initials: "4SS", score: 12, ticket }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
    const entry = { game: "poker", initials: "AAA", score: 120, ticket };
    await recordScore(r.repo, entry, "test", secret, now + 10000);
    await expect(recordScore(r.repo, { ...entry, score: 999 }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
  });
  it("caps global writes before storing", async () => {
    const r = repository(), ledger = emptyLedger(now); ledger.dayCount = 40;
    await r.repo.write(ledger, "0");
    await expect(recordScore(r.repo, { game: "poker", initials: "AAA", score: 1, ticket: issueTicket("poker", "test", secret, now) }, "test", secret, now + 10000)).rejects.toMatchObject({ status: 429 });
    expect(r.count()).toBe(1);
  });
  it("keeps one all-time board per cabinet, with no daily board left for anybody", async () => {
    const r = repository();
    for (const score of [600, 300]) await recordScore(r.repo, { game: "signal", initials: "AAA", score, ticket: issueTicket("signal", "test", secret, now) }, "test", secret, now + 10000);
    const tomorrow = now + 86400000;
    await recordScore(r.repo, { game: "signal", initials: "BBB", score: 100, ticket: issueTicket("signal", "test", secret, tomorrow) }, "test", secret, tomorrow + 10000);
    expect(Object.keys(r.get()?.boards ?? {})).toEqual(["test:signal"]);
    expect(r.get()?.boards["test:signal"].rows).toEqual([{ initials: "AAA", score: 600 }, { initials: "AAA", score: 300 }, { initials: "BBB", score: 100 }]);
  });
});

/**
 * Four cabinets were retired on 2026-09-27. Their rows stay in the stored
 * ledger, untouched, because deleting somebody's score is not a side effect a
 * cleanup gets to have. What changes is that nothing new is accepted for them
 * and nothing lists them.
 */
describe("retired cabinets", () => {
  const retired = ["bounce", "pong", "snake", "under"] as const;

  it("will not issue a run receipt for a retired cabinet", () => {
    for (const game of retired) expect(() => issueTicket(game, "test", secret, now), game).toThrow("That cabinet does not exist.");
  });

  it("will not take a score for a retired cabinet, whatever receipt comes with it", async () => {
    const r = repository();
    for (const game of retired) {
      const body = Buffer.from(JSON.stringify({ game, scope: "test", at: now, nonce: "a".repeat(32) })).toString("base64url");
      const forged = `${body}.${"A".repeat(43)}`;
      await expect(recordScore(r.repo, { game, initials: "AAA", score: 10, ticket: forged }, "test", secret, now + 10000), game).rejects.toThrow("That cabinet does not exist.");
    }
    expect(r.count()).toBe(0);
  });

  it("leaves a retired board's stored rows alone when a live cabinet posts", async () => {
    const ledger = emptyLedger(now);
    ledger.boards["production:pong"] = { game: "pong", rows: [{ initials: "OLD", score: 4200 }] };
    ledger.boards["production:under:2026-09-04"] = { game: "under", rows: [{ initials: "DIG", score: 900 }] };
    const r = repository(ledger);
    await recordScore(r.repo, { game: "poker", initials: "NEW", score: 110, ticket: issueTicket("poker", "production", secret, now) }, "production", secret, now + 10000);
    expect(r.get()?.boards["production:pong"]).toEqual({ game: "pong", rows: [{ initials: "OLD", score: 4200 }] });
    expect(r.get()?.boards["production:under:2026-09-04"]).toEqual({ game: "under", rows: [{ initials: "DIG", score: 900 }] });
    expect(r.get()?.boards["production:poker"].rows).toEqual([{ initials: "NEW", score: 110 }]);
  });

  it("does not list a retired board, and an old row cannot break the read", () => {
    const ledger = emptyLedger(now);
    ledger.boards["production:pong"] = { game: "pong", rows: [{ initials: "OLD", score: 4200 }] };
    ledger.boards["production:snake"] = { game: "snake", rows: [{ initials: "BAD", score: Number.NaN }] };
    const snapshot = boardSnapshot(ledger, "production");
    expect(snapshot.available).toBe(true);
    expect(snapshot.boards.map((b) => b.game)).toEqual(["signal", "poker", "panic"]);
  });
});
