import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import AtlasPoster from "@/components/studio/AtlasPoster";
import AtlasStudio from "@/components/studio/AtlasStudio";
import { atlas as tool } from "@/content/tools/atlas";
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

/** The server draws the example map (`AtlasPoster`) so the first paint is the map; the instrument takes over on hydration. */
export default function Page() {
  return (
    <ToolPage tool={tool}>
      <AtlasStudio poster={<AtlasPoster />} />
    </ToolPage>
  );
}
