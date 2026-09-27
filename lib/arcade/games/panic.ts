import { banner, baseState, emit, rand, sound, type BaseState, type GameModule } from "./types";

/**
 * KERNEL PANIC: typing defence. Rogue processes fall towards the kernel; type
 * a process's name to kill it before it lands.
 *
 * **This is a working stub**, written on 2026-09-27 so the room, the boards,
 * the chrome and the tests know three cabinets before the real game exists.
 * It is a complete module (it starts, runs, takes typing and ends) and it
 * proves the text path the room gives a typing game: `char:<c>` presses,
 * `erase`, and `typed()` mirrored back into the room's input. The next agent
 * replaces its internals; keep the module shape and the text contract.
 */

export type Process = { name: string; x: number; y: number; speed: number };

export type PanicState = BaseState & {
  id: "panic";
  wave: number;
  integrity: number;
  processes: Process[];
  /** What the visitor has typed towards a name. */
  buffer: string;
  spawnClock: number;
  combo: number;
  kills: number;
};

export const KERNEL_INTEGRITY = 3;
/** The line the kernel sits on, in world pixels. A process that crosses it lands. */
export const KERNEL_Y = 500;

/** Names a rogue process might have. Lower case, letters only, all different. */
export const PROCESS_NAMES = [
  "cron", "sshd", "init", "httpd", "kswapd", "zombie", "fork", "daemon", "systemd", "bash", "nginx", "cupsd",
  "udevd", "dbus", "mysqld", "rsync", "ntpd", "getty", "klogd", "inetd", "xorg", "crond", "syslogd", "smbd",
];

const wave = (n: number) => `WAVE ${String(n).padStart(2, "0")}`;
const typeable = /^[a-z0-9]$/;

function spawn(s: PanicState) {
  const taken = new Set(s.processes.map((p) => p.name));
  const free = PROCESS_NAMES.filter((n) => !taken.has(n));
  if (!free.length) return;
  const name = free[Math.floor(rand(s) * free.length)];
  s.processes.push({ name, x: 90 + rand(s) * 720, y: 40, speed: 18 + s.wave * 7 + rand(s) * 8 });
}

/** The process a buffer is aimed at: the lowest one whose name starts with it. */
export function targetOf(s: PanicState): Process | null {
  if (!s.buffer) return null;
  let best: Process | null = null;
  for (const p of s.processes) if (p.name.startsWith(s.buffer) && (!best || p.y > best.y)) best = p;
  return best;
}

export const panic: GameModule<PanicState> = {
  id: "panic",
  input: "text",

  create(seed) {
    const s: PanicState = {
      ...baseState("panic", seed),
      wave: 1, integrity: KERNEL_INTEGRITY, processes: [], buffer: "", spawnClock: 0.6, combo: 0, kills: 0,
    };
    banner(s, wave(1), "TYPE A NAME TO KILL IT");
    return s;
  },

  step(s, dt) {
    const next = 1 + Math.floor(s.time / 30);
    if (next !== s.wave) { s.wave = next; banner(s, wave(next), "THEY ARE GETTING FASTER"); }
    s.spawnClock -= dt;
    if (s.spawnClock <= 0) {
      spawn(s);
      s.spawnClock = Math.max(0.9, 2.4 - s.wave * 0.2);
    }
    for (const p of s.processes) p.y += p.speed * dt;
    const landed = s.processes.filter((p) => p.y >= KERNEL_Y);
    if (!landed.length) return;
    s.processes = s.processes.filter((p) => p.y < KERNEL_Y);
    for (const p of landed) {
      s.integrity--; s.combo = 0; s.flash = 0.35;
      emit(s, { x: p.x, y: KERNEL_Y }, true, 24);
      sound(s, "hurt", { x: p.x, y: KERNEL_Y });
      if (s.buffer && !s.processes.some((q) => q.name.startsWith(s.buffer))) s.buffer = "";
      if (s.integrity <= 0) { s.integrity = 0; s.over = true; return; }
    }
  },

  press(s, key) {
    if (key === "erase") { s.buffer = s.buffer.slice(0, -1); return; }
    if (!key.startsWith("char:")) return;
    const c = key.slice(5).toLowerCase();
    if (!typeable.test(c)) return;
    const next = s.buffer + c;
    const target = s.processes.filter((p) => p.name.startsWith(next)).sort((a, b) => b.y - a.y)[0];
    if (!target) {
      s.buffer = ""; s.combo = 0;
      sound(s, "hit", { x: 450, y: KERNEL_Y }, 0.2);
      return;
    }
    s.buffer = next;
    if (target.name !== next) return;
    s.processes = s.processes.filter((p) => p !== target);
    s.combo++; s.kills++;
    s.score += target.name.length * 10 * Math.min(4, 1 + Math.floor(s.combo / 5));
    s.buffer = "";
    emit(s, target, false, 14);
    sound(s, "score", target);
  },

  hud(s) {
    return {
      lives: { current: s.integrity, max: KERNEL_INTEGRITY, icon: "core" },
      stage: { label: "WAVE", value: s.wave },
    };
  },

  typed(s) {
    return s.buffer;
  },

  /**
   * Types the lowest process's name a letter at a time, fumbling now and then.
   * It waits until a name has fallen a third of the way, so an attract screen
   * shows names falling rather than a player who kills them on sight.
   */
  demo(s, m, rng) {
    const press: string[] = [];
    if (s.time - m.lastAct < 0.24) return { hold: new Set(), press };
    m.lastAct = s.time;
    const lowest = [...s.processes].sort((a, b) => b.y - a.y)[0];
    if (!lowest || (!s.buffer && lowest.y < KERNEL_Y * 0.36)) return { hold: new Set(), press };
    if (s.buffer && !lowest.name.startsWith(s.buffer)) {
      press.push("erase");
      return { hold: new Set(), press };
    }
    const next = lowest.name[s.buffer.length];
    if (next === undefined) return { hold: new Set(), press };
    press.push(rng() < 0.05 ? "char:q" : `char:${next}`);
    return { hold: new Set(), press };
  },
};
