/**
 * The one piece of cryptography in this tool, and the honest account of what
 * it buys.
 *
 * Both browsers agree a 32-byte random salt over the connection they have just
 * opened, then hash every normalised profile slug as
 * `SHA-256(salt || utf8(slug))` and keep the first 8 bytes.
 *
 * **8 bytes is a birthday decision.** Two lists of n entries make n^2 cross
 * pairs and about `n^2 / 2^64` of them collide by accident. LinkedIn caps a
 * network at 30,000, so the worst case is 9e8 pairs and 4.9e-11 expected wrong
 * names. At 4 bytes the same figure is 0.21, which is a wrong name in one run
 * in five, and a wrong name here means printing a stranger under "you both
 * know". At 32 bytes it is four times the bytes to buy nothing observable.
 *
 * **What the salt does not do.** The peer has it. A profile slug is a person's
 * name with a short suffix, which is a small enough space to enumerate, so the
 * peer can hash a dictionary of people they are curious about and learn whether
 * any of them are in your file. No truncation, iteration count or key
 * derivation changes that, because the peer is inside the protocol. The salt
 * stops anybody outside the pairing, including a later holder of a captured
 * transcript, from using a precomputed table, and it makes these hashes
 * meaningless anywhere else. That is the whole claim.
 */

export const SALT_BYTES = 32;
/** 8 bytes. See the birthday note above before changing it. */
export const HASH_HEX_CHARS = 16;

/** The slice of WebCrypto this module needs, so a test can hand it a counter. */
export type SubtleLike = {
  digest(algorithm: "SHA-256", data: BufferSource): Promise<ArrayBuffer>;
};

const encoder = new TextEncoder();

function platformSubtle(): SubtleLike {
  return globalThis.crypto.subtle as SubtleLike;
}

export function newSalt(
  fill: (bytes: Uint8Array) => void = (b) => globalThis.crypto.getRandomValues(b),
): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  fill(salt);
  return salt;
}

export function encodeSalt(salt: Uint8Array): string {
  let binary = "";
  for (const byte of salt) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeSalt(text: string): Uint8Array {
  const binary = atob(text);
  if (binary.length !== SALT_BYTES) {
    throw new Error(`overlap: a salt is ${SALT_BYTES} bytes, got ${binary.length}`);
  }
  const out = new Uint8Array(SALT_BYTES);
  for (let i = 0; i < SALT_BYTES; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function hashSlug(
  salt: Uint8Array,
  slug: string,
  subtle: SubtleLike = platformSubtle(),
): Promise<string> {
  const text = encoder.encode(slug);
  const buffer = new Uint8Array(salt.length + text.length);
  buffer.set(salt, 0);
  buffer.set(text, salt.length);
  const digest = await subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(digest).subarray(0, HASH_HEX_CHARS / 2));
}

export type HashAllOptions = {
  subtle?: SubtleLike;
  /** How many to hash before yielding and reporting. */
  batch?: number;
  onProgress?: (done: number, total: number) => void;
  /** Yields to the event loop so a 30,000-row file does not freeze the tab. */
  yieldTo?: () => Promise<void>;
  /**
   * Every slug with the hash it produced, in input order, as they are computed.
   *
   * The exchange needs both the sorted list and a way back from a hash to the
   * row it came from, and hashing twice to get them would double the one
   * genuinely expensive thing this tool does. Called once per slug, including
   * for a slug whose hash has already been seen.
   */
  onEach?: (slug: string, hash: string) => void;
};

/**
 * Every slug, hashed, sorted ascending and deduplicated.
 *
 * Sorted because the wire format is a sorted list and a receiver that can
 * assume order can intersect without building a set. Deduplicated because two
 * rows can reduce to the same slug and a repeated hash would say nothing new
 * while making the list longer.
 *
 * The batching is not an optimisation, it is the difference between a
 * responsive tab and a frozen one: 30,000 sequential `subtle.digest` awaits on
 * a phone is a real stretch of main thread. How long is a guess until somebody
 * measures it on a phone.
 */
export async function hashAll(
  salt: Uint8Array,
  slugs: readonly string[],
  options: HashAllOptions = {},
): Promise<string[]> {
  const subtle = options.subtle ?? platformSubtle();
  const batch = options.batch ?? 500;
  const yieldTo = options.yieldTo ?? (() => new Promise<void>((r) => setTimeout(r, 0)));

  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i++) {
    const hash = await hashSlug(salt, slugs[i], subtle);
    options.onEach?.(slugs[i], hash);
    seen.add(hash);
    if ((i + 1) % batch === 0) {
      options.onProgress?.(i + 1, slugs.length);
      await yieldTo();
    }
  }
  if (slugs.length % batch !== 0 || slugs.length === 0) {
    options.onProgress?.(slugs.length, slugs.length);
  }
  return [...seen].sort();
}
