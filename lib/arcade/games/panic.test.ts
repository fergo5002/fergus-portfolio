import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seededRng, createAttractMemory } from "../attract";
import { createGame, gameHud, MODULES, pressGame, stepGame, typedOf } from "../engine";
import { createRun } from "../run";
import {
  DESKTOP_CHARS,
  DUMP_TIME,
  KERNEL_INTEGRITY,
  KERNEL_Y,
  LURCH,
  multiplier,
  PANIC_WORDS,
  spawnProcess,
  SUDO_EVERY,
  targetOf,
  TOUCH_CHARS,
  TOUCH_WORDS,
  chipGeometry,
  TOP_ZONE_END,
  type PanicState,
  type Proc,
  type ProcKind,
} from "./panic";
import type { Rect } from "../layout";

/**
 * KERNEL PANIC: typing defence. These pin the rules a player feels: the
 * first letter locks on to the lowest match, every right letter is a shot,
 * a wrong one breaks the combo without losing the lock, forks split, sudo
 * clears the screen, landings cost integrity and zero integrity panics the
 * kernel. And two promises about the whole game rather than one rule: an
 * idle player loses, and the attract typist looks like somebody who can play.
 */

const TICK = 1 / 60;

function fresh(seed = 1, touch = false): PanicState {
  const s = createGame("panic", seed, { touch });
  s.toSpawn = 0; // a quiet screen: only what a test puts on it
  s.spawnClock = 999;
  return s;
}

function put(s: PanicState, name: string, y: number, kind: ProcKind = "proc", x = 450) {
  return spawnProcess(s, name, kind, x, y, 20);
}

function type(s: PanicState, word: string) {
  for (const c of word) pressGame(s, `char:${c}`);
}

/** Read through a call, so a test that set the banner to null can read it again. */
const bannerOf = (s: PanicState) => s.banner;

function steps(s: PanicState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TICK); i++) stepGame(s, TICK, new Set());
}

describe("Kernel Panic: targeting", () => {
  it("is a typing game that mirrors what has been typed", () => {
    expect(MODULES.panic.input).toBe("text");
    const s = fresh();
    put(s, "cron", 200);
    type(s, "cr");
    expect(typedOf(s)).toBe("cr");
  });

  it("locks the first letter on to the lowest process that starts with it", () => {
    const s = fresh();
    const high = put(s, "sshd", 150, "proc", 200);
    const low = put(s, "sudo", 320, "sudo", 600);
    pressGame(s, "char:s");
    expect(targetOf(s)?.id).toBe(low.id);
    expect(targetOf(s)?.id).not.toBe(high.id);
  });

  it("kills a process when its whole command is typed, scores it and clears the line", () => {
    const s = fresh();
    const p = put(s, "kill 4021", 200);
    type(s, "kill 402");
    expect(s.processes).toHaveLength(1);
    expect(typedOf(s)).toBe("kill 402");
    pressGame(s, "char:1");
    expect(s.processes).toHaveLength(0);
    expect(s.score).toBe(10 * "kill 4021".length);
    expect(s.kills).toBe(1);
    expect(typedOf(s)).toBe("");
    expect(targetOf(s)).toBeNull();
    expect(s.events.at(-1)).toMatchObject({ sound: "score", at: { x: p.x, y: p.y } });
  });

  it("fires a shot at the process for every right letter", () => {
    const s = fresh();
    put(s, "nginx", 200);
    type(s, "ngi");
    expect(s.shots.length).toBe(3);
    expect(s.events.filter((e) => e.sound === "hit").length).toBe(3);
  });

  it("does not kill on a wrong letter: it breaks the combo, keeps the lock and lurches the target", () => {
    const s = fresh();
    s.chain = 5;
    const p = put(s, "cron", 200);
    type(s, "cr");
    const y = p.y;
    pressGame(s, "char:x");
    expect(s.processes).toHaveLength(1);
    expect(s.chain).toBe(0);
    expect(typedOf(s)).toBe("cr");
    expect(targetOf(s)?.id).toBe(p.id);
    expect(p.y).toBeCloseTo(y + LURCH);
    expect(s.misses).toBe(1);
    type(s, "on");
    expect(s.processes).toHaveLength(0);
  });

  it("calls a letter nothing starts with a miss, but a stray space or an empty screen costs nothing", () => {
    const s = fresh();
    s.chain = 4;
    pressGame(s, "char:q");
    expect(s.chain).toBe(4); // nothing on screen to miss
    put(s, "cron", 200);
    pressGame(s, "char: ");
    expect(s.chain).toBe(4);
    pressGame(s, "char:q");
    expect(s.chain).toBe(0);
    expect(typedOf(s)).toBe("");
  });

  it("steps back on erase, and lets go of the lock when the line is empty", () => {
    const s = fresh();
    const p = put(s, "bash", 200);
    type(s, "ba");
    pressGame(s, "erase");
    expect(typedOf(s)).toBe("b");
    expect(targetOf(s)?.id).toBe(p.id);
    pressGame(s, "erase");
    expect(typedOf(s)).toBe("");
    expect(targetOf(s)).toBeNull();
    pressGame(s, "erase");
    expect(typedOf(s)).toBe("");
  });

  it("ignores anything a phone or a paste might send that no name uses", () => {
    const s = fresh();
    put(s, "bash", 200);
    for (const k of ["char:!", "char:", "char:é", "action", "up", "bank"]) pressGame(s, k);
    expect(typedOf(s)).toBe("");
    pressGame(s, "char:B");
    expect(typedOf(s)).toBe("b");
  });

  it("builds the combo from x1 to x4 on clean kills, and shows it in the HUD meter", () => {
    const s = fresh();
    expect(multiplier(s)).toBe(1);
    s.chain = 3;
    expect(multiplier(s)).toBe(2);
    s.chain = 9;
    expect(multiplier(s)).toBe(4);
    s.chain = 40;
    expect(multiplier(s)).toBe(4);
    const hud = gameHud(s);
    expect(hud.meter?.label).toContain("x4");
    expect(hud.meter?.value).toBe(1);
    s.chain = 6;
    put(s, "top", 200);
    type(s, "top");
    expect(s.score).toBe(10 * 3 * 3);
    expect(s.chain).toBe(7);
  });
});

describe("Kernel Panic: forks and sudo", () => {
  it("splits a killed fork into two short children that fall from where it died", () => {
    const s = fresh();
    const fork = put(s, "fork()", 260, "fork", 400);
    type(s, "fork()");
    expect(s.processes.some((p) => p.id === fork.id)).toBe(false);
    const children = s.processes.filter((p) => p.kind === "child");
    expect(children).toHaveLength(2);
    for (const c of children) {
      expect(c.y).toBeCloseTo(fork.y);
      expect(Math.abs(c.x - 400)).toBeGreaterThan(20);
      expect(c.name.length).toBeLessThanOrEqual(3);
    }
    expect(children[0].name[0]).not.toBe(children[1].name[0]);
  });

  it("clears the screen when sudo is typed, and scores what it clears", () => {
    const s = fresh();
    put(s, "cron", 300, "proc", 200);
    put(s, "nginx", 250, "proc", 700);
    put(s, "git push --force", 150, "proc", 450);
    put(s, "sudo", 100, "sudo", 600);
    type(s, "sudo");
    expect(s.processes).toHaveLength(0);
    expect(s.score).toBeGreaterThan(10 * ("cron".length + "nginx".length + "git push --force".length));
    expect(s.wipe).toBeGreaterThan(0);
  });

  it("drops a sudo once the combo has earned one, and never costs integrity if it lands", () => {
    const s = fresh();
    s.chain = SUDO_EVERY - 1;
    put(s, "cron", 200);
    type(s, "cron");
    steps(s, 1);
    const sudo = s.processes.find((p) => p.kind === "sudo");
    expect(sudo?.name).toBe("sudo");
    sudo!.y = KERNEL_Y - 1;
    sudo!.speed = 200;
    steps(s, 0.1);
    expect(s.integrity).toBe(KERNEL_INTEGRITY);
    expect(s.processes.some((p) => p.kind === "sudo")).toBe(false);
  });
});

describe("Kernel Panic: the kernel", () => {
  it("costs integrity when a process reaches it, and lets go of a lock on it", () => {
    const s = fresh();
    s.chain = 6;
    const p = put(s, "cron", 300);
    type(s, "cr");
    p.y = KERNEL_Y - 1;
    p.speed = 120;
    stepGame(s, TICK, new Set());
    expect(s.integrity).toBe(KERNEL_INTEGRITY - 1);
    expect(s.chain).toBe(0);
    expect(s.flash).toBeGreaterThan(0);
    expect(s.events.at(-1)?.sound).toBe("hurt");
    expect(typedOf(s)).toBe("");
    expect(s.scars).toHaveLength(1);
  });

  it("panics at zero integrity: a dump, frozen input, then the end of the run", () => {
    const s = fresh();
    s.integrity = 1;
    const p = put(s, "rm -rf /tmp", KERNEL_Y - 1);
    p.speed = 120;
    stepGame(s, TICK, new Set());
    expect(s.integrity).toBe(0);
    expect(s.dump?.comm).toBe("rm -rf /tmp");
    expect(s.over).toBe(false);
    put(s, "cron", 200);
    type(s, "cron");
    expect(s.kills).toBe(0);
    steps(s, DUMP_TIME + 0.1);
    expect(s.over).toBe(true);
  });
});

describe("Kernel Panic: waves", () => {
  it("opens with a banner and raises a new one when a wave is cleared", () => {
    const s = createGame("panic", 4);
    expect(s.banner?.text).toBe("WAVE 01");
    s.toSpawn = 0;
    s.processes = [];
    s.banner = null;
    stepGame(s, TICK, new Set());
    expect(s.wave).toBe(2);
    expect(bannerOf(s)?.text).toBe("WAVE 02");
    expect(gameHud(s).stage).toEqual({ label: "WAVE", value: 2 });
  });

  it("gets faster and busier as the waves go on", () => {
    const early = createGame("panic", 9), late = createGame("panic", 9);
    late.wave = 6;
    steps(early, 30);
    steps(late, 30);
    const speed = (s: PanicState) => s.processes.reduce((a, p) => a + p.speed, 0) / Math.max(1, s.processes.length);
    expect(speed(late)).toBeGreaterThan(speed(early));
  });

  it("spawns names with a free first letter, so the first letter always says which one", () => {
    const s = createGame("panic", 12);
    for (let i = 0; i < 60 * 90 && !s.over; i++) {
      stepGame(s, TICK, new Set());
      const firsts = s.processes.map((p) => p.name[0]);
      expect(new Set(firsts).size).toBe(firsts.length);
    }
  });
});

describe("Kernel Panic: the whole game", () => {
  /** A fixed tape: a letter every seven ticks from a string, whatever is on screen. */
  function scripted(seed: number) {
    const s = createGame("panic", seed);
    const tape = "cron sshd bash nginx kill 4021 top fork() sudo rm -rf /tmp ls";
    for (let i = 0; i < 60 * 40; i++) {
      if (i % 7 === 0) pressGame(s, `char:${tape[(i / 7) % tape.length]}`);
      if (i % 97 === 0) pressGame(s, "erase");
      stepGame(s, TICK, new Set());
    }
    return s;
  }

  it("is deterministic for a seed and a scripted input sequence", () => {
    expect(scripted(4242)).toEqual(scripted(4242));
    expect(JSON.stringify(scripted(1))).not.toBe(JSON.stringify(scripted(2)));
  });

  it("can be lost: an idle player loses within sixty seconds, on twenty seeds, on either profile", () => {
    for (const touch of [false, true]) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = createGame("panic", seed, { touch });
        for (let i = 0; i < 60 * 60 && !s.over; i++) stepGame(s, TICK, new Set());
        expect(s.over, `seed ${seed}${touch ? " (touch)" : ""}`).toBe(true);
      }
    }
  });

  it("has an attract typist who survives ten seconds on twenty seeds, and kills", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame("panic", seed), memory = createAttractMemory(), rng = seededRng(seed);
      for (let i = 0; i < 60 * 10; i++) {
        const plan = MODULES.panic.demo(s, memory, rng);
        for (const k of plan.press) pressGame(s, k);
        stepGame(s, TICK, plan.hold);
      }
      expect(s.over, `seed ${seed}`).toBe(false);
      expect(s.dump, `seed ${seed}`).toBeNull();
      expect(s.kills, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it("has an attract typist who reaches the words with spaces and symbols, all of them typeable", () => {
    const s = createGame("panic", 5), memory = createAttractMemory(), rng = seededRng(5);
    const sent = new Set<string>();
    for (let i = 0; i < 60 * 150 && !s.over; i++) {
      const plan = MODULES.panic.demo(s, memory, rng);
      for (const k of plan.press) { sent.add(k); pressGame(s, k); }
      stepGame(s, TICK, plan.hold);
    }
    const chars = [...sent].filter((k) => k.startsWith("char:")).map((k) => k.slice(5));
    expect(chars).toContain(" ");
    expect(chars.some((c) => /[^a-z ]/.test(c)), `only letters and spaces: ${chars.join("")}`).toBe(true);
    for (const c of chars) expect(MODULES.panic.typeable?.test(c), c).toBe(true);
  });

  it("has an attract typist who fumbles now and then, as a person does", () => {
    const s = createGame("panic", 3), memory = createAttractMemory(), rng = seededRng(3);
    for (let i = 0; i < 60 * 90 && !s.over; i++) {
      const plan = MODULES.panic.demo(s, memory, rng);
      for (const k of plan.press) pressGame(s, k);
      stepGame(s, TICK, plan.hold);
    }
    expect(s.misses).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(3 * s.misses);
  });
});

describe("Kernel Panic: chips never collide near the top", () => {
  const LAYOUTS = ["wide", "tall"] as const;
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const collide = (a: Proc, b: Proc) => LAYOUTS.some((l) => hit(chipGeometry(a, l).bounds, chipGeometry(b, l).bounds));

  it("gives every chip a box that holds its name, its pid, its caption and its lock brackets, on the glass", () => {
    for (const layout of LAYOUTS) {
      for (const [name, kind] of [["mkfs.ext4 /dev/sda", "proc"], ["fork()", "fork"], ["sudo", "sudo"], ["ls", "child"]] as const) {
        for (const x of [20, 450, 880]) {
          const g = chipGeometry({ name, kind, x, y: 200 }, layout);
          for (const part of [g.chip, g.label, g.caption, g.mark].filter((r): r is Rect => r !== null)) {
            expect(part.x, `${layout} ${name} at ${x}`).toBeGreaterThanOrEqual(g.bounds.x);
            expect(part.x + part.w).toBeLessThanOrEqual(g.bounds.x + g.bounds.w);
            expect(part.y).toBeGreaterThanOrEqual(g.bounds.y);
            expect(part.y + part.h).toBeLessThanOrEqual(g.bounds.y + g.bounds.h);
            expect(part.x, `${layout} ${name} off the left edge`).toBeGreaterThanOrEqual(0);
            expect(part.x + part.w, `${layout} ${name} off the right edge`).toBeLessThanOrEqual(900);
          }
          expect(g.caption !== null).toBe(kind === "fork" || kind === "sudo");
          expect(g.mark !== null).toBe(kind === "fork");
        }
      }
    }
  });

  for (const touch of [true, false]) {
    it(`never spawns a chip into another, over twenty seeds and several waves${touch ? " on the touch profile" : ""}`, () => {
      let spawned = 0, waves = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const s = createGame("panic", seed, { touch }), memory = createAttractMemory(), rng = seededRng(seed);
        const seen = new Set<number>();
        for (let i = 0; i < 60 * 120 && !s.over; i++) {
          const plan = MODULES.panic.demo(s, memory, rng);
          for (const k of plan.press) pressGame(s, k);
          stepGame(s, TICK, plan.hold);
          for (const p of s.processes) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            spawned++;
            for (const q of s.processes) if (q !== p) expect(collide(p, q), `seed ${seed}, t=${s.time.toFixed(2)}: ${p.name} spawned into ${q.name}`).toBe(false);
          }
          // And while both are still near the top, they stay apart.
          const top = s.processes.filter((p) => p.y < TOP_ZONE_END);
          for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
            expect(collide(top[a], top[b]), `seed ${seed}, t=${s.time.toFixed(2)}: ${top[a].name} and ${top[b].name} met near the top`).toBe(false);
          }
        }
        waves += s.wave;
      }
      expect(spawned).toBeGreaterThan(400);
      expect(waves / 20, "the runs reach several waves").toBeGreaterThanOrEqual(3);
    });
  }

  it("places a fork's children clear of the fork itself, so its fading image is never under them", () => {
    for (const touch of [false, true]) {
      for (const x of [120, 450, 780]) {
        const s = fresh(1, touch);
        const fork = put(s, touch ? "fork" : "fork()", 260, "fork", x);
        const ghost = { ...fork };
        type(s, fork.name);
        const children = s.processes.filter((p) => p.kind === "child");
        expect(children).toHaveLength(2);
        for (const c of children) expect(collide(c, ghost), `${touch ? "touch" : "desk"} fork at ${x}: ${c.name} on the fork`).toBe(false);
        // And still beside it, so they read as the fork's children, not two strangers across the screen.
        // At an edge both go the one way, side by side, so the far one is further out (276 at the right
        // edge on the tall model; the old 28-character caption put them 252 and 336 away).
        const [near, far] = children.map((c) => Math.abs(c.x - x)).sort((a, b) => a - b);
        expect(near, `${touch ? "touch" : "desk"} fork at ${x}: nearer child ${near.toFixed(0)} away`).toBeLessThanOrEqual(170);
        expect(far, `${touch ? "touch" : "desk"} fork at ${x}: farther child ${far.toFixed(0)} away`).toBeLessThanOrEqual(290);
      }
    }
  });

  it("places a fork's children clear of what is already there, even on a crowded row", () => {
    const s = fresh(1, true);
    const fork = put(s, "fork", 300, "fork", 450);
    put(s, "cron", 300, "proc", 180);
    put(s, "nginx", 300, "proc", 720);
    type(s, "fork");
    const children = s.processes.filter((p) => p.kind === "child");
    expect(children).toHaveLength(2);
    for (const c of children) for (const q of s.processes) if (q !== c) expect(collide(c, q), `${c.name} on ${q.name}`).toBe(false);
    expect(s.processes.some((p) => p.id === fork.id)).toBe(false);
  });
});

describe("Kernel Panic: the touch profile", () => {
  it("asks a phone for lower-case letters and single spaces only", () => {
    const all = [...TOUCH_WORDS.short, ...TOUCH_WORDS.medium, ...TOUCH_WORDS.long, ...TOUCH_WORDS.children, TOUCH_WORDS.fork, TOUCH_WORDS.sudo];
    for (const name of all) {
      expect(name, name).toMatch(/^[a-z]+( [a-z]+)*$/);
      for (const c of name) expect(TOUCH_CHARS.test(c), `${name}: ${c}`).toBe(true);
    }
  });

  it("only ever spawns phone words on a touch run", () => {
    const s = createGame("panic", 21, { touch: true }), memory = createAttractMemory(), rng = seededRng(21);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 150 && !s.over; i++) {
      const plan = MODULES.panic.demo(s, memory, rng);
      for (const k of plan.press) pressGame(s, k);
      stepGame(s, TICK, plan.hold);
      for (const p of s.processes) seen.add(p.name);
    }
    expect(seen.size).toBeGreaterThan(8);
    for (const name of seen) expect(name, name).toMatch(/^[a-z]+( [a-z]+)*$/);
  });

  it("is recorded in the run, runs slower and keeps fewer processes on screen", () => {
    expect(createRun("panic", 3, { touch: true }).game).toMatchObject({ touch: true });
    expect((createRun("panic", 3, { touch: true }).demo.state as PanicState).touch).toBe(true);
    expect(createRun("panic", 3).game).toMatchObject({ touch: false });
    const peak = (touch: boolean) => {
      const s = createGame("panic", 5, { touch });
      s.wave = 8;
      s.toSpawn = 100;
      s.integrity = 99;
      let most = 0, speed = 0;
      for (let i = 0; i < 60 * 40 && !s.over; i++) {
        stepGame(s, TICK, new Set());
        most = Math.max(most, s.processes.length);
        speed = Math.max(speed, ...s.processes.map((p) => p.speed));
      }
      return { most, speed };
    };
    const desk = peak(false), phone = peak(true);
    expect(phone.most).toBeLessThan(desk.most);
    expect(phone.speed).toBeLessThan(desk.speed * 0.85);
  });

  it("is what the room asks for on a coarse pointer", () => {
    // A coupling check: vitest runs in node here and cannot mount the room.
    const room = readFileSync(join(process.cwd(), "components", "arcade", "CanvasGame.tsx"), "utf8");
    expect(room).toMatch(/createRun\(cabinet\.id, seed, \{[^}]*touch: window\.matchMedia\("\(pointer: coarse\)"\)\.matches/);
  });

  it("types every desktop name with keys a keyboard has, and kills it", () => {
    const all = [...PANIC_WORDS.short, ...PANIC_WORDS.medium, ...PANIC_WORDS.long, ...PANIC_WORDS.children, PANIC_WORDS.fork, PANIC_WORDS.sudo];
    for (const name of all) {
      for (const c of name) expect(DESKTOP_CHARS.test(c), `${name}: ${c}`).toBe(true);
      expect(name, "no leading, trailing or double spaces").toMatch(/^\S+( \S+)*$/);
      const s = fresh();
      put(s, name, 200, name === "sudo" ? "sudo" : name === "fork()" ? "fork" : "proc");
      type(s, name);
      expect(s.kills, name).toBe(1);
    }
  });
});
