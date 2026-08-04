/**
 * A small, honest 2D rigid-body engine.
 *
 * This exists because "the page has mass" is only convincing if the mass is
 * real. Fake physics — springs on a timer, CSS falling — reads as an animation
 * within about two seconds of someone grabbing a word and trying to stack it on
 * another one. So this is the actual thing: oriented boxes, SAT collision with a
 * clipped two-point manifold, sequential impulses with warm starting, Coulomb
 * friction, restitution and sleeping.
 *
 * The structure follows Erin Catto's Box2D-Lite, which is the clearest published
 * description of a stable impulse solver, with two deliberate departures:
 *
 *  1. **Split impulses.** Penetration is resolved through a second set of
 *     "pseudo" velocities that never touch the real ones. Box2D-Lite folds the
 *     Baumgarte bias straight into the normal impulse, which injects energy: a
 *     box with restitution 0 dropped from a height visibly hops on landing,
 *     because a deep first-frame penetration is corrected by handing the body
 *     hundreds of px/s of real upward velocity. Words hopping off the floor
 *     after being dropped is exactly the tell that gives away a toy engine.
 *  2. **Fixed sub-stepping.** `step()` takes a wall-clock delta and consumes it
 *     in slices of at most 1/120s, clamped in total. A backgrounded tab hands
 *     back a delta measured in seconds, and integrating that directly teleports
 *     every body through the floor.
 *
 * Units are pixels and seconds, because the consumer is the DOM.
 */

export type Body = {
  id: number;
  /** Centre of mass, in the stage's pixel space. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians. */
  angle: number;
  /** Angular velocity, radians/second. */
  av: number;
  /** Half extents. */
  hw: number;
  hh: number;
  /** Inverse mass and inverse inertia. Zero on both means static. */
  im: number;
  ii: number;
  static: boolean;
  restitution: number;
  friction: number;
  /** Split-impulse pseudo velocities. Reset every sub-step; never rendered. */
  psx: number;
  psy: number;
  psa: number;
  /** Consecutive sub-steps spent below the sleep thresholds. */
  idle: number;
  awake: boolean;
  /** Free slot for the caller to hang its DOM node (or anything else) on. */
  data?: unknown;
};

export type Impact = { x: number; y: number; energy: number };

let nextId = 1;

/** Rectangle inertia about the centre: m(w² + h²)/12. Zero for static bodies. */
export function boxInertia(mass: number, hw: number, hh: number): number {
  if (mass <= 0) return 0;
  const w = hw * 2;
  const h = hh * 2;
  return (mass * (w * w + h * h)) / 12;
}

/** Density chosen so an ordinary word-sized box lands near unit mass. */
const DENSITY = 0.002;

export function createBody(init: {
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** Omit for area-derived mass; pass 0 for a static body. */
  mass?: number;
  angle?: number;
  restitution?: number;
  friction?: number;
  data?: unknown;
}): Body {
  const hw = Math.max(0.5, init.hw);
  const hh = Math.max(0.5, init.hh);
  const mass = init.mass ?? hw * 2 * hh * 2 * DENSITY;
  const inertia = boxInertia(mass, hw, hh);
  const isStatic = mass <= 0;
  return {
    id: nextId++,
    x: init.x,
    y: init.y,
    vx: 0,
    vy: 0,
    angle: init.angle ?? 0,
    av: 0,
    hw,
    hh,
    im: isStatic ? 0 : 1 / mass,
    ii: isStatic ? 0 : 1 / inertia,
    static: isStatic,
    restitution: init.restitution ?? 0.12,
    friction: init.friction ?? 0.45,
    psx: 0,
    psy: 0,
    psa: 0,
    idle: 0,
    awake: !isStatic,
    data: init.data,
  };
}

/* ── collision ─────────────────────────────────────────────────────────────
   SAT between two oriented boxes, then Sutherland–Hodgman clipping of the
   incident face against the reference face's side planes to get up to two
   contact points. Two points is what lets a box rest flat instead of pivoting
   on a single point like a coin on its edge. */

const EDGE_NONE = 0;
const EDGE_1 = 1;
const EDGE_2 = 2;
const EDGE_3 = 3;
const EDGE_4 = 4;

/**
 * Pack the four clipped edge ids into one integer so a contact can be matched
 * to the same contact next frame and inherit its accumulated impulse. Without
 * this warm start a stack of ten boxes visibly sinks and springs every frame.
 */
export function featureKey(in1: number, out1: number, in2: number, out2: number): number {
  return in1 | (out1 << 8) | (in2 << 16) | (out2 << 24);
}

export type ContactPoint = {
  x: number;
  y: number;
  separation: number;
  /** Accumulated normal / tangent impulse (real) and normal impulse (pseudo). */
  pn: number;
  pt: number;
  pnb: number;
  key: number;
  /** Cached effective masses and the restitution target, filled in preStep. */
  massN: number;
  massT: number;
  bias: number;
};

export type Manifold = {
  a: Body;
  b: Body;
  /** Unit normal, pointing from A towards B. */
  nx: number;
  ny: number;
  points: ContactPoint[];
  friction: number;
};

type ClipVertex = { x: number; y: number; in1: number; out1: number; in2: number; out2: number };

function cv(): ClipVertex {
  return { x: 0, y: 0, in1: 0, out1: 0, in2: 0, out2: 0 };
}

// Scratch, reused every pair so a 300-body frame allocates nothing.
const incident: ClipVertex[] = [cv(), cv()];
const clip1: ClipVertex[] = [cv(), cv()];
const clip2: ClipVertex[] = [cv(), cv()];

function copyVertex(dst: ClipVertex, src: ClipVertex) {
  dst.x = src.x;
  dst.y = src.y;
  dst.in1 = src.in1;
  dst.out1 = src.out1;
  dst.in2 = src.in2;
  dst.out2 = src.out2;
}

/** The face of `body` most anti-parallel to `nx,ny`, as two world-space vertices. */
function computeIncidentEdge(
  out: ClipVertex[],
  hw: number,
  hh: number,
  px: number,
  py: number,
  c: number,
  s: number,
  nx: number,
  ny: number,
) {
  // Normal into the body's local frame, flipped: we want the face pointing back.
  const lx = -(c * nx + s * ny);
  const ly = -(-s * nx + c * ny);
  const ax = Math.abs(lx);
  const ay = Math.abs(ly);

  let x0: number, y0: number, x1: number, y1: number;
  if (ax > ay) {
    if (lx > 0) {
      x0 = hw;
      y0 = -hh;
      x1 = hw;
      y1 = hh;
      out[0].in2 = EDGE_3;
      out[0].out2 = EDGE_4;
      out[1].in2 = EDGE_4;
      out[1].out2 = EDGE_1;
    } else {
      x0 = -hw;
      y0 = hh;
      x1 = -hw;
      y1 = -hh;
      out[0].in2 = EDGE_1;
      out[0].out2 = EDGE_2;
      out[1].in2 = EDGE_2;
      out[1].out2 = EDGE_3;
    }
  } else {
    if (ly > 0) {
      x0 = hw;
      y0 = hh;
      x1 = -hw;
      y1 = hh;
      out[0].in2 = EDGE_4;
      out[0].out2 = EDGE_1;
      out[1].in2 = EDGE_1;
      out[1].out2 = EDGE_2;
    } else {
      x0 = -hw;
      y0 = -hh;
      x1 = hw;
      y1 = -hh;
      out[0].in2 = EDGE_2;
      out[0].out2 = EDGE_3;
      out[1].in2 = EDGE_3;
      out[1].out2 = EDGE_4;
    }
  }

  out[0].x = px + c * x0 - s * y0;
  out[0].y = py + s * x0 + c * y0;
  out[0].in1 = EDGE_NONE;
  out[0].out1 = EDGE_NONE;
  out[1].x = px + c * x1 - s * y1;
  out[1].y = py + s * x1 + c * y1;
  out[1].in1 = EDGE_NONE;
  out[1].out1 = EDGE_NONE;
}

function clipSegmentToLine(
  out: ClipVertex[],
  input: ClipVertex[],
  nx: number,
  ny: number,
  offset: number,
  clipEdge: number,
): number {
  let n = 0;
  const d0 = nx * input[0].x + ny * input[0].y - offset;
  const d1 = nx * input[1].x + ny * input[1].y - offset;

  if (d0 <= 0) copyVertex(out[n++], input[0]);
  if (d1 <= 0) copyVertex(out[n++], input[1]);

  if (d0 * d1 < 0 && n < 2) {
    const t = d0 / (d0 - d1);
    const v = out[n];
    v.x = input[0].x + t * (input[1].x - input[0].x);
    v.y = input[0].y + t * (input[1].y - input[0].y);
    if (d0 > 0) {
      v.in1 = clipEdge;
      v.out1 = input[0].out1;
      v.in2 = EDGE_NONE;
      v.out2 = input[0].out2;
    } else {
      v.in1 = input[1].in1;
      v.out1 = clipEdge;
      v.in2 = input[1].in2;
      v.out2 = EDGE_NONE;
    }
    n++;
  }
  return n;
}

const REL_TOL = 0.95;
const ABS_TOL = 0.01;

/**
 * Test two boxes. Returns null when they are apart, otherwise a manifold whose
 * normal points from `a` to `b`.
 */
export function collide(a: Body, b: Body): Manifold | null {
  const ca = Math.cos(a.angle);
  const sa = Math.sin(a.angle);
  const cb = Math.cos(b.angle);
  const sb = Math.sin(b.angle);

  const dpx = b.x - a.x;
  const dpy = b.y - a.y;

  // dp expressed in each body's frame (Rᵀ · dp).
  const dax = ca * dpx + sa * dpy;
  const day = -sa * dpx + ca * dpy;
  const dbx = cb * dpx + sb * dpy;
  const dby = -sb * dpx + cb * dpy;

  // Relative rotation of B in A's frame is just R(θb − θa).
  const dc = ca * cb + sa * sb;
  const ds = ca * sb - sa * cb;
  const adc = Math.abs(dc) + 1e-6;
  const ads = Math.abs(ds) + 1e-6;

  // Separation along each of A's face axes.
  const faceAx = Math.abs(dax) - a.hw - (adc * b.hw + ads * b.hh);
  const faceAy = Math.abs(day) - a.hh - (ads * b.hw + adc * b.hh);
  if (faceAx > 0 || faceAy > 0) return null;

  // ...and each of B's. (The abs matrix is symmetric, so the transpose is free.)
  const faceBx = Math.abs(dbx) - b.hw - (adc * a.hw + ads * a.hh);
  const faceBy = Math.abs(dby) - b.hh - (ads * a.hw + adc * a.hh);
  if (faceBx > 0 || faceBy > 0) return null;

  // Pick the axis of least penetration, biased towards keeping the previous
  // choice so a resting box does not flip its reference face frame to frame.
  let axis = 0; // 0:A.x 1:A.y 2:B.x 3:B.y
  let separation = faceAx;
  let nx = dax > 0 ? ca : -ca;
  let ny = dax > 0 ? sa : -sa;

  if (faceAy > REL_TOL * separation + ABS_TOL * a.hh) {
    axis = 1;
    separation = faceAy;
    nx = day > 0 ? -sa : sa;
    ny = day > 0 ? ca : -ca;
  }
  if (faceBx > REL_TOL * separation + ABS_TOL * b.hw) {
    axis = 2;
    separation = faceBx;
    nx = dbx > 0 ? cb : -cb;
    ny = dbx > 0 ? sb : -sb;
  }
  if (faceBy > REL_TOL * separation + ABS_TOL * b.hh) {
    axis = 3;
    separation = faceBy;
    nx = dby > 0 ? -sb : sb;
    ny = dby > 0 ? cb : -cb;
  }

  let fnx: number, fny: number, front: number;
  let snx: number, sny: number, negSide: number, posSide: number;
  const negEdge = EDGE_3;
  const posEdge = EDGE_1;

  if (axis === 0) {
    fnx = nx;
    fny = ny;
    front = a.x * fnx + a.y * fny + a.hw;
    snx = -sa;
    sny = ca;
    const side = a.x * snx + a.y * sny;
    negSide = -side + a.hh;
    posSide = side + a.hh;
    computeIncidentEdge(incident, b.hw, b.hh, b.x, b.y, cb, sb, fnx, fny);
  } else if (axis === 1) {
    fnx = nx;
    fny = ny;
    front = a.x * fnx + a.y * fny + a.hh;
    snx = ca;
    sny = sa;
    const side = a.x * snx + a.y * sny;
    negSide = -side + a.hw;
    posSide = side + a.hw;
    computeIncidentEdge(incident, b.hw, b.hh, b.x, b.y, cb, sb, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx;
    fny = -ny;
    front = b.x * fnx + b.y * fny + b.hw;
    snx = -sb;
    sny = cb;
    const side = b.x * snx + b.y * sny;
    negSide = -side + b.hh;
    posSide = side + b.hh;
    computeIncidentEdge(incident, a.hw, a.hh, a.x, a.y, ca, sa, fnx, fny);
  } else {
    fnx = -nx;
    fny = -ny;
    front = b.x * fnx + b.y * fny + b.hh;
    snx = cb;
    sny = sb;
    const side = b.x * snx + b.y * sny;
    negSide = -side + b.hw;
    posSide = side + b.hw;
    computeIncidentEdge(incident, a.hw, a.hh, a.x, a.y, ca, sa, fnx, fny);
  }

  let np = clipSegmentToLine(clip1, incident, -snx, -sny, negSide, negEdge);
  if (np < 2) return null;
  np = clipSegmentToLine(clip2, clip1, snx, sny, posSide, posEdge);
  if (np < 2) return null;

  const flip = axis >= 2;
  const points: ContactPoint[] = [];
  for (let i = 0; i < 2; i++) {
    const v = clip2[i];
    const sep = fnx * v.x + fny * v.y - front;
    if (sep > 0) continue;
    points.push({
      x: v.x - sep * fnx,
      y: v.y - sep * fny,
      separation: sep,
      pn: 0,
      pt: 0,
      pnb: 0,
      key: flip ? featureKey(v.in2, v.out2, v.in1, v.out1) : featureKey(v.in1, v.out1, v.in2, v.out2),
      massN: 0,
      massT: 0,
      bias: 0,
    });
  }
  if (points.length === 0) return null;

  return {
    a,
    b,
    nx,
    ny,
    points,
    friction: Math.sqrt(a.friction * b.friction),
  };
}

/* ── the world ───────────────────────────────────────────────────────────── */

const SUB_DT = 1 / 120;
/** Never consume more than this much wall clock in one call. */
const MAX_STEP = 1 / 24;
const ITERATIONS = 8;
const POSITION_SLOP = 0.05;
const BIAS_FACTOR = 0.25;
/** Below this closing speed, contacts are treated as resting (no bounce). */
const RESTITUTION_THRESHOLD = 90;
const SLEEP_LINEAR = 4;
const SLEEP_ANGULAR = 0.12;
const SLEEP_FRAMES = 45;
const MAX_SPEED = 6000;
const MAX_ANGULAR = 40;
/** Closing speed at which an impact is worth reporting to sound and light. */
const IMPACT_THRESHOLD = 130;

export type WorldOptions = {
  gravityX?: number;
  gravityY?: number;
};

export class World {
  bodies: Body[] = [];
  gravityX: number;
  gravityY: number;
  /** Impacts registered during the most recent `step`, loudest first. */
  impacts: Impact[] = [];
  /** Set false to let everything float (used by the "zero-g" toggle). */
  gravityOn = true;

  private arbiters = new Map<number, Manifold>();
  private axisOrder: Body[] = [];
  /** Reused between sub-steps: this runs 120 times a second. */
  private seen = new Set<number>();

  constructor(opts: WorldOptions = {}) {
    this.gravityX = opts.gravityX ?? 0;
    this.gravityY = opts.gravityY ?? 2600;
  }

  add(body: Body): Body {
    this.bodies.push(body);
    this.axisOrder.push(body);
    return body;
  }

  remove(body: Body): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    const j = this.axisOrder.indexOf(body);
    if (j >= 0) this.axisOrder.splice(j, 1);
    for (const [key, m] of this.arbiters) {
      if (m.a === body || m.b === body) this.arbiters.delete(key);
    }
  }

  clear(): void {
    this.bodies.length = 0;
    this.axisOrder.length = 0;
    this.arbiters.clear();
    this.impacts.length = 0;
  }

  wake(body: Body): void {
    if (body.static) return;
    body.awake = true;
    body.idle = 0;
  }

  wakeAll(): void {
    for (const b of this.bodies) this.wake(b);
  }

  /** Advance by a wall-clock delta in seconds, in fixed sub-steps. */
  step(dt: number): void {
    this.impacts.length = 0;
    const total = Math.min(Math.max(dt, 0), MAX_STEP);
    let remaining = total;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 8) {
      const h = Math.min(SUB_DT, remaining);
      remaining -= h;
      this.substep(h);
    }
    if (this.impacts.length > 1) this.impacts.sort((p, q) => q.energy - p.energy);
    if (this.impacts.length > 8) this.impacts.length = 8;
  }

  private substep(h: number): void {
    const invH = 1 / h;

    // ── integrate velocities ────────────────────────────────────────────────
    for (const b of this.bodies) {
      b.psx = 0;
      b.psy = 0;
      b.psa = 0;
      if (b.static || !b.awake) continue;
      if (this.gravityOn) {
        b.vx += this.gravityX * h;
        b.vy += this.gravityY * h;
      }
      // Air drag. Not physical for a room, entirely necessary for a page: with
      // no damping a flung word crosses the viewport in three frames and the
      // reader loses it.
      const drag = 1 - 0.4 * h;
      b.vx *= drag;
      b.vy *= drag;
      b.av *= 1 - 1.6 * h;
    }

    this.broadphase();
    this.preStep(invH);
    for (let i = 0; i < ITERATIONS; i++) this.solve();

    // ── integrate positions ─────────────────────────────────────────────────
    for (const b of this.bodies) {
      if (b.static || !b.awake) continue;

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed;
        b.vx *= k;
        b.vy *= k;
      }
      if (b.av > MAX_ANGULAR) b.av = MAX_ANGULAR;
      else if (b.av < -MAX_ANGULAR) b.av = -MAX_ANGULAR;

      b.x += (b.vx + b.psx) * h;
      b.y += (b.vy + b.psy) * h;
      b.angle += (b.av + b.psa) * h;

      if (speed < SLEEP_LINEAR && Math.abs(b.av) < SLEEP_ANGULAR) {
        if (++b.idle > SLEEP_FRAMES) {
          b.awake = false;
          b.vx = 0;
          b.vy = 0;
          b.av = 0;
        }
      } else {
        b.idle = 0;
      }
    }
  }

  /**
   * Sweep and prune along x. The array is kept between frames and insertion
   * sorted, which on a settled pile is O(n) — bodies barely reorder once they
   * stop moving.
   */
  private broadphase(): void {
    const order = this.axisOrder;
    for (let i = 1; i < order.length; i++) {
      const b = order[i];
      const key = b.x - b.hw - b.hh;
      let j = i - 1;
      while (j >= 0 && order[j].x - order[j].hw - order[j].hh > key) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = b;
    }

    const seen = this.seen;
    seen.clear();
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      // Conservative radius: the box's half diagonal, valid at any rotation.
      const ra = Math.hypot(a.hw, a.hh);
      const aMax = a.x + ra;
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        const rb = Math.hypot(b.hw, b.hh);
        if (b.x - rb > aMax) break;
        if (a.static && b.static) continue;
        if (!a.awake && !b.awake) continue;
        if (Math.abs(a.y - b.y) > ra + rb) continue;

        const key = a.id < b.id ? a.id * 0x100000 + b.id : b.id * 0x100000 + a.id;
        seen.add(key);
        const first = a.id < b.id ? a : b;
        const second = a.id < b.id ? b : a;
        const fresh = collide(first, second);
        const old = this.arbiters.get(key);

        if (!fresh) {
          if (old) this.arbiters.delete(key);
          continue;
        }

        // A sleeping body touched by a moving one wakes up. Without this a
        // thrown word passes straight through a settled pile.
        //
        // Both must be dynamic. A static body carries `awake: false` forever, so
        // without that guard every box resting on the floor would read as "one
        // awake, one not" and be woken again on the very frame it fell asleep —
        // nothing would ever settle, and the solver would run at full cost on a
        // completely motionless pile.
        if (!first.static && !second.static && first.awake !== second.awake) {
          this.wake(first);
          this.wake(second);
        }

        if (old) {
          // Warm start: inherit the impulse from the matching contact point.
          for (const p of fresh.points) {
            const prev = old.points.find((q) => q.key === p.key);
            if (prev) {
              p.pn = prev.pn;
              p.pt = prev.pt;
            }
          }
        } else {
          this.registerImpact(fresh);
        }
        this.arbiters.set(key, fresh);
      }
    }

    for (const key of this.arbiters.keys()) {
      if (!seen.has(key)) this.arbiters.delete(key);
    }
  }

  /** A newly formed contact is a collision; note how hard it was. */
  private registerImpact(m: Manifold): void {
    const p = m.points[0];
    const rax = p.x - m.a.x;
    const ray = p.y - m.a.y;
    const rbx = p.x - m.b.x;
    const rby = p.y - m.b.y;
    const dvx = m.b.vx - m.b.av * rby - (m.a.vx - m.a.av * ray);
    const dvy = m.b.vy + m.b.av * rbx - (m.a.vy + m.a.av * rax);
    const vn = dvx * m.nx + dvy * m.ny;
    if (vn > -IMPACT_THRESHOLD) return;
    this.impacts.push({ x: p.x, y: p.y, energy: Math.min(1, -vn / 1800) });
  }

  private preStep(invH: number): void {
    for (const m of this.arbiters.values()) {
      const { a, b } = m;
      const tx = m.ny;
      const ty = -m.nx;

      for (const p of m.points) {
        const rax = p.x - a.x;
        const ray = p.y - a.y;
        const rbx = p.x - b.x;
        const rby = p.y - b.y;

        const rn1 = rax * m.nx + ray * m.ny;
        const rn2 = rbx * m.nx + rby * m.ny;
        let kn = a.im + b.im;
        kn += a.ii * (rax * rax + ray * ray - rn1 * rn1);
        kn += b.ii * (rbx * rbx + rby * rby - rn2 * rn2);
        p.massN = kn > 0 ? 1 / kn : 0;

        const rt1 = rax * tx + ray * ty;
        const rt2 = rbx * tx + rby * ty;
        let kt = a.im + b.im;
        kt += a.ii * (rax * rax + ray * ray - rt1 * rt1);
        kt += b.ii * (rbx * rbx + rby * rby - rt2 * rt2);
        p.massT = kt > 0 ? 1 / kt : 0;

        // Restitution target, sampled before any impulse is applied. Below the
        // threshold a contact is "resting" and gets no bounce at all, which is
        // what stops a settled pile buzzing.
        const dvx = b.vx - b.av * rby - (a.vx - a.av * ray);
        const dvy = b.vy + b.av * rbx - (a.vy + a.av * rax);
        const vn = dvx * m.nx + dvy * m.ny;
        const e = Math.min(a.restitution, b.restitution);
        p.bias = vn < -RESTITUTION_THRESHOLD ? -e * vn : 0;

        // How fast this contact wants to push apart to clear its overlap. Spent
        // entirely in the pseudo-velocity field, never in the real one.
        const overlap = -(p.separation + POSITION_SLOP);
        p.pnb = overlap > 0 ? BIAS_FACTOR * invH * overlap : 0;

        // Warm start: replay last frame's impulse before solving.
        const px = p.pn * m.nx + p.pt * tx;
        const py = p.pn * m.ny + p.pt * ty;
        a.vx -= a.im * px;
        a.vy -= a.im * py;
        a.av -= a.ii * (rax * py - ray * px);
        b.vx += b.im * px;
        b.vy += b.im * py;
        b.av += b.ii * (rbx * py - rby * px);
      }
    }
  }

  private solve(): void {
    for (const m of this.arbiters.values()) {
      const { a, b } = m;
      const tx = m.ny;
      const ty = -m.nx;

      for (const p of m.points) {
        const rax = p.x - a.x;
        const ray = p.y - a.y;
        const rbx = p.x - b.x;
        const rby = p.y - b.y;

        // ── normal, real velocity ──────────────────────────────────────────
        let dvx = b.vx - b.av * rby - (a.vx - a.av * ray);
        let dvy = b.vy + b.av * rbx - (a.vy + a.av * rax);
        const vn = dvx * m.nx + dvy * m.ny;

        let dPn = p.massN * (-vn + p.bias);
        const pn0 = p.pn;
        p.pn = Math.max(pn0 + dPn, 0);
        dPn = p.pn - pn0;

        let px = dPn * m.nx;
        let py = dPn * m.ny;
        a.vx -= a.im * px;
        a.vy -= a.im * py;
        a.av -= a.ii * (rax * py - ray * px);
        b.vx += b.im * px;
        b.vy += b.im * py;
        b.av += b.ii * (rbx * py - rby * px);

        // ── normal, pseudo velocity (penetration only) ─────────────────────
        // Solved against a separate velocity field so correcting a deep overlap
        // never hands a body real kinetic energy.
        if (p.pnb > 0) {
          const pdvx = b.psx - b.psa * rby - (a.psx - a.psa * ray);
          const pdvy = b.psy + b.psa * rbx - (a.psy + a.psa * rax);
          const pvn = pdvx * m.nx + pdvy * m.ny;
          const dPb = p.massN * (-pvn + p.pnb);
          if (dPb > 0) {
            const bx = dPb * m.nx;
            const by = dPb * m.ny;
            a.psx -= a.im * bx;
            a.psy -= a.im * by;
            a.psa -= a.ii * (rax * by - ray * bx);
            b.psx += b.im * bx;
            b.psy += b.im * by;
            b.psa += b.ii * (rbx * by - rby * bx);
          }
        }

        // ── friction ───────────────────────────────────────────────────────
        dvx = b.vx - b.av * rby - (a.vx - a.av * ray);
        dvy = b.vy + b.av * rbx - (a.vy + a.av * rax);
        const vt = dvx * tx + dvy * ty;

        let dPt = p.massT * -vt;
        const maxPt = m.friction * p.pn;
        const pt0 = p.pt;
        p.pt = Math.max(-maxPt, Math.min(maxPt, pt0 + dPt));
        dPt = p.pt - pt0;

        px = dPt * tx;
        py = dPt * ty;
        a.vx -= a.im * px;
        a.vy -= a.im * py;
        a.av -= a.ii * (rax * py - ray * px);
        b.vx += b.im * px;
        b.vy += b.im * py;
        b.av += b.ii * (rbx * py - rby * px);
      }
    }
  }
}
