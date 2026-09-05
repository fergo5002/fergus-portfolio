"use client";
import { useEffect, useRef, useState } from "react";
import { biosLines, collectionCopy as copy } from "@/content/arcade-collection";
import { barText, typedCount, typedText, typingDuration } from "@/lib/arcade/bios";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * Changing electrics.
 *
 * The long form is a power-cycle, told with the machinery the site already
 * has. The tube loses the channel (the same static overlay a route change
 * uses, and a degauss), then `frame.bootTarget` is driven to zero so the
 * shader collapses the picture to a bright line and goes dark. A different
 * machine strikes back on: `bootTarget` returns to one, the power-on sound
 * plays, and an arcade BIOS types into the opening band, squeezed by the same
 * `--boot-open` variable the site's own boot uses. Then a bar fills and the
 * gallery is revealed.
 *
 * The short form, for anyone who has been in this page lifetime already, is
 * the channel loss alone.
 *
 * The BIOS types by elapsed time from the one frame clock, not by a chain of
 * timeouts. Measured on 2026-09-05 in headless Chromium, where the tube's
 * WebGL runs in software and the main thread is busy for about 150ms at a
 * time: a 6ms timeout chain typed one character every 90ms and the sequence
 * never finished. Elapsed-time typing lands the same words at the same
 * moment whatever the frame rate, and a watchdog hands over regardless.
 * Skipping, or unmounting part-way, restores the tube to fully up, because a
 * room that leaves the tube dark is worse than no room.
 */

export const ENTRANCE = {
  staticMs: 520,
  collapseAt: 150,
  strikeAt: 1650,
  biosAt: 2000,
  /** Milliseconds a character. */
  biosSpeed: 6,
  /** A pause at the end of each typed line, so the eye can read it. */
  lineHoldMs: 90,
  barMs: 420,
  barCells: 24,
  shortMs: 420,
  /** Hands over whatever else has happened. Long enough for the slowest honest run. */
  watchdogMs: 9000,
} as const;

type Phase = "static" | "dark" | "bios" | "bar";

type Props = {
  long: boolean;
  cabinetCount: number;
  boards: "online" | "offline" | "checking";
  onDone(): void;
};

export default function ArcadeEntrance({ long, cabinetCount, boards, onDone }: Props) {
  const { frame, degauss, audio, onFrame } = useSystem();
  const [phase, setPhase] = useState<Phase>("static");
  const [showStatic, setShowStatic] = useState(true);
  const linesRef = useRef<HTMLPreElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const [lines, setLines] = useState<string[] | null>(null);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const f = frame.current;
    f.bootTarget = 1;
    f.boot = 1;
    onDoneRef.current();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    degauss();
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(ENTRANCE.staticMs, () => setShowStatic(false));
    if (!long) {
      at(ENTRANCE.shortMs, () => finishRef.current());
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    at(ENTRANCE.collapseAt, () => {
      frame.current.bootTarget = 0;
      setPhase("dark");
    });
    at(ENTRANCE.strikeAt, () => {
      frame.current.bootTarget = 1;
      audio.powerOn();
    });
    at(ENTRANCE.biosAt, () => {
      setLines(biosLines(cabinetCount, boardsRef.current));
      setPhase("bios");
    });
    at(ENTRANCE.watchdogMs, () => finishRef.current());
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      // Unmounted part-way (Escape, a route change, reduced motion arriving):
      // never leave the tube collapsed behind a room that is no longer there.
      const f = frame.current;
      f.bootTarget = 1;
      if (f.boot < 1) f.boot = 1;
    };
  }, [long, cabinetCount, frame, degauss, audio]);

  /** The BIOS, typed by elapsed time from the one clock and written through a ref. */
  useEffect(() => {
    if (phase !== "bios" || !lines) return;
    const started = performance.now();
    let shown = -1;
    const unsubscribe = onFrame((time) => {
      const count = typedCount(lines, Math.max(0, time - started), ENTRANCE.biosSpeed, ENTRANCE.lineHoldMs);
      if (count !== shown && linesRef.current) {
        shown = count;
        linesRef.current.textContent = typedText(lines, count);
      }
    });
    const duration = typingDuration(lines, ENTRANCE.biosSpeed, ENTRANCE.lineHoldMs) + 120;
    const timer = window.setTimeout(() => setPhase("bar"), duration);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [phase, lines, onFrame]);

  /** The bar: 24 cells over ENTRANCE.barMs, the same way. */
  useEffect(() => {
    if (phase !== "bar" || !lines) return;
    if (linesRef.current) linesRef.current.textContent = typedText(lines, Number.MAX_SAFE_INTEGER);
    const started = performance.now();
    const unsubscribe = onFrame((time) => {
      if (barRef.current) barRef.current.textContent = barText(time - started, ENTRANCE.barMs, ENTRANCE.barCells);
    });
    const timer = window.setTimeout(() => finishRef.current(), ENTRANCE.barMs + 160);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [phase, lines, onFrame]);

  return (
    <div
      className="arcade-entrance"
      role="status"
      aria-label={copy.arrival}
      onClick={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          finish();
        }
      }}
    >
      {showStatic && <div className="channel" aria-hidden="true" />}
      {(phase === "bios" || phase === "bar") && lines && (
        <div className="arcade-bios">
          <pre className="arcade-bios__lines" ref={linesRef} aria-live="polite" />
          {phase === "bar" && <div className="arcade-bios__bar" ref={barRef} aria-hidden="true">{barText(0, ENTRANCE.barMs, ENTRANCE.barCells)}</div>}
        </div>
      )}
      <button type="button" className="arcade-entrance__skip" onClick={finish}>
        {copy.skip} ↵
      </button>
    </div>
  );
}
