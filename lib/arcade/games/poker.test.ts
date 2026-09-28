import { describe, expect, it } from "vitest";
import { createGame, gameHud, pressGame } from "../engine";
import { cardAnchor, HAND_ANCHOR, targetFor } from "./poker";

/**
 * Circuit Poker's rules did not change in the split: five cards, two draws a
 * hand, three hands to meet a target that rises by 1.62 a circuit, and the
 * paytable in `poker-rules.ts`. The board is fair because a score still means
 * what it meant.
 */
describe("Circuit Poker", () => {
  it("keeps held cards, deals without duplicates, and spends a draw", () => {
    const s = createGame("poker", 1); const first = s.cards[0];
    pressGame(s, "1"); pressGame(s, "action");
    expect(s.cards[0]).toBe(first); expect(new Set([...s.cards, ...s.deck, ...s.discarded]).size).toBe(52);
    expect(s.redraws).toBe(1);
  });

  it("will not draw a third time in one hand", () => {
    const s = createGame("poker", 2);
    pressGame(s, "action"); pressGame(s, "action");
    const hand = [...s.cards];
    pressGame(s, "action");
    expect(s.cards).toEqual(hand);
    expect(s.redraws).toBe(0);
  });

  it("banks the hand's points into the circuit and the score, then deals the next hand", () => {
    const s = createGame("poker", 3);
    const points = s.handPoints, before = [...s.cards];
    pressGame(s, "bank");
    expect(s.bank).toBe(points); expect(s.score).toBe(points); expect(s.hands).toBe(2);
    expect(s.cards).not.toEqual(before); expect(s.redraws).toBe(2);
    expect(s.held).toEqual([false, false, false, false, false]);
  });

  it("completes a circuit when the bank reaches the target, with a bonus and a banner", () => {
    const s = createGame("poker", 4);
    s.bank = s.target - 1; s.handPoints = 20;
    const score = s.score;
    pressGame(s, "bank");
    expect(s.level).toBe(2);
    expect(s.score).toBe(score + 20 + 100);
    expect(s.target).toBe(targetFor(2));
    expect(s.bank).toBe(0); expect(s.hands).toBe(3);
    expect(s.banner).toMatchObject({ text: "CIRCUIT COMPLETE", sub: `CIRCUIT 02 // TARGET ${targetFor(2)}` });
  });

  it("breaks the circuit when the last hand is banked short of the target", () => {
    const s = createGame("poker", 5);
    s.hands = 1; s.bank = 0; s.handPoints = 20;
    pressGame(s, "bank");
    expect(s.over).toBe(true);
    expect(s.won).toBe(false);
  });

  it("lights a hold under the card that was held and a draw or bank at the hand", () => {
    const s = createGame("poker", 6);
    pressGame(s, "3");
    expect(s.events.at(-1)).toMatchObject({ sound: "hit", at: cardAnchor(2) });
    pressGame(s, "action");
    expect(s.events.at(-1)).toMatchObject({ sound: "start", at: HAND_ANCHOR });
  });

  it("shows hands left as icons and the circuit as the stage; the table owns the target meter", () => {
    const s = createGame("poker", 7);
    s.bank = 90; s.hands = 2;
    expect(gameHud(s)).toEqual({
      lives: { current: 2, max: 3, icon: "hand" },
      stage: { label: "CIRCUIT", value: 1 },
    });
  });

  it("says what a banked hand was worth, in a banner", () => {
    const s = createGame("poker", 8);
    s.handName = "ONE PAIR"; s.handPoints = 70; s.bank = 0;
    pressGame(s, "bank");
    expect(s.banner).toMatchObject({ text: "ONE PAIR", sub: "+70 BANKED", size: "small" });
  });

  it("keeps the published target curve", () => {
    expect([1, 2, 3, 4, 5].map(targetFor)).toEqual([180, 292, 472, 765, 1240]);
  });
});
