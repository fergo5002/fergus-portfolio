"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { arcadeCopy } from "@/content/arcade";
import { fetchBoards, submitScore } from "@/lib/arcade/board-client";
import { findGame } from "@/lib/arcade/games";
import { finishOutcome } from "@/lib/arcade/finish";
import { fitGrid } from "@/lib/arcade/grid";
import type { GridFit } from "@/lib/arcade/grid";
import { createInitialsProgram } from "@/lib/arcade/initials";
import {
  arcadeKey,
  deliverGesture,
  gestureOf,
  holdKey,
  releaseAllKeys,
  releaseKey,
  shouldCapture,
} from "@/lib/arcade/input";
import type { HeldKeys } from "@/lib/arcade/input";
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

function fromControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

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
  const hostRef = useRef<ProgramHost | null>(null);
  const fitRef = useRef<GridFit | null>(null);
  const onExitRef = useRef(onExit);
  const loopRef = useRef(createLoopState());
  const lastDrawnRef = useRef("");
  const flashesRef = useRef(0);
  const rectRef = useRef<DOMRect | null>(null);
  const rectStaleRef = useRef(true);
  const pointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const heldKeysRef = useRef<HeldKeys>(new Map());
  const exitedRef = useRef(false);
  const postedRef = useRef(false);
  const seedRef = useRef<string | null>(null);

  const [fit, setFit] = useState<GridFit | null>(null);
  const [measured, setMeasured] = useState(false);
  fitRef.current = fit;
  const ready = measured && fit !== null;

  const helpId = `arcade-help-${useId()}`;

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  /* ── leaving ───────────────────────────────────────────────────────────── */

  const releaseHeld = useCallback(() => {
    const instance = runningRef.current?.instance;
    if (!instance) {
      heldKeysRef.current.clear();
      return;
    }
    for (const key of releaseAllKeys(heldKeysRef.current)) instance.key(key, false);
  }, []);

  const leave = useCallback((lines: string[]) => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    releaseHeld();
    runningRef.current?.instance.dispose();
    runningRef.current = null;
    onExitRef.current(lines);
  }, [releaseHeld]);

  /* ── the host ──────────────────────────────────────────────────────────── */

  const startProgram = useCallback((spec: ProgramSpec, host: ProgramHost) => {
    releaseHeld();
    runningRef.current?.instance.dispose();
    lastDrawnRef.current = "";
    loopRef.current = createLoopState();
    runningRef.current = { spec, instance: spec.start(host) };
  }, [releaseHeld]);

  useEffect(() => {
    if (!ready) return;
    const initialFit = fitRef.current;
    if (!initialFit) return;

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
      const outcome = finishOutcome({
        posted: postedRef.current,
        board: Boolean(game?.board),
        score,
        available: boards?.available === true,
        label: result?.label,
      });
      if (outcome.kind === "initials") {
        if (!game) {
          leave([arcadeCopy.left]);
          return;
        }
        startProgram(
          createInitialsProgram({
            game: game.id,
            score: outcome.score,
            seed: seedRef.current,
            onSubmit: (initials) => post(game.id, initials, outcome.score),
          }),
          host,
        );
        return;
      }
      leave(outcome.lines);
    };

    const host: ProgramHost = {
      cols: initialFit.cols,
      rows: initialFit.rows,
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
        const currentFit = fitRef.current;
        if (!rect || !currentFit) return;
        flashesRef.current++;
        pushImpact(frame.current, {
          x: (rect.left + ((col + 0.5) / currentFit.cols) * rect.width) / window.innerWidth,
          y: (rect.top + ((row + 0.5) / currentFit.rows) * rect.height) / window.innerHeight,
          energy,
          at: performance.now(),
        });
      },
      run: (spec) => startProgram(spec, host),
      exit: (result) => finish(result),
    };

    hostRef.current = host;
    startProgram(program, host);

    const unsubscribe = onFrame((_time, dt) => {
      const instance = runningRef.current?.instance;
      if (!instance) return;
      flashesRef.current = 0;
      advance(loopRef.current, dt, (ms) => {
        if (runningRef.current?.instance !== instance) return;
        instance.tick(ms);
      });
    });

    return () => {
      unsubscribe();
      releaseHeld();
      runningRef.current?.instance.dispose();
      runningRef.current = null;
      hostRef.current = null;
    };
  }, [ready, program, onFrame, audio, frame, leave, releaseHeld, startProgram]);

  /** Resize changes the game's world; it does not erase the game in progress. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !fit) return;
    host.cols = fit.cols;
    host.rows = fit.rows;
    const instance = runningRef.current?.instance;
    instance?.resize?.(fit.cols, fit.rows);
    rectStaleRef.current = true;
  }, [fit]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseHeld();
    };
    window.addEventListener("blur", releaseHeld);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", releaseHeld);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [releaseHeld]);

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
    observer.observe(probe);
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
    if (fromControl(e.target)) return;
    const mods = { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
    if (shouldCapture(e.key, mods)) e.preventDefault();
    if (e.repeat) return;
    const key = arcadeKey(e.key, mods);
    if (!key) return;
    const pressed = holdKey(heldKeysRef.current, e.code || e.key, key);
    if (pressed) runningRef.current?.instance.key(pressed, true);
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const key = releaseKey(heldKeysRef.current, e.code || e.key);
    if (!key) return;
    runningRef.current?.instance.key(key, false);
  };

  const onBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (!(next instanceof Node) || !e.currentTarget.contains(next)) releaseHeld();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (fromControl(e.target)) {
      pointerRef.current = null;
      return;
    }
    wrapRef.current?.focus();
    pointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (fromControl(e.target)) {
      pointerRef.current = null;
      return;
    }
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
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerRef.current = null;
      }}
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
