/**
 * The shape every cabinet's simulation shares.
 *
 * A cabinet is one module in `lib/arcade/games/`, implementing `GameModule`:
 * it makes a state from a seed, advances it one fixed step at a time, takes a
 * key press, says what its HUD shows, and plays itself for attract mode. It
 * never touches the DOM, a timer, storage or the network, and the same seed
 * and the same inputs always give the same state, which is what lets the
 * board issue a receipt for a run and what lets the tests run it in node.
 *
 * Three things a module hands the rest of the machine, all through its state:
 *
 *  - **Events.** `sound(state, "score", at)` appends to `state.events`, a
 *    short ring stamped with a rising `seq`. The room plays each new one
 *    through the synth and lights the tube at `at`, in world pixels. The ring
 *    is capped, so a demo nobody is watching cannot grow it.
 *  - **Banners.** `banner(state, "WAVE 02", "THE NOISE THICKENS")` puts a line
 *    across the screen. The shared chrome draws it, ages it and clears it; a
 *    module only says what it reads.
 *  - **HUD values.** `hud(state)` returns lives, a stage (wave, circuit) and a
 *    meter. The chrome owns layout, type and colour; score and best are drawn
 *    for every game without the module asking.
 *
 * `input: "text"` marks a typing game. The room then gives it a real text
 * input and forwards what the visitor types as `char:<c>` presses and each
 * deletion as `erase`, and mirrors `typed(state)` back into the input.
 */

export const GAME_IDS = ["signal", "poker", "panic"] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Every world is drawn into a 900 by 560 space; the room scales it to fit. */
export const WORLD = { w: 900, h: 560 } as const;

/** The longest step a module is ever given, so a hidden tab cannot teleport anything. */
export const MAX_STEP = 0.05;

/** How many recent events a state keeps. A host reads by `seq`, so older ones are never missed in a frame. */
export const EVENT_RING = 16;

export type Point = { x: number; y: number };
export type Particle = Point & { vx: number; vy: number; life: number; amber: boolean };

export type GameSound = "hit" | "score" | "hurt" | "start";
/** Something that happened: what it sounds like, where it was in world pixels, and how hard. */
export type GameEvent = { seq: number; sound: GameSound; at: Point; energy: number };

/** A line across the screen. `age` and `life` are seconds; the chrome draws it while `age < life`. */
export type Banner = { text: string; sub: string; age: number; life: number; size: "big" | "small" };

export type Hud = {
  /** Hull, hands, integrity: drawn as icons, lit up to `current`. */
  lives?: { current: number; max: number; icon: "hull" | "hand" | "core" };
  /** WAVE 03, CIRCUIT 02. */
  stage?: { label: string; value: number };
  /** A segmented meter, 0 to 1, with the point at which it is ready to spend. */
  meter?: { label: string; value: number; ready?: number };
};

/** Fields every state carries, so the host, the chrome and the boards treat all games alike. */
export type BaseState = {
  id: GameId;
  /** The dice: an LCG state, advanced by `rand`. */
  seed: number;
  time: number;
  score: number;
  over: boolean;
  won: boolean;
  /** Seconds of red frame left after a hit. */
  flash: number;
  particles: Particle[];
  events: GameEvent[];
  eventSeq: number;
  banner: Banner | null;
};

/**
 * How a run was started. `touch` is a phone or tablet run: a typing game may
 * ask a touch keyboard for easier characters and move slower. A module that
 * has no use for it ignores it. It is recorded in the state, never guessed
 * mid-run, so the same seed and the same options always make the same game.
 */
export type GameOptions = { touch?: boolean };

/** What an unattended player remembers between ticks. */
export type DemoMemory = { lastAct: number; flag: boolean; mark: number };
export type DemoPlan = { hold: Set<string>; press: string[] };

export type GameModule<S extends BaseState = BaseState> = {
  readonly id: GameId;
  readonly input: "keys" | "text";
  create(seed: number, options?: GameOptions): S;
  /** One fixed step. The engine has already advanced time, particles, the flash and the banner. */
  step(state: S, dt: number, keys: ReadonlySet<string>): void;
  press(state: S, key: string): void;
  hud(state: S): Hud;
  /** The unattended player: what it holds and presses this tick. Deterministic given `rng`. */
  demo(state: S, memory: DemoMemory, rng: () => number): DemoPlan;
  /** Text games only: what the visitor has typed so far, mirrored into the room's input. */
  typed?(state: S): string;
  /**
   * Text games only: one character its words can contain, lower case. A
   * `char:<c>` press, from the room or the demo, is legitimate exactly when
   * `c` matches, which is what the shared tests hold every demo to.
   */
  readonly typeable?: RegExp;
};

/* ── helpers every module uses ───────────────────────────────────────────── */

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function baseState<Id extends GameId>(id: Id, seed: number): BaseState & { id: Id } {
  return { id, seed: seed >>> 0, time: 0, score: 0, over: false, won: false, flash: 0, particles: [], events: [], eventSeq: 0, banner: null };
}

/** The engine's LCG. The same constants the release shipped, so a seed means what it meant. */
export function rand(s: BaseState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

export function emit(s: BaseState, at: Point, amber = false, count = 16) {
  for (let i = 0; i < count && s.particles.length < 180; i++) {
    const a = rand(s) * Math.PI * 2, v = 30 + rand(s) * 170;
    s.particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + rand(s) * 0.5, amber });
  }
}

const ENERGY: Record<GameSound, number> = { hurt: 0.9, score: 0.6, start: 0.5, hit: 0.35 };

export function sound(s: BaseState, name: GameSound, at: Point, energy = ENERGY[name]) {
  s.eventSeq++;
  s.events.push({ seq: s.eventSeq, sound: name, at: { x: at.x, y: at.y }, energy });
  if (s.events.length > EVENT_RING) s.events.splice(0, s.events.length - EVENT_RING);
}

export function banner(s: BaseState, text: string, sub = "", life = 1.8, size: Banner["size"] = "big") {
  s.banner = { text, sub, age: 0, life, size };
}

/** Time, particles, the hit flash and the banner: the parts of a step no module should have to repeat. */
export function advanceBase(s: BaseState, dt: number) {
  s.time += dt;
  s.flash = Math.max(0, s.flash - dt);
  for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
  s.particles = s.particles.filter(p => p.life > 0);
  if (s.banner) {
    s.banner.age += dt;
    if (s.banner.age >= s.banner.life) s.banner = null;
  }
}
