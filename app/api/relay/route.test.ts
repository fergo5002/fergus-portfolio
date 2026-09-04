import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "@/lib/store/errors";

const { budgetKeyMock, getRedisMock, takeBudgetMock } = vi.hoisted(() => ({
  budgetKeyMock: vi.fn(),
  getRedisMock: vi.fn(),
  takeBudgetMock: vi.fn(),
}));
vi.mock("@/lib/store/redis", () => ({ getRedis: getRedisMock }));
vi.mock("@/lib/budget", () => ({
  takeBudget: takeBudgetMock,
  budgetKeyForIp: budgetKeyMock,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { GET, POST } from "./route";

const SDP = "v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\na=fingerprint:sha-256 AA:BB\r\n";

function post(body: unknown) {
  return new Request("https://x/api/relay", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  getRedisMock.mockReset();
  takeBudgetMock.mockReset();
  budgetKeyMock.mockReset();
  budgetKeyMock.mockReturnValue("ip-hash");
  takeBudgetMock.mockResolvedValue({ ok: true, remaining: 4 });
});

describe("POST /api/relay", () => {
  it("makes a room, and the code and the TTL come back", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getRedisMock.mockReturnValue({ set, get: vi.fn() });
    const res = await POST(post({ offer: SDP }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.code).toMatch(/^[234679FKMRW]{6}$/);
    expect(body.ttlSec).toBe(600);
    expect(set).toHaveBeenCalledWith(`relay:${body.code}`, SDP, { ex: 600, nx: true });
  });

  it("takes an address budget and a global one, in that order", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn().mockResolvedValue("OK"), get: vi.fn() });
    await POST(post({ offer: SDP }));
    expect(takeBudgetMock.mock.calls.map(([r]) => [r.scope, r.limit, r.windowSec])).toEqual([
      ["ip", 5, 3600],
      ["global", 20, 86_400],
    ]);
  });

  it("refuses over budget with the sentence and a wait", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), get: vi.fn() });
    takeBudgetMock.mockResolvedValueOnce({ ok: false, remaining: 0, retryAfterSec: 900, reason: "x" });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("budget");
    expect(body.retryAfterSec).toBe(900);
    expect(body.message).toContain("copy and paste");
  });

  it("refuses a body that is not an offer", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), get: vi.fn() });
    for (const body of [{}, { offer: "" }, { offer: "hello" }, { offer: 1 }]) {
      expect((await POST(post(body))).status).toBe(400);
    }
    expect((await POST(new Request("https://x", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("retries a code collision rather than clobbering a live room", async () => {
    const set = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("OK");
    getRedisMock.mockReturnValue({ set, get: vi.fn() });
    expect((await POST(post({ offer: SDP }))).status).toBe(200);
    expect(set).toHaveBeenCalledTimes(2);
  });

  /**
   * The state this ships in. Redis is not provisioned in production, so this
   * is the ordinary answer rather than an edge case, and the sentence has to
   * be one a person can act on.
   */
  it("says the room service is off and points at copy and paste", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("relay-unavailable");
    expect(body.message).toContain("copy and paste");
    expect(body.message).not.toContain("UPSTASH");
  });

  it("fails closed without the address-key secret and keeps manual signalling available", async () => {
    budgetKeyMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "BUDGET_HASH_SECRET");
    });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("relay-unavailable");
    expect(body.message).toContain("copy and paste");
    expect(JSON.stringify(body)).not.toContain("BUDGET_HASH_SECRET");
    expect(takeBudgetMock).not.toHaveBeenCalled();
    expect(getRedisMock).not.toHaveBeenCalled();
  });

  it("does not dress a real fault up as a missing store", async () => {
    getRedisMock.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error("upstream on fire")),
      get: vi.fn(),
    });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("failed");
  });
});

describe("GET /api/relay", () => {
  const get = (code: string) => GET(new Request(`https://x/api/relay?code=${code}`));

  it("hands back the offer", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    const res = await get("K4M9F2");
    expect(res.status).toBe(200);
    expect((await res.json()).offer).toBe(SDP);
  });

  it("takes an address budget and a per-code one", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    await get("K4M9F2");
    expect(takeBudgetMock.mock.calls.map(([r]) => r.scope)).toEqual(["ip", "target"]);
    expect(takeBudgetMock.mock.calls[1][0].key).toBe("K4M9F2");
  });

  it("refuses a code that is not one, without touching Redis", async () => {
    const redisGet = vi.fn();
    getRedisMock.mockReturnValue({ get: redisGet, set: vi.fn() });
    expect((await get("nope")).status).toBe(400);
    expect((await GET(new Request("https://x/api/relay"))).status).toBe(400);
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("says there is no room rather than returning nothing", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn() });
    const res = await get("K4M9F2");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("no-room");
  });

  it("never caches", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    expect((await get("K4M9F2")).headers.get("cache-control")).toContain("no-store");
  });
});
