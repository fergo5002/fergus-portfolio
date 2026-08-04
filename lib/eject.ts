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
 */
export function ejectTransform(g: EjectGeometry): string {
  if (g.e === 0) return "none";
  return `translate(${(g.dx * 100).toFixed(4)}vw, ${(g.dy * 100).toFixed(4)}vh) scale(${g.scale.toFixed(5)})`;
}
