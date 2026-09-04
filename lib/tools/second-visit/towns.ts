import { TOWN_ROWS } from "./towns.generated";

/**
 * Town centroids, and the one thing they are for.
 *
 * A booking export has a town, not an address, so the distance a band is drawn
 * from is centroid to centroid. Inside a large town that is out by a few
 * kilometres, which moves nobody between bands except on a boundary, and the
 * boundaries are sliders. The page says this in a sentence rather than hiding
 * it, because a number presented to three decimal places invites more trust
 * than a centroid deserves.
 *
 * **The lookup is exact after normalisation and never fuzzy.** A near match
 * would put a customer in a band on the strength of a typo, and the band
 * changes the verdict. An unmatched town is `unknown`, which the model treats
 * as a factor of 1.00, because not knowing where somebody lives is a gap in the
 * records and must not be charged to the customer as suspicion.
 */

export type Town = {
  name: string;
  county: string;
  country: string;
  lat: number;
  lng: number;
  population: number;
};

export const TOWNS: readonly Town[] = TOWN_ROWS.map(
  ([name, county, country, lat, lng, population]) => ({ name, county, country, lat, lng, population }),
);

export const TOWNS_ATTRIBUTION = "Town coordinates from GeoNames, CC BY 4.0.";

const COUNTY_PREFIX = /^(co\.?|county)\s+/;
const DUBLIN_DISTRICT = /^dublin\s+\d+\s*w?$/;

/**
 * Everything a person might type round a town name, taken off.
 *
 * The order matters: accents are folded before punctuation, because a combining
 * mark is not punctuation, and the county wrapper comes off after the comma
 * split so "Longford, Co. Longford" reduces to one name rather than two.
 */
export function normaliseTownName(input: string): string {
  let text = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // A comma usually separates a town from its county, and the town is first.
  const [head] = text.split(",");
  text = head
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^the /, "");
  text = text.replace(COUNTY_PREFIX, "");
  if (DUBLIN_DISTRICT.test(text)) return "dublin";
  return text;
}

const INDEX: Map<string, Town> = (() => {
  const index = new Map<string, Town>();
  const consider = (key: string, town: Town) => {
    if (key === "") return;
    const existing = index.get(key);
    if (!existing || town.population > existing.population) index.set(key, town);
  };
  for (const town of TOWNS) consider(normaliseTownName(town.name), town);
  // A county name resolves to its largest place, so "Co. Leitrim" in a town
  // column is a coordinate rather than a shrug.
  for (const town of TOWNS) if (town.county) consider(normaliseTownName(town.county), town);
  return index;
})();

export function findTown(input: string | null | undefined): Town | null {
  if (!input) return null;
  return INDEX.get(normaliseTownName(input)) ?? null;
}

/** Biggest first, which is the order a picker wants. */
export function townOptions(): readonly Town[] {
  return [...TOWNS].sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
}

