import {
  BLOOM_THRESHOLD,
  bitsFor,
  buildFilter,
  decodeFilter,
  encodeFilter,
  expectedWrongNames,
  testFilter,
  type BloomFilter,
} from "./bloom";
import { decodeSalt, encodeSalt, hashAll, hashSlug, newSalt, type SubtleLike } from "./hash";
import { CODE_ALPHABET } from "./code";
import { OverlapProtocolError, type Entry } from "./types";

/**
 * The exchange, and the reason the untestable part of this tool is small.
 *
 * The transport is three methods. Everything else, the salt, the framing, the
 * chunking, the mode decision, the intersection and the safety string, runs
 * against two in-memory channels in one process with the real
 * `crypto.subtle`. What is not tested here is `RTCPeerConnection`, which lives
 * alone in `webrtc.ts` and is covered by a two-browser check.
 *
 * `pairedChannels` is production code, not a test helper: the demo runs the
 * real exchange through it in one tab, so the demo exercises the protocol
 * rather than imitating it.
 *
 * The wire is newline-free JSON, one object a message:
 *
 *   { t: "salt", v }                              creator only, first
 *   { t: "meta", version, mode, count, bits?, k? } each side, once
 *   { t: "part", i, n, v }                        each side, one or more
 *   { t: "done" }                                 each side, last
 *
 * Only hashes travel. A test in this file captures every frame and searches it
 * for a slug and a name.
 */

/** Comfortably under the 16 KB a data channel message can be relied on to carry. */
export const MAX_FRAME_CHARS = 12_000;
export const MAX_CONNECTIONS = 30_000;
export const MAX_PARTS = 64;
/** One complete maximum-size peer message set, plus one spare control frame. */
export const MAX_INBOX_FRAMES = MAX_PARTS + 4;
export const FRAME_WAIT_MS = 30_000;
const VERSION = 1;

export type Channel = {
  send(text: string): void;
  onMessage(handler: (text: string) => void): void;
  close(): void;
};

export type Side = "creator" | "joiner";
export type Mode = "exact" | "bloom";
export type Stage = "waiting-for-salt" | "hashing" | "sending" | "receiving" | "done";

export type ExchangeInput = {
  side: Side;
  entries: readonly Entry[];
  channel: Channel;
  /** The DTLS fingerprints out of the two SDPs. Both sides hold both. */
  fingerprints: { offer: string; answer: string };
  subtle?: SubtleLike;
  random?: (bytes: Uint8Array) => void;
  bloomThreshold?: number;
  /** Bounds an absent or stalled peer. Tests lower it; production uses 30s. */
  receiveTimeoutMs?: number;
  onStage?: (stage: Stage) => void;
  onProgress?: (done: number, total: number) => void;
};

export type ExchangeResult = {
  /** From the local file only. Sorted by label. */
  shared: Entry[];
  mine: number;
  theirs: number;
  /** What this side sent. */
  mode: Mode;
  /** What this side received, which is what decides whether names can be wrong. */
  theirMode: Mode;
  /** Expected wrong names in `shared`, or null when the peer sent an exact list. */
  falsePositives: number | null;
  safety: string;
};

/**
 * Two channels wired to each other. Used by the demo and by the tests.
 *
 * Anything sent before the far side has registered a handler is held rather
 * than dropped. That is not politeness: both sides of an exchange are started
 * together, the creator writes its salt before the joiner has run a line, and a
 * drop there hangs the joiner on a message that will never come again.
 */
export function pairedChannels(): [Channel, Channel] {
  const handlers: Array<((text: string) => void) | null> = [null, null];
  const waiting: string[][] = [[], []];

  const make = (self: 0 | 1): Channel => {
    const far = self === 0 ? 1 : 0;
    return {
      send(text) {
        const handler = handlers[far];
        if (handler) queueMicrotask(() => handler(text));
        else waiting[far].push(text);
      },
      onMessage(handler) {
        handlers[self] = handler;
        for (const text of waiting[self].splice(0)) queueMicrotask(() => handler(text));
      },
      close() {
        handlers[self] = null;
      },
    };
  };

  return [make(0), make(1)];
}

/** The sha-256 DTLS fingerprint out of an SDP, or "" when there is not one. */
export function fingerprintOf(sdp: string): string {
  return /^a=fingerprint:sha-256 (.+)$/im.exec(sdp)?.[1].trim() ?? "";
}

/**
 * Four characters both sides can read to each other.
 *
 * It catches a relay that has substituted its own offer and answer, and two
 * people who are in different rooms. It does not catch a stranger who guessed
 * the code, because then there is only one far side and both ends agree. And
 * it catches nothing at all unless the characters are actually read aloud.
 */
export async function safetyString(
  salt: Uint8Array,
  offerFingerprint: string,
  answerFingerprint: string,
  subtle?: SubtleLike,
): Promise<string> {
  const digest = await hashSlug(salt, `${offerFingerprint}|${answerFingerprint}`, subtle);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Number.parseInt(digest.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  }
  return out;
}

export type Frame =
  | { t: "salt"; v: string }
  | { t: "meta"; version: number; mode: Mode; count: number; bits?: number; k?: number }
  | { t: "part"; i: number; n: number; v: string }
  | { t: "done" };

function parseFrame(text: string): Frame {
  if (text.length > MAX_FRAME_CHARS + 256) {
    throw new OverlapProtocolError("a message larger than one frame");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OverlapProtocolError("a message that was not JSON");
  }
  if (typeof value !== "object" || value === null || typeof (value as Frame).t !== "string") {
    throw new OverlapProtocolError("a message with no kind on it");
  }
  const frame = value as Frame;
  if (!["salt", "meta", "part", "done"].includes(frame.t)) {
    throw new OverlapProtocolError(`a kind this version does not know: ${frame.t}`);
  }
  if (frame.t === "meta" && frame.version !== VERSION) {
    throw new OverlapProtocolError(`version ${String(frame.version)}, this page speaks ${VERSION}`);
  }
  if (frame.t === "salt" && typeof frame.v !== "string") {
    throw new OverlapProtocolError("a salt with no value");
  }
  if (frame.t === "meta") {
    if (
      (frame.mode !== "exact" && frame.mode !== "bloom") ||
      !Number.isInteger(frame.count) ||
      frame.count < 0 ||
      frame.count > MAX_CONNECTIONS
    ) {
      throw new OverlapProtocolError("invalid metadata");
    }
    if (
      frame.mode === "bloom" &&
      (!Number.isInteger(frame.bits) ||
        frame.bits === undefined ||
        frame.bits <= 0 ||
        frame.bits > bitsFor(MAX_CONNECTIONS) ||
        frame.bits % 8 !== 0 ||
        !Number.isInteger(frame.k) ||
        frame.k === undefined ||
        frame.k < 1 ||
        frame.k > 64)
    ) {
      throw new OverlapProtocolError("invalid filter metadata");
    }
  }
  if (
    frame.t === "part" &&
    (!Number.isInteger(frame.i) ||
      !Number.isInteger(frame.n) ||
      frame.n < 1 ||
      frame.n > MAX_PARTS ||
      frame.i < 0 ||
      frame.i >= frame.n ||
      typeof frame.v !== "string" ||
      frame.v.length > MAX_FRAME_CHARS)
  ) {
    throw new OverlapProtocolError("invalid part metadata");
  }
  return frame;
}

/** Splits a joined string into frames small enough for one message. */
function partsOf(payload: string): string[] {
  if (payload.length <= MAX_FRAME_CHARS) return [payload];
  const out: string[] = [];
  for (let i = 0; i < payload.length; i += MAX_FRAME_CHARS) {
    out.push(payload.slice(i, i + MAX_FRAME_CHARS));
  }
  return out;
}

export async function runExchange(input: ExchangeInput): Promise<ExchangeResult> {
  const { side, entries, channel, fingerprints } = input;
  const threshold = input.bloomThreshold ?? BLOOM_THRESHOLD;

  if (!fingerprints.offer || !fingerprints.answer) {
    throw new OverlapProtocolError("a missing connection fingerprint");
  }
  if (entries.length > MAX_CONNECTIONS) {
    throw new OverlapProtocolError("too many connections");
  }

  const inbox: Frame[] = [];
  let deliver: (() => void) | null = null;
  let failure: Error | null = null;

  channel.onMessage((text) => {
    try {
      const frame = parseFrame(text);
      if (inbox.length >= MAX_INBOX_FRAMES) {
        failure = new OverlapProtocolError("too many peer messages waiting");
      } else {
        inbox.push(frame);
      }
    } catch (error) {
      failure = error instanceof Error ? error : new OverlapProtocolError("an unreadable message");
    }
    deliver?.();
  });

  /**
   * The next frame of one kind, out of the inbox or whenever it lands.
   *
   * `deliver` is cleared the moment a wait settles. Leaving a settled pump
   * wired up means the next message re-runs it, and a re-run splices a frame
   * out of the inbox and throws it away, which shows up much later as a
   * handshake that hangs on a message that did arrive.
   */
  const next = <T extends Frame["t"]>(kind: T): Promise<Extract<Frame, { t: T }>> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        deliver = null;
        reject(new OverlapProtocolError(`timed out waiting for ${kind}`));
      }, input.receiveTimeoutMs ?? FRAME_WAIT_MS);
      const pump = () => {
        if (settled) return;
        if (failure) {
          settled = true;
          deliver = null;
          clearTimeout(timer);
          reject(failure);
          return;
        }
        const at = inbox.findIndex((f) => f.t === kind);
        if (at === -1) {
          deliver = pump;
          return;
        }
        settled = true;
        deliver = null;
        clearTimeout(timer);
        resolve(inbox.splice(at, 1)[0] as Extract<Frame, { t: T }>);
      };
      pump();
    });

  // 1. The salt. One side makes it, the other waits for it.
  input.onStage?.("waiting-for-salt");
  let salt: Uint8Array;
  if (side === "creator") {
    salt = newSalt(input.random);
    channel.send(JSON.stringify({ t: "salt", v: encodeSalt(salt) }));
  } else {
    salt = decodeSalt((await next("salt")).v);
  }

  // 2. Hash our own list, once, keeping the way back from a hash to its row.
  input.onStage?.("hashing");
  const byHash = new Map<string, Entry>();
  const bySlug = new Map<string, Entry>();
  for (const entry of entries) bySlug.set(entry.slug, entry);
  const mine = await hashAll(
    salt,
    entries.map((e) => e.slug),
    {
      subtle: input.subtle,
      onProgress: input.onProgress,
      onEach: (slug, hash) => {
        const entry = bySlug.get(slug);
        if (entry && !byHash.has(hash)) byHash.set(hash, entry);
      },
    },
  );

  // 3. Send it, exactly or as a filter.
  input.onStage?.("sending");
  const mode: Mode = mine.length > threshold ? "bloom" : "exact";
  const filter = mode === "bloom" ? buildFilter(mine) : null;
  const payload = filter ? encodeFilter(filter) : mine.join(",");
  const parts = partsOf(payload);
  channel.send(
    JSON.stringify({
      t: "meta",
      version: VERSION,
      mode,
      count: mine.length,
      ...(filter ? { bits: filter.bits.length * 8, k: filter.k } : {}),
    }),
  );
  parts.forEach((v, i) => channel.send(JSON.stringify({ t: "part", i, n: parts.length, v })));
  channel.send(JSON.stringify({ t: "done" }));

  // 4. Take theirs. The part count comes off the first part that lands, and
  // every side sends at least one, even for an empty list.
  input.onStage?.("receiving");
  const meta = await next("meta");
  const chunks: string[] = [];
  let expected = -1;
  let have = 0;
  while (expected === -1 || have < expected) {
    const part = await next("part");
    if (expected === -1) expected = part.n;
    else if (part.n !== expected) {
      throw new OverlapProtocolError("part totals that disagree");
    }
    if (chunks[part.i] !== undefined) throw new OverlapProtocolError("a duplicate part");
    chunks[part.i] = part.v;
    have += 1;
  }
  await next("done");
  const theirPayload = chunks.join("");

  let shared: Entry[];
  let falsePositives: number | null = null;
  if (meta.mode === "bloom") {
    if (typeof meta.bits !== "number" || typeof meta.k !== "number") {
      throw new OverlapProtocolError("a filter with no size on it");
    }
    const theirs: BloomFilter = decodeFilter(theirPayload, meta.bits, meta.k, meta.count);
    shared = mine.filter((h) => testFilter(theirs, h)).map((h) => byHash.get(h)!);
    falsePositives = expectedWrongNames(theirs, mine.length);
  } else {
    const theirs = new Set(theirPayload === "" ? [] : theirPayload.split(","));
    shared = mine.filter((h) => theirs.has(h)).map((h) => byHash.get(h)!);
  }

  input.onStage?.("done");
  return {
    shared: shared.filter(Boolean).sort((a, b) => a.label.localeCompare(b.label)),
    mine: mine.length,
    theirs: meta.count,
    mode,
    theirMode: meta.mode,
    falsePositives,
    safety: await safetyString(salt, fingerprints.offer, fingerprints.answer, input.subtle),
  };
}
