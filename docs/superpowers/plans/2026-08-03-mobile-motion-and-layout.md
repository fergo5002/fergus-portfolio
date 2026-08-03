# Mobile motion + layout — implementation plan

**Date:** 2026-08-03
**Branch:** `feat/mobile-motion`
**Spec premise:** unchanged — `docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md`.
The beam fiction still governs everything. On a phone, **the finger is the beam.**

## The reported problem, and what it actually was

Reported: "not a single animation works on mobile."

Measured (Playwright, real engines, in-page rAF probe, `about:blank` control at 61–63 fps):

| Device | idle | scrolling |
|---|---|---|
| iPhone 14 Pro / WebKit | **1 fps** | **1 fps** |
| Pixel 7 / Chromium, 4× CPU throttle | 10–20 fps | **6 fps** |
| Desktop Chromium (headless, SwiftShader) | 5–10 fps | 7–24 fps |

`document.getAnimations()` listed `raster-in`, `raster-beam`, `scan-drift` and `flicker` running
on every route, with zero console errors. **The animations were never missing. The phone could
not paint them.** At 1 fps a 720 ms reveal is one frame, which is indistinguishable from nothing
happening.

Per-layer attribution (fps on the throttled Pixel with that layer forced off):

| layer off | fps | verdict |
|---|---|---|
| `.crt__scanlines` | **60** | saturating |
| `.phosphor` (WebGL) | **58** | saturating |
| `.cursortrail` | 19 | minor |
| `.crt__glass` | 9 | minor alone |
| `.crt__vignette` | 10 | minor alone |
| `backdrop-filter` (nav + status) | 9 | minor alone |
| all chrome off | 61 | — |

Two layers each independently saturate the budget: the animated `background-position` on a fixed
full-viewport repeating gradient (a whole-viewport repaint every frame) and the fullscreen
fragment shader at DPR 2 evaluating `rain()` three times per pixel.

This is the same failure as
`[[coding-mistakes#"Mobile 390 clean" was a resized desktop viewport]]` — a resized desktop
viewport matches none of the signals that break phones.

**Therefore performance is task 1.** Adding touch handlers to a 1 fps page would change nothing.

## Tasks

### 1. Reclaim the frame budget

- `.crt__scanlines`: the shader already draws scanlines (`uScanlines`). Stop drawing them twice.
  Drop the CSS layer wherever the shader is live; keep a **static, unanimated** fallback layer
  only when WebGL failed (new `html.no-webgl` flag set by `PhosphorScreen`).
- `scan-drift`: never animate `background-position` on a fixed fullscreen element again. Where
  the fallback layer is used, it does not drift at all.
- `.crt__flicker`: infinite full-viewport animation. Off on coarse pointers.
- `.crt__glass`: its gradient interpolates `--scroll-v`, so it repaints fullscreen every frame of
  every scroll. Static on coarse pointers.
- `backdrop-filter` on `.nav` / `.statusbar`: solid backgrounds on coarse pointers.
- `CursorTrail`: return `null` on coarse pointers instead of mounting an undrawn 300×150 canvas
  stretched to 100vw/100dvh under `mix-blend-mode: screen`.
- `PhosphorScreen`: render at reduced resolution on mobile (`dpr` 0.6 rather than min(devicePixelRatio, 2))
  and cap to 30 fps there. Scanlines hide the resample; the fragment count drops ~11×.

**Gate:** ≥ 30 fps idle and ≥ 24 fps scrolling on the throttled Pixel, on all three routes,
with the desktop control unregressed.

### 2. The finger is the beam

Every pointer-gated effect gains a touch equivalent. `SystemProvider` grows a `touch` concept:
`pointerdown` engages, `pointerup`/`pointercancel` decays, so effects live only while a finger
is actually down and cost nothing at rest.

- **Tap ripple.** New `uTap` + `uTapPos` uniforms: a tap fires the magnetic shockwave *from the
  point touched* rather than from screen centre. Reuses the existing degauss band maths.
- **Press to tilt.** `TiltCard` gets touch handlers: press and the card tilts toward the thumb
  with the specular glare tracking it; release and it springs back and runs the perimeter trace
  once. Only the touched card animates.
- **Press resolves the image.** The duotone→colour reveal, previously hover-only, is earned on
  mobile by pressing the card.
- **Hero magnetism** engages on touch and decays on release.
- **Nav links** get a touch press state (the magnetic spring is meaningless without a cursor).
- **No second canvas.** The phosphor trail on touch is drawn by the shader's existing pointer
  glow, re-enabled on mobile only while a finger is down. Adding a fullscreen blended canvas is
  exactly what task 1 is removing.

### 3. Purpose-built mobile layout

390 px is its own design, not the desktop squeezed.

- **Nav** drops the `user@host:path$` prompt below 640 px. Measured baseline: 464–539 px of
  content in a 393 px bar, so "cd projects" was simply off-screen on every route.
- **Hero** recomposed for portrait: name, then portrait, at a size that suits the column.
- **Hero name** stops breaking mid-word. Per-character `inline-block` spans let the line break
  between any two letters, which is why it rendered as `O'Re / illy`. Split per word, then per
  character inside each word.
- **Type scale** for small screens: smaller body, tighter leading, fewer forced wraps.
- **Timeline spine** moves inline instead of holding a left gutter on a 390 px column.
- **Terminal input** to 16 px so iOS stops zooming the page when it is focused (it was 14.4 px).
- **Denser cards**, tighter window padding, and a status bar that does not eat the viewport.

## Verification

1. `npm test` green, `npm run build` clean.
2. Re-run `phone-audit.mjs` against the production build: fps gate above, zero horizontal
   overflow on all three routes, all reveals firing, terminal input ≥ 16 px.
3. Docker prod-parity container (`Dockerfile.parity`), audited the same way.
4. Deploy, then verify the live URL on the same device matrix.
