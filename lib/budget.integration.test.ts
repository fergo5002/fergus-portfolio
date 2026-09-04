import { afterAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";

/**
 * Proves that separate module instances share one real Upstash budget.
 * CI skips this because public-repository checks do not receive store secrets.
 * Run it deliberately with the Redis variables from `.env.example` loaded.
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
    }
  });

  it("shares the count between two module instances", async () => {
    const req = { tool, scope: "ip" as const, key: "two", limit: 3, windowSec: 120 };
    const a = await import("./budget");
    vi.resetModules();
    const b = await import("./budget");
    expect(b).not.toBe(a);
    expect((await a.takeBudget(req)).ok).toBe(true);
    expect((await b.takeBudget(req)).ok).toBe(true);
    expect((await a.takeBudget(req)).ok).toBe(true);
    expect((await b.takeBudget(req)).ok).toBe(false);
  });
});
