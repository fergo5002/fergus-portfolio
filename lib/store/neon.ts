import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { StoreUnavailableError } from "./errors";

/**
 * Neon Postgres over HTTP, built on first use and never at import.
 *
 * `neon(url)` is the HTTP driver: one request per query, no connection to
 * keep alive, no pool to drain when the function freezes. That is the shape a
 * serverless function wants and the reason `DATABASE_URL` alone is enough.
 * There is deliberately no `Pool` and no WebSocket transport here. A
 * transaction that spans requests is not something this site does, and the
 * tools that read Neon (the census, Tide's cache) read through ISR so the
 * compute stays asleep between rebuilds.
 *
 * The return type is the tagged template: rows come back as plain objects.
 * Use it as a tag, never by building a string, because the tag is what turns
 * interpolations into parameters.
 *
 * Built lazily for the same reason as `getRedis`: a client built at import
 * time fails `next build` on any machine without the variable, and the parity
 * image has none on purpose.
 */

export const DATABASE_URL_VAR = "DATABASE_URL";

let cached: { url: string; sql: NeonQueryFunction<false, false> } | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env[DATABASE_URL_VAR];
  if (!url) throw new StoreUnavailableError("neon", DATABASE_URL_VAR);

  if (cached && cached.url === url) return cached.sql;
  const sql = neon(url);
  cached = { url, sql };
  return sql;
}
