/**
 * S3 spike: 100,000 synthetic bookings from a seeded PRNG.
 *
 * mulberry32, so the page and the Node script produce the same rows from the
 * same seed without sharing a file. Every per-customer attribute is a pure
 * function of the customer id, so it is constant across that customer's rows
 * and `max()` recovers it in SQL on either engine.
 */

export const SEED = 300;
export const ROWS = 100_000;
export const CUSTOMERS = 15_000;
const EPOCH_UTC = Date.UTC(2025, 8, 1); // 2025-09-01
const DISTANCE_PRIORS = [1.0, 1.5, 2.5, 4.0];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBookings(seed = SEED, rows = ROWS) {
  const rand = mulberry32(seed);
  const out = new Array(rows);
  for (let i = 0; i < rows; i += 1) {
    // Skewed: low ids are regulars with many rows, high ids are one-timers.
    const customerId = 1 + Math.floor(CUSTOMERS * rand() ** 2.2);
    const day = Math.floor(rand() * 365);
    const visitDate = new Date(EPOCH_UTC + day * 86_400_000).toISOString().slice(0, 10);
    const amountCents = 1500 + 100 * Math.floor(rand() * 31);
    const partySize = rand() < 0.2 ? 2 : 1;
    out[i] = {
      customer_id: customerId,
      visit_date: visitDate,
      amount_cents: amountCents,
      party_size: partySize,
      distance_prior: DISTANCE_PRIORS[customerId % 4],
      season_factor: 1 + (customerId % 7) * 0.1,
    };
  }
  return out;
}

export function toCsv(rows) {
  const head = "customer_id,visit_date,amount_cents,party_size,distance_prior,season_factor";
  const lines = rows.map((r) =>
    `${r.customer_id},${r.visit_date},${r.amount_cents},${r.party_size},${r.distance_prior.toFixed(1)},${r.season_factor.toFixed(1)}`,
  );
  return `${head}\n${lines.join("\n")}\n`;
}
