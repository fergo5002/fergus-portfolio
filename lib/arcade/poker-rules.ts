/** Cards are 0..51, rank 2..A within each of four suits. Pure five-card evaluator. */
export const HAND_NAMES = ["HIGH CARD", "ONE PAIR", "TWO PAIR", "THREE OF A KIND", "STRAIGHT", "FLUSH", "FULL HOUSE", "FOUR OF A KIND", "STRAIGHT FLUSH"] as const;
export const HAND_POINTS = [20, 70, 150, 240, 360, 450, 650, 1100, 1800] as const;
export function evaluateHand(cards: readonly number[]) {
  if (cards.length !== 5 || new Set(cards).size !== 5 || cards.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error("Expected five distinct cards");
  const ranks = cards.map(c => c % 13 + 2).sort((a, b) => b - a);
  const counts = new Map<number, number>(); ranks.forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => Math.floor(c / 13) === Math.floor(cards[0] / 13));
  const wheel = ranks.join() === "14,5,4,3,2";
  const straight = counts.size === 5 && (ranks[0] - ranks[4] === 4 || wheel);
  const rank = straight && flush ? 8 : groups[0][1] === 4 ? 7 : groups[0][1] === 3 && groups[1][1] === 2 ? 6 : flush ? 5 : straight ? 4 : groups[0][1] === 3 ? 3 : groups[0][1] === 2 && groups[1][1] === 2 ? 2 : groups[0][1] === 2 ? 1 : 0;
  const tie = straight ? [wheel ? 5 : ranks[0]] : groups.map(g => g[0]);
  const value = tie.reduce((v, r, i) => v + r * 15 ** (4 - i), rank * 15 ** 5);
  return { rank, value, name: HAND_NAMES[rank], points: HAND_POINTS[rank] };
}
