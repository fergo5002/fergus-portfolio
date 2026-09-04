import { describe, expect, it } from "vitest";
import { StoreUnavailableError } from "./errors";

/**
 * One error for every missing store. Every catch block in the repo that wants
 * to turn "the store is not configured" into a sentence keys on this class,
 * so what is pinned here is the contract those blocks lean on: the name, the
 * two fields, and that `instanceof` survives a throw.
 */
describe("StoreUnavailableError", () => {
  it("names the store and the variable, and points at .env.example", () => {
    const error = new StoreUnavailableError("neon", "DATABASE_URL");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("StoreUnavailableError");
    expect(error.store).toBe("neon");
    expect(error.envVar).toBe("DATABASE_URL");
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain(".env.example");
  });

  it("survives instanceof across a throw", () => {
    try {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    } catch (caught) {
      expect(caught instanceof StoreUnavailableError).toBe(true);
      expect((caught as StoreUnavailableError).store).toBe("redis");
    }
  });
});
