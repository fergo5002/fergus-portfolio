import { createGame, pressGame, stepGame, type GameId, type GameState, type Point } from "./engine";
import { evaluateHand } from "./poker-rules";

/**
 * Attract mode: the cabinet plays itself until somebody walks up.
 *
 * A real arcade demos its games on a loop, and that is the one thing that
 * makes a row of cabinets read as machines rather than posters. The demo is
 * the real engine with an unattended player: deterministic, DOM-free, and
 * deliberately imperfect. A servo that never misses reads as a screensaver;
 * a hand that wobbles, catches the ball on the magnet now and then, and dies
 * eventually reads as somebody playing.
 *
 * Two rules. It never uses the daily dungeon seed, because a demo that showed
 * today's maze would be a spoiler for today's board. And it runs at the
 * engine's fixed 60Hz step through `step(dt)`, so the gallery can drive six of
 * these from the site's one frame clock without any of them owning a timer.
 */

export type Rng = () => number;

/** The engine's own LCG, kept separate so a demo never disturbs a game's dice. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type AttractPlan = { hold: Set<string>; press: string[] };

/** What the unattended player remembers between ticks. */
export type AttractMemory = {
  /** Game time of the last discrete decision, for pacing. */
  lastAct: number;
  /** A per-rally choice: whether to try the magnet catch this time. */
  flag: boolean;
  /** Game time of a moment worth waiting from (the magnet catch). */
  mark: number;
};

export function createAttractMemory(): AttractMemory {
  return { lastAct: -10, flag: false, mark: -1 };
}

const TICK = 1 / 60;
const HOLD_AFTER_OVER = 2.4;
const DIRS: Record<string, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } };
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function dirName(d: Point): string {
  if (d.x > 0) return "right";
  if (d.x < 0) return "left";
  return d.y > 0 ? "down" : "up";
}

function breakpoint(s: GameState, rng: Rng, m: AttractMemory, hold: Set<string>, press: string[]) {
  const b = s.ball;
  if (b.attached) {
    if (s.rally === -1) {
      // Caught on the magnet. Hold it for a beat, then let go: releasing is the launch.
      if (m.mark < 0) m.mark = s.time;
      if (s.time - m.mark < 0.6) hold.add("action");
      else m.flag = false;
      return;
    }
    m.mark = -1;
    if (s.time - m.lastAct > 0.8) {
      press.push("action");
      m.lastAct = s.time;
      m.flag = rng() < 0.3;
    }
    return;
  }
  const aim = b.x + Math.sin(s.time * 2.1) * 26;
  if (s.player.x < aim - 9) hold.add("right");
  else if (s.player.x > aim + 9) hold.add("left");
  if (m.flag && b.vy > 0 && b.y > s.player.y - 90 && s.charge >= 25) hold.add("action");
}

function pong(s: GameState, rng: Rng, m: AttractMemory, hold: Set<string>, press: string[]) {
  const b = s.ball;
  const aim = b.y + Math.sin(s.time * 1.7) * 22;
  if (s.player.y < aim - 10) hold.add("down");
  else if (s.player.y > aim + 10) hold.add("up");
  if (b.vx < 0 && b.x < 170 && s.charge >= 60 && s.time - m.lastAct > 1.5 && rng() < 0.6) {
    press.push("action");
    m.lastAct = s.time;
  }
}

function ouroboros(s: GameState, rng: Rng, press: string[]) {
  const head = s.snake[0];
  if (!head) return;
  const blocked = (p: Point) =>
    p.x < 0 || p.x >= 30 || p.y < 0 || p.y >= 16 || s.snake.some((q) => same(q, p)) || s.snake2.some((q) => same(q, p));
  const freeAround = (p: Point) =>
    Object.values(DIRS).filter((d) => !blocked({ x: p.x + d.x, y: p.y + d.y })).length;
  let best: { name: string; cost: number } | null = null;
  for (const [name, d] of Object.entries(DIRS)) {
    if (d.x === -s.direction.x && d.y === -s.direction.y) continue;
    const next = { x: head.x + d.x, y: head.y + d.y };
    let cost = Math.abs(next.x - s.food.x) + Math.abs(next.y - s.food.y);
    if (blocked(next) && s.phase <= 0) cost += 100;
    else cost += (4 - freeAround(next)) * 3;
    cost += rng() * 0.5;
    if (!best || cost < best.cost) best = { name, cost };
  }
  if (!best) return;
  if (best.cost >= 100 && s.charge >= 65 && s.phase <= 0) press.push("action");
  const chosen = DIRS[best.name];
  if (!same(chosen, s.queued)) press.push(best.name);
}

/** Breadth-first search over the dungeon floor; the first step of the shortest path. */
function firstStep(map: number[][], from: Point, to: Point): Point | null {
  if (same(from, to)) return null;
  const h = map.length, w = map[0]?.length ?? 0;
  const prev = new Map<number, number>();
  const key = (p: Point) => p.y * w + p.x;
  const queue: Point[] = [from];
  prev.set(key(from), -1);
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of Object.values(DIRS)) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (n.y < 0 || n.y >= h || n.x < 0 || n.x >= w || map[n.y][n.x] !== 0 || prev.has(key(n))) continue;
      prev.set(key(n), key(p));
      if (same(n, to)) {
        let cur = key(n);
        while (prev.get(cur) !== key(from)) cur = prev.get(cur)!;
        return { x: cur % w, y: Math.floor(cur / w) };
      }
      queue.push(n);
    }
  }
  return null;
}

function under(s: GameState, rng: Rng, m: AttractMemory, press: string[]) {
  if (s.time - m.lastAct < 0.22) return;
  m.lastAct = s.time;
  const near = s.enemies.filter((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) <= 2.5).length;
  if (near >= 2 && s.charge >= 45) {
    press.push("action");
    return;
  }
  const heart = s.lives <= 3 ? s.hearts.find((h) => Math.abs(h.x - s.player.x) + Math.abs(h.y - s.player.y) <= 8) : undefined;
  const target = heart ?? (s.hasKey ? s.exit : s.food);
  const step = firstStep(s.map, s.player, target);
  const d = step ? { x: step.x - s.player.x, y: step.y - s.player.y } : Object.values(DIRS)[Math.floor(rng() * 4)];
  press.push(dirName(d));
}

function deadSignal(s: GameState, m: AttractMemory, hold: Set<string>, press: string[]) {
  let fx = (450 - s.player.x) * 0.6, fy = (280 - s.player.y) * 0.6;
  for (const e of s.enemies) {
    const dx = s.player.x - e.x, dy = s.player.y - e.y;
    const d2 = Math.max(400, dx * dx + dy * dy);
    fx += (dx / d2) * 90000;
    fy += (dy / d2) * 90000;
  }
  fx += Math.sin(s.time * 3.1) * 40;
  fy += Math.cos(s.time * 2.3) * 40;
  if (fx > 25) hold.add("right");
  else if (fx < -25) hold.add("left");
  if (fy > 25) hold.add("down");
  else if (fy < -25) hold.add("up");
  const close = s.enemies.filter((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < 150).length;
  if (close >= 4 && s.charge >= 65 && s.time - m.lastAct > 1) {
    press.push("action");
    m.lastAct = s.time;
  }
}

/** Which cards a sensible player keeps: pairs and better, then a four-flush, then court cards. */
export function desiredHolds(cards: readonly number[]): boolean[] {
  const ranks = cards.map((c) => (c % 13) + 2), suits = cards.map((c) => Math.floor(c / 13));
  const rankCount = new Map<number, number>();
  for (const r of ranks) rankCount.set(r, (rankCount.get(r) ?? 0) + 1);
  if ([...rankCount.values()].some((n) => n >= 2)) return ranks.map((r) => (rankCount.get(r) ?? 0) >= 2);
  if (evaluateHand([...cards]).rank >= 4) return cards.map(() => true);
  const suitCount = new Map<number, number>();
  for (const su of suits) suitCount.set(su, (suitCount.get(su) ?? 0) + 1);
  const flushSuit = [...suitCount.entries()].find(([, n]) => n >= 4)?.[0];
  if (flushSuit !== undefined) return suits.map((su) => su === flushSuit);
  const court = ranks.map((r) => r >= 11);
  if (court.some(Boolean)) {
    let kept = 0;
    return court.map((keep) => keep && kept++ < 2);
  }
  return cards.map(() => false);
}

function circuitPoker(s: GameState, m: AttractMemory, press: string[]) {
  if (s.time - m.lastAct < 1.15) return;
  m.lastAct = s.time;
  if (s.redraws > 0) {
    const want = desiredHolds(s.cards);
    const toggles = want.map((w, i) => (w !== s.held[i] ? String(i + 1) : null)).filter((k): k is string => k !== null);
    if (toggles.length && !m.flag) {
      press.push(...toggles);
      m.flag = true;
      return;
    }
    m.flag = false;
    press.push("action");
    return;
  }
  m.flag = false;
  press.push("bank");
}

/** The keys an unattended player holds and presses this tick. */
export function attractPlan(s: GameState, rng: Rng, memory: AttractMemory): AttractPlan {
  const hold = new Set<string>(), press: string[] = [];
  if (s.over) return { hold, press };
  switch (s.id) {
    case "bounce":
      breakpoint(s, rng, memory, hold, press);
      break;
    case "pong":
      pong(s, rng, memory, hold, press);
      break;
    case "snake":
      ouroboros(s, rng, press);
      break;
    case "under":
      under(s, rng, memory, press);
      break;
    case "signal":
      deadSignal(s, memory, hold, press);
      break;
    case "poker":
      circuitPoker(s, memory, press);
      break;
  }
  return { hold, press };
}

export type Attract = {
  readonly id: GameId;
  state: GameState;
  /** How many demos have finished and been dealt again. */
  restarts: number;
  /** Advance by a frame's worth of wall time; ticks the engine at its fixed step. */
  step(dt: number): void;
};

export function todaySeed(): number {
  return Number(new Date().toISOString().slice(0, 10).replaceAll("-", "")) >>> 0;
}

export function createAttract(id: GameId, seed: number): Attract {
  const rng = seededRng((seed ^ 0x9e3779b9) >>> 0);
  const nextSeed = () => {
    let s = Math.floor(rng() * 0xffffffff) >>> 0;
    if (id === "under" && s === todaySeed()) s = (s + 1) >>> 0;
    return s;
  };
  let memory = createAttractMemory();
  let acc = 0, overFor = 0;
  const attract: Attract = {
    id,
    state: createGame(id, nextSeed(), "solo"),
    restarts: 0,
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      acc = Math.min(acc + dt, 0.25);
      while (acc >= TICK) {
        acc -= TICK;
        tick();
      }
    },
  };
  function tick() {
    const s = attract.state;
    if (s.over) {
      overFor += TICK;
      if (overFor >= HOLD_AFTER_OVER) {
        attract.state = createGame(id, nextSeed(), "solo");
        memory = createAttractMemory();
        attract.restarts++;
        overFor = 0;
      }
      return;
    }
    const plan = attractPlan(s, rng, memory);
    for (const key of plan.press) pressGame(s, key);
    stepGame(s, TICK, plan.hold);
  }
  return attract;
}
