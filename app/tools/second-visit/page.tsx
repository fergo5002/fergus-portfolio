import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { TIGH_CREDIT, secondVisit as tool } from "@/content/tools/second-visit";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import SecondVisitTool from "./SecondVisitTool";
import "./tool.css";

const PATH = toolPath(tool.slug);

const DESCRIPTION =
  "Drop a bookings or orders export and get an honest estimate of how many first-time customers come back, with the uncertainty printed beside it. Runs entirely in your browser.";

export const metadata: Metadata = {
  title: tool.name,
  description: DESCRIPTION,
  alternates: canonical(PATH),
  openGraph: {
    title: `${tool.name} · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/second-visit`.
 *
 * The shell draws the prompt line, the heading, the lede, the privacy line and
 * the "Can't see" list from the registry entry. This file owns the island and
 * the one graph edge the registry has no field for: `isBasedOn`, pointing at
 * the business whose model this is. Both the edge and the credit block come
 * from `TIGH_CREDIT`, so setting that to null removes them together.
 */
export default function SecondVisitPage() {
  return (
    <ToolPage
      tool={tool}
      extraSchema={TIGH_CREDIT ? { isBasedOn: TIGH_CREDIT.href } : undefined}
      talk="If you ran this on a real export, I'd like to know what it got wrong."
    >
      <SecondVisitTool />
    </ToolPage>
  );
}
