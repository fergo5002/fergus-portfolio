"use client";
import { useEffect, useRef, useState } from "react";
import { collectionCopy as copy } from "@/content/arcade-collection";
import { createAttract, type Attract } from "@/lib/arcade/attract";
import { groupDigits, type Board } from "@/lib/arcade/board";
import type { GameId } from "@/lib/arcade/engine";
import { renderGame } from "@/lib/arcade/renderer";
import type { ArcadeTheme } from "@/lib/arcade/theme";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * A cabinet's screen: the real game, playing itself.
 *
 * Runs from the site's one frame clock, only while it is on screen (an
 * IntersectionObserver gates it) and only while the tab is visible. On a
 * coarse pointer it skips the persistence layer and renders every other frame,
 * because six of these on a phone would otherwise eat the budget the tube
 * itself needs.
 *
 * With `cycle` it alternates between the demo and the cabinet's top five, the
 * way a real cabinet does. The switch is a state change every few seconds,
 * never a per-frame one.
 */

const DEMO_MS = 9000;
const BOARD_MS = 4200;

type Props = {
  game: GameId;
  theme: ArcadeTheme;
  board?: Board | null;
  cycle?: boolean;
  /** Offset into the demo/board cycle, so six cabinets do not switch together. */
  phase?: number;
  /** Turns the whole screen off, for example while a modal sits over it. */
  live?: boolean;
  className?: string;
};

export default function AttractScreen({ game, theme, board = null, cycle = false, phase = 0, live = true, className = "" }: Props) {
  const { onFrame } = useSystem();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Lazy: `useRef(createAttract(...))` would deal a fresh dungeon on every render and throw it away.
  const attractRef = useRef<Attract | null>(null);
  if (!attractRef.current) attractRef.current = createAttract(game, (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1) >>> 0);
  const attractHandle = attractRef.current;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const visibleRef = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const [showBoard, setShowBoard] = useState(false);
  const rows = board?.rows.slice(0, 5) ?? [];
  const boardOn = cycle && rows.length > 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const ghostCanvas = coarse ? null : document.createElement("canvas");
    const ghost = ghostCanvas?.getContext("2d") ?? null;
    let parity = 0;
    // Under the Terminal follows the player on a narrow screen, the way it does on a phone.
    let compact = false;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      compact = rect.width < 600;
      const dpr = Math.min(coarse ? 1 : 1.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        if (ghostCanvas) {
          ghostCanvas.width = w;
          ghostCanvas.height = h;
        }
      }
      renderGame(ctx, attractHandle.state, canvas.width, canvas.height, themeRef.current, { hud: false, ghost, compact });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(canvas);
    const visibility = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((e) => e.isIntersecting);
    }, { rootMargin: "80px" });
    visibility.observe(canvas);

    const unsubscribe = onFrame((_time, dt) => {
      if (!visibleRef.current || !liveRef.current) return;
      const attract = attractHandle;
      attract.step(dt / 1000);
      parity ^= 1;
      if (coarse && parity) return;
      renderGame(ctx, attract.state, canvas.width, canvas.height, themeRef.current, { hud: false, ghost, compact });
    });
    return () => {
      unsubscribe();
      resize.disconnect();
      visibility.disconnect();
    };
  }, [onFrame, attractHandle]);

  useEffect(() => {
    if (!boardOn) {
      setShowBoard(false);
      return;
    }
    let timer = 0;
    let onBoard = false;
    const flip = () => {
      onBoard = !onBoard;
      setShowBoard(onBoard);
      timer = window.setTimeout(flip, onBoard ? BOARD_MS : DEMO_MS);
    };
    timer = window.setTimeout(flip, Math.max(400, DEMO_MS - phase));
    return () => window.clearTimeout(timer);
  }, [boardOn, phase]);

  return (
    <div className={`attract${showBoard ? " is-board" : ""} ${className}`.trim()}>
      <canvas className="attract__canvas" ref={canvasRef} width={450} height={280} aria-hidden="true" />
      {boardOn && (
        <div className="attract__board" aria-hidden={!showBoard}>
          <span className="attract__board-title">{copy.topFive}</span>
          <ol className="attract__rows">
            {rows.map((row, i) => (
              <li key={`${i}-${row.initials}`}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <b>{row.initials}</b>
                <span>{groupDigits(row.score)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
