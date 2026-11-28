import type { ToolEntry } from "./types";
import { atlas } from "./atlas";
import { drift } from "./drift";
import { groupLore } from "./group-lore";
import { headlineCheck } from "./headline-check";
import { overlap } from "./overlap";
import { pocketRedact } from "./pocket-redact";
import { proveIt } from "./prove-it";
import { relief } from "./relief";
import { resonance } from "./resonance";
import { secondVisit } from "./second-visit";

export type { ToolEntry } from "./types";

/**
 * The tool registry.
 *
 * One file per tool in this folder, one import line each, kept alphabetical
 * (`content/tools/index.test.ts` checks) so two pull requests adding tools
 * rarely touch the same line. `/tools`, the sitemap, `/llms.txt` and each
 * tool's page read from here and nowhere else, which is how a tool that is
 * added once shows up everywhere at once.
 */
const entries: ToolEntry[] = [atlas, drift, groupLore, headlineCheck, overlap, pocketRedact, proveIt, relief, resonance, secondVisit];

/** Every tool, `soon` ones included, in index order. */
export const tools: ToolEntry[] = [...entries].sort((a, b) => a.order - b.order);

/** The ones with a page behind them. The sitemap and the phone check use this. */
export const liveTools: ToolEntry[] = tools.filter((t) => t.status === "live");

/** The front shelf. Unlisted tools retain their routes and discovery records. */
export const featuredTools = [atlas, pocketRedact, groupLore, relief, resonance];

/**
 * The live tools that are not on the shelf, listed under it in plain text.
 * Until 2026-11-28 they had routes and sitemap entries and no link from any
 * page, which is a page a crawler is told about and given no reason to rank.
 */
export const moreTools: ToolEntry[] = liveTools.filter((t) => !featuredTools.includes(t));

export function toolBySlug(slug: string): ToolEntry | undefined {
  return tools.find((t) => t.slug === slug);
}

/**
 * The shell's own words, per the house rule that copy lives in `content/`.
 * The two privacy lines are verbatim from the programme's interface block and
 * `content/tools/index.test.ts` pins them.
 */
export const toolShellCopy = {
  indexCommand: "ls -la ./tools",
  indexPath: "~/tools",
  privacy: {
    browser: "Runs in your browser. What you put in never leaves this tab.",
    server: "Runs on the server. Keeps a hashed IP for a day, nothing else.",
  },
  cantSeeHeading: "Can't see",
  /** The summary of the one disclosure at the foot of every tool page. */
  disclosure: "How it works, and what it can't see",
  soonLabel: "soon",
} as const;
