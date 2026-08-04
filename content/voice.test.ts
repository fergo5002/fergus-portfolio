import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { skills } from "@/content/skills";

/**
 * Fergus's house style (`~/.claude/LANGUAGE.md`) bans em dashes outright, and by
 * 2026-08-04 six had crept into the site's own copy: the page title, the meta
 * description that shows in search results, the boot sequence and the terminal
 * banner.
 *
 * The first version of this file scanned `content/` only, which is precisely
 * where the bug was NOT: two route titles in `app/` shipped with em dashes
 * while this suite sat green. So the scan is now the whole source tree. Comments
 * are stripped first, because nobody reads those on the site.
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRS = ["app", "components", "content", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/** Drops // and block comments so a note to a human never fails the build. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("house style", () => {
  it("ships no em dash anywhere in the source tree", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of sourceFiles(dir)) {
        const body = stripComments(readFileSync(file, "utf8"));
        body.split("\n").forEach((line, i) => {
          if (line.includes("—")) offenders.push(`${file.slice(ROOT.length)}:${i + 1}  ${line.trim()}`);
        });
      }
    }
    expect(offenders, `em dash in:\n${offenders.join("\n")}`).toEqual([]);
  });

  // The content layer is also checked field by field, so a failure names the
  // field rather than a line number.
  const prose: { where: string; text: string }[] = [
    { where: "profile.tagline", text: profile.tagline },
    { where: "profile.education", text: profile.education },
    { where: "profile.location", text: profile.location },
    ...profile.bio.map((b, i) => ({ where: `profile.bio[${i}]`, text: b })),
    ...profile.contact.map((c) => ({ where: `profile.contact.${c.label}`, text: c.label })),
    ...projects.flatMap((p) => [
      { where: `projects.${p.slug}.tagline`, text: p.tagline },
      { where: `projects.${p.slug}.year`, text: p.year ?? "" },
      ...p.bullets.map((b, i) => ({ where: `projects.${p.slug}.bullets[${i}]`, text: b })),
      ...(p.imageAlt ? [{ where: `projects.${p.slug}.imageAlt`, text: p.imageAlt }] : []),
    ]),
    ...experience.flatMap((e) => [
      { where: `experience.${e.id}.dates`, text: e.dates },
      { where: `experience.${e.id}.role`, text: e.role },
      ...(e.summary ? [{ where: `experience.${e.id}.summary`, text: e.summary }] : []),
      ...e.bullets.map((b, i) => ({ where: `experience.${e.id}.bullets[${i}]`, text: b })),
    ]),
    ...skills.map((g) => ({ where: `skills.${g.label}`, text: g.items.join(", ") })),
  ];

  it("uses en dashes only inside date ranges", () => {
    // Real shapes in the content: "2026 – Present", "Feb – Jun 2026",
    // "2024 – 2025", "May 2026 – Present". Anything else is an em dash in
    // disguise. Strip the legitimate ranges, then nothing may survive: asking
    // only "does a valid range appear?" lets one good range launder a bad dash
    // elsewhere in the same string.
    const RANGE = /((?:\w{3} )?\d{4}|\w{3})\s–\s((?:\w{3} )?\d{4}|Present)/g;
    for (const { where, text } of prose) {
      expect(text.replace(RANGE, ""), `${where}: en dash outside a date range`).not.toContain("–");
    }
  });

  it("keeps British spellings in the prose fields", () => {
    // Whole words only. `\w*` suffixes used to flag correctly-spelled proper
    // nouns and CSS identifiers ("Optimizely", "prefers-color-scheme"), which is
    // how a useful test gets deleted instead of fixed.
    const american =
      /\b(analyze[ds]?|analyzing|optimize[ds]?|optimizing|organize[ds]?|organizing|recognize[ds]?|behaviors?|colors?|favors?|centers?)\b/i;
    const proseOnly = prose.filter((p) => !p.where.startsWith("skills."));
    for (const { where, text } of proseOnly) expect(text, where).not.toMatch(american);
  });

  it("keeps every skills label inside its CSS column", () => {
    // .skills__row is a fixed 23ch track and app/page.tsx appends a slash.
    for (const g of skills) expect(g.label.length + 1, g.label).toBeLessThanOrEqual(23);
  });
});
