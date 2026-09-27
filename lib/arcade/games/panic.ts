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

/** An x for a new name that keeps it on screen and away from anything still near the top. */
function spawnX(s: PanicState, name: string): number {
  const half = Math.min(200, name.length * 7);
  const lo = 90 + half, hi = 810 - half;
  const near = s.processes.filter((p) => p.y < SPAWN_Y + 140);
  let best = lo + rand(s) * (hi - lo), bestGap = -1;
  for (let i = 0; i < 5; i++) {
    const x = i === 0 ? best : lo + rand(s) * (hi - lo);
    const gap = near.length ? Math.min(...near.map((p) => Math.abs(p.x - x))) : 999;
    if (gap > bestGap) { best = x; bestGap = gap; }
  }
  return best;
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
  if (s.wave >= 2 && rand(s) < 0.14 && !taken.has(words.fork[0])) {
    spawnProcess(s, words.fork, "fork", spawnX(s, words.fork), SPAWN_Y, speedFor(s, words.fork) * 0.9);
    return true;
  }
  const [a, b] = tierWeights(s.wave);
  const roll = rand(s);
  const list = roll < a ? words.short : roll < a + b ? words.medium : words.long;
  // An owed sudo keeps its letter clear, so it can drop as soon as the screen allows.
  const free = list.filter((n) => !taken.has(n[0]) && !(s.sudoOwed && n[0] === words.sudo[0]));
  if (!free.length) return false;
  const name = pick(s, free);
  spawnProcess(s, name, "proc", spawnX(s, name), SPAWN_Y, speedFor(s, name));
  return true;
}

function spawnSudo(s: PanicState) {
  const name = wordsOf(s).sudo;
  spawnProcess(s, name, "sudo", spawnX(s, name), SPAWN_Y, fallSpeed(s.wave, s.touch) * 0.8);
  s.sudoOwed = false;
}

function split(s: PanicState, parent: Proc) {
  const words = wordsOf(s);
  const taken = new Set(s.processes.map((p) => p.name[0]));
  for (const side of [-1, 1]) {
    const free = words.children.filter((n) => !taken.has(n[0]));
    if (!free.length) return;
    const name = pick(s, free);
    taken.add(name[0]);
    spawnProcess(s, name, "child", clamp(parent.x + side * 100, 70, 830), parent.y, parent.speed * 1.15);
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
  if (target) target.y += LURCH;
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

  create(seed, options) {
    const touch = options?.touch === true;
    const s: PanicState = {
      ...baseState("panic", seed),
      touch, wave: 1, integrity: KERNEL_INTEGRITY, processes: [], nextId: 1, lock: null, buffer: "",
      toSpawn: waveSize(1, touch), spawnClock: 0.8, chain: 0, kills: 0, misses: 0, miss: 0,
      sudoOwed: false, shots: [], pops: [], scars: [], wipe: 0, dump: null,
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
    if (s.toSpawn <= 0 && s.processes.length === 0) {
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
    if (s.spawnClock <= 0 && s.toSpawn > 0 && onScreen < screenCap(s.wave, s.touch)) {
      if (spawnWaveProcess(s)) s.toSpawn--;
      s.spawnClock = spawnGap(s.wave, s.touch) * (0.8 + rand(s) * 0.4);
    }

    for (const p of s.processes) p.y += p.speed * dt;
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
    target.y -= KNOCK;
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
