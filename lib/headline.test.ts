import { describe, expect, it } from "vitest";
import { CHARACTER_ELEMENT_FLOOR, checkHtml, classify, extractHeading } from "./headline";

/**
 * The parser behind `/tools/headline-check`.
 *
 * Every case here is a shape that exists on real sites, and three of them are
 * shapes this site shipped: the per-character hero name, the word wrappers
 * around it, and the empty heading a client render fills in later.
 *
 * The assertions are deliberately about the two strings rather than about the
 * verdict alone. A verdict is a label, and a label is easy to make pass by
 * loosening a threshold; the strings are what the tool shows a visitor and what
 * it would be caught lying about.
 */

const page = (body: string) =>
  `<!doctype html><html><head><title>Ignore me</title></head><body>${body}</body></html>`;

/** The site's own hero, as React renders it: no whitespace between the spans. */
const perCharacter = (word: string, cls = "ch") =>
  [...word].map((c) => `<span class="${cls}">${c}</span>`).join("");

describe("extractHeading: finding the heading", () => {
  it("reads a plain h1 as one contiguous string", () => {
    const h = extractHeading(page("<h1>Patrick Fergus O'Reilly</h1>"));
    expect(h?.tag).toBe("h1");
    expect(h?.level).toBe(1);
    expect(h?.browserText).toBe("Patrick Fergus O'Reilly");
    expect(h?.crawlerText).toBe("Patrick Fergus O'Reilly");
    expect(h?.childElements).toBe(0);
    expect(h?.characterElements).toBe(0);
  });

  it("ignores the case of the tag and anything in its attributes", () => {
    const h = extractHeading(page('<H1 CLASS="hero" data-x="1" >Headline</H1 >'));
    expect(h?.browserText).toBe("Headline");
  });

  it("takes the first h1 when a page carries more than one", () => {
    const h = extractHeading(page("<h1>First</h1><h1>Second</h1>"));
    expect(h?.browserText).toBe("First");
  });

  it("never reads an h1 out of a script, a style block or a comment", () => {
    const html = page(
      `<script>var t = "<h1>From JavaScript</h1>";</script>` +
        `<style>h1::before { content: "<h1>From CSS</h1>"; }</style>` +
        `<!-- <h1>From a comment</h1> -->` +
        `<h1>The real one</h1>`,
    );
    expect(extractHeading(html)?.browserText).toBe("The real one");
  });

  it("falls back to the largest heading present when there is no h1", () => {
    // h3 first in document order, h2 later: the fallback is about rank, not
    // position, so it has to pick the h2.
    const h = extractHeading(page("<h3>Small</h3><h2>Bigger</h2>"));
    expect(h?.tag).toBe("h2");
    expect(h?.level).toBe(2);
    expect(h?.browserText).toBe("Bigger");
  });

  it("returns null when the document has no heading at all", () => {
    expect(extractHeading(page('<div id="root"></div>'))).toBeNull();
  });

  it("decodes the character references a heading actually contains", () => {
    const h = extractHeading(page("<h1>Caf&#233; &amp; Bar &#x2019;26</h1>"));
    expect(h?.browserText).toBe("Café & Bar ’26");
  });

  it("leaves an entity it does not know exactly as it found it", () => {
    // Guessing at an unknown entity would put characters in the output that are
    // not in the page, which is the one thing a tool like this may not do.
    expect(extractHeading(page("<h1>Caf&eacute;</h1>"))?.browserText).toBe("Caf&eacute;");
  });

  it("collapses the whitespace a formatter left in the markup", () => {
    const h = extractHeading(page("<h1>\n  Room to\n  breathe\n</h1>"));
    expect(h?.browserText).toBe("Room to breathe");
  });
});

describe("extractHeading: markup that is wrong on purpose", () => {
  it("recovers when the h1 is never closed", () => {
    const h = extractHeading(page("<h1>Unclosed heading<div>Body copy</div>"));
    expect(h?.browserText).toBe("Unclosed heading");
  });

  it("does not mistake a bare less-than sign for a tag", () => {
    const h = extractHeading(page("<h1>5 < 6 and that is that</h1>"));
    expect(h?.browserText).toBe("5 < 6 and that is that");
  });

  it("reads an attribute value containing a greater-than sign", () => {
    const h = extractHeading(page('<h1 data-sel="a > b">Selector</h1>'));
    expect(h?.browserText).toBe("Selector");
  });

  it("reads a greater-than sign in a child element's attribute too", () => {
    // A separate case from the one above, and it has to be: the heading's own
    // tag is located by one regex and its children are parsed by another, so a
    // test on the heading tag alone leaves the child parser unguarded.
    const h = extractHeading(page('<h1><span data-sel="a > b">Head</span>line</h1>'));
    expect(h?.browserText).toBe("Headline");
  });

  it("reads a close tag with whitespace before its bracket", () => {
    // Without that, the heading falls through to the unclosed recovery, which
    // cuts at the first block-level tag and would hand back nothing at all.
    const h = extractHeading(page("<h1><div>Top</div></h1 >"));
    expect(h?.browserText).toBe("Top");
  });

  it("ignores a close tag that matches nothing left open", () => {
    // The stray `</i>` must not close the span it sits inside. Closing it early
    // would put a word boundary in the middle of a word that has none, which is
    // the tool reporting a fault it invented itself.
    const h = extractHeading(
      page('<h1><span style="display:inline-block">Head</i>line</span></h1>'),
    );
    expect(h?.browserText).toBe("Headline");
    expect(h?.crawlerText).toBe("Headline");
  });

  it("survives a mismatched close tag", () => {
    const h = extractHeading(page("<h1><span>Hello</b> world</span></h1>"));
    expect(h?.browserText).toBe("Hello world");
  });

  it("survives a child element that is never closed", () => {
    const h = extractHeading(page("<h1><span>Hanging open</h1>"));
    expect(h?.browserText).toBe("Hanging open");
  });
});

describe("the crawler view: what makes a word boundary", () => {
  it("joins plain inline spans exactly the way a browser does", () => {
    const h = extractHeading(page('<h1><span class="a">Head</span><span class="a">line</span></h1>'));
    expect(h?.browserText).toBe("Headline");
    expect(h?.crawlerText).toBe("Headline");
    expect(h?.childElements).toBe(2);
  });

  it("treats an inline-block span as a boundary, and a browser does not", () => {
    // The first of the article's two causes. `transform` does nothing on a plain
    // inline element, so every split-text implementation reaches for this.
    const h = extractHeading(
      page(
        '<h1><span style="display:inline-block">Head</span>' +
          '<span style="display: inline-block;">line</span></h1>',
      ),
    );
    expect(h?.browserText).toBe("Headline");
    expect(h?.crawlerText).toBe("Head line");
  });

  it("leaves a span alone when its inline style says display:inline", () => {
    const h = extractHeading(page('<h1><span style="display:inline">Head</span>line</h1>'));
    expect(h?.crawlerText).toBe("Headline");
  });

  it("counts whitespace between spans as a boundary in both views", () => {
    // The article's second cause. A browser renders that newline as a space too,
    // so this one is visible on the page as well as in the extraction.
    const h = extractHeading(page("<h1>\n  <span>Head</span>\n  <span>line</span>\n</h1>"));
    expect(h?.browserText).toBe("Head line");
    expect(h?.crawlerText).toBe("Head line");
  });

  it("treats a div inside a heading as a boundary in both views", () => {
    const h = extractHeading(page("<h1><div>Top</div><div>Bottom</div></h1>"));
    expect(h?.browserText).toBe("Top Bottom");
    expect(h?.crawlerText).toBe("Top Bottom");
  });

  it("treats a br as a boundary in both views", () => {
    const h = extractHeading(page("<h1>Line one<br>line two</h1>"));
    expect(h?.browserText).toBe("Line one line two");
    expect(h?.crawlerText).toBe("Line one line two");
  });

  it("fragments a per-character heading, which is the whole point", () => {
    const h = extractHeading(page(`<h1>${perCharacter("Patrick")}</h1>`));
    expect(h?.browserText).toBe("Patrick");
    expect(h?.crawlerText).toBe("P a t r i c k");
    expect(h?.childElements).toBe(7);
    expect(h?.characterElements).toBe(7);
  });

  it("fragments a per-character heading wrapped in per-word spans", () => {
    // What this site actually renders once HeroName swaps its layer in: words
    // are grouped so a line cannot break mid-word, and the letters live inside.
    const words = ["Patrick", "Fergus"]
      .map((w) => `<span class="w">${perCharacter(w)}</span>`)
      .join('<span class="ch"> </span>');
    const h = extractHeading(page(`<h1>${words}</h1>`));
    expect(h?.browserText).toBe("Patrick Fergus");
    expect(h?.crawlerText).toBe("P a t r i c k F e r g u s");
    // Two word wrappers and the space between them.
    expect(h?.childElements).toBe(3);
    // Counted through the wrappers: the evidence is the letters, not the depth.
    expect(h?.characterElements).toBe(13);
  });

  it("does not count a single-character element holding only a space", () => {
    const h = extractHeading(page('<h1><span>Head</span><span> </span><span>line</span></h1>'));
    expect(h?.characterElements).toBe(0);
    expect(h?.browserText).toBe("Head line");
  });
});

describe("classify: the verdict and its evidence", () => {
  it("calls a plain heading clean, and offers no fragmented string", () => {
    const report = checkHtml(page("<h1>Patrick Fergus O'Reilly</h1>"));
    expect(report.verdict).toBe("clean");
    expect(report.fragmentedText).toBeNull();
  });

  it("calls a per-character heading fragmented and hands back the evidence", () => {
    const report = checkHtml(page(`<h1>${perCharacter("Patrick")}</h1>`));
    expect(report.verdict).toBe("fragmented");
    expect(report.fragmentedText).toBe("P a t r i c k");
    expect(report.characterElements).toBe(7);
    expect(report.childElements).toBe(7);
    expect(report.browserText).toBe("Patrick");
  });

  it("calls an inline-block heading fragmented with no character elements at all", () => {
    const report = checkHtml(
      page('<h1><span style="display:inline-block">Head</span>' +
        '<span style="display:inline-block">line</span></h1>'),
    );
    expect(report.verdict).toBe("fragmented");
    expect(report.characterElements).toBe(0);
    expect(report.fragmentedText).toBe("Head line");
  });

  it("flags a split heading even when the browser view is fragmented too", () => {
    // Whitespace between the spans, so both views read the same and a
    // difference test alone would call this clean. It is not clean.
    const spans = [..."Patrick"].map((c) => `<span>${c}</span>`).join("\n");
    const report = checkHtml(page(`<h1>${spans}</h1>`));
    expect(report.browserText).toBe(report.crawlerText);
    expect(report.verdict).toBe("fragmented");
  });

  it("treats two single-character elements as markup rather than a split", () => {
    // Superscripts, currency symbols and initials are not split text, and a
    // tool that shouts at them gets closed.
    const report = checkHtml(page("<h1>x<sup>2</sup>+y<sup>2</sup></h1>"));
    expect(report.characterElements).toBe(2);
    expect(report.verdict).toBe("clean");
  });

  it("puts the floor at three, so two is never enough on its own", () => {
    // Asserted separately from the case above, which would otherwise fail on
    // this constant before it ever reached the behaviour it is really about.
    expect(CHARACTER_ELEMENT_FLOOR).toBe(3);
  });

  it("reports no h1 when the markup has none", () => {
    const report = checkHtml(page('<div id="root"></div>'));
    expect(report.verdict).toBe("no-h1-in-html");
    expect(report.tag).toBeNull();
    expect(report.browserText).toBe("");
  });

  it("reports no h1 when the h1 is an empty shell for a client render", () => {
    // The tag is there and the words are not, which for anything that reads the
    // served HTML is the same as having no headline.
    const report = checkHtml(page('<h1 class="hero"></h1><div id="root"></div>'));
    expect(report.verdict).toBe("no-h1-in-html");
    expect(report.tag).toBe("h1");
  });

  it("reports no h1 when the biggest heading on the page is an h2", () => {
    const report = checkHtml(page("<h2>Second rank</h2>"));
    expect(report.verdict).toBe("no-h1-in-html");
    expect(report.tag).toBe("h2");
    // The evidence still comes back: what was found is worth showing.
    expect(report.browserText).toBe("Second rank");
  });

  it("still measures a fragmented h2, so the fallback is not a dead end", () => {
    const report = checkHtml(page(`<h2>${perCharacter("Split")}</h2>`));
    expect(report.verdict).toBe("no-h1-in-html");
    expect(report.crawlerText).toBe("S p l i t");
    expect(report.characterElements).toBe(5);
  });

  it("classifies a null heading without being handed a document", () => {
    const report = classify(null);
    expect(report.verdict).toBe("no-h1-in-html");
    expect(report.childElements).toBe(0);
  });

  it("says nothing about a document that is empty", () => {
    expect(checkHtml("").verdict).toBe("no-h1-in-html");
  });
});

describe("checkHtml: whole documents", () => {
  it("passes a real, plain page", () => {
    const html = page(
      `<header><nav><a href="/">Home</a></nav></header>` +
        `<main><h1>Your split-text animation is eating your headline</h1>` +
        `<p>Body copy that mentions h1 in passing.</p></main>`,
    );
    const report = checkHtml(html);
    expect(report.verdict).toBe("clean");
    expect(report.browserText).toBe("Your split-text animation is eating your headline");
  });

  it("fails the page this whole tool was written about", () => {
    const html = page(
      `<h1 class="hero__name" aria-label="Patrick Fergus O'Reilly">` +
        [..."Patrick"]
          .map((c) => `<span class="ch" style="display:inline-block">${c}</span>`)
          .join("") +
        `</h1>`,
    );
    const report = checkHtml(html);
    expect(report.verdict).toBe("fragmented");
    expect(report.crawlerText).toBe("P a t r i c k");
    // aria-label is an accessibility property, not content. The tool must not
    // read it, because the extractors this models have no reason to either.
    expect(report.browserText).toBe("Patrick");
  });

  it("passes the fix from the article: a whole copy beside the animated one", () => {
    const html = page(
      `<h1><span class="visually-hidden">Patrick Fergus</span>` +
        `<span aria-hidden="true">${perCharacter("Patrick Fergus")}</span></h1>`,
    );
    const report = checkHtml(html);
    // The whole string survives the extraction, which is the claim the fix
    // makes. It is still reported as fragmented, because the letters are still
    // there and a reader deserves to see both strings and judge.
    expect(report.browserText.startsWith("Patrick Fergus")).toBe(true);
    expect(report.crawlerText.startsWith("Patrick Fergus")).toBe(true);
  });
});
