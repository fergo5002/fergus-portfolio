import { describe, it, expect } from "vitest";
import {
  parseInline,
  parseMarkdown,
  slugify,
  toPlainText,
  tableOfContents,
  type Block,
} from "./markdown";

const heading = (b: Block[]) => b.filter((x) => x.type === "heading");

describe("parseInline", () => {
  it("returns a single text node for plain prose", () => {
    expect(parseInline("just words")).toEqual([{ type: "text", value: "just words" }]);
  });

  it("parses strong, emphasis, code and links", () => {
    expect(parseInline("**a**")).toEqual([{ type: "strong", value: "a" }]);
    expect(parseInline("*a*")).toEqual([{ type: "em", value: "a" }]);
    expect(parseInline("`a`")).toEqual([{ type: "code", value: "a" }]);
    expect(parseInline("[a](/b)")).toEqual([{ type: "link", value: "a", href: "/b" }]);
  });

  it("keeps the text around a marker", () => {
    expect(parseInline("go **now** please")).toEqual([
      { type: "text", value: "go " },
      { type: "strong", value: "now" },
      { type: "text", value: " please" },
    ]);
  });

  it("treats markers inside code as literal content", () => {
    // The whole point of scanning code first. If emphasis won here, a line
    // documenting a glob or a pointer would silently lose characters.
    expect(parseInline("`**argv`")).toEqual([{ type: "code", value: "**argv" }]);
    expect(parseInline("use `a * b` here")).toEqual([
      { type: "text", value: "use " },
      { type: "code", value: "a * b" },
      { type: "text", value: " here" },
    ]);
  });

  it("prefers strong over two emphases", () => {
    expect(parseInline("**both**")).toEqual([{ type: "strong", value: "both" }]);
  });

  it("handles several markers on one line", () => {
    expect(parseInline("**a** and *b* and `c`")).toHaveLength(5);
  });

  it("leaves an unmatched marker as text rather than throwing", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ type: "text", value: "2 * 3 = 6" }]);
    expect(parseInline("a ** b")).toEqual([{ type: "text", value: "a ** b" }]);
  });

  it("does not let emphasis run across a newline", () => {
    const nodes = parseInline("a * b\nc * d");
    expect(nodes.every((n) => n.type === "text")).toBe(true);
  });

  it("is stateless across calls", () => {
    // A module-level /g regex that is not reset returns different results on
    // the second call for the same input. Guard it.
    const once = parseInline("**a** b **c**");
    const twice = parseInline("**a** b **c**");
    expect(twice).toEqual(once);
  });
});

describe("parseMarkdown blocks", () => {
  it("parses headings with anchor ids", () => {
    const blocks = parseMarkdown("## The Big Idea\n### Sub, part two");
    expect(heading(blocks)).toEqual([
      { type: "heading", level: 2, id: "the-big-idea", inline: [{ type: "text", value: "The Big Idea" }] },
      { type: "heading", level: 3, id: "sub-part-two", inline: [{ type: "text", value: "Sub, part two" }] },
    ]);
  });

  it("strips inline markers out of anchor ids", () => {
    const [h] = heading(parseMarkdown("## The `argv` trap"));
    expect(h.type === "heading" && h.id).toBe("the-argv-trap");
  });

  it("ignores a single hash, since the title is the h1", () => {
    const blocks = parseMarkdown("# not a heading here");
    expect(blocks[0].type).toBe("paragraph");
  });

  it("joins wrapped lines into one paragraph", () => {
    const blocks = parseMarkdown("one line\nand its wrap\n\nsecond para");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type === "paragraph" && blocks[0].inline[0].value).toBe(
      "one line and its wrap",
    );
  });

  it("parses unordered and ordered lists", () => {
    const un = parseMarkdown("- one\n- two");
    expect(un[0]).toMatchObject({ type: "list", ordered: false });
    expect(un[0].type === "list" && un[0].items).toHaveLength(2);

    const or = parseMarkdown("1. one\n2. two");
    expect(or[0]).toMatchObject({ type: "list", ordered: true });
  });

  it("attaches an indented continuation to the item above", () => {
    const blocks = parseMarkdown("- one\n  wrapped\n- two");
    const list = blocks[0];
    expect(list.type === "list" && list.items).toHaveLength(2);
    expect(list.type === "list" && list.items[0].map((n) => n.value).join("")).toBe("one wrapped");
  });

  it("parses fenced code and keeps it verbatim", () => {
    const blocks = parseMarkdown("```ts\nconst a = **1;\n```");
    expect(blocks[0]).toEqual({ type: "code", lang: "ts", value: "const a = **1;" });
  });

  it("closes an unterminated fence at the end of the document", () => {
    const blocks = parseMarkdown("```\nno end");
    expect(blocks[0]).toEqual({ type: "code", lang: "", value: "no end" });
  });

  it("does not parse block syntax inside a fence", () => {
    const blocks = parseMarkdown("```\n## not a heading\n- not a list\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
  });

  it("parses a multi-line blockquote as one quote", () => {
    const blocks = parseMarkdown("> first\n> second");
    expect(blocks[0]).toMatchObject({ type: "quote" });
    expect(blocks[0].type === "quote" && blocks[0].inline[0].value).toBe("first second");
  });

  it("parses a thematic break", () => {
    expect(parseMarkdown("---")[0]).toEqual({ type: "rule" });
  });

  it("ends a paragraph when a new block starts without a blank line", () => {
    const blocks = parseMarkdown("some prose\n## heading");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "heading"]);
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n   \n")).toEqual([]);
  });

  it("normalises CRLF", () => {
    expect(parseMarkdown("a\r\n\r\nb")).toHaveLength(2);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Big Idea")).toBe("the-big-idea");
  });
  it("collapses runs and trims edges", () => {
    expect(slugify("  What's --- next?  ")).toBe("what-s-next");
  });
});

describe("toPlainText", () => {
  it("flattens prose and drops code", () => {
    const text = toPlainText("## Title\n\nSome **bold** prose.\n\n```\ncode()\n```\n\n- item");
    expect(text).toBe("Title Some bold prose. item");
  });
});

describe("tableOfContents", () => {
  it("lists headings with ids and levels", () => {
    expect(tableOfContents("## One\n\ntext\n\n### Two")).toEqual([
      { id: "one", text: "One", level: 2 },
      { id: "two", text: "Two", level: 3 },
    ]);
  });
});
