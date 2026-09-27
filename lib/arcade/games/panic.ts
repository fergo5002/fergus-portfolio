import { screenCopy } from "@/content/arcade-collection";
import type { Rect } from "../layout";
import { banner, baseState, clamp, emit, rand, sound, type BaseState, type GameModule, type Point } from "./types";

/**
 * KERNEL PANIC: typing defence. Rogue processes fall towards the kernel; type
 * a process's name to kill it before it lands.
 *
 * The rules, in the order a player meets them:
 *
 *  - **The lock.** The first letter locks on to the lowest process whose name
 *    starts with it. The spawner never puts two names with the same first
 *    letter on screen, so in play the first letter always says which one;
 *    the lowest-match rule is what decides it if that ever fails.
 *  - **Shots.** Every right letter is a shot: a line from the kernel to the
 *    process, a spark, a small knock back up the screen. The last letter
 *    kills it for ten points a character, times the combo.
 *  - **Mistakes.** A wrong letter breaks the combo and jolts the locked
 *    process a little closer to the kernel. It keeps the lock. A letter no
 *    process starts with is a miss too; a stray space, or typing at an empty
 *    screen, is not. `erase` (Backspace) steps back a letter, and from the
 *    first letter lets go of the lock.
 *  - **The combo.** Clean kills in a row: x2 at three, x3 at six, x4 at nine.
 *    Every twelfth one earns a **sudo**, an amber process that never hurts
 *    the kernel; typing `sudo` kills everything on screen.
 *  - **Forks.** Killing `fork()` splits it into two short children that fall
 *    from where it died.
 *  - **The kernel.** A process that reaches it costs a point of integrity and
 *    the combo. At zero the kernel panics: the screen halts on a panic dump
 *    for `DUMP_TIME`, then the run is over.
 *  - **Waves.** Each wave is a fixed number of processes. Clear the screen of
 *    the last of them for a bonus and a banner; the next wave falls faster,
 *    spawns sooner, allows more on screen and draws longer commands.
 *  - **Room.** Every chip has a box (`chipGeometry`, which the drawer draws
 *    to): its name, its pid over it, a fork's or a sudo's caption under it,
 *    a fork's mark and the lock's brackets. A chip is only ever placed where
 *    that box, on the wide stage and the phone's tall one alike, clears every
 *    live chip's; with no room the spawn waits a beat. Near the top a chip
 *    never falls into the chip below it in its column (it trails it until
 *    that one is clear of the top), and a knock or a lurch never pushes a
 *    chip into a neighbour.
 *
 * **The touch profile** (`create(seed, { touch: true })`, recorded in the
 * state): a phone keyboard hides digits and symbols behind a second layer and
 * iOS turns two quick spaces into a full stop, so a touch run asks only for
 * lower-case letters and single spaces between words (`TOUCH_WORDS`), falls at
 * 0.75 of the speed, spawns less often and keeps fewer processes on screen.
 * The board never replays a run from its inputs (a receipt only proves when a
 * run started), so the profile cannot break verification; it does mean phone
 * and keyboard runs share a board with different words, and scoring by the
 * character is the only thing that evens that out. It is not a calibrated
 * handicap and is not claimed to be.
 *
 * Pure and deterministic like every module: no DOM, timers, storage or network.
 */

export type ProcKind = "proc" | "fork" | "child" | "sudo";
export type Proc = Point & { id: number; name: string; speed: number; kind: ProcKind; /** Seconds of hit spark left. */ hit: number };
/** A shot's line, from the kernel to the letter it hit, for the drawer. */
export type Shot = { pid: number; to: Point; index: number; life: number };
/** A score floating up from a kill. */
export type Pop = Point & { value: number; mult: number; life: number };
/** The panic: when, which process did it, and the dice for the dump's addresses. */
export type Dump = { at: number; comm: string; pid: number; code: number };

export type PanicState = BaseState & {
  id: "panic";
  touch: boolean;
  wave: number;
  integrity: number;
  processes: Proc[];
  nextId: number;
  /** The process the first letter locked on to. */
  lock: number | null;
  /** What has been typed towards the lock. */
  buffer: string;
  /** Processes this wave has still to spawn. */
  toSpawn: number;
  spawnClock: number;
  /** Clean kills in a row. Drives the multiplier and earns sudo. */
  chain: number;
  kills: number;
  misses: number;
  /** Seconds of wrong-letter feedback left, for the prompt. */
  miss: number;
  sudoOwed: boolean;
  /** Fork children with nowhere to fall from where the fork died, waiting for room at the top. */
  queued: string[];
  shots: Shot[];
  pops: Pop[];
  /** Where processes have hit the kernel, for the cracks in its line. */
  scars: number[];
  /** Seconds of sudo's sweep left. */
  wipe: number;
  dump: Dump | null;
};

export const KERNEL_INTEGRITY = 3;
/** The kernel's line, in world pixels. A process whose baseline crosses it lands. */
export const KERNEL_Y = 468;
/** Where a process first appears: just under the HUD. */
export const SPAWN_Y = 78;
/** Seconds the panic dump holds before the run is over. */
export const DUMP_TIME = 2.6;
/** Every this many clean kills in a row earns a sudo. */
export const SUDO_EVERY = 12;
/** How far a wrong letter jolts the locked process towards the kernel. */
export const LURCH = 8;
/** How far each right letter knocks the process back up. */
export const KNOCK = 1.5;
const SHOT_LIFE = 0.14;
const CANNON: Point = { x: 450, y: KERNEL_Y };

/**
 * The words. Short ones in the first wave, longer commands later. Every
 * desktop character is one a keyboard has without a dead key; see
 * `DESKTOP_CHARS`. Names within a list are all different.
 */
export const PANIC_WORDS = {
  short: [
    "atd", "awk", "bash", "cron", "cupsd", "dbus", "emacs", "ftpd", "getty", "httpd", "init", "java", "klogd", "less",
    "make", "nginx", "node", "ntpd", "perl", "ping", "qemu", "ruby", "sshd", "tmux", "top", "udevd", "vim", "wget",
    "xorg", "yes", "zsh",
  ],
  medium: [
    "kill 4021", "kswapd0", "systemd", "mysqld", "rsync -a", "syslogd", "dockerd", "ps aux", "top -c", "chmod 777",
    "nc -l 80", "kill -9 1", "cat /etc", "ping -f", "tail -f", "journald", "lsof -i", "uptime", "whoami", "passwd",
    "crontab", "useradd", "ifconfig", "zombie 666", "gcc -o a", "bzip2 -9", "htop", "vim .bashrc", "apt update",
    "xargs -0", "export", "echo 1", "egrep -v",
  ],
  long: [
    "rm -rf /tmp", "git push --force", "dd if=/dev/zero", "chmod -r 777 /", "killall -9 init", "shutdown -h now",
    "crontab -r", "mkfs.ext4 /dev/sda", "cat /dev/urandom", "mv /etc /dev/null", "npm i left-pad", "kill -9 -1",
    "pkill -u root", "git reset --hard", "docker rm -f db", "halt --force", "ulimit -n 0", "wipefs -a /dev/sda",
    "yes > /dev/null", "tar -xzf core.tgz", "ln -sf /dev/null /",
  ],
  /** What a fork splits into: two or three letters, and never a first letter the other child has. */
  children: ["ls", "ps", "cd", "id", "wc", "tr", "vi", "df", "du", "nl", "od", "tee", "cut", "sed", "env", "pwd", "who", "gcc", "man", "at", "bc", "jq", "rm", "yes"],
  fork: "fork()",
  sudo: "sudo",
} as const;

/** The phone's words: lower-case letters and single spaces between words, nothing else. */
export const TOUCH_WORDS = {
  short: [
    "atd", "awk", "bash", "cron", "cupsd", "dbus", "emacs", "ftpd", "getty", "httpd", "init", "java", "klogd", "less",
    "make", "nginx", "node", "ntpd", "perl", "ping", "qemu", "ruby", "sshd", "tmux", "top", "udevd", "vim", "wget",
    "xorg", "yes", "zsh",
  ],
  medium: [
    "kill init", "kswapd", "systemd", "mysqld", "rsync", "syslogd", "dockerd", "ps aux", "top", "chmod all", "uptime",
    "whoami", "passwd", "crontab", "useradd", "journald", "tail log", "htop", "apt update", "zombie", "egrep", "export",
  ],
  long: [
    "git push force", "shutdown now", "killall bash", "reboot now", "git reset hard", "drop database", "format disk",
    "delete logs", "kill zombies", "mount root", "halt system", "wipe the disk", "yes forever",
  ],
  children: ["ls", "ps", "cd", "id", "wc", "tr", "vi", "df", "du", "nl", "od", "tee", "cut", "sed", "env", "pwd", "who", "gcc", "man", "at", "bc", "jq", "rm", "yes"],
  fork: "fork",
  sudo: "sudo",
} as const;

/** Every character a desktop name may use. */
export const DESKTOP_CHARS = /^[a-z0-9 ./=()>-]$/;
/** Every character a touch name may use. */
export const TOUCH_CHARS = /^[a-z ]$/;

const wordsOf = (s: PanicState) => (s.touch ? TOUCH_WORDS : PANIC_WORDS);
const charsOf = (s: PanicState) => (s.touch ? TOUCH_CHARS : DESKTOP_CHARS);
const waveLabel = (n: number) => `WAVE ${String(n).padStart(2, "0")}`;
const WAVE_SUBS = ["THEY ARE GETTING FASTER", "LONGER COMMANDS INCOMING", "THE SCHEDULER IS LOSING", "NO PROCESS IS SAFE", "PAGING EVERYTHING OUT"];

/* ── the curve ───────────────────────────────────────────────────────────── */

/** How many processes wave `n` sends. */
export function waveSize(n: number, touch: boolean): number {
  return touch ? 4 + n : 5 + 2 * n;
}
/** The most processes wave `n` allows on screen at once (a sudo does not count). */
export function screenCap(n: number, touch: boolean): number {
  return touch ? Math.min(5, 2 + Math.ceil(n / 2)) : Math.min(8, 3 + n);
}
/** Seconds between spawns in wave `n`. */
export function spawnGap(n: number, touch: boolean): number {
  return Math.max(0.6, 1.8 - 0.14 * (n - 1)) * (touch ? 1.3 : 1);
}
/** The fall speed a wave starts from, in world pixels a second. */
export function fallSpeed(n: number, touch: boolean): number {
  return Math.min(92, 30 + 6 * (n - 1)) * (touch ? 0.75 : 1);
}
/** Of every spawn, how likely it is to come from the short, medium and long lists. */
function tierWeights(n: number): [number, number, number] {
  if (n <= 1) return [1, 0, 0];
  if (n === 2) return [0.7, 0.3, 0];
  if (n === 3) return [0.45, 0.4, 0.15];
  if (n <= 5) return [0.3, 0.45, 0.25];
  return [0.2, 0.4, 0.4];
}

/* ── a chip's box, shared with the drawer ──────────────────────────────────── */

export type ChipLayout = "wide" | "tall";
/** The type a chip is drawn in, in world units. A phone's tall stage draws everything about two thirds bigger. */
export const CHIP_TYPE = {
  wide: { name: 28, child: 23, pid: 10, pad: 8 },
  tall: { name: 46, child: 38, pid: 17, pad: 12 },
} as const;
/**
 * The widest a character may be, as a fraction of its size: the display face
 * for names, the mono for the pid and the caption. The drawer fits every
 * string into the width these allow, so no text is ever wider than its box,
 * whatever face the browser ends up with.
 */
export const DISPLAY_ADVANCE = 0.5;
export const MONO_ADVANCE = 0.62;
/** A chip's baseline above this is near the top, where chips are kept apart as they fall. */
export const TOP_ZONE_END = SPAWN_Y + 200;
const EDGE = 12;
/** Room kept around every chip for the lock's brackets and their glow. */
const HALO = 6;
const LAYOUTS: readonly ChipLayout[] = ["wide", "tall"];

export type ChipGeometry = { size: number; chip: Rect; label: Rect; caption: Rect | null; mark: Rect | null; bounds: Rect };
type Placed = { name: string; kind: ProcKind; x: number; y: number };

/** The left edge of a block `w` wide centred on `x`, pushed in from the sides so it stays on the glass. */
export function chipLeft(x: number, w: number): number {
  return Math.max(EDGE, Math.min(900 - EDGE - w, x - w / 2));
}
const onGlass = (left: number, w: number) => Math.max(EDGE, Math.min(900 - EDGE - w, left));

/** The pid label a chip carries, at its longest. */
export const pidLabel = (kind: ProcKind) => (kind === "sudo" ? "uid 0 pid 0000" : "pid 0000");
export const captionOf = (kind: ProcKind) => (kind === "sudo" ? screenCopy.panicTags.sudo : kind === "fork" ? screenCopy.panicTags.fork : "");

/** Where every part of a process's chip is drawn on a layout, in world units, and the box around all of it. */
export function chipGeometry(p: Placed, layout: ChipLayout): ChipGeometry {
  const t = CHIP_TYPE[layout];
  const size = p.kind === "child" ? t.child : t.name;
  const w = [...p.name].length * DISPLAY_ADVANCE * size + t.pad * 2;
  const h = size + t.pad;
  const fork = p.kind === "fork";
  const gap = t.pad, markW = h * 0.5;
  const left = chipLeft(p.x, w + (fork ? gap + markW : 0));
  const chip = { x: left, y: p.y - size * 0.82, w, h };
  const mark = fork ? { x: left + w + gap, y: chip.y, w: markW, h } : null;
  const lw = pidLabel(p.kind).length * MONO_ADVANCE * t.pid;
  const label = { x: onGlass(left, lw), y: chip.y - 4 - t.pid, w: lw, h: t.pid + 2 };
  const words = captionOf(p.kind);
  const cw = words.length * MONO_ADVANCE * t.pid;
  const caption = words ? { x: onGlass(left, cw), y: chip.y + h + 2, w: cw, h: t.pid + 6 } : null;
  const parts = [chip, label, caption, mark].filter((r): r is Rect => r !== null);
  const x0 = Math.min(...parts.map((r) => r.x)), y0 = Math.min(...parts.map((r) => r.y));
  const x1 = Math.max(...parts.map((r) => r.x + r.w)), y1 = Math.max(...parts.map((r) => r.y + r.h));
  return { size, chip, label, caption, mark, bounds: { x: x0 - HALO, y: y0 - HALO, w: x1 - x0 + HALO * 2, h: y1 - y0 + HALO * 2 } };
}

const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const column = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w;

/** Whether a chip placed like `c` would clear every live chip but `ignore`, on both layouts. */
function clearOf(s: PanicState, c: Placed, ignore?: Proc): boolean {
  for (const layout of LAYOUTS) {
    const a = chipGeometry(c, layout).bounds;
    for (const q of s.processes) if (q !== ignore && meets(a, chipGeometry(q, layout).bounds)) return false;
  }
  return true;
}

/**
 * A clear x for a new chip at height `y`: one that spreads the top out, or
 * with `prefer` the clear x nearest it. Null when there is no room.
 */
function place(s: PanicState, name: string, kind: ProcKind, y: number, prefer?: number): number | null {
  let best: number | null = null, bestScore = -Infinity;
  const xs = prefer === undefined ? Array.from({ length: 24 }, () => 40 + rand(s) * 820) : Array.from({ length: 70 }, (_, i) => 36 + i * 12);
  for (const x of xs) {
    const c = { name, kind, x, y };
    if (!clearOf(s, c)) continue;
    const near = s.processes.filter((q) => q.y < SPAWN_Y + 140);
    const score = prefer !== undefined ? -Math.abs(x - prefer) : near.length ? Math.min(...near.map((q) => Math.abs(q.x - x))) : 0;
    if (score > bestScore) { best = x; bestScore = score; }
  }
  return best;
}

/** Move a chip by `dy`, but never into a neighbour it is clear of now. */
function nudge(s: PanicState, p: Proc, dy: number) {
  let move = dy;
  for (const layout of LAYOUTS) {
    const a = chipGeometry(p, layout).bounds;
    for (const q of s.processes) {
      if (q === p) continue;
      const b = chipGeometry(q, layout).bounds;
      if (!column(a, b) || meets(a, b)) continue;
      // Stop a hair short, so rounding never leaves two chips touching and read as already overlapping.
      if (dy < 0 && b.y + b.h <= a.y) move = Math.max(move, -Math.max(0, a.y - (b.y + b.h) - 1e-6));
      if (dy > 0 && b.y >= a.y + a.h) move = Math.min(move, Math.max(0, b.y - (a.y + a.h) - 1e-6));
    }
  }
  p.y += move;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Clean kills in a row, as a multiplier: x1, then x2 at three, x3 at six, x4 at nine. */
export function multiplier(s: PanicState): number {
  return 1 + Math.min(3, Math.floor(s.chain / 3));
}

/** The process the typing is aimed at. */
export function targetOf(s: PanicState): Proc | null {
  if (s.lock === null) return null;
  return s.processes.find((p) => p.id === s.lock) ?? null;
}

function lowest(list: readonly Proc[]): Proc | null {
  let best: Proc | null = null;
  for (const p of list) if (!best || p.y > best.y) best = p;
  return best;
}

function release(s: PanicState) {
  s.lock = null;
  s.buffer = "";
}

/** The one way a process enters the world. */
export function spawnProcess(s: PanicState, name: string, kind: ProcKind, x: number, y: number, speed: number): Proc {
  const p: Proc = { id: s.nextId++, name, kind, x, y, speed, hit: 0 };
  s.processes.push(p);
  return p;
}

/** A new chip at the top, if there is room for it. */
function spawnAtTop(s: PanicState, name: string, kind: ProcKind, speed: number): boolean {
  const x = place(s, name, kind, SPAWN_Y);
  if (x === null) return false;
  spawnProcess(s, name, kind, x, SPAWN_Y, speed);
  return true;
}

function pick<T>(s: PanicState, list: readonly T[]): T {
  return list[Math.floor(rand(s) * list.length)];
}

function speedFor(s: PanicState, name: string): number {
  const length = 1 - clamp((name.length - 6) * 0.03, 0, 0.3);
  return fallSpeed(s.wave, s.touch) * (0.85 + rand(s) * 0.3) * length;
}

/** One rogue process for this wave: a fork now and then from wave two, otherwise a name from the wave's lists. */
function spawnWaveProcess(s: PanicState): boolean {
  const words = wordsOf(s);
  const taken = new Set(s.processes.map((p) => p.name[0]));
  if (s.wave >= 2 && rand(s) < 0.14 && !taken.has(words.fork[0])) return spawnAtTop(s, words.fork, "fork", speedFor(s, words.fork) * 0.9);
  const [a, b] = tierWeights(s.wave);
  const roll = rand(s);
  const list = roll < a ? words.short : roll < a + b ? words.medium : words.long;
  // An owed sudo keeps its letter clear, so it can drop as soon as the screen allows.
  const free = list.filter((n) => !taken.has(n[0]) && !(s.sudoOwed && n[0] === words.sudo[0]));
  if (!free.length) return false;
  const name = pick(s, free);
  return spawnAtTop(s, name, "proc", speedFor(s, name));
}

function spawnSudo(s: PanicState) {
  if (spawnAtTop(s, wordsOf(s).sudo, "sudo", fallSpeed(s.wave, s.touch) * 0.8)) s.sudoOwed = false;
}

/**
 * Two children fall from where the fork died, each as near its side of it as
 * there is room for; if the row is full they start a little higher, and if
 * there is nowhere at all they wait for room at the top.
 */
function split(s: PanicState, parent: Proc) {
  const words = wordsOf(s);
  const taken = new Set([...s.processes.map((p) => p.name[0]), ...s.queued.map((n) => n[0])]);
  for (const side of [-1, 1]) {
    const free = words.children.filter((n) => !taken.has(n[0]));
    if (!free.length) return;
    const name = pick(s, free);
    taken.add(name[0]);
    let x: number | null = null, y = parent.y;
    for (let rise = 0; x === null; rise += 30) {
      y = Math.max(SPAWN_Y, parent.y - rise);
      x = place(s, name, "child", y, clamp(parent.x + side * 100, 70, 830));
      if (y === SPAWN_Y) break;
    }
    if (x !== null) spawnProcess(s, name, "child", x, y, parent.speed * 1.15);
    else s.queued.push(name);
  }
}

function score(s: PanicState, p: Proc, mult: number) {
  const value = 10 * p.name.length * mult;
  s.score += value;
  s.pops.push({ x: p.x, y: Math.max(SPAWN_Y + 4, p.y - 24), value, mult, life: 0.9 });
  if (s.pops.length > 12) s.pops.splice(0, s.pops.length - 12);
}

function kill(s: PanicState, p: Proc) {
  const mult = multiplier(s);
  s.processes = s.processes.filter((q) => q !== p);
  release(s);
  s.kills++;
  s.chain++;
  score(s, p, mult);
  emit(s, p, p.kind === "sudo", p.kind === "sudo" ? 30 : 16);
  sound(s, "score", p);
  if (p.kind === "fork") split(s, p);
  if (p.kind === "sudo") {
    // sudo: everything else on screen dies, at the multiplier sudo was typed on.
    const cleared = s.processes;
    s.processes = [];
    for (const q of cleared) {
      s.kills++;
      score(s, q, mult);
      emit(s, q, true, 10);
    }
    s.wipe = 0.6;
    sound(s, "start", CANNON, 0.9);
    banner(s, "SUDO", cleared.length ? `${cleared.length} PROCESS${cleared.length === 1 ? "" : "ES"} KILLED` : "NOTHING LEFT TO KILL", 1.2, "small");
  }
  if (s.chain % SUDO_EVERY === 0) s.sudoOwed = true;
}

function wrong(s: PanicState, target: Proc | null) {
  s.chain = 0;
  s.misses++;
  s.miss = 0.35;
  if (target) nudge(s, target, LURCH);
}

function panicNow(s: PanicState, p: Proc) {
  s.integrity = 0;
  release(s);
  s.dump = { at: s.time, comm: p.name, pid: 1000 + p.id * 37 + Math.floor(rand(s) * 900), code: Math.floor(rand(s) * 0xffffffff) >>> 0 };
}

/* ── the module ──────────────────────────────────────────────────────────── */

export const panic: GameModule<PanicState> = {
  id: "panic",
  input: "text",
  // A touch run asks for a subset of these (TOUCH_CHARS); the contract is the widest.
  typeable: DESKTOP_CHARS,

  create(seed, options) {
    const touch = options?.touch === true;
    const s: PanicState = {
      ...baseState("panic", seed),
      touch, wave: 1, integrity: KERNEL_INTEGRITY, processes: [], nextId: 1, lock: null, buffer: "",
      toSpawn: waveSize(1, touch), spawnClock: 0.8, chain: 0, kills: 0, misses: 0, miss: 0,
      sudoOwed: false, queued: [], shots: [], pops: [], scars: [], wipe: 0, dump: null,
    };
    banner(s, waveLabel(1), "TYPE A NAME TO KILL IT");
    return s;
  },

  step(s, dt) {
    s.miss = Math.max(0, s.miss - dt);
    s.wipe = Math.max(0, s.wipe - dt);
    for (const shot of s.shots) shot.life -= dt;
    s.shots = s.shots.filter((shot) => shot.life > 0);
    for (const pop of s.pops) { pop.life -= dt; pop.y -= 24 * dt; }
    s.pops = s.pops.filter((pop) => pop.life > 0);
    for (const p of s.processes) p.hit = Math.max(0, p.hit - dt);

    // A panicked kernel halts: nothing falls, nothing spawns, the dump holds, then the run ends.
    if (s.dump) {
      if (s.time - s.dump.at >= DUMP_TIME) s.over = true;
      return;
    }

    // Waves: the last of a wave cleared means a bonus, a banner and a breather.
    if (s.toSpawn <= 0 && s.processes.length === 0 && s.queued.length === 0) {
      s.score += 50 * s.wave;
      s.wave++;
      s.toSpawn = waveSize(s.wave, s.touch);
      s.spawnClock = 2.2;
      banner(s, waveLabel(s.wave), WAVE_SUBS[(s.wave - 2) % WAVE_SUBS.length]);
      sound(s, "start", CANNON);
    }

    s.spawnClock -= dt;
    const onScreen = s.processes.filter((p) => p.kind !== "sudo").length;
    if (s.sudoOwed && !s.processes.some((p) => p.name[0] === wordsOf(s).sudo[0])) spawnSudo(s);
    const waiting = s.queued[0];
    if (waiting && !s.processes.some((p) => p.name[0] === waiting[0]) && spawnAtTop(s, waiting, "child", fallSpeed(s.wave, s.touch) * 1.15)) s.queued.shift();
    if (s.spawnClock <= 0 && s.toSpawn > 0 && onScreen < screenCap(s.wave, s.touch)) {
      // No room at the top: try again in a moment rather than after a whole gap.
      if (spawnWaveProcess(s)) { s.toSpawn--; s.spawnClock = spawnGap(s.wave, s.touch) * (0.8 + rand(s) * 0.4); }
      else s.spawnClock = 0.25;
    }

    // Lowest first: near the top a chip never falls into the one below it in its column; it trails it.
    for (const p of [...s.processes].sort((a, b) => b.y - a.y)) {
      if (p.y < TOP_ZONE_END) nudge(s, p, p.speed * dt);
      else p.y += p.speed * dt;
    }
    const landed = s.processes.filter((p) => p.y >= KERNEL_Y);
    if (!landed.length) return;
    s.processes = s.processes.filter((p) => p.y < KERNEL_Y);
    for (const p of landed) {
      if (s.lock === p.id) release(s);
      if (p.kind === "sudo") {
        // A missed sudo fizzles on the kernel. It was a gift, not a threat.
        emit(s, { x: p.x, y: KERNEL_Y }, true, 8);
        sound(s, "hit", { x: p.x, y: KERNEL_Y }, 0.2);
        continue;
      }
      s.integrity--;
      s.chain = 0;
      s.flash = 0.35;
      s.scars.push(p.x);
      emit(s, { x: p.x, y: KERNEL_Y }, true, 24);
      sound(s, "hurt", { x: p.x, y: KERNEL_Y });
      if (s.integrity <= 0) { panicNow(s, p); return; }
    }
  },

  press(s, key) {
    if (s.dump) return;
    if (key === "erase") {
      if (s.buffer.length <= 1) release(s);
      else s.buffer = s.buffer.slice(0, -1);
      return;
    }
    if (!key.startsWith("char:")) return;
    const c = key.slice(5).toLowerCase();
    if ([...c].length !== 1 || !charsOf(s).test(c)) return;

    let target = targetOf(s);
    if (!target) {
      release(s);
      // A stray space, or typing at an empty screen, costs nothing.
      if (c === " " || !s.processes.length) return;
      target = lowest(s.processes.filter((p) => p.name[0] === c));
      if (!target) { wrong(s, null); return; }
      s.lock = target.id;
    } else if (target.name[s.buffer.length] !== c) {
      wrong(s, target);
      return;
    }

    s.buffer += c;
    target.hit = 0.12;
    nudge(s, target, -KNOCK);
    s.shots.push({ pid: target.id, to: { x: target.x, y: target.y }, index: s.buffer.length - 1, life: SHOT_LIFE });
    if (s.shots.length > 24) s.shots.splice(0, s.shots.length - 24);
    sound(s, "hit", target, 0.16);
    if (s.buffer === target.name) kill(s, target);
  },

  hud(s) {
    return {
      lives: { current: Math.max(0, s.integrity), max: KERNEL_INTEGRITY, icon: "core" },
      stage: { label: "WAVE", value: s.wave },
      meter: { label: `COMBO x${multiplier(s)}`, value: Math.min(1, s.chain / SUDO_EVERY), ready: 9 / SUDO_EVERY },
    };
  },

  typed(s) {
    return s.buffer;
  },

  /**
   * Somebody who can type: about seven letters a second, a beat of reaction
   * after each kill, sudo first when the screen is busy, and now and then a
   * wrong key, sometimes followed by a Backspace it did not strictly need.
   * It lets a new name fall a little before taking it, so an attract screen
   * shows names falling rather than a player who kills them on sight.
   */
  demo(s, m, rng) {
    const plan = { hold: new Set<string>(), press: [] as string[] };
    if (s.dump || s.time < m.mark) return plan;
    const lock = targetOf(s);
    let target = lock;
    if (!target) {
      const sudo = s.processes.find((p) => p.kind === "sudo");
      const low = lowest(s.processes);
      if (sudo && s.processes.length >= 3) target = sudo;
      else if (low && (low.y > KERNEL_Y * 0.4 || s.processes.length >= 3)) target = low;
      if (!target) return plan;
    }
    m.lastAct = s.time;
    if (m.flag && lock && s.buffer.length > 1 && rng() < 0.5) {
      plan.press.push("erase");
      m.flag = false;
      m.mark = s.time + 0.12 + rng() * 0.1;
      return plan;
    }
    m.flag = false;
    const typed = lock ? s.buffer.length : 0;
    const next = target.name[typed];
    if (lock && rng() < 0.025) {
      const keys = "qwertyuiopasdfghjklzxcvbnm".replace(next, "");
      plan.press.push(`char:${keys[Math.floor(rng() * keys.length)]}`);
      m.flag = true;
      m.mark = s.time + 0.25 + rng() * 0.15;
      return plan;
    }
    plan.press.push(`char:${next}`);
    m.mark = s.time + (typed + 1 === target.name.length ? 0.3 + rng() * 0.25 : 0.09 + rng() * 0.09);
    return plan;
  },
};
