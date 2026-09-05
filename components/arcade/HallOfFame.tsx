"use client";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import type { BoardSnapshot } from "@/lib/arcade/board";
import type { GameId } from "@/lib/arcade/engine";
import { BoardTable } from "./ScoreBoard";

type Props = {
  boards: BoardSnapshot | null;
  onBack(): void;
  onSelect(game: GameId): void;
};

/** Every board on the machine, one window each, the way a cabinet row would show them side by side. */
export default function HallOfFame({ boards, onBack, onSelect }: Props) {
  return (
    <main className="arcade-fame">
      <button type="button" className="arcade-back arcade-btn" onClick={onBack}>
        ← {copy.back}
      </button>
      <h1 className="arcade-fame__title">HALL OF FAME</h1>
      <p className="arcade-fame__lede">{copy.fameLede}</p>
      <div className="arcade-fame__grid">
        {cabinets.map((c, i) => (
          <section className="arcade-fame__board window" key={c.id} style={{ "--i": i } as React.CSSProperties} aria-label={`${c.title} ${copy.board}`}>
            <div className="window__bar">
              <span className="window__title">{c.title}</span>
              <span className="arcade-fame__when">{c.id === "under" ? copy.today : copy.allTime}</span>
            </div>
            <div className="arcade-fame__body">
              <BoardTable game={c.id} snapshot={boards} limit={10} />
              <button type="button" className="arcade-btn arcade-fame__play" onClick={() => onSelect(c.id)}>
                {copy.play} ↗
              </button>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
