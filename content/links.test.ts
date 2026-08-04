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
      (p.links ?? []).map((l) => ({ where: `projects.${p.slug}.${l.label}`, href: l.href })),
    ),
  ];

  it("has links to check", () => {
    expect(outbound.length).toBeGreaterThan(0);
  });

  it("are absolute, parseable, and https (or mailto)", () => {
    for (const { where, href } of outbound) {
      expect(href, where).not.toMatch(/\s/);
      const url = new URL(href); // throws on a relative or malformed href
      expect(["https:", "mailto:"], where).toContain(url.protocol);
    }
  });

  it("point at Firespark's own domain, not the platform URL it is hosted on", () => {
    const live = projects.find((p) => p.slug === "firespark")?.links?.find((l) => l.label === "live");
    expect(live?.href).toBe("https://firespark.dev");
  });

  it("cover both of Fergus's GitHub accounts", () => {
    const hrefs = profile.contact.map((c) => c.href);
    expect(hrefs).toContain("https://github.com/oreillyfergus");
    expect(hrefs).toContain("https://github.com/fergo5002");
  });
});
