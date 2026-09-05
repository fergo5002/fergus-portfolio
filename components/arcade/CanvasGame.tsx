"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { collectionCopy as copy, type Cabinet } from "@/content/arcade-collection";
import { createGame, pressGame, stepGame, WORLD, type GameMode, type GameState } from "@/lib/arcade/engine";
import { renderGame } from "@/lib/arcade/renderer";
import { decodePacket, snapshotFor, type Link } from "@/lib/arcade/network";
import { useSystem } from "@/components/system/SystemProvider";
import ScoreBoard from "./ScoreBoard";

function inputFor(key: string, mode: GameMode, guest: boolean) {
  const k = key.toLowerCase();
  const arrow = ({ arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" } as Record<string, string>)[k];
  const letter = ({ w: "up", s: "down", a: "left", d: "right" } as Record<string, string>)[k];
  if (arrow) return (mode === "local" || guest ? "p2" : "") + arrow;
  if (letter) return (guest ? "p2" : "") + letter;
  if (k === " ") return guest ? "p2action" : "action";
  if (k === "enter") return mode === "solo" ? "bank" : "p2action";
  if (/^[1-5]$/.test(k)) return k;
  return null;
}
type Props = { cabinet: Cabinet; mode: GameMode; seed: number; link: Link | null; onBack(): void; onReplay(): void };
export default function CanvasGame({ cabinet, mode, seed, link, onBack, onReplay }: Props) {
  const { onFrame, audio } = useSystem();
  const canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null), hudRef = useRef<HTMLParagraphElement>(null);
  const stateRef = useRef<GameState>(createGame(cabinet.id, seed, mode));
  const keys = useRef(new Set<string>()), physical = useRef(new Map<string, string>()), remote = useRef(new Set<string>());
  const pausedRef = useRef(false), [paused, setPaused] = useState(false), [result, setResult] = useState<GameState | null>(null);
  const [error, setError] = useState(""), [ticket, setTicket] = useState<string | null>(null);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const resultRef = useRef<HTMLDivElement>(null);
  const guest = !!link && !link.host;
  const transmit = useCallback((presses: string[] = []) => {
    if (!link || link.host) return;
    try { link.opened.channel.send(JSON.stringify({ type: "input", keys: [...keys.current], presses })); } catch { /* Connection state owns the visible failure. */ }
  }, [link]);
  const release = useCallback(() => { keys.current.clear(); physical.current.clear(); transmit(); }, [transmit]);
  const pause = useCallback((value: boolean, broadcast = true) => {
    pausedRef.current = value; setPaused(value); release();
    if (link && broadcast) try { link.opened.channel.send(JSON.stringify({ type: "pause", paused: value })); } catch { /* onconnectionstatechange reports it. */ }
  }, [link, release]);
  const press = (key: string) => {
    if (pausedRef.current || stateRef.current.over) return;
    if (guest) transmit([key]); else pressGame(stateRef.current, key);
    if (cabinet.id === "poker") setHeld([...stateRef.current.held]);
  };
  useEffect(() => { if (result) { resultRef.current?.scrollIntoView({ block: "center" }); resultRef.current?.focus(); } }, [result]);
  useEffect(() => {
    if (mode !== "solo") return;
    const controller = new AbortController();
    void fetch("/api/board/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: cabinet.id }), signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(body => { if (typeof body?.ticket === "string" && !controller.signal.aborted) setTicket(body.ticket); }).catch(() => {});
    return () => controller.abort();
  }, [cabinet.id, mode]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { setError("This browser could not open the game display."); return; }
    let live = true, acc = 0, netClock = 0, finished = false, finishTimer: ReturnType<typeof setTimeout> | undefined;
    let lastEvent = 0, hudClock = 0, compact = false;
    const measure = () => {
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      compact = rect.width < 600;
      canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
      renderGame(ctx, stateRef.current, canvas.width, canvas.height, compact);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(canvas);
    stageRef.current?.focus(); audio.relay();
    const unsubscribe = onFrame((_time, dt) => {
      if (!live) return;
      const state = stateRef.current;
      if (!pausedRef.current && !state.over && !guest) {
        acc = Math.min(100, acc + dt);
        while (acc >= 1000 / 60) { stepGame(state, 1 / 60, new Set([...keys.current, ...remote.current])); acc -= 1000 / 60; }
      } else acc = 0;
      renderGame(ctx, state, canvas.width, canvas.height, compact);
      if (state.event !== lastEvent) {
        lastEvent = state.event;
        if (state.sound === "hurt") audio.thud(); else if (state.sound === "score") audio.key(); else if (state.sound === "start") audio.relay(); else audio.hover();
      }
      hudClock += dt;
      if (hudClock > 150 && hudRef.current) {
        hudClock = 0;
        const detail = state.id === "pong" ? `GREEN ${state.points[0]} : ${state.points[1]} AMBER · POWER ${Math.floor(state.charge)}%${mode === "solo" ? "" : ` / ${Math.floor(state.charge2)}%`}` : state.id === "poker" ? `${state.handName} · ${state.handPoints} PTS · TARGET ${state.bank}/${state.target} · ${state.redraws} REDRAWS` : state.id === "under" ? `DEPTH ${state.level} · HEALTH ${state.lives} · TURN ${state.turn} · PULSE ${Math.floor(state.charge)}% · ${state.hasKey ? "KEY SECURED" : "FIND THE KEY"}` : state.id === "snake" ? mode === "solo" ? `LENGTH ${state.snake.length} · PHASE ${Math.floor(state.charge)}%` : `GREEN ${state.snake.length} / ${Math.floor(state.charge)}% · AMBER ${state.snake2.length} / ${Math.floor(state.charge2)}%` : `HULL ${state.lives} · CHARGE ${Math.floor(state.charge)}%`;
        hudRef.current.textContent = `${String(state.score).padStart(6, "0")} PTS  /  ${detail}`;
      }
      if (link?.host) {
        netClock += dt;
        if (netClock >= 66) { netClock = 0; try { link.opened.channel.send(JSON.stringify({ type: "state", state: snapshotFor(state), paused: pausedRef.current })); } catch { /* The connection handler pauses the match. */ } }
      }
      if (state.over && !finished) {
        finished = true; keys.current.clear();
        // A single end-of-run event. React is never used to draw simulation frames.
        finishTimer = setTimeout(() => { if (live) setResult(structuredClone(state)); }, 350);
      }
    });
    return () => { live = false; unsubscribe(); observer.disconnect(); clearTimeout(finishTimer); release(); };
  }, [audio, onFrame, guest, link, release]);
  useEffect(() => {
    const blur = () => { if (!stateRef.current.over) pause(true); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); };
  }, [pause]);
  useEffect(() => {
    if (!link) return;
    let live = true;
    link.opened.channel.onMessage(raw => {
      if (!live) return; const p = decodePacket(raw, cabinet.id); if (!p) return;
      if (p.type === "input" && link.host) { remote.current = new Set(p.keys); if (!pausedRef.current) for (const k of p.presses) pressGame(stateRef.current, k); }
      if (p.type === "state" && !link.host) { stateRef.current = p.state; if (p.paused !== pausedRef.current) pause(p.paused, false); }
      if (p.type === "pause") pause(p.paused, false);
    });
    const failed = () => {
      if (!live) return;
      if (["failed", "disconnected", "closed"].includes(link.opened.connection.connectionState)) { pause(true, false); setError(copy.disconnected); }
    };
    link.opened.connection.addEventListener("connectionstatechange", failed);
    return () => { live = false; link.opened.connection.removeEventListener("connectionstatechange", failed); };
  }, [cabinet.id, link, pause]);
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,input,textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "p") { e.preventDefault(); if (!e.repeat) pause(!pausedRef.current); return; }
    const key = inputFor(e.key, mode, guest); if (!key) return;
    e.preventDefault(); if (e.repeat || physical.current.has(e.code)) return;
    physical.current.set(e.code, key); keys.current.add(key); press(key);
  };
  const keyUp = (e: KeyboardEvent<HTMLDivElement>) => { const key = physical.current.get(e.code); if (key) { physical.current.delete(e.code); if (![...physical.current.values()].includes(key)) keys.current.delete(key); transmit(); } };
  const pointer = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || pausedRef.current || stateRef.current.over) return;
    const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * WORLD.w, y = (e.clientY - rect.top) / rect.height * WORLD.h;
    const s = stateRef.current;
    if (s.id === "bounce") s.player.x = Math.max(64, Math.min(836, x));
    if (s.id === "pong") {
      const second = guest || mode === "local" && x > WORLD.w / 2;
      if (guest) { keys.current.delete("p2up"); keys.current.delete("p2down"); if (Math.abs(y - s.rival.y) > 10) keys.current.add(y < s.rival.y ? "p2up" : "p2down"); transmit(); }
      else (second ? s.rival : s.player).y = Math.max(79, Math.min(487, y));
    }
    if (s.id === "signal") {
      keys.current.clear(); if (x < s.player.x - 15) keys.current.add("left"); if (x > s.player.x + 15) keys.current.add("right"); if (y < s.player.y - 15) keys.current.add("up"); if (y > s.player.y + 15) keys.current.add("down");
    }
  };
  const touchButton = (label: string, key: string, cls = "") => {
    const actual = guest ? `p2${key}` : key;
    const releaseButton = () => { keys.current.delete(actual); transmit(); };
    return <button type="button" className={cls} aria-label={label}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(actual); press(actual); stageRef.current?.focus(); }}
      onPointerUp={e => { e.preventDefault(); releaseButton(); }}
      onPointerCancel={releaseButton} onLostPointerCapture={releaseButton}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!e.repeat) { keys.current.add(actual); press(actual); } } }}
      onKeyUp={releaseButton}>{label}</button>;
  };
  return <div className="arcade-play">
    <div className="arcade-play-header"><div><span>{cabinet.genre}</span><h2>{cabinet.title}</h2></div><div className="arcade-actions"><button type="button" onClick={onBack}>{copy.back}</button><button type="button" onClick={() => pause(!pausedRef.current)} disabled={!!result || !!error}>{paused ? copy.resume : copy.pause}</button></div></div>
    <p className="arcade-live-hud" ref={hudRef}>000000 PTS / READY</p>
    <div ref={stageRef} className="arcade-stage" tabIndex={0} role="application" aria-label={`${cabinet.title}. ${cabinet.objective} ${cabinet.controls}`} onKeyDown={keyDown} onKeyUp={keyUp}>
      <canvas ref={canvasRef} className="arcade-canvas" width={900} height={560} aria-label={cabinet.objective}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); stageRef.current?.focus(); if (cabinet.id === "poker") { const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * WORLD.w, y = (e.clientY - rect.top) / rect.height * WORLD.h; const card = Math.floor((x - 118) / 137); if (card >= 0 && card < 5 && y > 165 && y < 351) press(String(card + 1)); } else pointer(e); }} onPointerMove={pointer} onPointerUp={() => release()} onPointerCancel={() => release()} />
      {(paused || error) && !result && <div className="arcade-pause"><span className="arcade-pause-symbol" aria-hidden="true" /><h3>{copy.paused}</h3>{error && <p role="alert">{error}</p>}<button type="button" className="arcade-primary" onClick={() => { if (error) onBack(); else { pause(false); stageRef.current?.focus(); } }}>{error ? copy.back : copy.resume}</button></div>}
    </div>
    {!result && <>
      <div className="arcade-controls">
        {cabinet.id === "poker" ? <><div className="arcade-hold-cards">{held.map((h, i) => <button type="button" key={i} aria-label={`Hold card ${i + 1}`} aria-pressed={h} onClick={() => press(String(i + 1))}>{i + 1}{h ? " ✓" : ""}</button>)}</div><button type="button" className="arcade-primary" onClick={() => press("action")}>{cabinet.action}</button><button type="button" onClick={() => press("bank")}>BANK HAND</button></> : <>
          <div className="arcade-dpad">{touchButton("↑", "up", "arcade-up")}{touchButton("←", "left", "arcade-left")}{touchButton("↓", "down", "arcade-down")}{touchButton("→", "right", "arcade-right")}</div>
          {touchButton(cabinet.action, "action", "arcade-primary arcade-action-button")}
          {mode === "local" && <div className="arcade-p2-controls"><span>AMBER</span><div>{touchButton("↑", "p2up")}{touchButton("←", "p2left")}{touchButton("↓", "p2down")}{touchButton("→", "p2right")}{touchButton("ACTION", "p2action")}</div></div>}
        </>}
      </div>
      <p className="arcade-game-help">{cabinet.controls}</p>
    </>}
    {result && <div className="arcade-results" ref={resultRef} tabIndex={-1} role="region" aria-label="Run result">
      <div className="arcade-result-summary"><span>{mode === "solo" ? copy.score : "MATCH RESULT"}</span><h3>{mode !== "solo" ? result.id === "snake" && !result.snakesAlive[0] && !result.snakesAlive[1] ? "DRAW" : result.won ? "GREEN WINS" : "AMBER WINS" : result.won ? copy.won : copy.over}</h3><strong>{result.score.toLocaleString("en-IE")}</strong><div className="arcade-actions">{!link && <button className="arcade-primary" type="button" onClick={onReplay}>{copy.restart}</button>}<button type="button" onClick={onBack}>{copy.back}</button></div>{mode !== "solo" && <p>{copy.notRanked}</p>}</div>
      {mode === "solo" && <ScoreBoard game={cabinet.id} score={result.score} ticket={ticket} />}
    </div>}
  </div>;
}
