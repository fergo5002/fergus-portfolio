# FergusOS Terminal Portfolio — Design Spec

**Date:** 2026-06-02
**Owner:** Patrick Fergus O'Reilly
**Status:** Approved (design), pending implementation plan

---

## 1. Concept & Vibe

A personal portfolio site styled as a **retro CRT computer terminal**: green phosphor
on near-black, scanlines, screen-curvature glow, a boot sequence on first load, a
blinking cursor, and content that "types" in. **Amber** is the accent colour (links,
highlights, the Hatch105 "NEW" badge) against the primary **green (`#33ff66`)** so the
site feels alive rather than flat-monochrome. Retro effects must stay tasteful and never
hurt readability or usability.

Goals (from the user): cool, original, "alive", retro, and able to showcase real images
(portrait, project screenshots). The terminal is the *shell and navigation*; richer
content opens into phosphor-framed panels that can hold images.

## 2. Image Handling (the "monochrome terminal vs. real photos" resolution)

- Photos/screenshots sit inside **phosphor-framed panels** with an ASCII/dithered border
  and a faint scanline overlay.
- Images carry a **subtle green-duotone tint by default** to live in the CRT world, while
  staying clearly legible. Tint strength is adjustable per image (CSS, easy to dial down).
- Any image not yet supplied renders as a **clearly-labelled placeholder box**
  (e.g. `[ insert: portrait.jpg ]`). The user drops real files into `public/img/` later.

## 3. Site Architecture

Next.js (App Router) deployed on Vercel. Real, shareable routes (good for recruiters,
SEO, and accessibility), unified by a persistent terminal shell.

- `/` — **Landing**: boot sequence → hero (`whoami`) → highlights → About / Skills /
  Contact sections (anchored, deep-linkable).
- `/experience` — **Experience**: Hatch105 (headline), Larry, Trinity Student Managed Fund.
- `/projects` — **Projects**: Larry, Sauna OS, ContraBot, Remand, Under the Campanile.

**Navigation model:** a persistent terminal top-bar / prompt acts as the menu
(`$ cd experience`). On the landing hero *only*, a real mini command-line accepts a small
set of fun commands (`help`, `ls`, `whoami`, `cd projects`, `sudo hire-me`) as a signature
interactive flourish. **Every navigation target is also a plain clickable link** — nothing
critical depends on typing a command.

## 4. Page-by-Page Content & Layout

### Landing (`/`)
- **Boot sequence**: a few lines of fake POST/boot text type out (~1.2s, skippable, runs
  once per session via `sessionStorage`), then the screen "powers on".
- **Hero**: `fergus@portfolio:~$ whoami` → name, tagline
  ("Technical Founder · CS @ Trinity · Builder"), framed `[portrait]` panel.
- **Highlights strip**: Hatch105 • Larry • 1.1 / Scholar — glowing terminal "cards".
- **About** (`cat about.txt`): short bio in his voice.
- **Skills** (`ls ./skills`): grouped readout (languages / frameworks / data+infra / AI / tools).
- **Contact** (`./contact.sh`): email, GitHub, LinkedIn.

### Experience (`/experience`)
Rendered like a `git log` / timeline of "commits":
1. **Hatch105 — HappyStack** — amber **NEW** badge. Building software for ecommerce within
   the Hatch105 accelerator, working with HappyStack. *Role title + dates = placeholder.*
2. **Larry — CTO & Co-Founder** (Feb 2025 – Present) — autonomous execution layer for
   project management; led a team of 3 engineers; TypeScript monorepo (Next.js 16,
   Fastify v5, BullMQ, PostgreSQL, Redis, OpenAI); Slack/Google Calendar/email integrations;
   live at larry-pm.com.
3. **Trinity Student Managed Fund — Junior Analyst, Tech Hardware** (2024 – 2025) —
   semiconductor/tech-hardware equities, fund AUM > €700k; led an inter-sector pitch team.

### Projects (`/projects`)
Grid of project "windows", each expanding to a detail panel. Each entry: title, one-liner,
stack tags (styled as terminal flags), role, links (live/GitHub where public), image
placeholder.
1. **Larry** — AI-native project-management platform (flagship). Next.js 16, Fastify,
   BullMQ, Postgres, Redis, OpenAI. live: larry-pm.com.
2. **Remand** — AI market-intelligence platform (HackEurope 2026). Surfaces high-intent
   market opportunities from online discussion via semantic search + growth-momentum
   mapping. Next.js 16, React 19, FastAPI, Supabase (pgvector), OpenAI/Anthropic.
   live: nybblers.vercel.app.
3. **Under the Campanile** — procedurally generated top-down dungeon crawler (TCD × Qualcomm
   Software Engineering project). Fergus = Shaders & Lighting Engineer in a team of 8;
   custom GLSL shaders, dynamic lighting & shadow casting; TypeScript + Phaser 3; mentored
   by a Qualcomm staff engineer.
4. **Sauna OS** — multi-tenant booking & operations platform for sauna businesses;
   Stripe Connect payments, memberships.
5. **ContraBot** — Python contrarian trading bot: monitors Reddit sentiment via the
   Anthropic Claude API, inverts crowd signals, executes paper trades through Alpaca with
   position management and P&L tracking.

> Note: Larry intentionally appears in both Experience (role/impact framing) and Projects
> (technical product framing).

## 5. Visual System

- **Colours:** bg `#0a0e0a` (near-black); primary green `#33ff66`; dim green `#1f8f3a`;
  amber accent `#ffb000`; red used sparingly for "alerts". Green is primary, amber is accent.
- **Typography:** monospace throughout. Body/UI = `JetBrains Mono` or `IBM Plex Mono`;
  big hero/section headers = a chunkier display mono or pixel face (e.g. `VT323`).
  Loaded via `next/font` with `display: swap`.
- **Effects:** CSS scanline overlay, vignette / curvature glow, `text-shadow` phosphor
  bloom, blinking block cursor, very subtle flicker.

## 6. Interaction & Motion

- Typing + boot animations on entry; staggered reveal of list items (30–50ms each).
- Hover = brighten + glow on links/cards; visible focus rings retained.
- **`prefers-reduced-motion` fully respected**: boot/typing collapse to instant render,
  flicker disabled. No critical content depends on animation.

## 7. Accessibility & Quality (per UI/UX design-intelligence rules)

- Semantic HTML + correct heading hierarchy; fully keyboard-navigable; visible focus.
- Alt text on all images; `aria-live="polite"` on typed regions so screen readers aren't
  spammed by the typing animation (final text announced once).
- Green/amber-on-black contrast verified ≥ 4.5:1 for text.
- Mobile-first responsive (375 / 768 / 1024+); CRT effects toned down on small screens;
  no horizontal scroll; touch targets ≥ 44px.
- Performance: `next/font`, optimized `next/image`, no layout shift (reserve space),
  minimal client JS (effects are CSS-first).

## 8. Tech Structure

```
fergus-portfolio/
  app/
    layout.tsx
    page.tsx                 # landing (boot + hero + about/skills/contact)
    experience/page.tsx
    projects/page.tsx
  components/
    CrtShell.tsx             # scanlines, vignette, screen frame (wraps all pages)
    BootSequence.tsx         # one-time boot animation
    Terminal.tsx             # interactive mini command-line (landing hero)
    Prompt.tsx / Typewriter.tsx
    Window.tsx               # phosphor-framed panel
    ImageFrame.tsx           # image w/ duotone + scanline overlay + placeholder fallback
    ProjectCard.tsx
    ExperienceItem.tsx
    Nav.tsx                  # persistent terminal top-bar nav
  content/
    profile.ts               # name, tagline, bio, contact links
    experience.ts            # Hatch105, Larry, TSMF
    projects.ts              # the 5 projects
    skills.ts                # grouped skills
  public/img/                # user drops portrait + project screenshots here
  styles/ (or app/globals.css)
```

Content lives in typed data files (`content/*.ts`) so all editable text is in one obvious
place. Deploy via the user's normal `vercel` flow.

## 9. Content Data (from CV — single source of truth for the build)

- **Identity:** Patrick Fergus O'Reilly, Dublin, Ireland.
- **Education:** Trinity College Dublin — BA Computer Science (Major), Business (Minor),
  First Class Honours (1.1) each of 1st & 2nd year; entering 3rd year (started 2024).
  Sat Foundation Scholarship exams, predicted Scholar.
- **Skills:**
  - Languages: TypeScript, Python, Java, C, SQL, ARM Assembly
  - Frameworks/Libraries: React, Next.js, Node.js, FastAPI, Fastify
  - Data & Infra: PostgreSQL, Redis, Supabase, BullMQ, Docker, WebSockets
  - AI: OpenAI & Anthropic APIs, semantic search (pgvector)
  - Graphics: Phaser 3, GLSL / WebGL shaders
  - Tools: Git, Vercel
  - Spoken: English (native), French (advanced)
  - Interests: Poker (probability & game theory), cuisine, Gaelic football
- **Contact (public):** email `oreillferg@gmail.com`; GitHub `github.com/fergo5002`;
  LinkedIn `https://www.linkedin.com/in/patrickfergusoreilly/`. Phone intentionally NOT
  shown on the public site.

## 10. Open Items / Placeholders

- **Hatch105 role title + dates** — placeholder until the user supplies them.
- **Images** — portrait + project screenshots are placeholders until dropped into
  `public/img/`.
- **Defaults chosen (easily flippable):** public email = gmail; phone hidden;
  green-primary / amber-accent.

## 11. Out of Scope (YAGNI)

- No CMS / backend / database (content is static data files).
- No downloadable-CV button (not requested).
- No EstatelynkAI project (not selected).
- No blog, analytics, or contact form in v1.
