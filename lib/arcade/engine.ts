import { evaluateHand } from "./poker-rules";

/** Deterministic arcade simulation. No DOM, timers, persistence or network. */
export const WORLD = { w: 900, h: 560 } as const;
export const GAME_IDS = ["bounce", "pong", "snake", "under", "signal", "poker"] as const;
export type GameId = typeof GAME_IDS[number];
export type GameMode = "solo" | "local" | "online";
export type Point = { x: number; y: number };
export type Particle = Point & { vx: number; vy: number; life: number; amber: boolean };
export type Enemy = Point & { hp: number; kind: number; cooldown: number };
export type Brick = Point & { hp: number; maxHp: number };
export type GameState = {
  id: GameId; mode: GameMode; seed: number; time: number; score: number; over: boolean; won: boolean;
  level: number; lives: number; combo: number; charge: number; flash: number; event: number; sound: "hit" | "score" | "hurt" | "start";
  player: Point; rival: Point; ball: Point & { vx: number; vy: number; attached: boolean };
  trail: Point[]; particles: Particle[]; bricks: Brick[]; points: [number, number]; rally: number; serve: number;
  snake: Point[]; snake2: Point[]; direction: Point; direction2: Point; queued: Point; queued2: Point;
  food: Point; moveClock: number; phase: number; phase2: number; charge2: number; snakesAlive: [boolean, boolean];
  map: number[][]; seen: boolean[][]; exit: Point; hasKey: boolean; enemies: Enemy[]; turn: number; hearts: Point[];
  bullets: (Point & { vx: number; vy: number; life: number })[]; spawnClock: number; shotClock: number; invincible: number;
  cards: number[]; deck: number[]; discarded: number[]; held: boolean[]; redraws: number; hands: number; target: number;
  bank: number; handName: string; handPoints: number; message: string; messageTime: number;
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const vec = (key: string): Point | undefined => ({ up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[key];
function random(s: GameState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
function emit(s: GameState, at: Point, amber = false, count = 16) {
  for (let i = 0; i < count && s.particles.length < 180; i++) {
    const a = random(s) * Math.PI * 2, v = 30 + random(s) * 170;
    s.particles.push({ ...at, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + random(s) * 0.5, amber });
  }
}
function sound(s: GameState, name: GameState["sound"]) { s.event++; s.sound = name; }
function message(s: GameState, text: string, seconds = 2) { s.message = text; s.messageTime = seconds; }
function hurt(s: GameState) { s.lives--; s.combo = 0; s.flash = 0.35; sound(s, "hurt"); if (s.lives <= 0) s.over = true; }
function brickField(s: GameState) {
  s.bricks = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) {
    if (s.level % 3 === 2 && (x + y) % 5 === 0) continue;
    const hp = y < Math.min(3, s.level - 1) ? 2 : 1;
    s.bricks.push({ x: 37 + x * 69, y: 80 + y * 30, hp, maxHp: hp });
  }
  s.ball.attached = true; s.ball.vx = 150; s.ball.vy = -330;
  s.ball.x = s.player.x; s.ball.y = s.player.y - 16; s.rally = 0;
}
function placeFood(s: GameState) {
  const free: Point[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 30; x++) {
    const p = { x, y }; if (!s.snake.some(q => same(p, q)) && !s.snake2.some(q => same(p, q))) free.push(p);
  }
  if (!free.length) { s.over = true; s.won = true; return; }
  s.food = free[Math.floor(random(s) * free.length)];
}
function dungeon(s: GameState) {
  const w = 29, h = 17;
  s.map = Array.from({ length: h }, () => Array(w).fill(1));
  const stack = [{ x: 1, y: 1 }]; s.map[1][1] = 0;
  while (stack.length) {
    const p = stack[stack.length - 1];
    const choices = [[0, -2], [2, 0], [0, 2], [-2, 0]].filter(([dx, dy]) => p.x + dx > 0 && p.x + dx < w - 1 && p.y + dy > 0 && p.y + dy < h - 1 && s.map[p.y + dy][p.x + dx] === 1);
    if (!choices.length) { stack.pop(); continue; }
    const [dx, dy] = choices[Math.floor(random(s) * choices.length)];
    s.map[p.y + dy / 2][p.x + dx / 2] = 0; s.map[p.y + dy][p.x + dx] = 0;
    stack.push({ x: p.x + dx, y: p.y + dy });
  }
  // Rooms and loops keep pursuit tactical rather than a single corridor puzzle.
  for (let i = 0; i < 10; i++) {
    const x = 2 + Math.floor(random(s) * (w - 5)), y = 2 + Math.floor(random(s) * (h - 5));
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) s.map[y + dy][x + dx] = 0;
  }
  s.player = { x: 1, y: 1 }; s.exit = { x: w - 2, y: h - 2 }; s.hasKey = false;
  s.seen = s.map.map(row => row.map(() => false)); s.enemies = []; s.hearts = [];
  const floor: Point[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!s.map[y][x] && x + y > 10 && !same({ x, y }, s.exit)) floor.push({ x, y });
  const take = () => floor.splice(Math.floor(random(s) * floor.length), 1)[0];
  s.food = take();
  for (let i = 0; i < Math.min(16, 3 + s.level * 2); i++) s.enemies.push({ ...take(), hp: 1 + Math.floor(s.level / 3), kind: i % 3, cooldown: 0 });
  for (let i = 0; i < 3; i++) s.hearts.push(take());
  reveal(s); message(s, `SECTOR ${String(s.level).padStart(2, "0")} // FIND THE KEY`);
}
function reveal(s: GameState) {
  for (let y = 0; y < s.map.length; y++) for (let x = 0; x < s.map[y].length; x++) if (Math.hypot(x - s.player.x, y - s.player.y) <= 5) s.seen[y][x] = true;
}
function deal(s: GameState) {
  s.deck = Array.from({ length: 52 }, (_, i) => i); s.discarded = [];
  for (let i = 51; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]]; }
  s.cards = s.deck.splice(0, 5); s.held = [false, false, false, false, false]; s.redraws = 2;
  const hand = evaluateHand(s.cards); s.handName = hand.name; s.handPoints = hand.points;
}
export function createGame(id: GameId, seed: number, mode: GameMode = "solo"): GameState {
  const s: GameState = {
    id, mode, seed: seed >>> 0, time: 0, score: 0, over: false, won: false,
    level: 1, lives: id === "under" ? 6 : 3, combo: 0, charge: 100, flash: 0, event: 0, sound: "start",
    player: { x: 450, y: 280 }, rival: { x: 862, y: 280 }, ball: { x: 450, y: 280, vx: 300, vy: 125, attached: false },
    trail: [], particles: [], bricks: [], points: [0, 0], rally: 0, serve: 1.2,
    snake: [{ x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }],
    snake2: mode === "solo" ? [] : [{ x: 23, y: 8 }, { x: 24, y: 8 }, { x: 25, y: 8 }, { x: 26, y: 8 }],
    direction: { x: 1, y: 0 }, direction2: { x: -1, y: 0 }, queued: { x: 1, y: 0 }, queued2: { x: -1, y: 0 },
    food: { x: 14, y: 8 }, moveClock: 0, phase: 0, phase2: 0, charge2: 100, snakesAlive: [true, true],
    map: [], seen: [], exit: { x: 0, y: 0 }, hasKey: false, enemies: [], turn: 0, hearts: [],
    bullets: [], spawnClock: 0, shotClock: 0, invincible: 0,
    cards: [], deck: [], discarded: [], held: [], redraws: 2, hands: 3, target: 180, bank: 0, handName: "", handPoints: 0, message: "", messageTime: 0,
  };
  if (id === "bounce") { s.player.y = WORLD.h - 36; brickField(s); }
  if (id === "pong") s.player.x = 38;
  if (id === "snake") { placeFood(s); s.serve = 2.2; }
  if (id === "under") dungeon(s);
  if (id === "poker") deal(s);
  return s;
}

function breakout(s: GameState, dt: number, keys: ReadonlySet<string>) {
  s.player.x = clamp(s.player.x + ((keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0)) * 570 * dt, 64, 836);
  if (s.ball.attached) { s.ball.x = s.player.x; s.ball.y = s.player.y - 16; if (s.rally === -1 && !keys.has("action")) { pressGame(s, "action"); s.rally = 0; } return; }
  const b = s.ball, oldY = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < 15 || b.x > 885) { b.x = clamp(b.x, 15, 885); b.vx *= -1; sound(s, "hit"); }
  if (b.y < 36) { b.y = 36; b.vy = Math.abs(b.vy); }
  if (b.vy > 0 && b.y >= s.player.y - 17 && oldY <= s.player.y && Math.abs(b.x - s.player.x) < 68) {
    b.y = s.player.y - 18;
    if (keys.has("action") && s.charge >= 25) { b.attached = true; s.rally = -1; s.charge -= 25; message(s, "MAGNET LOCK // RELEASE TO LAUNCH"); }
    else { const a = (b.x - s.player.x) / 68 * 1.08; const speed = Math.min(650, 355 + s.level * 25 + s.combo * 4); b.vx = Math.sin(a) * speed; b.vy = -Math.cos(a) * speed; }
    sound(s, "hit"); emit(s, b, false, 8);
  }
  for (const brick of s.bricks) {
    if (!brick.hp || b.x < brick.x - 7 || b.x > brick.x + 70 || b.y < brick.y - 7 || b.y > brick.y + 29) continue;
    brick.hp--; s.combo++; s.score += (brick.hp ? 10 : 25) * Math.min(5, 1 + Math.floor(s.combo / 8));
    if (oldY < brick.y || oldY > brick.y + 22) {
      b.vy *= -1; b.y = b.vy < 0 ? brick.y - 7.1 : brick.y + 29.1;
    } else { b.vx *= -1; b.x = b.vx < 0 ? brick.x - 7.1 : brick.x + 69.1; }
    emit(s, { x: brick.x + 30, y: brick.y + 11 }, brick.maxHp > 1); sound(s, "score"); break;
  }
  if (b.y > WORLD.h + 15) { hurt(s); b.attached = true; message(s, "BALL LOST // LAUNCH AGAIN"); }
  if (s.bricks.every(b => b.hp === 0)) { s.level++; s.score += 500; s.lives = Math.min(5, s.lives + 1); brickField(s); message(s, "SECTOR CLEARED // EXTRA BALL"); }
  s.charge = Math.min(100, s.charge + dt * 3);
}
function pong(s: GameState, dt: number, keys: ReadonlySet<string>) {
  const speed = 410;
  s.player.y = clamp(s.player.y + ((keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0)) * speed * dt, 79, 487);
  if (s.mode === "solo") {
    const aim = s.ball.y + Math.sin(s.time * 1.8) * 42;
    s.rival.y = clamp(s.rival.y + clamp(aim - s.rival.y, -1, 1) * Math.min(305, 215 + s.level * 12) * dt, 79, 487);
  } else s.rival.y = clamp(s.rival.y + ((keys.has("p2down") ? 1 : 0) - (keys.has("p2up") ? 1 : 0)) * speed * dt, 79, 487);
  if (s.serve > 0 && s.ball.x >= 0 && s.ball.x <= WORLD.w) { s.serve -= dt; return; }
  const b = s.ball;
  const well = { x: 450, y: 280 + Math.sin(s.time * 0.7) * 130 };
  const d = Math.max(75, distance(well, b)), pull = 19000 / (d * d);
  b.vx += (well.x - b.x) * pull * dt; b.vy += (well.y - b.y) * pull * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.y < 40 || b.y > 526) { b.y = clamp(b.y, 40, 526); b.vy *= -1; sound(s, "hit"); }
  for (const [i, p] of [s.player, s.rival].entries()) {
    if ((i === 0 ? b.vx < 0 : b.vx > 0) && Math.abs(b.x - p.x) < 16 && Math.abs(b.y - p.y) < 58) {
      const powered = i === 0 && s.phase > 0 || i === 1 && s.phase2 > 0;
      const v = Math.min(670, 310 + s.rally * 20 + (powered ? 100 : 0));
      b.x = p.x + (i === 0 ? 18 : -18); b.vx = (i === 0 ? 1 : -1) * v; b.vy = ((b.y - p.y) / 58) * v * 0.85;
      s.rally++; if (i === 0) s.score += 15; emit(s, b, i === 1); sound(s, "hit");
    }
  }
  if (b.x < -12 || b.x > WORLD.w + 12) {
    const winner = b.x > WORLD.w ? 0 : 1; s.points[winner]++; s.rally = 0;
    if (winner === 0) { s.score += 250; sound(s, "score"); } else sound(s, "hurt");
    message(s, winner === 0 ? "GREEN TAKES THE POINT" : "AMBER TAKES THE POINT");
    if (s.points[winner] >= 7) { s.over = true; s.won = winner === 0; if (s.won) s.score += 1000; }
    b.x = 450; b.y = 280; b.vx = winner === 0 ? -310 : 310; b.vy = (random(s) - 0.5) * 220; s.serve = 1.1;
  }
  s.charge = Math.min(100, s.charge + dt * 15); s.charge2 = Math.min(100, s.charge2 + dt * 15);
}
function snakes(s: GameState, dt: number) {
  if (s.serve > 0) { s.serve = Math.max(0, s.serve - dt); return; }
  s.moveClock += dt;
  const interval = Math.max(0.075, 0.15 - Math.floor(s.score / 100) * 0.007);
  if (s.moveClock < interval) return; s.moveClock -= interval;
  s.direction = { ...s.queued }; s.direction2 = { ...s.queued2 };
  const tails = [s.snake, s.snake2], dirs = [s.direction, s.direction2], phases = [s.phase, s.phase2];
  const next = tails.map((tail, i) => tail.length ? { x: tail[0].x + dirs[i].x, y: tail[0].y + dirs[i].y } : null);
  next.forEach((p, i) => {
    if (!p) return;
    if (phases[i] > 0) { p.x = (p.x + 30) % 30; p.y = (p.y + 16) % 16; }
    else if (p.x < 0 || p.x >= 30 || p.y < 0 || p.y >= 16 || tails.some(tail => tail.slice(0, same(p, s.food) ? tail.length : -1).some(q => same(q, p)))) s.snakesAlive[i] = false;
  });
  if (next[0] && next[1] && same(next[0], next[1])) s.snakesAlive = [false, false];
  for (let i = 0; i < tails.length; i++) {
    const p = next[i]; if (!p || !s.snakesAlive[i]) continue;
    const eat = same(p, s.food); tails[i].unshift(p);
    if (!eat) tails[i].pop(); else {
      s.points[i]++; if (i === 0) { s.score += 50; s.charge = Math.min(100, s.charge + 18); } else s.charge2 = Math.min(100, s.charge2 + 18);
      sound(s, "score"); emit(s, { x: 15 + p.x * 29, y: 52 + p.y * 29 }, i === 1); placeFood(s);
    }
  }
  if (!s.snakesAlive[0] || (s.mode !== "solo" && !s.snakesAlive[1])) { s.over = true; s.won = s.mode !== "solo" && s.snakesAlive[0]; sound(s, "hurt"); }
  s.charge = Math.min(100, s.charge + 0.15); s.charge2 = Math.min(100, s.charge2 + 0.15);
}
function dungeonTurn(s: GameState, direction?: Point) {
  if (direction) {
    const to = { x: s.player.x + direction.x, y: s.player.y + direction.y };
    if (s.map[to.y]?.[to.x] !== 0) return;
    const enemy = s.enemies.find(e => same(e, to));
    if (enemy) { enemy.hp--; s.score += enemy.hp <= 0 ? 60 : 10; sound(s, "hit"); s.enemies = s.enemies.filter(e => e.hp > 0); }
    else s.player = to;
  } else {
    if (s.charge < 45) { message(s, "PULSE RECHARGES WHEN YOU MOVE"); return; }
    s.charge -= 45; s.phase = 0.5;
    s.enemies = s.enemies.filter(e => { if (distance(e, s.player) > 3.2) return true; s.score += 60; return false; }); sound(s, "score");
  }
  s.turn++; s.charge = Math.min(100, s.charge + 4);
  if (!s.hasKey && same(s.player, s.food)) { s.hasKey = true; s.score += 100; message(s, "KEY RECOVERED // REACH THE LIFT"); sound(s, "score"); }
  s.hearts = s.hearts.filter(h => { if (!same(h, s.player)) return true; s.lives = Math.min(8, s.lives + 2); sound(s, "score"); return false; });
  if (same(s.player, s.exit) && s.hasKey) {
    s.score += 300 * s.level; s.level++; s.lives = Math.min(8, s.lives + 1); dungeon(s); return;
  }
  // Each enemy takes one orthogonal step. Slow bugs telegraph their next turn.
  for (const e of s.enemies) {
    if (distance(e, s.player) > 7 || (e.kind === 1 && s.turn % 2)) continue;
    if (distance(e, s.player) <= 1) { hurt(s); continue; }
    const options = [{ x: Math.sign(s.player.x - e.x), y: 0 }, { x: 0, y: Math.sign(s.player.y - e.y) }];
    if (Math.abs(s.player.y - e.y) > Math.abs(s.player.x - e.x)) options.reverse();
    for (const d of options) {
      const p = { x: e.x + d.x, y: e.y + d.y };
      if ((!d.x && !d.y) || s.map[p.y]?.[p.x] !== 0 || same(p, s.player) || s.enemies.some(other => other !== e && same(other, p))) continue;
      e.x = p.x; e.y = p.y; break;
    }
  }
  reveal(s);
}
function survival(s: GameState, dt: number, keys: ReadonlySet<string>) {
  let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0), dy = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
  const norm = Math.hypot(dx, dy) || 1; dx /= norm; dy /= norm;
  s.player.x = clamp(s.player.x + dx * 235 * dt, 22, 878); s.player.y = clamp(s.player.y + dy * 235 * dt, 49, 530);
  s.level = 1 + Math.floor(s.time / 20); s.spawnClock -= dt; s.shotClock -= dt;
  if (s.spawnClock <= 0 && s.enemies.length < 60) {
    const side = Math.floor(random(s) * 4), t = random(s);
    s.enemies.push({ x: side === 0 ? -15 : side === 1 ? 915 : t * 900, y: side === 2 ? 20 : side === 3 ? 580 : 40 + t * 500, hp: s.level > 3 ? 2 : 1, kind: Math.floor(random(s) * 3), cooldown: 0 });
    s.spawnClock = Math.max(0.19, 0.95 - s.level * 0.11);
  }
  if (s.shotClock <= 0 && s.enemies.length) {
    const target = s.enemies.reduce((a, b) => distance(a, s.player) < distance(b, s.player) ? a : b);
    const d = distance(target, s.player) || 1, a = Math.atan2(target.y - s.player.y, target.x - s.player.x);
    s.bullets.push({ ...s.player, vx: (target.x - s.player.x) / d * 580, vy: (target.y - s.player.y) / d * 580, life: 1.6 });
    if (s.level >= 4) for (const da of [-0.17, 0.17]) s.bullets.push({ ...s.player, vx: Math.cos(a + da) * 580, vy: Math.sin(a + da) * 580, life: 1.6 });
    s.shotClock = Math.max(0.12, 0.32 - s.level * 0.02);
  }
  for (const e of s.enemies) {
    const d = distance(e, s.player) || 1, speed = 55 + s.level * 7 + e.kind * 15;
    e.x += (s.player.x - e.x) / d * speed * dt; e.y += (s.player.y - e.y) / d * speed * dt;
    if (d < 22 && s.invincible <= 0) { hurt(s); s.invincible = 1.7; emit(s, s.player, true, 30); e.hp = 0; }
  }
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const hit = s.enemies.find(e => e.hp > 0 && distance(e, b) < 18);
    if (hit) { hit.hp--; b.life = 0; if (hit.hp <= 0) { s.score += 25 * Math.min(4, 1 + Math.floor(s.combo / 15)); s.combo++; s.charge = Math.min(100, s.charge + 2); emit(s, hit, true, 10); sound(s, "score"); } }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0); s.bullets = s.bullets.filter(b => b.life > 0);
  s.charge = Math.min(100, s.charge + dt * 4);
}
export function pressGame(s: GameState, key: string) {
  if (s.over) return;
  if (s.id === "snake") {
    const second = key.startsWith("p2"), k = second ? key.slice(2) : key;
    const d = vec(k), current = second ? s.direction2 : s.direction;
    if (d && (d.x !== -current.x || d.y !== -current.y)) { if (second) s.queued2 = d; else s.queued = d; }
    if (k === "action" && (second ? s.charge2 : s.charge) >= 65) {
      if (second) { s.phase2 = 1.8; s.charge2 -= 65; } else { s.phase = 1.8; s.charge -= 65; }
      sound(s, "start");
    }
  }
  if (s.id === "bounce" && key === "action" && s.ball.attached) { s.ball.attached = false; s.rally = 0; s.ball.vx = 130; s.ball.vy = -350 - s.level * 12; sound(s, "start"); }
  if (s.id === "pong" && key === "action" && s.charge >= 60) { s.phase = 0.7; s.charge -= 60; sound(s, "start"); }
  if (s.id === "pong" && key === "p2action" && s.charge2 >= 60) { s.phase2 = 0.7; s.charge2 -= 60; }
  if (s.id === "under") { const d = vec(key); if (d || key === "action") dungeonTurn(s, d); }
  if (s.id === "signal" && key === "action" && s.charge >= 65) {
    s.charge -= 65; s.phase = 0.55; s.invincible = Math.max(0.8, s.invincible);
    s.enemies = s.enemies.filter(e => { if (distance(e, s.player) > 185) return true; s.score += 25; emit(s, e, true, 8); return false; }); sound(s, "start");
  }
  if (s.id === "poker") {
    if (/^[1-5]$/.test(key)) { const i = Number(key) - 1; s.held[i] = !s.held[i]; sound(s, "hit"); }
    if (key === "action" && s.redraws > 0) {
      s.cards = s.cards.map((c, i) => { if (s.held[i]) return c; s.discarded.push(c); return s.deck.shift()!; });
      s.redraws--; const hand = evaluateHand(s.cards); s.handName = hand.name; s.handPoints = hand.points; sound(s, "start");
    }
    if (key === "bank") {
      s.score += s.handPoints; s.bank += s.handPoints; s.hands--; sound(s, "score");
      if (s.bank >= s.target) { s.level++; s.score += 100 * (s.level - 1); s.target = Math.round(180 * 1.62 ** (s.level - 1)); s.bank = 0; s.hands = 3; message(s, "CIRCUIT COMPLETE // NEXT TARGET"); }
      else if (s.hands === 0) { s.over = true; return; }
      deal(s);
    }
  }
}
export function stepGame(s: GameState, delta: number, keys: ReadonlySet<string>) {
  if (s.over || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(0.05, delta); s.time += dt;
  s.phase = Math.max(0, s.phase - dt); s.phase2 = Math.max(0, s.phase2 - dt);
  s.flash = Math.max(0, s.flash - dt); s.invincible = Math.max(0, s.invincible - dt); s.messageTime = Math.max(0, s.messageTime - dt);
  for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
  s.particles = s.particles.filter(p => p.life > 0);
  if (s.id === "bounce") breakout(s, dt, keys);
  if (s.id === "pong") pong(s, dt, keys);
  if (s.id === "snake") snakes(s, dt);
  if (s.id === "signal") survival(s, dt, keys);
  if (s.id === "under") {
    const heldDirection = ["up", "down", "left", "right"].find(k => keys.has(k));
    if (!heldDirection) s.moveClock = 0;
    else { s.moveClock += dt; if (s.moveClock >= 0.18) { s.moveClock = 0; dungeonTurn(s, vec(heldDirection)); } }
  }
  if (s.id === "bounce" || s.id === "pong") { s.trail.unshift({ x: s.ball.x, y: s.ball.y }); s.trail.length = Math.min(20, s.trail.length); }
}
