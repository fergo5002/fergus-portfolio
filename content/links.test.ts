import { describe, it, expect } from "vitest";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

/**
 * Guards the outbound links in `content/*.ts`. Every one of these is a public
 * claim on a page whose whole pitch is "go and check": a link that 404s, or one
 * that still points at a superseded address, is worse than no link at all.
 * Nothing else in the suite touches them, so a typo here used to ship silently.
 */
describe("content links", () => {
  const outbound = [
    ...profile.contact.map((c) => ({ where: `profile.contact.${c.label}`, href: c.href })),
    ...projects.flatMap((p) =>
      p.links.map((l) => ({ where: `projects.${p.slug}.${l.label}`, href: l.href })),
    ),
  ];

  it("has links to check", () => {
    expect(outbound.length).toBeGreaterThan(0);
  });

  it("are absolute, parseable, and https (or mailto)", () => {
    for (const { where, href } of outbound) {
      expect(href, where).not.toMatch(/\s/);
      // Relative, protocol-relative, empty and malformed hrefs all throw here.
      // Named, because a bare "TypeError: Invalid URL" does not say which one.
      expect(() => new URL(href), where).not.toThrow();
      // Catches what parses but should not ship: http: and javascript:.
      expect(["https:", "mailto:"], where).toContain(new URL(href).protocol);
    }
  });

  it("point at Tigh Sauna's own domain, not the platform URL it is hosted on", () => {
    // Was the same guard on `firespark`, which is what this product used to be
    // called. The Vercel project is still named `firespark` and still serves
    // `firespark.dev`, so the wrong URL remains live and reachable, which is
    // precisely why the test has to keep existing rather than being deleted
    // with the old slug. A visitor sent to the retired brand is a worse outcome
    // than a dead link, because it looks deliberate.
    const live = projects
      .find((p) => p.slug === "tigh-sauna")
      ?.links?.find((l) => l.label === "live");
    expect(live?.href).toBe("https://tighsauna.com");
  });

  it("never send a visitor to a retired brand name", () => {
    // Sauna OS, Hearth and Firespark all survive in package names and deploy
    // paths on purpose. None of them may appear in anything a person reads.
    const retired = /firespark|hearth|sauna-?os/i;
    for (const { where, href } of outbound) {
      expect(href, `${where} points at a retired brand`).not.toMatch(retired);
    }
  });

  it("claims one GitHub identity, not two", () => {
    // This test used to require both accounts and was changed on 2026-08-21.
    // The contact list is what builds `sameAs`, so every entry is a claim that
    // the profile on the other end is the same person. `oreillyfergus` was
    // checked against the GitHub API and has zero public repositories, zero
    // followers and no display name, so following that edge corroborated
    // nothing, and it was labelled "work" so `/llms.txt` preferred it over the
    // account with the code on it. Two thin identities are weaker than one
    // evidenced identity, which is the whole reason `sameAs` exists.
    const github = profile.contact.filter((c) => c.href.includes("github.com"));
    expect(github).toHaveLength(1);
    expect(github[0].href).toBe("https://github.com/fergo5002");
  });
});
