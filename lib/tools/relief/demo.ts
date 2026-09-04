import { HOURS, WEEKS, type ReliefEvent } from "./types";

/**
 * The demo year.
 *
 * `mulberry` and `bump` are lifted verbatim from Tigh Sauna's
 * `apps/site/src/lib/survey/terrain.ts` (branch `feat/ordnance-survey`), and
 * the shaping follows the same technique as its `buildField`: a sum of
 * Gaussian hills on each axis, then noise, then a count.
 *
 * IMPORTANT, and the page repeats it: this is generated, not measured. It is
 * here so the tool has ground on it before a visitor has given it anything,
 * which is a better first impression than an empty form and a worse one than a
 * fabricated dataset presented as somebody's real year. So it says which it is.
 */

/** Fixed, so the page is the same page for everyone who opens it. */
export const DEMO_SEED = 20260903;

/** Deterministic PRNG. A venue must not get a different year on reload. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ridge or a basin centred on `at`, `spread` wide, `height` tall. */
function bump(x: number, at: number, spread: number, height: number): number {
  return height * Math.exp(-Math.pow((x - at) / spread, 2));
}

/**
 * Knuth. Bounded in practice because `lambda` is capped below, and a count is
 * what an hour of commits actually is: a number of independent arrivals.
 */
function poisson(rnd: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}

export function demoEvents(seed: number = DEMO_SEED): ReliefEvent[] {
  const rnd = mulberry(seed);
  const out: ReliefEvent[] = [];

  for (let hour = 0; hour < HOURS; hour++) {
    for (let week = 0; week < WEEKS; week++) {
      const day =
        bump(hour, 10, 2.6, 3.1) + // the morning, once the coffee lands
        bump(hour, 15, 3.0, 3.6) + // the afternoon, which is the work
        bump(hour, 22, 2.2, 2.4) + // the evening, which is the interesting part
        bump(hour, 4, 3.0, -1.6); // the small hours, which are not
      const season =
        bump(week, 6, 6, 0.7) + // a spring push
        bump(week, 38, 8, 1.1) + // the autumn one, which is bigger
        bump(week, 29, 3.5, -1.2) + // August, everybody is away
        bump(week, 51, 2, -1.4); // Christmas
      const lambda = Math.min(12, Math.max(0, 0.35 + day + season + (rnd() - 0.5) * 0.9));
      const n = poisson(rnd, lambda);
      for (let i = 0; i < n; i++) out.push({ week, hour });
    }
  }
  return out;
}
