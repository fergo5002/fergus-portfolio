import { describe, expect, it } from "vitest";
import { createAttract } from "../attract";
import { createGame, gameHud, pressGame, stepGame } from "../engine";
import { ARENA, HIT_GRACE, INTRODUCED, KINDS, multiplier, PLAYER_SPEED, PULSE_RANGE, SIGNAL_HULL, spawnEnemy, type SignalState } from "./signal";

const TICK = 1 / 60;
const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const median = (xs: number[]) => {
  const a = [...xs].sort((p, q) => p - q), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** A player who never touches a key, until the run ends or `seconds` pass. */
function idle(seed: number, seconds: number) {
  const s = createGame("signal", seed);
  for (let i = 0; i < seconds * 60 && !s.over; i++) stepGame(s, TICK, new Set());
  return s;
}

/** The attract bot, the cabinet's own unattended player, until its first run ends or `seconds` pass. */
function attractRun(seed: number, seconds: number) {
  const a = createAttract("signal", seed);
  for (let i = 0; i < seconds * 60; i++) {
    a.step(TICK);
    if (a.state.over) return a.state.time;
  }
  return Infinity;
}

/**
 * The rebalance of 2026-09-27. Before it, a player who touched nothing was
 * still alive at ten minutes on every seed measured, with a quarter of a
 * million points, and standing still outlived the attract bot's dodging.
 * These hold the game to being losable, and to rewarding play over idling.
 */
describe("Dead Signal can be lost", () => {
  it("an idle player loses within thirty seconds of game time, on twenty seeds", () => {
    for (const seed of SEEDS) {
      const s = idle(seed, 30);
      expect(s.over, `seed ${seed}: still alive at ${s.time.toFixed(1)}s with ${s.score} points`).toBe(true);
    }
  });

  it("an idle player scores next to nothing, because the beam only fires while you move", () => {
    for (const seed of SEEDS) expect(idle(seed, 30).score, `seed ${seed}`).toBeLessThan(100);
  });

  it("the attract bot loses within four minutes on twenty seeds, and dodging outlives standing still", () => {
    const bot = SEEDS.map((seed) => attractRun(seed, 240));
    const still = SEEDS.map((seed) => idle(seed, 240).time);
    expect(Math.max(...bot), `bot survival: ${bot.map((t) => t.toFixed(0)).join(", ")}`).toBeLessThan(240);
    expect(median(bot), `bot median ${median(bot)} against idle median ${median(still)}`).toBeGreaterThan(3 * median(still));
  });

  it("touching an enemy costs a hull point and leaves the enemy alive, and the grace after a hit is short", () => {
    const s = createGame("signal", 3);
    while (!s.enemies.length) stepGame(s, TICK, new Set());
    const e = s.enemies[0], hp = e.hp;
    e.x = s.player.x + 5; e.y = s.player.y;
    stepGame(s, TICK, new Set());
    expect(s.lives).toBe(2);
    expect(s.enemies).toContain(e);
    expect(e.hp).toBe(hp);
    // Well under the old 1.7 seconds: the same enemy back on the player costs another point.
    for (let i = 0; i < 0.75 * 60; i++) stepGame(s, TICK, new Set());
    e.x = s.player.x + 5; e.y = s.player.y;
    stepGame(s, TICK, new Set());
    expect(s.lives).toBe(1);
    expect(s.enemies).toContain(e);
  });
});

describe("Dead Signal's waves", () => {
  it("bring in four different kinds of enemy by wave five", () => {
    // A player nothing can touch who clears the screen every tick: only the spawner and the waves are under test.
    const s = createGame("signal", 11);
    const firstSeen = new Map<unknown, number>();
    for (let i = 0; i < 400 * 60 && s.level <= 5; i++) {
      stepGame(s, TICK, new Set());
      for (const e of s.enemies) if (!firstSeen.has(e.kind)) firstSeen.set(e.kind, s.level);
      s.enemies = [];
      s.lives = 3;
    }
    const byFive = [...firstSeen].filter(([, wave]) => wave <= 5).map(([kind]) => kind);
    expect(byFive.length, `kinds seen by wave 5: ${JSON.stringify([...firstSeen])}`).toBeGreaterThanOrEqual(4);
  });
});

/** A game with nothing on screen and nothing due to spawn, for one rule at a time. */
function quiet(seed: number) {
  const s = createGame("signal", seed);
  s.spawnClock = 999;
  return s;
}
function steps(s: SignalState, seconds: number, keys: ReadonlySet<string> = new Set(), until?: () => boolean) {
  for (let i = 0; i < Math.round(seconds * 60) && !s.over; i++) {
    stepGame(s, TICK, keys);
    if (until?.()) return true;
  }
  return false;
}

/**
 * The rules that survived the rebalance, pinned since the module moved out of
 * the engine. Only their fixtures changed: an enemy is now made by
 * `spawnEnemy` with a named kind, and a wave now ends when it is cleared
 * rather than on a twenty-second clock.
 */
describe("Dead Signal", () => {
  it("a pulse spends charge and clears only the enemies within its range", () => {
    const s = createGame("signal", 1);
    spawnEnemy(s, "shooter", 460, 280); spawnEnemy(s, "shooter", 800, 280);
    pressGame(s, "action");
    expect(s.enemies).toHaveLength(1); expect(s.enemies[0].x).toBe(800); expect(s.charge).toBe(35); expect(s.score).toBe(25);
    pressGame(s, "action"); expect(s.charge).toBe(35);
  });

  it("lights a pulse on the player and a kill where the enemy died, in world pixels", () => {
    const s = createGame("signal", 1);
    spawnEnemy(s, "drifter", 470, 290);
    pressGame(s, "action");
    expect(s.events.at(-1)).toMatchObject({ sound: "start", at: { x: 450, y: 280 } });
    const t = createGame("signal", 2);
    spawnEnemy(t, "drifter", 700, 400);
    t.bullets = [{ x: 700, y: 400, vx: 0, vy: 0, life: 1 }];
    t.shotClock = 10;
    stepGame(t, 1 / 60, new Set());
    const kill = t.events.at(-1)!;
    expect(kill.sound).toBe("score");
    expect(kill.at.x).toBeGreaterThan(650); expect(kill.at.y).toBeGreaterThan(350);
  });

  it("loses a hull point on contact, flashes, and ends at zero", () => {
    const s = createGame("signal", 3);
    s.lives = 1;
    spawnEnemy(s, "drifter", s.player.x + 5, s.player.y);
    stepGame(s, 1 / 60, new Set());
    expect(s.lives).toBe(0);
    expect(s.over).toBe(true);
    expect(s.events.at(-1)?.sound).toBe("hurt");
  });

  it("announces each new wave with a banner", () => {
    const s = createGame("signal", 4);
    expect(s.banner?.text).toBe("WAVE 01");
    s.enemies = []; s.toSpawn = 0;
    stepGame(s, TICK, new Set());
    expect(s.banner?.text).toBe("WAVE 01 CLEAR");
    steps(s, 3, new Set(), () => s.level === 2);
    expect(s.level).toBe(2);
    expect(s.banner?.text).toBe("WAVE 02");
  });

  it("shows hull as icons, the wave as the stage and the pulse charge as the meter", () => {
    const s = createGame("signal", 5);
    s.charge = 50;
    expect(gameHud(s)).toEqual({
      lives: { current: 3, max: 3, icon: "hull" },
      stage: { label: "WAVE", value: 1 },
      meter: { label: "PULSE", value: 0.5, ready: 0.65 },
    });
  });
});

describe("Dead Signal's beam", () => {
  it("fires only while the player moves, and not while pushing into a wall", () => {
    const s = quiet(6);
    const e = spawnEnemy(s, "tank", 450, 120);
    steps(s, 1);
    expect(s.bullets).toHaveLength(0);
    expect(e.hp).toBe(KINDS.tank.hp);
    expect(s.still).toBeGreaterThan(0.9);
    steps(s, 0.5, new Set(["right"]));
    expect(s.bullets.length + (KINDS.tank.hp - e.hp)).toBeGreaterThan(0);
    expect(s.still).toBe(0);
    // Holding left against the left wall moves nothing, so the beam stays dark.
    const w = quiet(7);
    w.player.x = ARENA.x0;
    spawnEnemy(w, "tank", 300, 120);
    steps(w, 1, new Set(["left"]));
    expect(w.bullets).toHaveLength(0);
    expect(w.moving).toBe(false);
    expect(w.blocked).toBe(true);
    steps(w, 0.1, new Set(["up", "left"]));
    expect(w.blocked).toBe(false);
  });
});

describe("Dead Signal's enemies", () => {
  it("a shooter keeps its distance, winds up, then fires a shot slower than the player that costs a hull point", () => {
    const s = quiet(8);
    const e = spawnEnemy(s, "shooter", 450, 100);
    let windup = false;
    expect(steps(s, 4, new Set(), () => { windup ||= e.mode === "windup"; return s.shots.length > 0; })).toBe(true);
    expect(windup).toBe(true);
    const shot = s.shots[0];
    expect(Math.hypot(shot.vx, shot.vy)).toBeLessThan(PLAYER_SPEED);
    const toPlayer = Math.atan2(s.player.y - shot.y, s.player.x - shot.x), heading = Math.atan2(shot.vy, shot.vx);
    expect(Math.abs(toPlayer - heading)).toBeLessThan(0.05);
    expect(Math.hypot(e.x - s.player.x, e.y - s.player.y)).toBeGreaterThan(150);
    const lives = s.lives;
    steps(s, 3, new Set(), () => s.lives < lives);
    expect(s.lives).toBe(lives - 1);
  });

  it("a charger locks a line when it winds up, holds still, then dashes along that line", () => {
    const s = quiet(9);
    s.shotClock = 999; // the beam stays out of it: this is about the charger
    const e = spawnEnemy(s, "charger", 650, 280);
    steps(s, 2, new Set(), () => e.mode === "windup");
    expect(e.mode).toBe("windup");
    expect(e.vx).toBeLessThan(-0.99);
    const from = { x: e.x, y: e.y };
    // The player steps off the line; the charger dashes along it anyway.
    steps(s, 2, new Set(["up"]), () => e.mode === "dash");
    expect(e.mode).toBe("dash");
    expect(Math.hypot(e.x - from.x, e.y - from.y)).toBeLessThan(1);
    steps(s, 0.2, new Set(["up"]));
    expect(from.x - e.x).toBeGreaterThan(80);
    expect(Math.abs(e.y - from.y)).toBeLessThan(1);
    expect(s.lives).toBe(SIGNAL_HULL);
  });

  it("a splitter breaks into two shards when the beam kills it, and a pulse burns it whole", () => {
    const s = quiet(10);
    const e = spawnEnemy(s, "splitter", 700, 280);
    e.hp = 1;
    s.bullets = [{ x: 700, y: 280, vx: 580, vy: 0, life: 1 }];
    stepGame(s, TICK, new Set());
    expect(s.enemies.map((q) => q.kind)).toEqual(["shard", "shard"]);
    const t = quiet(10);
    spawnEnemy(t, "splitter", 500, 280);
    pressGame(t, "action");
    expect(t.enemies).toHaveLength(0);
  });

  it("a tank takes every one of its hits from the beam, and a pulse only staggers it", () => {
    expect(KINDS.tank.hp).toBeGreaterThanOrEqual(5);
    const s = quiet(11);
    const e = spawnEnemy(s, "tank", 700, 280);
    for (let i = 0; i < KINDS.tank.hp - 1; i++) {
      s.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1 });
      stepGame(s, TICK, new Set());
    }
    expect(s.enemies).toContain(e);
    expect(e.hp).toBe(1);
    s.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1 });
    stepGame(s, TICK, new Set());
    expect(s.enemies).not.toContain(e);
    const t = quiet(11);
    const tank = spawnEnemy(t, "tank", 520, 280);
    pressGame(t, "action");
    expect(t.enemies).toContain(tank);
    expect(tank.stun).toBeGreaterThan(0);
    steps(t, 0.3);
    expect(tank.x).toBeGreaterThan(530);
  });

  it("a pulse wipes the enemy shots within its range and leaves the rest", () => {
    const s = quiet(12);
    s.shots = [{ x: 500, y: 280, vx: -100, vy: 0, life: 3 }, { x: 450 + PULSE_RANGE + 40, y: 280, vx: -100, vy: 0, life: 3 }];
    pressGame(s, "action");
    expect(s.shots).toHaveLength(1);
  });

  it("gives a grace after a hit of well under a second", () => {
    expect(HIT_GRACE).toBeLessThan(1);
  });
});

describe("Dead Signal's waves, one at a time", () => {
  it("open waves two to five with a banner naming the new kind, and send that kind first", () => {
    const s = createGame("signal", 13);
    for (const { kind, wave, name } of INTRODUCED.filter((k) => k.wave > 1)) {
      s.enemies = []; s.toSpawn = 0;
      steps(s, 4, new Set(), () => s.level === wave);
      expect(s.level).toBe(wave);
      expect(s.banner?.text).toBe(`WAVE 0${wave}`);
      expect(s.banner?.sub).toContain(name);
      steps(s, 3, new Set(), () => s.enemies.length > 0);
      expect(s.enemies[0]?.kind).toBe(kind);
    }
  });

  it("pay a bonus for a cleared wave and give a hull point back", () => {
    const s = createGame("signal", 14);
    s.lives = 1; s.enemies = []; s.toSpawn = 0;
    stepGame(s, TICK, new Set());
    expect(s.score).toBe(100);
    expect(s.lives).toBe(2);
    expect(s.banner?.sub).toContain("HULL");
  });

  it("multiply beam kills from fifteen in a row, and a hit breaks the chain", () => {
    const s = quiet(15);
    s.combo = 15;
    expect(multiplier(s)).toBe(2);
    spawnEnemy(s, "drifter", 700, 280);
    s.bullets = [{ x: 700, y: 280, vx: 0, vy: 0, life: 1 }];
    stepGame(s, TICK, new Set());
    expect(s.score).toBe(KINDS.drifter.points * 2);
    spawnEnemy(s, "drifter", s.player.x + 5, s.player.y);
    stepGame(s, TICK, new Set());
    expect(s.combo).toBe(0);
  });
});
