import { cardAnchor, HAND_ANCHOR, type PokerState } from "../games/poker";
import type { Point } from "../games/types";
import type { StageKind } from "../layout";
import { HAND_NAMES, HAND_POINTS } from "../poker-rules";
import { box, SUITS, text, type Pen } from "./kit";

const CARD_W = 150, CARD_H = 200;
/** On a tall stage the wide table is drawn below the HUD band until it has a layout of its own. */
const TALL_OFFSET = 160;

/** Which card, if any, is under a point in stage units. */
export function cardAt(point: Point, layout: StageKind): number | null {
  const y = layout === "tall" ? point.y - TALL_OFFSET : point.y;
  for (let i = 0; i < 5; i++) {
    const at = cardAnchor(i);
    if (Math.abs(point.x - at.x) <= CARD_W / 2 && Math.abs(y - at.y) <= CARD_H / 2 + 14) return i;
  }
  return null;
}

/** Where a poker event's wide-table point sits on the given layout, in stage units. */
export function pokerPoint(at: Point, layout: StageKind): Point {
  return layout === "tall" ? { x: at.x, y: at.y + TALL_OFFSET } : { x: at.x, y: at.y };
}

/** Circuit Poker's table: the target, five cards on their anchors, the hand and the paytable. */
export function drawPoker(pen: Pen, s: PokerState, hud: boolean, layout: StageKind = "wide") {
  const { c, p } = pen;
  if (layout === "tall") {
    c.save();
    c.translate(0, TALL_OFFSET);
    drawPoker(pen, s, hud, "wide");
    c.restore();
    return;
  }
  const progress = Math.min(1, s.bank / s.target);
  if (hud) {
    text(pen, "CIRCUIT TARGET", 450, 70, 12, p.accent, "center");
    text(pen, `${s.bank} / ${s.target}`, 450, 108, 40, p.bright, "center", true);
  }
  box(c, 185, 124, 530, 5, p.inkSoft, null);
  box(c, 185, 124, 530 * progress, 5, p.bright, null, p.brightGlow);
  s.cards.forEach((card, i) => {
    const at = cardAnchor(i), x = at.x - CARD_W / 2, y = at.y - CARD_H / 2 - (s.held[i] ? 12 : 0);
    const rank = (card % 13) + 2, suit = Math.floor(card / 13), colour = suit % 2 ? p.accent : p.ink;
    box(c, x, y, CARD_W, CARD_H, s.held[i] ? p.inkFill : p.panel, s.held[i] ? p.bright : p.dim, s.held[i] ? p.inkGlow : undefined);
    const r = rank < 11 ? String(rank) : ["J", "Q", "K", "A"][rank - 11];
    text(pen, r, x + 14, y + 40, 32, colour);
    text(pen, SUITS[suit], at.x, y + 128, 60, colour, "center");
    text(pen, s.held[i] ? "HELD" : `[${i + 1}]`, at.x, y + CARD_H - 14, 14, s.held[i] ? p.bright : p.dim, "center");
  });
  if (hud) {
    text(pen, s.handName, HAND_ANCHOR.x, 474, 30, p.bright, "center", true);
    text(pen, `BANK ${s.handPoints} POINTS  /  ${s.redraws} REDRAWS`, 450, 496, 13, p.accent, "center");
    HAND_NAMES.forEach((name, i) => {
      const x = i < 5 ? 32 : 488, y = 516 + (i < 5 ? i : i - 5) * 9;
      text(pen, `${name.padEnd(19)} ${String(HAND_POINTS[i]).padStart(4)}`, x, y, 8, p.dim);
    });
  }
}
