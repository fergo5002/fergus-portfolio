import { describe, expect, it } from "vitest";
import { createGame, gameHud, pressGame, stepGame, typedOf } from "../engine";
import { KERNEL_Y } from "./panic";

/**
 * Kernel Panic is a working stub: a real module that starts, runs, takes
 * typing and ends, so the room, the boards and the chrome know three games
 * before the next agent builds the real one. These pin the text path the room
 * relies on (`char:` presses, `erase`, `typed`) more than the game itself.
 */
function type(s: ReturnType<typeof createGame<"panic">>, word: string) {
  for (const c of word) pressGame(s, `char:${c}`);
}

describe("Kernel Panic (stub)", () => {
  it("is a typing game", async () => {
    const { MODULES } = await import("../engine");
    expect(MODULES.panic.input).toBe("text");
  });

  it("kills a process when its whole name is typed, and clears the line", () => {
    const s = createGame("panic", 1);
    s.processes = [{ name: "cron", x: 300, y: 200, speed: 20 }];
    type(s, "cro");
    expect(typedOf(s)).toBe("cro");
    expect(s.processes).toHaveLength(1);
    pressGame(s, "char:n");
    expect(s.processes).toHaveLength(0);
    expect(s.score).toBeGreaterThan(0);
    expect(typedOf(s)).toBe("");
    expect(s.events.at(-1)).toMatchObject({ sound: "score", at: { x: 300, y: 200 } });
  });

  it("drops the line on a letter no process wants, and breaks the chain", () => {
    const s = createGame("panic", 2);
    s.processes = [{ name: "sshd", x: 300, y: 200, speed: 20 }];
    s.combo = 4;
    type(s, "ssx");
    expect(typedOf(s)).toBe("");
    expect(s.combo).toBe(0);
    expect(s.processes).toHaveLength(1);
  });

  it("takes back a letter on erase", () => {
    const s = createGame("panic", 3);
    s.processes = [{ name: "init", x: 300, y: 200, speed: 20 }];
    type(s, "inx");
    pressGame(s, "char:i");
    expect(typedOf(s)).toBe("i");
    pressGame(s, "erase");
    expect(typedOf(s)).toBe("");
    pressGame(s, "erase");
    expect(typedOf(s)).toBe("");
  });

  it("ignores anything that is not a letter or a digit", () => {
    const s = createGame("panic", 4);
    s.processes = [{ name: "bash", x: 300, y: 200, speed: 20 }];
    for (const k of ["char: ", "char:!", "char:", "action", "up"]) pressGame(s, k);
    expect(typedOf(s)).toBe("");
    pressGame(s, "char:B");
    expect(typedOf(s)).toBe("b");
  });

  it("costs integrity when a process reaches the kernel, and panics at zero", () => {
    const s = createGame("panic", 5);
    s.integrity = 1;
    s.spawnClock = 99;
    s.processes = [{ name: "fork", x: 300, y: KERNEL_Y - 1, speed: 120 }];
    stepGame(s, 1 / 60, new Set());
    expect(s.integrity).toBe(0);
    expect(s.over).toBe(true);
    expect(s.events.at(-1)?.sound).toBe("hurt");
  });

  it("spawns processes on its own and speeds up by the wave", () => {
    const s = createGame("panic", 6);
    for (let i = 0; i < 60 * 5; i++) stepGame(s, 1 / 60, new Set());
    expect(s.processes.length).toBeGreaterThan(0);
    expect(new Set(s.processes.map((p) => p.name)).size).toBe(s.processes.length);
    const late = createGame("panic", 6);
    late.time = 61;
    stepGame(late, 1 / 60, new Set());
    expect(gameHud(late).stage?.value).toBeGreaterThan(gameHud(s).stage?.value ?? 0);
  });

  it("shows integrity as icons and the wave as the stage", () => {
    expect(gameHud(createGame("panic", 7))).toEqual({
      lives: { current: 3, max: 3, icon: "core" },
      stage: { label: "WAVE", value: 1 },
    });
  });
});
