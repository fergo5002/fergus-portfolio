import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import ProjectCard from "@/components/ProjectCard";
import Scramble from "@/components/Scramble";
import { projects } from "@/content/projects";
import { profile } from "@/content/profile";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { canonical, projectsPageSchema, breadcrumbSchema, OG_IMAGE } from "@/lib/seo";

const DESCRIPTION =
  "Tigh Sauna, Presterly, Loira AI, Remand, Under the Campanile, and ContraBot. Booking platforms, Shopify apps, AI tooling, and a game engine's lighting system.";

export const metadata: Metadata = {
  title: "Projects",
  description: DESCRIPTION,
  alternates: canonical("/projects"),
  openGraph: {
    title: `Projects · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/projects",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

export default function ProjectsPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          projectsPageSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Projects", path: "/projects" },
          ]),
        ]}
      />
      <PromptLine command="ls -la ./projects" path="~/projects" />
      <h1 className="page__title">
        <Scramble text="projects" speed={34} />
      </h1>
      <div className="proj__grid">
        {projects.map((p, i) => (
          <ProjectCard key={p.slug} project={p} index={i} />
        ))}
      </div>
      <Talk line="If you're building something in this territory, or hiring for it, get in touch." />
    </div>
  );
}
