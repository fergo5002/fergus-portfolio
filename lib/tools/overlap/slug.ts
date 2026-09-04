import type { SlugResult } from "./types";

/**
 * A LinkedIn profile URL, or something that once was one, becomes a slug two
 * browsers can agree on.
 *
 * The order below is the whole module. Each step is here because a different
 * one would be wrong:
 *
 *  1. Trim, and lose a byte order mark and non-breaking spaces, which is what
 *     a CSV cell brings with it.
 *  2. Cut the fragment then the query **on the raw text**, before decoding.
 *     A `%23` in a path decodes to a literal `#`, and decoding first would let
 *     that cut a slug in half.
 *  3. Strip the scheme, then the host, and require the host to be linkedin.com
 *     or a subdomain of it. A country subdomain (`ie.`, `de.`, `uk.`) is how a
 *     locale reaches an export and it is the same profile.
 *  4. Refuse `/pub/`. Old public profile links are a different identifier
 *     space and mapping one onto an `/in/` slug would invent matches.
 *  5. Strip `in/`, then trailing slashes. Anything left with a slash in it is
 *     a sub-page rather than a profile.
 *  6. Percent-decode, then normalise to NFC, then lowercase. Decoding before
 *     folding because `%C3%A1` and `%c3%a1` are the same byte; NFC because a
 *     composed accent and a decomposed one hash differently and are the same
 *     person.
 *
 * **The trailing suffix is never stripped.** `john-smith-1a2b3c4` and
 * `john-smith-9f8e7d6` are two people. Merging them would print a stranger as
 * a mutual connection, which is the worst thing this tool can do. The price is
 * that somebody who edited their profile URL between the two exports will not
 * match, and that is on the "can't see" list.
 */

/** linkedin.com, or any subdomain of it, and nothing that merely ends in it. */
const LINKEDIN_HOST = /^(?:[a-z0-9-]+\.)*linkedin\.com$/;

export function normaliseSlug(raw: string): SlugResult {
  let s = raw.replace(/\ufeff/g, "").replace(/\u00a0/g, " ").trim();
  if (s === "") return { ok: false, reason: "empty" };

  // 2. Fragment, then query, on the raw text.
  s = s.split("#", 1)[0];
  s = s.split("?", 1)[0];

  // 3. Scheme, then host.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/\//, "");
  const slash = s.indexOf("/");
  if (slash === -1) {
    if (s.toLowerCase().endsWith("linkedin.com")) return { ok: false, reason: "not-a-profile" };
  } else {
    const host = s.slice(0, slash).toLowerCase();
    if (host.includes(".")) {
      if (!LINKEDIN_HOST.test(host)) return { ok: false, reason: "not-a-profile" };
      s = s.slice(slash);
    }
  }

  s = s.replace(/^\/+/, "");
  // 4. and 5.
  if (/^pub(\/|$)/i.test(s)) return { ok: false, reason: "legacy-pub" };
  s = s.replace(/^in\//i, "");
  s = s.replace(/\/+$/, "");
  if (s === "" || s.includes("/")) return { ok: false, reason: "not-a-profile" };

  // 6. Decode, compose, fold. A lone `%` throws; the raw text still identifies
  // the same person on both sides, so the row is kept rather than dropped.
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep s as it stands */
  }
  s = s.normalize("NFC").toLowerCase();

  return s === "" ? { ok: false, reason: "empty" } : { ok: true, slug: s };
}
