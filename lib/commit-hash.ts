/**
 * A short, stable, git-looking hash for an experience entry, so the page that
 * is styled as `git log --author=fergus` can print a commit id beside each one.
 *
 * FNV-1a over the entry's id: deterministic, dependency-free, and the same on
 * the server and in the browser. It is decoration, not a real commit, which is
 * why the page draws it with CSS rather than writing it into the document.
 */
export function shortHash(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Mix the high bits down so short ids still spread across all seven digits.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}
