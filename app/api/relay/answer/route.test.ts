import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "@/lib/store/errors";

const { getRedisMock, takeBudgetMock } = vi.hoisted(() => ({
  getRedisMock: vi.fn(),
  takeBudgetMock: vi.fn(),
}));
vi.mock("@/lib/store/redis", () => ({ getRedis: getRedisMock }));
vi.mock("@/lib/budget", () => ({ takeBudget: takeBudgetMock, budgetKeyForIp: () => "ip-hash" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { GET, POST } from "./route";

const SDP = "v=0\r\na=fingerprint:sha-256 CC:DD\r\n";

beforeEach(() => {
  getRedisMock.mockReset();
  takeBudgetMock.mockReset();
  takeBudgetMock.mockResolvedValue({ ok: true, remaining: 1 });
});

const post = (body: unknown) =>
  POST(new Request("https://x/api/relay/answer", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/relay/answer", () => {
  it("writes the answer under its own key, with the room's remaining life", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getRedisMock.mockReturnValue({ set, ttl: vi.fn().mockResolvedValue(420), get: vi.fn() });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith("relay:K4M9F2:a", SDP, { ex: 420, nx: true });
  });

  it("refuses a second joiner rather than replacing the first", async () => {
    getRedisMock.mockReturnValue({
      set: vi.fn().mockResolvedValue(null),
      ttl: vi.fn().mockResolvedValue(420),
      get: vi.fn(),
    });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already-joined");
  });

  it("refuses an answer for a room that has gone", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), ttl: vi.fn().mockResolvedValue(-2), get: vi.fn() });
    expect((await post({ code: "K4M9F2", answer: SDP })).status).toBe(404);
  });

  it("refuses a bad code and a bad answer", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), ttl: vi.fn(), get: vi.fn() });
    expect((await post({ code: "nope", answer: SDP })).status).toBe(400);
    expect((await post({ code: "K4M9F2", answer: "hello" })).status).toBe(400);
  });

  it("says the room service is off", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("relay-unavailable");
  });
});

describe("GET /api/relay/answer", () => {
  const poll = (code: string) => GET(new Request(`https://x/api/relay/answer?code=${code}`));

  it("hands back null while nobody has joined, which is not an error", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), ttl: vi.fn() });
    const res = await poll("K4M9F2");
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBeNull();
  });

  it("hands back the answer once there is one", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn(), ttl: vi.fn() });
    expect((await (await poll("K4M9F2")).json()).answer).toBe(SDP);
  });

  /**
   * The poll is budgeted against the code and not the address, because the
   * code is the tighter cap and it is what a runaway client spins on. Twenty
   * is the fifteen the page will use plus slack.
   */
  it("is budgeted per code only, at twenty in a room's lifetime", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), ttl: vi.fn() });
    await poll("K4M9F2");
    expect(takeBudgetMock).toHaveBeenCalledTimes(1);
    expect(takeBudgetMock.mock.calls[0][0]).toMatchObject({
      scope: "target",
      key: "K4M9F2",
      limit: 20,
      windowSec: 600,
    });
  });
});
