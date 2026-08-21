import { describe, expect, it, vi } from "vitest";
import {
  MAX_REDIRECTS,
  fetchPage,
  isBlockedAddress,
  normaliseUrl,
  type FetchDeps,
} from "./headline-fetch";

/**
 * The guard on a public endpoint that fetches a URL a stranger typed.
 *
 * Every test here is written so that the failure mode it guards against is the
 * test going green. An address check that allows something it should block is a
 * server-side request forgery on a box with a metadata endpoint on it, so the
 * allow cases are asserted as explicitly as the block cases, and the redirect
 * tests assert that the second request was **never made** rather than that the
 * function returned an error: returning the right word after already having
 * fetched the internal address would be no defence at all.
 */

/** A public address, so a test can be about something other than the guard. */
const PUBLIC = "93.184.216.34";

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });

const deps = (over: FetchDeps = {}): FetchDeps => ({
  lookupImpl: vi.fn(async () => [{ address: PUBLIC, family: 4 }]),
  fetchImpl: vi.fn(async () => html("<h1>Fine</h1>")),
  ...over,
});

describe("isBlockedAddress: the ranges that must never be reached", () => {
  it.each([
    ["0.0.0.0", "this host"],
    ["0.1.2.3", "this network"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback, top of the range"],
    ["10.0.0.1", "private class A"],
    ["10.255.255.255", "private class A, top of the range"],
    ["172.16.0.1", "private class B, bottom of the range"],
    ["172.31.255.255", "private class B, top of the range"],
    ["192.168.0.1", "private class C"],
    ["192.168.255.255", "private class C, top of the range"],
    ["169.254.169.254", "link local, and the cloud metadata address"],
    ["100.64.0.1", "carrier grade NAT"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fc00::1", "IPv6 unique local, bottom of fc00::/7"],
    ["fdff:ffff::1", "IPv6 unique local, top of fc00::/7"],
    ["fe80::1", "IPv6 link local"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4 loopback mapped into IPv6"],
    ["::ffff:7f00:1", "the same thing written in hex"],
    ["::ffff:169.254.169.254", "the metadata address mapped into IPv6"],
    ["64:ff9b::7f00:1", "loopback behind NAT64"],
  ])("blocks %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ["93.184.216.34", "an ordinary public address"],
    ["8.8.8.8", "a public resolver"],
    ["11.0.0.1", "just outside 10/8"],
    ["172.15.255.255", "just below 172.16/12"],
    ["172.32.0.1", "just above 172.16/12"],
    ["192.169.0.1", "just above 192.168/16"],
    ["169.253.255.255", "just below 169.254/16"],
    ["100.63.255.255", "just below the CGNAT range"],
    ["100.128.0.1", "just above the CGNAT range"],
    ["223.255.255.255", "just below multicast"],
    ["2606:4700:4700::1111", "a public IPv6 resolver"],
    ["2a00:1450:4001:80f::200e", "another one"],
  ])("allows %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("blocks anything it cannot parse", () => {
    // Fails closed on purpose. An address this cannot read is one it cannot
    // vouch for, and the cost of the two answers is not remotely symmetric.
    for (const junk of ["", "not-an-address", "999.1.1.1", "1.2.3", "::gggg", "127.0.0.1.5"]) {
      expect(isBlockedAddress(junk), junk).toBe(true);
    }
  });
});

describe("normaliseUrl", () => {
  it("assumes https for a bare hostname, because everybody types one", () => {
    expect(normaliseUrl("example.com")?.toString()).toBe("https://example.com/");
    expect(normaliseUrl("  example.com/path  ")?.toString()).toBe("https://example.com/path");
  });

  it("leaves a scheme that is already there alone", () => {
    expect(normaliseUrl("http://example.com")?.protocol).toBe("http:");
  });

  it("does not turn a dangerous scheme into an https URL", () => {
    // Prefixing blindly would make `javascript:alert(1)` into a fetchable host.
    expect(normaliseUrl("javascript:alert(1)")?.protocol).toBe("javascript:");
    expect(normaliseUrl("file:///etc/passwd")?.protocol).toBe("file:");
  });

  it("returns null for something that is not a URL at all", () => {
    for (const junk of ["", "   ", "https://", "http://", "?"]) {
      expect(normaliseUrl(junk), junk).toBeNull();
    }
  });
});

describe("fetchPage: refusing before anything leaves the machine", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "data:text/html,x"])(
    "refuses the scheme in %s and never calls fetch",
    async (raw) => {
      const d = deps();
      const result = await fetchPage(raw, d);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("blocked-scheme");
      expect(d.fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("refuses a string that is not a URL", async () => {
    const d = deps();
    const result = await fetchPage("   ", d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-url");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "http://127.0.0.1:3000/",
    "http://10.0.0.1/",
    "http://192.168.1.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:8080/",
    "http://0.0.0.0/",
  ])("refuses the literal address %s and never calls fetch", async (raw) => {
    const d = deps();
    const result = await fetchPage(raw, d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("private-address");
    expect(d.fetchImpl).not.toHaveBeenCalled();
    // A literal address needs no resolving, so the resolver is not consulted.
    expect(d.lookupImpl).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const d = deps({ lookupImpl: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]) });
    const result = await fetchPage("https://localtest.me/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("private-address");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses when any one of several answers is private", async () => {
    // A host with one public and one private A record is still a way in, and
    // checking only the first answer is how that gets missed.
    const d = deps({
      lookupImpl: vi.fn(async () => [
        { address: PUBLIC, family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    });
    const result = await fetchPage("https://mixed.example/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("private-address");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to nothing at all", async () => {
    const d = deps({ lookupImpl: vi.fn(async () => []) });
    const result = await fetchPage("https://nowhere.example/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses when the resolver throws", async () => {
    const d = deps({
      lookupImpl: vi.fn(async () => {
        throw new Error("ENOTFOUND");
      }),
    });
    const result = await fetchPage("https://nowhere.example/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchPage: redirects", () => {
  const redirect = (to: string, status = 302) =>
    new Response(null, { status, headers: { location: to } });

  it("refuses a redirect that points at a private address", async () => {
    // The whole reason the check runs per hop. A public hostname that 302s to
    // 169.254.169.254 is the standard shape of this attack, and a guard that
    // only ran on the URL the visitor typed would follow it straight in.
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("start")) return redirect("http://169.254.169.254/latest/");
      return html("<h1>Should never be reached</h1>");
    });
    const result = await fetchPage("https://start.example/", deps({ fetchImpl }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("private-address");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a hostname that resolves to a private address", async () => {
    const lookupImpl = vi.fn(async (hostname: string) =>
      hostname === "start.example"
        ? [{ address: PUBLIC, family: 4 }]
        : [{ address: "192.168.0.5", family: 4 }],
    );
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("start") ? redirect("https://inside.example/") : html("<h1>No</h1>"),
    );
    const result = await fetchPage("https://start.example/", deps({ fetchImpl, lookupImpl }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("private-address");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lookupImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect that changes to a scheme we do not fetch", async () => {
    const fetchImpl = vi.fn(async () => redirect("file:///etc/passwd"));
    const result = await fetchPage("https://start.example/", deps({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blocked-scheme");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a relative Location against the URL it came from", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      seen.push(String(url));
      return seen.length === 1 ? redirect("/moved") : html("<h1>Arrived</h1>");
    });
    const result = await fetchPage("https://start.example/old", deps({ fetchImpl }));
    expect(seen[1]).toBe("https://start.example/moved");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalUrl).toBe("https://start.example/moved");
  });

  it("follows three hops and stops at the fourth", async () => {
    expect(MAX_REDIRECTS).toBe(3);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      redirect(`https://start.example/${String(url).length}`),
    );
    const result = await fetchPage("https://start.example/", deps({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too-many-redirects");
    // Three redirects followed, and the fourth request never made.
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it("re-runs the address check on every single hop", async () => {
    const lookupImpl = vi.fn(async () => [{ address: PUBLIC, family: 4 }]);
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      return n <= 2 ? redirect(`https://hop${n}.example/`) : html("<h1>Done</h1>");
    });
    const result = await fetchPage("https://start.example/", deps({ fetchImpl, lookupImpl }));
    expect(result.ok).toBe(true);
    expect(lookupImpl).toHaveBeenCalledTimes(3);
  });

  it("reports a redirect with no Location rather than looping", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302 }));
    const result = await fetchPage("https://start.example/", deps({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("http-error");
  });

  it("asks for the redirect rather than letting fetch follow it", async () => {
    // `redirect: "manual"` is what makes the per-hop check possible at all.
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      html("<h1>Fine</h1>"),
    );
    await fetchPage("https://example.com/", deps({ fetchImpl }));
    const init = (fetchImpl.mock.calls[0][1] ?? {}) as RequestInit;
    expect(init.redirect).toBe("manual");
    expect(String((init.headers as Record<string, string>)["user-agent"])).toContain(
      "fergusoreilly.dev",
    );
  });
});

describe("fetchPage: the response", () => {
  it("returns the HTML on an ordinary page", async () => {
    const result = await fetchPage(
      "https://example.com/",
      deps({ fetchImpl: vi.fn(async () => html("<h1>Real headline</h1>")) }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("<h1>Real headline</h1>");
      expect(result.finalUrl).toBe("https://example.com/");
      expect(result.status).toBe(200);
    }
  });

  it("refuses anything that is not HTML", async () => {
    for (const type of ["application/json", "text/plain", "image/png", ""]) {
      const result = await fetchPage(
        "https://example.com/x",
        deps({
          fetchImpl: vi.fn(async () => new Response("{}", { headers: { "content-type": type } })),
        }),
      );
      expect(result.ok, type).toBe(false);
      if (!result.ok) expect(result.reason, type).toBe("not-html");
    }
  });

  it("accepts xhtml, which is still a page with a heading in it", async () => {
    const result = await fetchPage(
      "https://example.com/x",
      deps({
        fetchImpl: vi.fn(
          async () =>
            new Response("<h1>Old school</h1>", {
              headers: { "content-type": "application/xhtml+xml" },
            }),
        ),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("stops reading at the size cap", async () => {
    const huge = `<h1>Big</h1>${"x".repeat(5000)}`;
    const result = await fetchPage(
      "https://example.com/",
      deps({ fetchImpl: vi.fn(async () => html(huge)), maxBytes: 1000 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too-large");
  });

  it("believes a content-length header that is over the cap", async () => {
    // The body here is twenty-odd bytes, so an implementation that ignored the
    // header and simply read would return a perfectly good page. Refusing on
    // the declaration is what stops a multi-gigabyte body being streamed at all.
    const fetchImpl = vi.fn(
      async () =>
        new Response("<h1>Small in fact</h1>", {
          headers: { "content-type": "text/html", "content-length": "999999999" },
        }),
    );
    const result = await fetchPage("https://example.com/", deps({ fetchImpl, maxBytes: 1000 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too-large");
  });

  it("reports the status when a server refuses us", async () => {
    const result = await fetchPage(
      "https://example.com/",
      deps({ fetchImpl: vi.fn(async () => new Response("no", { status: 403 })) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http-error");
      // The number has to reach the visitor: "it did not work" is the failure
      // this whole site has a rule about.
      expect(result.detail).toContain("403");
    }
  });

  it("reports a timeout as a timeout rather than as a network fault", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const result = await fetchPage(
      "https://example.com/",
      deps({ fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("returns a network failure rather than throwing it at the caller", async () => {
    const result = await fetchPage(
      "https://example.com/",
      deps({
        fetchImpl: vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network");
  });

  it("survives something being thrown that is not an Error", async () => {
    const result = await fetchPage(
      "https://example.com/",
      deps({
        fetchImpl: vi.fn(async () => {
          throw "a string, because libraries do this";
        }),
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("carries the URL it was asked about into every failure", async () => {
    // The page prints this back. A failure that does not say what failed is
    // the silent failure rule being broken one layer down.
    const result = await fetchPage("http://10.0.0.1/x", deps());
    expect(result.url).toBe("http://10.0.0.1/x");
    if (!result.ok) expect(result.detail.length).toBeGreaterThan(0);
  });
});
