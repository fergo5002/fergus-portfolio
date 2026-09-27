import { createGame, MODULES, pressGame, stepGame, type GameId, type GameState } from "./engine";
import type { DemoMemory, DemoPlan } from "./games/types";

/**
 * Attract mode: the cabinet plays itself until somebody walks up.
 *
 * A real arcade demos its games on a loop, and that is the one thing that
 * makes a row of cabinets read as machines rather than posters. The demo is
 * the real engine with an unattended player: deterministic, DOM-free, and
 * deliberately imperfect. A servo that never misses reads as a screensaver;
 * a hand that wobbles, keeps the wrong card now and then, and dies eventually
 * reads as somebody playing. Each module writes its own player (`demo` in
 * `lib/arcade/games/<id>.ts`); this file runs it.
 *
 * It runs at the engine's fixed 60Hz step through `step(dt)`, so the gallery
 * can drive every cabinet from the site's one frame clock without any of them
 * owning a timer.
 *
 * It also remembers which keys it just used (`lit`), so the how-to-play card
 * can light the keycap under the demo's finger at the moment the demo acts.
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

export type AttractPlan = DemoPlan;
export type AttractMemory = DemoMemory;

export function createAttractMemory(): AttractMemory {
  return { lastAct: -10, flag: false, mark: -1 };
}

const TICK = 1 / 60;
const HOLD_AFTER_OVER = 2.4;
/** How long a keycap stays lit after a press, and after a held key is let go. */
export const LIT_PRESS = 0.35;
export const LIT_HOLD = 0.12;

/** The keys an unattended player holds and presses this tick. */
export function attractPlan(s: GameState, rng: Rng, memory: AttractMemory): AttractPlan {
  if (s.over) return { hold: new Set(), press: [] };
  return (MODULES[s.id].demo as (state: GameState, m: AttractMemory, r: Rng) => AttractPlan)(s, memory, rng);
}

/** The keycap a key lights. Every letter a typing demo types lights the one "type" cap. */
export function capOf(key: string): string {
  return key.startsWith("char:") ? "type" : key;
}

export type Attract = {
  readonly id: GameId;
  state: GameState;
  /** How many demos have finished and been dealt again. */
  restarts: number;
  /** Seconds of light left on each keycap the demo has touched. */
  lit: Map<string, number>;
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
    lit: new Map(),
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      acc = Math.min(acc + dt, 0.25);
      while (acc >= TICK) {
        acc -= TICK;
        tick();
      }
    },
  };
  function light(key: string, seconds: number) {
    const cap = capOf(key);
    attract.lit.set(cap, Math.max(attract.lit.get(cap) ?? 0, seconds));
  }
  function tick() {
    for (const [cap, left] of attract.lit) {
      if (left <= TICK) attract.lit.delete(cap);
      else attract.lit.set(cap, left - TICK);
    }
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
    for (const key of plan.press) {
      pressGame(s, key);
      light(key, LIT_PRESS);
    }
    for (const key of plan.hold) light(key, LIT_HOLD);
    stepGame(s, TICK, plan.hold);
  }
  return attract;
}
