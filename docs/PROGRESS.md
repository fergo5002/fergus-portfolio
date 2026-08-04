# PROGRESS — living project state

> Update this file as you work. It is the handoff contract: the next agent reads it first.
> Keep the status line current, tick task boxes, and append to the decision log.

**Project:** FergusOS Terminal portfolio (`C:\Dev\fergus-portfolio`)
**GitHub:** https://github.com/fergo5002/fergus-portfolio (private)
**Status (2026-08-03):** **v4.1 — the motion system now works on a phone.** v4 shipped animations
that ran at 1 fps on iPhone-class WebKit, which from outside is indistinguishable from having no
animations at all. The frame budget is reclaimed, touch is a first-class input, and 390px is now
its own layout. See "Mobile motion + layout" below.

**Previously (2026-08-03):** **v4 "Phosphor" motion system shipped.** The site now behaves like a
CRT rather than depicting one — a single WebGL shader owns the tube (glyph rain, aperture
grille, scroll-driven beam smear, cursor magnetism, degauss), Lenis drives inertial scroll,
the terminal became a real mini-OS whose commands rewrite the live site, and cards/timelines
paint themselves in as the beam reaches them. Spec:
`docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md`.

Previous (2026-07-14): content refresh — Presterly (Co-Founder & CTO, Hatch105) replaces the
`[ ROLE — TBC ]` Hatch placeholder as the lead experience entry and top project; Larry renamed
to Loira AI with corrected dates (Feb–Jun 2026) and the loira.ai link.

---

## Mobile motion + layout — 2026-08-03

Branch `feat/mobile-motion`. Plan:
`docs/superpowers/plans/2026-08-03-mobile-motion-and-layout.md`.

**The finding that reframed the job.** Reported as "not a single animation works on mobile". They
all worked. `document.getAnimations()` listed every one of them running, with no console errors.
The phone could not paint them: **1 fps** on an iPhone 14 Pro (WebKit), **6 fps scrolling** on a
4x-throttled Pixel 7, against a 61 fps `about:blank` control. At 1 fps a 720 ms reveal is one
frame. Two layers each saturated the budget alone — the animated `background-position` on a fixed
full-viewport gradient, and the DPR-2 fullscreen shader.

This is the second time a "resized desktop viewport" mobile check has missed a WebKit frame-rate
collapse on one of Fergus's projects. See
`[[coding-mistakes#"Mobile 390 clean" was a resized desktop viewport]]`.

- [x] **Frame budget** — `scan-drift` composited instead of repainting; CSS scanline layer dropped
      on touch (the shader already draws them) with a static `html.no-webgl` fallback; tube at
      0.6 dpr / 30 fps on mobile (drawing buffer 780x1688 → 234x506, ~22x less fragment work per
      second); flicker, scroll-driven glass gradient, `backdrop-filter` and per-heading
      convergence all dropped on touch; `CursorTrail` no longer mounts on a coarse pointer; Lenis
      not mounted on touch
- [x] **Touch motion** — tap fires the shockwave from the point touched (`uTap`/`uTapPos`, touch
      only); press-to-tilt with tracking glare; perimeter beam runs once on release; press
      resolves an image to full colour; hero magnetism and shader ripple engage on touch and decay
      on release; every `:hover` rule gated behind `(hover: hover)`
- [x] **Mobile layout** — nav fits (was 464-539px of content in a 393px bar, so "cd projects" was
      off-screen on every route); hero name no longer breaks mid-word; terminal input 16px so iOS
      stops zooming; portrait leads the hero; tighter type and spacing; timeline spine stops
      holding a gutter
- [x] `lib/text.ts` + 6 tests for the word-grouping fix; 49 → 55 tests; build clean

**Measured after, throttled Pixel 7 (the realistic proxy):** idle 10-20 → **57-61 fps**, scrolling
6 → **27-36 fps**, all reveals firing (4/4, 3/3, 6/6), zero horizontal overflow, terminal input
16px, no console errors. Desktop unregressed. Re-verified identically against a Docker
prod-parity container.

> **Windows WebKit is a software rasteriser.** It reports 1-3 fps for this site *and* reports the
> same with every site layer forced off, so its absolute numbers are a floor, not a reading. Use
> the throttled Pixel as the proxy and verify the GPU reduction directly (canvas buffer size ×
> frame rate), which is what was done here.

> ## ✅ LIVE — deployed and verified in production 2026-08-03
>
> `https://fergus-portfolio.vercel.app` · deployment `dpl_8gj9gThbaMPhN63ZpSVsqhhWozGi` (Ready,
> no errors in build logs). Shipped with the documented CLI workaround (copy without `.git`,
> keep `.vercel/project.json`, `vercel --prod --yes`), because git-linked deploys on this repo
> are still silently Blocked — see "Why deploying was hard" below, which is unchanged.
>
> **Verified against the live URL, not localhost:** all three routes + `/icon.svg` return 200;
> the live CSS bundle contains every new marker (`webgl-ok`, `heroname__word`, `is-pressed`,
> `is-tracing`, `trace-once`, the `hover:none` block); on an emulated iPhone the canvas buffer is
> **234x506** (was 780x1688), the cursor-trail canvas is absent, Lenis is not mounted, the CSS
> scanline layer is off with `webgl-ok` set, and the nav fits (393/393). Press-and-release on a
> live project card: `is-pressed` + glare 1 + image resolving to colour, then fully cleared back
> to the resting duotone on release. Hero name occupies **one line box**. Zero console errors.
> Throttled Pixel 7 on production: **28-60 fps idle, 24-37 scrolling**, all reveals firing
> (4/4, 3/3, 6/6), zero horizontal overflow, terminal input 16px.
>
> **Honest caveat:** no physical iPhone was tested. Windows WebKit reports 1-3 fps for this site
> *and* reports the same with every layer forced off, so it is a software-rasteriser floor rather
> than a reading. The throttled Pixel is the proxy, and the GPU reduction was additionally
> verified rasteriser-independently as buffer size × frame rate (~22x less fragment work per
> second). Worth a look on Fergus's actual phone.

**Harness:** `phone-audit.mjs` (in the session scratchpad) runs the matrix. It has a hard
precondition that every referenced client chunk returns 200 — a `next start` left holding the port
serves fresh HTML against a stale manifest, the page renders as static markup with nothing
running, and the harness then reports a serene 61 fps for a dead site. That happened twice during
this work before the guard was added.

## Real imagery — 2026-08-03

All six project slots and the hero portrait now carry real images, built reproducibly by
`scripts/build-images.mjs` (see the Images section of `AGENTS.md`).

- [x] Hero portrait from `IMG_1018.HEIC` (Dolomites), cropped 4:5. sharp cannot decode HEIC, so
      ffmpeg decodes to PNG first.
- [x] Presterly "P" and Loira "L" brand marks; Firespark rebuilt as its own lockup (ember spark
      + wordmark + product line) in the design language of firespark.vercel.app
- [x] Under the Campanile: real gameplay from the Trinity Front Square scene, showing the
      Campanile and the dynamic lighting Fergus wrote
- [x] Remand and ContraBot: authored SVG plates rather than stock imagery
- [x] Sauna OS entry replaced by **Firespark**, moved to second, role Co-Founder & CTO, linked
      to firespark.vercel.app
- [x] Imagery phosphor-duotoned at rest, full colour on hover, light cast on touch; hue is
      per-theme via `--duotone-hue`

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

> ## ✅ LIVE — deployed and verified 2026-08-03
>
> `https://fergus-portfolio.vercel.app` serves v4 with the real imagery.
> Deployment `dpl_GELUnY6VoXn1xfHUamBjEg2juyty`.
>
> **Verified in production:** all three routes and `/icon.svg` return 200; all seven images
> return 200 and load in-browser at their real dimensions; the boot sequence, WebGL phosphor
> layer, Lenis, status bar (60 fps) and screensaver all run; `neofetch`, `uptime`, tab
> completion and `theme amber` → `theme green` all work against the live site and repaint the
> whole page; the projects grid is in the right order with no "Firecracker" or "Sauna OS"
> anywhere; live logs show only 200s and no errors.
>
> ### Why deploying was hard, so the next person does not lose an hour
>
> Three traps stacked on top of each other. Full detail is in `[[machine-map]]`.
>
> 1. **`.vercel/project.json` had the wrong org** (`team_MNEq2igKscCiR0E6Q2odcHCQ`); the project
>    lives in **`larry-pm`**. That made `vercel whoami` say "Not authorized" while the account
>    was perfectly logged in. Test auth with `vercel teams ls`, not `whoami`.
>    Fix: `vercel link --yes --scope larry-pm --project fergus-portfolio`.
> 2. **The repo IS git-linked, and every pushed deployment was silently Blocked**, which from
>    outside is indistinguishable from "no deploy was triggered". The dashboard gives the real
>    reason: the commit author (`fergus.oreilly@hatch105.com`) has no contributing access, and
>    the Hobby plan does not allow collaborators on private repos.
> 3. **The generated URLs are behind Vercel SSO** and 302 to a login page. Only
>    `fergus-portfolio.vercel.app` is public.
>
> **How this deploy actually shipped:** copy the repo to a temp directory **without `.git`**,
> keep `.vercel/project.json`, then `vercel --prod --yes` from there. No git metadata means no
> commit-author check.
>
> **Worth fixing properly** so `git push` just deploys: add `fergus.oreilly@hatch105.com` to the
> `fergo5002` Vercel account, or commit this repo as `oreillfe@tcd.ie` (the identity whose older
> commits deployed fine), or upgrade to Pro.

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

- **2026-08-04 (contact + links)** — Fergus asked for his personal GitHub, `fergo5002`, to be on
  the site alongside the Hatch one. Both are now listed, explicitly keyed **`github (work)`**
  (`oreillyfergus`) and **`github (personal)`** (`fergo5002`) — chosen over two bare `github` rows
  because `app/page.tsx` keys the contact rows on `label`, so duplicate labels would silently drop
  a row in React. A `contact` test now asserts the labels stay unique.
  - **`.contact__row`'s key column moved from `110px` to `18ch`.** `"github (personal)"` is 17
    characters and the keys are set in JetBrains Mono, so `ch` is exactly one character and the
    column can never be too narrow for its longest label. `max-content` is wrong here: each row is
    its own grid, so the four rows would size independently and the values would not line up.
    Measured in the parity container — all four keys resolve to 173px, values aligned at x=660.
  - **Firespark's project link now points at `https://firespark.dev`**, its own domain, not
    `firespark.vercel.app`, the platform URL it happens to be hosted on. Verified 200 before
    shipping (the apex 301s to `www.firespark.dev`). The two mentions of the old URL further up
    this file are left alone — they are historical statements about what the design was copied
    from, and rewriting them would falsify the record.
  - **New `content/links.test.ts`** guards every outbound href in `content/*.ts`: absolute,
    parseable, `https:`/`mailto:` only, plus both GitHub accounts and the Firespark domain. Nothing
    covered these before, so a typo in a public link shipped silently. Proven to fail against the
    old URL before it was kept.

- **2026-08-03 (mobile)** — Design forks settled with Fergus up front: touch becomes a real input
  ("the finger is the beam") rather than scroll-only ambient; **no gyroscope** (iOS needs a
  permission prompt behind a gesture, which is friction on a page a recruiter opens once); a
  purpose-built mobile layout rather than bug-fixes-only; and the shader kept on mobile but at
  reduced resolution rather than removed.
  - **Deviation from the brief (deliberate):** the chosen touch package included a phosphor trail
    following the finger. Implemented in the **shader** (its existing pointer glow, re-enabled on
    mobile while a finger is down) rather than as a second canvas. A fullscreen blended canvas is
    precisely the class of layer the performance work was removing, so adding one back to draw a
    trail would have undone the fix it was bundled with.
  - **Reverted mid-flight:** project images were briefly forced to 4:3 on mobile on the reasoning
    that 16:9 wasted height. That is backwards — 4:3 is the taller frame, so it added roughly 65px
    to every card and cropped images authored as 16:9. Ratios are left as authored.

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
