/**
 * Where the screen sits while the camera is pulling back off the glass.
 *
 * This is the one place the eject transform is defined, because two completely
 * different renderers have to agree on it to the pixel: CSS scales the live DOM
 * into the monitor, and the fragment shader draws the bezel, the light spill and
 * the desk *around* that same rectangle. If they drift by even a few pixels the
 * illusion dies instantly: the text visibly hangs over the plastic.
 *
 * Screen space here is 0..1 across the viewport with y pointing **down**, i.e.
 * CSS's convention. The shader flips it once on the way in.
 */
import { navDoor, navItems } from "@/content/nav";
import { THEMES } from "@/lib/system";
import type { Theme } from "@/lib/system";

/** How far the assembly slides against the pointer once fully ejected. */
export const EJECT_PARALLAX = 0.018;

/** Fraction of the viewport the screen shrinks to at full eject, on a desktop. */
export const EJECT_SCALE = 0.56;

/**
 * How far to pull back on a given viewport width.
 *
 * A 56% screen is a monitor on a desk when the viewport is a laptop display, and
 * illegible when it is a phone: 14px body text becomes 8px, and stepping back to
 * admire the machine should not cost the ability to read what is on it. Both the
 * shader and the CSS call this with `window.innerWidth`, so they cannot disagree.
 */
export function ejectScaleFor(viewportWidth: number): number {
  if (viewportWidth < 560) return 0.74;
  if (viewportWidth < 900) return 0.66;
  return EJECT_SCALE;
}

/** How far the monitor sits above centre, leaving desk beneath it. */
const EJECT_LIFT = -0.055;

/** Ken Perlin's smootherstep: zero first *and* second derivative at both ends. */
export function smootherstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export type EjectGeometry = {
  /** Uniform scale applied to the whole assembly. */
  scale: number;
  /** Centre offset as a fraction of the viewport. */
  dx: number;
  dy: number;
  /** Eased 0..1, for anything that just needs the progress curve. */
  e: number;
};

/**
 * @param t     raw eject progress, 0 (against the glass) to 1 (across the room)
 * @param px    pointer x in -1..1 from the centre of the viewport
 * @param py    pointer y in -1..1 from the centre of the viewport
 * @param scale how far back to pull; see `ejectScaleFor`
 */
export function ejectGeometry(
  t: number,
  px: number,
  py: number,
  scale: number = EJECT_SCALE,
): EjectGeometry {
  const e = smootherstep(t);
  // Exact identity while docked. Also avoids handing back a negative zero from
  // `-px * k * 0`, which is true-but-untidy and would print "-0" into a
  // transform string.
  if (e === 0) return { scale: 1, dx: 0, dy: 0, e: 0 };
  // Parallax is scaled by `e` so it cannot nudge the un-ejected site by a pixel.
  // Inverted against the pointer: moving the mouse right looks past the right
  // edge of the monitor, which is what leaning does.
  return {
    scale: 1 - (1 - scale) * e,
    dx: -px * EJECT_PARALLAX * e,
    dy: EJECT_LIFT * e - py * EJECT_PARALLAX * e,
    e,
  };
}

export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };

/** The live screen's rectangle in viewport space, y down. */
export function ejectScreenRect(g: EjectGeometry): ScreenRect {
  const half = g.scale / 2;
  return {
    x0: 0.5 + g.dx - half,
    x1: 0.5 + g.dx + half,
    y0: 0.5 + g.dy - half,
    y1: 0.5 + g.dy + half,
  };
}

/**
 * The matching CSS transform. `translate` is written before `scale` so the
 * offset is in un-scaled viewport units and lines up with `ejectScreenRect`.
 *
 * `band` is the power-off squash (`powerBand`): the picture's height as a
 * fraction of itself, 1 while the tube is on. It squashes the DOM about the
 * screen's centre line, which is where the shader collapses the raster.
 */
export function ejectTransform(g: EjectGeometry, band = 1): string {
  if (g.e === 0) return "none";
  const s = g.scale.toFixed(5);
  const scale = band === 1 ? s : `${s}, ${(g.scale * band).toFixed(5)}`;
  return `translate(${(g.dx * 100).toFixed(4)}vw, ${(g.dy * 100).toFixed(4)}vh) scale(${scale})`;
}

/* ── the monitor as an object (2026-09-27) ───────────────────────────────────
   The pull-back used to end on a flat screen with a thin lip under it. Now it
   ends on a monitor you can operate: a chin with working hardware in it, a
   badge, a base standing on a desk. The case is defined here and nowhere else.
   The shader draws it from `ejectCase().uCase` and friends as uniforms, and the
   DOM hardware is positioned from `ejectLayout()` and `ejectCase()`, so the
   plastic and the controls set into it agree by construction. */

/**
 * The case around the glass, as fractions of the screen's own height, so the
 * whole monitor scales as one rigid object while the camera moves. These were
 * the shader's literals before (0.030, 0.056, 0.026 and 0.03 in viewport heights
 * at a 0.56 pull-back) and are the same monitor, apart from the chin.
 */
export const EJECT_CASE = {
  /** Bezel either side of the glass. */
  side: 0.054,
  /** Bezel above it. */
  top: 0.054,
  /** The chin's height on a large display. It grows to hold the hardware; see `ejectLayout`. */
  chin: 0.15,
  /** The case's outer corner radius. */
  corner: 0.054,
  /** The glass's corner radius, which the DOM clips its own corners to as well. */
  glass: 0.021,
  /** The swivel base the case stands on. */
  base: 0.026,
} as const;

/**
 * The hardware in the chin, in CSS pixels at its smallest, which is a phone.
 * 44 is the floor Apple and WCAG 2.2 both land on, and the phone check's.
 */
export const EJECT_HARDWARE = {
  /** Every control's target, square. */
  control: 44,
  /** Between controls, where there is room: enough that no two printed names touch. */
  gap: 20,
  /** Between controls at the narrowest. */
  minGap: 4,
  /** The printed name under each control. */
  label: 13,
  /** Chin above and below the row. */
  pad: 10,
  /** The badge plate on the left of the chin, where it fits. */
  badgeW: 104,
  badgeH: 24,
  /** How many steps the contrast knob has from 0 to 1. */
  contrastSteps: 20,
} as const;

/** The controls in the order they sit on the chin, left to right. */
export const EJECT_CONTROLS = ["channel", "colour", "contrast", "degauss", "power"] as const;
export type EjectControl = (typeof EJECT_CONTROLS)[number];

/** A rectangle in CSS pixels, y down. */
export type Box = { x: number; y: number; w: number; h: number };

/**
 * The monitor fully ejected, with no lean, in CSS pixels relative to the case's
 * own top-left corner. Computed once per viewport size; `ejectCase` moves and
 * scales it every frame.
 */
export type EjectLayout = {
  vw: number;
  vh: number;
  /** The pull-back this viewport ends at (`ejectScaleFor`). */
  scale: number;
  /** The chin's height as a fraction of the screen's height, grown to fit the hardware. */
  chin: number;
  /** The hardware's size against its phone size: 1 on a phone, more on a large monitor. */
  unit: number;
  caseW: number;
  caseH: number;
  /** Where the glass is, and where the chin starts under it. */
  screen: Box;
  chinTop: number;
  /** The recess the controls are set into. */
  deck: Box;
  controls: Record<EjectControl, Box>;
  /** The badge plate, or null where the chin is too narrow for it and the controls both. */
  badge: Box | null;
  /** The speaker grille between the badge and the controls, or null where there is no room. */
  grille: Box | null;
  /** The power LED's centre. */
  led: { x: number; y: number };
};

export function ejectLayout(vw: number, vh: number): EjectLayout {
  const H = EJECT_HARDWARE;
  const scale = ejectScaleFor(vw);
  const screenW = scale * vw;
  const screenH = scale * vh;
  const side = EJECT_CASE.side * screenH;
  const top = EJECT_CASE.top * screenH;
  const corner = EJECT_CASE.corner * screenH;

  // The chin is as deep as its share of the screen, or as deep as the row of
  // controls needs, whichever is more. On a phone that is the row; on a big
  // display it is the share, and the hardware grows with it rather than
  // sitting in the middle of a slab of plastic like a row of buttons on a wall.
  const chinMin = H.control + H.label + 2 * H.pad;
  const chinPx = Math.max(EJECT_CASE.chin * screenH, chinMin);

  const caseW = screenW + 2 * side;
  const chinTop = top + screenH;
  const caseH = chinTop + chinPx;

  // Kept clear of the rounded corners and the side bezel alike.
  const margin = Math.max(side, corner);
  const n = EJECT_CONTROLS.length;
  const room = caseW - 2 * margin;
  // Grown with the chin, but never wider than the chin can hold at the full
  // gap: a tall narrow phone has a deep chin and not much width.
  const unit = Math.max(1, Math.min(chinPx / chinMin, (room - (n - 1) * H.gap) / (n * H.control)));
  const c = H.control * unit;
  const gap = Math.max(H.minGap, Math.min(H.gap * unit, (room - n * c) / (n - 1)));
  const deckW = n * c + (n - 1) * gap;
  const rowH = (H.control + H.label) * unit;
  const deck: Box = { x: caseW - margin - deckW, y: chinTop + (chinPx - rowH) / 2, w: deckW, h: rowH };

  const controls = {} as Record<EjectControl, Box>;
  EJECT_CONTROLS.forEach((name, i) => {
    controls[name] = { x: deck.x + i * (c + gap), y: deck.y, w: c, h: c };
  });

  // The badge goes on the left where it and the row both fit with a margin
  // between them; on a phone the row has the whole chin.
  const badgeW = H.badgeW * unit;
  const badgeH = H.badgeH * unit;
  const badge: Box | null =
    margin + badgeW + 2 * margin <= deck.x
      ? { x: margin, y: deck.y + (c - badgeH) / 2, w: badgeW, h: badgeH }
      : null;

  const grilleX = badge ? badge.x + badge.w + margin : margin;
  const grilleW = deck.x - margin - grilleX;
  const grille: Box | null =
    grilleW >= 3 * c ? { x: grilleX, y: deck.y + c * 0.18, w: grilleW, h: c * 0.64 } : null;

  const p = controls.power;
  const led = { x: p.x + p.w - 5 * unit, y: p.y + 5 * unit };

  return {
    vw,
    vh,
    scale,
    chin: chinPx / screenH,
    unit,
    caseW,
    caseH,
    screen: { x: side, y: top, w: screenW, h: screenH },
    chinTop,
    deck,
    controls,
    badge,
    grille,
    led,
  };
}

/** The monitor on one frame: where its layout lands and what the shader needs. */
export type EjectCase = {
  /** The case's top-left in viewport pixels, and the factor the rest layout is scaled by. */
  x: number;
  y: number;
  k: number;
  /** Bezel side, bezel top, chin and outer corner radius, in viewport heights: the shader's units. */
  uCase: [number, number, number, number];
  /** The glass's corner radius and the base's height, in viewport heights. */
  glass: number;
  base: number;
};

export function ejectCase(g: EjectGeometry, L: EjectLayout): EjectCase {
  const s = g.scale;
  const side = EJECT_CASE.side * s;
  const top = EJECT_CASE.top * s;
  return {
    x: (0.5 + g.dx - s / 2) * L.vw - side * L.vh,
    y: (0.5 + g.dy - s / 2) * L.vh - top * L.vh,
    k: s / L.scale,
    uCase: [side, top, L.chin * s, EJECT_CASE.corner * s],
    glass: EJECT_CASE.glass * s,
    base: EJECT_CASE.base * s,
  };
}

/** A layout box on this frame, in viewport pixels. */
export function placeBox(c: EjectCase, b: Box): Box {
  return { x: c.x + b.x * c.k, y: c.y + b.y * c.k, w: b.w * c.k, h: b.h * c.k };
}

/** A viewport-pixel box as GL uv, y up: x0, y0, x1, y1. What the shader's rect uniforms take. */
export function boxToGl(b: Box, vw: number, vh: number): [number, number, number, number] {
  return [b.x / vw, 1 - (b.y + b.h) / vh, (b.x + b.w) / vw, 1 - b.y / vh];
}

/**
 * The pointer's lean, -1..1 each way, for `ejectGeometry`'s parallax.
 *
 * Scaled by how present the pointer is, so the monitor settles back to centre
 * when the mouse leaves the window. Zero on touch: there the pointer exists
 * only under a finger, and the finger is usually on one of the controls, so
 * leaning would slide the control out from under the finger pressing it.
 */
export function ejectLean(x: number, y: number, active: number, coarse: boolean): [number, number] {
  if (coarse) return [0, 0];
  const a = Math.min(1, Math.max(0, active));
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  return [clamp((x - 0.5) * 2) * a, clamp((y - 0.5) * 2) * a];
}

/* ── power ──────────────────────────────────────────────────────────────── */

/**
 * The span of `frame.boot` over which the picture opens: the same
 * `smoothstep(0.05, 0.62, uPower)` the present pass uses for its vertical
 * deflection, and the curve SystemProvider publishes as `--boot-open`.
 */
export const POWER_OPEN = [0.05, 0.62] as const;

/** 0 while the raster is a line, 1 once it is open. */
export function powerOpen(boot: number): number {
  const x = Math.min(1, Math.max(0, (boot - POWER_OPEN[0]) / (POWER_OPEN[1] - POWER_OPEN[0])));
  return x * x * (3 - 2 * x);
}

/** The picture's height as a fraction of itself: the shader's `2 * mix(0.0016, 0.5, openT)`. */
export function powerBand(boot: number): number {
  return 0.0032 + (1 - 0.0032) * powerOpen(boot);
}

/* ── what the knobs drive ───────────────────────────────────────────────── */

export type EjectChannel = { label: string; href: string | null; command: string | null };

/**
 * A detent per nav route, in the nav's order, then the arcade. The arcade is a
 * program rather than a page, so its detent asks the shell to open the door,
 * exactly as the nav's `cd arcade` does; the arcade then takes you back into
 * the tube the way it always has.
 */
export const EJECT_CHANNELS: readonly EjectChannel[] = [
  ...navItems.map((i) => ({ label: i.label, href: i.href, command: null })),
  { label: navDoor.label, href: null, command: navDoor.command },
];

/** The detent for a path: the route it is, or is under. -1 for a page off the dial. */
export function channelIndex(path: string, arcadeOpen: boolean): number {
  if (arcadeOpen) return EJECT_CHANNELS.length - 1;
  return EJECT_CHANNELS.findIndex(
    (c) => c.href !== null && (c.href === path || (c.href !== "/" && path.startsWith(`${c.href}/`))),
  );
}

/**
 * Where the dial rests: its detent, or half a detent before the first when the
 * page is not one of its channels (`/contact`, a 404), so it never claims a
 * channel the visitor is not on.
 */
export function dialRest(channel: number): number {
  return channel < 0 ? -0.5 : channel;
}

/**
 * Where a tap on a knob goes: the next detent, stopping at the last rather than
 * wrapping past it, and round to the first only from the last. A dial resting
 * off its detents goes to the first.
 */
export function knobTap(value: number, min: number, max: number, step: number): number {
  if (value >= max) return min;
  return Math.min(max, Math.max(min, value + step));
}

/** One detent per phosphor, in the theme list's order. */
export const EJECT_COLOURS: readonly Theme[] = THEMES;

/** The contrast knob's position to a scanline intensity, clamped to 0..1. */
export function contrastFromDial(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v / EJECT_HARDWARE.contrastSteps));
}

/** A scanline intensity to the nearest position on the contrast knob. */
export function dialFromContrast(c: number): number {
  const steps = EJECT_HARDWARE.contrastSteps;
  return Math.min(steps, Math.max(0, Math.round(c * steps)));
}
