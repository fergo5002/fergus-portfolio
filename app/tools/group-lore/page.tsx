import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import GroupLore from "@/components/studio/GroupLore";
import { groupLore as tool } from "@/content/tools/group-lore";
import { studioShellCopy } from "@/content/studio/shared";
import { profile } from "@/content/profile";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import "./tool.css";

const PATH = toolPath(tool.slug);
export const metadata: Metadata = {
  title: tool.name,
  description: tool.blurb,
  alternates: canonical(PATH),
  openGraph: { title: `${tool.name} · ${profile.shortName}`, description: tool.blurb, type: "website", url: PATH, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * Rendered here rather than through the shared `Studio` host, which draws a
 * loading line until its dynamic chunk arrives. Here the server draws the
 * example week, its reading, the voices, the timeline and the phrases, and
 * the tool keeps its controls back until hydration can answer them.
 */
export default function Page() {
  return (
    <ToolPage tool={tool}>
      <div className="tool-studio" data-studio-host>
        <GroupLore />
        <noscript>{studioShellCopy.noScript}</noscript>
      </div>
    </ToolPage>
  );
}
