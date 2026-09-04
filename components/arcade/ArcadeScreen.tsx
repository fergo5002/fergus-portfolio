"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { arcadeCopy } from "@/content/arcade";
import { fetchBoards, submitScore } from "@/lib/arcade/board-client";
import { findGame } from "@/lib/arcade/games";
import { fitGrid } from "@/lib/arcade/grid";
import type { GridFit } from "@/lib/arcade/grid";
import { createInitialsProgram } from "@/lib/arcade/initials";
import { arcadeKey, deliverGesture, gestureOf, shouldCapture } from "@/lib/arcade/input";
import { advance, createLoopState } from "@/lib/arcade/loop";
import type { ProgramHost, ProgramInstance, ProgramResult, ProgramSpec } from "@/lib/arcade/program";
import { arcadeSession, loadInitials, saveInitials, setArcadeBoards } from "@/lib/arcade/session";
import { soundFor } from "@/lib/arcade/sound";
import { pushImpact } from "@/lib/system";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * The arcade's only React, and deliberately the dullest file in it.
 *
 * It measures a character cell, subscribes to the site's one frame clock,
 * writes lines into one `<pre>` through a ref, and routes keys and gestures
 * into whichever program is running. Every decision it could have made lives
 * in `lib/arcade/`, where it is tested in node without a browser.
 *
 * Four things here are load-bearing and each has a grep in
 * `components/arcade/arcade.test.ts`:
 *
 *  - **No second rAF loop, and no setState in a frame callback.** AGENTS.md,
 *    "One frame clock". The grid is written with `textContent`, and only when
 *    the text has actually changed.
 *  - **The arcade owns every key that reaches it.** One `stopPropagation` on
 *    keydown, and the drawer's window listener never sees Escape or a backtick
 *    while a game is running. Neither `lib/shell.ts` nor `ShellDrawer.tsx`
 *    needs to know this component exists.
 *  - **Escape is taken before the program is asked.** A program cannot hold on
 *    to it, so there is exactly one way out of everything, and the exit button
 *    beside the screen is the same way out for a phone.
 *  - **Nothing claims a score was posted until the server says so.** The
 *    initials screen hands over and waits; this posts, and exits with whatever
 *    came back.
 */

const PROBE_LENGTH = 100;
const PROBE = "0".repeat(PROBE_LENGTH);

type Props = {
  program: ProgramSpec;
  /** Lines for the scrollback, and the prompt back. Called exactly once. */
  onExit: (lines: string[]) => void;
};

export default function ArcadeScreen({ program, onExit }: Props) {
  const { frame, onFrame, audio, reducedMotion } = useSystem();

  const wrapRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);

  const runningRef = useRef<{ spec: ProgramSpec; instance: ProgramInstance } | null>(null);
  const loopRef = useRef(createLoopState());
  const lastDrawnRef = useRef("");
  const flashesRef = useRef(0);
  const rectRef = useRef<DOMRect | null>(null);
  const rectStaleRef = useRef(true);
  const pointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const exitedRef = useRef(false);
  const postedRef = useRef(false);
  const seedRef = useRef<string | null>(null);

  const [fit, setFit] = useState<GridFit | null>(null);
  const [measured, setMeasured] = useState(false);

  const helpId = `arcade-help-${useId()}`;

  /* ── leaving ───────────────────────────────────────────────────────────── */

  const leave = useCallback(
    (lines: string[]) => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      runningRef.current?.instance.dispose();
      runningRef.current = null;
      onExit(lines);
    },
    [onExit],
  );

  /* ── the host ──────────────────────────────────────────────────────────── */

  const startProgram = useCallback((spec: ProgramSpec, host: ProgramHost) => {
    runningRef.current?.instance.dispose();
    lastDrawnRef.current = "";
    loopRef.current = createLoopState();
    runningRef.current = { spec, instance: spec.start(host) };
  }, []);

  useEffect(() => {
    if (!measured || !fit) return;

    const post = (game: string, initials: string, score: number) => {
      postedRef.current = true;
      try {
        saveInitials(window.localStorage, initials);
      } catch {
        /* storage refused: nothing was saved, and nothing else changes */
      }
      void submitScore({ game, initials, score }).then((result) => {
        leave([result.ok ? arcadeCopy.initials.saved : result.reason]);
      });
    };

    const finish = (result?: ProgramResult) => {
      const running = runningRef.current;
      const game = running ? findGame(running.spec.id) : undefined;
      const score = result?.score;
      const boards = arcadeSession().boards;
      if (
        !postedRef.current &&
        game?.board &&
        typeof score === "number" &&
        score > 0 &&
        boards?.available === true
      ) {
        startProgram(
          createInitialsProgram({
            game: game.id,
            score,
            seed: seedRef.current,
            onSubmit: (initials) => post(game.id, initials, score),
          }),
          host,
        );
        return;
      }
      leave([result?.label ?? arcadeCopy.left]);
    };

    const host: ProgramHost = {
      cols: fit.cols,
      rows: fit.rows,
      draw: (lines) => {
        const next = lines.join("\n");
        if (next === lastDrawnRef.current) return;
        lastDrawnRef.current = next;
        if (preRef.current) preRef.current.textContent = next;
      },
      sound: (name) => {
        const call = soundFor(name);
        if (!call) return;
        switch (call.method) {
          case "hover":
            audio.hover();
            break;
          case "key":
            audio.key();
            break;
          case "relay":
            audio.relay();
            break;
          case "thud":
            audio.thud();
            break;
          case "impact":
            audio.impact(call.energy);
            break;
        }
      },
      flash: (col, row, energy) => {
        // One a frame. The shader lights MAX_FRAME_IMPACTS and the physics
        // stage shares them, so a game that flashed every tick could starve it.
        if (flashesRef.current >= 1) return;
        if (rectStaleRef.current || !rectRef.current) {
          rectRef.current = preRef.current?.getBoundingClientRect() ?? null;
          rectStaleRef.current = false;
        }
        const rect = rectRef.current;
        if (!rect) return;
        flashesRef.current++;
        pushImpact(frame.current, {
          x: (rect.left + ((col + 0.5) / fit.cols) * rect.width) / window.innerWidth,
          y: (rect.top + ((row + 0.5) / fit.rows) * rect.height) / window.innerHeight,
          energy,
          at: performance.now(),
        });
      },
      run: (spec) => startProgram(spec, host),
      exit: (result) => finish(result),
    };

    startProgram(program, host);

    const unsubscribe = onFrame((_time, dt) => {
      const instance = runningRef.current?.instance;
      if (!instance) return;
      flashesRef.current = 0;
      advance(loopRef.current, dt, (ms) => instance.tick(ms));
    });

    return () => {
      unsubscribe();
      runningRef.current?.instance.dispose();
      runningRef.current = null;
    };
  }, [measured, fit, program, onFrame, audio, frame, leave, startProgram]);

  /* ── measuring ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const box = screenRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;

    const measure = () => {
      const probeRect = probe.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      rectStaleRef.current = true;
      const next = fitGrid(
        { width: boxRect.width, height: boxRect.height },
        { width: probeRect.width / PROBE_LENGTH, height: probeRect.height },
      );
      setFit((current) => {
        if (current && next && current.cols === next.cols && current.rows === next.rows && current.scale === next.scale) {
          return current;
        }
        return next;
      });
      setMeasured(true);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const onScroll = () => {
      rectStaleRef.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /** No room is a sentence, never a clipped grid. */
  useEffect(() => {
    if (measured && !fit) leave([...arcadeCopy.noRoom]);
  }, [measured, fit, leave]);

  /** The preference can change while a game is running, and it wins when it does. */
  useEffect(() => {
    if (reducedMotion) leave([...arcadeCopy.declined]);
  }, [reducedMotion, leave]);

  /** Focus follows the screen, so the first key goes to the game and not the page. */
  useEffect(() => {
    wrapRef.current?.focus();
  }, []);

  /** The boards, and the initials the visitor last used. Both are optional. */
  useEffect(() => {
    try {
      seedRef.current = loadInitials(window.localStorage);
    } catch {
      seedRef.current = null;
    }
    let live = true;
    void fetchBoards().then((snapshot) => {
      if (live) setArcadeBoards(snapshot);
    });
    return () => {
      live = false;
    };
  }, []);

  /* ── input ─────────────────────────────────────────────────────────────── */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The arcade owns every key that reaches it: this is what keeps Escape
    // from also closing the drawer and a backtick from toggling it.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      leave([arcadeCopy.left]);
      return;
    }
    const mods = { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
    if (shouldCapture(e.key, mods)) e.preventDefault();
    if (e.repeat) return;
    const key = arcadeKey(e.key, mods);
    if (!key) return;
    runningRef.current?.instance.key(key, true);
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const key = arcadeKey(e.key, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    if (!key) return;
    runningRef.current?.instance.key(key, false);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    wrapRef.current?.focus();
    pointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    const instance = runningRef.current?.instance;
    if (!start || !instance) return;
    const delivery = deliverGesture(
      gestureOf(e.clientX - start.x, e.clientY - start.y, performance.now() - start.t),
      typeof instance.swipe === "function",
    );
    if (delivery.swipe) instance.swipe?.(delivery.swipe);
    if (delivery.press) {
      instance.key(delivery.press, true);
      instance.key(delivery.press, false);
    }
  };

  return (
    <div
      className="arcade"
      ref={wrapRef}
      role="application"
      aria-label={arcadeCopy.screenLabel}
      aria-describedby={helpId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="arcade__screen" ref={screenRef}>
        <pre
          className="arcade__grid"
          ref={preRef}
          aria-hidden="true"
          data-cols={fit?.cols}
          data-rows={fit?.rows}
          data-scale={fit?.scale}
          style={fit ? ({ "--arcade-scale": String(fit.scale) } as CSSProperties) : undefined}
        />
        {/* Measured at scale 1, because fitGrid applies the scale itself. */}
        <span className="arcade__probe" ref={probeRef} aria-hidden="true">
          {PROBE}
        </span>
      </div>
      <p id={helpId} className="arcade__srhelp">
        {arcadeCopy.screenHelp}
      </p>
      <div className="arcade__foot">
        <button
          type="button"
          className="arcade__exit"
          onClick={() => leave([arcadeCopy.left])}
          aria-label={arcadeCopy.exitLabel}
        >
          esc
        </button>
      </div>
    </div>
  );
}
