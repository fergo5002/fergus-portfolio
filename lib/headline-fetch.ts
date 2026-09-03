/**
 * Fetches a page on behalf of a stranger, which is a different job from
 * fetching a page.
 *
 * `/tools/headline-check` takes a URL from anybody on the internet and asks the
 * server to go and get it. That is a server-side request forgery surface by
 * construction: the interesting target is never the visitor's own site, it is
 * `http://169.254.169.254/latest/meta-data/`, or a database admin panel bound
 * to loopback, or something on the same private network as the box doing the
 * fetching. So the guard is the feature and the fetch is the easy part.
 *
 * **What is checked, and every one of them on every hop**, lives in
 * `lib/fence.ts` since 2026-09-03: scheme, credentials, local names, private
 * or reserved address literals, ports other than 80 and 443, and every DNS
 * answer rather than the first. This module adds what is specific to fetching
 * a page: redirects are read, not followed (`redirect: "manual"`), capped at
 * three hops, and the fence runs again on each `Location` before it is
 * fetched.
 *
 * **The limit, stated plainly rather than left for somebody to find.** This
 * resolves the hostname, decides, and then hands the hostname to `fetch`, which
 * resolves it again. A name server that answers with a public address the first
 * time and a private one the second (DNS rebinding) beats this check, and
 * nothing in this file could stop it. Closing that properly means pinning the
 * resolved address for the connection itself, through a custom agent with a
 * `lookup` hook. That is the right fix and it is not done here.
 *
 * The "it is only a personal site" argument for leaving it is wrong and was
 * removed on 2026-08-21 after review pushed back. The thing worth reaching over
 * an SSRF is not anything of Fergus's, it is the host's own instance metadata,
 * and that is the same target whoever owns the domain.
 *
 * What does bound it, and it is worth knowing the actual blast radius rather
 * than only the hole: **the content type is checked before a single byte of the
 * body is read.** A rebind that lands on a metadata endpoint gets `text/plain`
 * back, fails that gate, and the response is discarded unread, so there is no
 * path from a successful rebind to the caller seeing what was there. That is a
 * second layer, not a fix, and it protects the data rather than the request.
 *
 * Every dependency is injectable for the same reason `lib/contact-server.ts`
 * does it: the paths worth testing here are the ones a real request would have
 * to be malicious to reach.
 *
 * Nothing throws. The caller gets a typed result, always, because an unhandled
 * rejection inside a server action renders the error boundary and takes the
 * page away.
 */

import { checkParsedUrl, normaliseUrl, resolveAndCheck, type FenceCode, type Resolver } from "./fence";

/**
 * Kept for the existing test contract and for any reader who learnt these
 * names here. The fence is their home now; `lib/fence.test.ts` is where the
 * address tables live and grow.
 */
export { isPrivateAddress as isBlockedAddress, normaliseUrl } from "./fence";
export type { Resolved } from "./fence";

export const FETCH_TIMEOUT_MS = 8000;
/** Two megabytes. Long enough for any real document, short enough to bound us. */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (compatible; HeadlineCheck/1.0; +https://fergusoreilly.dev/tools/headline-check)";

export type FetchReason =
  | "invalid-url"
  | "blocked-scheme"
  | "private-address"
  | "blocked-port"
  | "blocked-credentials"
  | "dns"
  | "too-many-redirects"
  | "timeout"
  | "not-html"
  | "too-large"
  | "http-error"
  | "network";

export type FetchedPage =
  | {
      ok: true;
      /** Exactly what the visitor typed. */
      url: string;
      /** Where we ended up after any redirects. */
      finalUrl: string;
      html: string;
      status: number;
      redirects: number;
    }
  | { ok: false; url: string; reason: FetchReason; detail: string };

export type FetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: Resolver;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const MESSAGES: Record<FetchReason, string> = {
  "invalid-url": "That is not a URL I can read. Try something like example.com/page.",
  "blocked-scheme": "I can only fetch http and https addresses.",
  "private-address":
    "That address is on a private, loopback or reserved network, so this server will not fetch it.",
  "blocked-port": "I only fetch from ports 80 and 443.",
  "blocked-credentials": "I will not fetch a URL that carries a username or password.",
  dns: "That hostname does not resolve to anything I can reach.",
  "too-many-redirects": `That URL redirects more than ${MAX_REDIRECTS} times, so I stopped following it.`,
  timeout: `The page took longer than ${FETCH_TIMEOUT_MS / 1000} seconds to answer, so I gave up.`,
  "not-html": "That URL did not return HTML, so there is no heading in it to read.",
  "too-large": `That page is bigger than ${MAX_BYTES / (1024 * 1024)}MB, which is more than I will read.`,
  "http-error": "The server answered, but not with a page.",
  network: "I could not reach that server at all.",
};

function fail(url: string, reason: FetchReason, detail?: string): FetchedPage {
  return { ok: false, url, reason, detail: detail ?? MESSAGES[reason] };
}

/* ── the fetch ───────────────────────────────────────────────────────────── */

/** Decodes the body, honouring a charset the server declared. */
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const declared = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(declared || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Reads at most `maxBytes`, and stops pulling the moment it goes over. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text);
    return bytes.byteLength > maxBytes ? null : bytes;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** How the fence's codes read as this module's reasons. */
const FENCE_TO_REASON: Record<FenceCode, FetchReason> = {
  "invalid-url": "invalid-url",
  scheme: "blocked-scheme",
  credentials: "blocked-credentials",
  "blocked-host": "private-address",
  port: "blocked-port",
  "private-address": "private-address",
  dns: "dns",
};

/** The fence, run on the URL and again on every redirect. */
async function guard(raw: string, target: URL, lookupImpl?: Resolver): Promise<FetchedPage | null> {
  const syntax = checkParsedUrl(target);
  if (!syntax.ok) return fail(raw, FENCE_TO_REASON[syntax.code], syntax.reason);
  const resolved = await resolveAndCheck(target, lookupImpl);
  if (!resolved.ok) return fail(raw, FENCE_TO_REASON[resolved.code], resolved.reason);
  return null;
}

export async function fetchPage(rawUrl: string, deps: FetchDeps = {}): Promise<FetchedPage> {
  const send = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? MAX_BYTES;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const raw = typeof rawUrl === "string" ? rawUrl.trim() : "";

  const first = normaliseUrl(raw);
  if (!first) return fail(raw, "invalid-url");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target = first;
    let redirects = 0;

    for (;;) {
      const refusal = await guard(raw, target, deps.lookupImpl);
      if (refusal) return refusal;

      let response: Response;
      try {
        response = await send(target.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          // No cookies and no credentials: this is a fetch on behalf of a
          // stranger and it must never carry anything of ours.
          credentials: "omit",
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en",
          },
        });
      } catch {
        return controller.signal.aborted ? fail(raw, "timeout") : fail(raw, "network");
      }

      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return fail(
            raw,
            "http-error",
            `${target.host} answered ${response.status} but sent nowhere to go.`,
          );
        }
        if (redirects >= maxRedirects) return fail(raw, "too-many-redirects");

        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          return fail(raw, "invalid-url", `${target.host} redirected somewhere I cannot read.`);
        }
        redirects += 1;
        target = next;
        // Round again, which re-runs the guard on the new address. That is the
        // whole reason redirects are read here rather than followed by fetch.
        continue;
      }

      if (!response.ok) {
        return fail(raw, "http-error", `${target.host} responded ${response.status}.`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const type = contentType.split(";")[0].trim().toLowerCase();
      if (type !== "text/html" && type !== "application/xhtml+xml") {
        return fail(
          raw,
          "not-html",
          `That URL returned ${type || "no content type"}, not HTML, so there is no heading in it.`,
        );
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await readCapped(response, maxBytes);
      } catch {
        return controller.signal.aborted ? fail(raw, "timeout") : fail(raw, "network");
      }
      if (!bytes) return fail(raw, "too-large");

      return {
        ok: true,
        url: raw,
        finalUrl: target.toString(),
        html: decodeBody(bytes, contentType),
        status: response.status,
        redirects,
      };
    }
  } catch {
    // Belt and braces. Nothing above should reach here, and the one thing this
    // module promises is that it never throws at the caller.
    return controller.signal.aborted ? fail(raw, "timeout") : fail(raw, "network");
  } finally {
    clearTimeout(timer);
  }
}
