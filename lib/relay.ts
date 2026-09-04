/**
 * The relay's pure half.
 *
 * The relay does one thing: it holds an SDP offer and an SDP answer under a
 * six-character code for ten minutes so two browsers can find each other. It
 * never sees a hash, a name or a file, and there is nothing else in the room.
 *
 * Two keys per room, which is the "at most two blobs" the programme design
 * asks for. The offer key carries the TTL; the answer key gets its own, set to
 * whatever is left, so an answer can never outlive its room.
 *
 * Frozen for G1 (Phosphor Pong), which matches players through the same rooms.
 */

export const ROOM_TTL_SEC = 600;
/** An SDP with a full candidate list runs to a few kilobytes. This is generous. */
export const MAX_SDP_BYTES = 8 * 1024;

export function offerKey(code: string): string {
  return `relay:${code}`;
}

export function answerKey(code: string): string {
  return `relay:${code}:a`;
}

const encoder = new TextEncoder();

/**
 * Bytes, not characters. A length check on code units lets a blob of astral
 * characters through at three times the size it claims.
 */
export function validSdp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("v=0")) return false;
  return encoder.encode(value).length <= MAX_SDP_BYTES;
}

export type RelayError =
  | "bad-request"
  | "bad-code"
  | "no-room"
  | "already-joined"
  | "budget"
  | "relay-unavailable"
  | "failed";

export type RelayReply = { status: number; body: Record<string, unknown> };

const STATUS: Record<RelayError, number> = {
  "bad-request": 400,
  "bad-code": 400,
  "no-room": 404,
  "already-joined": 409,
  budget: 429,
  "relay-unavailable": 503,
  failed: 500,
};

export function errorReply(error: RelayError, message: string, retryAfterSec?: number): RelayReply {
  return {
    status: STATUS[error],
    body: retryAfterSec === undefined ? { error, message } : { error, message, retryAfterSec },
  };
}
