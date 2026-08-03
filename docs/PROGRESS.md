# PROGRESS — living project state

> Update this file as you work. It is the handoff contract: the next agent reads it first.
> Keep the status line current, tick task boxes, and append to the decision log.

**Project:** FergusOS Terminal portfolio (`C:\Dev\fergus-portfolio`)
**GitHub:** https://github.com/fergo5002/fergus-portfolio (private)
**Status (2026-08-03):** **v4 "Phosphor" motion system shipped.** The site now behaves like a
CRT rather than depicting one — a single WebGL shader owns the tube (glyph rain, aperture
grille, scroll-driven beam smear, cursor magnetism, degauss), Lenis drives inertial scroll,
the terminal became a real mini-OS whose commands rewrite the live site, and cards/timelines
paint themselves in as the beam reaches them. Spec:
`docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md`.

Previous (2026-07-14): content refresh — Presterly (Co-Founder & CTO, Hatch105) replaces the
`[ ROLE — TBC ]` Hatch placeholder as the lead experience entry and top project; Larry renamed
to Loira AI with corrected dates (Feb–Jun 2026) and the loira.ai link.

---

## v4 "Phosphor" — shipped 2026-08-03

Branch `feat/phosphor-motion-system`. Design forks were settled with Fergus up front: full
library arsenal, inertial scroll, all four set-pieces, generated placeholders.

- [x] `SystemProvider` — one rAF clock driving Lenis, shader, trail and status bar; per-frame
      state on a ref (never React state); settings persisted + restored pre-paint
- [x] `PhosphorScreen` — OGL fullscreen-quad GLSL: dot-matrix glyph rain, aperture grille,
      scanlines, barrel curve, hum bar, scroll-velocity beam smear + chromatic aberration,
      cursor magnetic ripple, degauss shockwave, three phosphor palettes, adaptive quality
- [x] `RasterReveal` — the house reveal (block paints in behind a travelling beam line)
- [x] Hero — per-character magnetic repulsion with RGB convergence loss
- [x] Boot — BIOS header, counting memory test, device list, loading bar, degauss → power-on
- [x] Terminal → mini-OS — tab completion with ghost text, ↑/↓ history, Ctrl+L, and commands
      that genuinely rewrite the site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`,
      `neofetch`, `top`, `uptime`, `resume`, `open`, `sudo rm -rf /` → reboot)
- [x] Living cards — decrypt-on-scroll titles, cursor tilt + specular glare, perimeter beam
      trace, per-project signal meter; experience timeline draws its own spine
- [x] Ambient life — status bar (uptime/pwd/memory address/fps/coords), phosphor cursor trail,
      channel-change route transitions, 45s idle screensaver
- [x] `SignalPlate` — procedural per-project CRT alignment plates for empty image slots
- [x] Accessibility — skip link, focus moved to `main` on route change, full reduced-motion
      path (no Lenis, static shader, instant reveals, no trail, no screensaver)
- [x] Tests 16 → 49; `npm run build` clean; all routes still static

> **DEPLOY PENDING — not yet live.** Merged to `main` and pushed (`8d630a7`), but
> `https://fergus-portfolio.vercel.app` is still serving the pre-v4 build. The Vercel CLI is
> installed (54.11.1) but reports `Error: Not authorized`, there is no `VERCEL_TOKEN` in the
> environment, no `auth.json`, and the project is CLI-linked rather than Git-connected, so
> pushing to `main` triggers no deployment (confirmed by polling the live URL for four minutes
> after the push). Fergus needs to run `vercel login` once, then `vercel --prod` from the repo
> root. Everything else is verified; only the deploy step is outstanding.

**Verified before ship:** production build served locally and exercised in a real browser —
boot, reveals on genuine wheel scroll (6/6 project cards), theme/crt/scanlines commands
mutating the live DOM and persisting, tab completion, route-change overlay + focus move,
screensaver appearing at 45s and waking on input, reduced-motion emulation, 390px mobile with
no horizontal overflow. 88–94 fps on desktop viewport.

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

- [x] Hatch105 role + dates — resolved 2026-07-14: the entry is now Presterly
      (Co-Founder & CTO, May 2026 – Present, built inside Hatch105).
- [ ] Real images — owner drops into `public/img/` and sets paths.
- [ ] Decide whether to make the GitHub repo public (currently private).
- [x] First Vercel deploy — live at https://fergus-portfolio.vercel.app (2026-06-02).
- [x] **2026-07-14 content refresh DEPLOYED + LIVE-VERIFIED** — all three routes on
      https://fergus-portfolio.vercel.app serve the new content (Presterly highlights + bio,
      Loira AI entry, placeholder and stale dates gone; checked via compressed curl + string
      markers). The deploy ran outside the agent session (the local Vercel CLI was
      unauthorised at the time) — if deploys are still CLI-based, `vercel whoami` needs a
      fresh `npx vercel login` before the next one.
- [ ] Add a favicon (prod logs a harmless `/favicon.ico` 404).
- [ ] (Optional) connect the GitHub repo to the Vercel project for auto-deploys — current
      deploy was a CLI `vercel deploy --prod`, not git-linked.

---

## Decision log

- **2026-07-14** — Content refresh for the Null Fellows application: Presterly added as lead
  experience + top project (with live traction numbers pulled from the Presterly memory notes),
  Larry → Loira AI (Founding Engineer, Feb–Jun 2026, loira.ai; the old "CTO & Co-Founder /
  Feb 2025 – Present" copy was wrong on both counts), homepage highlights now
  startup/accelerator/academic. Em dashes removed from prose copy per LANGUAGE.md; pre-existing
  em-dash title separators (layout/page titles, education line) left as shipped design.

- **2026-06-02** — BUGFIX (post-merge): the Task 1 boot-flash rule blanked the screen on a
  fresh session — `.booting .screen { visibility:hidden }` also hid the `.boot` overlay (which
  is rendered inside `.screen` via BootSequence), so the boot played invisibly and visitors saw
  only the nav on a blank screen. Fix: hide screen/nav/glyphfield as chrome while booting and
  opt `.boot` back into `visibility:visible` (it's fixed/opaque/z-9500 and covers everything);
  added `suppressHydrationWarning` to `<html>` (pre-paint script mutates its className).
  Verified with Playwright on both localhost and prod (commit bff8e06). Skills content also
  refined (dropped interests; added Railway/Docker/Playwright/Vitest etc.).
- **2026-06-02** — Deployed to Vercel via CLI under scope `fergo5002s-projects`: new project
  `fergus-portfolio`, live at https://fergus-portfolio.vercel.app. The personal scope had two
  existing projects (`sauna-os`, `barristersdirectrework`) but no project-count limit was hit,
  so `barristersdirectrework` was left untouched. Deploy is CLI-based, not git-linked.
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
