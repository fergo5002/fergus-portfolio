import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { parseCsv } from "./csv";
import { guessRoles, toBookings } from "./mapping";
import {
  blendPrior,
  distanceBand,
  distanceKm,
  distancePriorFactor,
  expectedGapDays,
  pReturnPrior,
  reachability,
  retentionVerdict,
  seasonFactor,
  shrink,
  smoothRate,
  winnabilityCents,
} from "./model";
import { dayFromIso } from "./numbers";
import type { Band } from "./types";

/**
 * The oracle.
 *
 * Two levels, both against output that a real Postgres 16 produced from
 * migration 0300's own SQL, committed under `oracle/`:
 *
 *   scalars   about 700 argument tuples through all twelve functions
 *   pipeline  the whole customer row over a 400-customer fixture export
 *
 * `scripts/second-visit/compare.mjs` is what produced those two files and what
 * re-checks them against Postgres on demand. Neither it nor this test ever
 * reads the port to decide what the right answer is, which is the difference
 * between an oracle and a mirror.
 *
 * **Tolerance is 1e-9 on numbers and exact on everything else.** Postgres
 * carries `numeric` and this port carries doubles, and spike S3 measured that
 * disagreement at 1.14e-13 over 100,000 rows. Anything above 1e-9 is a
 * different function rather than a different representation. A rounded column
 * that disagrees while its unrounded neighbour agrees is the documented
 * decimal-tie case in `numbers.ts`, and it is a finding to record rather than a
 * tolerance to loosen.
 */

const ORACLE = join(process.cwd(), "lib", "tools", "second-visit", "oracle");
/** LF, because git hands this checkout CRLF and CI LF for the same file. */
const read = (name: string) => readFileSync(join(ORACLE, name), "utf8").replace(/\r\n/g, "\n");

type ScalarCase = { i: number; fn: string; args: (number | boolean | string | null)[]; value: string };

const scalars: ScalarCase[] = JSON.parse(read("scalars.golden.json"));
const pipeline: Record<string, string | number | boolean | null>[] = JSON.parse(read("pipeline.golden.json"));
const manifest: { asOfIso: string; venueTown: string; customers: number; rows: number } = JSON.parse(
  read("manifest.json"),
);

const n = (value: number | boolean | string | null) =>
  value === null ? null : typeof value === "number" ? value : Number(value);
const bool = (value: number | boolean | string | null) => (value === null ? null : Boolean(value));

/** The port, called with the arguments Postgres was called with. */
function callPort(fn: string, args: (number | boolean | string | null)[]): unknown {
  switch (fn) {
    case "distance_km":
      return distanceKm(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "distance_band":
      return distanceBand(n(args[0]), bool(args[1]));
    case "distance_prior_factor":
      return distancePriorFactor(args[0] as Band);
    case "blend_prior":
      return blendPrior(n(args[0]), n(args[1]));
    case "shrink":
      return shrink(n(args[0]), n(args[1]), n(args[2]));
    case "season_factor":
      return seasonFactor(n(args[0]));
    case "expected_gap_days":
      return expectedGapDays(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "retention_verdict":
      return retentionVerdict(n(args[0]), n(args[1]), bool(args[2]), bool(args[3]), bool(args[4]), bool(args[5]));
    case "reachability":
      return reachability(bool(args[0]), bool(args[1]), bool(args[2]), bool(args[3]));
    case "p_return_prior":
      return pReturnPrior(args[0] as Band, n(args[1]));
    case "smooth_rate":
      return smoothRate(n(args[0]), n(args[1]), n(args[2]), n(args[3]));
    case "winnability_cents":
      return winnabilityCents(n(args[0]), n(args[1]), n(args[2]));
    default:
      throw new Error(`the golden file has a function this test does not call: ${fn}`);
  }
}

describe("the golden files are what this test thinks they are", () => {
  it("has a scalar case for every function, and enough of them", () => {
    expect(scalars.length).toBeGreaterThan(500);
    const covered = new Set(scalars.map((c) => c.fn));
    expect([...covered].sort()).toEqual([
      "blend_prior",
      "distance_band",
      "distance_km",
      "distance_prior_factor",
      "expected_gap_days",
      "p_return_prior",
      "reachability",
      "retention_verdict",
      "season_factor",
      "shrink",
      "smooth_rate",
      "winnability_cents",
    ]);
  });

  it("has a pipeline row for every customer in the fixture", () => {
    expect(pipeline.length).toBeGreaterThan(300);
    expect(new Set(pipeline.map((r) => r.customer_id)).size).toBe(pipeline.length);
  });

  /**
   * A golden file of nulls would agree with anything. This is the check that
   * the fixture actually reaches the branches the model is made of.
   */
  it("reaches every branch worth reaching", () => {
    const lifecycles = new Set(pipeline.map((r) => r.lifecycle));
    for (const expected of ["first_time", "repeat", "lapsed", "visiting", "committed_idle"]) {
      expect(lifecycles.has(expected), `no ${expected} row in the fixture`).toBe(true);
    }
    const bands = new Set(pipeline.map((r) => r.distance_band));
    for (const band of ["local", "catchment", "regional", "distant", "visitor", "unknown"]) {
      expect(bands.has(band), `no ${band} row in the fixture`).toBe(true);
    }
    expect(pipeline.some((r) => r.slot_squeezed === true)).toBe(true);
    expect(pipeline.every((r) => r.expected_gap_days !== null)).toBe(true);
  });
});

describe("the twelve functions agree with postgres", () => {
  it("on every argument tuple, at 1e-9", () => {
    const differences: string[] = [];
    for (const testCase of scalars) {
      const mine = callPort(testCase.fn, testCase.args);
      const theirs = testCase.value;
      const args = JSON.stringify(testCase.args);

      if (theirs === "NULL") {
        if (mine !== null) differences.push(`${testCase.fn}${args}: postgres null, port ${JSON.stringify(mine)}`);
        continue;
      }
      if (typeof mine === "string") {
        if (mine !== theirs) differences.push(`${testCase.fn}${args}: postgres ${theirs}, port ${mine}`);
        continue;
      }
      if (mine === null) {
        differences.push(`${testCase.fn}${args}: postgres ${theirs}, port null`);
        continue;
      }
      const gap = Math.abs(Number(mine) - Number(theirs));
      if (!(gap <= 1e-9)) {
        differences.push(`${testCase.fn}${args}: postgres ${theirs}, port ${mine}, apart by ${gap}`);
      }
    }
    expect(differences.slice(0, 20), `${differences.length} differences`).toEqual([]);
  });

  it("and the largest disagreement anywhere is the size representation predicts", () => {
    // Spike S3 measured 1.14e-13 between numeric and double over 100,000 rows.
    // Anything much larger than that is a different function, not a different
    // representation, and this records the number rather than assuming it.
    let worst = 0;
    let where = "none";
    for (const testCase of scalars) {
      const mine = callPort(testCase.fn, testCase.args);
      if (typeof mine !== "number" || testCase.value === "NULL") continue;
      const gap = Math.abs(mine - Number(testCase.value));
      if (gap > worst) {
        worst = gap;
        where = `${testCase.fn}${JSON.stringify(testCase.args)}`;
      }
    }
    expect(worst, `worst at ${where}`).toBeLessThan(1e-9);
  });
});

describe("the whole pipeline agrees with postgres", () => {
  const bookings = (() => {
    const sheet = parseCsv(read("bookings.csv"));
    const roles = guessRoles(sheet);
    const out = toBookings(sheet, roles);
    expect(out.ignored, "the fixture should read with nothing ignored").toBe(0);
    return out.bookings;
  })();

  const mine = analyse({
    bookings,
    asOfDay: dayFromIso(manifest.asOfIso),
    venueTown: manifest.venueTown,
  });

  const byId = new Map(mine.rows.map((row) => [row.id, row]));

  /** Golden column to the port's field, and how to read the golden value. */
  const COLUMNS: [string, keyof (typeof mine.rows)[number], "number" | "text" | "boolean"][] = [
    ["visits", "visits", "number"],
    ["observed_gaps", "observedGaps", "number"],
    ["days_since_last_visit", "daysSinceLast", "number"],
    ["visit_cadence_days", "visitCadenceDays", "number"],
    ["days_to_second_visit", "daysToSecondVisit", "number"],
    ["orders", "orders", "number"],
    ["lifetime_value_cents", "lifetimeValueCents", "number"],
    ["distance_band", "distanceBand", "text"],
    ["distance_km", "distanceKm", "number"],
    ["modal_party_size", "modalPartySize", "number"],
    ["habitual_slots_since", "habitualSlotsSince", "number"],
    ["habitual_slots_full", "habitualSlotsFull", "number"],
    ["base_gap_days", "baseGapDays", "number"],
    ["distance_factor", "distanceFactor", "number"],
    ["season_factor", "seasonFactor", "number"],
    ["companion_factor", "companionFactor", "number"],
    ["expected_gap_days", "expectedGapDays", "number"],
    ["silence_ratio", "silenceRatio", "number"],
    ["committed", "committed", "boolean"],
    ["slot_squeezed", "slotSqueezed", "boolean"],
    ["seasonal_dormant", "seasonalDormant", "boolean"],
    ["low_evidence_far", "lowEvidenceFar", "boolean"],
    ["lifecycle", "lifecycle", "text"],
    ["expected_margin_cents", "expectedMarginCents", "number"],
    ["p_return", "pReturn", "number"],
    ["p_return_observations", "pReturnObservations", "number"],
    ["winnability_cents", "winnabilityCents", "number"],
  ];

  it("has the same customers, and no others", () => {
    expect([...byId.keys()].sort()).toEqual(pipeline.map((r) => String(r.customer_id)).sort());
  });

  for (const [column, field, kind] of COLUMNS) {
    it(`agrees on ${column}`, () => {
      const differences: string[] = [];
      for (const golden of pipeline) {
        const row = byId.get(String(golden.customer_id));
        if (!row) continue;
        const theirs = golden[column];
        const ours = row[field] as unknown;
        if (theirs === null || theirs === undefined) {
          if (ours !== null) differences.push(`${golden.customer_id}: postgres null, port ${JSON.stringify(ours)}`);
          continue;
        }
        if (kind === "number") {
          if (ours === null) {
            differences.push(`${golden.customer_id}: postgres ${theirs}, port null`);
            continue;
          }
          const gap = Math.abs(Number(ours) - Number(theirs));
          if (!(gap <= 1e-9)) {
            differences.push(`${golden.customer_id}: postgres ${theirs}, port ${ours}, apart by ${gap}`);
          }
        } else if (String(ours) !== String(theirs)) {
          differences.push(`${golden.customer_id}: postgres ${theirs}, port ${ours}`);
        }
      }
      expect(differences.slice(0, 10), `${differences.length} rows differ on ${column}`).toEqual([]);
    });
  }

  it("agrees on the cohort baselines, which every row depends on", () => {
    // Not a column on the golden rows, so it is checked through the one place
    // it shows up: a first-timer's base gap is exactly the cohort's first
    // repeat median.
    const firstTimer = pipeline.find((r) => Number(r.visits) === 1);
    expect(firstTimer, "the fixture has no one-visit customer").toBeTruthy();
    const row = byId.get(String(firstTimer!.customer_id))!;
    expect(Math.abs(row.baseGapDays! - Number(firstTimer!.base_gap_days))).toBeLessThanOrEqual(1e-9);
  });
});

