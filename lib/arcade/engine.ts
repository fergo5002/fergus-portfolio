import { panic, type PanicState } from "./games/panic";
import { poker, type PokerState } from "./games/poker";
import { signal, type SignalState } from "./games/signal";
import { advanceBase, GAME_IDS, MAX_STEP, type GameEvent, type GameId, type GameModule, type Hud } from "./games/types";

/**
 * The arcade's registry and dispatcher. Deterministic: no DOM, timers,
 * persistence or network, here or in any module it dispatches to.
 *
 * Each cabinet is one module in `lib/arcade/games/` implementing `GameModule`
 * (see `games/types.ts` for the contract). This file only knows which modules
 * exist and does the parts every step shares, so adding a cabinet is a module,
 * a line in `MODULES`, a drawer in `renderer.ts`, a cabinet in
 * `content/arcade-collection.ts` and an id in `GAME_IDS`, and the type checker
 * names whichever of those is missing.
 */

export { GAME_IDS, WORLD, MAX_STEP } from "./games/types";
export type { GameId, Point, Particle, GameEvent, GameSound, Banner, Hud, BaseState, GameModule } from "./games/types";
export type { SignalState, PokerState, PanicState };

export type GameState = SignalState | PokerState | PanicState;
export type StateOf<Id extends GameId> = Extract<GameState, { id: Id }>;

export const MODULES: { readonly [K in GameId]: GameModule<StateOf<K>> } = { signal, poker, panic };

function moduleOf<S extends GameState>(s: S): GameModule<S> {
  return MODULES[s.id] as unknown as GameModule<S>;
}

export function createGame<Id extends GameId>(id: Id, seed: number): StateOf<Id> {
  return (MODULES[id] as unknown as GameModule<StateOf<Id>>).create(seed);
}

/** One fixed step, capped at `MAX_STEP`, of a run that is still going. */
export function stepGame(s: GameState, delta: number, keys: ReadonlySet<string>): void {
  if (s.over || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(MAX_STEP, delta);
  advanceBase(s, dt);
  moduleOf(s).step(s, dt, keys);
}

export function pressGame(s: GameState, key: string): void {
  if (s.over) return;
  moduleOf(s).press(s, key);
}

export function gameHud(s: GameState): Hud {
  return moduleOf(s).hud(s);
}

export function inputOf(id: GameId): "keys" | "text" {
  return MODULES[id].input;
}

/** What a typing game has typed so far; always empty for a key game. */
export function typedOf(s: GameState): string {
  const typed = moduleOf(s).typed;
  return typed ? typed(s) : "";
}

/** The events a host has not seen yet, oldest first. */
export function eventsSince(s: GameState, seq: number): GameEvent[] {
  return s.events.filter((e) => e.seq > seq);
}

export function lastEvent(s: GameState): GameEvent | null {
  return s.events.length ? s.events[s.events.length - 1] : null;
}

/** Every known id, as a type guard for strings that came from outside. */
export function isGameId(id: string): id is GameId {
  return (GAME_IDS as readonly string[]).includes(id);
}
