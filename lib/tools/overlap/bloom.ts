/**
 * The fallback for a big network.
 *
 * The design says filters above 10,000 rows. Everything else here is derived
 * from the one number the page is willing to print: a false-positive rate of
 * one in a million per name checked.
 *
 *   m / n = -ln(1e-6) / (ln 2)^2 = 28.755  ->  29 bits an entry
 *   k     = round(29 * ln 2)               ->  20 probes
 *   real  = (1 - e^(-20/29))^20 = 8.89e-7  ->  one in about 1.12 million
 *
 * At 10,000 entries that is 36 KB of filter, 48 KB once base64 has inflated
 * it, against 170 KB for the exact list. Three and a half times smaller, not
 * ten, which is worth stating rather than implying.
 *
 * A false positive here prints a name under "you both know" that you do not
 * both know, so the page says the computed number whenever a filter is in use
 * rather than hiding behind "approximate".
 *
 * **The refused alternative.** A filter exchange can be made exact by sending
 * the matches back for the other side to confirm against its real set. It is
 * refused because the receiver would be handing back its own false positives,
 * which are hashes of people it knows and the sender does not, and the sender
 * holds the salt.
 */

/** The design's threshold: above this many entries a side sends a filter. */
export const BLOOM_THRESHOLD = 10_000;
/** The rate every other constant here is derived from. */
export const TARGET_RATE = 1e-6;
/** ceil(-ln(TARGET_RATE) / (ln 2)^2). */
export const BITS_PER_ENTRY = 29;
/** round(BITS_PER_ENTRY * ln 2). */
export const HASH_COUNT = 20;
/** Small enough that a one-entry filter is still sparse. */
const MIN_BITS = 512;

export type BloomFilter = { bits: Uint8Array; k: number; inserted: number };

export function bitsFor(n: number): number {
  const wanted = Math.max(MIN_BITS, Math.ceil(n * BITS_PER_ENTRY));
  return Math.ceil(wanted / 8) * 8;
}

export function falsePositiveRate(bits: number, k: number, inserted: number): number {
  if (inserted <= 0 || bits <= 0) return 0;
  return (1 - Math.exp((-k * inserted) / bits)) ** k;
}

/**
 * Twenty indices from one 64-bit hash, by Kirsch-Mitzenmacher double hashing.
 * `h1` is the top 32 bits, `h2` the bottom 32 forced odd, and probe `i` lands
 * at `(h1 + i * h2) mod m`.
 *
 * **The trailing `>>> 0` on `h2` is load-bearing and was missing at first.**
 * `|` reads its operand as a signed 32-bit integer, so `(x >>> 0) | 1` hands
 * back a negative number for any x at or above 2^31, which is half of them.
 * A negative step walks the index off the front of the array, every write
 * lands nowhere, and the filter then fails to hold the hashes it was given:
 * measured at 978 of 2,000 before the fix. The unsigned shift puts it back.
 * There is a mutation row on it.
 *
 * **A step of zero would collapse twenty probes onto one bit, and it cannot
 * happen here.** `h2` is forced odd and `bitsFor` always returns a multiple of
 * eight, so `h2 % bits` is odd and therefore never zero. The plan asked for a
 * `|| 1` guard against it; removing that guard left the whole suite green,
 * which is the definition of decoration, so the invariant is written down and
 * pinned in `bloom.test.ts` instead. If `bitsFor` ever stops rounding to a
 * whole byte, the guard has to come back and this comment has to go.
 */
function probe(hash: string, bits: number, k: number, visit: (index: number) => void): void {
  const h1 = Number.parseInt(hash.slice(0, 8), 16) >>> 0;
  const h2 = ((Number.parseInt(hash.slice(8, 16), 16) >>> 0) | 1) >>> 0;
  let at = h1 % bits;
  const step = h2 % bits;
  for (let i = 0; i < k; i++) {
    visit(at);
    at = (at + step) % bits;
  }
}

export function buildFilter(hashes: readonly string[], k: number = HASH_COUNT): BloomFilter {
  const bits = bitsFor(hashes.length);
  const bytes = new Uint8Array(bits / 8);
  for (const hash of hashes) {
    probe(hash, bits, k, (index) => {
      bytes[index >>> 3] |= 1 << (index & 7);
    });
  }
  return { bits: bytes, k, inserted: hashes.length };
}

export function testFilter(filter: BloomFilter, hash: string): boolean {
  const bits = filter.bits.length * 8;
  if (filter.inserted === 0) return false;
  let hit = true;
  probe(hash, bits, filter.k, (index) => {
    if (hit && (filter.bits[index >>> 3] & (1 << (index & 7))) === 0) hit = false;
  });
  return hit;
}

export function encodeFilter(filter: BloomFilter): string {
  let binary = "";
  for (const byte of filter.bits) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeFilter(text: string, bits: number, k: number, inserted: number): BloomFilter {
  const binary = atob(text);
  if (binary.length * 8 !== bits) {
    throw new Error(`overlap: filter says ${bits} bits, payload carries ${binary.length * 8}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bits: bytes, k, inserted };
}

/** What to print: how many wrong names a result of this size is expected to carry. */
export function expectedWrongNames(filter: BloomFilter, checked: number): number {
  return falsePositiveRate(filter.bits.length * 8, filter.k, filter.inserted) * checked;
}
