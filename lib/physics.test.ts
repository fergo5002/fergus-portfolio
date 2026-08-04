import { describe, expect, it } from "vitest";
import {
  World,
  boxInertia,
  collide,
  createBody,
  featureKey,
  type Body,
} from "./physics";

/** A body with the defaults the stage uses, so tests exercise the real tuning. */
function box(x: number, y: number, hw = 10, hh = 10, extra: Partial<Body> = {}): Body {
  return createBody({ x, y, hw, hh, ...extra });
}

function ground(y: number): Body {
  return createBody({ x: 0, y, hw: 10000, hh: 40, mass: 0 });
}

describe("boxInertia", () => {
  it("is the standard rectangle formula about the centre", () => {
    // I = m (w^2 + h^2) / 12
    expect(boxInertia(2, 3, 5)).toBeCloseTo((2 * (36 + 100)) / 12, 6);
  });

  it("is zero for a static body, so its inverse can be zeroed safely", () => {
    expect(boxInertia(0, 3, 5)).toBe(0);
  });
});

describe("createBody", () => {
  it("derives mass from area when none is given", () => {
    const a = box(0, 0, 10, 10);
    const b = box(0, 0, 20, 20);
    expect(1 / b.im).toBeGreaterThan(1 / a.im);
  });

  it("marks a zero-mass body as static (both inverses zero)", () => {
    const g = ground(0);
    expect(g.im).toBe(0);
    expect(g.ii).toBe(0);
    expect(g.static).toBe(true);
  });
});

describe("collide", () => {
  it("returns null for separated boxes", () => {
    expect(collide(box(0, 0), box(100, 0))).toBeNull();
  });

  it("returns null for boxes that only just miss", () => {
    expect(collide(box(0, 0, 10, 10), box(20.5, 0, 10, 10))).toBeNull();
  });

  it("finds the shallow axis for a side-on overlap", () => {
    const m = collide(box(0, 0, 10, 10), box(18, 0, 10, 10));
    expect(m).not.toBeNull();
    // Normal points from A to B, i.e. along +x.
    expect(m!.nx).toBeCloseTo(1, 6);
    expect(m!.ny).toBeCloseTo(0, 6);
    // 20 wide contact pair overlapping by 2.
    expect(m!.points[0].separation).toBeCloseTo(-2, 4);
  });

  it("finds the vertical axis for a stacked overlap", () => {
    const m = collide(box(0, 0, 10, 10), box(0, 18, 10, 10));
    expect(m).not.toBeNull();
    expect(m!.ny).toBeCloseTo(1, 6);
    expect(Math.abs(m!.nx)).toBeLessThan(1e-6);
  });

  it("produces two contact points for a flat face-to-face overlap", () => {
    const m = collide(box(0, 0, 10, 10), box(0, 18, 10, 10));
    expect(m!.points).toHaveLength(2);
  });

  it("produces one contact point for a corner-on (rotated) overlap", () => {
    // A square rotated 45 degrees resting corner-down on a flat box.
    const m = collide(box(0, 0, 10, 10), box(0, 22, 10, 10, { angle: Math.PI / 4 }));
    expect(m).not.toBeNull();
    expect(m!.points.length).toBe(1);
  });

  it("is symmetric about which body is passed first", () => {
    const ab = collide(box(0, 0), box(0, 18))!;
    const ba = collide(box(0, 18), box(0, 0))!;
    expect(ab.ny).toBeCloseTo(-ba.ny, 6);
    expect(ab.points[0].separation).toBeCloseTo(ba.points[0].separation, 4);
  });

  it("detects a rotated box overlapping an axis-aligned one", () => {
    const m = collide(box(0, 0, 10, 10), box(0, 24, 10, 10, { angle: Math.PI / 4 }));
    // Half-diagonal is ~14.14, so a centre 24 above overlaps by ~0.14.
    expect(m).not.toBeNull();
  });
});

describe("featureKey", () => {
  it("packs four edge ids into one distinguishable integer", () => {
    expect(featureKey(1, 2, 3, 4)).not.toBe(featureKey(4, 3, 2, 1));
    expect(featureKey(1, 2, 3, 4)).toBe(featureKey(1, 2, 3, 4));
  });
});

describe("World", () => {
  it("falls under gravity", () => {
    const w = new World();
    const b = box(0, 0);
    w.add(b);
    for (let i = 0; i < 10; i++) w.step(1 / 60);
    expect(b.y).toBeGreaterThan(0);
    expect(b.vy).toBeGreaterThan(0);
  });

  it("comes to rest on a static floor at the right height", () => {
    const w = new World();
    const floor = ground(500);
    const b = box(0, 0, 10, 10, { restitution: 0 });
    w.add(floor);
    w.add(b);
    for (let i = 0; i < 240; i++) w.step(1 / 60);

    // Floor top is 500 - 40 = 460; a 10-half-height box rests at 450.
    expect(b.y).toBeGreaterThan(448);
    expect(b.y).toBeLessThan(452);
    expect(Math.abs(b.vy)).toBeLessThan(2);
  });

  it("bounces a restitutive body back up", () => {
    const w = new World();
    w.add(ground(500));
    const b = box(0, 0, 10, 10, { restitution: 0.75 });
    w.add(b);

    let rebounded = false;
    for (let i = 0; i < 200; i++) {
      w.step(1 / 60);
      if (b.vy < -30) rebounded = true;
    }
    expect(rebounded).toBe(true);
  });

  it("keeps a dead body dead: restitution 0 does not rebound", () => {
    const w = new World();
    w.add(ground(500));
    const b = box(0, 0, 10, 10, { restitution: 0 });
    w.add(b);

    let maxUp = 0;
    for (let i = 0; i < 200; i++) {
      w.step(1 / 60);
      maxUp = Math.min(maxUp, b.vy);
    }
    expect(maxUp).toBeGreaterThan(-40);
  });

  it("stacks without exploding — the stability guarantee the whole effect rests on", () => {
    const w = new World();
    w.add(ground(600));
    const boxes: Body[] = [];
    for (let i = 0; i < 12; i++) {
      const b = box(0, 560 - i * 22, 10, 10, { restitution: 0 });
      boxes.push(b);
      w.add(b);
    }
    for (let i = 0; i < 600; i++) w.step(1 / 60);

    for (const b of boxes) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
      // Nothing has been flung out of the pile or sunk through the floor.
      expect(Math.abs(b.x)).toBeLessThan(400);
      expect(b.y).toBeLessThan(575);
      expect(b.y).toBeGreaterThan(300);
    }
  });

  it("never lets a body tunnel out through a fast approach", () => {
    const w = new World();
    w.add(ground(500));
    const b = box(0, 0, 10, 10, { restitution: 0 });
    b.vy = 4000; // far faster than anything the stage produces
    w.add(b);
    for (let i = 0; i < 120; i++) w.step(1 / 60);
    expect(b.y).toBeLessThan(520);
  });

  it("puts settled bodies to sleep and wakes them on contact", () => {
    const w = new World();
    w.add(ground(500));
    const resting = box(0, 300, 10, 10, { restitution: 0 });
    w.add(resting);
    for (let i = 0; i < 400; i++) w.step(1 / 60);
    expect(resting.awake).toBe(false);
    expect(resting.y).toBeCloseTo(450, 0);

    // A sleeper must wake when something lands on it, then be allowed to settle
    // back down. Asserting `awake` at the end of the run would be asserting the
    // opposite of what we want: by then the pair has restacked and gone quiet,
    // which is the correct outcome, so the wake is checked as it happens.
    const dropped = box(0, 0, 10, 10, { restitution: 0 });
    w.add(dropped);
    let woke = false;
    for (let i = 0; i < 200; i++) {
      w.step(1 / 60);
      if (resting.awake) woke = true;
    }
    expect(woke).toBe(true);
    // And the result is a real stack, not one box sunk inside the other.
    expect(resting.y).toBeCloseTo(450, 0);
    expect(dropped.y).toBeCloseTo(430, 0);
    expect(resting.awake).toBe(false);
  });

  it("reports impacts above the threshold, loudest first", () => {
    const w = new World();
    w.add(ground(500));
    const b = box(0, 0, 10, 10, { restitution: 0.4 });
    b.vy = 900;
    w.add(b);

    let seen: { x: number; y: number; energy: number }[] = [];
    for (let i = 0; i < 60; i++) {
      w.step(1 / 60);
      if (w.impacts.length) seen = seen.concat(w.impacts.map((p) => ({ ...p })));
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].energy).toBeGreaterThan(0);
    expect(seen[0].y).toBeGreaterThan(300);
  });

  it("is deterministic: identical inputs give identical output", () => {
    const run = () => {
      const w = new World();
      w.add(ground(500));
      const bodies = [box(-20, 0), box(0, -40, 12, 8), box(25, -90, 8, 14)];
      bodies.forEach((b) => w.add(b));
      for (let i = 0; i < 300; i++) w.step(1 / 60);
      return bodies.map((b) => [b.x, b.y, b.angle]);
    };
    expect(run()).toEqual(run());
  });

  it("clamps a huge frame delta rather than integrating it", () => {
    const w = new World();
    w.add(ground(500));
    const b = box(0, 0, 10, 10);
    w.add(b);
    // A backgrounded tab returns one enormous delta. Integrating it directly
    // would teleport every body through the floor and out of the world.
    w.step(4);
    expect(b.y).toBeLessThan(520);
  });

  it("removes a body cleanly, dropping its arbiters", () => {
    const w = new World();
    w.add(ground(500));
    const a = box(0, 460, 10, 10);
    const b = box(0, 430, 10, 10);
    w.add(a);
    w.add(b);
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    w.remove(a);
    expect(w.bodies).not.toContain(a);
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});
