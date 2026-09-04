import { describe, expect, it, vi } from "vitest";
import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_MS,
  createRoom,
  fetchOffer,
  pollForAnswer,
  sendAnswer,
} from "./relay-client";

const SDP = "v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\na=fingerprint:sha-256 AA:BB\r\n";

/** A fetch that records everything and answers from a queue. */
function recorder(replies: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let at = 0;
  const impl = async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const reply = replies[Math.min(at++, replies.length - 1)];
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { impl, calls };
}

describe("createRoom", () => {
  it("posts the offer and gives back the code", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { code: "K4M9F2", ttlSec: 600 } }]);
    await expect(createRoom(SDP, impl)).resolves.toEqual({ ok: true, code: "K4M9F2", ttlSec: 600 });
    expect(calls[0].url).toBe("/api/relay");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body)).toEqual({ offer: SDP });
  });

  it("turns a 503 into the outcome the page switches on", async () => {
    const { impl } = recorder([{ status: 503, body: { error: "relay-unavailable", message: "off" } }]);
    await expect(createRoom(SDP, impl)).resolves.toEqual({
      ok: false,
      error: "relay-unavailable",
      message: "off",
    });
  });

  it("turns a 429 into a budget outcome with its wait", async () => {
    const { impl } = recorder([
      { status: 429, body: { error: "budget", message: "later", retryAfterSec: 900 } },
    ]);
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({
      ok: false,
      error: "budget",
      retryAfterSec: 900,
    });
  });

  it("turns a network failure into an outcome rather than a throw", async () => {
    const impl = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
  });

  it("turns a reply that is not JSON into an outcome", async () => {
    const impl = async () => new Response("<html>", { status: 200 });
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
  });

  it("refuses a successful response whose room fields are not real", async () => {
    for (const body of [
      {},
      { code: "not-a-code", ttlSec: 600 },
      { code: "K4M9F2", ttlSec: 0 },
      { code: "K4M9F2", ttlSec: "600" },
    ]) {
      const { impl } = recorder([{ status: 200, body }]);
      await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
    }
  });
});

describe("fetchOffer and sendAnswer", () => {
  it("asks for the offer by code in the query", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { offer: SDP } }]);
    await expect(fetchOffer("K4M9F2", impl)).resolves.toEqual({ ok: true, offer: SDP });
    expect(calls[0].url).toBe("/api/relay?code=K4M9F2");
    expect(calls[0].method).toBe("GET");
  });

  it("reports a room that has gone", async () => {
    const { impl } = recorder([{ status: 404, body: { error: "no-room", message: "gone" } }]);
    await expect(fetchOffer("K4M9F2", impl)).resolves.toMatchObject({ ok: false, error: "no-room" });
  });

  it("posts the answer with the code beside it", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { ok: true } }]);
    await expect(sendAnswer("K4M9F2", SDP, impl)).resolves.toEqual({ ok: true });
    expect(JSON.parse(calls[0].body)).toEqual({ code: "K4M9F2", answer: SDP });
  });

  it("reports a room somebody else already joined", async () => {
    const { impl } = recorder([{ status: 409, body: { error: "already-joined", message: "taken" } }]);
    await expect(sendAnswer("K4M9F2", SDP, impl)).resolves.toMatchObject({
      ok: false,
      error: "already-joined",
    });
  });

  it("refuses malformed success bodies instead of handing them to WebRTC", async () => {
    for (const body of [{}, { offer: "hello" }, { offer: 42 }]) {
      const { impl } = recorder([{ status: 200, body }]);
      await expect(fetchOffer("K4M9F2", impl)).resolves.toMatchObject({ ok: false, error: "failed" });
    }
    for (const body of [{}, { ok: false }, { ok: "true" }]) {
      const { impl } = recorder([{ status: 200, body }]);
      await expect(sendAnswer("K4M9F2", SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
    }
  });
});

describe("pollForAnswer", () => {
  it("polls on the interval and stops the moment an answer lands", async () => {
    const { impl, calls } = recorder([
      { status: 200, body: { answer: null } },
      { status: 200, body: { answer: null } },
      { status: 200, body: { answer: SDP } },
    ]);
    const waits: number[] = [];
    const result = await pollForAnswer("K4M9F2", impl, {
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(result).toEqual({ ok: true, answer: SDP });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
  });

  it("gives up after the window rather than polling for ever", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { answer: null } }]);
    let clock = 0;
    const result = await pollForAnswer("K4M9F2", impl, {
      wait: async () => {
        clock += POLL_INTERVAL_MS;
      },
      now: () => clock,
    });
    expect(result).toMatchObject({ ok: false, error: "gave-up" });
    expect(calls.length).toBeLessThanOrEqual(POLL_WINDOW_MS / POLL_INTERVAL_MS + 1);
  });

  it("stops on a refusal instead of hammering it", async () => {
    const { impl, calls } = recorder([{ status: 429, body: { error: "budget", message: "later" } }]);
    await expect(pollForAnswer("K4M9F2", impl, { wait: async () => {} })).resolves.toMatchObject({
      error: "budget",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses a malformed answer in a successful poll response", async () => {
    for (const answer of [42, "hello", {}]) {
      const { impl, calls } = recorder([{ status: 200, body: { answer } }]);
      await expect(pollForAnswer("K4M9F2", impl, { wait: async () => {} })).resolves.toMatchObject({
        ok: false,
        error: "failed",
      });
      expect(calls).toHaveLength(1);
    }
  });

  it("keeps the arithmetic the plan budgeted for", () => {
    expect(POLL_INTERVAL_MS).toBe(4000);
    expect(POLL_WINDOW_MS).toBe(60_000);
    expect(POLL_WINDOW_MS / POLL_INTERVAL_MS).toBe(15);
  });
});

describe("the tripwire", () => {
  /**
   * The promise, checked on the wire the tool actually writes to.
   *
   * Every request the relay client makes is captured and searched for the
   * things that must never be in it. What this cannot see: the SDP itself. A
   * real `RTCPeerConnection` puts ICE candidates in there and those carry
   * addresses, so this proves the tool does not send a list to the relay, and
   * it does not prove the relay learns nothing. The page says what it does
   * learn.
   */
  it("never sends a slug, a name or a hash to the relay", async () => {
    const { impl, calls } = recorder([
      { status: 200, body: { code: "K4M9F2", ttlSec: 600 } },
      { status: 200, body: { answer: SDP } },
    ]);
    await createRoom(SDP, impl);
    await pollForAnswer("K4M9F2", impl, { wait: async () => {} });

    const traffic = JSON.stringify(calls);
    for (const secret of ["sine-ni-dhomhnaill", "Síne", "Dhomhnaill", "e3b0c44298fc1c14"]) {
      expect(traffic, `"${secret}" reached the relay`).not.toContain(secret);
    }
    for (const call of calls) {
      const keys = call.body === "" ? [] : Object.keys(JSON.parse(call.body));
      expect(keys.every((k) => ["offer", "answer", "code"].includes(k)), `keys ${keys}`).toBe(true);
    }
  });
});
