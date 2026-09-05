"use client";
import { useEffect, useState } from "react";
import { collectionCopy as copy } from "@/content/arcade-collection";
import { fetchBoards, submitScore } from "@/lib/arcade/board-client";
import { BOARD_SIZE, checkInitials, groupDigits, type BoardSnapshot } from "@/lib/arcade/board";
import type { GameId } from "@/lib/arcade/engine";
import { arcadeSession, loadInitials, rememberPosted, saveInitials, setArcadeBoards } from "@/lib/arcade/session";

/**
 * The high-score table, the way a cabinet draws it: rank, three big initials,
 * a tabular score, and the row you just posted lit in amber.
 */
export function BoardTable({ game, snapshot, limit = 10 }: { game: GameId; snapshot: BoardSnapshot | null; limit?: number }) {
  const rows = snapshot?.boards.find((b) => b.game === game)?.rows ?? [];
  const posted = arcadeSession().lastPosted;
  if (!snapshot) return <p className="arcade-board__state">{copy.loading}</p>;
  if (!snapshot.available) return <p className="arcade-board__state">{copy.unavailable}</p>;
  if (!rows.length) return <p className="arcade-board__state">{copy.empty}</p>;
  let lit = false;
  return (
    <ol className="arcade-table">
      {rows.slice(0, limit).map((row, i) => {
        const mine = !lit && posted?.game === game && posted.initials === row.initials && posted.score === row.score;
        if (mine) lit = true;
        return (
          <li key={`${i}-${row.initials}-${row.score}`} className={mine ? "is-you" : undefined}>
            <span className="arcade-table__rank">{String(i + 1).padStart(2, "0")}</span>
            <span className="arcade-table__initials">{row.initials}</span>
            <span className="arcade-table__score">{groupDigits(row.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Props = {
  game: GameId;
  boards: BoardSnapshot | null;
  score?: number;
  ticket?: string | null;
  /** The room re-reads every board after a post, so the gallery and the hall agree. */
  onBoards?(): void;
};

export default function ScoreBoard({ game, boards, score, ticket, onBoards }: Props) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(boards);
  const [initials, setInitials] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<number | null>(null);

  useEffect(() => {
    if (boards) {
      setSnapshot(boards);
      return;
    }
    let live = true;
    void fetchBoards().then((s) => {
      if (!live) return;
      setSnapshot(s);
      setArcadeBoards(s);
    });
    return () => {
      live = false;
    };
  }, [boards, game]);

  useEffect(() => {
    try {
      setInitials(loadInitials(localStorage) ?? "");
    } catch {
      /* an optional remembered initial, not a prerequisite */
    }
  }, []);

  const rank = posted;
  return (
    <section className="arcade-board" aria-label={copy.board}>
      <div className="arcade-board__head">
        <h3>{copy.board}</h3>
        <span>{game === "under" ? copy.today : copy.allTime}</span>
      </div>
      {score !== undefined && score > 0 && posted === null && (
        <form
          className="arcade-post"
          onSubmit={async (e) => {
            e.preventDefault();
            const checked = checkInitials(initials);
            if (!checked.ok) {
              setStatus(checked.reason);
              return;
            }
            if (!ticket) {
              setStatus(copy.noTicket);
              return;
            }
            setBusy(true);
            setStatus("");
            const result = await submitScore({ game, initials: checked.initials, score, ticket });
            setBusy(false);
            if (!result.ok) {
              setStatus(result.reason);
              return;
            }
            rememberPosted({ game, initials: checked.initials, score });
            const index = result.board.rows.findIndex((r) => r.initials === checked.initials && r.score === score);
            setPosted(index >= 0 ? index + 1 : BOARD_SIZE + 1);
            setStatus(index >= 0 ? copy.saved : copy.offBoard);
            setSnapshot({ available: true, boards: [result.board] });
            try {
              saveInitials(localStorage, checked.initials);
            } catch {
              /* posting succeeds independently of optional local storage */
            }
            onBoards?.();
          }}
        >
          <label htmlFor={`initials-${game}`}>{copy.initials}</label>
          <div className="arcade-post__row">
            <span className="arcade-initials">
              <input
                id={`initials-${game}`}
                maxLength={3}
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                pattern="[A-Z0-9]{3}"
                required
              />
            </span>
            <button type="submit" className="arcade-btn arcade-primary" disabled={busy}>
              {busy ? copy.submitting : copy.submit}
            </button>
          </div>
        </form>
      )}
      <p className="arcade-board__status" role="status">
        {status}
      </p>
      {rank !== null && rank <= BOARD_SIZE && (
        <p className="arcade-board__rank">
          {copy.yourRank} <b>#{rank}</b>
        </p>
      )}
      <BoardTable game={game} snapshot={snapshot} limit={10} />
      <p className="arcade-small">{copy.boardNote}</p>
    </section>
  );
}
