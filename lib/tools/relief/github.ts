import { MS_WEEK, WEEKS, type ReliefEvent } from "./types";
import { weekIndex } from "./heightmap";

/**
 * A year of commits, from the visitor's own browser, with the visitor's own
 * token.
 *
 * Three things about this file are load-bearing and each has a test.
 *
 * **The origin fence.** Every request is built by `githubUrl`, which refuses
 * anything that is not a single-leading-slash path and then checks the origin
 * of the result. Nothing a visitor types reaches a URL unvalidated: the
 * username goes through `validUsername` first, and the token never reaches a
 * URL at all.
 *
 * **The token's one home.** It is put into the Authorization header and
 * nowhere else. It is not stored, not logged, not sent as a query parameter,
 * and this module has no reference to any storage API. `safety.test.ts` greps
 * the whole tool for one.
 *
 * **The hour.** `localHour` reads the hour field out of the ISO string as
 * written, offset and all, because the question the sheet asks is what time it
 * was where the author was sitting. `Date.parse` is used for the column only,
 * where the calendar is the right frame. Those two readings of one timestamp
 * disagree on purpose and the page says so.
 */

export const GITHUB_API = "https://api.github.com";
/** Four weeks a window, thirteen of them, which is exactly the 52 columns. */
export const WINDOW_WEEKS = 4;
export const WINDOWS = WEEKS / WINDOW_WEEKS;
export const PAGE_SIZE = 100;
/** The search API's own ceiling is 1,000 results, which is ten pages. */
export const MAX_PAGES_PER_WINDOW = 10;
/** Past this the page says it truncated rather than pretending it saw the lot. */
export const MAX_COMMITS = 5000;
/**
 * Commit search advertises thirty requests a minute, but the live endpoint
 * applied an undocumented secondary limit after ten closely spaced searches.
 * Seven seconds stays below the limit we actually measured.
 */
export const SEARCH_INTERVAL_MS = 7000;
/** GitHub's documented minimum when a secondary limit carries no retry hint. */
export const SECONDARY_BACKOFF_MS = 60_000;

export class ReliefInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReliefInputError";
  }
}
export class ReliefAuthError extends Error {
  constructor() {
    super("relief: GitHub refused that token");
    this.name = "ReliefAuthError";
  }
}
export class ReliefRateLimitError extends Error {
  constructor() {
    super("relief: GitHub is rate limiting this token");
    this.name = "ReliefRateLimitError";
  }
}

/**
 * How long GitHub told us to stop.
 *
 * Primary exhaustion carries a reset instant. A secondary limit may carry a
 * Retry-After value, but the live commit-search endpoint did not; GitHub's
 * documented fallback for that case is at least one minute. The extra second
 * on a primary reset keeps a clock rounded to seconds from retrying on its own
 * boundary.
 */
export function rateLimitDelay(headers: Headers, nowMs = Date.now()): number {
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000);

  if (headers.get("x-ratelimit-remaining") === "0") {
    const resetSeconds = Number(headers.get("x-ratelimit-reset"));
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      return Math.max(1000, Math.ceil(resetSeconds * 1000 - nowMs + 1000));
    }
  }

  return SECONDARY_BACKOFF_MS;
}

/** A wait the page's Stop button can interrupt, including a minute-long backoff. */
export async function abortableSleep(
  ms: number,
  sleep: (ms: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) {
    await sleep(ms);
    return;
  }
  signal.throwIfAborted();

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([sleep(ms), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** GitHub's own rule: 1 to 39 of letters, digits and hyphens, not starting or ending on one. */
export function validUsername(name: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(name);
}

export function githubUrl(path: string, params: Record<string, string>): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ReliefInputError(`relief: a request path must be a single-slash path, got ${path}`);
  }
  const url = new URL(GITHUB_API + path);
  if (url.origin !== GITHUB_API) {
    throw new ReliefInputError(`relief: refused an off-origin request to ${url.origin}`);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

const ISO_HOUR = /^\d{4}-\d{2}-\d{2}T(\d{2}):/;

/** The hour off the author's own clock. Never `getHours`, never `getUTCHours`. */
export function localHour(iso: string): number | null {
  const m = ISO_HOUR.exec(iso.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function searchWindows(endMs: number): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  for (let i = WINDOWS - 1; i >= 0; i--) {
    const until = endMs - i * WINDOW_WEEKS * MS_WEEK;
    const since = until - WINDOW_WEEKS * MS_WEEK + 24 * 60 * 60 * 1000;
    out.push({ since: day(since), until: day(until) });
  }
  return out;
}

export type FetchOptions = {
  user: string;
  token: string;
  endMs: number;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number, commits: number) => void;
  onBackoff?: (ms: number) => void;
  signal?: AbortSignal;
};

type SearchItem = { commit?: { author?: { date?: string } } };
type SearchBody = {
  total_count?: number;
  incomplete_results?: boolean;
  items?: SearchItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function splitWindow(
  since: string,
  until: string,
): [{ since: string; until: string }, { since: string; until: string }] | null {
  const first = Date.parse(`${since}T00:00:00Z`);
  const last = Date.parse(`${until}T00:00:00Z`);
  if (first >= last) return null;
  const mid = first + Math.floor((last - first) / (2 * DAY_MS)) * DAY_MS;
  return [
    { since, until: day(mid) },
    { since: day(mid + DAY_MS), until },
  ];
}

export async function fetchCommitEvents(
  options: FetchOptions,
): Promise<{ events: ReliefEvent[]; truncated: boolean }> {
  const { user, token, endMs, fetchImpl, sleep, onProgress, onBackoff, signal } = options;
  if (!validUsername(user)) throw new ReliefInputError("relief: that is not a GitHub username");
  if (token.trim() === "") throw new ReliefInputError("relief: a token is needed for a whole year");
  signal?.throwIfAborted();

  const events: ReliefEvent[] = [];
  const windows = searchWindows(endMs);
  let truncated = false;
  let stopped = false;
  let requests = 0;
  let rateRetryUsed = false;

  const requestPage = async (since: string, until: string, page: number): Promise<SearchBody> => {
    signal?.throwIfAborted();
    if (requests > 0) await abortableSleep(SEARCH_INTERVAL_MS, sleep, signal);
    requests++;

    const url = githubUrl("/search/commits", {
      q: `author:${user} author-date:${since}..${until}`,
      sort: "author-date",
      order: "desc",
      per_page: String(PAGE_SIZE),
      page: String(page),
    });
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal,
      });

      if (response.status === 401) throw new ReliefAuthError();
      if (response.status !== 403 && response.status !== 429) break;
      if (attempt === 1 || rateRetryUsed) throw new ReliefRateLimitError();

      const delay = rateLimitDelay(response.headers);
      rateRetryUsed = true;
      onBackoff?.(delay);
      await abortableSleep(delay, sleep, signal);
      requests++;
    }

    if (!response) throw new Error("relief: GitHub returned no response");
    if (!response.ok) throw new Error(`relief: GitHub answered ${response.status}`);
    return (await response.json()) as SearchBody;
  };

  const addItems = (items: SearchItem[]) => {
    for (const item of items) {
      const iso = item.commit?.author?.date;
      if (!iso) continue;
      const hour = localHour(iso);
      const at = Date.parse(iso);
      if (hour === null || !Number.isFinite(at)) continue;
      const week = weekIndex(at, endMs);
      if (week === null) continue;
      events.push({ week, hour });
      if (events.length >= MAX_COMMITS) {
        truncated = true;
        stopped = true;
        break;
      }
    }
  };

  const readWindow = async (since: string, until: string): Promise<void> => {
    if (stopped) return;
    const first = await requestPage(since, until, 1);
    const split = splitWindow(since, until);
    const saturated =
      (first.total_count ?? 0) > PAGE_SIZE * MAX_PAGES_PER_WINDOW ||
      first.incomplete_results === true;
    if (split && saturated) {
      await readWindow(split[0].since, split[0].until);
      await readWindow(split[1].since, split[1].until);
      return;
    }
    if (saturated) truncated = true;

    const firstItems = first.items ?? [];
    addItems(firstItems);
    if (stopped || firstItems.length < PAGE_SIZE) return;

    for (let page = 2; page <= MAX_PAGES_PER_WINDOW; page++) {
      const body = await requestPage(since, until, page);
      const items = body.items ?? [];
      if (body.incomplete_results === true) truncated = true;
      addItems(items);
      if (stopped || items.length < PAGE_SIZE) return;
      if (page === MAX_PAGES_PER_WINDOW) truncated = true;
    }
  };

  for (let w = 0; w < windows.length && !stopped; w++) {
    const { since, until } = windows[w];
    await readWindow(since, until);
    onProgress?.(w + 1, windows.length, events.length);
  }

  return { events, truncated };
}
