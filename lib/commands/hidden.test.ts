import { describe, it, expect } from "vitest";
import { COMMANDS, HELP_LINES, complete, runCommand } from "@/lib/commands";
import { hidden, ARCADE_DECLINED } from "./hidden";
import { GAME_TITLES } from "@/content/arcade";

describe("the hidden module", () => {
  it("holds the arcade door, hidden, with no help and no completion", () => {
    const arcade = hidden.find((c) => c.name === "arcade");
    if (!arcade) throw new Error("no arcade");
    expect(arcade.hidden).toBe(true);
    expect(arcade.help).toBeUndefined();
    expect(arcade.argPool).toBeUndefined();
  });

  it("marks everything in it hidden, by construction", () => {
    for (const c of hidden) expect(c.hidden, c.name).toBe(true);
  });
});

describe("the door", () => {
  it("opens the cabinet", () => {
    const res = runCommand("arcade");
    expect(res.type).toBe("program");
    if (res.type !== "program") return;
    expect(res.program.id).toBe("arcade");
  });

  it("opens the same cabinet through cd, which is how it is meant to be found", () => {
    expect(runCommand("cd arcade").type).toBe("program");
  });

  it("starts a named game straight from the door", () => {
    const res = runCommand("cd arcade bounce");
    expect(res.type).toBe("program");
    if (res.type !== "program") return;
    expect(res.program.id).toBe("bounce");
  });

  it("says so, rather than opening the cabinet, when the game is not built", () => {
    const res = runCommand("arcade pong");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).toContain(GAME_TITLES.pong);
  });

  it("says so when the name is not a game at all", () => {
    const res = runCommand("arcade tetris");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).toContain("tetris");
  });

  it("declines under reduced motion, in a sentence, and starts nothing", () => {
    const res = runCommand("arcade", { reducedMotion: true });
    expect(res).toEqual({ type: "output", lines: ARCADE_DECLINED });
  });

  it("declines through cd as well, because the door is one door", () => {
    expect(runCommand("cd arcade", { reducedMotion: true }).type).toBe("output");
  });
});

describe("the door stays shut to everything that lists commands", () => {
  it("is absent from help", () => {
    expect(HELP_LINES.join("\n")).not.toContain("arcade");
  });

  it("is absent from the completion list", () => {
    expect(COMMANDS).not.toContain("arcade");
    expect(complete("arc")).toBeNull();
    expect(complete("arcade ")).toBeNull();
  });

  it("is absent from ls", () => {
    const res = runCommand("ls");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join(" ")).not.toContain("arcade");
  });

  it("is still the one hint in top", () => {
    const res = runCommand("top");
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("arcade");
  });
});
