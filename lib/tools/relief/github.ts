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
/** Commit search allows about thirty requests a minute authenticated. 2.2s is inside it. */
export const SEARCH_INTERVAL_MS = 2200;

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
  signal?: AbortSignal;
};

type SearchItem = { commit?: { author?: { date?: string } } };

export async function fetchCommitEvents(
  options: FetchOptions,
): Promise<{ events: ReliefEvent[]; truncated: boolean }> {
  const { user, token, endMs, fetchImpl, sleep, onProgress, signal } = options;
  if (!validUsername(user)) throw new ReliefInputError("relief: that is not a GitHub username");
  if (token.trim() === "") throw new ReliefInputError("relief: a token is needed for a whole year");
  signal?.throwIfAborted();

  const events: ReliefEvent[] = [];
  const windows = searchWindows(endMs);
  let truncated = false;
  let requests = 0;

  for (let w = 0; w < windows.length && !truncated; w++) {
    const { since, until } = windows[w];
    for (let page = 1; page <= MAX_PAGES_PER_WINDOW; page++) {
      signal?.throwIfAborted();
      if (requests > 0) await sleep(SEARCH_INTERVAL_MS);
      requests++;

      const url = githubUrl("/search/commits", {
        q: `author:${user} author-date:${since}..${until}`,
        sort: "author-date",
        order: "desc",
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal,
      });

      if (response.status === 401) throw new ReliefAuthError();
      if (response.status === 403 || response.status === 429) throw new ReliefRateLimitError();
      if (!response.ok) {
        throw new Error(`relief: GitHub answered ${response.status}`);
      }

      const body = (await response.json()) as { items?: SearchItem[] };
      const items = body.items ?? [];
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
          break;
        }
      }
      if (truncated || items.length < PAGE_SIZE) break;
    }
    onProgress?.(w + 1, windows.length, events.length);
  }

  return { events, truncated };
}
