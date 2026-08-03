import type { ExperienceEntry } from "@/content/experience";
import Scramble from "./Scramble";
import RasterReveal from "./motion/RasterReveal";
import TiltCard from "./motion/TiltCard";

/**
 * One experience entry, rendered git-log style ("* commit" marker + details).
 * Paints in as the beam reaches it, with the organisation name decoding out of
 * scramble like a record being read off tape.
 */
export default function ExperienceItem({
  item,
  index = 0,
}: {
  item: ExperienceEntry;
  index?: number;
}) {
  return (
    <RasterReveal delay={index * 110} className="exp__reveal">
      <TiltCard max={4}>
        <article className="exp">
          <div className="exp__head">
            <span className="exp__commit" aria-hidden="true">
              ● commit
            </span>
            <h2 className="exp__org">
              <Scramble text={item.org} trigger="view" speed={24} />
              {item.isNew && <span className="badge">NEW</span>}
            </h2>
          </div>
          <p className="exp__meta">
            <span className="exp__role">{item.role}</span>
            <span className="exp__dot"> · </span>
            <span>{item.dates}</span>
            {item.location && (
              <>
                <span className="exp__dot"> · </span>
                <span>{item.location}</span>
              </>
            )}
          </p>
          {item.summary && <p className="exp__summary">{item.summary}</p>}
          <ul className="exp__bullets">
            {item.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {item.link && (
            <p className="exp__link">
              <a href={item.link.href} target="_blank" rel="noreferrer">
                → {item.link.label}
              </a>
            </p>
          )}
        </article>
      </TiltCard>
    </RasterReveal>
  );
}
