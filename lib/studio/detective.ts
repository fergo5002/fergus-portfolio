import type { InvestigationCase } from "@/content/lab/cases";
export function survivingHypotheses(c: InvestigationCase, used: string[]) {
  return c.hypotheses
    .map((_, i) => i)
    .filter((i) =>
      used.every((id) => {
        const t = c.tests.find((t) => t.id === id);
        if (!t) throw new Error("Unknown evidence.");
        return t.outcomes[i] === t.outcomes[c.answer];
      }),
    );
}
export function dailyCase(date: string, count: number) {
  let hash = 0;
  for (const c of date) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return hash % count;
}
export const calibration = (correct: boolean, confidence: number) =>
  Math.round(100 * (1 - (confidence / 100 - (correct ? 1 : 0)) ** 2));
