/**
 * A markdown parser for exactly the subset the articles use, and nothing else.
 *
 * **Why not a library.** Three reasons, in order of weight. A general parser is
 * tens of kilobytes to render eight documents whose syntax is entirely under
 * our own control. Every one of them emits an HTML string, which means
 * `dangerouslySetInnerHTML`, which means owning a sanitisation problem this
 * site does not otherwise have. And this repo already hand-writes a rigid-body
 * solver and an audio synth on the same reasoning, so a 60 kB dependency to
 * turn `**bold**` into `<strong>` would be the odd one out.
 *
 * This returns **typed blocks**, never HTML. The renderer maps them onto real
 * React elements, so text is escaped by React itself and there is no injection
 * path at all, not even a sanitised one.
 *
 * The supported subset is: ATX headings `##` to `####`, paragraphs, unordered
 * and ordered lists, fenced code blocks, blockquotes, thematic breaks,
 * GitHub-style pipe tables, and the inline forms `**strong**`, `*emphasis*`,
 * `` `code` `` and `[text](href)`. Anything else is deliberately passed through
 * as literal text rather than throwing: an article with a stray underscore
 * should render slightly wrong, not take down the route.
 */

import { parseChart, type ChartSpec } from "./chart";

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; id: string; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; lang: string; value: string }
  | { type: "quote"; inline: Inline[] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "chart"; spec: ChartSpec }
  | { type: "rule" };

/**
 * Matches, in priority order: inline code, link, strong, emphasis.
 *
 * Code comes first on purpose. Inside backticks the other markers are content,
 * not syntax, so a line like `` `**argv` `` has to survive intact. Strong comes
 * before emphasis because `**` would otherwise be consumed as two separate `*`
 * openers.
 */
const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  // `matchAll` needs the regex to stay stateless between calls, and INLINE is a
  // module-level /g literal shared by every invocation. Resetting is not enough
  // if a caller ever recurses, so take a fresh instance per call.
  const re = new RegExp(INLINE.source, "g");
  for (const m of source.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: source.slice(last, at) });

    if (m[1] !== undefined) out.push({ type: "code", value: m[1] });
    else if (m[2] !== undefined && m[3] !== undefined)
      out.push({ type: "link", value: m[2], href: m[3] });
    else if (m[4] !== undefined) out.push({ type: "strong", value: m[4] });
    else if (m[5] !== undefined) out.push({ type: "em", value: m[5] });

    last = at + m[0].length;
  }

  if (last < source.length) out.push({ type: "text", value: source.slice(last) });
  return out;
}

/**
 * Heading anchor. Lowercase, non-alphanumerics collapsed to single hyphens,
 * trimmed. Used for in-page links and for a table of contents.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strips inline markers, for anchor ids and plain-text extraction. */
function plain(source: string): string {
  return parseInline(source)
    .map((node) => node.value)
    .join("");
}

/**
 * Splits one table row into trimmed cells.
 *
 * `\|` is content, not a boundary, so a cell can carry a pipe. The empty cell a
 * leading or trailing pipe produces is dropped, and only that one: an empty
 * cell in the middle of a row is a real, deliberately empty cell. Whether the
 * row ended on a separator is tracked as the loop runs rather than by testing
 * the last character, because `| a | b \|` ends in a pipe that is content.
 *
 * A line with no pipe at all returns no cells, which is what stops a bare `---`
 * thematic break from ever reading as a delimiter row.
 */
function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let current = "";
  let sawPipe = false;
  let leading = false;
  let trailing = false;

  for (let k = 0; k < text.length; k++) {
    if (text[k] === "\\" && text[k + 1] === "|") {
      current += "|";
      k++;
      trailing = false;
      continue;
    }
    if (text[k] === "|") {
      if (k === 0) leading = true;
      sawPipe = true;
      cells.push(current);
      current = "";
      trailing = k === text.length - 1;
      continue;
    }
    current += text[k];
    trailing = false;
  }

  if (!sawPipe) return [];
  cells.push(current);
  if (leading) cells.shift();
  if (trailing) cells.pop();
  return cells.map((cell) => cell.trim());
}

/** A delimiter cell: hyphens, with the alignment colons GitHub allows. */
const DELIMITER_CELL = /^:?-+:?$/;

/**
 * Whether these two lines open a table.
 *
 * **This is the only place that decides**, and both `parseMarkdown`'s table
 * branch and `startsBlock` call it. That is not tidiness, it is the invariant
 * the fence comment below is about: a detector and `startsBlock` that disagree
 * leave a line no branch consumes, `i` never advances, and the parser spins
 * with no error to read. One predicate cannot disagree with itself.
 *
 * A table needs a header row and a delimiter row with the same number of cells.
 * Requiring the counts to match is what keeps prose containing a pipe from
 * becoming a table by accident.
 */
function isTableStart(line: string, next: string | undefined): boolean {
  if (next === undefined) return false;
  const head = splitRow(line);
  if (head.length === 0 || head.every((cell) => cell === "")) return false;
  const delimiter = splitRow(next);
  if (delimiter.length !== head.length) return false;
  return delimiter.every((cell) => DELIMITER_CELL.test(cell));
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Every branch below must consume at least one line. If one ever does not,
    // the loop spins forever and takes the build with it, silently, with no
    // error to read. That has happened once (see the fence comment below), so
    // the invariant is enforced rather than assumed: fail loudly on the line
    // that caused it instead of hanging.
    const startedAt = i;

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code. The closing fence is optional so an unterminated block at
    // the end of a document renders as code rather than swallowing the parse.
    //
    // This pattern MUST stay in step with the `^```` test in `startsBlock`.
    // It briefly did not: the detector was `/^```(\w*)\s*$/` while
    // `startsBlock` matched any line beginning with three backticks. A fence
    // carrying anything else in its info string, ```` ```js {1,3} ````,
    // ```` ```objective-c ````, or a bare ```` ```` ````, then matched neither
    // the fence branch nor any other branch, fell through to the paragraph
    // loop, whose condition was immediately false, and `i` never advanced. The
    // parser span forever. Because every helper here routes through
    // `parseMarkdown`, that meant `next build` and `npm test` both hanging with
    // no error to read. Take the language as the first token and accept the
    // rest of the line.
    const fence = /^```\s*(\S*)/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // past the closing fence, or past the end
      const value = body.join("\n");

      // A fence tagged `chart` carries JSON rather than source. It becomes a
      // typed chart block if it validates, and stays a code block if it does
      // not, so a mistyped spec renders as the JSON the author wrote instead of
      // taking the route down. `lib/chart.ts` owns every rule about what counts
      // as valid, and returns null rather than throwing for exactly this reason.
      if (lang === "chart") {
        const spec = parseChart(value);
        if (spec) {
          blocks.push({ type: "chart", spec });
          continue;
        }
      }

      blocks.push({ type: "code", lang, value });
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({
        type: "heading",
        level: heading[1].length as 2 | 3 | 4,
        id: slugify(plain(text)),
        inline: parseInline(text),
      });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", inline: parseInline(body.join(" ").trim()) });
      continue;
    }

    // Tables are checked before lists so a genuine table wins over a row that
    // happens to open with a hyphen. It can only win when the line after it is
    // a matching delimiter row, which prose does not do by accident.
    if (isTableStart(line, lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      const columns = head.length;
      const rows: Inline[][][] = [];
      i += 2; // the header and the delimiter

      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        splitRow(lines[i]).length > 0 &&
        !startsBlock(lines[i], lines[i + 1])
      ) {
        // Short rows are padded and extra cells are dropped. A miscounted row
        // should render as itself rather than shunt every row after it into the
        // wrong column, and neither case is worth throwing over.
        const cells = splitRow(lines[i]);
        rows.push(Array.from({ length: columns }, (_, c) => parseInline(cells[c] ?? "")));
        i++;
      }

      blocks.push({ type: "table", head, rows });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: Inline[][] = [];
      const item = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
      while (i < lines.length) {
        const m = item.exec(lines[i]);
        if (m) {
          items.push(parseInline(m[1].trim()));
          i++;
          continue;
        }
        // A wrapped continuation line belongs to the item above it. Anything
        // else, including a blank line, ends the list.
        if (items.length > 0 && /^\s+\S/.test(lines[i])) {
          const tail = items[items.length - 1];
          tail.push(...parseInline(" " + lines[i].trim()));
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: everything up to a blank line or the start of another block.
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i], lines[i + 1])) {
      body.push(lines[i].trim());
      i++;
    }
    if (body.length > 0) blocks.push({ type: "paragraph", inline: parseInline(body.join(" ")) });

    if (i === startedAt) {
      throw new Error(
        `parseMarkdown: no rule consumed line ${startedAt + 1}: ${JSON.stringify(line)}. ` +
          `A block detector and startsBlock() have gone out of step.`,
      );
    }
  }

  return blocks;
}

/**
 * `next` is here for tables alone: they are the one block whose opening cannot
 * be recognised from a single line, because a header row is only a header row
 * when a delimiter row follows it.
 */
function startsBlock(line: string, next: string | undefined): boolean {
  return (
    /^```/.test(line) ||
    /^---+\s*$/.test(line) ||
    /^#{2,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    isTableStart(line, next)
  );
}

/**
 * Plain text of a whole document, for descriptions and excerpts. Code blocks
 * are dropped, because a listing is not a summary of anything.
 */
export function toPlainText(source: string): string {
  return parseMarkdown(source)
    .flatMap((block) => {
      if (block.type === "code" || block.type === "rule") return [];
      if (block.type === "list") return block.items.map((it) => it.map((n) => n.value).join(""));
      // Header cells first, then the body in row order. A table in an article
      // carries the numbers, so an excerpt built from the body must not lose
      // them the way it deliberately loses a code listing.
      if (block.type === "table")
        return [...block.head, ...block.rows.flat()].map((cell) =>
          cell.map((n) => n.value).join(""),
        );
      // Same argument as the table above, and the same shape: labels first,
      // then the numbers. A chart is the densest data in an article, so an
      // excerpt that dropped it would lose the finding the piece exists for.
      // This doubles as the text alternative behind the figure.
      if (block.type === "chart") {
        const { title, categories, series, caption } = block.spec;
        return [
          title,
          ...categories,
          ...series.flatMap((s) => [s.label, ...s.values.map(String)]),
          ...(caption ? [caption] : []),
        ];
      }
      return [block.inline.map((n) => n.value).join("")];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Headings, for an article's contents list. */
export function tableOfContents(source: string): { id: string; text: string; level: 2 | 3 | 4 }[] {
  return parseMarkdown(source)
    .filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading")
    .map((b) => ({ id: b.id, text: b.inline.map((n) => n.value).join(""), level: b.level }));
}

/** Absolute http(s), a site-relative path, or an in-page anchor. Nothing else. */
export function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href) || href.startsWith("#");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * A whole document as an HTML string, for `/feed.xml`.
 *
 * The pages render through `components/Markdown.tsx`; a feed is a string, so
 * it needs the same blocks without React. Everything is escaped on the way
 * out, and `origin` makes site-relative links absolute, because a feed reader
 * shows the article somewhere that has no base URL. A chart becomes a table of
 * its own numbers: a reader cannot draw the figure, and the numbers are the
 * finding.
 */
export function toHtml(source: string, origin = ""): string {
  const inline = (nodes: Inline[]) =>
    nodes
      .map((n) => {
        const text = escapeHtml(n.value);
        if (n.type === "strong") return `<strong>${text}</strong>`;
        if (n.type === "em") return `<em>${text}</em>`;
        if (n.type === "code") return `<code>${text}</code>`;
        if (n.type === "link") {
          // The same guard as `components/Markdown.tsx`: anything that is not
          // http(s), a site path or an anchor is written as its text.
          if (!isSafeHref(n.href)) return text;
          const href = /^\/(?!\/)/.test(n.href) ? `${origin}${n.href}` : n.href;
          return `<a href="${escapeHtml(href)}">${text}</a>`;
        }
        return text;
      })
      .join("");
  const cells = (tag: "th" | "td", row: string[]) => `<tr>${row.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;

  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<h${block.level}>${inline(block.inline)}</h${block.level}>`;
        case "paragraph":
          return `<p>${inline(block.inline)}</p>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`;
        }
        case "code":
          return `<pre><code>${escapeHtml(block.value)}</code></pre>`;
        case "quote":
          return `<blockquote><p>${inline(block.inline)}</p></blockquote>`;
        case "table":
          return `<table><thead>${cells("th", block.head.map(inline))}</thead><tbody>${block.rows
            .map((row) => cells("td", row.map(inline)))
            .join("")}</tbody></table>`;
        case "chart": {
          const { title, unit, categories, series, caption } = block.spec;
          const head = cells("th", ["", ...series.map((s) => escapeHtml(s.label))]);
          const rows = categories
            .map((c, i) => cells("td", [escapeHtml(c), ...series.map((s) => `${s.values[i]}${unit ? ` ${escapeHtml(unit)}` : ""}`)]))
            .join("");
          return `<p><strong>${escapeHtml(title)}</strong></p><table><thead>${head}</thead><tbody>${rows}</tbody></table>${
            caption ? `<p><em>${escapeHtml(caption)}</em></p>` : ""
          }`;
        }
        case "rule":
          return "<hr />";
      }
    })
    .join("\n");
}
