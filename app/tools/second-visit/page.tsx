import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { TIGH_CREDIT, secondVisit as tool } from "@/content/tools/second-visit";
import { OG_IMAGE, canonical, toolPath } from "@/lib/seo";
import { analyse } from "@/lib/tools/second-visit/analyse";
import { parseCsv } from "@/lib/tools/second-visit/csv";
import { DEMO_VENUE_TOWN, demoCsv } from "@/lib/tools/second-visit/demo";
import { guessRoles, toBookings } from "@/lib/tools/second-visit/mapping";
import SecondVisitTool, { type SecondVisitDemo } from "./SecondVisitTool";
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
 * The shell draws the prompt line, the heading, the one sentence, the privacy
 * line and the disclosure from the registry entry. This file owns the island,
 * the credit line it hands the disclosure, and the one graph edge the registry
 * has no field for: `isBasedOn`, pointing at the business whose model this is.
 * Both the edge and the credit come from `TIGH_CREDIT`, so setting that to
 * null removes them together.
 */
/**
 * The made-up sauna, modelled once at build time with the same pure functions
 * the worker runs, so the page opens on its curve with no layout arriving late.
 * The per-customer rows stay behind (a third of a megabyte, only for the
 * downloads); the island models the file again in the background for those.
 */
const demoSheet = parseCsv(demoCsv());
const demoRead = toBookings(demoSheet, guessRoles(demoSheet));
const demoAnalysis = analyse({ bookings: demoRead.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
const demo: SecondVisitDemo = {
  analysis: { ...demoAnalysis, rows: [] },
  conversion: { ignored: demoRead.ignored, ambiguousDates: demoRead.ambiguousDates },
};

export default function SecondVisitPage() {
  return (
    <ToolPage
      tool={tool}
      extraSchema={TIGH_CREDIT ? { isBasedOn: TIGH_CREDIT.href } : undefined}
      talk="If you ran this on a real export, I'd like to know what it got wrong."
      notes={
        TIGH_CREDIT ? (
          <p className="sv__credit">
            {TIGH_CREDIT.line}{" "}
            <a className="prose__link" href={TIGH_CREDIT.href}>
              {TIGH_CREDIT.name}
            </a>
          </p>
        ) : null
      }
    >
      <SecondVisitTool demo={demo} />
    </ToolPage>
  );
}
