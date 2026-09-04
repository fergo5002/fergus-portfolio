/**
 * The room code. Six characters, read down a phone or across a table, then
 * typed. Two jobs, two filters, and each one removes characters.
 *
 * **Read aloud.** English letter and digit names cluster by vowel and a bad
 * line collapses each cluster, so at most one member of each survives: "three"
 * out of B C D E G P T V Z 3, "kay" out of A H J K 8, "nine" out of I Y 5 9,
 * and "two" and "double-u" out of Q U W 2, which is the one cluster that keeps
 * two because a one-syllable name and a three-syllable one do not collide. The
 * "eh" cluster keeps F and M on the same reasoning: a fricative coda against a
 * nasal one survives, where M against N would not.
 *
 * **Typed from a screen.** 0 against O and 1 against I and l are the pairs
 * people get wrong, and both halves of each are already gone. U is dropped as
 * well, because a six-character code from an alphabet containing it will
 * eventually spell something.
 *
 * Eleven characters, six long, is 1,771,561 codes. That is not a large space
 * and it is defended rather than relied on: a room lives ten minutes, a wrong
 * code costs a budget token against both the address and the code, and a
 * guessed code buys an SDP offer and nothing else. It is also why the
 * generator is unbiased: `byte % 11` would favour 2, 3 and 4, and a biased
 * generator shrinks a space that is already the weakest thing here.
 *
 * Frozen for G1 (Phosphor Pong), which uses the same relay.
 */

export const CODE_ALPHABET = "234679FKMRW";
export const CODE_LENGTH = 6;
export const CODE_SPACE = CODE_ALPHABET.length ** CODE_LENGTH;

/** 23 * 11. Bytes at or above this would bias the remainder, so they are redrawn. */
const REJECT_AT = 253;

/**
 * The two characters that were dropped for looking like something and have
 * exactly one surviving twin, so typing them is a mistake with a single correct
 * reading. Nothing else is guessed at.
 */
const LOOKALIKES: Record<string, string> = { Z: "2", G: "6" };

export function newCode(
  fill: (bytes: Uint8Array) => void = (b) => globalThis.crypto.getRandomValues(b),
): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    const draw = new Uint8Array(CODE_LENGTH * 2);
    fill(draw);
    for (const byte of draw) {
      if (byte >= REJECT_AT) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export function normaliseTypedCode(input: string): string | null {
  const cleaned = [...input.toUpperCase().replace(/[\s-]/g, "")]
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join("");
  return isCode(cleaned) ? cleaned : null;
}

export function displayCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function isCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}
