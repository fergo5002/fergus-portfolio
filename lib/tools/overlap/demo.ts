import { pairedChannels, runExchange, type ExchangeResult } from "./protocol";
import type { Entry } from "./types";

/**
 * Two invented lists, so the page is never an empty form.
 *
 * The demo runs the **real** exchange through `pairedChannels` in one tab:
 * a real salt, real hashing, real framing, real intersection. It is not a
 * canned result, so a broken protocol shows here before anybody opens a second
 * browser, and the demo doubles as an exercise of the thing it demonstrates.
 *
 * One shared person is spelled differently in the two lists, on purpose. That
 * is what turns "names come from your own file" from a claim into something a
 * visitor can see: the two sides print the same person two ways.
 *
 * The generator is mulberry32, seeded, so the lists never move between reloads
 * and the shared count on the page is a fact rather than a hope.
 */

export const DEMO_SEED = 20260903;
export const DEMO_SHARED = 37;

/** Deterministic PRNG (mulberry32). */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aoife",
  "Cormac",
  "Deirdre",
  "Eoin",
  "Fiadh",
  "Grainne",
  "Hugh",
  "Iseult",
  "Jarlath",
  "Katie",
  "Liam",
  "Maire",
  "Niall",
  "Orla",
  "Padraig",
  "Roisin",
  "Sean",
  "Tadhg",
  "Una",
  "Cathal",
];
const LAST = [
  "Brennan",
  "Callaghan",
  "Doyle",
  "Egan",
  "Fitzgerald",
  "Gallagher",
  "Hayes",
  "Kavanagh",
  "Lynch",
  "Mulcahy",
  "Nolan",
  "Quinn",
  "Ryan",
  "Sheridan",
  "Treacy",
  "Walsh",
];

const slugify = (first: string, last: string, tag: string) => `${first}-${last}-${tag}`.toLowerCase();

function build(rnd: () => number, count: number, offset: number): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const first = FIRST[Math.floor(rnd() * FIRST.length)];
    const last = LAST[Math.floor(rnd() * LAST.length)];
    const tag = (offset + out.length).toString(36).padStart(4, "0");
    const slug = slugify(first, last, tag);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label: `${first} ${last}` });
  }
  return out;
}

/**
 * List A is 480 people, list B is 520, and 37 of them are the same. The shared
 * block is generated once and spliced into both, so the count is a fact rather
 * than an emergent property nobody checks.
 */
export function demoLists(): { a: Entry[]; b: Entry[] } {
  const rnd = mulberry(DEMO_SEED);
  const shared = build(rnd, DEMO_SHARED, 900_000);
  const onlyA = build(rnd, 480 - DEMO_SHARED, 100_000);
  const onlyB = build(rnd, 520 - DEMO_SHARED, 500_000);

  // The one person the two files disagree about how to spell.
  shared[0] = { slug: "sine-ni-dhomhnaill-4f2a", label: "Síne Ní Dhomhnaill" };
  const sharedForB = shared.map((e, i) => (i === 0 ? { slug: e.slug, label: "Sine Ni Dhomhnaill" } : e));

  return { a: [...onlyA, ...shared], b: [...onlyB, ...sharedForB] };
}

/**
 * The list as a file in the export's shape: three lines of preamble, the real
 * header, and one row that has no profile link, because a real export has some
 * of those and a demo file that does not would hide the counter that reports
 * them.
 */
export function demoCsv(list: readonly Entry[], owner: string): string {
  const rows = list.map((e) => {
    const [first, ...rest] = e.label.split(" ");
    return [first, rest.join(" "), `https://www.linkedin.com/in/${e.slug}`, "", "", "", "01 Mar 2024"]
      .map((cell) => (cell.includes(",") ? `"${cell}"` : cell))
      .join(",");
  });
  return [
    "Notes:",
    `"Demo connections for ${owner}. Every person in this file is invented."`,
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    ...rows,
    "Restricted,Member,,,,,02 Feb 2022",
  ].join("\r\n");
}

const DEMO_FINGERPRINTS = {
  offer: "DE:M0:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:01",
  answer: "DE:M0:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:02",
};

export async function runDemo(): Promise<{ a: ExchangeResult; b: ExchangeResult }> {
  const { a, b } = demoLists();
  const [left, right] = pairedChannels();
  const [ra, rb] = await Promise.all([
    runExchange({ side: "creator", entries: a, channel: left, fingerprints: DEMO_FINGERPRINTS }),
    runExchange({ side: "joiner", entries: b, channel: right, fingerprints: DEMO_FINGERPRINTS }),
  ]);
  return { a: ra, b: rb };
}
