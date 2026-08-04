import { describe, it, expect } from "vitest";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { skills } from "@/content/skills";

/**
 * Fergus's house style (`~/.claude/LANGUAGE.md`) bans em dashes outright, and by
 * 2026-08-04 six had crept into the site's own copy: the page title, the meta
 * description that shows up in search results, the boot sequence and the
 * terminal banner. Prose is easy to fix and easy to regress, so it is pinned.
 *
 * Scope is the content layer plus anything it feeds. Code comments are exempt,
 * because nobody reads those on the site.
 */
describe("house style", () => {
  const prose: { where: string; text: string }[] = [
    { where: "profile.tagline", text: profile.tagline },
    { where: "profile.education", text: profile.education },
    { where: "profile.location", text: profile.location },
    ...profile.bio.map((b, i) => ({ where: `profile.bio[${i}]`, text: b })),
    ...profile.contact.map((c) => ({ where: `profile.contact.${c.label}`, text: c.label })),
    ...projects.flatMap((p) => [
      { where: `projects.${p.slug}.tagline`, text: p.tagline },
      ...p.bullets.map((b, i) => ({ where: `projects.${p.slug}.bullets[${i}]`, text: b })),
      ...(p.imageAlt ? [{ where: `projects.${p.slug}.imageAlt`, text: p.imageAlt }] : []),
    ]),
    ...experience.flatMap((e) => [
      ...(e.summary ? [{ where: `experience.${e.id}.summary`, text: e.summary }] : []),
      ...e.bullets.map((b, i) => ({ where: `experience.${e.id}.bullets[${i}]`, text: b })),
    ]),
    ...skills.map((g) => ({ where: `skills.${g.label}`, text: g.items.join(", ") })),
  ];

  it("uses no em dashes anywhere in the copy", () => {
    for (const { where, text } of prose) expect(text, where).not.toContain("—");
  });

  it("uses en dashes only in date ranges, never as sentence punctuation", () => {
    for (const { where, text } of prose) {
      // "2026 – Present" is correct typography. " – " mid-sentence is an em dash
      // wearing a disguise, which is the thing actually banned.
      const suspicious = text.match(/–/g) ?? [];
      if (suspicious.length) {
        expect(text, `${where}: en dash outside a date range`).toMatch(
          /\b(\d{4}|\w{3} \d{4})\s–\s(\d{4}|\w{3} \d{4}|Present)/,
        );
      }
    }
  });

  it("keeps British spellings for the ones that actually appear", () => {
    // Not a dictionary, just the handful this copy is likely to reach for.
    const american = /\b(analyz|optimiz|organiz|recogniz|behavior|color|favor|center)\w*/i;
    for (const { where, text } of prose) expect(text, where).not.toMatch(american);
  });
});
