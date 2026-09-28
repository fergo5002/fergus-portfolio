import { loreCopy } from "@/content/studio/lore-copy";

/**
 * The invented chat Group Lore opens on: seven months of a group of five, as
 * a WhatsApp text export, so the example goes through the same parser as a
 * visitor's own file.
 *
 * It is rendered on the server and again in the browser, so two rules hold:
 *
 * - **It is the same text every time.** A seeded generator (mulberry32), no
 *   clock and no `Math.random`.
 * - **It means the same hours in every timezone.** The calendar is counted in
 *   UTC integers and only ever written out as text; the parser then reads the
 *   text in local time, where a Tuesday at 21:00 is a Tuesday at 21:00. The
 *   one place that fails is a spring-forward gap, where local 01:30 does not
 *   exist and the parser's Date lands at 02:30, so the server (UTC) and a
 *   browser in Dublin would draw that message in different cells and the
 *   page would not hydrate. Every such gap near this chat's months falls
 *   between midnight and four on a Friday, Saturday or Sunday in March or
 *   April (Europe, North America, Cuba, Lebanon, Israel, Egypt, Morocco), so
 *   the generator writes nothing then.
 *
 * The rhythm is modelled, not measured: evenings brightest, a lunchtime bump,
 * commute mornings, later nights at the weekend, a trip in May that doubles
 * the traffic and a quiet stretch at the end of July. Each voice has its own
 * habits, so focusing on one changes the week.
 */
export const EXAMPLE_SEED = 20260928;

const FIRST_DAY = Date.UTC(2026, 1, 2); // Monday 2 February 2026
const DAYS = 210;
const DAY_MS = 86_400_000;

/** Relative likelihood of a conversation starting in each hour, by kind of day. */
const WEEKDAY = [0.3, 0.1, 0.04, 0.02, 0.02, 0.05, 0.2, 0.8, 1.0, 0.5, 0.4, 0.6, 1.3, 1.1, 0.4, 0.4, 0.6, 1.0, 1.2, 1.6, 2.2, 2.6, 2.2, 1.0];
const FRIDAY = [0.3, 0.1, 0.04, 0.02, 0.02, 0.05, 0.2, 0.7, 0.9, 0.4, 0.4, 0.6, 1.3, 1.1, 0.5, 0.6, 1.0, 1.4, 1.8, 2.0, 2.2, 2.4, 2.4, 1.8];
const SATURDAY = [1.4, 1.0, 0.4, 0.1, 0.02, 0.02, 0.05, 0.1, 0.3, 0.9, 1.5, 1.8, 1.8, 1.4, 1.0, 0.9, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 1.6, 1.2];
const SUNDAY = [1.0, 0.6, 0.2, 0.05, 0.02, 0.02, 0.05, 0.1, 0.3, 0.7, 1.2, 1.6, 1.6, 1.4, 1.0, 0.8, 0.9, 1.2, 1.6, 1.8, 1.6, 1.2, 0.8, 0.4];
/** Conversations a day, Monday to Sunday, before the season. */
const PER_DAY = [2.4, 2.5, 2.7, 3.0, 3.9, 3.4, 2.9];

type Topic = keyof typeof loreCopy.example.topics;

/** Each voice's weight by band of the day: small hours, morning, lunch, afternoon, evening, late. */
const HABITS: Record<string, number[]> = {
  Aoife: [0.6, 1.0, 1.0, 1.2, 1.8, 1.2],
  Cian: [2.0, 0.3, 0.6, 0.8, 1.1, 1.9],
  Niamh: [0.3, 1.4, 1.9, 1.0, 0.9, 0.5],
  Rory: [0.4, 1.9, 0.8, 0.9, 1.0, 0.7],
  Saoirse: [1.0, 0.6, 0.9, 1.3, 1.2, 1.0],
};
const band = (h: number) => (h < 5 ? 0 : h < 11 ? 1 : h < 14 ? 2 : h < 18 ? 3 : h < 22 ? 4 : 5);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[], weights?: readonly number[]): T {
  const w = weights ?? items.map(() => 1);
  let roll = random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= w[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Knuth's Poisson draw: how many conversations a day of rate `lambda` holds. */
function poisson(random: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = random();
  while (p > limit) {
    k++;
    p *= random();
  }
  return k;
}

/** The season: a trip in May, a quiet end of July, and a slow swell in between. */
function season(day: number): number {
  if (day >= 95 && day < 116) return 2.1;
  if (day >= 168 && day < 186) return 0.45;
  return 1 + 0.25 * Math.sin((day / DAYS) * Math.PI * 3);
}

function topicFor(random: () => number, weekday: number, hour: number, day: number): Topic {
  if (day >= 88 && day < 116 && random() < 0.5) return "trip";
  if (weekday >= 5) {
    if (hour >= 9 && hour < 15) return weekday === 6 && random() < 0.45 ? "sunday" : "weekend";
    if (weekday === 6 && hour >= 15) return pick(random, ["sunday", "plans", "match"] as Topic[], [2, 1, 1]);
    return pick(random, ["weekend", "plans", "match"] as Topic[], [2, 2, 1]);
  }
  if (hour >= 7 && hour < 10) return pick(random, ["late", "plans"] as Topic[], [2, 1]);
  if (hour >= 11 && hour < 15) return pick(random, ["lunch", "plans"] as Topic[], [3, 1]);
  if (hour >= 17 && hour < 20) return pick(random, ["plans", "late", "match"] as Topic[], [3, 2, 1]);
  return pick(random, ["plans", "match", "late"] as Topic[], [3, 2, 1]);
}

/** A spring-forward gap in some timezone could swallow this hour: write nothing here. */
function inClockChange(month: number, weekday: number, hour: number): boolean {
  return (month === 2 || month === 3) && weekday >= 4 && hour < 4;
}

const two = (n: number) => String(n).padStart(2, "0");

/** The example, as WhatsApp text in day/month/year order. */
export function exampleChat(seed: number = EXAMPLE_SEED): string {
  const random = mulberry32(seed);
  const { voices, topics } = loreCopy.example;
  const lines: { at: number; line: string }[] = [];
  for (let day = 0; day < DAYS; day++) {
    const weekday = (new Date(FIRST_DAY + day * DAY_MS).getUTCDay() + 6) % 7;
    const profile = weekday === 4 ? FRIDAY : weekday === 5 ? SATURDAY : weekday === 6 ? SUNDAY : WEEKDAY;
    const conversations = poisson(random, PER_DAY[weekday] * season(day));
    for (let c = 0; c < conversations; c++) {
      const hour = pick(random, profile.map((_, h) => h), profile);
      const topic = topicFor(random, weekday, hour, day);
      const pool = topics[topic];
      let minute = hour * 60 + Math.floor(random() * 60);
      let last = "";
      const length = 2 + Math.min(10, poisson(random, 1.3));
      for (let m = 0; m < length; m++) {
        const at = day * 1440 + minute;
        const stamp = new Date(FIRST_DAY + at * 60_000);
        const h = stamp.getUTCHours();
        const wd = (stamp.getUTCDay() + 6) % 7;
        const weights = voices.map((v) => (v === last ? 0.15 : 1) * HABITS[v][band(h)] * (topic === "match" && v === "Rory" ? 1.6 : 1) * (topic === "weekend" && v === "Saoirse" ? 1.6 : 1));
        const sender = pick(random, voices, weights);
        const text = pick(random, pool);
        last = sender;
        minute += 1 + Math.floor(random() * 5);
        if (at >= DAYS * 1440 || inClockChange(stamp.getUTCMonth(), wd, h)) continue;
        lines.push({
          at,
          line: `${two(stamp.getUTCDate())}/${two(stamp.getUTCMonth() + 1)}/${stamp.getUTCFullYear()}, ${two(h)}:${two(stamp.getUTCMinutes())} - ${sender}: ${text}`,
        });
      }
    }
  }
  // Conversations on one day can overlap; an export is in time order. The
  // sort is stable, so two messages in one minute keep the order they were written.
  return lines
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.line)
    .join("\n");
}
