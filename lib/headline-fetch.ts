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
 * **What is actually checked, in order, and every one of them on every hop:**
 *
 *  1. The scheme is `http:` or `https:` and nothing else.
 *  2. If the host is an IP literal, it is checked directly and the resolver is
 *     never consulted.
 *  3. Otherwise every address the resolver returns must be public. Every one,
 *     not the first: a host with one public and one private answer is still a
 *     way in.
 *  4. Redirects are read, not followed (`redirect: "manual"`), capped at three
 *     hops, and steps 1 to 3 run again on each `Location` before it is fetched.
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

import { lookup } from "node:dns/promises";

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

export type Resolved = { address: string; family: number };

export type FetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<Resolved[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

/* ── addresses ───────────────────────────────────────────────────────────── */

function parseIPv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** Eight 16-bit groups, or null. Handles `::` and a trailing dotted quad. */
function parseIPv6(address: string): number[] | null {
  if (!address.includes(":")) return null;
  let head = address;
  let tail4: number[] | null = null;

  const lastColon = head.lastIndexOf(":");
  const maybeV4 = head.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    tail4 = parseIPv4(maybeV4);
    if (!tail4) return null;
    head = head.slice(0, lastColon + 1) + "0";
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      out.push(Number.parseInt(piece, 16));
    }
    return out;
  };

  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!left || !right) return null;

  let groups: number[];
  if (halves.length === 2) {
    const gap = 8 - left.length - right.length - (tail4 ? 1 : 0);
    if (gap < 0) return null;
    groups = [...left, ...new Array<number>(gap).fill(0), ...right];
  } else {
    groups = [...left, ...right];
  }

  if (tail4) {
    // The placeholder group added above stands in for the two the quad fills.
    groups = groups.slice(0, groups.length - 1);
    groups.push((tail4[0] << 8) | tail4[1], (tail4[2] << 8) | tail4[3]);
  }

  return groups.length === 8 ? groups : null;
}

function blockedIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8, "this network", and 0.0.0.0 itself
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10, carrier NAT
  if (a === 127) return true; // 127.0.0.0/8, loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16, link local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && octets[1] === 0 && (octets[2] === 0 || octets[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15, benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, and 255.255.255.255
  return false;
}

/**
 * Whether an address is one this server must not be talked into reaching.
 *
 * **Fails closed.** Anything unparseable is blocked, because an address that
 * cannot be read is one that cannot be vouched for, and the two wrong answers
 * do not cost remotely the same.
 */
export function isBlockedAddress(address: string): boolean {
  const trimmed = address.trim().replace(/^\[|\]$/g, "");
  if (trimmed === "") return true;

  const v4 = parseIPv4(trimmed);
  if (v4) return blockedIPv4(v4);

  // A zone index (`fe80::1%eth0`) is not part of the address.
  const groups = parseIPv6(trimmed.split("%")[0]);
  if (!groups) return true;

  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7, unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10, link local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8, multicast

  const embedded = (): string =>
    [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");

  /*
    One rule for the whole of ::/96 and ::ffff:0:0/96, rather than a separate
    line each for `::` and `::1`.

    Those two are inside ::/96 and the v4 address they carry is 0.0.0.0 and
    0.0.0.1, both of which 0.0.0.0/8 already refuses. Writing them out again
    above would read as two more guards and behave as none: deleting either one
    changed nothing, which is how a line ends up being decoration.
  */
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isBlockedAddress(embedded());
  }
  // 64:ff9b::/96, the well-known NAT64 prefix.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isBlockedAddress(embedded());
  }

  return false;
}

/** True when the host is written as an address rather than as a name. */
function isAddressLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return parseIPv4(bare) !== null || bare.includes(":");
}

/* ── the URL ─────────────────────────────────────────────────────────────── */

/**
 * Reads what somebody typed into the box.
 *
 * `https://` is assumed only when there is no scheme at all, because everybody
 * types `example.com`. Prefixing something that already has one would turn
 * `javascript:alert(1)` into a fetchable host, which is the opposite of the job.
 */
export function normaliseUrl(raw: string): URL | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const MESSAGES: Record<FetchReason, string> = {
  "invalid-url": "That is not a URL I can read. Try something like example.com/page.",
  "blocked-scheme": "I can only fetch http and https addresses.",
  "private-address":
    "That address is on a private, loopback or reserved network, so this server will not fetch it.",
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

async function defaultLookup(hostname: string): Promise<Resolved[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

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

/** The scheme and address check, run on the URL and again on every redirect. */
async function guard(
  raw: string,
  target: URL,
  lookupImpl: (hostname: string) => Promise<Resolved[]>,
): Promise<FetchedPage | null> {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fail(raw, "blocked-scheme", `${target.protocol} is not a scheme I will fetch.`);
  }

  const hostname = target.hostname;
  if (hostname === "") return fail(raw, "invalid-url");

  if (isAddressLiteral(hostname)) {
    return isBlockedAddress(hostname)
      ? fail(raw, "private-address", `${hostname} ${MESSAGES["private-address"].slice(17)}`)
      : null;
  }

  // A resolver that throws and a resolver that answers with nothing are the
  // same fact, and giving each its own return meant neither could be shown to
  // matter: removing either one left the suite green.
  let answers: Resolved[] = [];
  try {
    answers = (await lookupImpl(hostname)) ?? [];
  } catch {
    answers = [];
  }
  if (answers.length === 0) return fail(raw, "dns", `${hostname} does not resolve.`);

  // Every answer, not the first. One private record among public ones is still
  // a route in, and checking only answers[0] is exactly how that gets missed.
  for (const answer of answers) {
    if (isBlockedAddress(answer.address)) {
      return fail(
        raw,
        "private-address",
        `${hostname} resolves to ${answer.address}, which is on a private, loopback or reserved network.`,
      );
    }
  }
  return null;
}

export async function fetchPage(rawUrl: string, deps: FetchDeps = {}): Promise<FetchedPage> {
  const send = deps.fetchImpl ?? fetch;
  const resolve = deps.lookupImpl ?? defaultLookup;
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
      const refusal = await guard(raw, target, resolve);
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
