/**
 * The only file in this tool that calls `fetch`.
 *
 * That is a design constraint rather than an accident: `safety.test.ts` greps
 * the whole tool for `fetch(` and fails if it appears anywhere else, so
 * "nothing but hashes leaves the tab" can be checked by reading one short
 * file. The `fetchImpl` argument is what lets a test replace it with a
 * recorder and search the traffic.
 *
 * The polling arithmetic is a cost decision, not a feel decision. A poll is
 * three Redis commands, and at four seconds across a sixty-second window a
 * completed handshake costs about sixty commands. That is what keeps the
 * relay inside the free tier at twenty rooms a day.
 */

import { isCode } from "./code";
import { validSdp } from "../../relay";

export const POLL_INTERVAL_MS = 4_000;
export const POLL_WINDOW_MS = 60_000;

export type RelayFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The default, and the reason every function below takes the implementation
 * rather than reaching for the global itself. The island used to pass
 * `(u, i) => fetch(u, i)` at four call sites, which put `fetch(` in the
 * component and broke the one-door-out grep for a real reason: a second door
 * is a second door whoever opened it.
 */
const platformFetch: RelayFetch = (input, init) => fetch(input, init);

/**
 * Deliberately not the same union as `RelayError` in `lib/relay.ts`. This one
 * adds `gave-up`, which no server ever sends, and drops `bad-request`, which
 * the client cannot cause. Making them one type would put a server-only case
 * into a client switch.
 */
export type RelayFailure = {
  ok: false;
  error:
    | "relay-unavailable"
    | "budget"
    | "no-room"
    | "already-joined"
    | "bad-code"
    | "gave-up"
    | "failed";
  message: string;
  retryAfterSec?: number;
};

const JSON_POST = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const KNOWN = ["relay-unavailable", "budget", "no-room", "already-joined", "bad-code"] as const;
const malformed = (): RelayFailure => ({ ok: false, error: "failed", message: "" });

async function call(
  fetchImpl: RelayFetch,
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; body: Record<string, unknown> } | RelayFailure> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: "failed", message: "" };
  }
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "failed", message: "" };
  }
  if (response.ok) return { ok: true, body };
  const error = typeof body.error === "string" ? body.error : "failed";
  return {
    ok: false,
    error: (KNOWN as readonly string[]).includes(error)
      ? (error as RelayFailure["error"])
      : "failed",
    message: typeof body.message === "string" ? body.message : "",
    ...(typeof body.retryAfterSec === "number" ? { retryAfterSec: body.retryAfterSec } : {}),
  };
}

export async function createRoom(
  offer: string,
  fetchImpl: RelayFetch = platformFetch,
): Promise<{ ok: true; code: string; ttlSec: number } | RelayFailure> {
  const result = await call(fetchImpl, "/api/relay", JSON_POST({ offer }));
  if (!result.ok) return result;
  if (!isCode(result.body.code) || !Number.isInteger(result.body.ttlSec) || Number(result.body.ttlSec) <= 0) {
    return malformed();
  }
  return { ok: true, code: result.body.code, ttlSec: Number(result.body.ttlSec) };
}

export async function fetchOffer(
  code: string,
  fetchImpl: RelayFetch = platformFetch,
): Promise<{ ok: true; offer: string } | RelayFailure> {
  const result = await call(fetchImpl, `/api/relay?code=${code}`);
  if (!result.ok) return result;
  return validSdp(result.body.offer) ? { ok: true, offer: result.body.offer } : malformed();
}

export async function sendAnswer(
  code: string,
  answer: string,
  fetchImpl: RelayFetch = platformFetch,
): Promise<{ ok: true } | RelayFailure> {
  const result = await call(fetchImpl, "/api/relay/answer", JSON_POST({ code, answer }));
  if (!result.ok) return result;
  return result.body.ok === true ? { ok: true } : malformed();
}

export type PollOptions = {
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  onTick?: (secondsLeft: number) => void;
};

export async function pollForAnswer(
  code: string,
  fetchImpl: RelayFetch = platformFetch,
  options: PollOptions = {},
): Promise<{ ok: true; answer: string } | RelayFailure> {
  const wait = options.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const started = now();

  for (;;) {
    const result = await call(fetchImpl, `/api/relay/answer?code=${code}`);
    if (!result.ok) return result;
    if (result.body.answer !== null) {
      return validSdp(result.body.answer) ? { ok: true, answer: result.body.answer } : malformed();
    }
    if (now() - started >= POLL_WINDOW_MS) return { ok: false, error: "gave-up", message: "" };
    options.onTick?.(Math.max(0, Math.round((POLL_WINDOW_MS - (now() - started)) / 1000)));
    await wait(POLL_INTERVAL_MS);
  }
}
