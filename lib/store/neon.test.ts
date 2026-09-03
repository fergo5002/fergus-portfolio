import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { neonSpy, fakeSql } = vi.hoisted(() => ({
  neonSpy: vi.fn(),
  // A bare function: a function's `name` is read-only, so decorating it with
  // `Object.assign` throws at load and the suite never runs.
  fakeSql: async () => [],
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => {
    neonSpy(url);
    return fakeSql;
  },
}));

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.set("DATABASE_URL", process.env.DATABASE_URL);
  delete process.env.DATABASE_URL;
  neonSpy.mockClear();
});

afterEach(() => {
  const value = saved.get("DATABASE_URL");
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
});

/**
 * A fresh module instance, and the `StoreUnavailableError` class that instance
 * imported. `vi.resetModules()` re-evaluates `./errors` as well, so a class
 * imported at the top of this file would be a different identity from the one
 * the fresh module throws. See `redis.test.ts`.
 */
async function fresh() {
  vi.resetModules();
  const errors = await import("./errors");
  const neon = await import("./neon");
  return { ...neon, FreshError: errors.StoreUnavailableError };
}

describe("getSql", () => {
  it("constructs nothing at import time", async () => {
    await fresh();
    expect(neonSpy).not.toHaveBeenCalled();
  });

  it("throws the named error when DATABASE_URL is missing", async () => {
    const { getSql, FreshError } = await fresh();
    expect(() => getSql()).toThrow(FreshError);
    expect(() => getSql()).toThrow(/DATABASE_URL/);
    expect(neonSpy).not.toHaveBeenCalled();
  });

  it("builds the driver from DATABASE_URL once and reuses it", async () => {
    const { getSql } = await fresh();
    process.env.DATABASE_URL = "postgres://user:pass@ep.example.neon.tech/db?sslmode=require";
    const first = getSql();
    const second = getSql();
    expect(first).toBe(fakeSql);
    expect(second).toBe(first);
    expect(neonSpy).toHaveBeenCalledTimes(1);
    expect(neonSpy).toHaveBeenCalledWith("postgres://user:pass@ep.example.neon.tech/db?sslmode=require");
  });

  it("builds the message from the name and nothing else", async () => {
    const { getSql } = await fresh();
    let message = "";
    try {
      getSql();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("The neon store is not configured: DATABASE_URL is not set. See .env.example.");
  });
});
