import { Redis } from "@upstash/redis";
import { StoreUnavailableError } from "./errors";

/**
 * Upstash Redis over REST, built on first use and never at import.
 *
 * ## Why REST
 *
 * A Vercel function is a process that freezes between requests. A TCP client
 * that keeps a socket open across that freeze fails on the first request
 * after it, and the failure looks like a random timeout. `@upstash/redis` is
 * one HTTPS request per command, or per pipeline, which is the right shape
 * for a function that lives for a hundred milliseconds. It is also metered
 * the same way in the Upstash console as it is sent from here, so the command
 * count on the usage page is the command count this code produced.
 *
 * ## Two names for the same two variables
 *
 * The Vercel Marketplace integration writes `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN`, a naming inherited from Vercel KV. Upstash's console
 * and every one of its examples use `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN`, which is what `.env.example` documents and what
 * the programme's frozen interface names. This reads the Upstash pair first
 * and the KV pair second, so a hand-provisioned database and an
 * integration-provisioned one both work, and the error names the Upstash
 * variable because that is the one a reader will find documented.
 *
 * ## Nothing at import time
 *
 * `getRedis()` is a function rather than a module-level constant because a
 * module that builds its client on load throws during `next build` on any
 * machine without the store, and that turns "the parity image carries no
 * secrets" from a safety property into a build failure. The test pins it.
 */

export const REDIS_URL_VARS = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"] as const;
export const REDIS_TOKEN_VARS = ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"] as const;

function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

let cached: { url: string; token: string; client: Redis } | null = null;

export function getRedis(): Redis {
  const url = firstSet(REDIS_URL_VARS);
  if (!url) throw new StoreUnavailableError("redis", REDIS_URL_VARS[0]);
  const token = firstSet(REDIS_TOKEN_VARS);
  if (!token) throw new StoreUnavailableError("redis", REDIS_TOKEN_VARS[0]);

  if (cached && cached.url === url && cached.token === token) return cached.client;
  const client = new Redis({ url, token });
  cached = { url, token, client };
  return client;
}
