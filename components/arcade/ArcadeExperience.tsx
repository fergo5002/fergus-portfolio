"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import { arcadeCopy } from "@/content/arcade";
import { fetchBoards } from "@/lib/arcade/board-client";
import type { BoardSnapshot } from "@/lib/arcade/board";
import { GAME_IDS, type GameId, type GameMode } from "@/lib/arcade/engine";
import type { ProgramSpec } from "@/lib/arcade/program";
import type { Link } from "@/lib/arcade/network";
import { arcadeSession, markArcadeEntered, setArcadeBoards } from "@/lib/arcade/session";
import { todaySeed } from "@/lib/arcade/attract";
import { shellStore } from "@/lib/shell";
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
 * page read as a CRT reaches the arcade too. The page, drawer and status
 * strip are hidden while it is up. The regular navigation returns after the
 * entrance, and a normal link closes this room's host before changing route.
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
  const path = usePathname();
  const enteredPath = useRef(path);
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

  // Normal nav links close before navigation. Back/forward and other route
  // changes must release the same owner rather than leave a new page hidden.
  useEffect(() => {
    if (path !== enteredPath.current) shellStore.dispatch({ type: "close" });
  }, [path]);

  // Own keyboard input before the room paints. Waiting for a passive effect
  // leaves Escape able to reach the drawer and unmount its terminal as well.
  useLayoutEffect(() => {
    roomRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    // Pathname does not change when Back leaves /contact?meet=coffee for
    // /contact. History still changes the page underneath this room.
    const onHistory = () => shellStore.dispatch({ type: "close" });
    window.addEventListener("popstate", onHistory);
    html.classList.add("arcade-open");
    html.classList.add("arcade-entering");
    shellStore.dispatch({ type: "arcade", phase: "entering" });
    setScrollLocked(true);
    setEjected(false);
    setGravity(false);
    return () => {
      window.removeEventListener("popstate", onHistory);
      html.classList.remove("arcade-open");
      html.classList.remove("arcade-entering");
      shellStore.dispatch({ type: "arcade", phase: "closed" });
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
    // Play focuses the stage, never the back button: this effect runs after the game has
    // focused its own stage, and a back button under focus turns the first Space, the
    // launch key, into "all cabinets". Found by hand on the live site, 2026-09-05. The game
    // focuses the same node itself; two calls on one node are deliberate, not two owners.
    const target = screen.kind === "gallery" ? ".arcade-cabinet" : screen.kind === "detail" ? ".arcade-start" : screen.kind === "play" ? ".arcade-stage" : ".arcade-back";
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
      className={`arcade-room${entering ? " is-entering" : ""}`}
      ref={roomRef}
      role="region"
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
            document.documentElement.classList.remove("arcade-entering");
            shellStore.dispatch({ type: "arcade", phase: "ready" });
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
