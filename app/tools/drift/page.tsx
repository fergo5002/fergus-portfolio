import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { drift, driftCopy, driftDemo } from "@/content/tools/drift";
import { OG_IMAGE, canonical } from "@/lib/seo";
import { selfSpread } from "@/lib/tools/drift/delta";
import { referenceDocuments, siteReference } from "@/lib/tools/drift/corpus";
import { profileOf } from "@/lib/tools/drift/profile";
import { analyse } from "@/lib/tools/drift/report";
import DriftTool from "./DriftTool";
import "./tool.css";

const PATH = "/tools/drift";

export const metadata: Metadata = {
  title: "Drift",
  description: drift.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `Drift · ${profile.shortName}`,
    description: drift.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/drift`.
 *
 * This is the only module in the app that touches the corpus, and it touches it
 * for one reason: the worked example. The eleven articles build a reference, a
 * profile and a self-spread, and the demo draft is measured against them, all
 * at build time because the route is static. So the first paint carries a real
 * report over a corpus the reader can go and read, instead of an empty form.
 *
 * The visitor's own measurement is nothing to do with any of this. Their
 * reference is built in their tab from their pieces, in `DriftTool`, and the
 * moment they press build every number below is replaced by one in their units.
 * That is why the demo arrives as props with `demo` in every name: a prop that
 * quietly became the default yardstick is exactly the bug this route was
 * rewritten to remove.
 */
const demoReference = siteReference();
const demoDocuments = referenceDocuments();
const demoProfile = profileOf(demoDocuments, demoReference);
const demoSpread = selfSpread(demoDocuments, demoReference);
const demoReport = analyse(demoProfile, driftDemo.draft, demoReference, demoSpread);

export default function DriftPage() {
  return (
    <ToolPage tool={drift} talk={driftCopy.talk}>
      <DriftTool
        demoReference={demoReference}
        demoProfile={demoProfile}
        demoSpread={demoSpread}
        demoReport={demoReport}
      />
    </ToolPage>
  );
}
