import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "./store/errors";

const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock("./store/redis", () => ({ getRedis: getRedisMock }));

import {
  MAX_TRACKED,
  budgetKey,
  budgetKeyForIp,
  refusalReason,
  takeBudget,
  takeBudgetInMemory,
  takeBudgetOnRedis,
  type BudgetRedis,
  type BudgetRequest,
} from "./budget";

/**
 * A Redis that behaves like the two commands the budget uses, and counts
 * them. `SET ... EX NX` creates a live key or does nothing; `INCR` counts;
 * `PTTL` and `EXPIRE` do what they say. The clock is a number the test moves,
 * so a window can pass without waiting for one.
 */
function fakeRedis() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  const commands: string[] = [];
  let clock = 1_000_000;
  const live = (key: string) => {
    const row = store.get(key);
    return row && row.expiresAt > clock ? row : undefined;
  };
  const redis: BudgetRedis & { commands: string[]; tick: (ms: number) => void; store: typeof store } = {
    commands,
    store,
    tick: (ms) => {
      clock += ms;
    },
    multi() {
      const queued: Array<() => unknown> = [];
      const tx = {
        set(key: string, value: number, options: { ex: number; nx: true }) {
          queued.push(() => {
            commands.push("SET");
            if (live(key)) return null;
            store.set(key, { value, expiresAt: clock + options.ex * 1000 });
            return "OK";
          });
          return tx;
        },
        incr(key: string) {
          queued.push(() => {
            commands.push("INCR");
            const row = live(key) ?? { value: 0, expiresAt: Number.POSITIVE_INFINITY };
            row.value += 1;
            store.set(key, row);
            return row.value;
          });
          return tx;
        },
        async exec() {
          return queued.map((run) => run());
        },
      };
      return tx;
    },
    async pttl(key: string) {
      commands.push("PTTL");
      const row = store.get(key);
      if (!row) return -2;
      if (!Number.isFinite(row.expiresAt)) return -1;
      return Math.max(0, row.expiresAt - clock);
    },
    async expire(key: string, seconds: number) {
      commands.push("EXPIRE");
      const row = store.get(key);
      if (!row) return 0;
      row.expiresAt = clock + seconds * 1000;
      return 1;
    },
  };
  return redis;
}

let counter = 0;
const request = (over: Partial<BudgetRequest> = {}): BudgetRequest => ({
  tool: "t",
  scope: "ip",
  key: `k${(counter += 1)}`,
  limit: 3,
  windowSec: 3600,
  ...over,
});

afterEach(() => {
  vi.unstubAllEnvs();
  getRedisMock.mockReset();
});

describe("refusalReason", () => {
  it("prints the sentence from the design for a daily budget", () => {
    expect(refusalReason("ip", 3, 86_400, 4 * 3600)).toBe(
      "This address has used its 3 runs for today; the counter resets in 4 hours.",
    );
  });

  it("reads correctly for each scope, window and wait", () => {
    expect(refusalReason("target", 60, 3600, 60)).toBe(
      "That site has had its 60 runs for this hour; the counter resets in a minute.",
    );
    expect(refusalReason("global", 500, 86_400, 3600)).toBe(
      "Everyone together has used the 500 runs for today; the counter resets in an hour.",
    );
    expect(refusalReason("ip", 1, 60, 30)).toBe(
      "This address has used its 1 run for this minute; the counter resets in 30 seconds.",
    );
    expect(refusalReason("ip", 3, 86_400, 5400)).toContain("resets in 2 hours.");
    expect(refusalReason("ip", 3, 86_400, 90)).toContain("resets in 2 minutes.");
    expect(refusalReason("ip", 3, 86_400, 1)).toContain("resets in a second.");
  });
});

describe("budgetKey", () => {
  it("is the frozen shape", () => {
    expect(budgetKey({ tool: "headline-check", scope: "global", key: "all", limit: 1, windowSec: 1 })).toBe(
      "budget:headline-check:global:all",
    );
  });
});

describe("takeBudgetOnRedis", () => {
  it("allows a limit of three and refuses the fourth, with a sentence and a wait", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 3, windowSec: 120 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 2 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 1 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 0 });
    const fourth = await takeBudgetOnRedis(redis, req);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.remaining).toBe(0);
      expect(fourth.retryAfterSec).toBe(120);
      expect(fourth.reason).toBe(
        "This address has used its 3 runs for these 120 seconds; the counter resets in 2 minutes.",
      );
    }
  });

  it("spends exactly two commands on an allowed call and three on a refused one", async () => {
    // 500,000 commands a month is the meter. This is the guard on it.
    const redis = fakeRedis();
    const req = request({ limit: 1 });
    await takeBudgetOnRedis(redis, req);
    expect(redis.commands).toEqual(["SET", "INCR"]);
    await takeBudgetOnRedis(redis, req);
    expect(redis.commands).toEqual(["SET", "INCR", "SET", "INCR", "PTTL"]);
  });

  it("gives the window its TTL on the first hit only", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 5, windowSec: 60 });
    await takeBudgetOnRedis(redis, req);
    redis.tick(50_000);
    await takeBudgetOnRedis(redis, req);
    // Ten seconds left from the first hit, not sixty from the second.
    expect(await redis.pttl(budgetKey(req))).toBe(10_000);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 1, windowSec: 60 });
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(true);
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(false);
    redis.tick(60_001);
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(true);
  });

  it("repairs a counter that somehow has no expiry rather than locking the key out for ever", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 1, windowSec: 60 });
    redis.store.set(budgetKey(req), { value: 5, expiresAt: Number.POSITIVE_INFINITY });
    const result = await takeBudgetOnRedis(redis, req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSec).toBe(60);
    expect(redis.commands).toContain("EXPIRE");
    expect(await redis.pttl(budgetKey(req))).toBe(60_000);
  });

  it("keeps one key's spending away from another's", async () => {
    const redis = fakeRedis();
    const a = request({ limit: 1 });
    const b = request({ limit: 1 });
    await takeBudgetOnRedis(redis, a);
    expect((await takeBudgetOnRedis(redis, a)).ok).toBe(false);
    expect((await takeBudgetOnRedis(redis, b)).ok).toBe(true);
  });
});

describe("takeBudgetInMemory", () => {
  it("allows a limit of three and refuses the fourth", () => {
    const req = request({ limit: 3, windowSec: 120 });
    const now = 5_000_000;
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 2 });
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 1 });
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 0 });
    const fourth = takeBudgetInMemory(req, now + 30_000);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterSec).toBe(90);
      expect(fourth.reason).toContain("resets in 2 minutes.");
    }
  });

  it("stays refused inside the window and resets after it", () => {
    const req = request({ limit: 1, windowSec: 60 });
    const now = 6_000_000;
    expect(takeBudgetInMemory(req, now).ok).toBe(true);
    expect(takeBudgetInMemory(req, now + 59_999).ok).toBe(false);
    expect(takeBudgetInMemory(req, now + 60_000).ok).toBe(true);
  });

  it("keeps one key's spending away from another's", () => {
    const a = request({ limit: 1 });
    const b = request({ limit: 1 });
    const now = 7_000_000;
    takeBudgetInMemory(a, now);
    expect(takeBudgetInMemory(a, now).ok).toBe(false);
    expect(takeBudgetInMemory(b, now).ok).toBe(true);
  });

  it("survives the eviction sweep without handing out a free window", () => {
    // Ported from rate-limit.test.ts. Past MAX_TRACKED the map drops expired
    // windows and clears outright if that was not enough. Either way the
    // flooder does not get more than one window's worth out of it.
    const req = request({ limit: 3 });
    const now = 8_000_000;
    for (let i = 0; i < 3; i += 1) takeBudgetInMemory(req, now);
    expect(takeBudgetInMemory(req, now).ok).toBe(false);

    for (let i = 0; i < MAX_TRACKED + 100; i += 1) {
      takeBudgetInMemory({ ...req, key: `flood-${i}` }, now);
    }
    const flooder = { ...req, key: "flood-0" };
    for (let i = 0; i < 3; i += 1) takeBudgetInMemory(flooder, now);
    expect(takeBudgetInMemory(flooder, now).ok).toBe(false);
  });
});

describe("takeBudget: which implementation answers", () => {
  it("uses Redis when the client is available", async () => {
    const redis = fakeRedis();
    getRedisMock.mockReturnValue(redis);
    const req = request({ limit: 1 });
    expect((await takeBudget(req)).ok).toBe(true);
    expect((await takeBudget(req)).ok).toBe(false);
    expect(redis.commands.length).toBe(5);
  });

  it("falls back to memory outside production when Redis is not configured, and the fallback counts", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    vi.stubEnv("NODE_ENV", "test");
    const req = request({ limit: 1 });
    expect((await takeBudget(req, 9_000_000)).ok).toBe(true);
    expect((await takeBudget(req, 9_000_000)).ok).toBe(false);
  });

  it("throws in production when Redis is not configured, and never runs unlimited", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    vi.stubEnv("NODE_ENV", "production");
    await expect(takeBudget(request())).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it("lets any other Redis failure surface rather than swallowing it", async () => {
    getRedisMock.mockImplementation(() => {
      throw new TypeError("fetch failed");
    });
    vi.stubEnv("NODE_ENV", "test");
    await expect(takeBudget(request())).rejects.toBeInstanceOf(TypeError);
  });
});

describe("budgetKeyForIp", () => {
  const headersOf = (init: Record<string, string>) => new Headers(init);

  it("is sixteen hex characters that never contain the address", () => {
    const key = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.9");
    // Not `not.toContain("203")`. A hex digest carries "203" by chance about
    // once in three hundred runs, and the key is salted with today's date, so
    // that assertion goes red on whichever day the arithmetic picks it. The
    // hex shape above already forbids an address: an address has dots in it.
  });

  it("prefers x-real-ip, then the last x-forwarded-for entry, then unknown", () => {
    const real = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 203.0.113.9" }));
    const last = budgetKeyForIp(headersOf({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }));
    const first = budgetKeyForIp(headersOf({ "x-forwarded-for": "198.51.100.1" }));
    expect(real).toBe(last);
    expect(first).not.toBe(last);
    expect(budgetKeyForIp(headersOf({}))).toBe(budgetKeyForIp(headersOf({ "x-forwarded-for": "" })));
  });

  it("changes with the UTC date, so yesterday's key cannot be joined to today's", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-03T23:59:59Z"));
      const before = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }));
      expect(budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }))).toBe(before);
      vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
      expect(budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }))).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
