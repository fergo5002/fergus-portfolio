import { describe, expect, it } from "vitest";
import { emptyLedger, issueTicket, verifyTicket, recordScore, ScoreError, type BoardRepository, type Ledger } from "./score-service";

const now = Date.UTC(2026, 8, 5, 12), secret = "a-unit-test-secret-never-used-in-production";
function repository() {
  let doc: Ledger | null = null, version = 0;
  const repo: BoardRepository = {
    read: async () => ({ ledger: doc ? structuredClone(doc) : null, version: String(version) }),
    write: async (next, expected) => { if (expected !== String(version)) return false; doc = structuredClone(next); version++; return true; },
  };
  return { repo, get: () => doc, count: () => version };
}
describe("run receipts", () => {
  it("binds a run to the game, namespace and a finite lifetime", () => {
    const ticket = issueTicket("pong", "test", secret, now);
    expect(verifyTicket(ticket, "pong", "test", secret, now + 10000).game).toBe("pong");
    for (const [game, scope, time] of [["snake", "test", now + 10000], ["pong", "production", now + 10000], ["pong", "test", now + 1], ["pong", "test", now + 7_200_001]] as const) expect(() => verifyTicket(ticket, game, scope, secret, time)).toThrow(ScoreError);
    expect(() => verifyTicket(ticket + "x", "pong", "test", secret, now + 10000)).toThrow(ScoreError);
    const [body, sig] = ticket.split(".");
    const tampered = `${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    expect(() => verifyTicket(tampered, "pong", "test", secret, now + 10000)).toThrow(ScoreError);
  });
});
describe("persistent score writes", () => {
  it("keeps both concurrent scores and makes retry idempotent", async () => {
    const r = repository();
    const a = { game: "pong", initials: "AAA", score: 120, ticket: issueTicket("pong", "test", secret, now) };
    const b = { game: "pong", initials: "BBB", score: 160, ticket: issueTicket("pong", "test", secret, now) };
    await Promise.all([recordScore(r.repo, a, "test", secret, now + 10000), recordScore(r.repo, b, "test", secret, now + 10000)]);
    const retry = await recordScore(r.repo, a, "test", secret, now + 10000);
    expect(retry.rows.map(r => r.score)).toEqual([160, 120]); expect(r.count()).toBe(2);
  });
  it("rejects unknown games, bad initials, invalid scores and altered retries", async () => {
    const r = repository(), ticket = issueTicket("pong", "test", secret, now);
    for (const score of [-1, NaN, Infinity, 1.5, 10_000_001]) await expect(recordScore(r.repo, { game: "pong", initials: "AAA", score, ticket }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
    await expect(recordScore(r.repo, { game: "pong", initials: "4SS", score: 12, ticket }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
    const entry = { game: "pong", initials: "AAA", score: 120, ticket };
    await recordScore(r.repo, entry, "test", secret, now + 10000);
    await expect(recordScore(r.repo, { ...entry, score: 999 }, "test", secret, now + 10000)).rejects.toThrow(ScoreError);
  });
  it("caps global writes before storing", async () => {
    const r = repository(), ledger = emptyLedger(now); ledger.dayCount = 40;
    await r.repo.write(ledger, "0");
    await expect(recordScore(r.repo, { game: "pong", initials: "AAA", score: 1, ticket: issueTicket("pong", "test", secret, now) }, "test", secret, now + 10000)).rejects.toMatchObject({ status: 429 });
    expect(r.count()).toBe(1);
  });
  it("keeps the best daily score per initials and starts a fresh UTC dungeon board", async () => {
    const r = repository();
    for (const score of [600, 300]) await recordScore(r.repo, { game: "under", initials: "AAA", score, ticket: issueTicket("under", "test", secret, now) }, "test", secret, now + 10000);
    expect(r.get()?.boards["test:under:2026-09-05"].rows).toEqual([{ initials: "AAA", score: 600 }]);
    const tomorrow = now + 86400000;
    await recordScore(r.repo, { game: "under", initials: "BBB", score: 100, ticket: issueTicket("under", "test", secret, tomorrow) }, "test", secret, tomorrow + 10000);
    expect(r.get()?.boards["test:under:2026-09-05"]).toBeUndefined();
    expect(r.get()?.boards["test:under:2026-09-06"].rows).toEqual([{ initials: "BBB", score: 100 }]);
    expect(r.get()?.dayCount).toBe(1);
  });
});
