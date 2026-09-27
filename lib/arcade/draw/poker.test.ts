import { describe, expect, it } from "vitest";
import { cardAnchor, HAND_ANCHOR } from "../games/poker";
import { stageFor } from "../layout";
import { cardAt, cardRect, pokerPoint } from "./poker";

/**
 * Circuit Poker's table has two layouts: the wide one, which is the world,
 * and a tall one for a phone with a single row of bigger cards and a
 * paytable you can read. A tap has to find the card under the finger on
 * either, and an event has to light the card it came from.
 */
describe("the poker table", () => {
  for (const layout of ["wide", "tall"] as const) {
    describe(layout, () => {
      const stage = stageFor("poker", layout);

      it("finds each card from any point on it, and nothing between or off the cards", () => {
        for (let i = 0; i < 5; i++) {
          const r = cardRect(i, layout, false);
          expect(cardAt({ x: r.x + 4, y: r.y + 4 }, layout), `${layout} card ${i} corner`).toBe(i);
          expect(cardAt({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, layout), `${layout} card ${i} centre`).toBe(i);
          if (i < 4) expect(cardAt({ x: (r.x + r.w + cardRect(i + 1, layout, false).x) / 2, y: r.y + r.h / 2 }, layout), `${layout} gap after ${i}`).toBeNull();
        }
        expect(cardAt({ x: stage.w / 2, y: 5 }, layout)).toBeNull();
        expect(cardAt({ x: stage.w / 2, y: stage.h - 5 }, layout)).toBeNull();
      });

      it("keeps a held card tappable where it has lifted to", () => {
        const held = cardRect(2, layout, true);
        expect(cardAt({ x: held.x + held.w / 2, y: held.y + 3 }, layout)).toBe(2);
      });

      it("lights a card's event on that card, and a hand's event on the hand", () => {
        for (let i = 0; i < 5; i++) expect(cardAt(pokerPoint(cardAnchor(i), layout), layout), `${layout} card ${i}`).toBe(i);
        const hand = pokerPoint(HAND_ANCHOR, layout);
        expect(hand.x).toBeCloseTo(stage.w / 2);
        expect(cardAt(hand, layout)).toBeNull();
        expect(hand.y).toBeGreaterThan(cardRect(0, layout, false).y + cardRect(0, layout, false).h);
        expect(hand.y).toBeLessThan(stage.h);
      });

      it("fits five cards inside the stage with room between them", () => {
        const first = cardRect(0, layout, false), last = cardRect(4, layout, false);
        expect(first.x).toBeGreaterThanOrEqual(0);
        expect(last.x + last.w).toBeLessThanOrEqual(stage.w);
        expect(cardRect(1, layout, false).x - (first.x + first.w)).toBeGreaterThanOrEqual(6);
      });
    });
  }

  it("draws bigger cards on the phone than a straight scale of the wide table would", () => {
    // The whole point of the tall layout: on a 360px phone the wide table's cards would be 59px across.
    expect(cardRect(0, "tall", false).w).toBeGreaterThan(cardRect(0, "wide", false).w);
    expect(cardRect(0, "tall", false).h).toBeGreaterThan(cardRect(0, "wide", false).h);
  });
});
