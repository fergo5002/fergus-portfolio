import { describe, expect, it, vi } from "vitest";
import {
  checkParsedUrl,
  checkUrl,
  isLocalName,
  isPrivateAddress,
  normaliseUrl,
  resolveAndCheck,
} from "./fence";

/**
 * Every test here is written so that the failure it guards against is the
 * test going green. An address check that allows something it should block is
 * a server-side request forgery on a box with a metadata endpoint, so the
 * allow cases are asserted as explicitly as the block cases, and the resolver
 * tests assert that it was **not called** for a literal, rather than only
 * that the verdict was right.
 */

const PUBLIC = "93.184.216.34";

describe("isPrivateAddress: the ranges that must never be reached", () => {
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
    ["169.254.0.1", "link local, bottom"],
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
    ["::ffff:a9fe:a9fe", "the metadata address mapped into IPv6, hex form"],
    ["[::ffff:a9fe:a9fe]", "the same, with the brackets a URL host carries"],
    ["::ffff:0.0.0.0", "this host mapped into IPv6"],
    ["::ffff:10.0.0.1", "private class A mapped into IPv6"],
    ["64:ff9b::7f00:1", "loopback behind NAT64"],
  ])("blocks %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
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
    ["::ffff:93.184.216.34", "a public address mapped into IPv6"],
  ])("allows %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("blocks anything it cannot parse", () => {
    for (const junk of ["", "not-an-address", "999.1.1.1", "1.2.3", "::gggg", "127.0.0.1.5"]) {
      expect(isPrivateAddress(junk), junk).toBe(true);
    }
  });

  it("blocks the decimal, octal and hex spellings of loopback by failing closed", () => {
    // None of these are understood as addresses here, and that is deliberate:
    // the parser takes four decimal octets or an IPv6 literal and nothing
    // else, so an unusual spelling is refused as unparseable rather than
    // decoded. The URL layer is where those spellings are normalised (next
    // describe), and both layers refusing is the point.
    for (const spelling of ["2130706433", "0177.0.0.1", "0x7f000001", "0x7f.0.0.1", "017700000001"]) {
      expect(isPrivateAddress(spelling), spelling).toBe(true);
    }
  });
});

describe("isLocalName", () => {
  it.each(["localhost", "LOCALHOST", "localhost.", "api.localhost", "printer.local", "db.internal", "x.y.internal"])(
    "treats %s as local",
    (name) => expect(isLocalName(name)).toBe(true),
  );
  it.each(["example.com", "localhost.example.com", "internal.example.com", "local.ie", "localtest.me"])(
    "treats %s as a real name",
    (name) => expect(isLocalName(name)).toBe(false),
  );
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
    expect(normaliseUrl("javascript:alert(1)")?.protocol).toBe("javascript:");
    expect(normaliseUrl("file:///etc/passwd")?.protocol).toBe("file:");
  });

  it("returns null for something that is not a URL at all", () => {
    for (const junk of ["", "   ", "https://", "http://", "?"]) {
      expect(normaliseUrl(junk), junk).toBeNull();
    }
  });
});

describe("checkUrl: the synchronous half", () => {
  const refused = (input: string) => {
    const verdict = checkUrl(input);
    expect(verdict.ok, input).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    // Every refusal is a sentence a page can print.
    expect(verdict.reason.length, input).toBeGreaterThan(10);
    expect(verdict.reason.endsWith("."), input).toBe(true);
    return verdict;
  };

  it("accepts an ordinary page and a bare hostname", () => {
    const a = checkUrl("https://example.com/page");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.url.hostname).toBe("example.com");
    const b = checkUrl("example.com");
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.url.protocol).toBe("https:");
  });

  it("accepts a public address literal without consulting anything", () => {
    expect(checkUrl(`http://${PUBLIC}/`).ok).toBe(true);
  });

  it("refuses something that is not a URL", () => {
    expect(refused("   ").code).toBe("invalid-url");
    expect(refused("?").code).toBe("invalid-url");
  });

  it.each(["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "data:text/html,x", "gopher://x/"])(
    "refuses the scheme in %s",
    (input) => expect(refused(input).code).toBe("scheme"),
  );

  it("refuses a URL that carries credentials", () => {
    expect(refused("https://user:secret@example.com/").code).toBe("credentials");
    expect(refused("https://user@example.com/").code).toBe("credentials");
  });

  it.each(["http://localhost/", "http://localhost:80/", "http://api.localhost/", "http://printer.local/", "http://db.internal/", "http://localhost./"])(
    "refuses the local name in %s",
    (input) => expect(refused(input).code).toBe("blocked-host"),
  );

  it.each([
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://192.168.1.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:a9fe:a9fe]/",
  ])("refuses the private literal in %s", (input) => {
    expect(refused(input).code).toBe("private-address");
  });

  it("refuses the private literal before it looks at the port", () => {
    // Order matters for the message a visitor reads: `127.0.0.1:3000` is
    // refused for being loopback, not for being on port 3000, and the
    // headline fetch's existing contract depends on that.
    expect(refused("http://127.0.0.1:3000/").code).toBe("private-address");
    expect(refused("http://[::1]:8080/").code).toBe("private-address");
  });

  it("relies on the URL parser to canonicalise odd address spellings, and checks that it does", () => {
    // The WHATWG parser turns a decimal, octal or hex host into dotted form
    // before this code sees it. That is an instrument this guard depends on,
    // so it is asserted rather than assumed: if a runtime ever stops doing it,
    // the first line fails and says so.
    expect(new URL("http://2130706433/").hostname).toBe("127.0.0.1");
    expect(new URL("http://0177.0.0.1/").hostname).toBe("127.0.0.1");
    expect(new URL("http://0x7f000001/").hostname).toBe("127.0.0.1");
    expect(new URL("http://127.1/").hostname).toBe("127.0.0.1");
    expect(new URL("http://[::ffff:169.254.169.254]/").hostname).toBe("[::ffff:a9fe:a9fe]");
    for (const input of ["http://2130706433/", "http://0177.0.0.1/", "http://0x7f000001/", "http://127.1/", "http://2852039166/"]) {
      // 2852039166 is 169.254.169.254 in decimal.
      expect(refused(input).code, input).toBe("private-address");
    }
  });

  it("refuses any port other than 80 and 443", () => {
    expect(refused("http://example.com:8080/").code).toBe("port");
    expect(refused("https://example.com:8443/").code).toBe("port");
    expect(refused("http://example.com:3000/").reason).toContain("3000");
    // The parser drops a scheme's default port, and the other well-known one
    // is allowed explicitly, so both of these stay open.
    expect(checkUrl("https://example.com:443/").ok).toBe(true);
    expect(checkUrl("http://example.com:443/").ok).toBe(true);
    expect(checkUrl("https://example.com:80/").ok).toBe(true);
  });

  it("gives the same verdict for a URL object as for its string", () => {
    const url = new URL("http://169.254.169.254/latest/");
    const parsed = checkParsedUrl(url);
    const typed = checkUrl(url.toString());
    expect(parsed).toEqual(typed);
  });
});

describe("resolveAndCheck: the half that asks the resolver", () => {
  const resolverWith = (answers: Array<{ address: string; family: number }>) => vi.fn(async () => answers);

  it("does not consult the resolver for a literal, and refuses a private one", async () => {
    const resolver = resolverWith([{ address: PUBLIC, family: 4 }]);
    const pub = await resolveAndCheck(new URL(`http://${PUBLIC}/`), resolver);
    expect(pub.ok).toBe(true);
    if (pub.ok) expect(pub.addresses).toEqual([PUBLIC]);
    const priv = await resolveAndCheck(new URL("http://169.254.169.254/"), resolver);
    expect(priv.ok).toBe(false);
    if (!priv.ok) expect(priv.code).toBe("private-address");
    const v6 = await resolveAndCheck(new URL("http://[::1]/"), resolver);
    expect(v6.ok).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const resolver = resolverWith([{ address: "127.0.0.1", family: 4 }]);
    const verdict = await resolveAndCheck(new URL("https://localtest.me/"), resolver);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("private-address");
      expect(verdict.reason).toContain("localtest.me");
      expect(verdict.reason).toContain("127.0.0.1");
    }
    expect(resolver).toHaveBeenCalledWith("localtest.me");
  });

  it("refuses a hostname that resolves to the metadata address", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://meta.example/"),
      resolverWith([{ address: "169.254.169.254", family: 4 }]),
    );
    expect(verdict.ok).toBe(false);
  });

  it("refuses a hostname whose IPv6 answer maps a private IPv4 address", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://mapped.example/"),
      resolverWith([{ address: "::ffff:10.0.0.1", family: 6 }]),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("private-address");
  });

  it("refuses when any one of several answers is private", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://mixed.example/"),
      resolverWith([
        { address: PUBLIC, family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("private-address");
  });

  it("refuses a hostname that resolves to nothing, and one whose resolver throws", async () => {
    const empty = await resolveAndCheck(new URL("https://nowhere.example/"), resolverWith([]));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("dns");
    const thrown = await resolveAndCheck(
      new URL("https://nowhere.example/"),
      vi.fn(async () => {
        throw new Error("ENOTFOUND");
      }),
    );
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) expect(thrown.code).toBe("dns");
  });

  it("returns every public answer for a caller that can pin a connection", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://example.com/"),
      resolverWith([
        { address: PUBLIC, family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]),
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.addresses).toEqual([PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"]);
  });
});
