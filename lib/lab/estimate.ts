import { bounded, random } from "./random";
export type Range = { min: number; likely: number; max: number };
export type EstimateTemplate = "event" | "project" | "runway";
export const formulas = {
  event: (x: Record<string, number>) =>
    x.guests * (x.ticket - x.variable) - x.fixed,
  project: (x: Record<string, number>) => x.days * x.rate + x.extra,
  runway: (x: Record<string, number>) =>
    x.cash / Math.max(1, x.costs - x.income),
};
const fields = {
  event: ["guests", "ticket", "variable", "fixed"],
  project: ["days", "rate", "extra"],
  runway: ["cash", "costs", "income"],
};
export function estimate(
  template: EstimateTemplate,
  ranges: Record<string, Range>,
  seed: number,
  samples = 2000,
) {
  bounded(samples, 100, 10000);
  const keys = fields[template];
  if (!keys) throw new Error("Unknown model.");
  keys.forEach((k) => {
    const r = ranges[k];
    if (
      !r ||
      ![r.min, r.likely, r.max].every(Number.isFinite) ||
      r.min < 0 ||
      r.min > r.likely ||
      r.likely > r.max ||
      r.max > 1e9
    )
      throw new Error(`Check the low, likely and high values for ${k}.`);
  });
  if (template === "runway" && ranges.costs.min <= ranges.income.max)
    throw new Error(
      "This runway model requires costs to exceed income across every input range.",
    );
  const rng = random(seed),
    f = formulas[template];
  const results = Array.from({ length: samples }, () => {
    const x: Record<string, number> = {};
    keys.forEach((k) => {
      const r = ranges[k],
        u = rng(),
        width = r.max - r.min;
      x[k] =
        width === 0
          ? r.min
          : u < (r.likely - r.min) / width
            ? r.min + Math.sqrt(u * width * (r.likely - r.min))
            : r.max - Math.sqrt((1 - u) * width * (r.max - r.likely));
    });
    return f(x);
  }).sort((a, b) => a - b);
  const base = Object.fromEntries(keys.map((k) => [k, ranges[k].likely]));
  const sensitivity = keys
    .map((key) => ({
      key,
      low: f({ ...base, [key]: ranges[key].min }),
      high: f({ ...base, [key]: ranges[key].max }),
    }))
    .sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
  const min = results[0],
    max = results.at(-1)!,
    bins = Array.from({ length: 24 }, (_, i) => ({
      from: min + ((max - min) * i) / 24,
      count: 0,
    }));
  results.forEach(
    (v) =>
      bins[Math.min(23, Math.floor(((v - min) / (max - min || 1)) * 24))]
        .count++,
  );
  return {
    mean: results.reduce((a, b) => a + b, 0) / samples,
    p10: results[Math.floor(samples * 0.1)],
    p50: results[Math.floor(samples * 0.5)],
    p90: results[Math.floor(samples * 0.9)],
    positive: results.filter((v) => v > 0).length / samples,
    bins,
    sensitivity,
  };
}
