import type { CSSProperties } from "react";
import { profile } from "@/content/profile";

/**
 * A static, decorative "user@host:path$ command" line used as a heading device
 * above sections. Purely presentational.
 *
 * **Every character of it is drawn from CSS rather than written into the
 * document, and that is the whole point of this component.**
 *
 * It used to render its text as real nodes. Measured against the live site on
 * 2026-08-21, that meant a naive HTML-to-text extraction of any article opened
 * like this:
 *
 * ```
 * fergus @ portfolio : /writing/why-presterly-wound-down $ cd ~ cd experience
 * cd projects cd writing fergus @ portfolio : ~/writing $ cat
 * ./writing/why-presterly-wound-down.md Why we wound Presterly down
 * ```
 *
 * Roughly 150 characters of terminal costume in front of the first real word,
 * in the region of the page that matters most: the opening is where a retrieval
 * step looks first, and where most of the passages it quotes come from.
 *
 * `aria-hidden` does not fix this. That is an accessibility property, and a text
 * extractor has no reason to read it, exactly as `aria-label` did not fix the
 * split hero name. The only thing that removes text from extraction is not
 * putting the text in the document, so the parts arrive as custom properties and
 * `app/globals.css` draws them with `content`. The spans stay so the per-part
 * colours stay with them.
 *
 * The general rule, which is the one worth keeping: **decorative text belongs in
 * CSS.** If a string is there to set a mood rather than to be read, it should not
 * be competing with the prose for the crawler's attention.
 */
export default function PromptLine({
  command,
  user = profile.user,
  host = profile.host,
  path = "~",
}: {
  command: string;
  user?: string;
  host?: string;
  path?: string;
}) {
  // JSON.stringify is doing real work here: it produces a quoted, escaped CSS
  // string, so a path or command containing a quote cannot break out of the
  // `content` value and into the stylesheet.
  const parts = {
    "--promptline-user": JSON.stringify(`${user}@${host}`),
    "--promptline-path": JSON.stringify(path),
    "--promptline-cmd": JSON.stringify(command),
  } as CSSProperties;

  return (
    <p className="promptline" style={parts} aria-hidden="true">
      <span className="promptline__user" />
      <span className="promptline__sep" />
      <span className="promptline__path" />
      <span className="promptline__dollar" />
      <span className="promptline__cmd" />
    </p>
  );
}
