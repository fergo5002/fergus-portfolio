import type { Project } from "@/content/projects";
import Window from "./Window";
import ImageFrame from "./ImageFrame";
import Scramble from "./Scramble";
import RasterReveal from "./motion/RasterReveal";
import TiltCard from "./motion/TiltCard";

/** Deterministic per-project "signal strength", so the meter is stable across renders. */
function signalFor(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 997;
  return 3 + (h % 3); // 3..5 bars
}

/**
 * A project as a phosphor window that behaves like a physical panel: it paints
 * itself in as the beam reaches it, its title decodes out of scramble, it tilts
 * under the cursor with a specular glare, and a beam traces its perimeter on
 * hover.
 */
export default function ProjectCard({ project, index = 0 }: { project: Project; index?: number }) {
  const signal = signalFor(project.slug);

  return (
    <RasterReveal delay={index * 90}>
      <TiltCard>
        <Window title={`~/projects/${project.slug}`} className="project">
          <span id={project.slug} className="anchor" />
          <ImageFrame
            src={project.image || undefined}
            alt={`${project.title} screenshot`}
            label={`${project.slug}.png`}
            plate={project.slug}
            ratio="16 / 9"
          />
          <h2 className="project__title">
            <Scramble text={project.title} trigger="view" speed={22} />
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
          <div className="project__foot">
            <span className="signal" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`signal__bar${i < signal ? " is-on" : ""}`} />
              ))}
            </span>
            {project.links.length > 0 && (
              <span className="project__links">
                {project.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                    [{l.label}]
                  </a>
                ))}
              </span>
            )}
          </div>
        </Window>
      </TiltCard>
    </RasterReveal>
  );
}
