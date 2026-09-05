"use client";
import { useState } from "react";
import { collectionCopy as copy, type Cabinet } from "@/content/arcade-collection";
import type { BoardSnapshot } from "@/lib/arcade/board";
import type { GameMode } from "@/lib/arcade/engine";
import type { Link } from "@/lib/arcade/network";
import type { ArcadeTheme } from "@/lib/arcade/theme";
import AttractScreen from "./AttractScreen";
import NetworkLobby from "./NetworkLobby";
import ScoreBoard from "./ScoreBoard";

type Props = {
  cabinet: Cabinet;
  boards: BoardSnapshot | null;
  theme: ArcadeTheme;
  onBack(): void;
  onStart(mode: GameMode, link?: Link | null, seed?: number): void;
  onBoards(): void;
};

/** Walking up to one machine: its screen still playing, the card beside it, the board under that. */
export default function CabinetDetail({ cabinet, boards, theme, onBack, onStart, onBoards }: Props) {
  const [network, setNetwork] = useState(false);
  return (
    <main className="arcade-detail">
      <button type="button" className="arcade-back arcade-btn" onClick={onBack}>
        ← {copy.back}
      </button>
      <div className="arcade-detail__grid">
        <section className="arcade-detail__machine window">
          <div className="window__bar">
            <span className="window__title">~/arcade/{cabinet.id}</span>
            <span className="arcade-detail__players">{cabinet.multiplayer ? copy.players2 : copy.players1}</span>
          </div>
          <div className="arcade-detail__screen">
            <AttractScreen game={cabinet.id} theme={theme} />
          </div>
          <div className="arcade-detail__marquee">
            <h1 className="arcade-detail__title">{cabinet.title}</h1>
            <p className="arcade-detail__genre">{cabinet.genre}</p>
          </div>
        </section>
        <section className="arcade-detail__card">
          <p className="arcade-detail__sub">{cabinet.subtitle}</p>
          <p>{cabinet.description}</p>
          <p>
            <b>{copy.objective}.</b> {cabinet.objective}
          </p>
          <p>
            <b>{copy.controls}.</b> {cabinet.controls}
          </p>
          <div className="arcade-actions">
            <button type="button" className="arcade-btn arcade-primary arcade-start" onClick={() => onStart("solo")}>
              {copy.play}
            </button>
            {cabinet.multiplayer && (
              <>
                <button type="button" className="arcade-btn" onClick={() => onStart("local")}>
                  {copy.local}
                </button>
                <button type="button" className="arcade-btn" onClick={() => setNetwork((n) => !n)} aria-expanded={network}>
                  {copy.online}
                </button>
              </>
            )}
          </div>
          {network && <NetworkLobby game={cabinet.id} onStart={(link, seed) => onStart("online", link, seed)} />}
          <ScoreBoard game={cabinet.id} boards={boards} onBoards={onBoards} />
        </section>
      </div>
    </main>
  );
}
