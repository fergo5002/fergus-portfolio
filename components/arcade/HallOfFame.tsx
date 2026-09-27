"use client";
import { useState } from "react";
import { cabinets, collectionCopy as copy } from "@/content/arcade-collection";
import { groupDigits, type BoardSnapshot } from "@/lib/arcade/board";
import { GAME_IDS, type GameId } from "@/lib/arcade/engine";
import { FAME_SIZE, fameTable } from "@/lib/arcade/fame";
import { arcadeSession } from "@/lib/arcade/session";

/**
 * The FergusOS Arcade Hall of Fame, the last thing on the arcade's front.
 *
 * One classic table: a rank down the side and a column a cabinet, top ten
 * each, because the three cabinets count different things (`lib/arcade/fame.ts`
 * says why). On a phone three columns will not fit, so a switcher shows one
 * cabinet's column at a time. An empty slot is drawn as dashes from CSS, with
 * the word "empty" in the document for anything that reads it, and a board
 * that is loading or offline says so in a sentence instead of a blank table.
 */

const titleOf = (id: GameId) => cabinets.find((c) => c.id === id)?.title ?? id;

export default function HallOfFame({ boards }: { boards: BoardSnapshot | null }) {
  const [shown, setShown] = useState<GameId>(GAME_IDS[0]);
  const fame = fameTable(boards, GAME_IDS);
  const posted = arcadeSession().lastPosted;
  return (
    <section className="fame" aria-labelledby="arcade-fame-title">
      <h2 className="fame__title" id="arcade-fame-title">{copy.fameTitle}</h2>
      <p className="fame__lede">{copy.fameLede}</p>
      {fame.kind !== "table" ? (
        <p className="fame__state" role="status">{fame.kind === "checking" ? copy.loading : copy.unavailable}</p>
      ) : (
        <>
          <div className="fame__switch" role="group" aria-label={copy.fameSwitch}>
            {GAME_IDS.map((id) => (
              <button type="button" key={id} className="arcade-btn fame__pick" aria-pressed={shown === id} onClick={() => setShown(id)}>
                {titleOf(id)}
              </button>
            ))}
          </div>
          <table className="fame__table" data-shown={shown}>
            <thead>
              <tr>
                <th scope="col" className="fame__rank">{copy.fameRank}</th>
                {fame.columns.map((col) => <th scope="col" key={col.game} data-game={col.game}>{titleOf(col.game)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: FAME_SIZE }, (_, i) => (
                <tr key={i}>
                  <th scope="row" className="fame__rank">{String(i + 1).padStart(2, "0")}</th>
                  {fame.columns.map((col) => {
                    const row = col.rows[i];
                    const mine = !!row && posted?.game === col.game && posted.initials === row.initials && posted.score === row.score;
                    return (
                      <td key={col.game} data-game={col.game} className={mine ? "is-you" : undefined}>
                        {row ? (
                          <>
                            <span className="fame__initials">{row.initials}</span>
                            <span className="fame__score">{groupDigits(row.score)}</span>
                          </>
                        ) : (
                          <span className="fame__empty"><span className="vh">{copy.fameEmptySlot}</span></span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {fame.empty && <p className="fame__state">{copy.empty}</p>}
        </>
      )}
    </section>
  );
}
