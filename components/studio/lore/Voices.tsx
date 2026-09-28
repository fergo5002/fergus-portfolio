"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Toggle } from "@/components/instrument";

/**
 * Who talks, as a bar each, beside the week (under it on a phone). A voice
 * pressed focuses the week and the phrases on that voice alone; pressed
 * again, everyone comes back. The six loudest show; the rest fold behind
 * one line. The pseudonym switch sits here because it renames these labels.
 *
 * Before hydration the rows are drawn as plain rows, not buttons, so nothing
 * on the page offers a press it cannot yet answer.
 */
const SHOWN = 6;

export default function Voices({
  voices,
  label,
  focus,
  onFocus,
  pseudo,
  onPseudo,
  ready,
  words,
}: {
  voices: readonly { name: string; count: number }[];
  label: (name: string) => string;
  focus: string;
  onFocus: (name: string) => void;
  pseudo: boolean;
  onPseudo: (on: boolean) => void;
  ready: boolean;
  words: { voicesLabel: string; pseudo: string; moreVoices: (n: number) => string; fewerVoices: string };
}) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...voices.map((v) => v.count));
  const shown = all ? voices : voices.slice(0, SHOWN);
  const row = (v: { name: string; count: number }): ReactNode => (
    <>
      <span className="lore__voice-name">{label(v.name)}</span>
      <span className="lore__voice-bar" style={{ "--share": (v.count / max).toFixed(3) } as CSSProperties} />
      <span className="lore__voice-count">{v.count.toLocaleString("en-GB")}</span>
    </>
  );
  return (
    <div className="lore__voices">
      <ol className="lore__voice-list" aria-label={words.voicesLabel}>
        {shown.map((v) => (
          <li key={v.name}>
            {ready ? (
              <button
                type="button"
                className="lore__voice"
                aria-pressed={focus === v.name}
                onClick={() => onFocus(focus === v.name ? "" : v.name)}
              >
                {row(v)}
              </button>
            ) : (
              <span className="lore__voice">{row(v)}</span>
            )}
          </li>
        ))}
      </ol>
      {ready && voices.length > SHOWN ? (
        <button type="button" className="lore__quiet" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? words.fewerVoices : words.moreVoices(voices.length - SHOWN)}
        </button>
      ) : null}
      {ready ? <Toggle className="lore__pseudo" label={words.pseudo} checked={pseudo} onChange={onPseudo} /> : null}
    </div>
  );
}
