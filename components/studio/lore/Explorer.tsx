"use client";
import { forwardRef, type RefObject } from "react";
import type { Cell } from "@/lib/studio/lore";
import type { ChatMessage } from "@/lib/lab/chat";

/**
 * The messages, opened from a cell of the week, a phrase or the search, in a
 * panel under the screen. Its head says what is showing (the hour, the voice)
 * as chips that each take one filter away; the search reads the words; one
 * line says what the pseudonyms do and do not hide. The list scrolls in
 * place and says so to Lenis (`data-lenis-prevent`), or the wheel would move
 * the page instead.
 */
type Props = {
  found: readonly ChatMessage[];
  limit: number;
  onMore: () => void;
  query: string;
  onQuery: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  pick: Cell | null;
  onUnpick: () => void;
  voice: string;
  onUnfocus: () => void;
  onClear: () => void;
  onClose: () => void;
  label: (name: string) => string;
  number: (name: string) => string;
  words: {
    explorer: string;
    messages: (n: number) => string;
    cellChip: (cell: Cell) => string;
    remove: (what: string) => string;
    search: string;
    privacy: string;
    clear: string;
    close: string;
    more: string;
    empty: string;
  };
};

const STAMP = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const Explorer = forwardRef<HTMLElement, Props>(function Explorer(
  { found, limit, onMore, query, onQuery, searchRef, pick, onUnpick, voice, onUnfocus, onClear, onClose, label, number, words },
  ref,
) {
  const filtered = !!(pick || voice || query);
  return (
    <section className="lore__explorer" ref={ref} aria-label={words.explorer}>
      <div className="lore__explorer-head">
        <output className="lore__count">{words.messages(found.length)}</output>
        {pick ? (
          <button type="button" className="lore__chip" aria-label={words.remove(words.cellChip(pick))} onClick={onUnpick}>
            {words.cellChip(pick)}
          </button>
        ) : null}
        {voice ? (
          <button type="button" className="lore__chip" aria-label={words.remove(label(voice))} onClick={onUnfocus}>
            {label(voice)}
          </button>
        ) : null}
        {filtered ? (
          <button type="button" className="lore__quiet" onClick={onClear}>
            {words.clear}
          </button>
        ) : null}
        <button type="button" className="lore__close" aria-label={words.close} onClick={onClose} />
      </div>
      <label className="lore__search">
        <span>{words.search}</span>
        <input
          ref={searchRef}
          className="lore__search-input"
          type="search"
          value={query}
          maxLength={200}
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <p className="lore__note">{words.privacy}</p>
      <div className="lore-messages" data-lenis-prevent="">
        {found.slice(0, limit).map((m, i) => (
          <article key={`${m.at}-${i}`}>
            <div>
              <span className="lore__avatar">{number(m.sender)}</span>
              <strong>{label(m.sender)}</strong>
              <time dateTime={new Date(m.at).toISOString()}>{STAMP.format(m.at)}</time>
            </div>
            <p>{m.text}</p>
          </article>
        ))}
      </div>
      {!found.length ? <p className="lore__none">{words.empty}</p> : null}
      {found.length > limit ? (
        <button type="button" className="lore__quiet" onClick={onMore}>
          {words.more}
        </button>
      ) : null}
    </section>
  );
});

export default Explorer;
