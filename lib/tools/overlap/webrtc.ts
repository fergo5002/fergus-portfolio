import type { Channel } from "./protocol";
import { MAX_SDP_BYTES, validSdp } from "../../relay";

/**
 * The only module in this tool that touches `RTCPeerConnection`.
 *
 * Everything above it works against the three-method `Channel`, which is why
 * the protocol is testable in node and this file is not. There is no
 * `RTCPeerConnection` in vitest's node environment and this plan does not shim
 * one: `webrtc.test.ts` is a source-coupling check, and the handshake is
 * proved on two real browsers instead.
 *
 * **Non-trickle, on purpose.** The relay holds two blobs, so the whole
 * candidate list has to be inside the offer before it is handed over. That
 * means waiting for `icegatheringstate` to reach `complete`, with a timeout,
 * because some networks never report it and a page that waits for ever is
 * worse than one that connects with the candidates it has.
 *
 * **One public address server, named on the page.** Two browsers on different
 * networks cannot find each other from host candidates alone, so the browser
 * asks Cloudflare's public STUN server what its address looks like from
 * outside. One small packet, no part of anybody's file. The page names
 * Cloudflare and offers a same-network-only switch that empties this list, for
 * two people on the same wifi who would rather nothing left the building. There
 * is no TURN server, so a symmetric NAT can defeat both room-code and manual
 * signalling routes. Manual signalling skips the relay, not the network.
 */

export const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

/** Some networks never report gathering as complete. Go with what we have. */
const ICE_TIMEOUT_MS = 4_000;
export const CONNECTION_TIMEOUT_MS = 20_000;
/** Bounds pasted input before base64 decoding or decompression starts. */
export const MAX_PACKED_SDP_CHARS = 16 * 1024;

/** Once both descriptions exist, a connection either opens promptly or fails visibly. */
export function waitForConnection<T>(pending: Promise<T>, timeoutMs = CONNECTION_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("overlap: browsers could not connect")), timeoutMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ICE_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function channelFrom(dataChannel: RTCDataChannel): Channel {
  return {
    send: (text) => dataChannel.send(text),
    onMessage: (handler) => {
      dataChannel.addEventListener("message", (event) => handler(String(event.data)));
    },
    close: () => dataChannel.close(),
  };
}

export type Opened = {
  channel: Channel;
  localSdp: string;
  remoteSdp: string;
  connection: RTCPeerConnection;
};

export async function openAsCreator(options: { sameNetworkOnly?: boolean } = {}): Promise<{
  offer: string;
  finish: (answerSdp: string) => Promise<Opened>;
  close: () => void;
}> {
  const pc = new RTCPeerConnection({ iceServers: options.sameNetworkOnly ? [] : ICE_SERVERS });
  const dataChannel = pc.createDataChannel("overlap", { ordered: true });
  const open = new Promise<void>((resolve) => {
    if (dataChannel.readyState === "open") resolve();
    else dataChannel.addEventListener("open", () => resolve());
  });

  let offer: string;
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    offer = pc.localDescription?.sdp ?? "";
  } catch (error) {
    pc.close();
    throw error;
  }

  return {
    offer,
    close: () => pc.close(),
    finish: async (answerSdp: string) => {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      await open;
      return { channel: channelFrom(dataChannel), localSdp: offer, remoteSdp: answerSdp, connection: pc };
    },
  };
}

export async function openAsJoiner(
  offerSdp: string,
  options: { sameNetworkOnly?: boolean } = {},
): Promise<{ answer: string; opened: Promise<Opened>; close: () => void }> {
  const pc = new RTCPeerConnection({ iceServers: options.sameNetworkOnly ? [] : ICE_SERVERS });
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener("datachannel", (event) => {
      const dc = event.channel;
      if (dc.readyState === "open") resolve(dc);
      else dc.addEventListener("open", () => resolve(dc));
    });
  });

  let answer: string;
  try {
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    answer = pc.localDescription?.sdp ?? "";
  } catch (error) {
    pc.close();
    throw error;
  }

  return {
    answer,
    close: () => pc.close(),
    opened: channel.then((dc) => ({
      channel: channelFrom(dc),
      localSdp: answer,
      remoteSdp: offerSdp,
      connection: pc,
    })),
  };
}

/**
 * An SDP squeezed into something a person can paste into a message.
 *
 * `CompressionStream` is platform. Where it is missing the blob is base64 and
 * longer, which is a worse paste and not a broken one, so the fallback is
 * silent rather than a refusal.
 */
export async function packSdp(sdp: string): Promise<string> {
  if (!validSdp(sdp)) throw new Error("overlap: not a valid session description");
  const bytes = new TextEncoder().encode(sdp);
  if (typeof CompressionStream === "undefined") return base64url(bytes);
  const stream = blobOf(bytes).stream().pipeThrough(new CompressionStream("deflate"));
  return `z${base64url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

export async function unpackSdp(text: string): Promise<string> {
  if (text.length > MAX_PACKED_SDP_CHARS) {
    throw new Error("overlap: session description is too large");
  }
  const compressed = text.startsWith("z");
  const bytes = fromBase64url(compressed ? text.slice(1) : text);
  if (!compressed) return checkedSdp(bytes);
  const stream = blobOf(bytes).stream().pipeThrough(new DecompressionStream("deflate"));
  return checkedSdp(await boundedBytes(stream, MAX_SDP_BYTES));
}

function checkedSdp(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_SDP_BYTES) {
    throw new Error("overlap: session description is too large");
  }
  const sdp = new TextDecoder().decode(bytes);
  if (!validSdp(sdp)) throw new Error("overlap: not a valid session description");
  return sdp;
}

/** Read a decompressor incrementally so a small zip bomb never becomes one allocation. */
async function boundedBytes(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("overlap: session description is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * A Blob over these bytes, through a buffer the lib types will accept.
 *
 * `BlobPart` wants a view backed by an `ArrayBuffer`, and a `Uint8Array` is
 * typed as backed by an `ArrayBufferLike`, which a `SharedArrayBuffer`
 * satisfies too. Copying into a fresh buffer says what is true here rather
 * than casting the difference away, and both call sites are a few kilobytes.
 */
function blobOf(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer]);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
