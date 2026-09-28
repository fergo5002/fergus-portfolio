import { evaluateHand } from "../poker-rules";
import { banner, baseState, rand, sound, type BaseState, type GameModule, type Point } from "./types";

/**
 * CIRCUIT POKER: five-card draw as a puzzle. Hold what you want, draw up to
 * twice, bank the hand. Three hands to bank enough to meet the circuit's
 * target; meet it and the next circuit asks for more.
 *
 * The rules are the release's, unchanged by the 2026-09-27 split, so a score
 * on the board means what it always meant. Cards are 0 to 51: rank is
 * `card % 13` (two to ace), suit is `floor(card / 13)`.
 */

export type PokerState = BaseState & {
  id: "poker";
  /** The circuit number, from 1. */
  level: number;
  cards: number[];
  deck: number[];
  discarded: number[];
  held: boolean[];
  /** Draws left in this hand. */
  redraws: number;
  /** Hands left in this circuit, counting the one on the table. */
  hands: number;
  target: number;
  /** Points banked towards this circuit's target. */
  bank: number;
  handName: string;
  handPoints: number;
  /** 0 (high card) to 8 (straight flush), for the paytable highlight. */
  handRank: number;
};

export const POKER_HANDS = 3;
export const POKER_DRAWS = 2;

/** The target for a circuit: 180, then 1.62 times the last, rounded. */
export function targetFor(level: number): number {
  return Math.round(180 * 1.62 ** (level - 1));
}

/**
 * Where things happen on the wide table, in world pixels, for the tube's
 * light: the middle of each card, and the hand's name under them. The drawer
 * lays the wide table out around exactly these points and maps them onto its
 * tall layout for a phone (`lib/arcade/draw/poker.ts`).
 */
export const CARD_PITCH = 164;
export const CARD_Y = 218;
export function cardAnchor(i: number): Point {
  return { x: 450 + (i - 2) * CARD_PITCH, y: CARD_Y };
}
export const HAND_ANCHOR: Point = { x: 450, y: 392 };

const circuit = (n: number) => `CIRCUIT ${String(n).padStart(2, "0")}`;

function rate(s: PokerState) {
  const hand = evaluateHand(s.cards);
  s.handName = hand.name; s.handPoints = hand.points; s.handRank = hand.rank;
}

function deal(s: PokerState) {
  s.deck = Array.from({ length: 52 }, (_, i) => i); s.discarded = [];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]]; }
  s.cards = s.deck.splice(0, 5); s.held = [false, false, false, false, false]; s.redraws = POKER_DRAWS;
  rate(s);
}

/** Which cards a sensible player keeps: pairs and better, then a four-flush, then court cards. */
export function desiredHolds(cards: readonly number[]): boolean[] {
  const ranks = cards.map((c) => (c % 13) + 2), suits = cards.map((c) => Math.floor(c / 13));
  const rankCount = new Map<number, number>();
  for (const r of ranks) rankCount.set(r, (rankCount.get(r) ?? 0) + 1);
  if ([...rankCount.values()].some((n) => n >= 2)) return ranks.map((r) => (rankCount.get(r) ?? 0) >= 2);
  if (evaluateHand([...cards]).rank >= 4) return cards.map(() => true);
  const suitCount = new Map<number, number>();
  for (const su of suits) suitCount.set(su, (suitCount.get(su) ?? 0) + 1);
  const flushSuit = [...suitCount.entries()].find(([, n]) => n >= 4)?.[0];
  if (flushSuit !== undefined) return suits.map((su) => su === flushSuit);
  const court = ranks.map((r) => r >= 11);
  if (court.some(Boolean)) {
    let kept = 0;
    return court.map((keep) => keep && kept++ < 2);
  }
  return cards.map(() => false);
}

export const poker: GameModule<PokerState> = {
  id: "poker",
  input: "keys",

  create(seed) {
    const s: PokerState = {
      ...baseState("poker", seed),
      level: 1, cards: [], deck: [], discarded: [], held: [], redraws: POKER_DRAWS, hands: POKER_HANDS,
      target: targetFor(1), bank: 0, handName: "", handPoints: 0, handRank: 0,
    };
    deal(s);
    banner(s, circuit(1), `TARGET ${s.target}`);
    return s;
  },

  step() {
    /* Nothing moves between presses. Time, the flash and the banner are the engine's. */
  },

  press(s, key) {
    if (/^[1-5]$/.test(key)) {
      const i = Number(key) - 1;
      s.held[i] = !s.held[i];
      sound(s, "hit", cardAnchor(i));
      return;
    }
    if (key === "action" && s.redraws > 0) {
      s.cards = s.cards.map((c, i) => { if (s.held[i]) return c; s.discarded.push(c); return s.deck.shift()!; });
      s.redraws--;
      rate(s);
      sound(s, "start", HAND_ANCHOR);
      return;
    }
    if (key === "bank") {
      const name = s.handName, points = s.handPoints;
      s.score += points; s.bank += points; s.hands--;
      sound(s, "score", HAND_ANCHOR);
      if (s.bank >= s.target) {
        s.level++;
        s.score += 100 * (s.level - 1);
        s.target = targetFor(s.level); s.bank = 0; s.hands = POKER_HANDS;
        banner(s, "CIRCUIT COMPLETE", `${circuit(s.level)} // TARGET ${s.target}`, 2.2);
      } else if (s.hands === 0) {
        s.over = true;
        return;
      } else {
        banner(s, name, `+${points} BANKED`, 1.1, "small");
      }
      deal(s);
    }
  },

  /** No HUD meter: the target is the whole game, so the table draws it big (`draw/poker.ts`). */
  hud(s) {
    return {
      lives: { current: s.hands, max: POKER_HANDS, icon: "hand" },
      stage: { label: "CIRCUIT", value: s.level },
    };
  },

  /** Toggle towards a sensible hold, draw, and bank when the draws run out. */
  demo(s, m) {
    const press: string[] = [];
    if (s.time - m.lastAct < 1.15) return { hold: new Set(), press };
    m.lastAct = s.time;
    if (s.redraws > 0) {
      const want = desiredHolds(s.cards);
      const toggles = want.map((w, i) => (w !== s.held[i] ? String(i + 1) : null)).filter((k): k is string => k !== null);
      if (toggles.length && !m.flag) {
        press.push(...toggles);
        m.flag = true;
        return { hold: new Set(), press };
      }
      m.flag = false;
      press.push("action");
      return { hold: new Set(), press };
    }
    m.flag = false;
    press.push("bank");
    return { hold: new Set(), press };
  },
};
