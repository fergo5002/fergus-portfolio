import { createGame, pressGame, stepGame, type GameId, type GameState } from "./engine";
import { evaluateHand } from "./poker-rules";

/**
 * Attract mode: the cabinet plays itself until somebody walks up.
 *
 * A real arcade demos its games on a loop, and that is the one thing that
 * makes a row of cabinets read as machines rather than posters. The demo is
 * the real engine with an unattended player: deterministic, DOM-free, and
 * deliberately imperfect. A servo that never misses reads as a screensaver;
 * a hand that wobbles, keeps the wrong card now and then, and dies eventually
 * reads as somebody playing.
 *
 * It runs at the engine's fixed 60Hz step through `step(dt)`, so the gallery
 * can drive every cabinet from the site's one frame clock without any of them
 * owning a timer.
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
  /** A two-step decision in flight: poker has toggled its holds and draws next. */
  flag: boolean;
  /** Game time of a moment worth waiting from. */
  mark: number;
};

export function createAttractMemory(): AttractMemory {
  return { lastAct: -10, flag: false, mark: -1 };
}

const TICK = 1 / 60;
const HOLD_AFTER_OVER = 2.4;

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

export function createAttract(id: GameId, seed: number): Attract {
  const rng = seededRng((seed ^ 0x9e3779b9) >>> 0);
  const nextSeed = () => Math.floor(rng() * 0xffffffff) >>> 0;
  let memory = createAttractMemory();
  let acc = 0, overFor = 0;
  const attract: Attract = {
    id,
    state: createGame(id, nextSeed()),
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
        attract.state = createGame(id, nextSeed());
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
