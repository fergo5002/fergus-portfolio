import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { overlap } from "@/content/tools/overlap";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import OverlapTool from "./OverlapWorkbench";
import "./tool.css";

const PATH = toolPath(overlap.slug);

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: overlap.name,
  description: overlap.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `${overlap.name} · ${profile.shortName}`,
    description: overlap.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/overlap`.
 *
 * Server component. Everything a crawler needs is in the HTML before any
 * script runs: the name, the blurb, the privacy line and its note, and the
 * "can't see" list, all of which `ToolPage` renders from the registry entry.
 * The island below is the interactive half and it is the only part that needs
 * JavaScript.
 *
 * No `extraSchema`. `ToolPage` already builds the tool's schema from the
 * registry, and there is no article behind this one to point `isBasedOn` at.
 */
export default function OverlapPage() {
  return (
    <ToolPage tool={overlap} talk="If this found somebody unexpected, I would like to hear who.">
      <OverlapTool roomsAvailable={Boolean(
        (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
        (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN) &&
        process.env.BUDGET_HASH_SECRET
      )} />
    </ToolPage>
  );
}
