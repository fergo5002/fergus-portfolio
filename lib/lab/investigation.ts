import type { InvestigationCase } from "@/content/lab/cases";
export type InvestigationState = { used: string[]; spent: number };
export function investigate(
  c: InvestigationCase,
  state: InvestigationState,
  id: string,
) {
  const test = c.tests.find((t) => t.id === id);
  if (!test) throw new Error("Unknown investigation.");
  if (state.used.includes(id))
    throw new Error("You already ran this investigation.");
  if (state.spent + test.cost > c.budget)
    throw new Error("Not enough investigation budget.");
  return { used: [...state.used, id], spent: state.spent + test.cost };
}
export function scoreCase(
  c: InvestigationCase,
  state: InvestigationState,
  chosen: number,
  confidence: number,
) {
  const decisive = state.used.some((id) => {
    const t = c.tests.find((t) => t.id === id)!;
    return t.outcomes.filter((o) => o === t.outcomes[c.answer]).length === 1;
  });
  const correct = chosen === c.answer;
  return {
    correct,
    decisive,
    score: Math.round(
      (correct ? 30 : 0) +
        (decisive ? 45 : 0) +
        (correct && decisive ? ((c.budget - state.spent) / c.budget) * 15 : 0) +
        (correct ? confidence / 10 : (100 - confidence) / 10),
    ),
  };
}
