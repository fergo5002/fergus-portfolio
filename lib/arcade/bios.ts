/**
 * The arcade BIOS, typed by elapsed time.
 *
 * A typewriter that advances one character per timeout tick types at whatever
 * speed the main thread allows, which on a busy machine is not the speed it
 * was given. These two functions make the words on screen a pure function of
 * the clock, so a frame that arrives late catches up instead of falling
 * behind, and the sequence lands at the same moment everywhere.
 */

/** How many characters of `lines` are on screen `elapsedMs` into the typing. */
export function typedCount(lines: readonly string[], elapsedMs: number, speedMs: number, lineHoldMs: number): number {
  let budget = elapsedMs, shown = 0;
  for (const line of lines) {
    const cost = line.length * speedMs;
    if (budget >= cost + lineHoldMs) {
      shown += line.length;
      budget -= cost + lineHoldMs;
      continue;
    }
    return shown + Math.max(0, Math.min(line.length, Math.floor(budget / speedMs)));
  }
  return shown;
}

/** The first `count` characters of `lines`, one line a row, with a cursor on the row still being typed. */
export function typedText(lines: readonly string[], count: number): string {
  const out: string[] = [];
  let left = count;
  for (const line of lines) {
    if (left <= 0) break;
    const take = Math.min(line.length, left);
    out.push(line.slice(0, take) + (take < line.length ? "▋" : ""));
    left -= line.length;
  }
  return out.join("\n");
}

/** How long the whole thing takes, so the next phase can be scheduled without watching it. */
export function typingDuration(lines: readonly string[], speedMs: number, lineHoldMs: number): number {
  return lines.reduce((n, line) => n + line.length * speedMs + lineHoldMs, 0);
}

/**
 * The loading bar, `cells` wide, `elapsedMs` into `totalMs`. Clamped at both
 * ends: a frame timestamp can precede the moment the bar started by a whole
 * slow frame, and `"█".repeat(-2)` is a RangeError that took an entrance
 * down once, on 2026-09-05.
 */
export function barText(elapsedMs: number, totalMs: number, cells: number): string {
  const p = Math.min(1, Math.max(0, totalMs > 0 ? elapsedMs / totalMs : 1));
  const filled = Math.round(p * cells);
  return `[${"█".repeat(filled)}${"░".repeat(cells - filled)}]`;
}
