import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools, toolBySlug, toolShellCopy, tools } from "./index";
import { reliefCopy } from "./relief";

/**
 * The registry guard, in the shape of `content/articles.test.ts`.
 *
 * Every rule here is a way a tool can be registered and then quietly not
 * exist: a live entry with no page behind it, a file in this folder nobody
 * added to the index, two tools claiming the same slot in the list. None of
 * them break a build, which is why they need a test.
 */

const HERE = join(process.cwd(), "content", "tools");

describe("tool registry", () => {
  it("has at least one tool, and headline-check is live", () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(toolBySlug("headline-check")?.status).toBe("live");
  });

  it("has unique slugs", () => {
    const slugs = tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique orders and is sorted by them ascending", () => {
    const orders = tools.map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("resolves every slug and nothing else", () => {
    for (const t of tools) expect(toolBySlug(t.slug)?.name).toBe(t.name);
    expect(toolBySlug("no-such-tool")).toBeUndefined();
  });

  it("lists only live entries in liveTools", () => {
    expect(liveTools.every((t) => t.status === "live")).toBe(true);
    expect(liveTools.length).toBe(tools.filter((t) => t.status === "live").length);
  });

  /**
   * A file in this folder that the index does not import is a tool that is
   * written and unreachable. Read the directory rather than trust the list.
   */
  it("registers every tool file in the folder", () => {
    const files = readdirSync(HERE)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => f !== "index.ts" && f !== "types.ts")
      .map((f) => f.replace(/\.ts$/, ""));
    expect(files.sort()).toEqual(tools.map((t) => t.slug).sort());
  });

  /**
   * Design section 8: registrations are alphabetical so two pull requests
   * rarely collide on the same line. Checked on the source, because that is
   * where the collision happens.
   */
  it("keeps the registration lines alphabetical", () => {
    const src = readFileSync(join(HERE, "index.ts"), "utf8");
    const imports = [...src.matchAll(/^import \{ \w+ \} from "\.\/([a-z0-9-]+)";$/gm)].map((m) => m[1]);
    expect(imports.length).toBe(tools.length);
    expect([...imports].sort()).toEqual(imports);
  });
});

describe.each(tools.map((t) => [t.slug, t] as const))("tool: %s", (_slug, tool) => {
  it("has a URL-safe slug", () => {
    expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a page behind it if it is live", () => {
    const page = join(process.cwd(), "app", "tools", tool.slug, "page.tsx");
    if (tool.status === "live") expect(existsSync(page), page).toBe(true);
  });

  it("has a name that fits a heading and a blurb that fits an index row", () => {
    expect(tool.name.length).toBeGreaterThan(2);
    expect(tool.name.length).toBeLessThanOrEqual(40);
    expect(tool.blurb.length).toBeGreaterThanOrEqual(40);
    expect(tool.blurb.length).toBeLessThanOrEqual(220);
    expect(tool.blurb).not.toContain("\n");
  });

  it("says what it cannot see", () => {
    // Design section 6: the "can't see" lines are part of the deliverable and
    // a reviewer checks them against the code.
    expect(tool.cantSee.length).toBeGreaterThan(0);
    for (const line of tool.cantSee) {
      expect(line.length).toBeGreaterThanOrEqual(20);
      expect(line).toBe(line.trim());
    }
  });

  it("declares where it runs", () => {
    expect(["browser", "server"]).toContain(tool.privacy);
  });
});

describe("tool shell copy", () => {
  it("carries both privacy lines verbatim from the programme interface", () => {
    expect(toolShellCopy.privacy.browser).toBe("Runs in your browser. Nothing leaves this tab.");
    expect(toolShellCopy.privacy.server).toBe(
      "Runs on the server. Keeps a hashed IP for a day, nothing else.",
    );
  });
});

describe("relief", () => {
  it("is registered, live, and browser-side", () => {
    const t = toolBySlug("relief");
    expect(t?.status).toBe("live");
    expect(t?.privacy).toBe("browser");
  });

  /**
   * The one path that leaves the tab is GitHub, and the shell's browser line
   * would be false about it. The note is what makes the page honest, so its
   * absence is a test failure rather than a missing nicety.
   */
  it("corrects the browser privacy line where GitHub is concerned", () => {
    const note = toolBySlug("relief")?.privacyLine ?? "";
    expect(note).toContain("api.github.com");
    expect(note.length).toBeGreaterThan(60);
    expect(note).not.toContain("Nothing leaves this tab");
  });

  it("limits export claims to properties checked from the files", () => {
    const t = toolBySlug("relief");
    const words = [t?.blurb, reliefCopy.description, reliefCopy.plotterNote, reliefCopy.stlNote].join(" ");
    expect(words).not.toMatch(/printer can|printable|plotter can draw/i);
    expect(words).toMatch(/millimetres/i);
    expect(words).toMatch(/edge check/i);
  });

  it("says the two things the design fixed as can't-see lines", () => {
    const lines = (toolBySlug("relief")?.cantSee ?? []).join(" ");
    expect(lines).toMatch(/private/i);
    expect(lines).toMatch(/local time|local clock/i);
  });
});
