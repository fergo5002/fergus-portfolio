import { describe, expect, it } from "vitest";
import { createGame, GAME_IDS, MODULES, pressGame, stepGame, gameHud, eventsSince, inputOf, typedOf } from "../engine";
import { EVENT_RING, type GameId } from "./types";

/**
 * The contract every cabinet module signs. Each game has its own tests for
 * what makes it that game; these hold every one of them, including a module
 * that did not exist when this was written, to the same shape: deterministic,
 * finite, bounded, and able to end.
 */

const KEYS = ["up", "down", "left", "right", "action", "bank", "1", "2", "3", "4", "5", "char:a", "char:k", "erase", "nonsense"];

/** A short, fixed input tape: presses on a rhythm and a held direction that turns. */
function drive(id: GameId, seed: number, seconds: number) {
  const s = createGame(id, seed);
  for (let i = 0; i < seconds * 60; i++) {
    if (i % 37 === 0) pressGame(s, KEYS[(i / 37) % KEYS.length]);
    stepGame(s, 1 / 60, new Set([["left", "up", "right", "down"][Math.floor(i / 90) % 4]]));
  }
  return s;
}

describe("every cabinet module", () => {
  for (const id of GAME_IDS) {
    describe(id, () => {
      it("is registered under its own id and says what input it takes", () => {
        expect(MODULES[id].id).toBe(id);
        expect(["keys", "text"]).toContain(inputOf(id));
      });

      it("makes the same run from the same seed and the same inputs", () => {
        expect(drive(id, 4242, 20)).toEqual(drive(id, 4242, 20));
      });

      it("makes a different run from a different seed", () => {
        expect(JSON.stringify(drive(id, 1, 10))).not.toBe(JSON.stringify(drive(id, 2, 10)));
      });

      it("stays finite and never scores below zero, whatever it is sent", () => {
        const s = drive(id, 99, 60);
        expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity/);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(s.score)).toBe(true);
      });

      it("keeps a bounded event ring with rising sequence numbers", () => {
        const s = drive(id, 7, 60);
        expect(s.events.length).toBeLessThanOrEqual(EVENT_RING);
        for (let i = 1; i < s.events.length; i++) expect(s.events[i].seq).toBe(s.events[i - 1].seq + 1);
        if (s.events.length) expect(s.events[s.events.length - 1].seq).toBe(s.eventSeq);
        expect(eventsSince(s, s.eventSeq)).toEqual([]);
        expect(eventsSince(s, 0).length).toBe(s.events.length);
      });

      it("gives the HUD values the chrome can draw", () => {
        const hud = gameHud(createGame(id, 5));
        if (hud.lives) {
          expect(hud.lives.current).toBeGreaterThan(0);
          expect(hud.lives.current).toBeLessThanOrEqual(hud.lives.max);
        }
        if (hud.meter) {
          expect(hud.meter.value).toBeGreaterThanOrEqual(0);
          expect(hud.meter.value).toBeLessThanOrEqual(1);
        }
        if (hud.stage) expect(hud.stage.value).toBeGreaterThanOrEqual(1);
      });

      it("opens with a banner, so the first second of play says where you are", () => {
        expect(createGame(id, 3).banner?.text.length ?? 0).toBeGreaterThan(0);
      });

      it("does nothing once the run is over", () => {
        const s = createGame(id, 11);
        s.over = true;
        const before = structuredClone(s);
        stepGame(s, 1 / 60, new Set(["right"]));
        for (const key of KEYS) pressGame(s, key);
        expect(s).toEqual(before);
      });

      it("caps a late frame at one fixed step", () => {
        const a = createGame(id, 8), b = createGame(id, 8);
        stepGame(a, 100, new Set(["right"]));
        stepGame(b, 0.05, new Set(["right"]));
        expect(a).toEqual(b);
      });

      it("mirrors typed text only if it is a typing game", () => {
        const s = createGame(id, 1);
        if (inputOf(id) === "text") expect(typeof typedOf(s)).toBe("string");
        else expect(typedOf(s)).toBe("");
      });

      it("plays itself with keys it understands", () => {
        const s = createGame(id, 2), memory = { lastAct: -10, flag: false, mark: -1 };
        let r = 1;
        const rng = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
        const seen = new Set<string>();
        for (let i = 0; i < 600 && !s.over; i++) {
          const plan = MODULES[id].demo(s as never, memory, rng);
          for (const k of [...plan.hold, ...plan.press]) seen.add(k);
          for (const k of plan.press) pressGame(s, k);
          stepGame(s, 1 / 60, plan.hold);
        }
        expect(seen.size).toBeGreaterThan(0);
        const allowed = inputOf(id) === "text" ? /^(char:[a-z0-9]|erase)$/ : /^(up|down|left|right|action|bank|[1-5])$/;
        for (const k of seen) expect(k, `${id} demo sent ${k}`).toMatch(allowed);
      });
    });
  }
});
