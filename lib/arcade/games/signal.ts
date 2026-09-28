import { banner, baseState, clamp, distance, emit, rand, sound, type BaseState, type GameModule, type Point } from "./types";

/**
 * DEAD SIGNAL: arena survival. You are the last live pixel; the noise closes
 * in from every edge.
 *
 * The rules, in the order a player meets them:
 *
 *  - **The beam fires only while you move.** It aims itself at the nearest
 *    enemy, but it is powered by motion: stand still, or push into a wall, and
 *    it goes dark. This is the rule that makes the game losable. Until
 *    2026-09-27 the beam fired on its own and a player who touched nothing
 *    was still alive at ten minutes with a quarter of a million points, and
 *    standing still outlived dodging. Now idling means nothing dies, and the
 *    swarm arrives.
 *  - **Contact costs hull, not the enemy.** Touching an enemy, or one of its
 *    shots, costs a hull point and the chain. The enemy lives: it is knocked
 *    back and staggers for a moment, and you get `HIT_GRACE` seconds of
 *    grace, not the old 1.7, so the same enemy can hit you again if you stay.
 *    Three hull points.
 *  - **Enemies.** Each asks something different of you:
 *    drifters home in (dodge them); shooters keep their distance and fire slow
 *    shots after a visible wind-up (move off the line); chargers wind up,
 *    lock a line and dash along it (step off the line); splitters break into
 *    two fast shards when the beam kills them (be ready for two); tanks are
 *    slow and take `KINDS.tank.hp` hits (keep your distance while it grinds).
 *  - **Waves.** Each wave sends a fixed number. Kill the last of them for a
 *    bonus, a hull point back and a breather. Waves two to five each bring one
 *    new kind, named by the banner that opens the wave and captioned on the
 *    screen for that wave; after five it is more of everything, faster.
 *  - **The pulse.** Space spends `PULSE_COST` charge to hit everything within
 *    `PULSE_RANGE` for three, wipe enemy shots in range and give a moment of
 *    grace. Charge comes back with time and kills. A pulse kill is worth a
 *    flat `PULSE_POINTS`; it never splits a splitter.
 *  - **The chain.** Beam kills in a row, broken by a hit: x2 at fifteen, up
 *    to x4.
 *
 * Pure and deterministic like every module: every roll is the state's own
 * dice, in a fixed order, and nothing touches the DOM, a timer or storage.
 */

export type EnemyKind = "drifter" | "shooter" | "charger" | "splitter" | "shard" | "tank";
export type EnemyMode = "chase" | "windup" | "dash" | "recover";

export type Enemy = Point & {
  id: number;
  kind: EnemyKind;
  hp: number;
  /** Seconds until it next acts: a shooter's next shot, a charger's next wind-up. */
  cooldown: number;
  mode: EnemyMode;
  /** Seconds left in the current wind-up, dash, recovery, or a shard's scatter. */
  modeLeft: number;
  /** A charger's locked dash direction (a unit vector), or the velocity of a knock-back or a shard's scatter. */
  vx: number;
  vy: number;
  /** Seconds of hit flash left, for the drawer. */
  hit: number;
  /** Seconds of stagger left after touching the player: it drifts back and does not chase. */
  stun: number;
};
export type Bullet = Point & { vx: number; vy: number; life: number };
/** An enemy shot: slow, and it costs a hull point. */
export type Shot = Point & { vx: number; vy: number; life: number };
/** A score floating up from a kill. */
export type Pop = Point & { value: number; life: number };

export type SignalState = BaseState & {
  id: "signal";
  /** The wave. */
  level: number;
  lives: number;
  /** Beam kills in a row. */
  combo: number;
  kills: number;
  /** Pulse charge, 0 to 100. A pulse costs 65. */
  charge: number;
  /** Seconds left on the pulse's expanding ring, for the renderer. */
  phase: number;
  player: Point;
  /** Whether the player moved this step, which is whether the beam is live. */
  moving: boolean;
  /** Seconds the player has stood still, for the MOVE TO FIRE hint. */
  still: number;
  /** Holding a direction into a wall: nothing moves, so nothing fires, and the player is told at once. */
  blocked: boolean;
  /** The direction the player last moved in, a unit vector. Shooters lead it in later waves. */
  heading: Point;
  enemies: Enemy[];
  bullets: Bullet[];
  shots: Shot[];
  pops: Pop[];
  nextId: number;
  /** Enemies this wave has still to send. */
  toSpawn: number;
  /** The kind this wave introduces, sent first. */
  intro: EnemyKind | null;
  /** Seconds of quiet left between a cleared wave and the next. */
  breather: number;
  spawnClock: number;
  shotClock: number;
  invincible: number;
};

export const SIGNAL_HULL = 3;
export const PULSE_COST = 65;
export const PULSE_RANGE = 185;
export const PULSE_POINTS = 25;
/** What a pulse does to everything in range. Enough for anything but a tank. */
export const PULSE_DAMAGE = 3;
/** Seconds of grace after a hit. It was 1.7 and an enemy was spent on every touch. */
export const HIT_GRACE = 0.6;
/** Seconds between a cleared wave and the next. */
export const BREATHER = 2.4;
export const PLAYER_SPEED = 235;
export const PLAYER_R = 11;
/** Where the player may go: the world under the HUD band. */
export const ARENA = { x0: 22, x1: 878, y0: 49, y1: 530 } as const;

type KindSpec = { hp: number; speed: number; radius: number; points: number };
export const KINDS: Record<EnemyKind, KindSpec> = {
  drifter: { hp: 1, speed: 66, radius: 12, points: 25 },
  shooter: { hp: 2, speed: 58, radius: 13, points: 50 },
  charger: { hp: 2, speed: 74, radius: 14, points: 50 },
  splitter: { hp: 3, speed: 50, radius: 17, points: 40 },
  shard: { hp: 1, speed: 96, radius: 9, points: 15 },
  tank: { hp: 7, speed: 34, radius: 23, points: 150 },
};

const COUNT = ["NO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"];

/** The wave each kind first comes in on, and the banner line that opens it. Shards come out of splitters. */
export const INTRODUCED: readonly { kind: EnemyKind; wave: number; name: string; line: string }[] = [
  { kind: "drifter", wave: 1, name: "DRIFTERS", line: "MOVE TO FIRE. STAND STILL AND THE BEAM GOES DARK" },
  { kind: "shooter", wave: 2, name: "SHOOTERS", line: "SHOOTERS FIRE BACK. DODGE THE SHOTS" },
  { kind: "charger", wave: 3, name: "CHARGERS", line: "CHARGERS WIND UP, THEN DASH. STEP OFF THE LINE" },
  { kind: "splitter", wave: 4, name: "SPLITTERS", line: "SPLITTERS BREAK IN TWO WHEN THE BEAM KILLS THEM" },
  { kind: "tank", wave: 5, name: "TANKS", line: `TANKS ARE SLOW AND TAKE ${COUNT[KINDS.tank.hp] ?? KINDS.tank.hp} HITS` },
];
const LATER_LINES = ["MORE OF EVERYTHING", "THE NOISE THICKENS", "FASTER NOW", "NO QUIET CHANNELS LEFT", "HOLD THE SIGNAL"];

/** How a shooter behaves: the range it keeps, and the wind-up it shows before a shot. */
const SHOOTER_NEAR = 190, SHOOTER_FAR = 290, SHOOTER_WINDUP = 0.6;
/** How a charger behaves: when it starts a wind-up, how long that is, and the dash. */
const CHARGE_RANGE = 240, CHARGE_WINDUP = 0.7, DASH_TIME = 0.45, DASH_SPEED = 540, RECOVER = 0.8, CHARGE_REST = 1.1;
const KNOCKBACK = 320, STUN = 0.45;

const pad = (n: number) => String(n).padStart(2, "0");
const waveLabel = (n: number) => `WAVE ${pad(n)}`;

/* ── the curve ───────────────────────────────────────────────────────────── */

/** How many enemies wave `n` sends (shards not counted). */
export function waveSize(n: number): number {
  return 10 + 4 * n;
}
/** The most enemies wave `n` allows on screen at once. */
export function screenCap(n: number): number {
  return Math.min(40, 7 + 3 * n);
}
/** Seconds between spawns in wave `n`. */
export function spawnGap(n: number): number {
  return Math.max(0.26, 1.1 - 0.09 * (n - 1));
}
/** How much faster than its base speed everything moves in wave `n`. */
export function pace(n: number): number {
  return Math.min(2, 1 + 0.07 * (n - 1));
}
/** Seconds between beam shots in wave `n`, while moving. */
export function fireGap(n: number): number {
  return Math.max(0.15, 0.22 - 0.007 * (n - 1));
}
/** Seconds between a shooter's shots in wave `n`. */
export function shooterGap(n: number): number {
  return Math.max(1.1, 2.8 - 0.15 * (n - 2));
}
/** How many shots a shooter fires at once in wave `n`: one, then a fan of three from wave six, five from twelve. */
export function shooterFan(n: number): number {
  return n >= 12 ? 5 : n >= 6 ? 3 : 1;
}
function shotSpeed(n: number): number {
  return Math.min(260, 150 + 10 * (n - 2));
}
/** A charger's wind-up in wave `n`: shorter as the waves go, so the line is there to read for less time. */
function chargeWindup(n: number): number {
  return Math.max(0.42, CHARGE_WINDUP - 0.03 * (n - 3));
}

/** Beam kills in a row, as a multiplier: x2 at fifteen, x3 at thirty, x4 at forty-five. */
export function multiplier(s: SignalState): number {
  return Math.min(4, 1 + Math.floor(s.combo / 15));
}

/** The kind wave `n` introduces, if any. */
export function introducedOn(n: number): EnemyKind | null {
  return INTRODUCED.find((k) => k.wave === n && n > 1)?.kind ?? null;
}

/** The line that opens wave `n`. */
export function waveLine(n: number): string {
  return INTRODUCED.find((k) => k.wave === n)?.line ?? LATER_LINES[(n - 6) % LATER_LINES.length];
}

/* ── enemies ─────────────────────────────────────────────────────────────── */

const onScreen = (p: Point) => p.x > 8 && p.x < 892 && p.y > 52 && p.y < 552;

/** The one way an enemy enters the world. */
export function spawnEnemy(s: SignalState, kind: EnemyKind, x: number, y: number): Enemy {
  const e: Enemy = { id: s.nextId++, kind, x, y, hp: KINDS[kind].hp, cooldown: 0, mode: "chase", modeLeft: 0, vx: 0, vy: 0, hit: 0, stun: 0 };
  if (kind === "shooter") e.cooldown = 1.2 + rand(s) * 0.8;
  if (kind === "charger") e.cooldown = 0.4;
  s.enemies.push(e);
  return e;
}

function pickKind(s: SignalState): EnemyKind {
  if (s.intro) {
    const k = s.intro;
    s.intro = null;
    return k;
  }
  const n = s.level;
  // Drifters give way to the harder kinds as the waves go.
  const weights: [EnemyKind, number][] = [
    ["drifter", Math.max(0.45, 1 - 0.06 * (n - 1))],
    ["shooter", n >= 2 ? Math.min(0.6, 0.3 + 0.04 * (n - 2)) : 0],
    ["charger", n >= 3 ? Math.min(0.55, 0.28 + 0.04 * (n - 3)) : 0],
    ["splitter", n >= 4 ? 0.3 : 0],
    ["tank", n >= 5 ? Math.min(0.3, 0.12 + 0.02 * (n - 5)) : 0],
  ];
  let roll = rand(s) * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [kind, w] of weights) {
    if (roll < w) return kind;
    roll -= w;
  }
  return "drifter";
}

function spawnAtEdge(s: SignalState) {
  const kind = pickKind(s);
  const side = Math.floor(rand(s) * 4), t = rand(s);
  const x = side === 0 ? -20 : side === 1 ? 920 : 40 + t * 820;
  const y = side === 2 ? 22 : side === 3 ? 580 : 70 + t * 440;
  spawnEnemy(s, kind, x, y);
}

function pop(s: SignalState, at: Point, value: number) {
  s.pops.push({ x: at.x, y: at.y - 14, value, life: 0.8 });
  if (s.pops.length > 10) s.pops.splice(0, s.pops.length - 10);
}

/** A splitter killed by the beam: two shards thrown out sideways, then homing. */
function split(s: SignalState, e: Enemy, from: Point) {
  const d = Math.hypot(from.x, from.y) || 1;
  const px = -from.y / d, py = from.x / d;
  for (const side of [-1, 1]) {
    const shard = spawnEnemy(s, "shard", e.x + px * side * 10, e.y + py * side * 10);
    shard.vx = px * side * 190;
    shard.vy = py * side * 190;
    shard.modeLeft = 0.35;
  }
}

function kill(s: SignalState, e: Enemy, by: "beam" | "pulse", from: Point = { x: 1, y: 0 }) {
  e.hp = 0;
  s.kills++;
  if (by === "beam") {
    const value = KINDS[e.kind].points * multiplier(s);
    s.score += value;
    s.combo++;
    s.charge = Math.min(100, s.charge + 2);
    pop(s, e, value);
    if (e.kind === "splitter") split(s, e, from);
  } else {
    s.score += PULSE_POINTS;
  }
  emit(s, e, true, e.kind === "tank" ? 28 : e.kind === "shard" ? 6 : 10);
  sound(s, "score", e, e.kind === "tank" ? 0.9 : undefined);
}

function hurt(s: SignalState, at: Point) {
  s.lives--;
  s.combo = 0;
  s.flash = 0.35;
  s.invincible = HIT_GRACE;
  emit(s, s.player, true, 30);
  sound(s, "hurt", at);
  if (s.lives <= 0) s.over = true;
}

/** Contact: the player pays, the enemy is knocked back and staggers, and lives. */
function touch(s: SignalState, e: Enemy) {
  hurt(s, s.player);
  const d = distance(e, s.player) || 1;
  const push = e.kind === "tank" ? KNOCKBACK * 0.4 : KNOCKBACK;
  e.vx = ((e.x - s.player.x) / d) * push;
  e.vy = ((e.y - s.player.y) / d) * push;
  e.stun = STUN;
  if (e.mode === "dash" || e.mode === "windup") { e.mode = "recover"; e.modeLeft = RECOVER; }
}

function fireShot(s: SignalState, e: Enemy) {
  const n = s.level;
  // From wave six a shooter leads a moving player a little, so circling the arena is not a hiding place.
  const lead = s.moving ? Math.min(0.5, 0.1 * Math.max(0, n - 5)) : 0;
  const d0 = distance(e, s.player), speed = shotSpeed(n);
  const t = d0 / speed;
  const tx = s.player.x + s.heading.x * PLAYER_SPEED * t * lead, ty = s.player.y + s.heading.y * PLAYER_SPEED * t * lead;
  const a = Math.atan2(ty - e.y, tx - e.x), fan = shooterFan(n);
  for (let i = 0; i < fan; i++) {
    const da = (i - (fan - 1) / 2) * 0.24;
    s.shots.push({ x: e.x, y: e.y, vx: Math.cos(a + da) * speed, vy: Math.sin(a + da) * speed, life: 5 });
  }
  if (s.shots.length > 80) s.shots.splice(0, s.shots.length - 80);
  sound(s, "hit", e, 0.2);
}

function moveEnemy(s: SignalState, e: Enemy, dt: number) {
  e.hit = Math.max(0, e.hit - dt);
  if (e.stun > 0) {
    e.stun -= dt;
    const k = Math.exp(-7 * dt);
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= k; e.vy *= k;
    return;
  }
  const speed = KINDS[e.kind].speed * pace(s.level);
  const d = distance(e, s.player) || 1;
  const ux = (s.player.x - e.x) / d, uy = (s.player.y - e.y) / d;
  const home = (k = 1) => { e.x += ux * speed * k * dt; e.y += uy * speed * k * dt; };

  switch (e.kind) {
    case "shooter": {
      const side = e.id % 2 ? 1 : -1;
      if (d > SHOOTER_FAR) home();
      else if (d < SHOOTER_NEAR) home(-1);
      else { e.x += -uy * side * speed * 0.8 * dt; e.y += ux * side * speed * 0.8 * dt; }
      if (!onScreen(e)) return;
      e.x = clamp(e.x, 30, 870); e.y = clamp(e.y, 60, 530);
      e.cooldown -= dt;
      e.mode = e.cooldown <= SHOOTER_WINDUP ? "windup" : "chase";
      if (e.cooldown <= 0) {
        fireShot(s, e);
        e.cooldown = shooterGap(s.level) * (0.8 + rand(s) * 0.4);
        e.mode = "chase";
      }
      return;
    }
    case "charger": {
      if (e.mode === "windup") {
        e.modeLeft -= dt;
        if (e.modeLeft <= 0) { e.mode = "dash"; e.modeLeft = DASH_TIME; sound(s, "hit", e, 0.3); }
        return;
      }
      if (e.mode === "dash") {
        const v = DASH_SPEED * Math.min(1.3, pace(s.level));
        e.x += e.vx * v * dt; e.y += e.vy * v * dt;
        e.modeLeft -= dt;
        const wall = e.x < ARENA.x0 || e.x > ARENA.x1 || e.y < ARENA.y0 || e.y > ARENA.y1;
        e.x = clamp(e.x, ARENA.x0, ARENA.x1); e.y = clamp(e.y, ARENA.y0, ARENA.y1);
        if (e.modeLeft <= 0 || wall) { e.mode = "recover"; e.modeLeft = RECOVER; }
        return;
      }
      if (e.mode === "recover") {
        e.modeLeft -= dt;
        home(0.3);
        if (e.modeLeft <= 0) { e.mode = "chase"; e.cooldown = CHARGE_REST; }
        return;
      }
      home();
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < CHARGE_RANGE && onScreen(e)) {
        e.mode = "windup"; e.modeLeft = chargeWindup(s.level); e.vx = ux; e.vy = uy;
      }
      return;
    }
    case "shard": {
      if (e.modeLeft > 0) {
        e.modeLeft -= dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        return;
      }
      home();
      return;
    }
    default:
      home();
  }
}

/** Enemies shoulder each other apart, so a swarm reads as a swarm and not one stacked blob. */
function separate(s: SignalState) {
  const es = s.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.mode === "dash") continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.mode === "dash") continue;
      const min = (KINDS[a.kind].radius + KINDS[b.kind].radius) * 0.85;
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0;
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }
  }
}

function nearest(s: SignalState): Enemy | null {
  let best: Enemy | null = null, bestD = Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = distance(e, s.player);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function fireBeam(s: SignalState) {
  const target = nearest(s);
  if (!target) return false;
  const d = distance(target, s.player) || 1;
  s.bullets.push({ ...s.player, vx: ((target.x - s.player.x) / d) * 580, vy: ((target.y - s.player.y) / d) * 580, life: 1.6 });
  return true;
}

/* ── the module ──────────────────────────────────────────────────────────── */

export const signal: GameModule<SignalState> = {
  id: "signal",
  input: "keys",

  create(seed) {
    const s: SignalState = {
      ...baseState("signal", seed),
      level: 1, lives: SIGNAL_HULL, combo: 0, kills: 0, charge: 100, phase: 0,
      player: { x: 450, y: 280 }, moving: false, still: 0, blocked: false, heading: { x: 1, y: 0 },
      enemies: [], bullets: [], shots: [], pops: [], nextId: 1,
      toSpawn: waveSize(1), intro: null, breather: 0, spawnClock: 1.2, shotClock: 0, invincible: 0,
    };
    banner(s, waveLabel(1), waveLine(1), 2.6);
    return s;
  },

  step(s, dt, keys) {
    s.phase = Math.max(0, s.phase - dt);
    s.invincible = Math.max(0, s.invincible - dt);
    for (const p of s.pops) { p.life -= dt; p.y -= 30 * dt; }
    s.pops = s.pops.filter((p) => p.life > 0);

    // The player, and whether that was a move: the beam is live only if it was.
    let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0), dy = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
    const norm = Math.hypot(dx, dy) || 1; dx /= norm; dy /= norm;
    const was = { x: s.player.x, y: s.player.y };
    s.player.x = clamp(s.player.x + dx * PLAYER_SPEED * dt, ARENA.x0, ARENA.x1);
    s.player.y = clamp(s.player.y + dy * PLAYER_SPEED * dt, ARENA.y0, ARENA.y1);
    const moved = Math.hypot(s.player.x - was.x, s.player.y - was.y);
    s.moving = moved > 1e-6;
    s.blocked = (dx !== 0 || dy !== 0) && !s.moving;
    if (s.moving) {
      s.still = 0;
      s.heading = { x: (s.player.x - was.x) / moved, y: (s.player.y - was.y) / moved };
    } else s.still += dt;

    // Waves: a breather after a clear, then the next wave's banner and its new kind first.
    if (s.breather > 0) {
      s.breather -= dt;
      if (s.breather <= 0) {
        s.breather = 0;
        s.level++;
        s.toSpawn = waveSize(s.level);
        s.intro = introducedOn(s.level);
        s.spawnClock = 0.6;
        banner(s, waveLabel(s.level), waveLine(s.level), 2.6);
        sound(s, "start", s.player, 0.4);
      }
    } else if (s.toSpawn <= 0 && s.enemies.length === 0) {
      const bonus = 100 * s.level;
      s.score += bonus;
      const repaired = s.lives < SIGNAL_HULL;
      if (repaired) s.lives++;
      s.breather = BREATHER;
      banner(s, `${waveLabel(s.level)} CLEAR`, repaired ? `+${bonus}. ONE HULL POINT BACK` : `+${bonus}`, 1.8, "small");
      sound(s, "start", s.player);
    }

    s.spawnClock -= dt;
    if (!s.breather && s.toSpawn > 0 && s.spawnClock <= 0 && s.enemies.length < screenCap(s.level)) {
      spawnAtEdge(s);
      s.toSpawn--;
      s.spawnClock = spawnGap(s.level) * (0.75 + rand(s) * 0.5);
    }

    if (s.moving) {
      s.shotClock -= dt;
      if (s.shotClock <= 0 && fireBeam(s)) s.shotClock = fireGap(s.level);
    }

    for (const e of s.enemies) moveEnemy(s, e, dt);
    separate(s);
    for (const e of s.enemies) {
      if (s.over) break;
      if (s.invincible <= 0 && distance(e, s.player) < PLAYER_R + KINDS[e.kind].radius - 3) touch(s, e);
    }

    for (const shot of s.shots) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.x < -20 || shot.x > 920 || shot.y < 30 || shot.y > 580) shot.life = 0;
      else if (!s.over && s.invincible <= 0 && distance(shot, s.player) < PLAYER_R + 4) { shot.life = 0; hurt(s, shot); }
    }

    for (const b of s.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const hit = s.enemies.find((e) => e.hp > 0 && distance(e, b) < KINDS[e.kind].radius + 5);
      if (!hit) continue;
      b.life = 0;
      hit.hp--;
      hit.hit = 0.1;
      if (hit.kind !== "tank" && hit.mode !== "dash") { hit.x += b.vx * 0.008; hit.y += b.vy * 0.008; }
      if (hit.hp <= 0) kill(s, hit, "beam", { x: b.vx, y: b.vy });
      else sound(s, "hit", hit, 0.12);
    }

    s.enemies = s.enemies.filter((e) => e.hp > 0);
    s.bullets = s.bullets.filter((b) => b.life > 0);
    s.shots = s.shots.filter((shot) => shot.life > 0);
    s.charge = Math.min(100, s.charge + dt * 4);
  },

  press(s, key) {
    if (key !== "action" || s.charge < PULSE_COST) return;
    s.charge -= PULSE_COST;
    s.phase = 0.55;
    s.invincible = Math.max(0.5, s.invincible);
    for (const e of s.enemies) {
      const d = distance(e, s.player);
      if (d > PULSE_RANGE) continue;
      e.hp -= PULSE_DAMAGE;
      if (e.hp <= 0) { kill(s, e, "pulse"); continue; }
      e.hit = 0.15;
      e.vx = ((e.x - s.player.x) / (d || 1)) * KNOCKBACK;
      e.vy = ((e.y - s.player.y) / (d || 1)) * KNOCKBACK;
      e.stun = STUN;
      if (e.mode === "dash" || e.mode === "windup") { e.mode = "recover"; e.modeLeft = RECOVER; }
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    s.shots = s.shots.filter((shot) => distance(shot, s.player) > PULSE_RANGE);
    sound(s, "start", s.player);
  },

  hud(s) {
    return {
      lives: { current: Math.max(0, s.lives), max: SIGNAL_HULL, icon: "hull" },
      stage: { label: "WAVE", value: s.level },
      meter: { label: "PULSE", value: s.charge / 100, ready: PULSE_COST / 100 },
    };
  },

  /**
   * Somebody playing, not a servo: keeps moving so the beam stays live, backs
   * away from the swarm, sidesteps shots it notices and a charger's line, drifts
   * home to the centre, and pulses when crowded. It reacts late and sees only
   * what is near, so it dies eventually, which is what a demo should do.
   */
  demo(s, m) {
    const hold = new Set<string>(), press: string[] = [];
    const p = s.player;
    let fx = (450 - p.x) * 0.6, fy = (280 - p.y) * 0.6;
    for (const e of s.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = Math.max(400, dx * dx + dy * dy);
      const w = e.kind === "tank" ? 120000 : 90000;
      fx += (dx / d2) * w;
      fy += (dy / d2) * w;
      if (e.kind === "charger" && e.mode === "windup") {
        // Off the line it is about to dash along, if the player is on it.
        const along = dx * e.vx + dy * e.vy;
        const ox = dx - along * e.vx, oy = dy - along * e.vy, off = Math.hypot(ox, oy) || 1;
        if (along > 0 && off < 50) { fx += (ox / off) * 90; fy += (oy / off) * 90; }
      }
    }
    for (const shot of s.shots) {
      const dx = p.x - shot.x, dy = p.y - shot.y, d = Math.hypot(dx, dy);
      if (d > 110 || d < 1) continue;
      // Sideways to the shot's path, not straight back along it.
      const v = Math.hypot(shot.vx, shot.vy) || 1, nx = -shot.vy / v, ny = shot.vx / v;
      const side = nx * dx + ny * dy >= 0 ? 1 : -1;
      fx += nx * side * 70; fy += ny * side * 70;
    }
    fx += Math.sin(s.time * 3.1) * 40;
    fy += Math.cos(s.time * 2.3) * 40;
    if (fx > 25) hold.add("right");
    else if (fx < -25) hold.add("left");
    if (fy > 25) hold.add("down");
    else if (fy < -25) hold.add("up");
    const close = s.enemies.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 150).length;
    if (close >= 4 && s.charge >= PULSE_COST && s.time - m.lastAct > 1) {
      press.push("action");
      m.lastAct = s.time;
    }
    return { hold, press };
  },
};
