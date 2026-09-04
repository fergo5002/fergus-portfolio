
/**
 * One seeded generator, two jobs.
 *
 * The page's demo file and the oracle's fixture come out of here with different
 * seeds and sizes, which is why it is a TypeScript module in `lib/` rather than
 * a script: `scripts/second-visit/make-fixture.mjs` imports it directly, on
 * Node's built-in type stripping, so there is one generator and not two that
 * drift.
 *
 * Three properties matter and each one is a test in `demo.test.ts`:
 *
 *   1. **Deterministic.** Same seed, same bytes. A fixture that changes between
 *      runs is not a fixture.
 *   2. **No ties on anything `mode()` decides.** Every customer keeps one
 *      weekday, one hour and one party size for life, because Postgres does not
 *      promise how it breaks a tie and a difference there would be nobody's bug.
 *   3. **Every branch present.** All five distance bands, all four visit
 *      buckets, cancellations, no-shows, memberships and slots that sold out,
 *      or the oracle passes without ever reaching most of the model.
 */

export const DEMO_SEED = 20260904;
export const DEMO_FILENAME = "second-visit-demo.csv";
export const DEMO_VENUE_TOWN = "Longford";

export type GenerateOptions = {
  seed: number;
  customers: number;
  months: number;
  startIso: string;
  venueTown: string;
};

export type GeneratedFile = {
  csv: string;
  asOfIso: string;
  venueTown: string;
  customers: number;
  rows: number;
};

/** mulberry32: small, fast, and identical in every engine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS_PER_DAY = 86_400_000;
const toDay = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_PER_DAY);
const toIso = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
const dow = (day: number) => (((day + 3) % 7) + 7) % 7 + 1;

/** Weighted so most people are local and a few are not, which is the real shape. */
const TOWNS: { town: string | null; country: string | null; weight: number }[] = [
  { town: "Longford", country: "IE", weight: 30 },
  { town: "Granard", country: "IE", weight: 14 },
  { town: "Cavan", country: "IE", weight: 12 },
  { town: "Mullingar", country: "IE", weight: 10 },
  { town: "Sligo", country: "IE", weight: 6 },
  { town: "Dublin", country: "IE", weight: 12 },
  { town: "Belfast", country: "GB", weight: 4 },
  { town: "Nowheresville", country: "IE", weight: 3 },
  { town: null, country: null, weight: 9 },
];

const PRODUCTS = ["Sauna session", "Private hire", "Cold plunge", "Ten-pack"];

function pick<T extends { weight: number }>(next: () => number, items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = [
  "customer_id",
  "booking_date",
  "amount",
  "slot_start",
  "capacity",
  "status",
  "town",
  "country",
  "product",
  "party_size",
  "credits_remaining",
];

export function generate(options: GenerateOptions): GeneratedFile {
  const next = rng(options.seed);
  const startDay = toDay(options.startIso);
  const endDay = startDay + Math.round(options.months * 30.4);
  const rows: (string | number | null)[][] = [];

  for (let i = 0; i < options.customers; i++) {
    const id = `C${String(i + 1).padStart(4, "0")}`;
    const place = pick(next, TOWNS);
    const weekday = 1 + Math.floor(next() * 7);
    const hour = [11, 14, 17, 18, 20][Math.floor(next() * 5)];
    const party = next() < 0.4 ? 2 : 1;
    const member = next() < 0.12;
    const product = PRODUCTS[Math.floor(next() * PRODUCTS.length)];

    // Four kinds of customer, which is what produces all four visit buckets.
    const roll = next();
    const cadence = roll < 0.35 ? 14 : roll < 0.6 ? 30 : roll < 0.85 ? 75 : 200;
    const joins = startDay + Math.floor(next() * (endDay - startDay) * 0.9);

    // Snap every visit onto that customer's own weekday, so nothing `mode()`
    // decides is ever tied.
    let day = joins + ((weekday - dow(joins) + 7) % 7);
    let visits = 0;
    while (day <= endDay && visits < 40) {
      const status = next() < 0.05 ? "no_show" : next() < 0.06 ? "cancelled" : "completed";
      rows.push([
        id,
        toIso(day),
        (next() < 0.25 ? 55 : 45).toFixed(2),
        `${String(hour).padStart(2, "0")}:00`,
        8,
        status,
        place.town,
        place.country,
        product,
        party,
        member ? 5 : 0,
      ]);
      visits++;
      const jitter = 0.6 + next() * 0.9;
      const step = Math.max(7, Math.round(cadence * jitter));
      day += step + ((weekday - dow(day + step) + 7) % 7);
    }
  }

  // A handful of evenings that sold out, so the squeeze has something to find.
  // One synthetic regular establishes the habit and then stops before them;
  // without that customer the full slots exist but no row reaches the branch.
  let fillerDay = startDay + 400 + ((6 - dow(startDay + 400) + 7) % 7);
  for (const day of [fillerDay - 42, fillerDay - 28, fillerDay - 14]) {
    rows.push([
      "SQUEEZED",
      toIso(day),
      "45.00",
      "18:00",
      8,
      "completed",
      options.venueTown,
      "IE",
      PRODUCTS[0],
      1,
      0,
    ]);
  }

  // One regular with a clean fortnightly rhythm who stopped early. The demo
  // must populate the lapsed-regulars export rather than showing an empty
  // action file merely because a random seed kept every regular current.
  for (const day of [startDay + 70, startDay + 84, startDay + 98]) {
    rows.push([
      "LAPSED",
      toIso(day),
      "55.00",
      "11:00",
      8,
      "completed",
      options.venueTown,
      "IE",
      PRODUCTS[1],
      1,
      0,
    ]);
  }

  // Filler bookings use their own identifiers, on one weekday and hour.
  for (let week = 0; week < 40; week++) {
    // This is the deliberately congested run: leave two quieter weeks so the
    // flag is a ratio calculation, not merely "any full slot after they left".
    const full = week % 10 !== 0;
    for (let seat = 0; seat < (full ? 8 : 2); seat++) {
      rows.push([
        `F${week}-${seat}`,
        toIso(fillerDay),
        "45.00",
        "18:00",
        8,
        "completed",
        "Longford",
        "IE",
        PRODUCTS[0],
        1,
        0,
      ]);
    }
    fillerDay += 7;
  }

  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));

  const csv = [HEADER.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
  const lastDay = rows.reduce((max, row) => Math.max(max, toDay(String(row[1]))), startDay);

  return {
    csv,
    asOfIso: toIso(lastDay),
    venueTown: options.venueTown,
    customers: new Set(rows.map((row) => String(row[0]))).size,
    rows: rows.length,
  };
}

/** The file behind the page's "try it on a made-up sauna" button. */
export function demoCsv(): string {
  return generate({
    seed: DEMO_SEED,
    customers: 180,
    months: 24,
    startIso: "2024-09-01",
    venueTown: DEMO_VENUE_TOWN,
  }).csv;
}
