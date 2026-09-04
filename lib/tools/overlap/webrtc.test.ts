import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICE_SERVERS, packSdp, unpackSdp } from "./webrtc";

/**
 * A source-coupling check, not a render and not a connection.
 *
 * vitest runs in a `node` environment here and there is no
 * `RTCPeerConnection` in it, so nothing in this file opens anything. What it
 * does is hold the two properties that make the rest of the tool auditable:
 * this is the only module that names `RTCPeerConnection`, and it waits for ICE
 * gathering before serialising an SDP. The handshake itself is proved by a
 * two-browser check and by the live run, and by nothing in this suite.
 *
 * The source is normalised to LF before it is searched. This is a Windows
 * checkout with autocrlf, so a pattern that crosses a line break is red here
 * and green in CI for no real reason.
 */
const source = readFileSync(join(process.cwd(), "lib", "tools", "overlap", "webrtc.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("webrtc.ts", () => {
  it("names one public address server and says whose it is", () => {
    expect(ICE_SERVERS).toEqual([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
    expect(source).toContain("Cloudflare");
  });

  it("waits for gathering to finish before handing over an SDP", () => {
    expect(source).toMatch(/icegatheringstatechange/);
    expect(source).toMatch(/ICE_TIMEOUT_MS/);
  });

  it("creates an ordered reliable data channel, which is what the protocol assumes", () => {
    expect(source).toMatch(/createDataChannel\("overlap", \{ ordered: true \}\)/);
  });

  it("empties the address server list when the visitor asks for same network only", () => {
    expect([...source.matchAll(/options\.sameNetworkOnly \? \[\] : ICE_SERVERS/g)]).toHaveLength(2);
  });

  it("touches no storage", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it("calls no fetch, because one file in this tool is allowed to and it is not this one", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("packSdp and unpackSdp", () => {
  const sdp = `v=0\r\n${"a=candidate:1 1 udp 2 10.0.0.1 1 typ host\r\n".repeat(20)}`;

  it("round trips a session description through the copy and paste blob", async () => {
    expect(await unpackSdp(await packSdp(sdp))).toBe(sdp);
  });

  it("makes a blob a person can paste into a message", async () => {
    const packed = await packSdp(sdp);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(sdp.length);
  });

  it("refuses a blob that is not one rather than handing back rubbish", async () => {
    await expect(unpackSdp("not a blob at all")).rejects.toThrow();
  });
});
