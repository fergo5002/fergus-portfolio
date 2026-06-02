# PROGRESS — living project state

> Update this file as you work. It is the handoff contract: the next agent reads it first.
> Keep the status line current, tick task boxes, and append to the decision log.

**Project:** FergusOS Terminal portfolio (`C:\Dev\fergus-portfolio`)
**GitHub:** https://github.com/fergo5002/fergus-portfolio (private)
**Status (2026-06-02):** v1 site built & deployed-ready. Retro-animation upgrade
**animations shipped** on branch `feat/retro-animations` (boot-flash fix, CRT power-on, hero
scramble, glyph-rain, GPA tweak). Tests 16/16 green, `npm run build` clean. A visual pass on a
preview deploy is still recommended (see verification note in the decision log).

---

## Done

- [x] Design spec — `docs/superpowers/specs/2026-06-02-fergusos-terminal-portfolio-design.md`
- [x] v1 build: landing + experience + projects, CRT theme, boot sequence, interactive
      terminal, content in `content/*.ts`, command parser + 13 passing tests. Build clean.

## Active plan — retro animations & boot fix  ✅ COMPLETE

Plan: `docs/superpowers/plans/2026-06-02-retro-animations-and-boot-fix.md`
(All tasks implemented on branch `feat/retro-animations`, one commit per task.)

- [x] **Task 1 — boot-flash fix** (pre-paint blocking script + `.booting` hide rules)
- [x] **Task 2 — CRT power-on transition** (boot → site reveal)
- [x] **Task 3 — hero text scramble/decode** (`lib/scramble.ts` + `components/Scramble.tsx`)
- [x] **Task 4 — ambient glyph-rain background** (`components/GlyphField.tsx`, all pages)
- [x] **Task 5 — content tweak** (academic highlight → `1.1 / 4.0 GPA`)
- [x] **Task 6 — verification + update this file**

## Backlog / owner-blocked

- [ ] Hatch105 role + dates — owner to supply (`content/experience.ts`).
- [ ] Real images — owner drops into `public/img/` and sets paths.
- [ ] Decide whether to make the GitHub repo public (currently private).
- [ ] First Vercel deploy (`vercel --prod`).

---

## Decision log

- **2026-06-02** — Stack chosen: Next.js 15 + React 19 + TS, hand-written CSS (no Tailwind),
  no animation libs. Content in `content/*.ts`. Reduced-motion gating mandatory.
- **2026-06-02** — Style direction: CRT terminal (green primary `#33ff66`, amber accent
  `#ffb000`). Public email = gmail; phone omitted.
- **2026-06-02** — Retro-animation upgrade researched & planned (digital-rain background,
  CRT power-on transition, hero scramble, theme-flash-pattern boot fix). See active plan.
- **2026-06-02** — RESOLVED: owner confirmed the Scholarship reference should go everywhere.
  Removed "and sitting the Foundation Scholarship examinations" from the bio in
  `content/profile.ts`. (Academic highlight → "1.1 / 4.0 GPA" still handled by plan Task 5.)
- **2026-06-02** — Retro-animation plan EXECUTED on branch `feat/retro-animations` (commits
  9e5a2c5 → 838eac9, one per task): boot-flash fix, CRT power-on, hero scramble (+16 unit
  tests), ambient glyph-rain, academic highlight → "1.1 / 4.0 GPA". `npm test` 16/16 green,
  `npm run build` clean.
  - **Deviation from plan (approved):** Task 1's pre-paint script is gated on
    `location.pathname === "/"`. The plan added `.booting` globally, but `BootSequence` (which
    clears the flag) only mounts on the landing page — so a fresh-session direct visit to
    `/experience` or `/projects` would have stayed permanently hidden. Gating the script to the
    landing page keeps boot a landing-only intro and lets other routes render instantly.
  - **Verification note:** automated checks (tests + build) pass. The visual pass — fresh-tab
    boot (no flash) → power-on → hero scramble; glyph-rain on all 3 routes; reduced-motion
    static fallbacks; 375px mobile; tab-switch pauses the canvas — was NOT run in a browser
    here (this machine tests on deployed prod). Do this on a Vercel preview before merging.
