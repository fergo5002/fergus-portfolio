import { describe, expect, it } from "vitest";
import { BEAT, COUNTDOWN, countdownLabel, createRun, isNewBest, OVER_HOLD, pauseRun, pressRun, resultDue, startRun, stepRun } from "./run";

/**
 * The cabinet around a game: a how-to-play card that plays itself, a READY
 * 3 2 1 countdown, the game, and a GAME OVER screen that holds before the
 * result panel. Pure and stepped by the host's fixed tick, so every one of
 * these is a table of cases rather than a hope about a browser.
 */
const TICK = 1 / 60;
function steps(run: ReturnType<typeof createRun>, seconds: number, keys: ReadonlySet<string> = new Set()) {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepRun(run, TICK, keys);
}

describe("the card", () => {
  it("is where every run begins, with the demo playing behind it", () => {
    const run = createRun("signal", 1);
    expect(run.phase).toBe("card");
    const before = structuredClone(run.demo.state);
    steps(run, 1);
    expect(run.demo.state).not.toEqual(before);
    expect(run.game.time).toBe(0);
  });

  it("starts on the first Space, and a start key is not also a move in the game", () => {
    const run = createRun("poker", 2);
    const held = run.game.id === "poker" ? [...run.game.held] : [];
    expect(pressRun(run, "action")).toBe("start");
    expect(run.phase).toBe("countdown");
    expect(run.game.id === "poker" && run.game.held).toEqual(held);
    expect(run.game.id === "poker" && run.game.redraws).toBe(2);
  });

  it("also starts on Enter, the other key an arcade calls start", () => {
    const run = createRun("signal", 3);
    expect(pressRun(run, "bank")).toBe("start");
    expect(run.phase).toBe("countdown");
  });

  it("ignores a direction or a letter on the card", () => {
    for (const key of ["up", "left", "1", "char:a", "erase"]) {
      const run = createRun("signal", 4);
      expect(pressRun(run, key), key).toBeNull();
      expect(run.phase).toBe("card");
    }
  });

  it("can be skipped for a replay, which goes straight to the countdown", () => {
    expect(createRun("poker", 5, { skipCard: true }).phase).toBe("countdown");
  });

  it("starts only once", () => {
    const run = createRun("signal", 6);
    expect(startRun(run)).toBe(true);
    expect(startRun(run)).toBe(false);
  });
});

describe("the countdown", () => {
  it("reads READY, 3, 2, 1 a beat apart, then hands over to play", () => {
    const run = createRun("signal", 7, { skipCard: true });
    const seen: string[] = [];
    for (let i = 0; i < Math.round(BEAT * COUNTDOWN.length * 60) + 2; i++) {
      const label = countdownLabel(run);
      if (label && seen[seen.length - 1] !== label) seen.push(label);
      stepRun(run, TICK, new Set());
    }
    expect(seen).toEqual(["READY", "3", "2", "1"]);
    expect(run.phase).toBe("play");
    expect(countdownLabel(run)).toBeNull();
  });

  it("holds the game still, and takes no key, until it has finished", () => {
    const run = createRun("signal", 8, { skipCard: true });
    const before = structuredClone(run.game);
    steps(run, BEAT * 2, new Set(["right"]));
    expect(pressRun(run, "action")).toBeNull();
    expect(run.game).toEqual(before);
  });
});

describe("play", () => {
  function playing(id: "signal" | "poker" | "panic", seed = 9) {
    const run = createRun(id, seed, { skipCard: true });
    steps(run, BEAT * COUNTDOWN.length + 0.05);
    expect(run.phase).toBe("play");
    return run;
  }

  it("steps the game and routes presses to it", () => {
    const run = playing("poker");
    expect(pressRun(run, "1")).toBe("game");
    expect(run.game.id === "poker" && run.game.held[0]).toBe(true);
    const t = run.game.time;
    steps(run, 0.5);
    expect(run.game.time).toBeGreaterThan(t);
  });

  it("freezes while paused and takes no key, then carries on", () => {
    const run = playing("signal");
    expect(pauseRun(run, true)).toBe(true);
    const frozen = structuredClone(run.game);
    steps(run, 1, new Set(["right"]));
    expect(pressRun(run, "action")).toBeNull();
    expect(run.game).toEqual(frozen);
    pauseRun(run, false);
    steps(run, 0.2, new Set(["right"]));
    expect(run.game.time).toBeGreaterThan(frozen.time);
  });

  it("will not pause the card or the finished screen", () => {
    const run = createRun("signal", 10);
    expect(pauseRun(run, true)).toBe(false);
    expect(run.paused).toBe(false);
  });

  it("moves to GAME OVER the moment the game ends", () => {
    const run = playing("poker");
    if (run.game.id !== "poker") throw new Error("poker");
    run.game.hands = 1; run.game.bank = 0; run.game.handPoints = 20;
    pressRun(run, "bank");
    stepRun(run, TICK, new Set());
    expect(run.phase).toBe("over");
    expect(run.paused).toBe(false);
  });
});

describe("game over", () => {
  it("holds the finished screen before the result panel is due", () => {
    const run = createRun("poker", 11, { skipCard: true });
    steps(run, BEAT * COUNTDOWN.length + 0.05);
    run.game.over = true;
    stepRun(run, TICK, new Set());
    expect(run.phase).toBe("over");
    expect(resultDue(run)).toBe(false);
    steps(run, OVER_HOLD - 0.1);
    expect(resultDue(run)).toBe(false);
    steps(run, 0.2);
    expect(resultDue(run)).toBe(true);
  });

  it("calls a run a new best only when it beats the best it was shown", () => {
    const run = createRun("signal", 12, { best: 500 });
    run.game.score = 500;
    expect(isNewBest(run)).toBe(false);
    run.game.score = 501;
    expect(isNewBest(run)).toBe(true);
    const first = createRun("signal", 13, { best: 0 });
    expect(isNewBest(first)).toBe(false);
    first.game.score = 25;
    expect(isNewBest(first)).toBe(true);
  });
});
