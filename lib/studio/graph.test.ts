import { describe, it, expect } from "vitest";
import { buildGraph, canonicalPath, parseGraph, type AtlasFile } from "./graph";
const file = (path: string, text = ""): AtlasFile => ({
  path,
  text,
  size: text.length,
  kind: "text",
  status: "read",
});
describe("Atlas evidence", () => {
  it("resolves relative references and wikilinks without inventing missing nodes", () => {
    const g = buildGraph([
      file("notes/start.md", "[[Plan]] [source](../src/index.ts) [[Absent]]"),
      file("notes/Plan.md"),
      file("src/index.ts"),
    ]);
    const links = g.links.filter((l) => l.kind === "reference");
    expect(links.map((l) => l.target).sort()).toEqual([
      "notes/Plan.md",
      "src/index.ts",
    ]);
    expect(g.nodes.some((n) => n.id.includes("Absent"))).toBe(false);
  });
  it("keeps binary files and explains word overlap", () => {
    const g = buildGraph([
      file("a.md", "phosphor magnet persistence phosphor"),
      file("b.md", "phosphor magnet electron"),
      { ...file("photo.jpg"), kind: "image", status: "metadata" },
    ]);
    expect(g.nodes.find((n) => n.id === "photo.jpg")?.kind).toBe("image");
    expect(g.links.find((l) => l.kind === "terms")?.evidence).toContain(
      "magnet",
    );
  });
  it("canonicalises paths but rejects traversal above the root", () => {
    expect(canonicalPath("a/../b\\c.txt")).toBe("b/c.txt");
    expect(() => canonicalPath("../secrets")).toThrow();
  });
  it("rejects duplicate paths and over-sized saved maps", () => {
    expect(() => buildGraph([file("a"), file("a")])).toThrow(/duplicate/i);
    expect(() =>
      parseGraph(
        JSON.stringify({ format: "atlas-v1", files: [{ path: "../bad" }] }),
      ),
    ).toThrow();
    const files = [file("hello.md", "world")];
    expect(parseGraph(JSON.stringify({ format: "atlas-v1", files }))).toEqual(
      files,
    );
  });
});
