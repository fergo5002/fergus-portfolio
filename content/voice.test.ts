import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { skills } from "@/content/skills";
import { tools, toolShellCopy } from "@/content/tools";
import { secondVisitCopy, TIGH_CREDIT } from "@/content/tools/second-visit";

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
/** Deny-list, not an allow-list: a new top-level directory is covered by default.
 *  An allow-list is how the first version of this guard missed `app/` entirely. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "public", "docs", "assets"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (SKIP_DIRS.has(entry)) continue;
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

/**
 * Drops comments so a note to a human never fails the build. Two regexes are not
 * a lexer, and the naive version had proven false negatives: a `//` inside a
 * template literal hid 23 real lines of this repo's GLSL, and a `/*` inside a
 * string literal swallowed everything down to the next close marker, em dash
 * included. So this only strips a `//` that starts a line, never one that
 * follows code, and it preserves newlines so reported line numbers are true.
 * It errs towards reporting noise, because a guard that goes quiet is worse
 * than one that occasionally shouts.
 *
 * Known residual gap, accepted knowingly: a line inside a template literal that
 * begins with `//`, such as ASCII art, is still treated as a comment. Closing it
 * needs a real lexer. The value-level test below is immune to all of this and
 * covers the content layer, which is where the copy actually lives.
 */
function stripComments(src: string): string {
  return src
    // Line-anchored: an unanchored /* matched one inside a string literal and
    // swallowed every line down to the next close marker, em dash included.
    // Real block comments here always start their line. Newlines are kept so
    // reported line numbers stay true (the naive version drifted by up to 32).
    // The optional `{` covers the JSX `{/* ... */}` form, which is still a
    // comment and still always starts its own line here.
    .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("house style", () => {
  it("ships no em dash anywhere in the source tree", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const body = stripComments(readFileSync(file, "utf8"));
      body.split("\n").forEach((line, i) => {
        if (line.includes("—")) offenders.push(`${file.slice(ROOT.length)}:${i + 1}  ${line.trim()}`);
      });
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
    ...tools.flatMap((t) => [
      { where: `tools.${t.slug}.name`, text: t.name },
      { where: `tools.${t.slug}.blurb`, text: t.blurb },
      ...t.cantSee.map((line, i) => ({ where: `tools.${t.slug}.cantSee[${i}]`, text: line })),
    ]),
    { where: "toolShellCopy.privacy.browser", text: toolShellCopy.privacy.browser },
    { where: "toolShellCopy.privacy.server", text: toolShellCopy.privacy.server },
    { where: "toolShellCopy.cantSeeHeading", text: toolShellCopy.cantSeeHeading },
    ...(function flattenSecondVisit(): { where: string; text: string }[] {
      const out: { where: string; text: string }[] = [];
      const walk = (node: unknown, path: string) => {
        if (typeof node === "string") out.push({ where: `secondVisitCopy.${path}`, text: node });
        else if (Array.isArray(node)) node.forEach((value, index) => walk(value, `${path}[${index}]`));
        else if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
        }
      };
      walk(secondVisitCopy, "");
      if (TIGH_CREDIT) out.push({ where: "TIGH_CREDIT.line", text: TIGH_CREDIT.line });
      return out;
    })(),
  ];

  // Restored after being briefly replaced by the file scan above. Checking the
  // string VALUE cannot be fooled by any comment-stripping bug, so the two tests
  // fail independently and one covering for the other is the point.
  it("has no em dash in any content value", () => {
    for (const { where, text } of prose) expect(text, where).not.toContain("—");
  });

  it("uses en dashes only inside date ranges", () => {
    // Split by field rather than pattern-matching prose. The earlier version
    // used `\w{3}` with no word boundary, so it matched the last three letters
    // of any word: "Co-founder and CTO – Present, and still shipping" slipped
    // straight through the rule meant to catch it.
    const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
    const SIDE = `(?:${MONTH} )?\\d{4}|${MONTH}`;
    const WHOLE_RANGE = new RegExp(`^(?:${SIDE})\\s–\\s(?:(?:${SIDE})|Present)$`);
    for (const { where, text } of prose) {
      if (/\.(dates|year)$/.test(where)) {
        // A date field may hold a range, but then the WHOLE value must be one.
        if (text.includes("–")) expect(text, `${where}: malformed date range`).toMatch(WHOLE_RANGE);
      } else {
        expect(text, `${where}: en dash outside a date field`).not.toContain("–");
      }
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

  it("keeps every contact label inside its CSS column", () => {
    // .contact__row is a fixed 18ch track and app/page.tsx renders the label raw.
    // The sibling assertion in lib/commands.test.ts covers the same fact from the
    // terminal side; this one keeps both fixed tracks pinned in one place.
    for (const c of profile.contact) expect(c.label.length, c.label).toBeLessThanOrEqual(18);
  });
});
