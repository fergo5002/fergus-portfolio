# FergusOS v4 — "Phosphor" motion system

**Date:** 2026-08-03
**Status:** approved (Fergus, via design grilling)
**Supersedes:** the "no animation libraries" rule in `AGENTS.md`

## The idea in one line

The site stops *depicting* a CRT and starts *behaving* like one.

Every effect on this site now derives from a single physical premise: there is an electron
beam painting phosphor behind glass. Scroll velocity is beam velocity. A cursor is a magnet
near the tube. A page change is a channel change. Idle time is a screen-burn risk, so the
screensaver kicks in. Nothing is decoration for its own sake — each animation is the
consequence of that one fiction, which is what stops a heavily-animated site from reading as
a pile of unrelated tricks.

## Decisions taken

| Fork | Decision | Why |
|---|---|---|
| Libraries | `motion` + `lenis` + `ogl` | Fergus chose the full arsenal. OGL over three.js: ~5 KB, shader-first, no scene-graph tax for a fullscreen quad. |
| Scroll | Lenis inertial smooth-scroll | Chosen deliberately. Damped scroll gives the shader a continuous velocity signal, which is what makes the beam smear read as physical rather than stepped. |
| Set-pieces | All four | Hero, terminal-as-OS, living cards, ambient system life. |
| Imagery | Generated | CRT-native abstract plates per project; the portrait slot becomes a deliberate test card until a real photo lands. |

## Architecture

Four layers, each with one job, composed at the root so any page gets them for free.

```
┌─ PhosphorScreen (WebGL, z:0) ────── the tube: mask, rain, beam, bloom, ripple
├─ .crt__screen (DOM, z:1) ────────── all real content, fully accessible
├─ CRT glass overlays (z:9000) ────── scanlines, vignette, specular sheen
└─ System chrome (z:9100+) ────────── nav, status bar, transitions, screensaver
```

### Layer 0 — `PhosphorScreen` (OGL fullscreen quad)

One GLSL fragment shader owns every ambient effect that used to be separate DOM/canvas work.
Replaces the `GlyphField` canvas: the digital rain is now hashed on the GPU, so it can be far
denser at a fraction of the cost.

Uniforms it reacts to:

- `uScrollVel` — beam smear + bloom. Scroll fast and the phosphor streaks.
- `uPointer` — magnetic deflection ripple centred on the cursor.
- `uDegauss` — one-shot expanding shockwave (boot, `degauss` command, route change).
- `uRain` — digital-rain density, driven to 1.0 by the `matrix` command.
- `uTheme` — palette (green / amber / ice), set by the `theme` command.
- `uCrt` — master intensity, set by `crt on|off` and `scanlines <n>`.

### Layer 1 — Motion core

`MotionProvider` mounts `ReactLenis root` with `autoRaf: false` and drives it from Motion's
own `frame` loop, so scroll, springs, and shader all tick on one clock. A single
`useSystemBus()` context publishes scroll progress, velocity, and the uniform setters. Values
travel as motion values and CSS custom properties, never as React state per frame.

Reveal primitives, all reduced-motion guarded:

- `RasterReveal` — a block paints in top-to-bottom behind a travelling bright beam line
  (animated `clip-path` + a beam element). This is the house reveal; it replaces fade-up.
- `BeamHeading` — heading characters resolve out of scramble as the beam passes them.
- `PowerOn` — the existing CRT power-on curve, applied per element on scroll-in.

### Layer 2 — Set-pieces

- **Hero.** Per-character magnetic repulsion from the cursor with an RGB channel split that
  scales with displacement. The shader blooms behind it.
- **Boot.** POST with real progress bars, a memory count-up, then a degauss shockwave into the
  existing power-on.
- **Terminal → mini-OS.** Tab autocomplete with inline ghost text, `↑`/`↓` history, `Ctrl+L`.
  Commands mutate the live system: `theme`, `crt`, `scanlines`, `matrix`, `degauss`,
  `neofetch`, `uptime`, `top`, `open`, `sudo rm -rf /`. `runCommand` stays pure; commands that
  touch the system return an `effect` descriptor the caller applies, so it remains unit-testable.
- **Living cards.** Decrypt on scroll-in, cursor tilt with a specular glare, a beam that traces
  the card perimeter on hover, and screenshots that scan in line by line.
- **Ambient life.** A fixed status bar (uptime, FPS, scroll as a memory address, current section
  as `pwd`, cursor coords), a phosphor cursor afterglow, route changes as channel-change static,
  and an idle screensaver after 45 s.

## Accessibility contract

Non-negotiable, and unchanged from the original project rule:

- Every animation is gated on `prefers-reduced-motion`. Under reduce: Lenis is not mounted
  (native scroll), the shader renders one static frame, reveals become instant, the cursor
  trail and screensaver never mount.
- All content renders server-side without JS. Motion is additive only.
- Text contrast stays ≥ 4.5:1; the shader sits at low opacity behind content and never over it.
- The terminal keeps full keyboard operation; new shortcuts do not shadow browser defaults.
- Focus stays visible, and route transitions move focus to main.

## Performance budget

- Shader capped at 60 fps, paused on `document.hidden`, DPR clamped to 2, and dropped to a
  cheaper branch under 768 px.
- Only `transform`/`opacity`/`clip-path` are animated. No layout properties.
- Per-frame values are motion values or CSS vars — no React re-render per frame.
- Target: `next build` clean, no CLS regression, interactive within the existing budget.

## Risks

| Risk | Mitigation |
|---|---|
| Smooth-scroll latency annoys skim-readers | Short duration + high lerp; `crt off` and reduced-motion both restore native feel. |
| Shader cost on low-end mobile | Reduced instruction path under 768 px, DPR clamp, opacity floor. |
| Effects pile up and read as noise | One physical premise governs all of them; ambient layers stay under 0.15 opacity. |
| WebGL unavailable | `PhosphorScreen` returns null on context failure; the CSS CRT layers alone still look complete. |
