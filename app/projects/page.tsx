import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ProjectCard from "@/components/ProjectCard";
import { projects } from "@/content/projects";

export const metadata: Metadata = {
  title: "Projects — Fergus O'Reilly",
  description: "Larry, Remand, Under the Campanile, Sauna OS, and ContraBot.",
};

export default function ProjectsPage() {
  return (
    <div className="stack">
      <PromptLine command="ls -la ./projects" path="~/projects" />
      <h1 className="page__title">projects</h1>
      <div className="proj__grid">
        {projects.map((p) => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
    </div>
  );
}
