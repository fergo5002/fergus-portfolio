import { describe, expect, it } from "vitest";
import {
  EJECT_PARALLAX,
  ejectGeometry,
  ejectScaleFor,
  ejectScreenRect,
  smootherstep,
} from "./eject";
import {
  EJECT_CASE,
  EJECT_CHANNELS,
  EJECT_COLOURS,
  EJECT_CONTROLS,
  EJECT_HARDWARE,
  POWER_OPEN,
  channelIndex,
  contrastFromDial,
  dialRest,
  dialFromContrast,
  ejectCase,
  ejectLayout,
  ejectLean,
  ejectTransform,
  placeBox,
  powerBand,
  powerOpen,
  knobTap,
} from "./eject";
import { navDoor, navItems } from "@/content/nav";
import { THEMES } from "./system";

describe("smootherstep", () => {
  it("pins both ends", () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
  });

  it("clamps outside the unit range", () => {
    expect(smootherstep(-2)).toBe(0);
    expect(smootherstep(4)).toBe(1);
  });

  it("is symmetric about the midpoint and flat at both ends", () => {
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smootherstep(0.25) + smootherstep(0.75)).toBeCloseTo(1, 6);
    // Zero first derivative at the ends is the whole point: the pull-back must
    // not start or stop with a visible jerk.
    expect(smootherstep(0.001)).toBeLessThan(0.0001);
    expect(smootherstep(0.999)).toBeGreaterThan(0.9999);
  });
});

describe("ejectGeometry", () => {
  it("is a no-op at rest, so the un-ejected site is untransformed", () => {
    const g = ejectGeometry(0, 0, 0);
    expect(g.scale).toBe(1);
    expect(g.dx).toBe(0);
    expect(g.dy).toBe(0);
  });

  it("shrinks and lifts the assembly as it pulls back", () => {
    const g = ejectGeometry(1, 0, 0);
    expect(g.scale).toBeLessThan(0.7);
    expect(g.scale).toBeGreaterThan(0.4);
    // Lifted, to leave desk below the monitor.
    expect(g.dy).toBeLessThan(0);
  });

  it("is monotonic in t", () => {
    let prev = 1.1;
    for (let t = 0; t <= 1; t += 0.05) {
      const s = ejectGeometry(t, 0, 0).scale;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it("applies pointer parallax only once ejected, and against the pointer", () => {
    expect(ejectGeometry(0, 1, 1).dx).toBe(0);
    // Moving the pointer right should look past the right edge of the monitor,
    // so the assembly slides left. Getting this sign backwards reads as the
    // monitor chasing the cursor, which is the opposite of parallax.
    const g = ejectGeometry(1, 1, -1);
    expect(g.dx).toBeCloseTo(-EJECT_PARALLAX, 6);
    expect(g.dy).toBeCloseTo(-0.055 + EJECT_PARALLAX, 6);
  });

  it("keeps parallax small enough that the screen never leaves the bezel", () => {
    for (const px of [-1, 0, 1]) {
      for (const py of [-1, 0, 1]) {
        const r = ejectScreenRect(ejectGeometry(1, px, py));
        expect(r.x0).toBeGreaterThan(0.05);
        expect(r.x1).toBeLessThan(0.95);
        expect(r.y0).toBeGreaterThan(0.05);
        expect(r.y1).toBeLessThan(0.95);
      }
    }
  });
});

describe("ejectScreenRect", () => {
  it("is the whole viewport at rest", () => {
    const r = ejectScreenRect(ejectGeometry(0, 0, 0));
    expect(r.x0).toBe(0);
    expect(r.x1).toBe(1);
    expect(r.y0).toBe(0);
    expect(r.y1).toBe(1);
  });

  it("stays centred horizontally with no parallax", () => {
    const r = ejectScreenRect(ejectGeometry(0.6, 0, 0));
    expect(r.x0 + r.x1).toBeCloseTo(1, 6);
  });

  it("matches the CSS transform it is derived from", () => {
    // The shader draws the bezel around this rect while CSS scales the DOM by
    // the same numbers. If these two ever disagree the content visibly hangs
    // over the plastic, so the relationship is asserted rather than assumed.
    const g = ejectGeometry(0.7, 0.3, -0.2);
    const r = ejectScreenRect(g);
    expect(r.x1 - r.x0).toBeCloseTo(g.scale, 6);
    expect(r.y1 - r.y0).toBeCloseTo(g.scale, 6);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(0.5 + g.dx, 6);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(0.5 + g.dy, 6);
  });
});

describe("ejectScaleFor", () => {
  it("pulls back less on a narrow viewport, so the text stays readable", () => {
    expect(ejectScaleFor(390)).toBeGreaterThan(ejectScaleFor(1440));
    expect(ejectScaleFor(780)).toBeGreaterThan(ejectScaleFor(1440));
  });

  it("never inverts: a wider viewport is never pulled back less", () => {
    let prev = 1;
    for (let w = 320; w <= 2560; w += 40) {
      const s = ejectScaleFor(w);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("keeps the screen inside the bezel at every breakpoint", () => {
    for (const w of [320, 390, 559, 560, 899, 900, 1440, 2560]) {
      const r = ejectScreenRect(ejectGeometry(1, 1, 1, ejectScaleFor(w)));
      expect(r.x0).toBeGreaterThan(0.02);
      expect(r.x1).toBeLessThan(0.98);
      expect(r.y0).toBeGreaterThan(0.02);
      expect(r.y1).toBeLessThan(0.98);
    }
  });
});

/* ── the monitor as an object (2026-09-27) ────────────────────────────────
   Everything below is an addition. The case, the chin and the hardware set
   into it are defined in lib/eject.ts once, and both renderers take them from
   there: the shader as uniforms, the DOM controls as positions. */

/** Viewports worth trusting: the phones the phone check drives, the common
 *  desktops, and a sweep of every width from 320 to 2560 at two heights. */
function viewports(): [number, number][] {
  const named: [number, number][] = [
    [320, 568], [320, 480], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932],
    [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1366, 768], [1440, 900],
    [1536, 864], [1920, 1080], [2560, 1440], [2560, 1080],
  ];
  for (let w = 320; w <= 2560; w += 10) {
    named.push([w, Math.round(w * 0.625)]);
    if (w < 900) named.push([w, Math.round(w * 2.16)]);
  }
  // A 16:10 strip under 640 wide is shorter than any phone held either way;
  // below 400px tall there is no room for a monitor and a desk.
  return named.filter(([, h]) => h >= 400);
}

type R = { x: number; y: number; w: number; h: number };
const inside = (a: R, b: R, slack = 1e-6) =>
  a.x >= b.x - slack && a.y >= b.y - slack && a.x + a.w <= b.x + b.w + slack && a.y + a.h <= b.y + b.h + slack;
const overlaps = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The chin as the shader draws it, ported from the two lines in room() that
 * build the case (`bh` and `bc`). `PhosphorScreen.test.ts` pins those lines, so
 * this port and the GLSL cannot drift apart silently.
 */
function shaderChin(t: number, px: number, py: number, w: number, h: number): R {
  const L = ejectLayout(w, h);
  const g = ejectGeometry(t, px, py, L.scale);
  const c = ejectCase(g, L);
  const [side, top, chin] = c.uCase;
  const r = ejectScreenRect(g);
  // q-space: viewport heights, y up, centred, as room() has it.
  const aspect = w / h;
  const rc = { x: ((r.x0 + r.x1) / 2 - 0.5) * aspect, y: 0.5 - (r.y0 + r.y1) / 2 };
  const rh = { x: ((r.x1 - r.x0) / 2) * aspect, y: (r.y1 - r.y0) / 2 };
  const bh = { x: rh.x + side, y: rh.y + (top + chin) * 0.5 };
  const bc = { x: rc.x, y: rc.y - (chin - top) * 0.5 };
  const toPx = (qx: number, qy: number) => ({ x: (qx / aspect + 0.5) * w, y: (0.5 - qy) * h });
  const a = toPx(bc.x - bh.x, rc.y - rh.y); // chin top-left: the screen's bottom edge
  const b = toPx(bc.x + bh.x, bc.y - bh.y); // chin bottom-right: the case's foot
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

describe("ejectLayout: the chin holds the hardware", () => {
  it("names five controls, in the order they sit on the chin", () => {
    expect(EJECT_CONTROLS).toEqual(["channel", "colour", "contrast", "degauss", "power"]);
  });

  it("gives every control at least a 44px target at every viewport from 320 to 2560", () => {
    for (const [w, h] of viewports()) {
      const L = ejectLayout(w, h);
      for (const name of EJECT_CONTROLS) {
        const b = L.controls[name];
        expect(b.w, `${name} at ${w}x${h}`).toBeGreaterThanOrEqual(EJECT_HARDWARE.control);
        expect(b.h, `${name} at ${w}x${h}`).toBeGreaterThanOrEqual(EJECT_HARDWARE.control);
      }
    }
  });

  it("puts the controls, their printed names and the badge inside the chin, clear of each other", () => {
    for (const [w, h] of viewports()) {
      const L = ejectLayout(w, h);
      const chin: R = { x: 0, y: L.chinTop, w: L.caseW, h: L.caseH - L.chinTop };
      expect(inside(L.deck, chin), `deck at ${w}x${h}`).toBe(true);
      const boxes = EJECT_CONTROLS.map((n) => L.controls[n]);
      for (const b of boxes) {
        expect(inside(b, L.deck), `control at ${w}x${h}`).toBe(true);
        // The printed name sits under its control and must not fall off the chin.
        expect(b.y + b.h + EJECT_HARDWARE.label * L.unit).toBeLessThanOrEqual(chin.y + chin.h + 1e-6);
      }
      for (let i = 1; i < boxes.length; i++) {
        expect(overlaps(boxes[i - 1], boxes[i]), `controls ${i - 1} and ${i} at ${w}x${h}`).toBe(false);
        expect(boxes[i].x - (boxes[i - 1].x + boxes[i - 1].w)).toBeGreaterThanOrEqual(EJECT_HARDWARE.minGap - 1e-6);
      }
      if (L.badge) {
        expect(inside(L.badge, chin), `badge at ${w}x${h}`).toBe(true);
        expect(overlaps(L.badge, L.deck), `badge over the deck at ${w}x${h}`).toBe(false);
      }
      // Clear of the rounded corners of the case.
      const corner = EJECT_CASE.corner * L.scale * h;
      expect(L.deck.x).toBeGreaterThanOrEqual(corner - 1e-6);
      expect(L.deck.x + L.deck.w).toBeLessThanOrEqual(L.caseW - corner + 1e-6);
      // The LED sits on the power control's upper corner, where its cap is not.
      const p = L.controls.power;
      expect(L.led.x).toBeGreaterThan(p.x + p.w / 2);
      expect(L.led.x).toBeLessThan(p.x + p.w);
      expect(L.led.y).toBeGreaterThan(p.y);
      expect(L.led.y).toBeLessThan(p.y + p.h / 2);
    }
  });

  it("grows the chin on narrow viewports rather than shrinking the controls", () => {
    const phone = ejectLayout(320, 568);
    const desk = ejectLayout(2560, 1440);
    expect(phone.chin).toBeGreaterThan(EJECT_CASE.chin);
    expect(desk.chin).toBeCloseTo(EJECT_CASE.chin, 6);
    // And scales the hardware up with a large monitor instead of leaving it tiny.
    expect(desk.unit).toBeGreaterThan(1.2);
    expect(phone.unit).toBe(1);
  });

  it("keeps the whole monitor, base included, inside the viewport at rest", () => {
    for (const [w, h] of viewports()) {
      const L = ejectLayout(w, h);
      const c = ejectCase(ejectGeometry(1, 0, 0, L.scale), L);
      expect(c.x, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(c.y, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(c.x + L.caseW, `${w}x${h}`).toBeLessThanOrEqual(w);
      expect(c.y + L.caseH + c.base * h, `${w}x${h}`).toBeLessThanOrEqual(h);
    }
  });

  it("keeps it inside with the pointer at any corner, where there is a pointer to lean with", () => {
    for (const [w, h] of viewports().filter(([vw, vh]) => vw >= 900 && vw / vh < 2)) {
      const L = ejectLayout(w, h);
      for (const px of [-1, 1]) {
        for (const py of [-1, 1]) {
          const c = ejectCase(ejectGeometry(1, px, py, L.scale), L);
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + L.caseW).toBeLessThanOrEqual(w);
          expect(c.y + L.caseH + c.base * h, `${w}x${h} leaning ${px},${py}`).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe("ejectCase: one geometry for the shader and the DOM", () => {
  it("lands the DOM chin exactly on the shader's chin, all the way through the pull-back", () => {
    for (const [w, h] of [[320, 568], [390, 844], [1440, 900], [2560, 1440], [1024, 768]] as const) {
      const L = ejectLayout(w, h);
      for (const t of [0.2, 0.5, 0.8, 1]) {
        for (const [px, py] of [[0, 0], [1, -1], [-0.4, 0.7]]) {
          const g = ejectGeometry(t, px, py, L.scale);
          const c = ejectCase(g, L);
          const dom = placeBox(c, { x: 0, y: L.chinTop, w: L.caseW, h: L.caseH - L.chinTop });
          const gl = shaderChin(t, px, py, w, h);
          for (const k of ["x", "y", "w", "h"] as const) {
            expect(Math.abs(dom[k] - gl[k]), `${k} at ${w}x${h} t=${t}`).toBeLessThan(0.01);
          }
          // And every control is inside that chin on every frame, not just at rest.
          for (const name of EJECT_CONTROLS) {
            expect(inside(placeBox(c, L.controls[name]), gl, 0.01), `${name} ${w}x${h} t=${t}`).toBe(true);
          }
        }
      }
    }
  });

  it("places the screen where ejectScreenRect says it is", () => {
    const L = ejectLayout(1440, 900);
    const g = ejectGeometry(1, 0.3, 0.2, L.scale);
    const c = ejectCase(g, L);
    const r = ejectScreenRect(g);
    const screen = placeBox(c, L.screen);
    expect(screen.x).toBeCloseTo(r.x0 * 1440, 6);
    expect(screen.y).toBeCloseTo(r.y0 * 900, 6);
    expect(screen.x + screen.w).toBeCloseTo(r.x1 * 1440, 6);
    expect(screen.y + screen.h).toBeCloseTo(r.y1 * 900, 6);
  });

  it("scales the hardware 1:1 at rest and with the monitor while it moves", () => {
    const L = ejectLayout(390, 844);
    expect(ejectCase(ejectGeometry(1, 0, 0, L.scale), L).k).toBeCloseTo(1, 9);
    expect(ejectCase(ejectGeometry(0.5, 0, 0, L.scale), L).k).toBeGreaterThan(1);
  });

  it("hands the shader sizes in viewport heights, none of them zero", () => {
    const L = ejectLayout(1440, 900);
    const c = ejectCase(ejectGeometry(1, 0, 0, L.scale), L);
    expect(c.uCase).toHaveLength(4);
    for (const v of c.uCase) expect(v).toBeGreaterThan(0);
    // The chin is the deepest part of the case: the controls live there.
    expect(c.uCase[2]).toBeGreaterThan(c.uCase[0]);
    expect(c.uCase[2]).toBeGreaterThan(c.uCase[1]);
    expect(c.glass).toBeGreaterThan(0);
    expect(c.base).toBeGreaterThan(0);
  });
});

describe("the hardware's positions match what they drive", () => {
  it("has a channel detent per nav route, in the nav's order, then the arcade door", () => {
    expect(EJECT_CHANNELS.slice(0, navItems.length).map((c) => c.href)).toEqual(navItems.map((i) => i.href));
    expect(EJECT_CHANNELS.slice(0, navItems.length).map((c) => c.label)).toEqual(navItems.map((i) => i.label));
    expect(EJECT_CHANNELS).toHaveLength(navItems.length + 1);
    const last = EJECT_CHANNELS[EJECT_CHANNELS.length - 1];
    expect(last.label).toBe(navDoor.label);
    expect(last.command).toBe(navDoor.command);
  });

  it("finds the current channel from the path, and the door while the arcade is up", () => {
    expect(channelIndex("/", false)).toBe(0);
    expect(channelIndex("/projects", false)).toBe(2);
    expect(channelIndex("/mcp", false)).toBe(5);
    expect(channelIndex("/writing/some-article", false)).toBe(3);
    expect(channelIndex("/tools/relief", false)).toBe(4);
    expect(channelIndex("/contact", false)).toBe(-1);
    expect(channelIndex("/projects", true)).toBe(EJECT_CHANNELS.length - 1);
  });

  it("has a colour detent per theme, in the theme list's order", () => {
    expect([...EJECT_COLOURS]).toEqual(THEMES);
  });

  it("keeps contrast between 0 and 1 wherever the knob is", () => {
    for (let v = -10; v <= 40; v++) {
      const c = contrastFromDial(v);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(contrastFromDial(0)).toBe(0);
    expect(contrastFromDial(EJECT_HARDWARE.contrastSteps)).toBe(1);
    expect(contrastFromDial(Number.NaN)).toBe(0);
    // Round trip through the knob for every position.
    for (let v = 0; v <= EJECT_HARDWARE.contrastSteps; v++) {
      expect(dialFromContrast(contrastFromDial(v))).toBe(v);
    }
    expect(dialFromContrast(2)).toBe(EJECT_HARDWARE.contrastSteps);
    expect(dialFromContrast(-1)).toBe(0);
  });
});

describe("power: the picture collapses the way the shader collapses it", () => {
  it("opens on the same smoothstep the present pass uses", () => {
    expect(POWER_OPEN).toEqual([0.05, 0.62]);
    expect(powerOpen(0)).toBe(0);
    expect(powerOpen(0.05)).toBe(0);
    expect(powerOpen(0.62)).toBe(1);
    expect(powerOpen(1)).toBe(1);
    const x = (0.3 - 0.05) / 0.57;
    expect(powerOpen(0.3)).toBeCloseTo(x * x * (3 - 2 * x), 9);
  });

  it("leaves a line, not nothing, and the whole picture when on", () => {
    expect(powerBand(0)).toBeCloseTo(0.0032, 9);
    expect(powerBand(1)).toBe(1);
  });

  it("squashes the DOM with the picture, and only while it is squashed", () => {
    const g = ejectGeometry(1, 0, 0);
    expect(ejectTransform(g, 1)).toBe(ejectTransform(g));
    expect(ejectTransform(g, 0.5)).toMatch(/scale\(0\.56000, 0\.28000\)$/);
  });
});

describe("ejectLean", () => {
  it("leans with a mouse, scaled by how present it is", () => {
    expect(ejectLean(1, 0, 1, false)).toEqual([1, -1]);
    expect(ejectLean(0.75, 0.5, 0.5, false)).toEqual([0.25, 0]);
    expect(ejectLean(2, -1, 1, false)).toEqual([1, -1]);
  });

  it("never leans on touch, where the pointer only exists under a finger on a control", () => {
    // A tap would move the monitor under the finger that is pressing it.
    expect(ejectLean(1, 1, 1, true)).toEqual([0, 0]);
  });
});

describe("a knob under a tap (code review, 2026-09-27)", () => {
  it("moves to the next detent and stops at the last rather than skipping it", () => {
    // Contrast taps by 4 up to 20: from 17 a tap used to wrap straight to 0
    // and switch the scanlines off, skipping the printed 20.
    expect(knobTap(17, 0, 20, 4)).toBe(20);
    expect(knobTap(12, 0, 20, 4)).toBe(16);
  });
  it("goes round to the first detent only from the last", () => {
    expect(knobTap(20, 0, 20, 4)).toBe(0);
    expect(knobTap(6, 0, 6, 1)).toBe(0);
  });
  it("takes a dial resting off its detents to the first", () => {
    expect(knobTap(-1, 0, 6, 1)).toBe(0);
  });
});

describe("the channel dial on a page that is not a channel", () => {
  it("rests half a detent before channel 1, not on it", () => {
    expect(channelIndex("/contact", false)).toBe(-1);
    expect(dialRest(-1)).toBe(-0.5);
    expect(dialRest(0)).toBe(0);
    expect(dialRest(3)).toBe(3);
  });
});
