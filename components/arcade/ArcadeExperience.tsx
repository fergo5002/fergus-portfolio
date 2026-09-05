"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import { arcadeCopy } from "@/content/arcade";
import { GAME_IDS, type GameId, type GameMode } from "@/lib/arcade/engine";
import type { ProgramSpec } from "@/lib/arcade/program";
import type { Link } from "@/lib/arcade/network";
import { useSystem } from "@/components/system/SystemProvider";
import ArcadeScreen from "./ArcadeScreen";
import CabinetArt from "./CabinetArt";
import CanvasGame from "./CanvasGame";
import NetworkLobby from "./NetworkLobby";
import ScoreBoard from "./ScoreBoard";
import "./arcade.css";

type Props = { program: ProgramSpec; onExit(lines: string[]): void };
function Room({ program, onExit }: Props) {
  const { reducedMotion, audioLive, setAudioEnabled, setScrollLocked, gravityOn } = useSystem();
  const previousLock = useRef(gravityOn);
  const [arriving, setArriving] = useState(program.id === "arcade");
  const [selected, setSelected] = useState<GameId | null>(program.id === "arcade" ? null : program.id as GameId);
  const [network, setNetwork] = useState(false);
  const [run, setRun] = useState<{ mode: GameMode; seed: number; count: number; link: Link | null } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null), linkRef = useRef<Link | null>(null);
  const exitRef = useRef(onExit); exitRef.current = onExit;
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    dialog.showModal(); setScrollLocked(true);
    return () => { dialog.close(); setScrollLocked(previousLock.current); linkRef.current?.close(); };
  }, [setScrollLocked]);
  useEffect(() => { if (reducedMotion) exitRef.current([...arcadeCopy.declined]); }, [reducedMotion]);
  useEffect(() => { if (!arriving) return; const timer = setTimeout(() => setArriving(false), 3200); return () => clearTimeout(timer); }, [arriving]);
  useEffect(() => {
    if (!arriving && !run) dialogRef.current?.querySelector<HTMLElement>(selected ? ".arcade-primary" : ".arcade-cabinet")?.focus();
  }, [arriving, selected, run]);
  const cabinet = cabinets.find(c => c.id === selected);
  const begin = (mode: GameMode, link: Link | null = null, netSeed?: number) => {
    linkRef.current = link;
    const seed = selected === "under" ? Number(new Date().toISOString().slice(0, 10).replaceAll("-", "")) : netSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    setRun(previous => ({ mode, seed, count: (previous?.count ?? 0) + 1, link }));
  };
  const back = () => { linkRef.current?.close(); linkRef.current = null; setRun(null); setNetwork(false); setSelected(null); };
  return createPortal(<dialog className="arcade-room" ref={dialogRef} aria-label={copy.label}
    onCancel={e => { e.preventDefault(); onExit([arcadeCopy.left]); }}
    onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); onExit([arcadeCopy.left]); } }} onKeyUp={e => e.stopPropagation()}>
    {arriving && <div className="arcade-arrival" aria-label={copy.arrival}>
      <div className="arcade-tunnel" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--ring": i } as React.CSSProperties} />)}<div className="arcade-tunnel-axis" /></div>
      <div className="arcade-arrival-copy"><span>{copy.transfer}</span><h2>FERGUSOS<br /><strong>ARCADE</strong></h2><div className="arcade-transfer-bar"><i /></div><p>{copy.arrival}</p></div>
      <button type="button" onClick={() => setArriving(false)}>{copy.skip} ↵</button>
    </div>}
    <div className="arcade-room-inner" inert={arriving}>
      <header className="arcade-room-header"><button type="button" className="arcade-wordmark" onClick={back} aria-label="Arcade home">F<span>OS</span><i aria-hidden="true" /></button><span className="arcade-room-location">/ SYSTEM / ARCADE</span><div className="arcade-header-actions"><button type="button" onClick={() => setAudioEnabled(!audioLive)} aria-pressed={audioLive}>{audioLive ? copy.soundOn : copy.soundOff}</button><button type="button" onClick={() => onExit([arcadeCopy.left])} aria-label={copy.exit}>ESC <span>EXIT</span> ↗</button></div></header>
      {cabinet && run ? <CanvasGame key={`${cabinet.id}-${run.count}`} cabinet={cabinet} mode={run.mode} seed={run.seed} link={run.link} onBack={back} onReplay={() => begin(run.mode)} /> : cabinet ? <main className="arcade-detail">
        <button type="button" className="arcade-back" onClick={back}>← {copy.back}</button>
        <div className="arcade-detail-layout"><div className="arcade-detail-main"><div className="arcade-detail-art"><CabinetArt game={cabinet.id} /><span>{cabinet.number}</span></div><div className="arcade-detail-meta"><span>{cabinet.genre}</span><span>{cabinet.multiplayer ? "1–2 PLAYERS" : "1 PLAYER"}</span></div><h1>{cabinet.title}</h1><p className="arcade-detail-subtitle">{cabinet.subtitle}</p><p>{cabinet.description}</p><div className="arcade-instructions"><h3>THE OBJECTIVE</h3><p>{cabinet.objective}</p><p>{cabinet.controls}</p></div>
          <div className="arcade-actions"><button type="button" className="arcade-primary" onClick={() => begin("solo")}>{copy.play} ↗</button>{cabinet.multiplayer && <><button type="button" onClick={() => begin("local")}>{copy.local}</button><button type="button" onClick={() => setNetwork(n => !n)} aria-expanded={network}>{copy.online}</button></>}</div>
          {network && <NetworkLobby game={cabinet.id} onStart={(link, seed) => begin("online", link, seed)} />}
        </div><aside><ScoreBoard game={cabinet.id} /><p className="arcade-small">{copy.privacy}</p></aside></div>
      </main> : <main className="arcade-gallery">
        <section className="arcade-gallery-intro"><div><p className="arcade-found"><i aria-hidden="true" />{copy.subtitle}</p><h1>THE<br /><span>ARCADE</span><b aria-hidden="true">⊕</b></h1><p className="arcade-gallery-lede">{copy.intro}</p></div><div className="arcade-free-play"><div className="arcade-token" aria-hidden="true"><i /><b>F</b></div><span>{copy.free}</span><p>NO COINS.<br />JUST CURIOSITY.</p></div></section>
        <div className="arcade-selector-line"><span>{copy.insert}</span><span>01 / 06 <i aria-hidden="true" /></span></div>
        <div className="arcade-cabinets">{cabinets.map((c, i) => <button type="button" key={c.id} className="arcade-cabinet" data-game={c.id} style={{ "--cabinet-index": i } as React.CSSProperties} onClick={() => { setSelected(c.id); setNetwork(false); }} onKeyDown={e => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault(); const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 3 : -3;
          const all = dialogRef.current?.querySelectorAll<HTMLButtonElement>(".arcade-cabinet"); all?.[(i + direction + cabinets.length) % cabinets.length]?.focus();
        }}><div className="arcade-cabinet-image"><CabinetArt game={c.id} /><span className="arcade-cabinet-number">{c.number}</span><span className="arcade-cabinet-players">{c.multiplayer ? "1–2P" : "1P"}</span><span className="arcade-cabinet-play" aria-hidden="true">↗</span></div><div className="arcade-cabinet-copy"><span>{c.genre}</span><h2>{c.title}</h2><p>{c.subtitle}</p></div></button>)}</div>
        <footer className="arcade-gallery-footer"><span>BUILT INSIDE THE MACHINE.</span><p>{copy.privacy}</p><span>EST. 2026</span></footer>
      </main>}
    </div>
  </dialog>, document.body);
}
export default function ArcadeExperience(props: Props) {
  const known = props.program.id === "arcade" || GAME_IDS.includes(props.program.id as GameId);
  if (!known) return <ArcadeScreen {...props} />;
  return <Room {...props} />;
}
