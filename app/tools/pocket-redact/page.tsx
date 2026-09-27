import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import PocketRedact from "@/components/studio/PocketRedact";
import { pocketRedact as tool } from "@/content/tools/pocket-redact";
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
 * loading line until its dynamic chunk arrives: that was the first thing a
 * visitor saw for 1.6s on a desktop and 4 to 6.6s on a throttled phone. Here
 * the server renders the example document with its mask, and the tool keeps
 * its own controls back until hydration can answer them.
 */
export default function Page() {
  return (
    <ToolPage tool={tool}>
      <div className="tool-studio" data-studio-host>
        <PocketRedact />
        <noscript>{studioShellCopy.noScript}</noscript>
      </div>
    </ToolPage>
  );
}
