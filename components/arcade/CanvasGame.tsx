"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent } from "react";
import { collectionCopy as copy, screenCopy, statusLine, type Cabinet } from "@/content/arcade-collection";
import type { BoardSnapshot } from "@/lib/arcade/board";
import { cardAt } from "@/lib/arcade/draw/poker";
import { eventsSince, gameHud, inputOf, typedOf, type GameSound, type GameState } from "@/lib/arcade/engine";
import { clientToStage, stageFor, stageKind, toWorld, type StageKind } from "@/lib/arcade/layout";
import { eventPoint, renderRun } from "@/lib/arcade/renderer";
import { countdownLabel, createRun, isNewBest, pauseRun, pressRun, resultDue, stepRun, type Run } from "@/lib/arcade/run";
import { bestFor, rememberBest } from "@/lib/arcade/session";
import { steerKeys } from "@/lib/arcade/steer";
import { diffInput, pressesFor } from "@/lib/arcade/text-input";
import type { ArcadeTheme } from "@/lib/arcade/theme";
import { pushImpact } from "@/lib/system";
import { useSystem } from "@/components/system/SystemProvider";
import ScoreBoard from "./ScoreBoard";

/**
 * One cabinet, running: the run's phases (`lib/arcade/run.ts`) drawn through
 * the shared chrome (`lib/arcade/chrome.ts`) on a stage that lies down on a
 * wide screen and stands up on a phone (`lib/arcade/layout.ts`).
 *
 *  - One clock. The canvas is stepped and drawn from SystemProvider's frame
 *    loop at a fixed 60Hz; nothing here starts a timer to move a game.
 *  - One owner of focus. The stage takes focus when the game mounts, so the
 *    first Space starts the run from the how-to-play card. A typing game
 *    moves focus into its own text input inside the gesture that starts it,
 *    because that is the only moment a phone will raise its keyboard.
 *  - Every engine event plays through the synth and lights the tube where it
 *    was drawn: the event's point goes through the stage, then the canvas's
 *    rect, onto the frame the shader already reads. One light a frame.
 *  - Colours come from the theme the room read off the site's tokens.
 *  - The HUD is drawn on the canvas. A hidden status line carries the same
 *    facts to a screen reader, about once a second, written through a ref.
 */

function inputFor(key: string) {
  const k = key.toLowerCase();
  const arrow = ({ arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" } as Record<string, string>)[k];
  const letter = ({ w: "up", s: "down", a: "left", d: "right" } as Record<string, string>)[k];
  if (arrow) return arrow;
  if (letter) return letter;
  if (k === " ") return "action";
  if (k === "enter") return "bank";
  if (/^[1-5]$/.test(k)) return k;
  return null;
}

/** The most game sounds one frame plays, so a burst of kills is a rattle, not a wall. */
const SOUNDS_PER_FRAME = 3;

type Props = {
  cabinet: Cabinet;
  seed: number;
  /** Straight to the countdown: the visitor has just seen the card. Typing games always show it, to take the tap. */
  replay: boolean;
  theme: ArcadeTheme;
  boards: BoardSnapshot | null;
  onBack(): void;
  onReplay(): void;
  onBoards(): void;
};

export default function CanvasGame({ cabinet, seed, replay, theme, boards, onBack, onReplay, onBoards }: Props) {
  const { onFrame, audio, frame, audioLive, setAudioEnabled } = useSystem();
  const typing = inputOf(cabinet.id) === "text";
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null), typeRef = useRef<HTMLInputElement>(null), resultRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<Run | null>(null);
  // A coarse pointer is a phone or a tablet: the run records the touch profile, which a typing game reads (the room never renders on the server).
  if (!runRef.current) runRef.current = createRun(cabinet.id, seed, { best: bestFor(cabinet.id, boards), skipCard: replay && !typing, touch: window.matchMedia("(pointer: coarse)").matches });
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const keys = useRef(new Set<string>()), physical = useRef(new Map<string, string>());
  const [kind, setKind] = useState<StageKind>("wide");
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const [paused, setPaused] = useState(false), [result, setResult] = useState<GameState | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [error, setError] = useState(""), [ticket, setTicket] = useState<string | null>(null);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  /** The value the room last saw in the text input, for the diff. */
  const typedRef = useRef("");
  const composing = useRef(false);
  /** Where a held finger is steering Dead Signal, in world pixels; null when no finger is down. */
  const steerTo = useRef<{ x: number; y: number } | null>(null);
  /** The single end-of-run event. React is never used to draw a frame; this runs once, when GAME OVER has held. */
  const finishRef = useRef<(s: GameState) => void>(() => {});
  finishRef.current = (s) => {
    const run = runRef.current!;
    setNewBest(isNewBest(run));
    rememberBest(cabinet.id, s.score);
    setResult(structuredClone(s));
  };
  const stage = stageFor(cabinet.id, kind);

  const release = useCallback(() => { keys.current.clear(); physical.current.clear(); steerTo.current = null; }, []);
  const pause = useCallback((value: boolean) => {
    const done = pauseRun(runRef.current!, value);
    setPaused(done && value);
    release();
  }, [release]);

  const focusType = () => {
    const input = typeRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
  };
  const syncHeld = () => { const s = runRef.current!.game; if (s.id === "poker") setHeld([...s.held]); };
  /** Mirror a typing game's own buffer back into the input: a kill or a miss clears the line. */
  const syncTyped = () => {
    if (!typing || composing.current) return;
    const value = typedOf(runRef.current!.game);
    typedRef.current = value;
    if (typeRef.current && typeRef.current.value !== value) typeRef.current.value = value;
  };
  /** A key, a tap or a button: start the run from the card, or play it. */
  const press = (key: string) => {
    const out = pressRun(runRef.current!, key);
    if (out === "start") {
      audio.relay();
      if (typing) focusType();
    }
    if (out === "game") { syncHeld(); syncTyped(); }
    return out;
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phase = runRef.current!.phase;
    const fit = () => setKind(stageKind(root.clientWidth));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  // "nearest": bring the result panel up without scrolling the GAME OVER screen away.
  useEffect(() => { if (result) { resultRef.current?.scrollIntoView({ block: "nearest" }); resultRef.current?.focus({ preventScroll: true }); } }, [result]);
  useEffect(() => {
    const run = runRef.current!;
    run.best = Math.max(run.best, bestFor(cabinet.id, boards));
  }, [boards, cabinet.id]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/board/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: cabinet.id }), signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(body => { if (typeof body?.ticket === "string" && !controller.signal.aborted) setTicket(body.ticket); }).catch(() => {});
    return () => controller.abort();
  }, [cabinet.id]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { setError(copy.displayFailed); return; }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const ghostCanvas = document.createElement("canvas");
    const ghost = ghostCanvas.getContext("2d");
    const run = runRef.current!;
    // The status line runs on wall time (the frame's own timestamp), not on frame deltas:
    // SystemProvider caps a delta at 64ms, so on a slow device a second of deltas is several
    // seconds of real time, and a screen reader lives in real time.
    let live = true, acc = 0, finished = false, lastSeq = run.game.eventSeq, statusAt = -Infinity, statusPhase = "";
    let lastLabel: string | null = null, lastPhase = run.phase;
    let rect = canvas.getBoundingClientRect(), rectStale = true;
    const view = () => ({ stage: stageFor(cabinet.id, kindRef.current), ghost, touch: coarse, face: cabinet, words: screenCopy });
    const measure = () => {
      rect = canvas.getBoundingClientRect(); rectStale = false;
      const dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ghostCanvas.width = w; ghostCanvas.height = h; }
      renderRun(ctx, runRef.current!, canvas.width, canvas.height, themeRef.current, view());
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(canvas);
    const onScroll = () => { rectStale = true; };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    stageRef.current?.focus(); audio.relay();
    const play = (name: GameSound) => { if (name === "hurt") audio.thud(); else if (name === "score") audio.key(); else if (name === "start") audio.relay(); else audio.hover(); };
    const unsubscribe = onFrame((time, dt) => {
      if (!live) return;
      const state = runRef.current!;
      acc = Math.min(100, acc + dt);
      // A held finger steers every frame, not only when a pointer event
      // arrives, so the ship stops on the finger instead of sailing past it.
      const s = state.game;
      if (steerTo.current && s.id === "signal" && state.phase === "play" && !state.paused) {
        keys.current.clear();
        for (const k of steerKeys(s.player, steerTo.current)) keys.current.add(k);
      }
      while (acc >= 1000 / 60) { stepRun(state, 1 / 60, keys.current); acc -= 1000 / 60; }
      // The game can change what is typed without a keystroke (a locked word
      // lands, the panic dump halts), and the field must follow it, or the
      // next letter is read against letters the game has already dropped.
      if (typing && !composing.current && typedOf(state.game) !== typedRef.current) syncTyped();
      const v = view();
      renderRun(ctx, state, canvas.width, canvas.height, themeRef.current, v);
      const label = countdownLabel(state);
      if (label !== lastLabel) { if (label) audio.key(); lastLabel = label; }
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        if (state.phase === "play") audio.relay();
        if (state.phase === "over") { audio.thud(); keys.current.clear(); }
        if (rootRef.current) rootRef.current.dataset.phase = state.phase;
      }
      const fresh = eventsSince(state.game, lastSeq);
      if (fresh.length) {
        lastSeq = state.game.eventSeq;
        for (const e of fresh.slice(-SOUNDS_PER_FRAME)) play(e.sound);
        const event = fresh[fresh.length - 1];
        // Light the phosphor where it happened. The rect is re-read only after a scroll, not per event.
        if (rectStale) { rect = canvas.getBoundingClientRect(); rectStale = false; }
        if (rect.width > 0 && window.innerWidth > 0 && window.innerHeight > 0) {
          const at = eventPoint(state.id, event.at, v.stage);
          pushImpact(frame.current, {
            x: (rect.left + (at.x / v.stage.w) * rect.width) / window.innerWidth,
            y: (rect.top + (at.y / v.stage.h) * rect.height) / window.innerHeight,
            energy: event.energy,
            at: performance.now(),
          });
        }
      }
      if ((time - statusAt >= 1000 || state.phase !== statusPhase) && statusRef.current) {
        statusAt = time;
        statusPhase = state.phase;
        const hud = gameHud(state.game);
        statusRef.current.textContent = statusLine({
          title: cabinet.title, phase: state.phase, score: state.game.score, paused: state.paused,
          stage: hud.stage && `${hud.stage.label.toLowerCase()} ${hud.stage.value}`,
          lives: hud.lives && `${screenCopy.lives[hud.lives.icon].toLowerCase()} ${hud.lives.current} of ${hud.lives.max}`,
        });
      }
      if (resultDue(state) && !finished) {
        finished = true;
        finishRef.current(state.game);
      }
    });
    return () => { live = false; unsubscribe(); observer.disconnect(); window.removeEventListener("scroll", onScroll, { capture: true }); release(); };
  }, [audio, onFrame, frame, release, cabinet]);
  useEffect(() => {
    const blur = () => pause(true);
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); };
  }, [pause]);
  // A phone keyboard shrinks the visual viewport, not the layout one. A typing
  // game sizes its screen to what is left, so the falling names stay above the keys.
  useEffect(() => {
    const vv = window.visualViewport, root = rootRef.current;
    if (!typing || !vv || !root) return;
    let last = 0, trailing = 0;
    const write = () => { last = performance.now(); root.style.setProperty("--vv-h", `${Math.round(vv.height)}px`); };
    const onResize = () => {
      window.clearTimeout(trailing);
      const since = performance.now() - last;
      if (since >= 120) write(); else trailing = window.setTimeout(write, 120 - since);
    };
    write();
    vv.addEventListener("resize", onResize);
    return () => { vv.removeEventListener("resize", onResize); window.clearTimeout(trailing); };
  }, [typing]);

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,input,textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "p") { e.preventDefault(); if (!e.repeat) pause(!runRef.current!.paused); return; }
    if (k === "m") { e.preventDefault(); if (!e.repeat) setAudioEnabled(!audioLive); return; }
    const key = inputFor(e.key); if (!key) return;
    e.preventDefault(); if (e.repeat || physical.current.has(e.code)) return;
    physical.current.set(e.code, key); keys.current.add(key); press(key);
  };
  const keyUp = (e: KeyboardEvent<HTMLDivElement>) => { const key = physical.current.get(e.code); if (key) { physical.current.delete(e.code); if (![...physical.current.values()].includes(key)) keys.current.delete(key); } };

  /** The typing game's own path. Keys never reach the stage's handler, so Space and Enter start from here. */
  const typeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return; // bubbles to the room, which leaves
    const run = runRef.current!;
    // While paused nothing is being typed, so P and M are the room's again:
    // the pause screen says P carries on, and focus is in this field.
    const k = e.key.toLowerCase();
    if (run.paused && (k === "p" || k === "m")) {
      e.preventDefault();
      if (!e.repeat) { if (k === "p") pause(false); else setAudioEnabled(!audioLive); }
      return;
    }
    if (run.phase === "card" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); press("action"); return; }
    if (e.key === "Enter") e.preventDefault();
  };
  const typed = (e: FormEvent<HTMLInputElement>) => {
    const run = runRef.current!;
    const value = e.currentTarget.value;
    if (run.phase === "card") {
      // Android reports Space as keydown "Unidentified", which typeKey never
      // sees, so a space or newline arriving in the field starts the run too.
      e.currentTarget.value = typedRef.current;
      if (/[ \n]/.test(diffInput(typedRef.current, value).insert)) press("action");
      return;
    }
    if (run.phase !== "play" || run.paused) { e.currentTarget.value = typedRef.current; return; }
    for (const key of pressesFor(diffInput(typedRef.current, value))) pressRun(run, key);
    typedRef.current = value;
    syncTyped();
  };

  const steer = (e: PointerEvent<HTMLCanvasElement>) => {
    const run = runRef.current!, s = run.game;
    if (s.id !== "signal" || run.phase !== "play" || run.paused) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = toWorld(stage, clientToStage(stage, r, e.clientX, e.clientY));
    steerTo.current = at;
    keys.current.clear();
    for (const k of steerKeys(s.player, at)) keys.current.add(k);
  };
  const canvasDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const run = runRef.current!;
    if (run.phase === "card") return; // the click that follows starts the run
    if (typing) { focusType(); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    stageRef.current?.focus();
    if (run.phase !== "play" || run.paused) return;
    if (run.game.id === "poker") {
      const r = e.currentTarget.getBoundingClientRect();
      const card = cardAt(clientToStage(stage, r, e.clientX, e.clientY), stage.kind);
      if (card !== null) press(String(card + 1));
      return;
    }
    steer(e);
  };
  const canvasMove = (e: PointerEvent<HTMLCanvasElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steer(e); };
  // A click, not a pointerdown, starts the run from the card: it is the gesture
  // iOS trusts to raise the keyboard for a typing game.
  const canvasClick = () => { if (runRef.current!.phase === "card") press("action"); };

  const touchButton = (label: string, key: string, cls = "") => {
    const releaseButton = () => { keys.current.delete(key); };
    return <button type="button" className={`arcade-btn ${cls}`.trim()} aria-label={label}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(key); press(key); stageRef.current?.focus(); }}
      onPointerUp={e => { e.preventDefault(); releaseButton(); }}
      onPointerCancel={releaseButton} onLostPointerCapture={releaseButton}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!e.repeat) { keys.current.add(key); press(key); } } }}
      onKeyUp={releaseButton}>{label}</button>;
  };

  return <div className={`arcade-play${typing ? " arcade-play--text" : ""}`} ref={rootRef}>
    <div className="arcade-play__head">
      <button type="button" className="arcade-btn arcade-back" onClick={onBack}>← {copy.back}</button>
      <h2 className="arcade-play__title">{cabinet.title}</h2>
      <div className="arcade-play__tools">
        <button type="button" className="arcade-btn arcade-tool arcade-tool--pause" onClick={() => pause(!paused)} aria-keyshortcuts="P" disabled={!!result || !!error}>{paused ? copy.resume : copy.pause}</button>
        <button type="button" className={`arcade-btn arcade-tool arcade-tool--sound${audioLive ? " is-on" : ""}`} onClick={() => setAudioEnabled(!audioLive)} aria-pressed={audioLive} aria-keyshortcuts="M">{audioLive ? copy.soundOn : copy.soundOff}</button>
      </div>
    </div>
    <div className="arcade-frame window" style={{ "--stage-ratio": stage.w / stage.h } as CSSProperties}>
      <div ref={stageRef} className="arcade-stage" tabIndex={0} role="application" aria-label={`${cabinet.title}. ${cabinet.objective} ${cabinet.controls}`} onKeyDown={keyDown} onKeyUp={keyUp}>
        <canvas ref={canvasRef} className="arcade-canvas" style={{ aspectRatio: `${stage.w} / ${stage.h}` }} aria-label={cabinet.objective}
          onPointerDown={canvasDown} onPointerMove={canvasMove} onPointerUp={() => release()} onPointerCancel={() => release()} onClick={canvasClick} />
        {typing && (
          <label className="arcade-type">
            <span className="arcade-type__prompt" aria-hidden="true" />
            <input ref={typeRef} className="arcade-type__input" type="text" inputMode="text" enterKeyHint="go"
              autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label={copy.typeLabel}
              onInput={typed} onKeyDown={typeKey}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; syncTyped(); }} />
          </label>
        )}
        {(paused || error) && !result && <div className="arcade-pause">
          <span className="arcade-pause__symbol" aria-hidden="true" />
          <h3>{copy.paused}</h3>
          {error ? <p role="alert">{error}</p> : <p>{copy.pausedHelp}</p>}
          <button type="button" className="arcade-btn arcade-primary" onClick={() => { if (error) onBack(); else { pause(false); if (typing) focusType(); else stageRef.current?.focus(); } }}>{error ? copy.back : copy.resume}</button>
        </div>}
      </div>
      <p className="arcade-status vh" role="status" aria-live="polite" aria-atomic="true" ref={statusRef} />
    </div>
    {!result && !typing && <div className={`arcade-controls arcade-controls--${cabinet.id}`}>
      {cabinet.id === "poker" ? <>
        <div className="arcade-hold">{held.map((h, i) => <button type="button" className="arcade-btn" key={i} aria-label={`Hold card ${i + 1}`} aria-pressed={h} onClick={() => press(String(i + 1))}>{h ? screenCopy.held : i + 1}</button>)}</div>
        <div className="arcade-deal">
          <button type="button" className="arcade-btn arcade-primary arcade-action-button" onClick={() => press("action")}>{cabinet.action}</button>
          <button type="button" className="arcade-btn arcade-bank" onClick={() => press("bank")}>{screenCopy.bank}</button>
        </div>
      </> : <>
        <div className="arcade-dpad">{touchButton("↑", "up", "arcade-up")}{touchButton("←", "left", "arcade-left")}{touchButton("↓", "down", "arcade-down")}{touchButton("→", "right", "arcade-right")}</div>
        {touchButton(cabinet.action, "action", "arcade-primary arcade-action-button")}
      </>}
    </div>}
    {result && <div className="arcade-results" ref={resultRef} tabIndex={-1} role="region" aria-label="Run result">
      <div className="arcade-result">
        <p className="arcade-result__label">{copy.score}</p>
        <h3 className="arcade-result__verdict">{cabinet.overLine}</h3>
        <strong className="arcade-result__score">{result.score.toLocaleString("en-IE")}</strong>
        {newBest && <p className="arcade-result__best">{screenCopy.newBest}</p>}
        <div className="arcade-actions"><button className="arcade-btn arcade-primary" type="button" onClick={onReplay}>{copy.restart}</button><button type="button" className="arcade-btn" onClick={onBack}>{copy.back}</button></div>
      </div>
      <ScoreBoard game={cabinet.id} boards={boards} score={result.score} ticket={ticket} onBoards={onBoards} />
    </div>}
  </div>;
}
