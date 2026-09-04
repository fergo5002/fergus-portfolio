/**
 * Writes the four committed fixture inputs for the oracle.
 *
 *   node scripts/second-visit/make-fixture.mjs
 *
 * Deterministic: same seed, same bytes, so re-running it on an unchanged
 * generator produces no diff. Imports the TypeScript generator directly on
 * Node's built-in type stripping (Node 23.6 and later; CI runs 24), which is
 * how there is one generator rather than a copy that drifts.
 *
 * **Both imports carry a `.ts` extension and point at modules that import
 * nothing themselves.** Node's ESM resolver has no extension guessing and no
 * `@/` alias, so `towns.generated.ts` is imported directly rather than through
 * `towns.ts`, which would drag in a `./towns.generated` that Node cannot
 * resolve. The bundler and vitest both resolve that form; Node does not, and
 * this script is the only thing that runs outside them.
 *
 * The outputs are committed. Nothing regenerates them in CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generate } from "../../lib/tools/second-visit/demo.ts";
import { TOWN_ROWS } from "../../lib/tools/second-visit/towns.generated.ts";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`this script needs Node 23.6 or later for TypeScript imports; this is ${process.version}`);
  process.exit(1);
}

const OUT = "lib/tools/second-visit/oracle";
const SEED = 4242;
const VENUE = "Longford";
mkdirSync(OUT, { recursive: true });

const file = generate({ seed: SEED, customers: 400, months: 24, startIso: "2024-09-01", venueTown: VENUE });
writeFileSync(`${OUT}/bookings.csv`, file.csv, "utf8");

// Only the towns the fixture mentions, plus the venue, so the SQL side needs
// no copy of the generated table.
const mentioned = new Set(
  file.csv
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[6])
    .filter(Boolean),
);
mentioned.add(VENUE);
const rows = [...mentioned]
  .map((name) => TOWN_ROWS.find((t) => t[0].toLowerCase() === name.toLowerCase()))
  .filter(Boolean)
  .sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(
  `${OUT}/towns.csv`,
  ["name,county,country,lat,lng", ...rows.map((t) => `${t[0]},${t[1]},${t[2]},${t[3]},${t[4]}`)].join("\n") + "\n",
  "utf8",
);

writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify(
    { seed: SEED, venueTown: VENUE, asOfIso: file.asOfIso, customers: file.customers, rows: file.rows },
    null,
    2,
  ) + "\n",
  "utf8",
);

/* -- the scalar argument table ---------------------------------------------
 * Hand-picked edges first, because those are the cases that matter, then a
 * deterministic sweep so the functions are exercised on values nobody chose.
 */
const bands = ["local", "catchment", "regional", "distant", "visitor", "unknown", "nonsense"];
const scalars = [];
const add = (fn, args) => scalars.push({ i: scalars.length, fn, args });

for (const [lat1, lng1, lat2, lng2] of [
  [53.8608, -7.5806, 53.3498, -6.2603],
  [53.3498, -6.2603, 53.3498, -6.2603],
  [null, -6.2603, 53.3498, -6.2603],
  [53.3498, null, 53.3498, -6.2603],
  [51.8985, -8.4756, 54.5973, -5.9301],
]) add("distance_km", [lat1, lng1, lat2, lng2]);

for (const km of [null, 0, 14.999, 15, 15.001, 44.999, 45, 45.001, 94.999, 95, 95.001, 98, 5000]) {
  for (const same of [true, false, null]) add("distance_band", [km, same]);
}
for (const band of bands) add("distance_prior_factor", [band]);
for (const raw of [null, 0.5, 1, 1.35, 2.2, 4, 8]) {
  for (const n of [null, -3, 0, 1, 2, 3, 9, 40]) add("blend_prior", [raw, n]);
}
for (const observed of [null, 0, 3, 14, 30, 365.5]) {
  for (const n of [null, -1, 0, 1, 2, 10]) {
    for (const prior of [null, 30, 45.5]) add("shrink", [observed, n, prior]);
  }
}
for (const m of [null, -1, 0, 0.001, 0.25, 0.5, 0.9, 1, 1.111, 2, 100]) add("season_factor", [m]);
for (const base of [null, 0, 1, 30, 200]) {
  for (const d of [null, 1, 2.5, 8]) {
    for (const s of [null, 0.6, 1, 3]) {
      for (const c of [null, 1, 1.25]) add("expected_gap_days", [base, d, s, c]);
    }
  }
}
for (const visits of [null, 0, 1, 2, 4, 10]) {
  for (const ratio of [null, 0, 0.999, 1, 1.5, 1.999, 2, 7]) {
    for (const flags of [
      [false, false, false, false],
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
      [true, false, false, true],
      [null, null, null, null],
    ]) add("retention_verdict", [visits, ratio, ...flags]);
  }
}
for (const consent of [true, false, null]) {
  for (const email of [true, false, null]) {
    for (const phone of [true, false, null]) {
      for (const suppressed of [true, false, null]) add("reachability", [consent, email, phone, suppressed]);
    }
  }
}
for (const band of bands) {
  for (const visits of [null, 0, 1, 3, 9, 20, 500]) add("p_return_prior", [band, visits]);
}
for (const successes of [null, 0, 1, 60]) {
  for (const trials of [null, 0, 1, 100]) {
    for (const prior of [null, 0, 0.1, 0.6]) add("smooth_rate", [successes, trials, prior, 20]);
  }
}
for (const p of [null, 0, 0.25, 1]) {
  for (const margin of [null, -5000, 0, 5, 4000, 123456]) {
    for (const reach of [null, 0, 0.6, 1]) add("winnability_cents", [p, margin, reach]);
  }
}

writeFileSync(`${OUT}/scalars.json`, JSON.stringify(scalars) + "\n", "utf8");
console.log(`bookings ${file.rows} rows, ${file.customers} customers, as of ${file.asOfIso}`);
console.log(`towns ${rows.length}`);
console.log(`scalars ${scalars.length}`);

