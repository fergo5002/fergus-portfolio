import { toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";
import { toolPath } from "@/lib/seo";

export type ToolRow = {
  slug: string;
  name: string;
  blurb: string;
  privacyLine: string;
  /** `null` for a `soon` tool: listed, never linked. */
  href: string | null;
  soon: boolean;
};

/**
 * The rows `/tools` renders, as data.
 *
 * Pure so the one decision on that page, whether a name is a link, can be
 * asserted without mounting anything. A `soon` tool is a promise, and a promise
 * with an `<a>` on it is a 404 with a nice label.
 */
export function toolListing(entries: readonly ToolEntry[]): ToolRow[] {
  return entries.map((t) => ({
    slug: t.slug,
    name: t.name,
    blurb: t.blurb,
    privacyLine: toolShellCopy.privacy[t.privacy],
    href: t.status === "live" ? toolPath(t.slug) : null,
    soon: t.status === "soon",
  }));
}
