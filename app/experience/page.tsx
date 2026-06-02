import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ExperienceItem from "@/components/ExperienceItem";
import { experience } from "@/content/experience";

export const metadata: Metadata = {
  title: "Experience — Fergus O'Reilly",
  description: "Hatch105 × HappyStack, Larry (CTO & Co-Founder), and the Trinity Student Managed Fund.",
};

export default function ExperiencePage() {
  return (
    <div className="stack">
      <PromptLine command="git log --author=fergus" path="~/experience" />
      <h1 className="page__title">experience</h1>
      <div className="exp__list">
        {experience.map((item) => (
          <ExperienceItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
