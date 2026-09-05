"use client";
import { useEffect, useRef, useState } from "react";
import { collectionCopy as copy } from "@/content/arcade-collection";
import type { GameId } from "@/lib/arcade/engine";
import { decodePacket, type Link } from "@/lib/arcade/network";
import { openAsCreator, openAsJoiner, packSdp, unpackSdp, waitForConnection, type Opened } from "@/lib/tools/overlap/webrtc";

export default function NetworkLobby({ game, onStart }: { game: GameId; onStart(link: Link, seed: number): void }) {
  const [incoming, setIncoming] = useState(""), [outgoing, setOutgoing] = useState("");
  const [status, setStatus] = useState<string>(""), [busy, setBusy] = useState(false), [linked, setLinked] = useState<Link | null>(null);
  const [hosting, setHosting] = useState(false), [copied, setCopied] = useState(false), [supported, setSupported] = useState(true);
  const creator = useRef<Awaited<ReturnType<typeof openAsCreator>> | null>(null);
  const closer = useRef<(() => void) | null>(null), live = useRef(true), handedOff = useRef(false);
  const attempt = useRef(0);
  const onStartRef = useRef(onStart); onStartRef.current = onStart;
  useEffect(() => { live.current = true; setSupported(typeof RTCPeerConnection !== "undefined"); return () => { live.current = false; if (!handedOff.current) closer.current?.(); }; }, []);
  const connected = (opened: Opened, host: boolean, token: number) => {
    if (!live.current || token !== attempt.current) { opened.connection.close(); return; }
    const link: Link = { opened, host, game, close: () => opened.connection.close() };
    closer.current = link.close; setLinked(link); setStatus(copy.netReady); setBusy(false);
    if (!host) opened.channel.onMessage(raw => {
      if (!live.current || handedOff.current) return;
      const p = decodePacket(raw, game);
      if (p?.type === "start") { handedOff.current = true; onStartRef.current(link, p.seed); }
    });
  };
  const fail = (token: number) => { if (token !== attempt.current) return; if (live.current) { setBusy(false); setStatus(copy.netFailure); } closer.current?.(); };
  const create = async () => {
    const token = ++attempt.current;
    closer.current?.(); setBusy(true); setStatus(copy.netConnecting); setHosting(true); setLinked(null); setCopied(false);
    try {
      const pending = await openAsCreator(); if (!live.current) { pending.close(); return; }
      creator.current = pending; closer.current = pending.close; const code = await packSdp(pending.offer);
      if (live.current && token === attempt.current) { setOutgoing(code); setStatus(copy.netWait); setBusy(false); }
    } catch { fail(token); }
  };
  const answer = async () => {
    const token = ++attempt.current;
    closer.current?.(); setBusy(true); setStatus(copy.netConnecting); setHosting(false); setLinked(null); setCopied(false);
    try {
      const pending = await openAsJoiner(await unpackSdp(incoming.trim())); if (!live.current) { pending.close(); return; }
      closer.current = pending.close; setOutgoing(await packSdp(pending.answer)); setStatus(copy.netWait); setBusy(false);
      void waitForConnection(pending.opened, 120_000).then(opened => connected(opened, false, token)).catch(() => fail(token));
    } catch { fail(token); }
  };
  const finish = async () => {
    if (!creator.current) return; setBusy(true); setStatus(copy.netConnecting);
    const token = attempt.current;
    try { connected(await waitForConnection(creator.current.finish(await unpackSdp(incoming.trim()))), true, token); } catch { fail(token); }
  };
  return <section className="arcade-link" aria-label={copy.netTitle}>
    <h3>{copy.netTitle}</h3><p>{copy.netIntro}</p>
    {!supported ? <p role="status">{copy.networkUnsupported}</p> : <>
      <label htmlFor="arcade-link-input">{copy.invite}</label>
      <textarea id="arcade-link-input" value={incoming} onChange={e => setIncoming(e.target.value.slice(0, 16384))} rows={3} spellCheck={false} autoComplete="off" />
      <div className="arcade-actions">
        <button type="button" onClick={() => void create()} disabled={busy || !!linked}>{copy.create}</button>
        <button type="button" onClick={() => void (hosting && creator.current ? finish() : answer())} disabled={busy || !!linked || !incoming.trim()}>{hosting && creator.current ? copy.connect : copy.join}</button>
      </div>
      {outgoing && <label className="arcade-link-output">{hosting ? "Send this invite to your friend" : "Send this answer back to the host"}<textarea aria-label="Outgoing connection code" readOnly value={outgoing} rows={3} onFocus={e => e.target.select()} /><button type="button" onClick={() => { if (!navigator.clipboard) { setStatus("Select the code above and copy it."); return; } void navigator.clipboard.writeText(outgoing).then(() => setCopied(true)).catch(() => setStatus("Copy failed. Select the code above and copy it.")); }}>{copied ? copy.copied : copy.copy}</button></label>}
      <p role="status">{status}</p>
      {linked?.host && <button type="button" className="arcade-primary" onClick={() => {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        try { linked.opened.channel.send(JSON.stringify({ type: "start", seed })); handedOff.current = true; onStart(linked, seed); } catch { fail(attempt.current); }
      }}>{copy.match}</button>}
    </>}
    <p className="arcade-small">{copy.netPrivacy}</p>
  </section>;
}
