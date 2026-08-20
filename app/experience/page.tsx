import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ExperienceItem from "@/components/ExperienceItem";
import Scramble from "@/components/Scramble";
import TimelineSpine from "@/components/motion/TimelineSpine";
import { experience } from "@/content/experience";
import { profile } from "@/content/profile";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { canonical, experiencePageSchema, breadcrumbSchema, OG_IMAGE } from "@/lib/seo";

const DESCRIPTION =
  "Tigh Sauna (Co-Founder), Presterly (Co-Founder & CTO, Hatch105), Loira AI (Founding Engineer), and the Trinity Student Managed Fund.";

export const metadata: Metadata = {
  title: "Experience",
  description: DESCRIPTION,
  alternates: canonical("/experience"),
  openGraph: {
    title: `Experience · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "profile",
    url: "/experience",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

export default function ExperiencePage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          experiencePageSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Experience", path: "/experience" },
          ]),
        ]}
      />
      <PromptLine command="git log --author=fergus" path="~/experience" />
      <h1 className="page__title">
        <Scramble text="experience" speed={34} />
      </h1>
      <div className="exp__list">
        <TimelineSpine />
        {experience.map((item, i) => (
          <ExperienceItem key={item.id} item={item} index={i} />
        ))}
      </div>
      <Talk line="Hiring, building, or just curious about any of this? Say hello." />
    </div>
  );
}
