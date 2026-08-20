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
 * and ordered lists, fenced code blocks, blockquotes, thematic breaks, and the
 * inline forms `**strong**`, `*emphasis*`, `` `code` `` and `[text](href)`.
 * Anything else is deliberately passed through as literal text rather than
 * throwing: an article with a stray underscore should render slightly wrong,
 * not take down the route.
 */

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

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code. The closing fence is optional so an unterminated block at
    // the end of a document renders as code rather than swallowing the parse.
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // past the closing fence, or past the end
      blocks.push({ type: "code", lang, value: body.join("\n") });
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
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      body.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", inline: parseInline(body.join(" ")) });
  }

  return blocks;
}

function startsBlock(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^---+\s*$/.test(line) ||
    /^#{2,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
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
