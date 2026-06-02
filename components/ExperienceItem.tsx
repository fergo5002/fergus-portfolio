import type { ExperienceEntry } from "@/content/experience";

/**
 * One experience entry, rendered git-log style ("* commit" marker + details).
 */
export default function ExperienceItem({ item }: { item: ExperienceEntry }) {
  return (
    <article className="exp">
      <div className="exp__head">
        <span className="exp__commit" aria-hidden="true">
          ● commit
        </span>
        <h2 className="exp__org">
          {item.org}
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
  );
}
