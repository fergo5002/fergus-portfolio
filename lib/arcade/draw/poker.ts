import { screenCopy } from "@/content/arcade-collection";
import { meter } from "../chrome";
import { CARD_PITCH, CARD_Y, HAND_ANCHOR, POKER_DRAWS, POKER_HANDS, type PokerState } from "../games/poker";
import type { Point } from "../games/types";
import type { Rect, StageKind } from "../layout";
import { HAND_NAMES, HAND_POINTS, handCards } from "../poker-rules";
import { box, circle, glowText, line, roundRect, SUITS, text, type Pen } from "./kit";

/**
 * Circuit Poker's table, laid out twice.
 *
 * Wide, it is the 900 by 560 world: the target across the top, five cards in
 * a row around the engine's card anchors, the traces under them, the hand and
 * the paytable. Tall, for a phone, it is a single row of bigger cards with
 * the target, the hand and a one-column paytable in type a thumb can read,
 * because a straight scale of the wide table would put 59px cards and 5px
 * print on a 360px screen.
 *
 * The circuit is literal. Each card has a trace down to a bus, and the cards
 * that make the hand (`handCards`) are wired together and lit, with a pulse
 * running along the lit bus, so a pair lights two traces, a straight all
 * five. The paytable lights the hand you are holding.
 */

type Geometry = {
  cardW: number; cardH: number; pitch: number; cardTop: number; lift: number;
  rank: number; suit: number; heldH: number; heldText: number; hint: number;
  busY: number;
  target: { labelY: number; valueY: number; label: number; value: number; meter: Rect };
  hand: { nameY: number; name: number; worthY: number; worth: number; label: number; sideLabelY: number; sideValueY: number; sideValue: number; pip: number };
  table: { top: number; rows: number; cols: number; rowH: number; gap: number; name: number; points: number; x: number; w: number };
};

const WIDE: Geometry = {
  cardW: 148, cardH: 196, pitch: CARD_PITCH, cardTop: CARD_Y - 98, lift: 10,
  rank: 46, suit: 84, heldH: 30, heldText: 17, hint: 15,
  busY: 340,
  target: { labelY: 62, valueY: 95, label: 12, value: 34, meter: { x: 180, y: 70, w: 540, h: 22 } },
  hand: { nameY: HAND_ANCHOR.y + 2, name: 46, worthY: 420, worth: 14, label: 12, sideLabelY: 380, sideValueY: 414, sideValue: 30, pip: 9 },
  table: { top: 442, rows: 3, cols: 3, rowH: 32, gap: 4, name: 13, points: 22, x: 20, w: 860 },
};

const TALL: Geometry = {
  cardW: 164, cardH: 236, pitch: 172, cardTop: 340, lift: 14,
  rank: 74, suit: 104, heldH: 46, heldText: 32, hint: 30,
  busY: 614,
  target: { labelY: 196, valueY: 262, label: 24, value: 72, meter: { x: 40, y: 280, w: 820, h: 30 } },
  hand: { nameY: 702, name: 88, worthY: 750, worth: 30, label: 24, sideLabelY: 800, sideValueY: 848, sideValue: 48, pip: 16 },
  table: { top: 876, rows: 9, cols: 1, rowH: 36, gap: 4, name: 30, points: 40, x: 24, w: 852 },
};

const geometry = (layout: StageKind) => (layout === "tall" ? TALL : WIDE);

/** A card's rectangle in stage units; a held card sits `lift` higher. */
export function cardRect(i: number, layout: StageKind, held: boolean): Rect {
  const g = geometry(layout);
  const cx = 450 + (i - 2) * g.pitch;
  return { x: cx - g.cardW / 2, y: g.cardTop - (held ? g.lift : 0), w: g.cardW, h: g.cardH };
}

/** Which card, if any, is under a point in stage units. The lifted strip of a held card counts. */
export function cardAt(point: Point, layout: StageKind): number | null {
  const g = geometry(layout);
  if (point.y < g.cardTop - g.lift || point.y > g.cardTop + g.cardH) return null;
  for (let i = 0; i < 5; i++) {
    const r = cardRect(i, layout, false);
    if (point.x >= r.x && point.x <= r.x + r.w) return i;
  }
  return null;
}

/** Where a poker event's wide-table point sits on the given layout, in stage units. */
export function pokerPoint(at: Point, layout: StageKind): Point {
  if (layout === "wide") return { x: at.x, y: at.y };
  if (Math.abs(at.y - CARD_Y) < 0.5) {
    const i = Math.max(0, Math.min(4, Math.round((at.x - 450) / CARD_PITCH) + 2));
    const r = cardRect(i, "tall", false);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  if (at.x === HAND_ANCHOR.x && at.y === HAND_ANCHOR.y) return { x: 450, y: TALL.hand.nameY - 2 };
  return { x: at.x, y: 150 + (at.y / 560) * 1090 };
}

function rankLabel(card: number) {
  const rank = (card % 13) + 2;
  return rank < 11 ? String(rank) : ["J", "Q", "K", "A"][rank - 11];
}

function drawCard(pen: Pen, g: Geometry, r: Rect, card: number, index: number, held: boolean, inHand: boolean, hud: boolean) {
  const { c, p } = pen;
  const suit = Math.floor(card / 13), colour = suit % 2 ? p.accent : p.ink;
  // The face stays opaque and dark, so a held card's rank keeps its contrast;
  // held is said by the lift, the bright edge, the glow ring outside it and the strip.
  if (held) {
    c.globalCompositeOperation = "lighter";
    roundRect(c, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 11);
    c.lineWidth = 8;
    c.strokeStyle = p.inkGlow;
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  roundRect(c, r.x, r.y, r.w, r.h, 8);
  c.fillStyle = p.panel;
  c.fill();
  if (held) {
    c.fillStyle = p.inkSoft;
    c.fill();
  }
  c.lineWidth = held ? 3 : 2;
  c.strokeStyle = held ? p.bright : inHand ? p.ink : p.dim;
  c.stroke();
  roundRect(c, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 5);
  c.lineWidth = 1;
  c.strokeStyle = p.line;
  c.stroke();
  text(pen, rankLabel(card), r.x + g.rank * 0.28, r.y + g.rank * 0.98, g.rank, colour, "left", true);
  text(pen, SUITS[suit], r.x + r.w / 2, r.y + r.h * 0.66, g.suit, colour, "center");
  if (held) {
    box(c, r.x + 3, r.y + r.h - g.heldH - 3, r.w - 6, g.heldH, p.bright, null);
    c.font = `bold ${g.heldText}px ${pen.theme.mono}`;
    c.fillStyle = p.bg;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(screenCopy.held, r.x + r.w / 2, r.y + r.h - g.heldH / 2 - 3);
    c.textBaseline = "alphabetic";
  } else if (hud) {
    text(pen, String(index + 1), r.x + r.w / 2, r.y + r.h - g.hint * 0.7, g.hint, p.dim, "center");
  }
}

/** The traces: one from each card to the bus; the cards in the hand wired together and lit. */
function drawTraces(pen: Pen, g: Geometry, s: PokerState, lit: boolean[], layout: StageKind) {
  const { c, p } = pen;
  const xs = [0, 1, 2, 3, 4].map((i) => 450 + (i - 2) * g.pitch);
  const on = xs.filter((_, i) => lit[i]);
  line(c, { x: xs[0], y: g.busY }, { x: xs[4], y: g.busY }, p.line, layout === "tall" ? 3 : 2);
  xs.forEach((x, i) => {
    const r = cardRect(i, layout, s.held[i]);
    line(c, { x, y: r.y + r.h }, { x, y: g.busY }, lit[i] ? p.bright : p.dim, lit[i] ? 3 : 2, lit[i] ? p.brightGlow : undefined);
  });
  if (on.length >= 2) {
    const a = Math.min(...on), b = Math.max(...on);
    line(c, { x: a, y: g.busY }, { x: b, y: g.busY }, p.bright, 3, p.brightGlow);
    // Current in the circuit: a spark running along the lit bus.
    const run = b - a, t = (s.time * 1.4) % 1;
    circle(c, a + run * t, g.busY, layout === "tall" ? 7 : 4, p.accentBright, true, p.accentGlow);
  }
  xs.forEach((x, i) => circle(c, x, g.busY, layout === "tall" ? 8 : 5, lit[i] ? p.bright : p.dim, lit[i], lit[i] ? p.brightGlow : undefined));
}

function drawPaytable(pen: Pen, g: Geometry, rank: number) {
  const { c, p } = pen;
  const t = g.table, colW = (t.w - (t.cols - 1) * 10) / t.cols;
  HAND_NAMES.forEach((name, i) => {
    const col = Math.floor(i / t.rows), row = i % t.rows;
    const x = t.x + col * (colW + 10), y = t.top + row * (t.rowH + t.gap);
    // The hand you hold is lit solid, dark type on phosphor, so it reads at a glance.
    const lit = i === rank;
    box(c, x, y, colW, t.rowH, lit ? p.bright : p.panel, lit ? null : p.line, lit ? p.brightGlow : undefined, 1);
    text(pen, name, x + t.name * 0.9, y + t.rowH / 2 + t.name * 0.36, t.name, lit ? p.bg : p.ink);
    text(pen, String(HAND_POINTS[i]), x + colW - t.name * 0.9, y + t.rowH / 2 + t.points * 0.34, t.points, lit ? p.bg : p.dim, "right", true);
  });
}

/** Circuit Poker's table. `hud` off (an attract screen) keeps the cards, the traces and the hand and drops the small print. */
export function drawPoker(pen: Pen, s: PokerState, hud: boolean, layout: StageKind = "wide") {
  const { c, p } = pen;
  const g = geometry(layout);
  const lit = s.cards.length === 5 ? handCards(s.cards) : [false, false, false, false, false];

  // The target: banked against what this circuit asks for.
  const tg = g.target;
  if (hud) {
    text(pen, screenCopy.table.banked, 40, tg.labelY, tg.label, p.accent);
    glowText(pen, String(s.bank), 40, tg.valueY, tg.value, p.bright, p.brightGlow, "left");
    text(pen, screenCopy.table.target, 860, tg.labelY, tg.label, p.accent, "right");
    text(pen, String(s.target), 860, tg.valueY, tg.value, p.ink, "right", true);
  }
  meter(pen, tg.meter.x, tg.meter.y, tg.meter.w, tg.meter.h, Math.min(1, s.bank / s.target), undefined, 20);

  drawTraces(pen, g, s, lit, layout);
  s.cards.forEach((card, i) => drawCard(pen, g, cardRect(i, layout, s.held[i]), card, i, s.held[i], lit[i], hud));

  const h = g.hand;
  glowText(pen, s.handName, 450, h.nameY, h.name, p.bright, p.brightGlow);
  if (!hud) return;
  text(pen, `${screenCopy.table.worth} ${s.handPoints}`, 450, h.worthY, h.worth, p.accent, "center");
  text(pen, screenCopy.table.draws, 40, h.sideLabelY, h.label, p.accent);
  for (let i = 0; i < POKER_DRAWS; i++) {
    const on = i < s.redraws, x = 40 + h.pip + i * h.pip * 3, y = h.sideValueY - h.pip;
    circle(c, x, y, h.pip, on ? p.bright : p.dim, on, on ? p.brightGlow : undefined);
  }
  text(pen, screenCopy.table.hand, 860, h.sideLabelY, h.label, p.accent, "right");
  text(pen, `${POKER_HANDS - s.hands + 1} / ${POKER_HANDS}`, 860, h.sideValueY, h.sideValue, p.ink, "right", true);

  drawPaytable(pen, g, s.handRank);
}

