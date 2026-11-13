# The machine: boot, motion, phosphor and the redesign surfaces

Read this before touching the boot, any animation or reveal, the shader, gravity, eject, the screensaver, the status strip, hover previews, the pixel sprites, the writing figures, the `/mcp` console or the 404 card.

## The CRT premise (v4, "Phosphor")

As of v4 ("Phosphor") the site does not merely *depict* a CRT, it *behaves* like one. Every
effect derives from one premise: an electron beam painting phosphor behind glass. Scroll
velocity is beam velocity, the cursor is a magnet near the tube, a route change is a channel
change, idle time is a burn-in risk. Read
`docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md` before adding motion,
new effects must follow from that premise or they will look like unrelated tricks.

**v5 ("Mass") extends the premise from a tube to a machine.** A real CRT has three things v4
could not express, and each one is now a subsystem:

- **Memory.** Phosphor keeps glowing after the beam has gone, and a tube that has shown the
  same nav bar for ten minutes keeps a ghost of it. `PhosphorScreen` is now two passes with a
  ping-pong persistence buffer (RGB = short decay, alpha = burn-in). Nothing else may write
  light directly to the screen: emitters deposit into the sim buffer and let it decay.
- **Mass.** The page is made of objects. `lib/physics.ts` is a real rigid-body solver and
  `GravityStage` drops the live text into it. Collisions feed the same frame the shader and
  the synth read, so an impact lights the phosphor and clicks at the same instant.
- **Voice.** `lib/audio.ts` synthesises everything at runtime; there are no audio files and
  there must not be. Off by default, every method inert until enabled, and **silent at rest**:
  it had a continuous ambient bed (flyback whine, mains hum, phosphor hiss) and that turned out
  to be a drone people mute. Nothing loops now except beam noise, which is zero until you
  scroll. Do not reintroduce a resting tone.
- **Body.** `eject` pulls the camera off the glass. `lib/eject.ts` is the single definition of
  where the screen sits, because CSS scales the DOM into a rectangle that the shader draws a
  bezel around, and they have to agree to the pixel.

Spec: `docs/superpowers/specs/2026-08-04-mass-memory-voice-design.md`.

## Animation libraries and the one frame clock

From "Stack & conventions".

- **Animation libraries (changed in v4):** `lenis` (inertial scroll), `ogl` (the WebGL
  phosphor shader) and `motion` (springs). v5 added no dependencies: the physics solver and
  the synth are both hand-written, because a physics engine that ships 90 kB to drop some
  words on the floor has misjudged the trade, and every sound here has to be parameterised by
  live state rather than triggered as a sample. The previous "no libraries at all" rule is retired,
  but the spirit stands: **reach for CSS first.** Most effects here are CSS keyframes plus an
  IntersectionObserver, because a one-shot reveal gains nothing from a runtime. `motion` is
  used only for `Magnetic`, where a spring settle is genuinely hard to hand-roll.
- **One frame clock.** `SystemProvider` owns the single `requestAnimationFrame` loop; Lenis,
  the shader, the cursor trail and the status bar all subscribe via `onFrame`. Never start
  another rAF loop, and never `setState` from inside a frame callback: per-frame values are
  mutated on the `frame` ref and published as CSS variables (`--scroll-v`, `--scroll-p`).

## A shader constant is not a brightness

**A shader constant is not a brightness. Never tune one without measuring the pixels.** The
persistence buffer in `PhosphorScreen.tsx` is 8-bit and clamped to 1.0 on every frame, and it
integrates about twenty frames of deposit at 60fps. The ring constants used to sit roughly fourteen
times over that ceiling, so on 2026-08-20 halving the degauss from 0.85 to 0.425 changed the picture
by about two percent while every test passed, the mutation run went fully red, and the new values
were confirmed live in the served bundle. Every signal said shipped and the flash was identical. The
numbers in that file are now solved backwards from the composite peak that lands on screen and are
deliberately not round. The way to check one is `gl.readPixels` on a strip of the canvas across the
event, comparing old against new in the same browser at the same frame rate: a grep only tells you
where a constant is, never what it looks like.

## Animate only what the visitor has not seen

**Animate only what the visitor has not seen** (2026-09-06). Hydration lands well after first
paint here, 2.5 seconds on a desktop with a real GPU and 4 on a throttled Pixel, measured with a
headed browser (a hidden tab throttles timers to one a second and measures nothing). Every
mount-time effect therefore asks `lib/navigation.ts` whether this is a late hydration of a page
already on screen. The raster pre-hide keys on `html.navigated`, added by `RouteTransition` in a
layout effect on the first in-site navigation, never on the pre-paint `html.js` flag, which used
to hold every block at opacity 0 until the JavaScript arrived. On a late hydration a block on
screen or scrolled past is revealed at once with no animation, a block still below the fold is
marked `is-unseen` and paints in when reached, and the page-title and hero scrambles do not run.
A view-triggered scramble gets the same rect check. The proof is a headed-browser timeline of
the title text from navigation start: one entry, not a flip to glyphs at 2.5 seconds.

## The boot

**Two boots.** `lib/boot.ts` carries `FULL_BOOT` (about 7.3 seconds) and `PHONE_BOOT` (one head
line, three device lines, no memory test, about 3.8 seconds, inside the 3.2 to 3.9 second window
Fergus approved on 2026-09-13), and `pickBootProfile` chooses by coarse pointer or width under
768. `BOOT_FLOOR_MS` is the full profile's floor. The ownership rules below are untouched by
this: both profiles boot the same way, one is shorter.

**`booting` hides the whole site, so exactly one thing may own clearing it at any moment.** The
ownership table is in `lib/boot.ts` and it is four rows, not two. Read it before touching the boot
path. Two rules came out of getting it wrong, both of which shipped:

- **Never tune a delay to outlast the animation.** The sequence was ~430 chained `setTimeout` ticks
  until 2026-09-27 (it is now `bootTimeline`, read off the frame clock, and a tab with no frames
  is what the watchdog is for), and a hidden tab clamps each to about a second, so its wall-clock
  length was unbounded. A 4000ms
  failsafe against a 6418ms floor revealed the landing page underneath a still-typing BIOS screen
  on every first visit. The failsafe answers "did the JavaScript arrive", nothing else, and
  `BOOT_FLOOR_MS` is deliberately not an input to it.
- **Disarming a safety net means inheriting every path it covered.** `BootSequence` disarms the
  failsafe on mount and must re-arm it on unmount. Without that, clicking any nav link while the
  BIOS is typing unmounts `BootSequence` (it lives in `app/page.tsx`) and leaves the entire site
  `visibility: hidden` until a hard reload.

`lib/boot.test.ts` executes the real inline script against a stub DOM. Its `BootSequence` greps are
a coupling check only: vitest runs in a `node` environment here, so nothing can mount the component.
If you change the boot path, delete your fix and confirm the suite goes red before trusting it.

## The September 2026 redesign: site surfaces (2026-09-26)

Fergus asked for the site to be more novel while staying understated. The rules each change
brought with it:

- **The status strip's readouts are back, drawn rather than written.** Uptime, scroll as a hex
  memory address, fps, pointer, clock and phosphor, plus a drive lamp that flickers while the
  machine is busy. `StatusBar` writes each value into a `--ro` custom property on its own span
  and `globals.css` draws it with `content`, so none of it reaches the server HTML or a text
  extractor, and each write restyles one small span rather than repainting type. Values come
  from the pure `lib/readouts.ts`. Readouts give way as the strip narrows, and below 560px the
  phone bar is still the four labelled controls. `components/statusbar.test.ts` guards this.
- **Hover previews choose a side when they open** (`lib/preview-placement.ts`): below unless
  that runs under the status strip, above unless that runs under the nav, otherwise the side
  with more room. The strip is the floor, not the viewport edge.
- **Gravity skips `.vh` text.** A `Range` reports a clipped word's full layout box, so
  HeroName's hidden copy of the name used to fall as whole words on top of its own letters.
  `scripts/gravity-check.mjs` drives the real switch and runs in the phone job.
- **The contact cards are pixel sprites** (`lib/pixel.ts`, `components/pixel/`): character
  grids merged into integer rectangles, drawn at a whole number of screen pixels per sprite
  pixel, two-frame boils that rest on frame 0 under reduced motion.
- **The writing index draws each piece's argument** (`lib/writing-figures.ts`): wordless SVG
  shapes, because SVG text is document text. Tests require one figure per published article.
  The row link's stretched layer sits under the text; text must be the top thing where it is
  drawn or the phone instrument counts it as unread.
- **`/mcp` leads with the server working.** A console makes real JSON-RPC calls to the
  relative `/api/mcp` and declares itself in `_meta` clientInfo as `fergusoreilly.dev-console`,
  which the endpoint's analytics read, so its calls never count as agent traffic. It keeps its
  own copy of the protocol constants, pinned to the server's by test, rather than importing
  `lib/mcp.ts` and bundling every article into the browser. Its panes have a fixed height:
  an answer arriving must not move the page.
- **A missing page is a no-signal test card** (`app/not-found.tsx`): shapes only, the requested
  path as a failed `cd`, a real heading. `scripts/not-found-check.mjs` proves the 404 and runs
  in the phone job; `scripts/phone-check.mjs` reads any 4xx document as a broken asset, so the
  page stays out of it.
- **The boot is a timeline on the one frame clock** (2026-09-27). `bootTimeline(profile, ms)` in
  `lib/boot.ts` is a pure function of elapsed time, so a slow machine lands the same words at the
  same moments in fewer frames and a returning tab catches up; `BootSequence` writes it through
  refs and never starts a loop of its own. It mounts `/usr/tighsauna`; `presterly` must never
  come back (`lib/boot.test.ts`). The POST reads the visitor's own machine (`lib/post.ts`: cores,
  display, refresh rate from frame gaps, locale and zone), client-only, never stored or sent, and
  the overlay carries `ph-no-capture` so autocapture cannot lift those readings off a skip click.
  `scripts/boot-check.mjs` proves that with a forced core count and time zone searched for in
  every `/ingest` body (a local run: it needs a build with a PostHog key). `finish()` unsubscribes
  from the frame clock before anything else: left running, the timeline carried on behind the
  revealed page and a skip mid-trace kept drawing the mark for 600ms.
- **The beam hook: drawing with the gun, not the page** (`lib/beam.ts`). The frame carries a
  polyline (`beamPts`, `beamCount`, `beamGain`); the sim pass deposits a capsule of energy around
  it (never burn-in) and clears it. A writer extends a path the tube has not drawn yet and never
  overwrites it, and gains come from `beamGainFor` or `beamHoldGain` so the light is the same at
  30 and 165 frames a second. Measure brightness with `gl.readPixels`, never by eye. To see the
  beam from a browser check, watch `uBeamGain` uploads, not `uBeamCount`: ogl uploads a uniform
  only when it changes, and a writer that always sends full strokes leaves the count unchanged.
  The boot's mark and the screensaver both draw through it.
- **Eject is a monitor you can operate** (2026-09-27). `lib/eject.ts` is still the one geometry:
  it lays out the case, chin and hardware, the shader takes it as uniforms and `EjectHardware`
  places its real DOM controls from the same function, so they agree by construction;
  `scripts/eject-check.mjs` samples the canvas and holds the DOM screen's corners on the bezel
  within 2px. The chin carries a channel dial (a detent per route in `content/nav.ts`; you stay
  ejected), colour and contrast knobs (through `setTheme` and `setScanlines`, so they persist only
  when non-default), degauss, and power (a collapse to a line inside the glass, then the strike;
  every way out switches the tube back on). The glass never tilts: leaning shows the case's side
  and moves a light, so CSS and the shader never need to share a homography.
  `html.is-ejecting .crt__assembly` uses `overflow: clip`, not `hidden`: `hidden` makes it a
  scroll container, and a channel change's scroll-to-top then scrolled the assembly out from
  under the glass. `EjectRig` re-measures the scroll spacer whenever the page changes height. At
  phone scale the status strip's `enter` is 32.6px tall because the whole screen is scaled; the
  chin's own controls are 44px.
- **The screensaver is an oscilloscope** (`lib/lissajous.ts`). After 45 idle seconds the page
  steps aside (`html.is-saving`, like `.booting`) and the beam retraces a slowly retuning
  Lissajous figure; with no WebGL or the CRT off, the old plate bounces instead. Its idle
  listeners are capture-phase, because the arcade stops keydown bubbling, and it never starts
  while the arcade is open. `scripts/saver-check.mjs` skips the wait with Playwright's fake clock.
- **The experience log's marker, short hash and `(HEAD -> main)` are drawn by CSS**
  (`lib/commit-hash.ts` feeds a `--hash` property). The old `● commit` was a text node in front
  of every entry.
