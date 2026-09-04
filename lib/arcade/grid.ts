/**
 * The screen a program draws on: a rectangle of characters, and the rule for
 * how big that rectangle is allowed to be.
 *
 * The size is chosen from the **measured** character cell, never assumed.
 * `components/arcade/ArcadeScreen.tsx` renders a probe of 100 zeroes at the
 * grid's own font and divides `getBoundingClientRect().width` by 100. The rect
 * and not `offsetWidth`: `offsetWidth` rounds to a whole pixel, and at 48
 * columns a half-pixel error is two columns of overflow on a phone.
 *
 * The ladders are walked **scale outermost**, so every board is tried at full
 * size before any type is shrunk: a 40 by 18 board at 16px beats a 48 by 20 at
 * fourteen and a bit, because the board is made of characters and a character
 * has to be readable first. Only when nothing fits at full size does the scale
 * drop, and it never drops below `MIN_CELL_PX`. When nothing fits at all this
 * returns null, the runtime refuses to start the program and says so. It never
 * clips and it never drops rows.
 */

export type GridSize = { cols: number; rows: number };
export type GridFit = { cols: number; rows: number; scale: number };

/** Biggest first. 48 by 20 is the desktop board, 32 by 16 the phone's. */
export const GRID_SIZES: readonly GridSize[] = [
  { cols: 48, rows: 20 },
  { cols: 40, rows: 18 },
  { cols: 32, rows: 16 },
];

/** Multiplies the CSS cell size. Full size first: shrinking type is the last resort. */
export const GRID_SCALES: readonly number[] = [1, 0.9, 0.8];

/** Below this a glyph on a phone is a smudge, and the runtime would rather refuse. */
export const MIN_CELL_PX = 6;

export function fitGrid(
  box: { width: number; height: number },
  cell: { width: number; height: number },
): GridFit | null {
  if (!Number.isFinite(cell.width) || !Number.isFinite(cell.height)) return null;
  if (cell.width <= 0 || cell.height <= 0) return null;
  for (const scale of GRID_SCALES) {
    const w = cell.width * scale;
    const h = cell.height * scale;
    if (w < MIN_CELL_PX) continue;
    for (const size of GRID_SIZES) {
      if (size.cols * w > box.width) continue;
      if (size.rows * h > box.height) continue;
      return { cols: size.cols, rows: size.rows, scale };
    }
  }
  return null;
}

/* ── drawing ─────────────────────────────────────────────────────────────── */

/**
 * Every helper below clips silently at the edges. A game with an off-by-one
 * should misdraw for one frame; it should not throw inside a frame callback,
 * where nothing catches it and the whole terminal goes with it.
 */

export function blankGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
}

export function put(grid: string[][], col: number, row: number, ch: string): void {
  if (ch.length === 0) return;
  const line = grid[row];
  if (!line) return;
  if (col < 0 || col >= line.length) return;
  line[col] = ch[0];
}

export function write(grid: string[][], col: number, row: number, text: string): void {
  for (let i = 0; i < text.length; i++) put(grid, col + i, row, text[i]);
}

export function centre(grid: string[][], row: number, text: string): void {
  const cols = grid[row]?.length ?? 0;
  write(grid, Math.floor((cols - text.length) / 2), row, text);
}

export function toLines(grid: string[][]): string[] {
  return grid.map((line) => line.join(""));
}
