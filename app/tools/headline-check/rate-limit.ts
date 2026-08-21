/**
 * A token bucket per IP address, held in a module variable.
 *
 * **Say what this is: a courtesy limit, not a security control.** It lives in
 * one process's memory, so it empties on every cold start and every instance
 * gets its own copy. On serverless that means somebody who actually wants to
 * hammer this endpoint only has to arrive often enough to keep landing on fresh
 * instances, and they will beat it without trying. It is here to stop an
 * accidental loop and a bored person with a keyboard, and it stops nothing
 * else.
 *
 * That is the same reasoning `lib/contact-server.ts` uses to justify having no
 * limiter at all, and the difference is what the endpoint costs when abused.
 * The contact form spends somebody else's send quota, which has its own ceiling
 * and degrades into a visible failure. This one makes the server perform an
 * outbound fetch on demand, so the sensible floor is higher than nothing.
 *
 * If it ever needs closing properly the answer is a shared store or Vercel
 * BotID, not a bigger number in this file.
 */

export const BUCKET_SIZE = 6;
/** One token back every ten seconds, so a steady six a minute is fine. */
export const REFILL_MS = 10_000;
/** Above this many tracked addresses, the stale ones are dropped. */
const MAX_TRACKED = 5000;

type Bucket = { tokens: number; updated: number };

const buckets = new Map<string, Bucket>();

/**
 * Takes one token for `key`, or reports that there was none to take.
 *
 * `now` is a parameter so the behaviour is drivable without waiting ten
 * seconds for a clock.
 */
export function takeToken(key: string, now: number = Date.now()): boolean {
  if (buckets.size > MAX_TRACKED) {
    // A full bucket is an address that has finished, so dropping it costs
    // nothing but the memory it was holding.
    for (const [id, bucket] of buckets) {
      if (now - bucket.updated > BUCKET_SIZE * REFILL_MS) buckets.delete(id);
    }
    if (buckets.size > MAX_TRACKED) buckets.clear();
  }

  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: BUCKET_SIZE, updated: now };
  if (existing) {
    const refill = Math.floor((now - existing.updated) / REFILL_MS);
    if (refill > 0) {
      bucket.tokens = Math.min(BUCKET_SIZE, existing.tokens + refill);
      bucket.updated = existing.updated + refill * REFILL_MS;
    }
  }

  if (bucket.tokens <= 0) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}
