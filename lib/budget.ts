import { createHmac } from "node:crypto";
import { StoreUnavailableError } from "./store/errors";
import { getRedis } from "./store/redis";

/**
 * Budgets: how many times a thing may happen in a window, agreed on by every
 * replica.
 *
 * Replaces the token bucket that lived in
 * `app/tools/headline-check/rate-limit.ts` until 2026-09-03. That one sat in a
 * module `Map`, so every serverless instance kept its own copy and anybody
 * who arrived often enough to land on fresh instances beat it without trying.
 * This one counts in Upstash Redis, so the fourth call of a budget of three
 * is refused whichever instance answers it. `lib/budget.integration.test.ts`
 * proves that against the real database, from two module instances.
 *
 * ## Shape
 *
 * A budget is a fixed window that starts on the first hit. `SET key 0 EX
 * window NX` creates the key with its TTL only if it does not exist, then
 * `INCR` counts; both in one transaction, so an allowed call costs two Redis
 * commands and not three, because 500,000 commands a month is the meter this
 * site lives under. A refused call spends one more (`PTTL`) to say when the
 * counter resets, and refusals are the rare path.
 *
 * ## Three scopes
 *
 * `ip` for one visitor, `target` for one thing being fetched or rendered,
 * `global` for everyone together. A hosted tool takes all three, in that
 * order, so a refused visitor never spends the target or global count.
 *
 * ## The fallback, and where it is refused
 *
 * Outside production, no Redis means an in-memory `Map` with the same window
 * semantics, so `npm run dev` and `npm test` work on a laptop with no store.
 * In production, no Redis throws `StoreUnavailableError`. It never falls back
 * to unlimited and never falls back quietly: the design's rule is that a
 * missing store fails loudly rather than degrading.
 *
 * ## The address is never stored
 *
 * `budgetKeyForIp` authenticates the visitor's address and UTC date with a
 * server-only secret, so the key changes daily and cannot be rebuilt from the
 * public date plus an IPv4 dictionary. That is the whole of the site's
 * server-side memory of a visitor, and it expires with the window.
 *
 * Preview and production deployments share one database and one key space
 * (the key does not carry the environment), so a preview test spends the
 * same counters production does. Recorded in the programme ledger.
 */

export type BudgetScope = "ip" | "target" | "global";

export type BudgetRequest = {
  tool: string;
  scope: BudgetScope;
  key: string;
  limit: number;
  windowSec: number;
};

export type BudgetResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: 0; retryAfterSec: number; reason: string };

/** Above this many tracked windows, the in-memory fallback drops expired ones. */
export const MAX_TRACKED = 5000;

export function budgetKey(req: BudgetRequest): string {
  return `budget:${req.tool}:${req.scope}:${req.key}`;
}

/* ── the sentence ────────────────────────────────────────────────────────── */

/**
 * Only the three windows a person would name get a name. Anything else is
 * said in seconds, because "this minute" for a two-minute window is a lie
 * the visitor can catch.
 */
function describeWindow(windowSec: number): string {
  if (windowSec >= 86_400) return "today";
  if (windowSec === 3_600) return "this hour";
  if (windowSec === 60) return "this minute";
  return `these ${windowSec} seconds`;
}

/**
 * Rounded **up** to the next whole unit, so the sentence never promises a
 * reset before the real one: 90 seconds reads "2 minutes", 5,400 "2 hours".
 */
function describeWait(seconds: number): string {
  if (seconds >= 3_600) {
    const hours = Math.ceil(seconds / 3_600);
    return hours === 1 ? "an hour" : `${hours} hours`;
  }
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? "a minute" : `${minutes} minutes`;
  }
  if (seconds === 1) return "a second";
  return `${seconds} seconds`;
}

/**
 * The sentence a page prints when a budget refuses. A refusal is never a
 * spinner and never a bare "try later": it says who used what, and when it
 * comes back.
 */
export function refusalReason(scope: BudgetScope, limit: number, windowSec: number, retryAfterSec: number): string {
  const runs = limit === 1 ? "run" : "runs";
  const subject =
    scope === "ip"
      ? "This address has used its"
      : scope === "target"
        ? "That site has had its"
        : "Everyone together has used the";
  return `${subject} ${limit} ${runs} for ${describeWindow(windowSec)}; the counter resets in ${describeWait(retryAfterSec)}.`;
}

function decide(req: BudgetRequest, count: number, retryAfterSec: number): BudgetResult {
  if (count <= req.limit) return { ok: true, remaining: req.limit - count };
  return {
    ok: false,
    remaining: 0,
    retryAfterSec,
    reason: refusalReason(req.scope, req.limit, req.windowSec, retryAfterSec),
  };
}

/* ── Redis ───────────────────────────────────────────────────────────────── */

type BudgetTransaction = {
  set(key: string, value: number, options: { ex: number; nx: true }): BudgetTransaction;
  incr(key: string): BudgetTransaction;
  exec(): Promise<unknown[]>;
};

/** The four things this module needs from a Redis client. `Redis` from `@upstash/redis` satisfies it. */
export type BudgetRedis = {
  multi(): BudgetTransaction;
  pttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

async function secondsUntilReset(redis: BudgetRedis, key: string, windowSec: number): Promise<number> {
  let ttlMs = await redis.pttl(key);
  if (ttlMs < 0) {
    // -1 is a key with no expiry, -2 a key that is gone. Neither should
    // happen, and a counter that never resets is a permanent lockout, so it
    // is given the window rather than trusted.
    await redis.expire(key, windowSec);
    ttlMs = windowSec * 1000;
  }
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

export async function takeBudgetOnRedis(redis: BudgetRedis, req: BudgetRequest): Promise<BudgetResult> {
  const key = budgetKey(req);
  const results = await redis.multi().set(key, 0, { ex: req.windowSec, nx: true }).incr(key).exec();
  const count = Number(results[1]);
  const retryAfterSec = count > req.limit ? await secondsUntilReset(redis, key, req.windowSec) : 0;
  return decide(req, count, retryAfterSec);
}

/* ── memory ──────────────────────────────────────────────────────────────── */

type MemoryWindow = { count: number; expiresAt: number };

const memory = new Map<string, MemoryWindow>();

/**
 * The same window, in this process only. `now` is a parameter so a test can
 * move the clock, exactly as the old token bucket did.
 */
export function takeBudgetInMemory(req: BudgetRequest, now: number): BudgetResult {
  if (memory.size > MAX_TRACKED) {
    for (const [key, window] of memory) {
      if (window.expiresAt <= now) memory.delete(key);
    }
    if (memory.size > MAX_TRACKED) memory.clear();
  }

  const key = budgetKey(req);
  const existing = memory.get(key);
  const window: MemoryWindow =
    existing && existing.expiresAt > now ? existing : { count: 0, expiresAt: now + req.windowSec * 1000 };
  window.count += 1;
  memory.set(key, window);

  return decide(req, window.count, Math.max(1, Math.ceil((window.expiresAt - now) / 1000)));
}

/* ── the router ──────────────────────────────────────────────────────────── */

/**
 * Take one unit of budget. Redis when it is configured; memory outside
 * production when it is not; a throw in production when it is not.
 *
 * `now` drives the memory path only. Redis keeps its own clock.
 */
export async function takeBudget(req: BudgetRequest, now: number = Date.now()): Promise<BudgetResult> {
  let redis: BudgetRedis;
  try {
    redis = getRedis();
  } catch (error) {
    if (error instanceof StoreUnavailableError && process.env.NODE_ENV !== "production") {
      return takeBudgetInMemory(req, now);
    }
    throw error;
  }
  return takeBudgetOnRedis(redis, req);
}

/* ── the visitor ─────────────────────────────────────────────────────────── */

/**
 * A key for the visitor's address that is not the visitor's address.
 *
 * `x-real-ip` first, and the **last** entry of `x-forwarded-for` after it.
 * That header accumulates left to right, so the leftmost value is whatever
 * the client sent and the rightmost is what the nearest proxy appended;
 * keying on the leftmost hands every caller a fresh budget for the price of
 * one header. Vercel overwrites the header rather than appending, so on this
 * host both ends are the same value; that is a fact about the platform, not a
 * property of the code.
 *
 * Then `HMAC-SHA256(BUDGET_HASH_SECRET, ip + ":" + yyyy-mm-dd)`, first
 * sixteen hex characters. The secret prevents an offline IPv4 dictionary;
 * the date makes two days' keys unlinkable. A missing secret fails closed and
 * names only the variable, never the address or the missing value.
 * `Pick<Headers, "get">` rather than `Headers` lets Next's `ReadonlyHeaders`
 * pass without a cast; every `Headers` satisfies it.
 */
export function budgetKeyForIp(headers: Pick<Headers, "get">): string {
  const secret = process.env.BUDGET_HASH_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new StoreUnavailableError("redis", "BUDGET_HASH_SECRET");
  }
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const chain = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = headers.get("x-real-ip")?.trim() || chain[chain.length - 1] || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${ip}:${day}`).digest("hex").slice(0, 16);
}
