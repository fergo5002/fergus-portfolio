# Retro Animations & Boot-Flash Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans to implement
> this task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `AGENTS.md` and
> `docs/PROGRESS.md` first, then work top-to-bottom. Tick boxes in `docs/PROGRESS.md` as you
> go and append to its decision log.

**Goal:** Fix the boot-sequence content flash, add a CRT power-on transition from boot →
site, add an ambient retro glyph-rain background on every page, and make one content tweak
(academic highlight → "1.1 / 4.0 GPA"). Keep everything accessible (reduced-motion) and fast.

**Architecture:** Builds on the existing Next.js 15 App Router site (see
`docs/superpowers/specs/2026-06-02-fergusos-terminal-portfolio-design.md`). New animation is
CSS-first; the glyph field and text scramble are small client components. No new runtime
dependencies — all hand-rolled canvas/CSS/JS so the next maintainer owns it fully.

**Tech Stack:** Next.js 15, React 19, TypeScript, Canvas 2D, CSS keyframes. No libraries added.

---

## Research & Animation Decisions (why these, and how)

All chosen to suit the CRT/phosphor theme, stay subtle behind text, and degrade gracefully.

1. **Ambient background — sparse digital-rain glyph field (Canvas 2D).**
   Authentic Matrix-rain is a *fixed grid of stationary glyphs*; the "drops" are travelling
   waves of brightness down each column, with glyphs occasionally mutating. We render a
   **sparse, very-low-opacity** version (≈10-14% opacity, fewer active columns) so it reads
   as ambient texture, never competing with content. Glyph pool = katakana + ASCII + box
   symbols for a retro-computer feel. Performance: throttle to ~24fps, devicePixelRatio
   aware, pause on `document.hidden`, single full-viewport `<canvas>` mounted once in the
   shell (covers all pages). Refs: [Rezmason/matrix](https://github.com/Rezmason/matrix),
   [digital-rain-analysis](https://github.com/carlnewton/digital-rain-analysis).

2. **Boot → site transition — CRT power-on.**
   The iconic CRT TV *turn-off* collapses the picture to a bright horizontal line then a dot.
   We play it **in reverse** as a power-on: content expands from a thin bright line
   (`scaleY` near-0 → 1) with a brightness bloom that settles to normal (~600ms). Ref:
   [lbebber CSS CRT effect](https://codepen.io/lbebber/pen/XJRdrV/).

3. **Hero reveal — text scramble/decode.**
   After power-on, the hero name resolves from random glyphs one character at a time — the
   "terminal decrypting" look. Cheap, self-contained, runs on every landing mount. Refs:
   [soulwire Text Scramble](https://codepen.io/soulwire/pen/mEMPrK),
   [Cruip writeup](https://cruip.com/making-a-text-scramble-animation-with-javascript/).

4. **Boot-flash fix — pre-paint blocking script (theme-flash pattern).**
   Root cause: the page renders `{children}` during SSR/first paint, then a `useEffect`
   mounts the boot overlay *after* first paint — so the site flashes for a frame, then the
   boot plays over it. Fix: a tiny **render-blocking inline `<script>` in `<head>`** that,
   before paint, checks `sessionStorage` + reduced-motion and adds `class="booting"` to
   `<html>`; CSS hides content while `.booting` is set. No content is ever painted before
   the boot overlay. (Standard no-flash technique used for dark-mode.)

**Reduced motion:** every effect above checks `prefers-reduced-motion: reduce` and falls back
to a static/instant render (no glyph animation, no power-on, no scramble, no boot).

---

## File Structure (changes)

```
app/layout.tsx          MODIFY  add pre-paint boot script in <head>; mount <GlyphField/>
app/globals.css         MODIFY  .booting hide rules, .power-on keyframes, .glyphfield styles
app/page.tsx            MODIFY  hero name -> <Scramble/>; academic highlight text
components/BootSequence.tsx  MODIFY  read .booting flag; on finish remove flag + power-on
components/GlyphField.tsx    CREATE  canvas digital-rain background (client)
components/Scramble.tsx       CREATE  text decode/scramble effect (client)
lib/scramble.ts               CREATE  pure scramble step helper (unit-tested)
lib/scramble.test.ts          CREATE  tests for the helper
```

---

### Task 1: Fix the boot-flash (pre-paint blocking script)

**Files:** Modify `app/layout.tsx`, `app/globals.css`, `components/BootSequence.tsx`.

- [ ] **Step 1 — add the pre-paint script.** In `app/layout.tsx`, render a blocking inline
  script inside a `<head>` element of the `<html>` (above `<body>`):

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <head>
        <script
          // Runs before first paint: if this session hasn't booted and the user
          // allows motion, mark <html> as .booting so CSS hides content until the
          // boot overlay takes over. Prevents the content-flash-then-boot bug.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var b=sessionStorage.getItem('fergusos_booted');" +
              "var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
              "if(!b&&!r){document.documentElement.classList.add('booting');}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <CrtShell>
          <Nav />
          <main className="screen">{children}</main>
        </CrtShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 2 — hide content while booting.** In `app/globals.css`, add:

```css
/* While the pre-paint script has flagged a boot, keep content hidden so it never
   flashes before the boot overlay appears. Removed by BootSequence on finish. */
.booting .screen,
.booting .glyphfield {
  visibility: hidden;
}
```

- [ ] **Step 3 — derive boot state from the flag (no false→true flip that flashes).**
  In `components/BootSequence.tsx`, replace the current effect so it reads the pre-set class
  instead of recomputing, and clears the class on finish:

```tsx
useEffect(() => {
  // The pre-paint script already decided whether to boot.
  if (document.documentElement.classList.contains("booting")) setBooting(true);
}, []);

const finish = () => {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore (private mode) */
  }
  document.documentElement.classList.remove("booting"); // reveal content
  setBooting(false);
};
```

- [ ] **Step 4 — verify.** `npm run dev`, open `http://localhost:3000` in a fresh tab:
  content must NOT appear before the boot; the screen is black → boot types → reveal. Open a
  second tab in the same session: no boot, content shows immediately (no flash). Toggle OS
  reduced-motion: no boot, instant content.
- [ ] **Step 5 — commit.** `git add -A && git commit -m "fix: prevent content flash before boot sequence"`

---

### Task 2: CRT power-on transition (boot → site)

**Files:** Modify `app/globals.css`, `components/BootSequence.tsx`.

- [ ] **Step 1 — keyframes.** Add to `app/globals.css` (inside the existing
  `@media (prefers-reduced-motion: no-preference)` block so it's auto-disabled otherwise):

```css
@media (prefers-reduced-motion: no-preference) {
  .power-on {
    animation: power-on 620ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    transform-origin: center;
  }
  @keyframes power-on {
    0%   { transform: scaleY(0.004); filter: brightness(3.2); opacity: 0; }
    9%   { transform: scaleY(0.004); filter: brightness(3.2); opacity: 1; }
    45%  { transform: scaleY(0.04);  filter: brightness(2);   opacity: 1; }
    100% { transform: scaleY(1);     filter: brightness(1);   opacity: 1; }
  }
}
```

- [ ] **Step 2 — trigger on finish.** In `BootSequence.finish()`, after removing `.booting`,
  add the `power-on` class to the main screen and the nav, then strip it after the animation:

```tsx
const el = document.querySelector(".screen");
const nav = document.querySelector(".nav");
el?.classList.add("power-on");
nav?.classList.add("power-on");
window.setTimeout(() => {
  el?.classList.remove("power-on");
  nav?.classList.remove("power-on");
}, 680);
```

- [ ] **Step 3 — verify.** Fresh tab: after the boot finishes, the site should "switch on"
  (expand from a bright line, brightness settling). Reduced-motion: instant, no animation.
- [ ] **Step 4 — commit.** `git commit -am "feat: CRT power-on transition from boot to site"`

---

### Task 3: Hero text scramble/decode

**Files:** Create `lib/scramble.ts`, `lib/scramble.test.ts`, `components/Scramble.tsx`;
modify `app/page.tsx`, `app/globals.css`.

- [ ] **Step 1 — write the failing test** `lib/scramble.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scrambleFrame } from "@/lib/scramble";

describe("scrambleFrame", () => {
  it("reveals the first N target chars and randomises the rest", () => {
    const out = scrambleFrame("HELLO", 2, "#");
    expect(out.startsWith("HE")).toBe(true);
    expect(out).toHaveLength(5);
  });
  it("returns the full target when revealed >= length", () => {
    expect(scrambleFrame("HELLO", 5, "#")).toBe("HELLO");
    expect(scrambleFrame("HELLO", 99, "#")).toBe("HELLO");
  });
  it("keeps spaces in place", () => {
    const out = scrambleFrame("A B", 0, "#");
    expect(out[1]).toBe(" ");
  });
});
```

- [ ] **Step 2 — run** `npm test` → FAIL (module missing).

- [ ] **Step 3 — implement** `lib/scramble.ts` (pure; deterministic char source passed in so
  it's testable — caller supplies a random glyph, default "#"):

```ts
/**
 * Returns one frame of a scramble/decode animation: the first `revealed`
 * characters of `target`, with the remainder replaced by `rand` (a random glyph
 * chosen by the caller). Spaces are preserved so word shapes stay intact.
 */
export function scrambleFrame(target: string, revealed: number, rand: string): string {
  if (revealed >= target.length) return target;
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (i < revealed || ch === " ") out += ch;
    else out += rand;
  }
  return out;
}

export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*<>/\\|=+_アカサタナ";

export function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}
```

- [ ] **Step 4 — run** `npm test` → PASS.

- [ ] **Step 5 — build the component** `components/Scramble.tsx` (client). Reveals ~2 chars
  per tick, re-randomises unrevealed chars each frame; reduced-motion renders final text:

```tsx
"use client";

import { useEffect, useState } from "react";
import { scrambleFrame, randomGlyph } from "@/lib/scramble";

export default function Scramble({
  text,
  className,
  speed = 28,
  charsPerTick = 1,
}: {
  text: string;
  className?: string;
  speed?: number;
  charsPerTick?: number;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    let revealed = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setDisplay(scrambleFrame(text, Math.floor(revealed), randomGlyph()));
      revealed += charsPerTick;
      if (revealed < text.length) timer = setTimeout(tick, speed);
      else setDisplay(text);
    };
    setDisplay(scrambleFrame(text, 0, randomGlyph()));
    timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [text, speed, charsPerTick]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
```

  > Note: re-randomising only on each reveal tick keeps every unrevealed char as the same
  > glyph between ticks — for a livelier shimmer, render `randomGlyph()` per char; the helper
  > test still passes because it takes a single `rand`. Keep it simple per above unless asked.

- [ ] **Step 6 — use it** in `app/page.tsx`: replace the hero `<h1>` text node with the
  component (preserve the heading + accessible name):

```tsx
<h1 className="hero__name">
  <Scramble text={profile.name} />
</h1>
```

  Add `import Scramble from "@/components/Scramble";` at the top.

- [ ] **Step 7 — verify** the name decodes on load; screen readers still read the full name
  (`aria-label`); reduced-motion shows it static. `npm run build` clean.
- [ ] **Step 8 — commit.** `git commit -am "feat: scramble/decode reveal on hero name"`

---

### Task 4: Ambient glyph-rain background (all pages)

**Files:** Create `components/GlyphField.tsx`; modify `components/CrtShell.tsx`,
`app/globals.css`.

- [ ] **Step 1 — build** `components/GlyphField.tsx` (client). Sparse, throttled, DPR-aware,
  pauses when hidden, static single frame under reduced-motion:

```tsx
"use client";

import { useEffect, useRef } from "react";

const GLYPHS = "アカサタナハマヤラ0123456789#%&*<>/=+ABCDEF".split("");

/**
 * Ambient digital-rain behind all content. Column-based: each column holds a
 * "drop" head that lights stationary glyphs as it descends. Deliberately sparse
 * and low-opacity (styled in globals.css). Throttled to ~24fps; paused when the
 * tab is hidden; renders a single static frame under prefers-reduced-motion.
 */
export default function GlyphField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const FONT = 16;
    let cols = 0;
    let drops: number[] = [];
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.floor(window.innerWidth / FONT);
      // start drops at random heights; many columns inactive (-1) for sparseness
      drops = Array.from({ length: cols }, () =>
        Math.random() < 0.45 ? Math.floor(Math.random() * (window.innerHeight / FONT)) : -1,
      );
      ctx.font = `${FONT}px var(--font-mono), monospace`;
    };

    const drawFrame = () => {
      ctx.fillStyle = "rgba(10,14,10,0.18)"; // fade trails
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = 0; i < cols; i++) {
        if (drops[i] < 0) {
          if (Math.random() < 0.002) drops[i] = 0; // occasionally spawn a column
          continue;
        }
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT;
        const y = drops[i] * FONT;
        ctx.fillStyle = "rgba(110,255,163,0.85)"; // bright head
        ctx.fillText(ch, x, y);
        if (y > window.innerHeight && Math.random() > 0.975) drops[i] = -1;
        else drops[i] += 1;
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      // one static, very sparse frame then stop
      for (let i = 0; i < cols; i += 3) {
        if (Math.random() < 0.3) {
          ctx.fillStyle = "rgba(110,255,163,0.5)";
          ctx.fillText(
            GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            i * FONT,
            Math.random() * window.innerHeight,
          );
        }
      }
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 24;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - last < FRAME_MS) return;
      last = t;
      drawFrame();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="glyphfield" aria-hidden="true" />;
}
```

- [ ] **Step 2 — mount once in the shell.** In `components/CrtShell.tsx`, render
  `<GlyphField />` as the first child (behind `.crt__screen`):

```tsx
import GlyphField from "./GlyphField";
// ...
return (
  <div className="crt">
    <GlyphField />
    <div className="crt__screen">{children}</div>
    <div className="crt__scanlines" aria-hidden="true" />
    <div className="crt__vignette" aria-hidden="true" />
    <div className="crt__flicker" aria-hidden="true" />
  </div>
);
```

- [ ] **Step 3 — style it** in `app/globals.css` (behind content, ambient, non-interactive):

```css
.glyphfield {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  z-index: 0;
  opacity: 0.12;
  pointer-events: none;
}
@media (max-width: 768px) {
  .glyphfield { opacity: 0.08; } /* even subtler on mobile */
}
```

  Confirm `.crt__screen` stays at `z-index: 1` (it already is) so content sits above the
  canvas. The `.booting .glyphfield { visibility: hidden }` rule (Task 1) already hides it
  during boot.

- [ ] **Step 4 — verify** on all three routes: faint green rain drifts behind content; text
  remains fully legible (contrast unchanged — canvas is behind + low opacity); switching tabs
  pauses it (check CPU); reduced-motion shows a static sprinkle. `npm run build` clean.
- [ ] **Step 5 — commit.** `git commit -am "feat: ambient glyph-rain background on all pages"`

---

### Task 5: Content tweak — academic highlight

**Files:** Modify `app/page.tsx`.

- [ ] **Step 1 — edit the highlight.** In the `highlights` array in `app/page.tsx`, change
  the academic entry from `{ k: "academic", v: "1.1 · predicted Scholar" }` to:

```tsx
{ k: "academic", v: "1.1 / 4.0 GPA" },
```

- [ ] **Step 2 — (decision) bio line.** `content/profile.ts` bio paragraph 2 still says
  "...sitting the Foundation Scholarship examinations." The user only asked to drop "predicted
  Scholar" from the academic highlight, which Step 1 does. Leave the bio as-is unless the user
  says otherwise; note this in `docs/PROGRESS.md`.
- [ ] **Step 3 — verify** the landing highlights strip now reads `1.1 / 4.0 GPA`.
- [ ] **Step 4 — commit.** `git commit -am "content: academic highlight -> 1.1 / 4.0 GPA"`

---

### Task 6: Verification & handoff update

**Files:** Modify `docs/PROGRESS.md`.

- [ ] Run `npm test` (all green) and `npm run build` (clean).
- [ ] Manual pass: fresh-tab boot (no flash) → power-on → hero scramble; glyph bg on `/`,
  `/experience`, `/projects`; reduced-motion off path (static everything); 375px mobile (no
  horizontal scroll, effects toned down); tab-switch pauses the canvas.
- [ ] Tick every task box in `docs/PROGRESS.md`, set status to "animations shipped", and add
  a dated line to its decision log.
- [ ] `git commit -am "docs: mark retro-animation tasks complete"` and push.

---

## Self-Review

**Spec coverage:** boot flash → Task 1; boot→site transition → Task 2; hero reveal → Task 3;
ambient background on all pages → Task 4; remove "predicted Scholar" → Task 5; verification +
handoff → Task 6. All requests mapped. ✅

**Placeholders:** none — every code step is concrete. The only deferred decision (bio Schol
line) is explicitly flagged, not a silent gap. ✅

**Type/name consistency:** `scrambleFrame(target, revealed, rand)` defined in Task 3 used by
its test and `Scramble.tsx`. `.booting` class set by Task 1 script, hidden by Task 1 CSS,
cleared in Task 1 `finish()`; `.power-on` added in Task 2 `finish()` and keyframed in Task 2
CSS. `.glyphfield` styled in Task 4 + hidden-while-booting in Task 1. `SESSION_KEY` already
exists in `BootSequence.tsx`. No dangling references. ✅

**Performance & a11y:** canvas throttled/paused/ DPR-capped; all motion gated behind
`prefers-reduced-motion: no-preference`; scramble exposes `aria-label`; background is
`aria-hidden` and behind content with unchanged text contrast. ✅
