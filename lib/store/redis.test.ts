import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreUnavailableError } from "./errors";

const { ctor } = vi.hoisted(() => ({ ctor: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      ctor(options);
    }
  },
}));

/**
 * Four variable names, two of which the Vercel Marketplace integration writes
 * (`KV_*`) and two of which Upstash's console and docs use (`UPSTASH_*`). The
 * client reads the Upstash pair first. Every test starts with all four unset,
 * so a laptop that happens to have a real database in its shell cannot make a
 * failing case pass.
 */
const NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  ctor.mockClear();
});

afterEach(() => {
  for (const name of NAMES) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/**
 * A fresh module instance, and the `StoreUnavailableError` class that instance
 * imported. `vi.resetModules()` re-evaluates `./errors` as well, so a class
 * imported at the top of this file is a different identity from the one the
 * fresh module throws, and `instanceof` against it fails for the right error.
 * Asserting against `FreshError` is what makes the check mean something.
 */
async function fresh() {
  vi.resetModules();
  const errors = await import("./errors");
  const redis = await import("./redis");
  return { ...redis, FreshError: errors.StoreUnavailableError };
}

describe("getRedis", () => {
  it("constructs nothing at import time", async () => {
    await fresh();
    expect(ctor).not.toHaveBeenCalled();
  });

  it("throws the named error for the URL before anything is built", async () => {
    const { getRedis, FreshError } = await fresh();
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-that-must-not-leak";
    let caught: unknown;
    try {
      getRedis();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FreshError);
    const error = caught as StoreUnavailableError;
    expect(error.name).toBe("StoreUnavailableError");
    expect(error.store).toBe("redis");
    expect(error.envVar).toBe("UPSTASH_REDIS_REST_URL");
    expect(error.message).not.toContain("token-that-must-not-leak");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("throws the named error for the token when only the URL is set", async () => {
    const { getRedis, FreshError } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    expect(() => getRedis()).toThrow(FreshError);
    expect(() => getRedis()).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("builds one client from the Upstash pair and reuses it", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t1";
    const first = getRedis();
    const second = getRedis();
    expect(second).toBe(first);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith({ url: "https://example.upstash.io", token: "t1" });
  });

  it("falls back to the KV pair the Vercel integration writes", async () => {
    const { getRedis } = await fresh();
    process.env.KV_REST_API_URL = "https://kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "t2";
    getRedis();
    expect(ctor).toHaveBeenCalledWith({ url: "https://kv.upstash.io", token: "t2" });
  });

  it("prefers the Upstash pair when both are present", async () => {
    const { getRedis } = await fresh();
    process.env.KV_REST_API_URL = "https://kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv";
    process.env.UPSTASH_REDIS_REST_URL = "https://up.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "up";
    getRedis();
    expect(ctor).toHaveBeenCalledWith({ url: "https://up.upstash.io", token: "up" });
  });

  it("builds a new client when the variables change", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://a.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const a = getRedis();
    process.env.UPSTASH_REDIS_REST_URL = "https://b.upstash.io";
    const b = getRedis();
    expect(b).not.toBe(a);
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
