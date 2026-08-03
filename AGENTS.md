# AGENTS.md — start here

Onboarding for any AI agent or developer picking up this project. Read this top-to-bottom
before touching code. (Claude Code, Cursor, Copilot, and others read `AGENTS.md` by default.)

## What this is

**FergusOS Terminal** — Patrick Fergus O'Reilly's personal portfolio, styled as a retro CRT
computer terminal (green phosphor + amber accent, scanlines, boot sequence, interactive
command line). Three routes: landing (`/`), experience (`/experience`), projects
(`/projects`).

As of v4 ("Phosphor") the site does not merely *depict* a CRT, it *behaves* like one. Every
effect derives from one premise: an electron beam painting phosphor behind glass. Scroll
velocity is beam velocity, the cursor is a magnet near the tube, a route change is a channel
change, idle time is a burn-in risk. Read
`docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md` before adding motion —
new effects must follow from that premise or they will look like unrelated tricks.

## Stack & conventions

- **Next.js 15 (App Router) + React 19 + TypeScript.** Server Components by default; only
  interactive pieces are `"use client"`.
- **Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS.** The theme is
  driven by CSS variables at the top of that file (`--green`, `--amber`, `--bg`, spacing,
  `--glow`). Three phosphor themes are defined as `html[data-theme="..."]` blocks; their
  matching shader colours live in `THEME_PHOSPHOR` in `lib/system.ts` — change both together.
- **Animation libraries (changed in v4):** `lenis` (inertial scroll), `ogl` (the WebGL
  phosphor shader) and `motion` (springs). The previous "no libraries at all" rule is retired,
  but the spirit stands: **reach for CSS first.** Most effects here are CSS keyframes plus an
  IntersectionObserver, because a one-shot reveal gains nothing from a runtime. `motion` is
  used only for `Magnetic`, where a spring settle is genuinely hard to hand-roll.
- **One frame clock.** `SystemProvider` owns the single `requestAnimationFrame` loop; Lenis,
  the shader, the cursor trail and the status bar all subscribe via `onFrame`. Never start
  another rAF loop, and never `setState` from inside a frame callback — per-frame values are
  mutated on the `frame` ref and published as CSS variables (`--scroll-v`, `--scroll-p`).
- **All editable content lives in `content/*.ts`** — never hard-code copy in components.
- **Accessibility is non-negotiable:** every animation must be gated behind
  `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a
  static/instant fallback. Under `reduce`, Lenis is never mounted, the shader draws one static
  frame, and reveals apply instantly. Keep text contrast ≥ 4.5:1, alt text on images, visible
  focus.
- **Never pre-hide a scroll-revealed element with `clip-path`.** IntersectionObserver folds an
  element's own clip into its intersection rect, so the element hides itself and is then never
  told to appear. Hide with `opacity` (which IO ignores) and keep the clip inside the
  keyframes. This bit once; the rule is in `globals.css` next to `.raster`.
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
app/            layout (fonts, metadata, CRT shell) + the 3 routes + globals.css + icon.svg
components/
  system/       SystemProvider (frame clock + settings), PhosphorScreen (WebGL tube),
                CursorTrail, StatusBar, Screensaver, RouteTransition
  motion/       RasterReveal (the house reveal), HeroName, TiltCard, Magnetic, TimelineSpine
  *.tsx         CrtShell, Nav, BootSequence, Typewriter, Terminal, Window, ImageFrame,
                SignalPlate, PromptLine, ProjectCard, ExperienceItem, Scramble
content/        profile.ts, experience.ts, projects.ts, skills.ts   <-- edit content here
lib/            commands.ts (pure terminal parser + tab completion), system.ts (bus types,
                themes, formatters), scramble.ts   — all three have .test.ts siblings
public/img/     user-supplied images (portrait + screenshots)
docs/
  superpowers/specs/    design spec(s)
  superpowers/plans/    implementation plan(s) — execute these task-by-task
  PROGRESS.md           LIVING STATE: what's done, what's pending, decisions log
```

## The terminal is a real subsystem

`lib/commands.ts` stays **pure**. Commands that change the running site (`theme`, `crt`,
`scanlines`, `matrix`, `degauss`, `sudo rm -rf /`) return an `effect` descriptor; `Terminal.tsx`
is the only place allowed to apply one. Keep it that way — it is why the whole command surface
is unit-testable without a DOM. Add new commands to `COMMANDS`, `HELP_LINES`, the `switch`, and
`complete()`'s argument pools, and add a test.

## How to work on this project

1. Read `docs/PROGRESS.md` for current state + the active plan.
2. Open the referenced plan in `docs/superpowers/plans/` and execute it task-by-task
   (use the executing-plans workflow: implement → test/build → commit per task).
3. **Tick the checkboxes in `docs/PROGRESS.md`** as you complete tasks and append to its
   decision log. This is the handoff contract — keep it current so the next agent isn't lost.
4. Commit per task with clear messages. Keep `npm run build` clean and `npm test` green.

## Known pending work

See `docs/PROGRESS.md`.

## Content still needing the owner (Fergus)

- **Hatch105 role + dates** — `content/experience.ts`, `hatch105` entry (`[ ROLE — TBC ]`).
- **Images** — drop into `public/img/`, then set `portrait` in `content/profile.ts` and each
  project's `image` in `content/projects.ts`. Until set, each slot renders a procedural CRT
  alignment plate (`SignalPlate`) seeded from the project slug. The plate is deliberately a
  test card, not a fake screenshot; real files take over automatically with no code change.
