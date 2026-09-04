/**
 * Getting the three files out of the tab.
 *
 * Nothing here uploads anything, and that is the whole design rather than a
 * happy accident: a `Blob` made in the tab, an object URL that only this
 * document can resolve, an anchor clicked in the tab, and the URL released
 * again. No server sees any of it, which is what lets the privacy line stand
 * on two of the three source paths and lets the GitHub path's note say the
 * only thing that ever leaves is the commit search itself.
 *
 * The globals arrive as a `SaveEnv` rather than being reached for directly,
 * because vitest runs in a node environment where none of the four exists.
 * With them injected, `download.test.ts` drives the whole sequence, and the
 * ordering below is a tested fact rather than a hope.
 */

export type PlateSource = "demo" | "github" | "csv";
export type PlateKind = "png" | "svg" | "stl";

export const PNG_MIME = "image/png";
export const SVG_MIME = "image/svg+xml";
/**
 * Registered with IANA in 2019. Plenty of older tools still send
 * `application/sla`, which is the same bytes under a worse name. Nothing in
 * this tool ever reads an STL back, so the only consumer is the slicer the
 * visitor drags it into, and every slicer goes by the extension anyway.
 */
export const STL_MIME = "model/stl";

/**
 * `relief-github-2026-09-03.stl`.
 *
 * The source and the day, and nothing else. Not the username, because a file
 * in a downloads folder is the one artefact of this tool that outlives the
 * tab, and a username in it is a small unasked-for disclosure on a shared
 * machine. Not the dropped file's own name either, for the same reason.
 */
export function plateFilename(source: PlateSource, kind: PlateKind, iso: string): string {
  return `relief-${source}-${iso.slice(0, 10)}.${kind}`;
}

/** The four browser globals a download needs, so a test can be all four. */
export type SaveEnv = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  anchor(): { href: string; download: string; rel: string; click(): void };
  /** Runs after the click has had a chance to start the download. */
  defer(run: () => void): void;
};

/**
 * Hand the browser a file.
 *
 * The revoke is deferred, never synchronous. A click on an anchor whose href
 * is an object URL starts a fetch of that URL, and revoking before the fetch
 * runs cancels the download with no error anywhere. Deferring by one turn of
 * the event loop is enough, and the alternative of never revoking leaks the
 * blob for the life of the document, which on a 244 KB mesh is worth avoiding.
 *
 * The `finally` matters as much: if the click throws, the URL is still
 * released.
 */
export function saveBlob(blob: Blob, name: string, env: SaveEnv): void {
  const url = env.createObjectURL(blob);
  try {
    const a = env.anchor();
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.click();
  } finally {
    env.defer(() => env.revokeObjectURL(url));
  }
}

export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: `${SVG_MIME};charset=utf-8` });
}

export function stlBlob(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], { type: STL_MIME });
}

/** The structural bit of HTMLCanvasElement this needs. The real one satisfies it. */
type BlobCanvas = { toBlob(callback: (blob: Blob | null) => void, type?: string): void };

/**
 * A PNG off the plate.
 *
 * `toBlob` is callback-shaped and can hand back `null` when the canvas is
 * tainted or has no bytes, so this rejects with a named error rather than
 * quietly saving a zero-byte file that looks like a broken export later.
 */
export function canvasBlob(canvas: BlobCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("relief: the canvas gave back no image to save"));
    }, PNG_MIME);
  });
}
