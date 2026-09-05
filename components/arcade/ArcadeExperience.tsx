"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import { arcadeCopy } from "@/content/arcade";
import { fetchBoards } from "@/lib/arcade/board-client";
import type { BoardSnapshot } from "@/lib/arcade/board";
import { GAME_IDS, type GameId, type GameMode } from "@/lib/arcade/engine";
import type { ProgramSpec } from "@/lib/arcade/program";
import type { Link } from "@/lib/arcade/network";
import { arcadeSession, markArcadeEntered, setArcadeBoards } from "@/lib/arcade/session";
import { todaySeed } from "@/lib/arcade/attract";
import { useSystem } from "@/components/system/SystemProvider";
import ArcadeEntrance from "./ArcadeEntrance";
import ArcadeScreen from "./ArcadeScreen";
import CabinetDetail from "./CabinetDetail";
import CanvasGame from "./CanvasGame";
import Gallery from "./Gallery";
import HallOfFame from "./HallOfFame";
import { useArcadeTheme } from "./useArcadeTheme";
import "./arcade.css";

/**
 * The room, inside the tube.
 *
 * A fixed panel at z-index 8990: above the page, below the scanlines, the
 * vignette, the glass and the flicker, so everything the site does to make a
 * page read as a CRT reaches the arcade too. The page underneath, the nav,
 * the drawer and the status strip are hidden by `html.arcade-open` while it
 * is up, because the drawer and the strip sit above 9000 and would draw over
 * it, and the strip's prompt button would unmount the terminal this was
 * launched from.
 *
 * `data-lenis-prevent` is the scroll fix. Lenis is stopped for the document
 * behind the room, and a stopped Lenis cancels every wheel event it sees
 * unless an ancestor of the target carries this attribute. Measured against a
 * production build with a real wheel: 0px of movement without it, and
 * `scripts/arcade-scroll-check.mjs` keeps it that way.
 */

type Screen =
  | { kind: "gallery" }
  | { kind: "fame" }
  | { kind: "detail"; game: GameId }
  | { kind: "play"; game: GameId; mode: GameMode; seed: number; count: number; link: Link | null };

type Props = { program: ProgramSpec; onExit(lines: string[]): void };

function Room({ program, onExit }: Props) {
  const { reducedMotion, audioLive, setAudioEnabled, setScrollLocked, setEjected, setGravity, degauss, frame, audio } = useSystem();
  const theme = useArcadeTheme();
  const roomRef = useRef<HTMLElement>(null);
  const linkRef = useRef<Link | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const [longEntrance] = useState(() => !arcadeSession().entered);
  const [entering, setEntering] = useState(true);
  const [boards, setBoards] = useState<BoardSnapshot | null>(arcadeSession().boards);
  const [screen, setScreen] = useState<Screen>(() =>
    program.id === "arcade" ? { kind: "gallery" } : { kind: "detail", game: program.id as GameId },
  );
  const [count, setCount] = useState(0);

  const refreshBoards = useCallback(() => {
    let live = true;
    void fetchBoards().then((snapshot) => {
      if (!live) return;
      setArcadeBoards(snapshot);
      setBoards(snapshot);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => refreshBoards(), [refreshBoards]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("arcade-open");
    setScrollLocked(true);
    setEjected(false);
    setGravity(false);
    roomRef.current?.focus({ preventScroll: true });
    return () => {
      html.classList.remove("arcade-open");
      setScrollLocked(false);
      linkRef.current?.close();
      // Belt and braces with the entrance's own cleanup: never leave the tube dark.
      frame.current.bootTarget = 1;
      if (frame.current.boot < 1) frame.current.boot = 1;
    };
  }, [setScrollLocked, setEjected, setGravity, frame]);

  useEffect(() => {
    if (reducedMotion) exitRef.current([...arcadeCopy.declined]);
  }, [reducedMotion]);

  useEffect(() => {
    if (entering || !roomRef.current) return;
    const room = roomRef.current;
    room.scrollTop = 0;
    const target = screen.kind === "gallery" ? ".arcade-cabinet" : screen.kind === "detail" ? ".arcade-start" : ".arcade-back";
    room.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
  }, [entering, screen]);

  const leave = useCallback(() => {
    degauss();
    exitRef.current([arcadeCopy.left]);
  }, [degauss]);

  const start = (game: GameId, mode: GameMode, link: Link | null = null, netSeed?: number) => {
    linkRef.current = link;
    const seed = game === "under" ? todaySeed() : netSeed ?? (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1) >>> 0;
    const next = count + 1;
    setCount(next);
    setScreen({ kind: "play", game, mode, seed, count: next, link });
  };
  const back = () => {
    linkRef.current?.close();
    linkRef.current = null;
    setScreen({ kind: "gallery" });
  };

  const cabinet = screen.kind === "detail" || screen.kind === "play" ? cabinets.find((c) => c.id === screen.game) : undefined;
  const boardsState = boards === null ? "checking" : boards.available ? "online" : "offline";

  // The door already declines under reduced motion (lib/commands/hidden.ts), and the effect
  // above leaves if the preference arrives mid-session. This makes the same commit render
  // nothing, so six attract screens never mount for a frame on the way out.
  if (reducedMotion) return null;

  return createPortal(
    <section
      className="arcade-room"
      ref={roomRef}
      role="dialog"
      aria-modal="true"
      aria-label={copy.label}
      data-lenis-prevent=""
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          leave();
        }
      }}
      onKeyUp={(e) => e.stopPropagation()}
    >
      {entering && (
        <ArcadeEntrance
          long={longEntrance}
          cabinetCount={cabinets.length}
          boards={boardsState}
          onDone={() => {
            markArcadeEntered();
            setEntering(false);
            degauss();
            audio.relay();
          }}
        />
      )}
      <div className={`arcade-room__inner${entering ? " is-entering" : ""}`} inert={entering || undefined}>
        <header className="arcade-bar">
          <button type="button" className="arcade-bar__home" onClick={back} aria-label={copy.back}>
            <span className="arcade-bar__prompt">fergus@portfolio</span>
            <span className="arcade-bar__path">~/arcade{cabinet ? `/${cabinet.id}` : screen.kind === "fame" ? "/fame" : ""}</span>
          </button>
          <div className="arcade-bar__actions">
            {screen.kind !== "play" && (
              <button type="button" className="arcade-btn arcade-bar__fame" onClick={() => setScreen(screen.kind === "fame" ? { kind: "gallery" } : { kind: "fame" })} aria-pressed={screen.kind === "fame"}>
                <span className="arcade-bar__long">{copy.fame}</span>
                <span className="arcade-bar__short">{copy.fameShort}</span>
              </button>
            )}
            <button type="button" className={`arcade-btn arcade-bar__sound${audioLive ? " is-on" : ""}`} onClick={() => setAudioEnabled(!audioLive)} aria-pressed={audioLive}>
              {audioLive ? copy.soundOn : copy.soundOff}
            </button>
            <button type="button" className="arcade-btn arcade-bar__exit" onClick={leave} aria-label={copy.exit}>
              {copy.exitShort}
            </button>
          </div>
        </header>
        {screen.kind === "play" && cabinet ? (
          <CanvasGame
            key={`${cabinet.id}-${screen.count}`}
            cabinet={cabinet}
            mode={screen.mode}
            seed={screen.seed}
            link={screen.link}
            theme={theme}
            boards={boards}
            onBack={back}
            onReplay={() => start(cabinet.id, screen.mode)}
            onBoards={refreshBoards}
          />
        ) : screen.kind === "detail" && cabinet ? (
          <CabinetDetail
            cabinet={cabinet}
            boards={boards}
            theme={theme}
            onBack={back}
            onStart={(mode, link, seed) => start(cabinet.id, mode, link ?? null, seed)}
            onBoards={refreshBoards}
          />
        ) : screen.kind === "fame" ? (
          <HallOfFame boards={boards} onBack={back} onSelect={(game) => setScreen({ kind: "detail", game })} />
        ) : (
          <Gallery boards={boards} theme={theme} live={!entering} onSelect={(game) => setScreen({ kind: "detail", game })} />
        )}
      </div>
    </section>,
    document.body,
  );
}

export default function ArcadeExperience(props: Props) {
  const known = props.program.id === "arcade" || GAME_IDS.includes(props.program.id as GameId);
  if (!known) return <ArcadeScreen {...props} />;
  return <Room {...props} />;
}
