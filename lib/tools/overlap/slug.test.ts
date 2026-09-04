import { describe, expect, it } from "vitest";
import { normaliseSlug } from "./slug";

const ok = (raw: string) => {
  const r = normaliseSlug(raw);
  if (!r.ok) throw new Error(`expected a slug from ${JSON.stringify(raw)}, got ${r.reason}`);
  return r.slug;
};
const refused = (raw: string) => {
  const r = normaliseSlug(raw);
  if (r.ok) throw new Error(`expected a refusal from ${JSON.stringify(raw)}, got ${r.slug}`);
  return r.reason;
};

describe("normaliseSlug: the shapes a real export holds", () => {
  it("reduces the ordinary case", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("drops a trailing slash", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly///")).toBe("fergus-oreilly");
  });

  it("drops the query and the fragment", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly?trk=contacts_index")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/#experience")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/?a=1#b")).toBe("fergus-oreilly");
  });

  it("takes a country subdomain, which is how a locale reaches an export", () => {
    expect(ok("https://ie.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("https://de.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("https://uk.linkedin.com/in/fergus-oreilly/")).toBe("fergus-oreilly");
  });

  it("takes a bare slug that never had a URL around it", () => {
    expect(ok("fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("  fergus-oreilly  ")).toBe("fergus-oreilly");
    expect(ok("in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("takes a URL with no scheme", () => {
    expect(ok("www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("//www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("folds case, because a LinkedIn slug is case-insensitive", () => {
    expect(ok("HTTPS://WWW.LINKEDIN.COM/IN/Fergus-OReilly")).toBe("fergus-oreilly");
  });

  it("percent-decodes after the path is split, not before", () => {
    expect(ok("https://www.linkedin.com/in/se%C3%A1n-%C3%B3-broin")).toBe("seán-ó-broin");
    // %23 is a literal hash in the path. Decoding first would cut the slug here.
    expect(ok("https://www.linkedin.com/in/a%23b")).toBe("a#b");
    // Upper and lower case percent escapes are the same bytes.
    expect(ok("https://www.linkedin.com/in/se%c3%a1n")).toBe(ok("https://www.linkedin.com/in/se%C3%A1N"));
  });

  it("survives a lone percent rather than dropping the row", () => {
    expect(ok("https://www.linkedin.com/in/100%-committed")).toBe("100%-committed");
  });

  it("normalises to NFC, so a composed and a decomposed accent are one person", () => {
    const composed = "https://www.linkedin.com/in/se\u00e1n-o-broin";
    const decomposed = "https://www.linkedin.com/in/sea\u0301n-o-broin";
    expect(composed).not.toBe(decomposed);
    expect(ok(composed)).toBe(ok(decomposed));
    expect(ok(decomposed)).toBe("seán-o-broin");
  });

  it("strips a byte order mark and a non-breaking space", () => {
    expect(ok("\ufeffhttps://www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("\u00a0https://www.linkedin.com/in/fergus-oreilly\u00a0")).toBe("fergus-oreilly");
  });
});

describe("normaliseSlug: the suffix stays", () => {
  /**
   * The single worst failure this tool can produce is a stranger's name under
   * "you both know". Two people called John Smith get two slugs that differ
   * only in the suffix LinkedIn appends, so stripping it would merge them.
   */
  it("keeps two people with the same name apart", () => {
    const a = ok("https://www.linkedin.com/in/john-smith-1a2b3c4");
    const b = ok("https://www.linkedin.com/in/john-smith-9f8e7d6");
    expect(a).not.toBe(b);
    expect(a).toBe("john-smith-1a2b3c4");
  });

  it("keeps a numeric suffix too", () => {
    expect(ok("https://www.linkedin.com/in/john-smith-123456789")).toBe("john-smith-123456789");
  });

  it("leaves a slug with no suffix alone", () => {
    expect(ok("https://www.linkedin.com/in/williamhgates")).toBe("williamhgates");
  });
});

describe("normaliseSlug: what it refuses, and why each refusal is its own reason", () => {
  it("refuses an empty cell", () => {
    expect(refused("")).toBe("empty");
    expect(refused("   ")).toBe("empty");
    expect(refused("\ufeff")).toBe("empty");
  });

  it("refuses an old style /pub/ link rather than inventing an /in/ slug from it", () => {
    expect(refused("https://www.linkedin.com/pub/john-smith/1/2a/3b4")).toBe("legacy-pub");
    expect(refused("https://ie.linkedin.com/pub/dir/John/Smith")).toBe("legacy-pub");
  });

  it("refuses a URL that is not LinkedIn", () => {
    expect(refused("https://example.com/in/fergus-oreilly")).toBe("not-a-profile");
    expect(refused("https://notlinkedin.com/in/fergus-oreilly")).toBe("not-a-profile");
    expect(refused("https://linkedin.com.example.com/in/fergus-oreilly")).toBe("not-a-profile");
  });

  it("refuses a LinkedIn URL that is not a profile", () => {
    expect(refused("https://www.linkedin.com/company/anthropic")).toBe("not-a-profile");
    expect(refused("https://www.linkedin.com/in/")).toBe("not-a-profile");
    expect(refused("https://www.linkedin.com/")).toBe("not-a-profile");
  });

  it("refuses something with a path inside the slug", () => {
    expect(refused("https://www.linkedin.com/in/fergus-oreilly/detail/recent-activity")).toBe("not-a-profile");
  });
});
