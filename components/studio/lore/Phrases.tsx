"use client";
import type { CSSProperties } from "react";

/**
 * What the chat keeps saying, as one strip of phrases sized by how often,
 * led by the search. A phrase pressed opens the messages that say it.
 * Plain spans until hydration, like the voices.
 */
export default function Phrases({
  phrases,
  active,
  onPhrase,
  onSearch,
  ready,
  words,
}: {
  phrases: readonly { phrase: string; count: number }[];
  active: string;
  onPhrase: (phrase: string) => void;
  onSearch: () => void;
  ready: boolean;
  words: { phrasesLabel: string; searchOpen: string; phraseChip: (p: string) => string; none: string };
}) {
  const top = Math.max(1, phrases[0]?.count ?? 1);
  return (
    <div className="lore__phrases" role="group" aria-label={words.phrasesLabel}>
      {ready ? (
        <button type="button" className="lore__search-open" onClick={onSearch}>
          <svg className="lore__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6 14 14" />
          </svg>
          {words.searchOpen}
        </button>
      ) : null}
      {phrases.map((p) => {
        const style = { "--weight": Math.sqrt(p.count / top).toFixed(3) } as CSSProperties;
        const inner = (
          <>
            {words.phraseChip(p.phrase)}
            <b>{p.count.toLocaleString("en-GB")}×</b>
          </>
        );
        return ready ? (
          <button
            key={p.phrase}
            type="button"
            className="lore__phrase"
            aria-pressed={active === p.phrase}
            style={style}
            onClick={() => onPhrase(p.phrase)}
          >
            {inner}
          </button>
        ) : (
          <span key={p.phrase} className="lore__phrase" style={style}>
            {inner}
          </span>
        );
      })}
      {!phrases.length ? <span className="lore__none">{words.none}</span> : null}
    </div>
  );
}
