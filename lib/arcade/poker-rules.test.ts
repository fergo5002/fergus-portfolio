import { describe, expect, it } from "vitest";
import { evaluateHand, handCards } from "./poker-rules";

/**
 * Which cards make the hand, for Circuit Poker's traces: the cards that
 * count are wired together and lit, the rest stay dark. Hands chosen by
 * hand, independently of the evaluator (card = suit * 13 + rank, rank 0 is
 * a two and 12 an ace).
 */
describe("handCards", () => {
  const cases: [string, number[], boolean[]][] = [
    ["high card: only the highest card", [0, 3, 19, 35, 51], [false, false, false, false, true]],
    ["one pair: the pair", [0, 13, 4, 20, 37], [true, true, false, false, false]],
    ["two pair: both pairs", [0, 13, 1, 14, 8], [true, true, true, true, false]],
    ["three of a kind: the three", [0, 13, 26, 4, 18], [true, true, true, false, false]],
    ["straight: all five", [0, 14, 28, 42, 4], [true, true, true, true, true]],
    ["flush: all five", [0, 3, 5, 8, 11], [true, true, true, true, true]],
    ["full house: all five", [0, 13, 26, 1, 14], [true, true, true, true, true]],
    ["four of a kind: the four", [0, 13, 26, 39, 1], [true, true, true, true, false]],
    ["straight flush: all five", [0, 1, 2, 3, 4], [true, true, true, true, true]],
  ];
  for (const [name, hand, lit] of cases) {
    it(name, () => {
      expect(handCards(hand)).toEqual(lit);
    });
  }

  it("lights exactly one card on a high-card hand, whichever position the top card is in", () => {
    const hand = [12, 14, 16, 18, 20]; // ace of spades first, then a 3, 5, 7 and 9 of hearts
    expect(evaluateHand(hand).rank).toBe(0);
    expect(handCards(hand)).toEqual([true, false, false, false, false]);
  });
});
