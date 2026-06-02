import type { Project } from "@/content/projects";
import Window from "./Window";
import ImageFrame from "./ImageFrame";

/** A single project rendered as a phosphor "window" with a screenshot slot. */
export default function ProjectCard({ project }: { project: Project }) {
  return (
    <Window title={`~/projects/${project.slug}`} className="project">
      <ImageFrame
        src={project.image || undefined}
        alt={`${project.title} screenshot`}
        label={`${project.slug}.png`}
        ratio="16 / 9"
      />
      <h2 className="project__title">
        {project.title}
        {project.year && <span className="project__year">{project.year}</span>}
      </h2>
      <p className="project__tagline">{project.tagline}</p>
      <p className="project__role">
        <span className="project__role-key">role:</span> {project.role}
      </p>
      <ul className="project__bullets">
        {project.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <p className="project__stack" aria-label="Tech stack">
        {project.stack.map((s) => (
          <span key={s} className="flag">
            --{s.toLowerCase().replace(/\s+/g, "-")}
          </span>
        ))}
      </p>
      {project.links.length > 0 && (
        <p className="project__links">
          {project.links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
              [{l.label}]
            </a>
          ))}
        </p>
      )}
    </Window>
  );
}
