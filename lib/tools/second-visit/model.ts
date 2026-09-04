import { roundTo } from "./numbers";
import type { Band, Lifecycle, ModelParams } from "./types";

/**
 * Tigh Sauna's retention model, ported.
 *
 * Source: `apps/api/migrations/0300_customer_intelligence.sql` in
 * `fergo5002/sauna-os`, commit 94f77a80debcd3e444e6609bd0c8b0068c4193db, dated
 * 2026-08-11. The SQL bodies are committed beside this file at
 * `oracle/0300-functions.sql` and `lib/tools/second-visit/oracle.test.ts`
 * checks this port against what a real Postgres 16 makes of them, over a
 * committed fixture, at 1e-9. **That test is the only reason to believe any of
 * this.** Read it before trusting a number out of here.
 *
 * Two rules the migration states and this port keeps, because they are the
 * argument rather than the implementation:
 *
 *   1. Distance is a prior and behaviour is evidence that overrides it.
 *      `blendPrior` is where that happens and it is the most important function
 *      in the file. Get it wrong in the other direction and the model writes
 *      off a merchant's best customers for living in the wrong county.
 *   2. Not knowing something is never charged to the customer. An unknown
 *      address is a factor of 1.00, not of 4.00.
 *
 * Every literal the SQL states lives in `PRODUCTION_PARAMS` and every function
 * takes an optional override, because the page puts sliders on all of them. The
 * oracle runs with the defaults, so a slider cannot make the regression test
 * agree with anything but the SQL.
 */

/** The mean earth radius migration 0300 uses. Not 6371, and not 6378. */
export const EARTH_RADIUS_KM = 6371.0088;

export const PRODUCTION_PARAMS: ModelParams = Object.freeze({
  shrinkK: 2,
  blendK: 2,
  localKm: 15,
  catchmentKm: 45,
  regionalKm: 95,
  priorLocal: 1.0,
  priorCatchment: 1.35,
  priorRegional: 2.2,
  priorDistant: 4.0,
  priorVisitor: 8.0,
  priorUnknown: 1.0,
  seasonFloor: 0.6,
  seasonCap: 3.0,
  gapFloorDays: 3.0,
  gapCapDays: 540.0,
  gapDefaultBaseDays: 30.0,
  companionFactor: 1.25,
  companionPartyThreshold: 2,
  loyalVisits: 10,
  overdueRatio: 1.0,
  lapsedRatio: 2.0,
  squeezeMinVisits: 3,
  squeezeMinSlots: 4,
  squeezeFullRatio: 0.5,
  dormantMonthIndex: 0.9,
  dormantMinVisits: 4,
  dormantTroughRatio: 0.15,
  farDistantVisits: 2,
  farVisitorVisits: 3,
  pReturnBase: 0.12,
  pReturnCap: 0.6,
  pReturnExperienceBase: 0.6,
  pReturnExperienceStep: 0.1,
  pReturnExperienceCap: 1.5,
  smoothStrength: 20,
  cohortDefaultCadenceDays: 30.0,
  cohortDefaultFirstRepeatDays: 45.0,
});

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Great-circle kilometres. Null in, null out.
 *
 * Haversine rather than a geodesic: the error is well under a percent at Irish
 * distances and this is one number per customer for ranking and banding. Strict
 * on purpose, so a customer with no address yields an unknown distance rather
 * than quietly becoming a point off the coast of Africa at (0, 0). A walk-in
 * with no address is the normal case, not a hypothetical.
 */
export function distanceKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (!usable(lat1) || !usable(lng1) || !usable(lat2) || !usable(lng2)) return null;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Distance as the merchant thinks about it.
 *
 * The border is checked first and the mileage second, because a different
 * country means somebody is passing through whatever the distance. A null
 * country on either side is not evidence of a border and is not treated as one.
 */
export function distanceBand(
  km: number | null,
  sameCountry: boolean | null,
  p: ModelParams = PRODUCTION_PARAMS,
): Band {
  if (sameCountry === false) return "visitor";
  if (km === null || !Number.isFinite(km)) return "unknown";
  if (km <= p.localKm) return "local";
  if (km <= p.catchmentKm) return "catchment";
  if (km <= p.regionalKm) return "regional";
  return "distant";
}

export function distancePriorFactor(band: Band, p: ModelParams = PRODUCTION_PARAMS): number {
  switch (band) {
    case "local":
      return p.priorLocal;
    case "catchment":
      return p.priorCatchment;
    case "regional":
      return p.priorRegional;
    case "distant":
      return p.priorDistant;
    case "visitor":
      return p.priorVisitor;
    default:
      return p.priorUnknown;
  }
}

/**
 * Evidence beats the prior.
 *
 * The prior applies in full to somebody never seen twice and fades as their own
 * rhythm becomes observable. k = 2 means two observed gaps are worth as much as
 * the prior, which is aggressive on purpose: somebody who has come back twice
 * has told us more about themselves than their postcode ever will. Floored at 1
 * so a prior can never become a discount.
 */
export function blendPrior(
  raw: number | null,
  observedGaps: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const prior = usable(raw) ? raw : 1.0;
  const n = Math.max(0, usable(observedGaps) ? observedGaps : 0);
  return Math.max(1.0, 1.0 + (prior - 1.0) * (p.blendK / (p.blendK + n)));
}

/**
 * Shrink an observation toward a prior in proportion to how much of it there is.
 *
 * Without this, one customer who happened to come back after three days has a
 * cadence of three days and is permanently, absurdly overdue.
 */
export function shrink(
  observed: number | null,
  n: number | null,
  prior: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number | null {
  if (!usable(observed)) return usable(prior) ? prior : null;
  if (!usable(prior)) return observed;
  const count = Math.max(0, usable(n) ? n : 0);
  return (count * observed + p.shrinkK * prior) / (count + p.shrinkK);
}

/**
 * How much the calendar itself stretches an expected gap.
 *
 * `monthIndex` is the venue's trade this month against its own average month.
 * Judge a January customer by a July clock and half the base looks like it is
 * walking out the door every summer, which is the commonest false alarm in a
 * seasonal trade. Bounded at both ends so one freak month cannot swamp the
 * model.
 */
export function seasonFactor(
  monthIndex: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  if (!usable(monthIndex) || monthIndex <= 0) return 1.0;
  return Math.min(p.seasonCap, Math.max(p.seasonFloor, 1.0 / monthIndex));
}

/**
 * How long this particular person was always going to take.
 *
 * Multiplicative because the effects genuinely compound: somebody far away in
 * the off season is both taking a trip and doing it out of season. Floored so
 * nobody is overdue by construction, capped so a visitor gets a large number
 * rather than an infinite one and still appears on a report with a real figure
 * beside them.
 */
export function expectedGapDays(
  base: number | null,
  distance: number | null,
  season: number | null,
  companion: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const product =
    (usable(base) ? base : p.gapDefaultBaseDays) *
    (usable(distance) ? distance : 1.0) *
    (usable(season) ? season : 1.0) *
    (usable(companion) ? companion : 1.0);
  return Math.min(p.gapCapDays, Math.max(p.gapFloorDays, product));
}

/**
 * The verdict.
 *
 * The branch order is the argument. `visiting` is decided before lateness
 * because it is a statement about who somebody is rather than a stage they
 * reach by going quiet, and the exception is a prepaid commitment, which
 * outranks geography. After that, on time means active however far away they
 * live. The overdue branches rank causes in the order of the action they imply:
 * money already taken, then a timetable that shut them out, then a season that
 * explains it, then real churn.
 *
 * A null flag is no evidence and never reads as true, matching SQL's `when
 * committed then` on a null.
 */
export function retentionVerdict(
  visits: number | null,
  silenceRatio: number | null,
  committed: boolean | null,
  squeezed: boolean | null,
  dormant: boolean | null,
  lowEvidenceFar: boolean | null,
  p: ModelParams = PRODUCTION_PARAMS,
): Lifecycle {
  const n = usable(visits) ? visits : 0;
  if (n <= 0) return "prospect";
  if (lowEvidenceFar === true && committed !== true) return "visiting";
  if (!usable(silenceRatio) || silenceRatio < p.overdueRatio) {
    if (n >= p.loyalVisits) return "loyal";
    if (n === 1) return "first_time";
    return "repeat";
  }
  if (committed === true) return "committed_idle";
  if (squeezed === true) return "squeezed";
  if (dormant === true) return "dormant";
  if (silenceRatio >= p.lapsedRatio) return "lapsed";
  return "at_risk";
}

/**
 * Consent first, then a channel, then whether that channel still works.
 *
 * Zero is a hard zero, not a small number. A rank that treats an unlawful send
 * as merely unlikely is a rank that will eventually produce one.
 */
export function reachability(
  consent: boolean | null,
  hasEmail: boolean | null,
  hasPhone: boolean | null,
  suppressed: boolean | null,
): number {
  if (consent !== true) return 0.0;
  if (suppressed === true) return 0.0;
  const channels = (hasEmail === true ? 1 : 0) + (hasPhone === true ? 1 : 0);
  if (channels === 0) return 0.0;
  if (channels === 1) return 0.6;
  return 1.0;
}

/**
 * What we believe about somebody before we have contacted anybody like them.
 *
 * The inverse of the distance prior, which is the same assumption stated from
 * the other side: if somebody in a band takes four times as long to come back,
 * a nudge aimed at them is roughly a quarter as likely to land. The base rate
 * is a stated assumption, which is exactly why `smoothRate` exists to let real
 * numbers take over from it.
 */
export function pReturnPrior(
  band: Band,
  visits: number | null,
  p: ModelParams = PRODUCTION_PARAMS,
): number {
  const n = Math.max(0, usable(visits) ? visits : 0);
  const experience = Math.min(
    p.pReturnExperienceCap,
    p.pReturnExperienceBase + p.pReturnExperienceStep * n,
  );
  return Math.min(p.pReturnCap, p.pReturnBase * (1.0 / distancePriorFactor(band, p)) * experience);
}

/**
 * A rate, smoothed toward a prior by how much evidence stands behind it.
 *
 * One customer in a cell who happened to return does not make that cell a
 * hundred per cent, and one who did not does not make it zero.
 */
export function smoothRate(
  successes: number | null,
  trials: number | null,
  prior: number | null,
  strength: number | null,
): number | null {
  const s = usable(strength) ? strength : 20.0;
  const denominator = Math.max(0, usable(trials) ? trials : 0) + s;
  if (denominator === 0) return null;
  const numerator = Math.max(0, usable(successes) ? successes : 0) + s * (usable(prior) ? prior : 0);
  return roundTo(numerator / denominator, 4);
}

/**
 * What one winback attempt is worth, in cents.
 *
 * A number in money rather than a score out of ten, because the question an
 * operator is really asking is which forty people to contact on a Tuesday
 * morning, and that is a question about money.
 */
export function winnabilityCents(
  pReturn: number | null,
  marginCents: number | null,
  reach: number | null,
): number {
  const p = Math.max(0, usable(pReturn) ? pReturn : 0);
  const margin = Math.max(0, usable(marginCents) ? marginCents : 0);
  const r = Math.max(0, usable(reach) ? reach : 0);
  return Math.max(0, roundTo(p * margin * r, 0));
}
