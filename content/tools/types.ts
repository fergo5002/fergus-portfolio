/**
 * One tool in the registry. Frozen across the toolshed programme (design
 * section 8): every sub-project's plan was written against these names, so add
 * a field if you must and never rename or remove one.
 */
export type ToolEntry = {
  /** Route is `/tools/<slug>`. Lowercase, hyphenated, stable once published. */
  slug: string;
  name: string;
  /**
   * One or two sentences. The meta description, the JSON-LD description and the
   * `/llms.txt` line, and the lede wherever no `purpose` is given.
   */
  blurb: string;
  /**
   * ONE short sentence of purpose: the line under the heading on the tool's own
   * page and on its card on `/tools`, so the two cannot disagree. Added with the
   * instrument shell (2026-09-27); falls back to `blurb`.
   */
  purpose?: string;
  /**
   * Secondary explanation (how it works, how to read the result). Rendered in
   * the shell's single disclosure after the stage, never above it.
   */
  method?: string[];
  /**
   * Renders the privacy line. `browser` => "Runs in your browser. Nothing
   * leaves this tab." `server` => "Runs on the server. Keeps a hashed IP for a
   * day, nothing else."
   */
  privacy: "browser" | "server";
  /**
   * An honest replacement for the generic line when the default would be
   * false, including peer-to-peer networking or a direct third-party API call.
   */
  privacyLine?: string;
  /**
   * One extra sentence under the privacy line, for a tool whose two words are
   * not the whole truth. Optional and additive: the frozen `ToolEntry` block in
   * the programme design permits additions.
   */
  privacyNote?: string;
  /** Printed at the foot of the tool page under "Can't see". */
  cantSee: string[];
  /** `soon` entries are listed on the index but not linked. */
  status: "live" | "soon";
  /** Index ordering, ascending. Leave gaps. */
  order: number;
};
