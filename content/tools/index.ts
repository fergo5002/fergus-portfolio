import type { ToolEntry } from "./types";
import { drift } from "./drift";
import { headlineCheck } from "./headline-check";
import { overlap } from "./overlap";

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
const entries: ToolEntry[] = [drift, headlineCheck, overlap];

/** Every tool, `soon` ones included, in index order. */
export const tools: ToolEntry[] = [...entries].sort((a, b) => a.order - b.order);

/** The ones with a page behind them. The sitemap and the phone check use this. */
export const liveTools: ToolEntry[] = tools.filter((t) => t.status === "live");

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
    browser: "Runs in your browser. Nothing leaves this tab.",
    server: "Runs on the server. Keeps a hashed IP for a day, nothing else.",
  },
  cantSeeHeading: "Can't see",
  soonLabel: "soon",
} as const;
