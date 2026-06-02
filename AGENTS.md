# AGENTS.md — start here

Onboarding for any AI agent or developer picking up this project. Read this top-to-bottom
before touching code. (Claude Code, Cursor, Copilot, and others read `AGENTS.md` by default.)

## What this is

**FergusOS Terminal** — Patrick Fergus O'Reilly's personal portfolio, styled as a retro CRT
computer terminal (green phosphor + amber accent, scanlines, boot sequence, interactive
command line). Three routes: landing (`/`), experience (`/experience`), projects
(`/projects`).

## Stack & conventions

- **Next.js 15 (App Router) + React 19 + TypeScript.** Server Components by default; only
  interactive pieces are `"use client"` (Nav, BootSequence, Terminal, Typewriter, and the new
  GlyphField/Scramble).
- **Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS.** The theme is
  driven by CSS variables at the top of that file (`--green`, `--amber`, `--bg`, spacing,
  `--glow`). Change those to re-tune the look.
- **No animation/UI libraries.** All effects (scanlines, typewriter, glyph rain, scramble,
  power-on) are hand-rolled so they stay editable and dependency-free. Keep it that way unless
  there's a strong reason.
- **All editable content lives in `content/*.ts`** — never hard-code copy in components.
- **Accessibility is non-negotiable:** every animation must be gated behind
  `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a
  static/instant fallback. Keep text contrast ≥ 4.5:1, alt text on images, visible focus.
- **Path alias:** `@/*` → repo root (e.g. `@/content/profile`).

## Commands

```bash
npm install        # first time
npm run dev        # http://localhost:3000
npm run build      # production build (must stay clean)
npm test           # vitest unit tests (must stay green)
npm start          # serve the production build
```

Deploy: Vercel, zero config — `vercel` (preview) / `vercel --prod` (production).

## Layout of the repo

```
app/            layout (fonts, metadata, CRT shell) + the 3 routes + globals.css
components/     CrtShell, Nav, BootSequence, Typewriter, Terminal, Window, ImageFrame,
                PromptLine, ProjectCard, ExperienceItem  (+ GlyphField, Scramble = planned)
content/        profile.ts, experience.ts, projects.ts, skills.ts   <-- edit content here
lib/            commands.ts (terminal parser) + commands.test.ts     (+ scramble.* = planned)
public/img/     user-supplied images (portrait + screenshots)
docs/
  superpowers/specs/    design spec(s)
  superpowers/plans/    implementation plan(s) — execute these task-by-task
  PROGRESS.md           LIVING STATE: what's done, what's pending, decisions log
```

## How to work on this project

1. Read `docs/PROGRESS.md` for current state + the active plan.
2. Open the referenced plan in `docs/superpowers/plans/` and execute it task-by-task
   (use the executing-plans workflow: implement → test/build → commit per task).
3. **Tick the checkboxes in `docs/PROGRESS.md`** as you complete tasks and append to its
   decision log. This is the handoff contract — keep it current so the next agent isn't lost.
4. Commit per task with clear messages. Keep `npm run build` clean and `npm test` green.

## Known pending work

See `docs/PROGRESS.md`. Active plan:
`docs/superpowers/plans/2026-06-02-retro-animations-and-boot-fix.md`
(boot-flash fix, CRT power-on transition, ambient glyph-rain background, GPA tweak).

## Content still needing the owner (Fergus)

- **Hatch105 role + dates** — `content/experience.ts`, `hatch105` entry (`[ ROLE — TBC ]`).
- **Images** — drop into `public/img/`, then set `portrait` in `content/profile.ts` and each
  project's `image` in `content/projects.ts`. Until set, labelled placeholder boxes show.
