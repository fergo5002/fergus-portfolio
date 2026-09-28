import { describe, expect, it } from "vitest";
import { screenCopy } from "@/content/arcade-collection";
import { createGame } from "../engine";
import { spawnEnemy, type SignalState } from "../games/signal";
import { GREEN_PHOSPHOR } from "../theme";
import { paletteFor, type Pen } from "./kit";
import { captionOf, drawSignal, HINT_AFTER } from "./signal";

/**
 * Dead Signal's drawer, through a recording context: every string drawn,
 * every colour set, and every point a path went through. What this proves is
 * what the drawer says and where it draws its telegraphs; what it looks like
 * is the screenshots' job.
 */

type Drawn = { value: string; x: number; y: number };
function recorder() {
  const texts: Drawn[] = [], colours = new Set<string>(), points: { x: number; y: number }[] = [];
  const target: Record<string, unknown> = { canvas: { width: 900, height: 560 } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods: Record<string, (...a: any[]) => unknown> = {
    fillText: (value: string, x: number, y: number) => { texts.push({ value: String(value), x, y }); },
    moveTo: (x: number, y: number) => { points.push({ x, y }); },
    lineTo: (x: number, y: number) => { points.push({ x, y }); },
    measureText: () => ({ width: 10 }),
  };
  const c = new Proxy(target, {
    get: (t, prop: string) => (prop in t ? t[prop] : methods[prop] ?? (() => undefined)),
    set: (t, prop: string, value) => {
      if ((prop === "fillStyle" || prop === "strokeStyle") && typeof value === "string") colours.add(value);
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const pen: Pen = { c, p: paletteFor(GREEN_PHOSPHOR), theme: GREEN_PHOSPHOR };
  return { pen, texts, colours, points };
}

function quiet(seed = 1): SignalState {
  const s = createGame("signal", seed);
  s.banner = null;
  return s;
}

describe("Dead Signal's drawer", () => {
  it("paints only the palette, with every kind in every mode on screen", () => {
    const s = quiet();
    for (const [i, kind] of (["drifter", "shooter", "charger", "splitter", "shard", "tank"] as const).entries()) spawnEnemy(s, kind, 120 + i * 120, 140);
    const [, shooter, charger, , shard, tank] = s.enemies;
    shooter.mode = "windup"; shooter.cooldown = 0.3;
    charger.mode = "windup"; charger.vx = 1; charger.vy = 0;
    shard.hit = 0.1; tank.hp = 3; tank.stun = 0.2;
    const dasher = spawnEnemy(s, "charger", 300, 400);
    dasher.mode = "dash"; dasher.vx = 0; dasher.vy = -1;
    spawnEnemy(s, "charger", 500, 400).mode = "recover";
    s.shots = [{ x: 400, y: 300, vx: 100, vy: 0, life: 2 }];
    s.bullets = [{ x: 420, y: 280, vx: 580, vy: 0, life: 1 }];
    s.pops = [{ x: 300, y: 200, value: 50, life: 0.5 }];
    s.still = 2; s.combo = 20; s.phase = 0.3; s.invincible = 0.3; s.level = 5;
    const palette = new Set(Object.values(paletteFor(GREEN_PHOSPHOR)));
    for (const layout of ["wide", "tall"] as const) {
      const rec = recorder();
      drawSignal(rec.pen, s, true, layout);
      for (const colour of rec.colours) expect(palette.has(colour), `${layout} painted ${colour}`).toBe(true);
      expect(rec.texts.length).toBeGreaterThan(0);
    }
  });

  it("tells a player who has stood still to move, and never one who is moving, nor an attract screen", () => {
    const s = quiet();
    s.still = HINT_AFTER + 0.1;
    let rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(rec.texts.map((t) => t.value)).toContain(screenCopy.signalHint);
    rec = recorder();
    drawSignal(rec.pen, s, false);
    expect(rec.texts.map((t) => t.value)).not.toContain(screenCopy.signalHint);
    s.still = 0; s.moving = true;
    rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(rec.texts.map((t) => t.value)).not.toContain(screenCopy.signalHint);
    // Pushing into a wall: a key is held but nothing moves, so the beam is dark, and it says so at once.
    s.moving = false; s.blocked = true;
    rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(rec.texts.map((t) => t.value)).toContain(screenCopy.signalHint);
  });

  it("keeps the hint on the glass when the player is against a wall", () => {
    for (const x of [22, 878]) {
      const s = quiet();
      s.player.x = x; s.blocked = true;
      const rec = recorder();
      drawSignal(rec.pen, s, true);
      const hint = rec.texts.find((t) => t.value === screenCopy.signalHint)!;
      const half = (screenCopy.signalHint.length * 20 * 0.5) / 2;
      expect(hint.x - half, `player at ${x}`).toBeGreaterThanOrEqual(0);
      expect(hint.x + half, `player at ${x}`).toBeLessThanOrEqual(900);
    }
  });

  it("captions the kind a wave brings in, on that wave and no other", () => {
    const s = quiet();
    spawnEnemy(s, "shooter", 300, 200);
    spawnEnemy(s, "drifter", 600, 200);
    s.level = 2;
    let rec = recorder();
    drawSignal(rec.pen, s, true);
    const caption = rec.texts.filter((t) => t.value === captionOf("shooter"));
    expect(caption).toHaveLength(1);
    expect(caption[0].x).toBe(300);
    expect(caption[0].y).toBeLessThan(200);
    s.level = 3;
    rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(rec.texts.map((t) => t.value)).not.toContain(captionOf("shooter"));
  });

  it("draws a winding-up charger's line out along the way it will dash", () => {
    const s = quiet();
    const e = spawnEnemy(s, "charger", 200, 300);
    const far = (pts: { x: number; y: number }[]) => pts.some((q) => q.x > 380 && Math.abs(q.y - 300) < 1);
    let rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(far(rec.points)).toBe(false);
    e.mode = "windup"; e.vx = 1; e.vy = 0; e.modeLeft = 0.5;
    rec = recorder();
    drawSignal(rec.pen, s, true);
    expect(far(rec.points)).toBe(true);
  });
});
