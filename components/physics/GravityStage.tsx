"use client";

import { useEffect, useRef } from "react";
import { World, createBody, type Body } from "@/lib/physics";
import { pushImpact } from "@/lib/system";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * Drops gravity on the page.
 *
 * The trick that makes this land is that nothing here is a picture of the site.
 * Every falling word is a real DOM node carrying real text in the real font, so
 * when the pile settles you can still read your way around it, and the letters
 * hold their kerning because the browser is still the one setting them.
 *
 * The live page is never mutated. Word boxes are measured with `Range`
 * rectangles, which needs no wrapper spans and cannot disturb layout, and the
 * clones are built into a separate fixed overlay. The original content is left
 * exactly where it was, faded out and made `inert`, so returning is a matter of
 * deleting the overlay — there is no reassembly step that could get it wrong.
 *
 * Note the effect below deliberately does **not** depend on `gravityOn`. Tearing
 * the scene down the instant gravity is switched off would mean the return
 * animation could never run: React would unmount the whole thing on the same
 * signal that is supposed to start it. So the effect owns the scene for the life
 * of the component and watches the flag through a ref.
 */

/** Ceiling above the viewport, so a hard throw comes back rather than leaving. */
const CEILING = -520;
const WALL = 60;

/** Bodies to build at most. Beyond this the solver stops being free on a laptop. */
const MAX_BODIES_DESKTOP = 320;
const MAX_BODIES_MOBILE = 120;

type Piece = {
  body: Body;
  el: HTMLElement;
  /** Layout position, for springing home. */
  homeX: number;
  homeY: number;
  /** performance.now() before which the piece hangs in place. */
  releaseAt: number;
  released: boolean;
};

/** Style properties a clone needs to be visually identical to its source. */
const COPIED_STYLES = [
  "font",
  "color",
  "letterSpacing",
  "textTransform",
  "textShadow",
  "fontFeatureSettings",
] as const;

type Candidate = { el: HTMLElement; rect: DOMRect; score: number };

/**
 * Take every visible word and image in the viewport as a positioned clone.
 *
 * All the reads happen before any of the writes, which keeps this to a single
 * layout pass: `getBoundingClientRect` is only expensive when it has to flush
 * pending mutations, and this function makes none to the live document.
 */
function measure(root: HTMLElement, limit: number): Candidate[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: Candidate[] = [];
  const styleCache = new Map<Element, CSSStyleDeclaration>();

  const styleFor = (el: Element) => {
    let s = styleCache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styleCache.set(el, s);
    }
    return s;
  };

  const consider = (el: HTMLElement, rect: DOMRect) => {
    if (rect.width < 2 || rect.height < 2) return;
    if (rect.width > vw * 1.2 || rect.height > vh * 0.9) return;
    // Off-screen pieces would fall from nowhere into a viewport they were never
    // visible in, so they are simply not part of the scene.
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    out.push({
      el,
      rect,
      // Nearest the middle of the screen wins the budget: that is where anyone
      // who just triggered this is looking.
      score: Math.hypot((cx - vw / 2) / vw, (cy - vh / 2) / vh),
    });
  };

  // ── images and other atomic blocks ───────────────────────────────────────
  // Cloned, never moved. Appending the live node would tear the picture out of
  // the page that is supposed to be sitting untouched underneath.
  root.querySelectorAll<HTMLElement>("img, canvas, svg").forEach((el) => {
    const s = styleFor(el);
    if (s.visibility === "hidden" || s.display === "none") return;
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    consider(clone, rect);
  });

  // ── words ────────────────────────────────────────────────────────────────
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const text = textNode.nodeValue ?? "";
    const parent = textNode.parentElement;
    if (!parent || !text.trim()) continue;
    // Screen-reader-only text has no visible box worth dropping, and the stage
    // must never be measured into its own next run.
    if (parent.closest(".term__srhint, .skiplink, .gravity, .gravity-hud")) continue;
    const cs = styleFor(parent);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;

    const words = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = words.exec(text)) !== null) {
      range.setStart(textNode, m.index);
      range.setEnd(textNode, m.index + m[0].length);
      const rect = range.getBoundingClientRect();
      if (rect.width < 2) continue;

      const el = document.createElement("span");
      el.textContent = m[0];
      for (const prop of COPIED_STYLES) {
        // `font` is a shorthand and has to be assigned as one, to bring family,
        // size, weight and line-height across together.
        const value = cs.getPropertyValue(
          prop === "fontFeatureSettings" ? "font-feature-settings" : hyphenate(prop),
        );
        if (value) el.style.setProperty(hyphenate(prop), value);
      }
      consider(el, rect);
    }
  }

  out.sort((a, b) => a.score - b.score);
  out.length = Math.min(out.length, limit);
  return out;
}

function hyphenate(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Fold an angle into (-pi, pi], so springing back to zero takes the short way. */
function normaliseAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let x = a % twoPi;
  if (x > Math.PI) x -= twoPi;
  if (x < -Math.PI) x += twoPi;
  return x;
}

export default function GravityStage() {
  const { frame, onFrame, reducedMotion, gravityOn, setGravity, setScrollLocked, audio, degauss } =
    useSystem();
  const hostRef = useRef<HTMLDivElement>(null);

  // Read inside the frame loop so the effect never has to re-run for it.
  const wantedRef = useRef(gravityOn);
  wantedRef.current = gravityOn && !reducedMotion;

  // Callbacks the frame loop needs, kept current without re-subscribing.
  const apiRef = useRef({ setGravity, setScrollLocked, audio, degauss, frame });
  apiRef.current = { setGravity, setScrollLocked, audio, degauss, frame };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    type Scene = {
      world: World;
      pieces: Piece[];
      content: HTMLElement;
      vw: number;
      vh: number;
      returning: boolean;
    };
    let scene: Scene | null = null;

    let grabbed: Piece | null = null;
    let anchorX = 0;
    let anchorY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pushing = false;

    // ── build ────────────────────────────────────────────────────────────────
    const build = (): Scene | null => {
      const content = document.querySelector<HTMLElement>(".crt__screen");
      if (!content) return null;

      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const candidates = measure(content, coarse ? MAX_BODIES_MOBILE : MAX_BODIES_DESKTOP);
      if (candidates.length === 0) return null;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const world = new World();
      const pieces: Piece[] = [];
      const t0 = performance.now();
      const fragment = document.createDocumentFragment();

      for (const { el, rect } of candidates) {
        el.classList.add("gravity__piece");
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        fragment.appendChild(el);

        const body = createBody({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          hw: rect.width / 2,
          hh: rect.height / 2,
          restitution: 0.16,
          friction: 0.5,
        });
        pieces.push({
          body,
          el,
          homeX: body.x,
          homeY: body.y,
          // Released top-first, so the page comes apart as a cascade rather than
          // dropping in one slab. Short enough to still read as a single event.
          releaseAt: t0 + (rect.top / vh) * 300,
          released: false,
        });
      }
      host.appendChild(fragment);

      // Walls. The floor sits exactly on the bottom of the viewport, so the pile
      // lands where the eye already expects the ground to be.
      world.add(
        createBody({ x: vw / 2, y: vh + WALL, hw: vw * 2, hh: WALL, mass: 0, friction: 0.7 }),
      );
      world.add(createBody({ x: -WALL, y: vh / 2, hw: WALL, hh: vh * 4, mass: 0 }));
      world.add(createBody({ x: vw + WALL, y: vh / 2, hw: WALL, hh: vh * 4, mass: 0 }));
      world.add(createBody({ x: vw / 2, y: CEILING - WALL, hw: vw * 2, hh: WALL, mass: 0 }));

      document.documentElement.classList.add("is-gravity");
      content.setAttribute("inert", "");
      apiRef.current.setScrollLocked(true);
      apiRef.current.degauss();
      apiRef.current.audio.thud();
      pointerX = vw / 2;
      pointerY = vh / 2;

      return { world, pieces, content, vw, vh, returning: false };
    };

    const teardown = () => {
      if (!scene) return;
      host.replaceChildren();
      document.documentElement.classList.remove("is-gravity");
      scene.content.removeAttribute("inert");
      apiRef.current.setScrollLocked(false);
      scene.world.clear();
      scene = null;
      grabbed = null;
      pushing = false;
    };

    // ── pointer ──────────────────────────────────────────────────────────────
    /** Topmost body under a point. Reverse order: later pieces paint on top. */
    const pick = (px: number, py: number): Piece | null => {
      if (!scene) return null;
      const { pieces } = scene;
      for (let i = pieces.length - 1; i >= 0; i--) {
        const b = pieces[i].body;
        const c = Math.cos(-b.angle);
        const s = Math.sin(-b.angle);
        const dx = px - b.x;
        const dy = py - b.y;
        const lx = c * dx - s * dy;
        const ly = s * dx + c * dy;
        if (Math.abs(lx) <= b.hw + 4 && Math.abs(ly) <= b.hh + 4) return pieces[i];
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      if (!scene || scene.returning) return;
      pointerX = e.clientX;
      pointerY = e.clientY;
      const hit = pick(pointerX, pointerY);
      if (!hit) {
        pushing = true;
        return;
      }
      grabbed = hit;
      scene.world.wake(hit.body);
      const b = hit.body;
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      const dx = pointerX - b.x;
      const dy = pointerY - b.y;
      anchorX = c * dx - s * dy;
      anchorY = s * dx + c * dy;
      hit.el.classList.add("is-held");
      apiRef.current.audio.hover();
    };

    const onMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
    };

    const onUp = () => {
      grabbed?.el.classList.remove("is-held");
      grabbed = null;
      pushing = false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (!scene || scene.returning) return;
      if (e.key === "Escape") {
        apiRef.current.setGravity(false);
        return;
      }
      if (e.key === " " || e.code === "Space") {
        // Shake the tube. Everything that had settled gets picked back up.
        e.preventDefault();
        scene.world.wakeAll();
        for (const p of scene.pieces) {
          p.body.vx += (Math.random() - 0.5) * 900;
          p.body.vy -= Math.random() * 700 + 220;
          p.body.av += (Math.random() - 0.5) * 12;
        }
        apiRef.current.degauss();
        apiRef.current.audio.thud();
      }
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("keydown", onKey);

    // ── the frame ────────────────────────────────────────────────────────────
    const unsubscribe = onFrame((_time, dt) => {
      const wanted = wantedRef.current;

      if (wanted && !scene) {
        scene = build();
        if (!scene) return;
      }
      if (!scene) return;

      if (!wanted && !scene.returning) {
        scene.returning = true;
        grabbed = null;
        pushing = false;
        for (const p of scene.pieces) {
          p.body.angle = normaliseAngle(p.body.angle);
          p.el.classList.remove("is-held");
          // Everything springs home, including anything still waiting to drop.
          p.released = true;
        }
      }

      const { world, pieces, vw, vh } = scene;
      const h = Math.min(dt, 40) / 1000;
      const now = performance.now();

      if (!scene.returning) {
        for (const p of pieces) {
          if (!p.released && now >= p.releaseAt) {
            p.released = true;
            world.add(p.body);
          }
        }

        // The grabbed piece hangs from the exact point it was grabbed, which is
        // what makes flinging one feel like a physical object rather than a
        // cursor-locked sprite. Gains are accelerations, not forces, so a long
        // word and a short one respond identically to the same drag.
        if (grabbed) {
          const b = grabbed.body;
          const c = Math.cos(b.angle);
          const s = Math.sin(b.angle);
          const rx = c * anchorX - s * anchorY;
          const ry = s * anchorX + c * anchorY;
          const vax = b.vx - b.av * ry;
          const vay = b.vy + b.av * rx;

          let ax = (pointerX - (b.x + rx)) * 900 - vax * 26;
          let ay = (pointerY - (b.y + ry)) * 900 - vay * 26;
          // Clamped so a fast flick cannot inject enough energy to launch the
          // entire pile off the top of the screen.
          const mag = Math.hypot(ax, ay);
          const max = 42000;
          if (mag > max) {
            ax = (ax / mag) * max;
            ay = (ay / mag) * max;
          }
          b.vx += ax * h;
          b.vy += ay * h;
          // Torque from the same force at the anchor. The mass terms cancel to a
          // purely geometric factor, so this too is size-independent.
          b.av += (rx * ay - ry * ax) * b.ii * (1 / Math.max(b.im, 1e-9)) * h * 0.3;
          world.wake(b);
        } else if (pushing) {
          // An empty drag is the cursor as a magnet, shoving the pile around.
          for (const p of pieces) {
            const b = p.body;
            const dx = b.x - pointerX;
            const dy = b.y - pointerY;
            const d2 = dx * dx + dy * dy;
            if (d2 > 240 * 240 || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const push = (1 - d / 240) * 2600 * h;
            b.vx += (dx / d) * push;
            b.vy += (dy / d) * push;
            world.wake(b);
          }
        }

        world.step(h);

        for (const im of world.impacts) {
          pushImpact(apiRef.current.frame.current, {
            x: im.x / vw,
            y: im.y / vh,
            energy: im.energy,
            at: now,
          });
        }
      } else {
        // ── returning ──────────────────────────────────────────────────────
        // A critically damped spring back to the layout position. Collisions are
        // off: pieces pass through each other on the way home, because the one
        // thing that must not happen is a word failing to arrive.
        let maxError = 0;
        for (const p of pieces) {
          const b = p.body;
          b.vx += ((p.homeX - b.x) * 300 - b.vx * 28) * h;
          b.vy += ((p.homeY - b.y) * 300 - b.vy * 28) * h;
          b.av += (-b.angle * 300 - b.av * 28) * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          b.angle += b.av * h;
          maxError = Math.max(
            maxError,
            Math.abs(b.x - p.homeX),
            Math.abs(b.y - p.homeY),
            Math.abs(b.angle) * 40,
          );
        }
        if (maxError < 0.6) {
          teardown();
          return;
        }
      }

      for (const p of pieces) {
        const b = p.body;
        p.el.style.transform = `translate3d(${(b.x - p.homeX).toFixed(2)}px, ${(
          b.y - p.homeY
        ).toFixed(2)}px, 0) rotate(${b.angle.toFixed(4)}rad)`;
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      // Unmounting mid-flight (a route change with the pile still in the air)
      // has to put the page back even though the return animation never ran.
      teardown();
    };
  }, [onFrame]);

  return <div ref={hostRef} className="gravity" aria-hidden="true" />;
}
