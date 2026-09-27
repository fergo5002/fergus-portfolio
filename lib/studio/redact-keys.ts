/**
 * Pocket Redact's keyboard, as data.
 *
 * The editor has one keydown handler. It asks `redactKey` what a key means and
 * prevents the default only when the answer is not null, so everything this
 * does not claim stays the browser's: Tab and Space, every Ctrl or Cmd
 * shortcut except undo and redo (Ctrl+F still finds, Ctrl+plus still zooms the
 * page), and the arrows whenever no mask is selected, so they still scroll.
 *
 * `PALETTE_KEYS` is what the palette shows on hover and hands to
 * `aria-keyshortcuts`. The test holds each hint to the key it names.
 */
export type RedactIntent =
  | { kind: "mode"; mode: "draw" | "select" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete" }
  | { kind: "new" }
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; dw: number; dh: number }
  | { kind: "zoom"; step: 1 | -1 }
  | { kind: "fit" };

export type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

const ARROWS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

export function redactKey(e: KeyLike, selected: boolean): RedactIntent | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (k === "z") return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
    if (k === "y" && !e.shiftKey) return { kind: "redo" };
    return null;
  }
  if (k === "r") return { kind: "mode", mode: "draw" };
  if (k === "v") return { kind: "mode", mode: "select" };
  if (k === "n") return { kind: "new" };
  if (k === "+" || k === "=") return { kind: "zoom", step: 1 };
  if (k === "-" || k === "_") return { kind: "zoom", step: -1 };
  if (k === "0") return { kind: "fit" };
  if (!selected) return null;
  if (k === "Delete" || k === "Backspace") return { kind: "delete" };
  const arrow = ARROWS[k];
  if (!arrow) return null;
  const n = e.shiftKey ? 10 : 1;
  return e.altKey
    ? { kind: "resize", dw: arrow[0] * n, dh: arrow[1] * n }
    : { kind: "move", dx: arrow[0] * n, dy: arrow[1] * n };
}

/** The hint each palette button shows, and the shortcut it declares. */
export const PALETTE_KEYS = {
  draw: { key: "R", hint: "R", aria: "R" },
  select: { key: "V", hint: "V", aria: "V" },
  undo: { key: "Z", hint: "Ctrl Z", aria: "Control+Z Meta+Z" },
  redo: { key: "Z", hint: "Ctrl Shift Z", aria: "Control+Shift+Z Meta+Shift+Z Control+Y" },
  delete: { key: "Delete", hint: "Del", aria: "Delete Backspace" },
  fit: { key: "0", hint: "0", aria: "0" },
} as const;

export const ZOOM = { min: 50, max: 250, step: 10, fit: 100 } as const;

/** One zoom step in or out, landing on the step grid and inside the bounds. */
export function nextZoom(zoom: number, step: 1 | -1): number {
  const grid = step > 0 ? Math.floor(zoom / ZOOM.step) + 1 : Math.ceil(zoom / ZOOM.step) - 1;
  return Math.max(ZOOM.min, Math.min(ZOOM.max, grid * ZOOM.step));
}
