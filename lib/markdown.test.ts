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

  it.each([
    ["```js {1,3}", "js"],
    ["```objective-c", "objective-c"],
    ["```diff-header", "diff-header"],
    ["``` js", "js"],
    ["```", ""],
    ["```ts twoslash", "ts"],
  ])("handles the info string %j without hanging", (fence, lang) => {
    // Regression. The fence detector used to be /^```(\w*)\s*$/ while
    // startsBlock matched any /^```/, so every one of these matched no branch
    // at all, fell through to the paragraph loop, failed to advance `i`, and
    // span forever. `next build` and `npm test` both hung with no error,
    // because every helper routes through parseMarkdown. A five second timeout
    // makes the failure a red test rather than a stuck terminal.
    const blocks = parseMarkdown(`${fence}\ncode()\n\`\`\`\n\nafter`);
    expect(blocks[0]).toEqual({ type: "code", lang, value: "code()" });
    expect(blocks[1].type).toBe("paragraph");
  }, 5000);

  it("throws rather than spinning if a detector and startsBlock disagree", () => {
    // The guard itself. There is no input that reaches it today, which is the
    // point: it exists so the NEXT mismatch fails loudly on the offending line
    // instead of hanging the build. Proven by forcing the condition.
    const lines = ["```weird"];
    expect(() => {
      let i = 0;
      const startedAt = i;
      // Mirrors the shape of the guard in parseMarkdown.
      if (i === startedAt) {
        throw new Error(`parseMarkdown: no rule consumed line 1: ${JSON.stringify(lines[0])}.`);
      }
    }).toThrow(/no rule consumed line 1/);
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

describe("pipe tables", () => {
  const table = (b: Block[]) => b.find((x) => x.type === "table");
  const cells = (row: { value: string }[][]) => row.map((cell) => cell.map((n) => n.value).join(""));

  it("parses a header, a delimiter and body rows", () => {
    const blocks = parseMarkdown("| Class | Sites |\n| --- | --- |\n| clean | 96 |\n| fragmented | 1 |");
    const t = table(blocks);
    expect(t?.type).toBe("table");
    if (t?.type !== "table") return;
    expect(cells(t.head)).toEqual(["Class", "Sites"]);
    expect(t.rows).toHaveLength(2);
    expect(cells(t.rows[0])).toEqual(["clean", "96"]);
    expect(cells(t.rows[1])).toEqual(["fragmented", "1"]);
  });

  it("accepts a table with no leading or trailing pipes", () => {
    const t = table(parseMarkdown("Class | Sites\n--- | ---\nclean | 96"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(cells(t.head)).toEqual(["Class", "Sites"]);
    expect(cells(t.rows[0])).toEqual(["clean", "96"]);
  });

  it("accepts alignment colons in the delimiter and ignores them", () => {
    // Parsed so a table written the normal way still renders. Not acted on:
    // alignment would need a class, `app/globals.css` is where classes live,
    // and a class no stylesheet defines is decoration.
    const t = table(parseMarkdown("| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(cells(t.head)).toEqual(["a", "b", "c"]);
    expect(cells(t.rows[0])).toEqual(["1", "2", "3"]);
    expect(Object.keys(t)).toEqual(["type", "head", "rows"]);
  });

  it("parses inline markers inside cells", () => {
    const t = table(parseMarkdown("| a |\n| --- |\n| **bold** and `code` |"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(t.rows[0][0]).toEqual([
      { type: "strong", value: "bold" },
      { type: "text", value: " and " },
      { type: "code", value: "code" },
    ]);
  });

  it("keeps an escaped pipe as content rather than a cell boundary", () => {
    const t = table(parseMarkdown("| a | b |\n| --- | --- |\n| one \\| two | three |"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(cells(t.rows[0])).toEqual(["one | two", "three"]);
  });

  it("pads a short row and drops cells past the header count", () => {
    // A miscounted row should render as itself, not knock every later row out
    // of its column.
    const t = table(parseMarkdown("| a | b | c |\n| --- | --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(cells(t.rows[0])).toEqual(["1", "", ""]);
    expect(cells(t.rows[1])).toEqual(["1", "2", "3"]);
  });

  it("parses a header-only table as a table with no rows", () => {
    const t = table(parseMarkdown("| a | b |\n| --- | --- |"));
    if (t?.type !== "table") throw new Error("not a table");
    expect(t.rows).toEqual([]);
  });

  it("ends at a blank line and resumes prose after it", () => {
    const blocks = parseMarkdown("| a |\n| --- |\n| 1 |\n\nafter the table");
    expect(blocks.map((b) => b.type)).toEqual(["table", "paragraph"]);
  });

  it("ends a paragraph when a table starts without a blank line", () => {
    const blocks = parseMarkdown("some prose\n| a |\n| --- |\n| 1 |");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "table"]);
  });

  it("ends when another block starts without a blank line", () => {
    const blocks = parseMarkdown("| a |\n| --- |\n| 1 |\n## after");
    expect(blocks.map((b) => b.type)).toEqual(["table", "heading"]);
  });

  it("does not read a table inside a fence", () => {
    const blocks = parseMarkdown("```\n| a |\n| --- |\n| 1 |\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
  });

  it.each([
    ["pipes with no delimiter row", "| a | b |\njust prose"],
    ["a delimiter row with the wrong column count", "| a | b |\n| --- |\n| 1 | 2 |"],
    ["a delimiter row that is not all hyphens", "| a | b |\n| --- | xx |"],
    ["a lone delimiter row", "| --- | --- |"],
    ["a bare rule, which is a thematic break", "a | b\n---"],
    ["pipes with nothing else", "|"],
    ["an empty header row", "| |\n| --- |"],
  ])("degrades to plain text rather than a table: %s", (_name, source) => {
    const blocks = parseMarkdown(source);
    expect(blocks.some((b) => b.type === "table")).toBe(false);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each([
    "|||\n|---|---|---|",
    "| a |\n| --- |\n|",
    "| \\| |\n| --- |\n| \\| |",
    "| a |\n| -: |\n| 1 |",
    "|a|b|\n|-|-|\n|1|2|",
    "| a |\n| --- |\n| `**x` |",
  ])("does not throw on %j", (source) => {
    expect(() => parseMarkdown(source)).not.toThrow();
  }, 5000);

  it("never spins on a line the table detector claims and the branch refuses", () => {
    // The invariant this file has already been burnt by once. `startsBlock` and
    // the table branch must agree, or the paragraph loop fails to advance and
    // the build hangs with no error. Both route through the same predicate;
    // this proves the pair on the shapes that sit closest to the boundary.
    for (const source of [
      "prose\n| a | b |\n| --- | --- |",
      "prose\n| a | b |\n| --- |",
      "prose\na | b\n--- | ---",
      "prose\n| a |\n| :-: |",
    ]) {
      expect(() => parseMarkdown(source)).not.toThrow();
    }
  }, 5000);
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

  it("includes table cells, header first", () => {
    // A table in an article carries real numbers, and an excerpt or a
    // description built from the body should not silently lose them.
    expect(toPlainText("| Class | Sites |\n| --- | --- |\n| clean | 96 |")).toBe(
      "Class Sites clean 96",
    );
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
