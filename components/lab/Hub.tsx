"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { labCopy as c, labTools } from "@/content/lab";
import { Button, jsonDownload } from "./shared";
import { useReview } from "./Review";
export default function Hub() {
  const [category, setCategory] = useState(c.all);
  const { selected, setSelected, notes } = useReview();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="lab-hub" data-ready={ready}>
      <div className="lab-top">
        <span>{c.badge}</span>
        <span>12 / 12</span>
      </div>
      <header className="lab-hero">
        <p>FergusOS / lab</p>
        <h1>{c.title}</h1>
        <p>{c.intro}</p>
      </header>
      <div className="lab-featured">
        {["atlas", "group-lore", "pocket-redact", "prove-it", "resonance"].map(
          (slug, i) => {
            const tool = labTools.find((t) => t.slug === slug)!;
            return (
              <Link key={slug} href={`/lab/${slug}`}>
                <b>STUDIO {String(i + 1).padStart(2, "0")}</b>
                <strong>{tool.name}</strong>
                <span>{tool.hook}</span>
                <b>Explore →</b>
              </Link>
            );
          },
        )}
      </div>
      <div className="lab-actions" role="group" aria-label={c.all}>
        {[c.all, ...c.categories].map((cat) => (
          <button
            className="bench-button"
            key={cat}
            aria-pressed={cat === category}
            disabled={!ready}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="lab-cards">
        {labTools
          .filter((t) => category === c.all || t.category === category)
          .map((t) => (
            <article className="lab-card" key={t.slug}>
              <div className="lab-card-top">
                <span>{String(t.order + 1).padStart(2, "0")}</span>
                <span>{t.category}</span>
              </div>
              <Link href={`/lab/${t.slug}`} className="lab-card-link">
                <h2>{t.name}</h2>
                <p className="lab-hook">{t.hook}</p>
                <p>{t.blurb}</p>
                <span className="lab-open">{c.open} ↗</span>
              </Link>
              <button
                className="bench-button"
                aria-pressed={selected.includes(t.slug)}
                disabled={!ready}
                onClick={() =>
                  setSelected((s) =>
                    s.includes(t.slug)
                      ? s.filter((x) => x !== t.slug)
                      : [...s, t.slug],
                  )
                }
              >
                {selected.includes(t.slug) ? c.selected : c.select}
              </button>
            </article>
          ))}
      </div>
      <section className="lab-panel">
        <h2>{c.review}</h2>
        <p>{c.reviewNote}</p>
        <p>
          {selected.length
            ? selected
                .map((id) => labTools.find((t) => t.slug === id)!.name)
                .join(" · ")
            : c.empty}
        </p>
        <Button
          disabled={!selected.length && !Object.values(notes).some(Boolean)}
          onClick={() =>
            jsonDownload("fergusos-shortlist.json", {
              date: new Date().toISOString(),
              tools: selected,
              notes,
            })
          }
        >
          {c.save}
        </Button>
      </section>
    </div>
  );
}
