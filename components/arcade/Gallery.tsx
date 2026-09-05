"use client";
import type { KeyboardEvent } from "react";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import type { BoardSnapshot } from "@/lib/arcade/board";
import type { GameId } from "@/lib/arcade/engine";
import type { ArcadeTheme } from "@/lib/arcade/theme";
import { useSystem } from "@/components/system/SystemProvider";
import AttractScreen from "./AttractScreen";

/**
 * The room's front: six cabinets, each playing itself.
 *
 * A cabinet is a list item with a stretched button, not a button wrapping a
 * canvas and a list, because a `<button>` may only hold phrasing content and
 * the top-five overlay is a list. The button's `::after` covers the whole
 * cabinet, so a tap on the screen and a tap on the marquee do the same thing,
 * and the keyboard walks the buttons with the arrows.
 */

type Props = {
  boards: BoardSnapshot | null;
  theme: ArcadeTheme;
  live: boolean;
  onSelect(game: GameId): void;
};

export default function Gallery({ boards, theme, live, onSelect }: Props) {
  const { audio } = useSystem();
  const boardFor = (id: GameId) => boards?.boards.find((b) => b.game === id) ?? null;

  const walk = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const buttons = e.currentTarget.closest(".arcade-cabinets")?.querySelectorAll<HTMLButtonElement>(".arcade-cabinet");
    buttons?.[(index + step + cabinets.length) % cabinets.length]?.focus();
  };

  return (
    <main className={`arcade-gallery${live ? " is-live" : ""}`}>
      <div className="arcade-marquee">
        <h1 className="arcade-marquee__title">{copy.title}</h1>
        <p className="arcade-marquee__lede">
          <b>{copy.ledeLead}</b> {copy.lede}
        </p>
        <p className="arcade-marquee__hint" aria-hidden="true">
          ▸ {copy.hint}
        </p>
      </div>
      <ul className="arcade-cabinets">
        {cabinets.map((c, i) => (
          <li className="cabinet" key={c.id} style={{ "--i": i } as React.CSSProperties}>
            <div className="cabinet__screen">
              <AttractScreen game={c.id} theme={theme} board={boardFor(c.id)} cycle phase={i * 1400} live={live} />
              <span className="cabinet__corners" aria-hidden="true" />
            </div>
            <button
              type="button"
              className="arcade-cabinet cabinet__button"
              data-game={c.id}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => walk(e, i)}
              onPointerEnter={() => audio.hover()}
              onFocus={() => audio.hover()}
            >
              <span className="cabinet__row">
                <span className="cabinet__no">{String(i + 1).padStart(2, "0")}</span>
                <span className="cabinet__genre">{c.genre}</span>
                <span className="cabinet__players">{c.multiplayer ? copy.players2 : copy.players1}</span>
              </span>
              <span className="cabinet__title">{c.title}</span>
              <span className="cabinet__line">{c.subtitle}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="arcade-note">{copy.privacy}</p>
    </main>
  );
}
