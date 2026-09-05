"use client";
import { useEffect, useState } from "react";
import { collectionCopy as copy } from "@/content/arcade-collection";
import { fetchBoards, submitScore } from "@/lib/arcade/board-client";
import { checkInitials, groupDigits, type BoardSnapshot } from "@/lib/arcade/board";
import { loadInitials, saveInitials, setArcadeBoards } from "@/lib/arcade/session";
import type { GameId } from "@/lib/arcade/engine";

export default function ScoreBoard({ game, score, ticket }: { game: GameId; score?: number; ticket?: string | null }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null), [initials, setInitials] = useState("");
  const [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [posted, setPosted] = useState(false);
  useEffect(() => {
    let live = true; void fetchBoards().then(s => { if (live) { setSnapshot(s); setArcadeBoards(s); } });
    try { setInitials(loadInitials(localStorage) ?? ""); } catch { /* An optional remembered initial, not a prerequisite. */ }
    return () => { live = false; };
  }, [game]);
  const rows = snapshot?.boards.find(b => b.game === game)?.rows ?? [];
  return <section className="arcade-board" aria-label={copy.board}>
    <div className="arcade-board-heading"><h3>{copy.board}</h3><span>{game === "under" ? "TODAY · UTC" : "ALL TIME"}</span></div>
    {score !== undefined && score > 0 && !posted && <form onSubmit={async e => {
      e.preventDefault(); const checked = checkInitials(initials); if (!checked.ok) { setStatus(checked.reason); return; }
      if (!ticket) { setStatus("Score entry could not be prepared. Play again to retry."); return; }
      setBusy(true); setStatus("");
      const result = await submitScore({ game, initials: checked.initials, score, ticket });
      setBusy(false);
      if (result.ok) {
        setPosted(true); setStatus(copy.saved);
        setSnapshot({ available: true, boards: [result.board] });
        try { saveInitials(localStorage, checked.initials); } catch { /* Posting succeeds independently of optional local storage. */ }
      } else setStatus(result.reason);
    }}>
      <label htmlFor={`initials-${game}`}>{copy.initials}</label><div className="arcade-post">
        <input id={`initials-${game}`} aria-label={copy.initials} maxLength={3} value={initials} onChange={e => setInitials(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} pattern="[A-Z0-9]{3}" required />
        <button type="submit" className="arcade-primary" disabled={busy}>{busy ? copy.submitting : copy.submit}</button>
      </div>
    </form>}
    <p className="arcade-board-status" role="status">{status}</p>
    {!snapshot ? <p>{copy.loading}</p> : !snapshot.available ? <p>{copy.unavailable}</p> : !rows.length ? <p>{copy.empty}</p> : <ol>
      {rows.slice(0, 8).map((row, i) => <li key={`${i}-${row.initials}`}><span className="arcade-rank">{String(i + 1).padStart(2, "0")}</span><strong>{row.initials}</strong><span>{groupDigits(row.score)}</span></li>)}
    </ol>}
    <p className="arcade-small">{copy.boardNote}</p>
  </section>;
}
