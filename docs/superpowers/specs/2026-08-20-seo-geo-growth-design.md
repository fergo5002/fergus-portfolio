# SEO + GEO growth engine — design

**Date:** 2026-08-20
**Goal:** drive as much qualified traffic to `fergusoreilly.dev` as possible, through both
classical search (SEO) and answer engines (GEO), without breaking the CRT premise the site is
built on.

## Where the site starts

Measured against the live host on 2026-08-20, not assumed:

| Signal | State |
|---|---|
| `/robots.txt` | **404** |
| `/sitemap.xml` | **404** |
| `/llms.txt` | **404** |
| Structured data | **none** on any route |
| Canonical URLs | **none**, and no `metadataBase` |
| OG image | declared `openGraph` but **no image** |
| Total indexable text | ~1,340 words across three routes |
| Homepage `<h1>` | the name split across 21 per-character `<span>`s |

Two of those are worth naming properly.

**The H1.** `HeroName` renders `Patrick Fergus O'Reilly` one character per element so each glyph can
be animated. The accessible name is correct (`aria-label` on the wrapper, `aria-hidden` on the
visual layer), so screen readers are fine. Crawlers are not the same audience. Anything doing
naive HTML-to-text over inline-block elements, which is most of what feeds an LLM, reads
`P a t r i c k F e r g u s O ' R e i l l y`. The single most important string on the domain is the
one most likely to be misread.

**The volume.** 1,340 words can win the owner's own name and nothing else. Technical fixes get the
site indexed; they do not create demand. The only lever that raises the ceiling is publishing
something worth finding. That is why the writing surface is in scope and is the largest part of
this work.

## Decisions taken (from two rounds of grilling, 2026-08-20)

1. **Scope:** technical foundation **and** a writing surface, seeded with real long-form posts.
2. **Positioning:** Tigh Sauna leads, present tense. Presterly becomes a past role, told honestly.
   **CK Beiginis Holdings is not named anywhere public.**
3. **Tigh Sauna framing, in Fergus's words:** *"running a sauna shouldn't be admin, and Tigh Sauna
   makes it so easy and fast and boosts retention in one place."* Plain words. Product positioning,
   never a measured-results claim, because there is no measured result yet
   (`TIGH_MESSAGING_MODE=simulated`, two merchants, September go-live).
4. **Status:** starting third year of CS & Business at Trinity, building full time alongside it.
5. **Audience:** founders and investors, plus recruiters and employers.
6. **Topics:** all four — shipping with AI agents, Shopify engineering, founder post-mortems,
   motion and craft on the web.
7. **Conversion:** book a conversation. No booking link exists, so it is a direct mail-to with a
   pre-filled subject, treated as a real CTA rather than a footer address.
8. **OpenSEO:** cloud (`app.openseo.so`), reached over its MCP server.

## Constraints this design has to respect

From `AGENTS.md`, `LANGUAGE.md` and `[[fergus]]`, all of which outrank tidy SEO theory:

- **Ventures are evidence, not the subject.** One short paragraph per venture is the ceiling. This
  pulls against "more words is better", and the resolution is that all depth goes into the
  articles, never into the venture blurbs.
- **Precision numbers are padding.** No six-figure traction dumps.
- **No em dashes, British English, plain words.** Applies to every word published here, which now
  includes eight articles and every meta description.
- **Content lives in `content/*.ts`.** Nothing hard-coded in components.
- **Hand-written CSS.** No Tailwind, no CSS-in-JS.
- **Every animation gated on `prefers-reduced-motion`.**
- **No new runtime dependencies** unless they earn it. They do not here.
- **Deploys are blocked** when a commit carries an unverifiable author. Ship from a `git archive`
  staging tree with no `.git`, then confirm `readyState` and `aliasAssigned` over the API.

## Architecture

### 1. One SEO source of truth: `lib/seo.ts`

Every URL, canonical, and JSON-LD object is built here and nowhere else. The site already learnt
this lesson once with metadata derived from `content/profile.ts` rather than retyped; this extends
it. Pure functions, no React, so it is unit-testable in full.

Exports: `SITE_URL`, `absolute(path)`, `canonical(path)`, and builders for `Person`, `WebSite`,
`ProfilePage`, `BlogPosting`, `BreadcrumbList`, `ItemList`.

The `Person` graph is the load-bearing GEO artefact. It is what tells an answer engine that this
domain is the authoritative source for the entity "Fergus O'Reilly": `name`, `alternateName`
(the legal `Patrick Fergus O'Reilly`), `url`, `image`, `jobTitle`, `worksFor`, `alumniOf`,
`knowsAbout`, and `sameAs` pointing at every profile that corroborates it.

### 2. Crawl surface

- `app/sitemap.ts` — every route including each article, with real `lastModified`.
- `app/robots.ts` — allow everything, name the AI crawlers explicitly (GPTBot, ClaudeBot,
  OAI-SearchBot, PerplexityBot, Google-Extended, CCBot, Bytespider, Amazonbot, Applebot-Extended),
  and point at the sitemap. Explicit allows matter: several of these treat an absent rule as a
  reason to be conservative, and a site that wants to be cited should say so out loud.
- `app/llms.txt/route.ts` — plain text, the GEO equivalent of a sitemap. Who he is, what he is
  doing now, the ventures in one line each, and every article with a one-line summary and URL.
  Generated from `content/`, so it cannot drift.
- `app/feed.xml/route.ts` — RSS. Still the cheapest distribution there is, and it is how most
  aggregators and several AI crawlers discover new posts.

### 3. Metadata and structured data per route

`metadataBase` set once in the root layout, so every relative OG and canonical URL resolves.
Each route declares its own canonical, title, description and OG image. JSON-LD is injected as a
`<script type="application/ld+json">` from a small server component.

| Route | Schema |
|---|---|
| `/` | `Person` + `WebSite` + `ProfilePage` |
| `/projects` | `CollectionPage` + `ItemList` of `CreativeWork` |
| `/experience` | `ProfilePage` + `ItemList` of `OrganizationRole` |
| `/writing` | `Blog` + `ItemList` |
| `/writing/[slug]` | `BlogPosting` + `BreadcrumbList` |

### 4. OG images

Generated at the edge with `next/og`, in the site's own phosphor language: near-black ground,
green text, scanline rule, name and title. Per-route via `opengraph-image.tsx`. No new dependency,
`next/og` ships with Next.

### 5. The H1 fix

`HeroName` keeps its per-character animation and gains a real, crawlable text node. The plain name
is rendered in a visually-hidden-but-present element that is **not** `aria-hidden`, and the
decorative character layer becomes `aria-hidden` alone. Net effect: screen readers get one clean
announcement (unchanged), crawlers get `Patrick Fergus O'Reilly` as contiguous text, and the
animation is untouched.

### 6. The writing surface

**Storage.** `content/articles/*.ts`, one module per article, each exporting typed front matter
plus a markdown `body` string. This keeps content in `content/` as the repo requires and keeps
authoring natural.

**Rendering.** `lib/markdown.ts`, a hand-written renderer for the subset actually used: headings,
paragraphs, lists, code blocks, blockquotes, horizontal rules, and inline emphasis, code and
links. It returns typed blocks that a server component renders to real elements. No new
dependency and no `dangerouslySetInnerHTML`.

The subset is deliberate. A general markdown library is 60 kB to render eight documents whose
syntax is entirely under our own control, and `dangerouslySetInnerHTML` on generated HTML is a
sanitisation problem the site does not otherwise have. It has a `.test.ts` sibling like every other
`lib/` module, and every inline construct is tested including the escaping.

**Routes.** `/writing` index, `/writing/[slug]` article, both statically generated.

**Reading.** Articles are long-form prose inside a CRT theme, which is a real legibility risk. The
article body gets a constrained measure (~68 characters), larger line height, and the mono display
face reserved for headings and code, with body text in the readable mono at a comfortable size.
Phosphor glow is reduced on body copy: glow at reading length is fatigue.

**Eight seeded articles**, two per theme, each one drawn from something actually built and each
targeting a real question a person or a model would ask.

### 7. The CTA

A `Talk` block: one line, one action, `mailto:` with a pre-filled subject. Sits at the foot of the
landing page and every article. `content/profile.ts` gains an optional `booking` URL that, when
set, is preferred over the mailto. Empty today, so the mailto is what ships, and adding a link
later is a one-line content change.

### 8. Truth maintenance

`AGENTS.md`'s "Keeping the numbers honest" section governs live traction claims. Presterly's
numbers become historical the moment its entry moves to past tense, so that section is rewritten
to say so: those figures are a snapshot of a wound-down company, they are never to be re-verified
against a database that no longer serves the business, and they must read in the past tense.

## Testing

- `lib/seo.test.ts` — canonical building, absolute URLs, every JSON-LD builder's required fields,
  and that no builder can emit an undefined value into the graph.
- `lib/markdown.test.ts` — every block and inline form, nesting, escaping, and that unknown syntax
  degrades to plain text rather than throwing.
- `content/articles.test.ts` — every article has a unique slug, a title under 60 characters, a
  description between 70 and 160, a valid date, at least one tag, and a body over 600 words.
  This is the guard that stops a thin or malformed post shipping.
- Existing suites stay green; `npm run build` stays clean.

## Verification

Per `[[coding-policy]]`: prove it in test, prove it in a prod-parity container, deploy, then prove
the live feature in production. Specifically, after deploy: `/robots.txt`, `/sitemap.xml`,
`/llms.txt` and `/feed.xml` all 200 with the right content type, every article route 200, the
JSON-LD on each route parses and validates, the OG images render, and the live H1 extracts as
contiguous text.

## Out of scope

- Programmatic or comparison pages. Rejected in grilling: thin content on a personal domain.
- Backlink buying, directory spam, or any link scheme.
- Any change to the phosphor motion system, physics, or synth.
- Naming CK Beiginis Holdings, discussing grants, or the phrase "build fee".
