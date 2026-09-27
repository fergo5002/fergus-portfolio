"use client";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { WEEK_TRANSPOSE_QUERY, heatLevel, moveCell, type Cell } from "@/lib/studio/lore";

/**
 * The week: seven days by twenty-four hours of phosphor, each cell lit by how
 * many messages landed in it. The first thing on Group Lore's stage.
 *
 * One focusable surface rather than 168 buttons. A mouse reads whatever it
 * is over; a finger or a click picks a cell and opens its messages; the
 * arrow keys walk the week and Enter opens it. The line that says what the
 * cursor is on is the page's `<output>`, named here by `aria-describedby`.
 *
 * The cells are drawn by CSS from `--heat` (`heatLevel`, 0 to 1) and the
 * theme's own `--green`, so all three phosphors follow. On a phone the
 * stylesheet turns the week on its side (days across, hours down) under
 * `WEEK_TRANSPOSE_QUERY`, and the arrow keys turn with it.
 */
type Props = {
  heat: readonly (readonly number[])[];
  /** The cell the reading describes: under the pointer, picked, or the peak. */
  cursor: Cell | null;
  /** The cell whose messages are open. */
  pick: Cell | null;
  readingId: string;
  label: string;
  days: readonly string[];
  hour: (h: number) => string;
  /** Bumped each time a new chat is read, to run the beam once across the week. */
  sweep: number;
  onAim: (cell: Cell | null) => void;
  onPick: (cell: Cell) => void;
};

const same = (a: Cell | null, d: number, h: number) => !!a && a.day === d && a.hour === h;

function cellOf(target: EventTarget | null): Cell | null {
  const el = target instanceof Element ? target.closest<HTMLElement>("[data-d]") : null;
  if (!el) return null;
  return { day: Number(el.dataset.d), hour: Number(el.dataset.h) };
}

export default function Week({ heat, cursor, pick, readingId, label, days, hour, sweep, onAim, onPick }: Props) {
  const max = Math.max(1, ...heat.flat());

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const cell = cellOf(event.target);
    if (cell && !same(cursor, cell.day, cell.hour)) onAim(cell);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    const cell = cellOf(event.target);
    if (cell) onAim(cell);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const from = cursor ?? { day: 0, hour: 0 };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(from);
      return;
    }
    const next = moveCell(from, event.key, window.matchMedia(WEEK_TRANSPOSE_QUERY).matches);
    if (!next) return;
    event.preventDefault();
    onAim(next);
  }

  return (
    <div
      className="lore__week"
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-describedby={readingId}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onAim(null);
      }}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        const cell = cellOf(event.target);
        if (cell) onPick(cell);
      }}
      onKeyDown={onKeyDown}
    >
      <span className="lore__days" aria-hidden="true">
        {days.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
      <span className="lore__hours" aria-hidden="true">
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h}>{h % 6 === 0 ? hour(h).slice(0, 2) : ""}</span>
        ))}
      </span>
      <span className="lore__cells">
        {heat.flatMap((row, d) =>
          row.map((n, h) => (
            <span
              key={`${d}-${h}`}
              className="lore__cell"
              data-d={d}
              data-h={h}
              data-empty={n ? undefined : ""}
              data-at={same(cursor, d, h) ? "" : undefined}
              data-pick={same(pick, d, h) ? "" : undefined}
              style={{ "--heat": heatLevel(n, max).toFixed(3) } as CSSProperties}
            />
          )),
        )}
      </span>
      {sweep > 0 ? <span key={sweep} className="lore__beam" aria-hidden="true" /> : null}
    </div>
  );
}
