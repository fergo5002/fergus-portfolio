import { describe, expect, it } from "vitest";
import { MAX_SDP_BYTES, ROOM_TTL_SEC, answerKey, errorReply, offerKey, validSdp } from "./relay";

describe("keys and lifetime", () => {
  it("holds a room for ten minutes and no longer", () => {
    expect(ROOM_TTL_SEC).toBe(600);
  });

  it("keeps the offer and the answer under two keys and nothing else", () => {
    expect(offerKey("K4M9F2")).toBe("relay:K4M9F2");
    expect(answerKey("K4M9F2")).toBe("relay:K4M9F2:a");
    expect(offerKey("K4M9F2")).not.toBe(answerKey("K4M9F2"));
  });
});

describe("validSdp", () => {
  it("takes a session description", () => {
    expect(validSdp("v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n")).toBe(true);
  });

  it("refuses anything that is not one", () => {
    expect(validSdp("")).toBe(false);
    expect(validSdp("   ")).toBe(false);
    expect(validSdp("hello")).toBe(false);
    expect(validSdp(42)).toBe(false);
    expect(validSdp(null)).toBe(false);
    expect(validSdp({ sdp: "v=0" })).toBe(false);
  });

  it("refuses a blob above the cap, measured in bytes and not characters", () => {
    expect(MAX_SDP_BYTES).toBe(8192);
    expect(validSdp(`v=0\r\n${"a".repeat(MAX_SDP_BYTES)}`)).toBe(false);
    // Four-byte characters must not slip through a length check on code units.
    expect(validSdp(`v=0\r\n${"\u{1f600}".repeat(MAX_SDP_BYTES / 3)}`)).toBe(false);
    expect(validSdp(`v=0\r\n${"a".repeat(100)}`)).toBe(true);
  });
});

describe("errorReply", () => {
  it("carries the code and the sentence, and a wait when there is one", () => {
    expect(errorReply("no-room", "gone", undefined)).toEqual({
      status: 404,
      body: { error: "no-room", message: "gone" },
    });
    expect(errorReply("budget", "later", 900)).toEqual({
      status: 429,
      body: { error: "budget", message: "later", retryAfterSec: 900 },
    });
    expect(errorReply("relay-unavailable", "off", undefined).status).toBe(503);
    expect(errorReply("already-joined", "taken", undefined).status).toBe(409);
    expect(errorReply("bad-code", "nope", undefined).status).toBe(400);
    expect(errorReply("failed", "broke", undefined).status).toBe(500);
  });
});
