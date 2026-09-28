"use client";
import { Segmented } from "@/components/instrument";
import { redactCopy as c } from "@/content/studio/redact";

/**
 * Find, as a command line on the desk: `find ›`, the query, how many boxes it
 * lit on the page, and one button to cover them all. The modes are the kit's
 * segmented control. The candidates themselves are drawn on the page, as
 * dashed boxes, by the editor; a tap on one covers it alone.
 *
 * The `find ›` prompt is drawn by `tool.css` on a hidden span, so it is not a
 * word in the document; the field's name is the label's hidden text.
 */
export type Find = "text" | "email" | "phone";

const MODES: Find[] = ["text", "email", "phone"];

export function FindLine({
  id,
  mode,
  onMode,
  query,
  onQuery,
  lit,
  onCover,
  hasText,
  disabled,
}: {
  id: string;
  mode: Find;
  onMode: (mode: Find) => void;
  query: string;
  onQuery: (query: string) => void;
  lit: number;
  onCover: () => void;
  hasText: boolean;
  disabled: boolean;
}) {
  return (
    <div className="redact__find">
      <div className="redact__command">
        <label className="redact__prompt" htmlFor={id}>
          <span className="redact__caret" aria-hidden="true" />
          <span className="inst-hidden">{c.search}</span>
        </label>
        {mode === "text" ? (
          <input
            id={id}
            className="redact__query"
            type="search"
            value={query}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled || !hasText}
            onChange={(e) => onQuery(e.target.value)}
          />
        ) : (
          <output id={id} className="redact__query redact__query--pattern">
            {c.patterns[mode]}
          </output>
        )}
      </div>
      <Segmented
        className="redact__modes"
        label={c.searchType}
        hideLabel
        size="sm"
        value={mode}
        disabled={disabled || !hasText}
        onChange={onMode}
        options={MODES.map((value) => ({ value, label: c.modes[value] }))}
      />
      <div className="redact__act">
        <output className="redact__lit" data-some={lit > 0 || undefined}>
          {c.lit(lit)}
        </output>
        <button type="button" className="redact__cover" disabled={disabled || lit === 0} onClick={onCover}>
          {c.apply}
        </button>
      </div>
      <p className="redact__caveat">{hasText ? c.caveat : c.noText}</p>
    </div>
  );
}
