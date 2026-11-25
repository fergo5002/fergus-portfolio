import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

const links = (line: string) => linkify(line).filter((s) => s.href);

describe("links in the terminal's output", () => {
  it("leaves a line with nothing to link as one plain piece", () => {
    expect(linkify("phosphor -> amber")).toEqual([{ text: "phosphor -> amber" }]);
  });

  it("links the email address to a mailto, keeping the words around it", () => {
    const parts = linkify("email: oreillferg@gmail.com");
    expect(parts.map((p) => p.text).join("")).toBe("email: oreillferg@gmail.com");
    expect(links("email: oreillferg@gmail.com")).toEqual([
      { text: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    ]);
  });

  it("links the profile's short forms to the real addresses, in a new tab", () => {
    expect(links("  github     github.com/fergo5002")).toEqual([
      { text: "github.com/fergo5002", href: "https://github.com/fergo5002", external: true },
    ]);
    expect(links("linkedin: in/patrickfergusoreilly")).toEqual([
      { text: "in/patrickfergusoreilly", href: "https://www.linkedin.com/in/patrickfergusoreilly/", external: true },
    ]);
  });

  it("links a full https address", () => {
    expect(links("see https://loira.ai for more")).toEqual([{ text: "https://loira.ai", href: "https://loira.ai", external: true }]);
  });

  it("links the site's own routes and nothing that only looks like a path", () => {
    expect(links("-> /projects")).toEqual([{ text: "/projects", href: "/projects" }]);
    expect(links("removing /dev/ambition ... failed")).toEqual([]);
    expect(links("rm: descending into /")).toEqual([]);
    // The prompt's own path, as `status` prints it, is a place and not a link.
    expect(links("where     ~/experience")).toEqual([]);
  });

  it("links a short form or a route only when it ends there (2026-11-25 review)", () => {
    // A longer path that starts with one must not send the click somewhere else.
    expect(links("echo github.com/fergo5002/fergus-portfolio")).toEqual([]);
    expect(links("see /contactfoo")).toEqual([]);
    expect(links("see /contact-us")).toEqual([]);
    expect(links("github.com/fergo5002.")).toEqual([{ text: "github.com/fergo5002", href: "https://github.com/fergo5002", external: true }]);
    expect(links("/contact?meet=call")).toEqual([{ text: "/contact?meet=call", href: "/contact?meet=call" }]);
  });

  it("keeps a trailing full stop out of the link", () => {
    expect(links("mail me at oreillferg@gmail.com.")).toEqual([
      { text: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    ]);
  });
});
