/**
 * The fence: is this URL one this server may reach on a stranger's behalf?
 *
 * Lifted from `lib/headline-fetch.ts` on 2026-09-03 so every tool that takes
 * a URL from a visitor (headline-check today, On the glass and its browser
 * navigations next) refuses the same things for the same reasons. The
 * interesting target of a server-side request forgery is never the visitor's
 * own site; it is `http://169.254.169.254/latest/meta-data/`, a database
 * console bound to loopback, or something on the same private network as the
 * box doing the fetching. So the guard is the feature.
 *
 * Two entry points, split by cost:
 *
 *  - `checkUrl(input)` and `checkParsedUrl(url)` are synchronous and touch no
 *    network. Syntax, scheme, credentials, local names, address literals,
 *    ports. Run one of them before a budget is spent, so a URL that was never
 *    going to be fetched costs the visitor nothing.
 *  - `resolveAndCheck(url)` asks the resolver and refuses if **any** answer is
 *    private. Any, not the first: a host with one public and one private
 *    record is still a way in. The answers ride back on the verdict for a
 *    caller that can pin a connection to one of them.
 *
 * **The limit, stated plainly.** Resolving here and then handing the hostname
 * to `fetch`, which resolves again, is beatable by a name server that answers
 * public once and private the second time (DNS rebinding). Closing that means
 * pinning the resolved address on the connection itself, through an agent
 * with a `lookup` hook. It is not done here, and each caller's docblock says
 * what bounds it for that caller (the headline fetch: the content type is
 * checked before a byte of body is read).
 *
 * **Fails closed.** Anything unparseable is blocked, because an address that
 * cannot be read is one that cannot be vouched for, and the two wrong answers
 * do not cost remotely the same. The odd spellings of an address (decimal,
 * octal, hex) are refused here as unparseable and are also canonicalised by
 * the URL parser before they arrive, and the test asserts both.
 *
 * Nothing here throws. A verdict is a value.
 */

import { lookup } from "node:dns/promises";

export type FenceCode =
  | "invalid-url"
  | "scheme"
  | "credentials"
  | "blocked-host"
  | "port"
  | "private-address"
  | "dns";

export type FenceVerdict =
  | { ok: true; url: URL; addresses?: string[] }
  | { ok: false; code: FenceCode; reason: string };

export type Resolved = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Resolved[]>;

/** The sentence every private-address refusal ends with. */
export const PRIVATE_ADDRESS_REASON =
  "is on a private, loopback or reserved network, so this server will not fetch it.";

function refuse(code: FenceCode, reason: string): FenceVerdict {
  return { ok: false, code, reason };
}

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
export function isPrivateAddress(address: string): boolean {
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
    return isPrivateAddress(embedded());
  }
  // 64:ff9b::/96, the well-known NAT64 prefix.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPrivateAddress(embedded());
  }

  return false;
}

/** True when the host is written as an address rather than as a name. */
function isAddressLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return parseIPv4(bare) !== null || bare.includes(":");
}

/* ── names ───────────────────────────────────────────────────────────────── */

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal"];

/**
 * Names that are never on the internet. `localhost` and anything under it,
 * mDNS `.local`, and `.internal`, which cloud providers use for their own
 * metadata and service names. These would mostly be caught at resolution
 * time anyway; refusing them by name is a second layer that costs nothing.
 */
export function isLocalName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, "");
  return name === "localhost" || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix));
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

/**
 * The synchronous half, on a URL that has already been parsed.
 *
 * Order is deliberate and the test pins it: the address literal is checked
 * before the port, so `127.0.0.1:3000` is refused for being loopback and the
 * visitor reads the reason that matters.
 */
export function checkParsedUrl(url: URL): FenceVerdict {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refuse("scheme", `${url.protocol} is not a scheme I will fetch.`);
  }
  if (url.username !== "" || url.password !== "") {
    return refuse("credentials", "That URL carries a username or password, and I will not send anybody's credentials.");
  }

  const hostname = url.hostname;
  if (hostname === "") return refuse("invalid-url", "That URL has no host in it.");

  if (isAddressLiteral(hostname)) {
    if (isPrivateAddress(hostname)) {
      return refuse("private-address", `${hostname} ${PRIVATE_ADDRESS_REASON}`);
    }
  } else if (isLocalName(hostname)) {
    return refuse("blocked-host", `${hostname} is a local name, not something on the internet.`);
  }

  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return refuse("port", `Port ${url.port} is not one I will fetch from. Only 80 and 443.`);
  }

  return { ok: true, url };
}

/** The synchronous half, on whatever a visitor typed. */
export function checkUrl(input: string): FenceVerdict {
  const url = normaliseUrl(input);
  if (!url) return refuse("invalid-url", "That is not a URL I can read. Try something like example.com/page.");
  return checkParsedUrl(url);
}

/* ── the resolver ────────────────────────────────────────────────────────── */

async function defaultResolver(hostname: string): Promise<Resolved[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

/**
 * The half that asks the resolver.
 *
 * A literal is answered without a lookup, and a private literal is refused
 * here too so a caller that skipped `checkParsedUrl` is still fenced. A
 * resolver that throws and one that answers with nothing are the same fact:
 * nothing to reach.
 */
export async function resolveAndCheck(url: URL, resolver: Resolver = defaultResolver): Promise<FenceVerdict> {
  const hostname = url.hostname;
  if (hostname === "") return refuse("invalid-url", "That URL has no host in it.");

  if (isAddressLiteral(hostname)) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    return isPrivateAddress(bare)
      ? refuse("private-address", `${hostname} ${PRIVATE_ADDRESS_REASON}`)
      : { ok: true, url, addresses: [bare] };
  }

  let answers: Resolved[] = [];
  try {
    answers = (await resolver(hostname)) ?? [];
  } catch {
    answers = [];
  }
  if (answers.length === 0) return refuse("dns", `${hostname} does not resolve.`);

  // Every answer, not the first. One private record among public ones is still
  // a route in, and checking only answers[0] is exactly how that gets missed.
  for (const answer of answers) {
    if (isPrivateAddress(answer.address)) {
      return refuse(
        "private-address",
        `${hostname} resolves to ${answer.address}, which is on a private, loopback or reserved network.`,
      );
    }
  }
  return { ok: true, url, addresses: answers.map((answer) => answer.address) };
}
