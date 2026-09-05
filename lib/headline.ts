/**
 * Reads a page's headline twice: once the way a browser paints it, and once the
 * way something that only strips tags out of HTML would.
 *
 * This is the machine behind `/tools/headline-check`, and it exists because the
 * bug it looks for shipped on this site. The hero name animates one character
 * per element, and for a while the most important string on the domain
 * extracted as `P a t r i c k  F e r g u s  O ' R e i l l y`. The article at
 * `/writing/split-text-is-costing-you-search` is the write-up; this module is
 * the same check, pointed at anyone else's page.
 *
 * **What the two views mean, precisely.** Both are models, and neither is a
 * claim about any named crawler:
 *
 *  - **Browser view.** Text nodes concatenated, source whitespace collapsed the
 *    way CSS collapses it, with a boundary wherever the markup genuinely breaks
 *    the line: a `div`, a `p`, a `br`. This is what a person sees.
 *  - **Crawler view.** The same, plus a boundary at every element that a naive
 *    HTML-to-text pass would separate. Two of those, and they are the two the
 *    article names: an inline element carrying a non-inline `display` in its
 *    `style` attribute, and an element holding a single character when the
 *    heading is built from three or more of them.
 *
 * **The limit worth stating out loud: this reads inline `style` attributes and
 * nothing else.** A `.ch { display: inline-block }` sitting in a stylesheet is
 * invisible here, because the stylesheet is a separate document and this module
 * is handed one string of HTML. The per-character rule is what covers that case
 * in practice, since split text is one element per letter however it is styled.
 * The page says so too: a tool that hides its blind spot is worse than no tool.
 *
 * No dependencies and no DOM. It runs in a `node` vitest environment, which is
 * the only way `lib/headline.test.ts` can drive twenty-odd malformed documents
 * through it in a few milliseconds.
 */

/**
 * How many single-character elements it takes before a heading is read as split
 * text rather than as ordinary markup.
 *
 * Three, because two is `x<sup>2</sup> + y<sup>2</sup>`, an initial in a name,
 * or a currency symbol in its own tag, and a tool that shouts at those gets
 * closed. Split text is one element per letter, so a real one clears this floor
 * several times over.
 */
export const CHARACTER_ELEMENT_FLOOR = 3;

export type Heading = {
  /** The tag actually read, lowercased: `h1` unless nothing better was there. */
  tag: string;
  /** 1 to 6. */
  level: number;
  /** What a person sees. */
  browserText: string;
  /** What a naive HTML-to-text pass gets. */
  crawlerText: string;
  /** Direct child elements of the heading. */
  childElements: number;
  /** Elements anywhere inside the heading holding exactly one character. */
  characterElements: number;
};

export type Verdict = "clean" | "fragmented" | "no-h1-in-html";

export type HeadingReport = {
  verdict: Verdict;
  tag: string | null;
  level: number | null;
  browserText: string;
  crawlerText: string;
  childElements: number;
  characterElements: number;
  /** The crawler view, but only when the verdict is that it is a problem. */
  fragmentedText: string | null;
};

/**
 * Elements that do not break a line, so a browser runs their text straight into
 * whatever sits beside them.
 *
 * Anything not on this list is treated as a boundary in **both** views, because
 * a `div` inside an `h1` really does break the line and reporting that as a
 * difference between the views would be a false alarm.
 */
const PLAIN_INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "data", "del", "dfn", "em", "font",
  "i", "ins", "kbd", "label", "mark", "nobr", "q", "rb", "rt", "ruby", "s", "samp", "small",
  "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "wbr",
]);

/** Elements with no closing tag, so nothing may be nested inside them. */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
  "source", "track", "wbr",
]);

/**
 * Where an unclosed heading is cut off.
 *
 * A missing `</h1>` is common enough in hand-written markup to be worth
 * recovering from rather than reporting as "no h1". The recovery is to read up
 * to the next thing that is unambiguously a new block, which is the same
 * decision a browser's parser makes, if by a much shorter route.
 */
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hgroup", "html", "li", "main", "nav", "ol", "p", "pre", "section", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // A plain space, not U+00A0. Every string this module hands back has been
  // through `normalise`, and JavaScript's `\s` covers the non-breaking space,
  // so the two are identical here and one of them is invisible in the source.
  // If anything ever reads a raw text node out of this parser, change it back.
  nbsp: " ",
};

/**
 * Turns character references into the characters they name.
 *
 * An entity this does not know is handed back exactly as it was found. Guessing
 * would put characters into the output that are not in the page, and inventing
 * content is the one thing a tool that reports on content may not do.
 */
function decode(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const hex = body[1] === "x" || body[1] === "X";
    const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
    try {
      return String.fromCodePoint(code);
    } catch {
      return whole;
    }
  });
}

/** CSS collapses runs of whitespace to one space and drops it at the edges. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

type TextNode = { kind: "text"; text: string };
type ElementNode = { kind: "element"; name: string; attrs: string; children: HNode[] };
type HNode = TextNode | ElementNode;

/**
 * One tag. The attribute group steps over quoted values so a `>` inside an
 * attribute (`data-sel="a > b"`) does not end the tag early, which it did in the
 * first version of this and quietly truncated the heading.
 * The alternatives must be disjoint: letting the plain branch consume quotes
 * makes an unfinished tag backtrack exponentially. The name boundary likewise
 * stops a long unfinished name being retried as every possible name/attribute split.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;

/**
 * Parses a fragment into a shallow tree.
 *
 * Deliberately forgiving, because the whole point is to run against pages
 * nobody validated. A close tag with nothing open matching it is dropped, a
 * child left open is closed by the end of the fragment, and a `<` that does not
 * begin a tag is text.
 */
function parse(html: string): HNode[] {
  const root: HNode[] = [];
  const stack: ElementNode[] = [];
  const here = () => (stack.length > 0 ? stack[stack.length - 1].children : root);
  const text = (raw: string) => {
    if (raw.length > 0) here().push({ kind: "text", text: decode(raw) });
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      text(html.slice(i));
      break;
    }
    if (lt > i) text(html.slice(i, lt));

    TAG.lastIndex = lt;
    const tag = TAG.exec(html);
    if (!tag) {
      // Not a tag at all, so it is a less-than sign somebody forgot to escape.
      text("<");
      i = lt + 1;
      continue;
    }

    const [whole, closing, rawName, attrs] = tag;
    const name = rawName.toLowerCase();
    i = lt + whole.length;

    if (closing) {
      // Unwind to the nearest matching open tag. Anything above it was left
      // open by the page and is closed here, which is what a browser does too.
      for (let d = stack.length - 1; d >= 0; d--) {
        if (stack[d].name === name) {
          stack.length = d;
          break;
        }
      }
      continue;
    }

    const node: ElementNode = { kind: "element", name, attrs, children: [] };
    here().push(node);
    if (!VOID.has(name) && !attrs.trimEnd().endsWith("/")) stack.push(node);
  }

  return root;
}

/** One attribute's value, unquoted. Only `style` is ever asked for. */
function attribute(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

/** A `div` in a heading breaks the line for everybody, reader and machine. */
function breaksForEveryone(node: ElementNode): boolean {
  return !PLAIN_INLINE.has(node.name);
}

/**
 * An inline element told to lay out as something other than inline.
 *
 * The first of the article's two causes: `transform` does nothing to a plain
 * inline box, so every split-text implementation sets `display: inline-block`,
 * and that is the moment the letters become boxes rather than a text run.
 */
function nonInlineDisplay(node: ElementNode): boolean {
  const style = attribute(node.attrs, "style");
  if (!style) return false;
  const m = /display\s*:\s*([a-zA-Z-]+)/i.exec(style);
  return m ? m[1].toLowerCase() !== "inline" : false;
}

type Reading = { browser: string; crawler: string; characters: number; single: boolean };

/**
 * Read each element once, from its leaves upwards. Re-rendering a child's text
 * to decide whether it is one character used to recurse exponentially through
 * nested spans. An explicit stack also accepts deep markup without consuming
 * the JavaScript call stack, including in the live browser editor.
 */
function readTree(nodes: HNode[]): Reading {
  const readings = new Map<ElementNode, Reading>();
  const order: ElementNode[] = [];
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.kind !== "element") continue;
    order.push(node);
    for (const child of node.children) pending.push(child);
  }

  function combine(children: HNode[]): Reading {
    const singles = children.filter((n) => n.kind === "element" && readings.get(n)!.single).length;
    const split = singles >= CHARACTER_ELEMENT_FLOOR;
    const browser: string[] = [];
    const crawler: string[] = [];
    let characters = 0;
    for (const node of children) {
      if (node.kind === "text") {
        browser.push(node.text);
        crawler.push(node.text);
        continue;
      }
      const inner = readings.get(node)!;
      const boundary = breaksForEveryone(node);
      const crawlerBoundary = boundary || nonInlineDisplay(node) || (split && inner.single);
      browser.push(boundary ? ` ${inner.browser} ` : inner.browser);
      crawler.push(crawlerBoundary ? ` ${inner.crawler} ` : inner.crawler);
      characters += inner.characters + Number(inner.single);
    }
    const visible = browser.join("");
    return { browser: visible, crawler: crawler.join(""), characters, single: normalise(visible).length === 1 };
  }

  for (let i = order.length - 1; i >= 0; i--) readings.set(order[i], combine(order[i].children));
  return combine(nodes);
}

/**
 * Drops the parts of a document that contain markup a browser never renders.
 *
 * A `<h1>` inside a script string or a comment is not a heading, and matching
 * one is how a checker ends up confidently reporting on a page's JavaScript.
 * `noscript` is deliberately left in: its contents are shown to a visitor with
 * scripting off and read by plenty of crawlers, so it is real content.
 */
function strip(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
}

/** The inner HTML of the first heading at this rank, or null if there is none. */
function headingInner(source: string, level: number): string | null {
  const open = new RegExp(`<h${level}(?:\\s(?:"[^"]*"|'[^']*'|[^>"'])*)?>`, "i");
  const found = open.exec(source);
  if (!found) return null;

  const rest = source.slice(found.index + found[0].length);
  const close = new RegExp(`</h${level}\\s*>`, "i").exec(rest);
  if (close) return rest.slice(0, close.index);

  // Never closed. Read up to the next block-level tag rather than swallowing
  // the remainder of the document.
  const scan = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)/g;
  let tag: RegExpExecArray | null;
  while ((tag = scan.exec(rest)) !== null) {
    if (BLOCK.has(tag[1].toLowerCase())) return rest.slice(0, tag.index);
  }
  return rest;
}

/**
 * The `<h1>`, or the largest heading the document does have.
 *
 * The fallback is about rank rather than position: an `h3` earlier in the
 * document does not outrank an `h2` further down, because the question being
 * answered is "what is this page's headline", not "what comes first".
 */
export function extractHeading(html: string): Heading | null {
  const source = strip(typeof html === "string" ? html : "");

  for (let level = 1; level <= 6; level++) {
    const inner = headingInner(source, level);
    if (inner === null) continue;
    const nodes = parse(inner);
    const reading = readTree(nodes);
    return {
      tag: `h${level}`,
      level,
      browserText: normalise(reading.browser),
      crawlerText: normalise(reading.crawler),
      childElements: nodes.filter((n) => n.kind === "element").length,
      characterElements: reading.characters,
    };
  }

  return null;
}

/**
 * The verdict, and the evidence it was reached on.
 *
 * Both halves matter. A verdict on its own is a label somebody has to trust,
 * and the numbers and the two strings are what let a visitor check it against
 * their own page instead.
 *
 * `no-h1-in-html` covers three shapes that are one problem: no heading at all,
 * an `h1` that is an empty shell for a client render, and a page whose largest
 * heading is an `h2`. In every one of them the served HTML carries no top-level
 * headline, which is the thing being reported. What was found is still
 * measured and returned, because "there is an h2 and it reads like this" is
 * more use than a shrug.
 */
export function classify(heading: Heading | null): HeadingReport {
  if (!heading) {
    return {
      verdict: "no-h1-in-html",
      tag: null,
      level: null,
      browserText: "",
      crawlerText: "",
      childElements: 0,
      characterElements: 0,
      fragmentedText: null,
    };
  }

  // Two independent signals, and the second is not redundant. A heading whose
  // spans are separated by newlines reads the same in both views, because a
  // browser renders that whitespace too, and a difference test alone would call
  // it clean while a person looks at loose letters on the page.
  const differs = heading.crawlerText !== heading.browserText;
  const split = heading.characterElements >= CHARACTER_ELEMENT_FLOOR;
  const fragmented = differs || split;

  let verdict: Verdict;
  if (heading.level !== 1 || heading.browserText === "") verdict = "no-h1-in-html";
  else if (fragmented) verdict = "fragmented";
  else verdict = "clean";

  return {
    verdict,
    tag: heading.tag,
    level: heading.level,
    browserText: heading.browserText,
    crawlerText: heading.crawlerText,
    childElements: heading.childElements,
    characterElements: heading.characterElements,
    fragmentedText: fragmented ? heading.crawlerText : null,
  };
}

/** Both halves in one call, which is all the server action needs. */
export function checkHtml(html: string): HeadingReport {
  return classify(extractHeading(html));
}
