import { profile } from "@/content/profile";

/**
 * Turns a line of terminal output into text and links, so `contact`, `open`
 * and `resume` print addresses you can actually click (2026-11-25: they were
 * plain text you had to copy by hand).
 *
 * Commands stay pure and print strings; the Terminal renders these pieces. A
 * piece with an `href` becomes a link, `external` ones open in a new tab.
 */
export type LinkPiece = { text: string; href?: string; external?: boolean };

/** The site's own routes. A path outside this list (`/dev/ambition`) is a joke, not a link. */
const ROUTES = ["/experience", "/projects", "/writing", "/tools", "/contact", "/mcp"];

/** Short forms the profile prints (`github.com/fergo5002`, `in/...`), mapped to where they go. */
const SHORT_FORMS: Record<string, string> = Object.fromEntries(
  profile.contact.filter((c) => c.href.startsWith("https://")).map((c) => [c.value, c.href]),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERN = new RegExp(
  [
    // Each ends where it ends: `github.com/fergo5002/x` is not the profile.
    ...Object.keys(SHORT_FORMS).map((k) => `${escape(k)}(?![\\w/-])`),
    String.raw`https?:\/\/[^\s]+`,
    String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
    String.raw`(?<![\w/~])(?:${ROUTES.map(escape).join("|")})(?![\w-])(?:[/#?][^\s]*)?`,
  ].join("|"),
  "g",
);

function hrefFor(match: string): Pick<LinkPiece, "href" | "external"> {
  if (SHORT_FORMS[match]) return { href: SHORT_FORMS[match], external: true };
  if (/^https?:\/\//.test(match)) return { href: match, external: true };
  if (match.includes("@")) return { href: `mailto:${match}` };
  return { href: match };
}

export function linkify(line: string): LinkPiece[] {
  const out: LinkPiece[] = [];
  let at = 0;
  for (const m of line.matchAll(PATTERN)) {
    // Sentence punctuation that ends a line is not part of the address.
    const text = m[0].replace(/[.,;:!?)]+$/, "");
    const start = m.index ?? 0;
    if (start > at) out.push({ text: line.slice(at, start) });
    out.push({ text, ...hrefFor(text) });
    at = start + text.length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out.length ? out : [{ text: line }];
}
