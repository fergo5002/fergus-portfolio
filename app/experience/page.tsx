import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ExperienceItem from "@/components/ExperienceItem";
import Scramble from "@/components/Scramble";
import TimelineSpine from "@/components/motion/TimelineSpine";
import { experience } from "@/content/experience";
import { profile } from "@/content/profile";

export const metadata: Metadata = {
  title: `Experience · ${profile.shortName}`,
  description:
    "Presterly (Co-Founder & CTO, Hatch105), Loira AI, and the Trinity Student Managed Fund.",
};

export default function ExperiencePage() {
  return (
    <div className="stack">
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
    </div>
  );
}
