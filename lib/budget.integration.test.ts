import { afterAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";

/**
 * The proof the design asks for: a budget of three exhausted on the fourth
 * call, from two different function instances, against the real Upstash
 * database. Two module instances (`vi.resetModules()` between imports) stand
 * in for two functions: they share nothing in memory, so if either one were
 * quietly counting in its own `Map` the second instance would see a fresh
 * count and the fourth call would be allowed, and this test would fail.
 *
 * Skipped when no Redis pair is present, which is every CI run (the
 * repository is public and fork pull requests never see secrets) and the
 * parity image's build-time `npm test`. Run it on purpose:
 *
 *     set -a; . ./.env.local; set +a; npx vitest run lib/budget.integration.test.ts
 *
 * Spends about twenty commands on the meter per run. Keys are named after a
 * throwaway tool and deleted in `afterAll`.
 */

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const configured = Boolean(url && token);
const tool = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!configured)("takeBudget against the real Upstash database", () => {
  afterAll(async () => {
    if (!configured) return;
    const redis = new Redis({ url: url as string, token: token as string });
    await redis.del(`budget:${tool}:ip:one`, `budget:${tool}:ip:two`);
  });

  it("refuses the fourth call of a limit of three", async () => {
    const { takeBudget } = await import("./budget");
    const req = { tool, scope: "ip" as const, key: "one", limit: 3, windowSec: 120 };
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 2 });
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 1 });
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 0 });
    const fourth = await takeBudget(req);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterSec).toBeGreaterThan(0);
      expect(fourth.retryAfterSec).toBeLessThanOrEqual(120);
      expect(fourth.reason).toMatch(/^This address has used its 3 runs for these 120 seconds; the counter resets in /);
    }
  });

  it("shares the count between two module instances, as two function instances would", async () => {
    const req = { tool, scope: "ip" as const, key: "two", limit: 3, windowSec: 120 };
    const a = await import("./budget");
    vi.resetModules();
    const b = await import("./budget");
    expect(b).not.toBe(a);

    expect((await a.takeBudget(req)).ok).toBe(true);
    expect((await b.takeBudget(req)).ok).toBe(true);
    expect((await a.takeBudget(req)).ok).toBe(true);
    const fourth = await b.takeBudget(req);
    expect(fourth.ok).toBe(false);
  });
});
