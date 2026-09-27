"use client";
import { redactCopy as c } from "@/content/studio/redact";
import { PALETTE_KEYS, ZOOM, nextZoom } from "@/lib/studio/redact-keys";

/**
 * The tools that float on the desk's edge: a small palette of drawn glyphs
 * (draw, select; undo, redo, delete) and, apart from it, the lens (zoom out,
 * the zoom, zoom in, fit).
 *
 * Every button is a real `<button>` named by `aria-label`, because its face is
 * a glyph; the name and the key it answers to show on hover and on keyboard
 * focus, drawn by `tool.css` from `aria-label` and `data-hint`, so neither is a
 * word in the document. `aria-keyshortcuts` says the same thing to assistive
 * technology. The keys themselves are handled once, by the editor, through
 * `redactKey` (`lib/studio/redact-keys.ts`), and the hints are that file's.
 *
 * A group, not a toolbar: a toolbar promises the arrow keys move between its
 * buttons, and here the arrows move the selected mask.
 */
export type Mode = "draw" | "select";

function Glyph({ d, fill }: { d: string; fill?: string }) {
  return (
    <svg className="redact__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {fill ? <path className="redact__glyph-fill" d={fill} /> : null}
      <path d={d} />
    </svg>
  );
}

export function Palette({
  mode,
  onMode,
  canUndo,
  canRedo,
  canDelete,
  onUndo,
  onRedo,
  onDelete,
  disabled,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="redact__palette" role="group" aria-label={c.tools}>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.draw}
        aria-pressed={mode === "draw"}
        aria-keyshortcuts={PALETTE_KEYS.draw.aria}
        data-hint={PALETTE_KEYS.draw.hint}
        disabled={disabled}
        onClick={() => onMode("draw")}
      >
        <Glyph fill="M1.5 5h9.5v5.5H1.5z" d="M13 9.5v5M10.5 12h5" />
      </button>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.select}
        aria-pressed={mode === "select"}
        aria-keyshortcuts={PALETTE_KEYS.select.aria}
        data-hint={PALETTE_KEYS.select.hint}
        disabled={disabled}
        onClick={() => onMode("select")}
      >
        <Glyph d="M3.5 2 12 7.2l-4 1.2-1.9 4.1z" />
      </button>
      <span className="redact__rule" aria-hidden="true" />
      <button
        type="button"
        className="redact__tool"
        aria-label={c.undo}
        aria-keyshortcuts={PALETTE_KEYS.undo.aria}
        data-hint={PALETTE_KEYS.undo.hint}
        disabled={disabled || !canUndo}
        onClick={onUndo}
      >
        <Glyph d="M5.5 3.5 2.5 6.5l3 3M2.8 6.5h6.7a3.5 3.5 0 0 1 0 7H7.5" />
      </button>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.redo}
        aria-keyshortcuts={PALETTE_KEYS.redo.aria}
        data-hint={PALETTE_KEYS.redo.hint}
        disabled={disabled || !canRedo}
        onClick={onRedo}
      >
        <Glyph d="M10.5 3.5l3 3-3 3M13.2 6.5H6.5a3.5 3.5 0 0 0 0 7h2" />
      </button>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.delete}
        aria-keyshortcuts={PALETTE_KEYS.delete.aria}
        data-hint={PALETTE_KEYS.delete.hint}
        disabled={disabled || !canDelete}
        onClick={onDelete}
      >
        <Glyph d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.8 9h6.4l.8-9M6.8 7v4M9.2 7v4" />
      </button>
    </div>
  );
}

export function Lens({ zoom, onZoom, disabled }: { zoom: number; onZoom: (zoom: number) => void; disabled: boolean }) {
  return (
    <div className="redact__lens" role="group" aria-label={c.lens}>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.zoomOut}
        aria-keyshortcuts="-"
        data-hint="-"
        disabled={disabled || zoom <= ZOOM.min}
        onClick={() => onZoom(nextZoom(zoom, -1))}
      >
        <Glyph d="M3 8h10" />
      </button>
      <output className="redact__zoom" aria-live="polite">
        {zoom}%
      </output>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.zoomIn}
        aria-keyshortcuts="+"
        data-hint="+"
        disabled={disabled || zoom >= ZOOM.max}
        onClick={() => onZoom(nextZoom(zoom, 1))}
      >
        <Glyph d="M3 8h10M8 3v10" />
      </button>
      <button
        type="button"
        className="redact__tool"
        aria-label={c.fit}
        aria-keyshortcuts={PALETTE_KEYS.fit.aria}
        data-hint={PALETTE_KEYS.fit.hint}
        disabled={disabled || zoom === ZOOM.fit}
        onClick={() => onZoom(ZOOM.fit)}
      >
        <Glyph d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
      </button>
    </div>
  );
}
