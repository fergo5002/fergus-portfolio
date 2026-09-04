import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { relief, reliefCopy } from "@/content/tools/relief";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import ReliefTool from "./ReliefTool";
import "./tool.css";

const PATH = toolPath(relief.slug);

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Relief",
  description: relief.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `Relief · ${profile.shortName}`,
    description: relief.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/relief`.
 *
 * Thin on purpose. Every other tool page on this site computes a worked
 * example on the server and hands it down as props, because its example is
 * real data that only exists here. Relief's demo is a seed and forty lines of
 * arithmetic, so serialising a 24 by 52 field and a few thousand contour
 * points into the payload would be paying kilobytes to save a millisecond.
 * The seed travels; the client builds the ground on both renders and gets the
 * same numbers, because the generator is deterministic.
 *
 * `ToolPage` puts the privacy line, the privacy note and the "can't see" list
 * around this. None of those words are here.
 */
export default function ReliefPage() {
  return (
    <ToolPage tool={relief} talk={reliefCopy.talk}>
      <ReliefTool />
    </ToolPage>
  );
}
