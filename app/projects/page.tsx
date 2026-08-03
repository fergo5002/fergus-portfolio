import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ProjectCard from "@/components/ProjectCard";
import Scramble from "@/components/Scramble";
import { projects } from "@/content/projects";

export const metadata: Metadata = {
  title: "Projects — Fergus O'Reilly",
  description: "Presterly, Firespark, Loira AI, Remand, Under the Campanile, and ContraBot.",
};

export default function ProjectsPage() {
  return (
    <div className="stack">
      <PromptLine command="ls -la ./projects" path="~/projects" />
      <h1 className="page__title">
        <Scramble text="projects" speed={34} />
      </h1>
      <div className="proj__grid">
        {projects.map((p, i) => (
          <ProjectCard key={p.slug} project={p} index={i} />
        ))}
      </div>
    </div>
  );
}
