/**
 * Returns one frame of a scramble/decode animation: the first `revealed`
 * characters of `target`, with the remainder replaced by `rand` (a random glyph
 * chosen by the caller). Spaces are preserved so word shapes stay intact.
 */
export function scrambleFrame(target: string, revealed: number, rand: string): string {
  if (revealed >= target.length) return target;
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (i < revealed || ch === " ") out += ch;
    else out += rand;
  }
  return out;
}

export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*<>/\\|=+_アカサタナ";

export function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}
