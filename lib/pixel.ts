/**
 * Pixel sprites drawn in the tube's own phosphor.
 *
 * A sprite is a grid of characters, one per pixel, so the art lives in the
 * source as something a person can read and edit, and the SVG it becomes is
 * nothing but rectangles at integer coordinates. Horizontal runs of one tone
 * are merged into a single rectangle: a 28 by 20 mug is about sixty elements
 * rather than three hundred.
 *
 * Tones, not colours. `ink` and the others resolve to the card's current
 * phosphor in CSS, so an amber or ice visitor gets amber or ice pixels and
 * nothing here holds a colour literal.
 */

export type PixelTone = "ink" | "bright" | "mid" | "faint";

/** The only characters a sprite may contain. `.` is an empty pixel. */
export const PIXEL_LEGEND: Readonly<Record<string, PixelTone>> = {
  "#": "ink",
  "*": "bright",
  "+": "mid",
  "=": "faint",
};

export type PixelRun = { x: number; y: number; w: number; tone: PixelTone };

/**
 * A still image plus the frames that alternate on top of it. Frame 0 is the
 * resting state: it is what a visitor with reduced motion sees, so it must be a
 * complete picture on its own (the steam there, the receiver in its cradle).
 */
export type PixelSprite = {
  readonly base: readonly string[];
  readonly frames: readonly (readonly string[])[];
};

export function pixelRuns(grid: readonly string[]): PixelRun[] {
  const runs: PixelRun[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const tone = PIXEL_LEGEND[row[x]];
      if (!tone) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && PIXEL_LEGEND[row[end]] === tone) end++;
      runs.push({ x, y, w: end - x, tone });
      x = end;
    }
  });
  return runs;
}

/**
 * Throws, naming the sprite and the place, when a grid is ragged, uses a
 * character outside the legend, or has a frame of a different size. Run by the
 * tests over every shipped sprite, so a mistyped row fails the suite rather
 * than drawing a torn picture.
 */
export function checkSprite(name: string, sprite: PixelSprite): void {
  const width = sprite.base[0]?.length ?? 0;
  const checkGrid = (grid: readonly string[], where: string) => {
    grid.forEach((row, i) => {
      if (row.length !== width) throw new Error(`${name}: ${where} row ${i} is ${row.length} wide, not ${width}`);
      for (const ch of row) {
        if (ch !== "." && !PIXEL_LEGEND[ch]) throw new Error(`${name}: ${where} row ${i} holds "${ch}", which is not in the legend`);
      }
    });
  };
  checkGrid(sprite.base, "base");
  sprite.frames.forEach((frame, f) => {
    if (frame.length !== sprite.base.length) {
      throw new Error(`${name}: frame ${f} is ${frame.length} rows, not ${sprite.base.length}`);
    }
    checkGrid(frame, `frame ${f}`);
  });
}
