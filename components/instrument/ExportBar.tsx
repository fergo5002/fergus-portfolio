"use client";
import "./instrument.css";

/**
 * A compact row of labelled export actions.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <ExportBar label="Take it away" actions={[
 *   { label: "PNG", kind: "png", onClick: () => save("png"), disabled: !ready },
 *   { label: "SVG in millimetres", kind: "svg", onClick: () => save("svg") },
 * ]} note={failure} />
 * ```
 *
 * Each action is a plain `<button>` whose accessible name and text content are
 * exactly its `label`: the format glyph is an SVG hidden from assistive
 * technology and carries no text, so `getByRole("button", { name: "PNG" })`
 * and a `textContent` comparison both see only the label. `note` is a status
 * line under the row for a failed download.
 */
export type ExportKind = "png" | "svg" | "stl" | "json" | "csv" | "wav" | "pdf" | "html" | "md" | "file";

export type ExportAction = {
  label: string;
  kind: ExportKind;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
};

const GLYPHS: Record<ExportKind, string> = {
  png: "M2 3h12v10H2zM3.5 11.5l3-3.5 2 2 2-2.5 2.5 4",
  svg: "M2 13C5 2 11 14 14 3M2 13h0M14 3h0",
  stl: "M8 1.5 14 5v6l-6 3.5L2 11V5zM2 5l6 3.5L14 5M8 8.5v6",
  json: "M6 2.5C4.5 2.5 4.5 4 4.5 5.5S3.5 8 2.5 8c1 0 2 .5 2 2.5s0 3 1.5 3M10 2.5c1.5 0 1.5 1.5 1.5 3s1 2.5 2 2.5c-1 0-2 .5-2 2.5s0 3-1.5 3",
  csv: "M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10",
  wav: "M1 8h2.5L5 3.5 7 12.5l2-8 1.5 5L12 8h3",
  pdf: "M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12",
  html: "M4 1.5h5.5L12 4v10.5H4zM6 7h4M6 9.5h4M6 12h2.5",
  md: "M4 1.5h5.5L12 4v10.5H4zM6 7h4M6 9.5h4M6 12h2.5",
  file: "M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 12.5v1.5h11v-1.5",
};

export default function ExportBar({
  label,
  actions,
  note,
  className = "",
}: {
  label: string;
  actions: readonly ExportAction[];
  note?: string;
  className?: string;
}) {
  return (
    <div className={`inst-export ${className}`.trim()}>
      <div className="inst-export__row" role="group" aria-label={label}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.primary ? "inst-export__btn is-primary" : "inst-export__btn"}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <svg className="inst-export__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d={GLYPHS[action.kind]} />
            </svg>
            {action.label}
          </button>
        ))}
      </div>
      {note ? (
        <p className="inst-export__note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
