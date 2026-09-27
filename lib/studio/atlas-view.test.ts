import { describe, expect, it } from "vitest";
import { atlasExample } from "@/content/studio/atlas";
import { atlasCopy } from "@/content/studio/atlas-copy";
import { buildGraph, type AtlasFile } from "./graph";
import {
  PREVIEW_CHARS,
  RELATED_LIMIT,
  findNodes,
  inspect,
  litSet,
  mapSummary,
  neighbourhood,
  readingFor,
  searchTerms,
  typesOf,
} from "./atlas-view";

const file = (path: string, text = "", extra: Partial<AtlasFile> = {}): AtlasFile => ({
  path,
  text,
  size: text.length,
  kind: path.split(".").pop() ?? "file",
  status: "read",
  ...extra,
});

const example = buildGraph(atlasExample);
const ALL = ["folder", "reference", "terms"];

describe("find: the command line on the stage", () => {
  it("splits a query into lower-case terms and ignores the spacing", () => {
    expect(searchTerms("  Morning   SWIM ")).toEqual(["morning", "swim"]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("needs every term, each in the path or the text", () => {
    const g = buildGraph([
      file("notes/tide.md", "the morning swim"),
      file("notes/swim.md", "evening only"),
      file("notes/morning.md", "nothing here"),
    ]);
    expect(findNodes(g.nodes, "morning swim", "all").map((n) => n.id)).toEqual(["notes/tide.md"]);
    // A term found in the path and the other in the text still counts.
    expect(findNodes(g.nodes, "swim evening", "all").map((n) => n.id)).toEqual(["notes/swim.md"]);
  });

  it("puts a hit in the path above a hit only in the text", () => {
    const g = buildGraph([file("a/zebra.md", "phosphor"), file("b/phosphor.md", "nothing")]);
    expect(findNodes(g.nodes, "phosphor", "all").map((n) => n.id)).toEqual(["b/phosphor.md", "a/zebra.md"]);
  });

  it("filters by type, and an empty query lists every node of that type in path order", () => {
    const g = buildGraph([file("b.md", "x"), file("a.md", "x"), file("c.png", "", { kind: "image", status: "metadata" })]);
    expect(findNodes(g.nodes, "", "md").map((n) => n.id)).toEqual(["a.md", "b.md"]);
    expect(findNodes(g.nodes, "", "image").map((n) => n.id)).toEqual(["c.png"]);
    expect(findNodes(g.nodes, "", "all")).toHaveLength(3);
  });

  it("finds the example's own note the way a visitor types it", () => {
    expect(findNodes(example.nodes, "Morning swim", "all")[0].id).toBe("Coast/Morning swim.md");
  });

  it("lights nothing while there is nothing to find, and exactly the matches once there is", () => {
    expect(litSet(example.nodes, "", "all")).toBeNull();
    expect(litSet(example.nodes, "   ", "all")).toBeNull();
    const lit = litSet(example.nodes, "tide", "all");
    expect(lit).not.toBeNull();
    expect([...lit!].sort()).toEqual(findNodes(example.nodes, "tide", "all").map((n) => n.id).sort());
    // A type on its own lights that type.
    expect([...litSet(example.nodes, "", "image")!]).toEqual(["Sketches/studio.png"]);
  });

  it("lists the types a map holds, sorted, once each", () => {
    expect(typesOf(example.nodes)).toEqual(["audio", "folder", "image", "md"]);
  });
});

describe("pointing at a node", () => {
  it("lights the node and the neighbours reached by the kinds on show", () => {
    const g = buildGraph([
      file("n/a.md", "[[b]] phosphor magnet"),
      file("n/b.md", "phosphor magnet"),
      file("m/c.md", "nothing"),
    ]);
    expect([...neighbourhood(g, "n/a.md", ALL)].sort()).toEqual(["folder:n", "n/a.md", "n/b.md"]);
    expect([...neighbourhood(g, "n/a.md", ["reference"])].sort()).toEqual(["n/a.md", "n/b.md"]);
    expect([...neighbourhood(g, "n/a.md", [])]).toEqual(["n/a.md"]);
    expect(neighbourhood(g, "", ALL).size).toBe(0);
  });

  it("reads a file as its name, its type and the connections that are not folders", () => {
    const g = buildGraph([file("n/a.md", "[[b]] [[c]]"), file("n/b.md"), file("n/c.md")]);
    const reading = readingFor(g, "n/a.md")!;
    expect(reading).toEqual({ label: "a.md", kind: "md", count: 2, folder: false });
    expect(atlasCopy.reading(reading)).toBe("a.md · md · 2 connections");
    expect(atlasCopy.reading(readingFor(g, "n/b.md")!)).toBe("b.md · md · 1 connection");
  });

  it("reads a folder as the files in it", () => {
    const g = buildGraph([file("n/a.md"), file("n/b.md")]);
    expect(atlasCopy.reading(readingFor(g, "folder:n")!)).toBe("n · folder · 2 files");
    expect(readingFor(g, "missing")).toBeNull();
  });
});

describe("the map in figures", () => {
  it("counts files, the ones with text and the connections that are not folders", () => {
    expect(mapSummary(atlasExample, example)).toEqual({
      files: 34,
      read: 32,
      metadata: 2,
      connections: example.links.filter((l) => l.kind !== "folder").length,
    });
    expect(atlasCopy.summary(mapSummary(atlasExample, example))).toMatch(/^34 files · 32 read · \d+ connections$/);
  });
});

describe("the inspector", () => {
  it("says what the file is, how it was read and why each neighbour is connected", () => {
    const g = buildGraph([
      file("n/a.md", "[[b]] phosphor magnet orchid", { note: "Text truncated." }),
      file("n/b.md", "phosphor magnet orchid"),
    ]);
    const view = inspect(g, "n/a.md")!;
    expect(view.label).toBe("a.md");
    expect(view.path).toBe("n/a.md");
    expect(view.read).toBe(true);
    expect(view.note).toBe("Text truncated.");
    expect(view.text).toContain("phosphor");
    expect(view.clipped).toBe(false);
    // References first, then shared words, then the folder it sits in.
    expect(view.related.map((r) => r.kind)).toEqual(["reference", "terms", "folder"]);
    expect(view.related[0]).toMatchObject({ id: "n/b.md", label: "b.md", evidence: "Reference: b" });
    expect(view.related[2]).toMatchObject({ id: "folder:n", label: "n" });
    expect(view.total).toBe(3);
  });

  it("clips a long text and a long neighbour list, and says so", () => {
    const long = file("big.md", "x".repeat(PREVIEW_CHARS + 10));
    const many = Array.from({ length: RELATED_LIMIT + 5 }, (_, i) => file(`d/n${i}.md`));
    const g = buildGraph([long, ...many]);
    const big = inspect(g, "big.md")!;
    expect(big.text).toHaveLength(PREVIEW_CHARS);
    expect(big.clipped).toBe(true);
    const folder = inspect(g, "folder:d")!;
    expect(folder.folder).toBe(true);
    expect(folder.related).toHaveLength(RELATED_LIMIT);
    expect(folder.total).toBe(RELATED_LIMIT + 5);
  });

  it("marks a metadata-only file as unread and returns nothing for a missing id", () => {
    const g = buildGraph([file("p.png", "", { kind: "image", status: "metadata" })]);
    expect(inspect(g, "p.png")!.read).toBe(false);
    expect(inspect(g, "nope")).toBeNull();
  });
});
