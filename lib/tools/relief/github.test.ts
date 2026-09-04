import { describe, it, expect } from "vitest";
import { MS_WEEK, WEEKS } from "./types";
import {
  GITHUB_API,
  MAX_COMMITS,
  MAX_PAGES_PER_WINDOW,
  PAGE_SIZE,
  ReliefAuthError,
  ReliefInputError,
  ReliefRateLimitError,
  SEARCH_INTERVAL_MS,
  SECONDARY_BACKOFF_MS,
  WINDOWS,
  abortableSleep,
  fetchCommitEvents,
  githubUrl,
  localHour,
  rateLimitDelay,
  searchWindows,
  validUsername,
} from "./github";

const TOKEN = "ghp_notarealtokenatall000000000000000000";
const END = Date.UTC(2026, 8, 3);

type Recorded = { url: string; headers: Record<string, string>; body: unknown };

/** A recording fetch. Answers `items` commits per page and logs every request. */
function stubFetch(pages: (unknown[] | { status: number; headers?: Record<string, string> })[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ url, headers, body: init?.body ?? null });
    const page = pages[Math.min(i++, pages.length - 1)];
    if (Array.isArray(page)) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ total_count: page.length, incomplete_results: false, items: page }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: page.status,
      headers: new Headers(page.headers ?? {}),
      json: async () => ({ message: "no" }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const commit = (iso: string) => ({ commit: { author: { date: iso } } });
const run = (
  pages: Parameters<typeof stubFetch>[0],
  over: Partial<Parameters<typeof fetchCommitEvents>[0]> = {},
) => {
  const { impl, calls } = stubFetch(pages);
  return {
    calls,
    promise: fetchCommitEvents({
      user: "fergo5002",
      token: TOKEN,
      endMs: END,
      fetchImpl: impl,
      sleep: async () => {},
      ...over,
    }),
  };
};

describe("validUsername", () => {
  it("accepts a real one", () => {
    expect(validUsername("fergo5002")).toBe(true);
    expect(validUsername("a-b-c")).toBe(true);
  });

  it("refuses anything that could change the URL", () => {
    for (const bad of ["", "a b", "../x", 'a"', "a/b", "-lead", "trail-", "a".repeat(40), "a:b"]) {
      expect(validUsername(bad), bad).toBe(false);
    }
  });
});

describe("githubUrl", () => {
  it("builds on the API origin and nothing else", () => {
    expect(githubUrl("/search/commits", { q: "author:x" })).toBe(
      `${GITHUB_API}/search/commits?q=author%3Ax`,
    );
  });

  it("refuses an absolute URL", () => {
    expect(() => githubUrl("https://evil.example/x", {})).toThrow(/single-slash/);
  });

  it("refuses a protocol-relative path", () => {
    expect(() => githubUrl("//evil.example/x", {})).toThrow(/single-slash/);
  });

  it("cannot be walked off the origin", () => {
    expect(new URL(githubUrl("/../../x", {})).origin).toBe(GITHUB_API);
  });
});

describe("localHour", () => {
  it("takes the hour off the author's own clock, offset and all", () => {
    expect(localHour("2026-01-14T21:03:11+01:00")).toBe(21);
    expect(localHour("2026-01-14T21:03:11-08:00")).toBe(21);
    expect(localHour("2026-01-14T21:03:11Z")).toBe(21);
  });

  it("does not agree with UTC, which is the whole point", () => {
    const iso = "2026-01-14T23:30:00+05:30";
    expect(localHour(iso)).toBe(23);
    expect(new Date(iso).getUTCHours()).not.toBe(23);
  });

  it("returns null for anything it cannot read", () => {
    expect(localHour("yesterday")).toBeNull();
    expect(localHour("")).toBeNull();
  });
});

describe("searchWindows", () => {
  const windows = searchWindows(END);

  it("covers the year in thirteen four-week windows", () => {
    expect(windows).toHaveLength(WINDOWS);
    expect(WINDOWS * 4).toBe(WEEKS);
  });

  it("ends at the window's end and starts a year before it", () => {
    expect(windows[windows.length - 1].until).toBe(new Date(END).toISOString().slice(0, 10));
    expect(Date.parse(windows[0].since)).toBeLessThanOrEqual(END - (WEEKS - 1) * MS_WEEK);
  });

  it("leaves no gap between windows", () => {
    for (let i = 1; i < windows.length; i++) {
      const gap = Date.parse(windows[i].since) - Date.parse(windows[i - 1].until);
      expect(gap).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });
});

describe("fetchCommitEvents", () => {
  it("turns commits into events on the right row and column", async () => {
    // Three weeks back to the day, then the time of day replaced with
    // 21:03+01:00, which is 20:03Z. The gap to the window's end is therefore
    // 20 days and about four hours, which is two whole weeks back and not
    // three, so the column is 49 rather than 48. Worked by hand, because the
    // alternative is restating weekIndex and calling it a test.
    const iso = new Date(END - 3 * MS_WEEK).toISOString().replace(/T.*/, "T21:03:11+01:00");
    const { promise } = run([[commit(iso)], []]);
    const { events } = await promise;
    expect(events[0].hour).toBe(21);
    expect(events[0].week).toBe(WEEKS - 3);
  });

  /**
   * The guard the plan's constraints name. Every request on the API origin,
   * the token in exactly one header, never in a URL and never in a body.
   */
  it("sends the token in one header and puts it nowhere else", async () => {
    const { calls, promise } = run([[commit("2026-08-01T09:00:00Z")], []]);
    await promise;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(`${GITHUB_API}/`)).toBe(true);
      expect(call.url).not.toContain(TOKEN);
      expect(String(call.body ?? "")).not.toContain(TOKEN);
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("asks for a hundred at a time", async () => {
    const { calls, promise } = run([[]]);
    await promise;
    expect(calls[0].url).toContain(`per_page=${PAGE_SIZE}`);
  });

  it("stops paging a window when a short page comes back", async () => {
    const { calls, promise } = run([[commit("2026-08-01T09:00:00Z")]]);
    await promise;
    // One request per window, never a second page after a short one.
    expect(calls).toHaveLength(WINDOWS);
  });

  it("refuses a username that is not one, before any request", async () => {
    const { calls, promise } = run([[]], { user: "a b" });
    await expect(promise).rejects.toBeInstanceOf(ReliefInputError);
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty token, before any request", async () => {
    const { calls, promise } = run([[]], { token: "  " });
    await expect(promise).rejects.toBeInstanceOf(ReliefInputError);
    expect(calls).toHaveLength(0);
  });

  it("says the token was rejected rather than blaming the data", async () => {
    const { promise } = run([{ status: 401 }]);
    await expect(promise).rejects.toBeInstanceOf(ReliefAuthError);
  });

  it("backs off once on a rate limit and gives up saying so", async () => {
    const waits: number[] = [];
    const { calls, promise } = run([{ status: 403 }], {
      sleep: async (ms: number) => void waits.push(ms),
    });
    await expect(promise).rejects.toBeInstanceOf(ReliefRateLimitError);
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([SECONDARY_BACKOFF_MS]);
  });

  /**
   * Reproduced against GitHub itself: the ninth commit-search request answered
   * 403 while 25 of 30 primary search requests remained. GitHub called it a
   * secondary limit and sent no Retry-After, so its documented minimum is one
   * minute. The old implementation threw immediately and could not finish a
   * thirteen-window year.
   */
  it("waits and recovers from one secondary limit", async () => {
    const waits: number[] = [];
    const backoffs: number[] = [];
    const { calls, promise } = run([{ status: 403 }, []], {
      sleep: async (ms: number) => void waits.push(ms),
      onBackoff: (ms: number) => void backoffs.push(ms),
    });
    await expect(promise).resolves.toEqual({ events: [], truncated: false });
    expect(calls.length).toBeGreaterThan(WINDOWS);
    expect(waits).toContain(SECONDARY_BACKOFF_MS);
    expect(backoffs).toEqual([SECONDARY_BACKOFF_MS]);
  });

  it("backs off only once for the whole run, so repeated limits cannot hold the tab for minutes", async () => {
    const waits: number[] = [];
    const backoffs: number[] = [];
    const { promise } = run([{ status: 403 }, [], { status: 403 }], {
      sleep: async (ms: number) => void waits.push(ms),
      onBackoff: (ms: number) => void backoffs.push(ms),
    });
    await expect(promise).rejects.toBeInstanceOf(ReliefRateLimitError);
    expect(waits.filter((ms) => ms === SECONDARY_BACKOFF_MS)).toHaveLength(1);
    expect(backoffs).toEqual([SECONDARY_BACKOFF_MS]);
  });

  it("keeps commit search below the hidden ten-a-minute secondary limit seen live", async () => {
    const waits: number[] = [];
    const { promise } = run([[]], { sleep: async (ms: number) => void waits.push(ms) });
    await promise;
    expect(waits.length).toBeGreaterThanOrEqual(WINDOWS - 1);
    expect(SEARCH_INTERVAL_MS).toBeGreaterThanOrEqual(7000);
    expect(Math.max(...waits)).toBe(SEARCH_INTERVAL_MS);
  });

  it("reports progress once per window", async () => {
    const seen: number[] = [];
    const { promise } = run([[]], { onProgress: (done: number) => void seen.push(done) });
    await promise;
    expect(seen[seen.length - 1]).toBe(WINDOWS);
  });

  it("stops at the commit cap and says it truncated", async () => {
    const full = Array.from({ length: PAGE_SIZE }, () => commit("2026-08-01T09:00:00Z"));
    const { promise } = run([full]);
    const { events, truncated } = await promise;
    expect(events.length).toBeLessThanOrEqual(MAX_COMMITS);
    expect(truncated).toBe(true);
  });

  it("marks a full tenth page incomplete even when GitHub understates total_count", async () => {
    const full = Array.from({ length: PAGE_SIZE }, () => commit("2026-08-01T09:00:00Z"));
    const { promise } = run([
      ...Array.from({ length: MAX_PAGES_PER_WINDOW }, () => full),
      [],
    ]);
    const { events, truncated } = await promise;
    expect(events).toHaveLength(PAGE_SIZE * MAX_PAGES_PER_WINDOW);
    expect(truncated).toBe(true);
  });

  it("subdivides a saturated date window and does not count the broad page twice", async () => {
    const queries: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = new URL(String(input));
      const q = url.searchParams.get("q") ?? "";
      queries.push(q);
      const match = /author-date:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/.exec(q);
      const singleDay = match?.[1] === match?.[2];
      const items = singleDay ? [commit(`${match?.[1]}T09:00:00Z`)] : [commit("not-a-date")];
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          total_count: singleDay ? 1 : 1001,
          incomplete_results: false,
          items,
        }),
      } as Response;
    }) as typeof fetch;

    const { events, truncated } = await fetchCommitEvents({
      user: "fergo5002",
      token: TOKEN,
      endMs: END,
      fetchImpl,
      sleep: async () => {},
    });
    expect(queries.some((q) => /author-date:(\d{4}-\d{2}-\d{2})\.\.\1/.test(q))).toBe(true);
    // The oldest midnight falls just outside weekIndex's rolling 52-week
    // instant boundary. Every event counted came from a one-day query; the
    // invalid marker returned for broad queries was not counted twice.
    expect(events).toHaveLength(363);
    expect(truncated).toBe(false);
  });

  it("propagates GitHub's incomplete_results flag after subdivision reaches a day", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ total_count: 0, incomplete_results: true, items: [] }),
      } as Response;
    }) as typeof fetch;
    const result = await fetchCommitEvents({
      user: "fergo5002",
      token: TOKEN,
      endMs: END,
      fetchImpl,
      sleep: async () => {},
    });
    expect(calls).toBeGreaterThan(WINDOWS);
    expect(result).toEqual({ events: [], truncated: true });
  });

  it("drops a commit whose date it cannot read instead of throwing", async () => {
    const { promise } = run([[commit("whenever"), commit("2026-08-01T09:00:00Z")], []]);
    const { events } = await promise;
    expect(events).toHaveLength(1);
  });

  it("stops early when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, promise } = run([[]], { signal: controller.signal });
    await expect(promise).rejects.toThrow(/abort/i);
    expect(calls).toHaveLength(0);
  });
});

describe("rateLimitDelay", () => {
  const now = Date.UTC(2026, 8, 4, 12, 0, 0);

  it("honours Retry-After when GitHub sends one", () => {
    expect(rateLimitDelay(new Headers({ "retry-after": "3" }), now)).toBe(3000);
  });

  it("waits for the primary reset when no requests remain", () => {
    const reset = Math.floor(now / 1000) + 9;
    expect(
      rateLimitDelay(
        new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }),
        now,
      ),
    ).toBe(10_000);
  });

  it("uses GitHub's one-minute minimum for a secondary limit with no hint", () => {
    expect(rateLimitDelay(new Headers({ "x-ratelimit-remaining": "25" }), now)).toBe(
      SECONDARY_BACKOFF_MS,
    );
  });
});

describe("abortableSleep", () => {
  it("lets Stop interrupt the one-minute secondary-limit wait", async () => {
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const sleeping = abortableSleep(
      60_000,
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
      controller.signal,
    );

    controller.abort();
    await expect(sleeping).rejects.toMatchObject({ name: "AbortError" });
    release?.();
  });
});
