import { describe, expect, it } from "vitest";
import { fameTable, FAME_SIZE } from "./fame";
import type { GameId } from "./engine";

/**
 * The Hall of Fame on the arcade's front. The three cabinets count different
 * things (a poker bank, a wave survived, names typed), so it is one table
 * with a column per cabinet rather than one ranking across them. It must say
 * so honestly when the board is loading or offline, and an empty slot is an
 * empty slot: never a row somebody did not earn.
 */
const GAMES: readonly GameId[] = ["signal", "poker", "panic"];

describe("fameTable", () => {
  it("says it is still checking before any board has been read", () => {
    expect(fameTable(null, GAMES)).toEqual({ kind: "checking" });
  });

  it("says the board is offline when the snapshot says so, and shows nothing it held", () => {
    expect(fameTable({ available: false, boards: [{ game: "poker", rows: [{ initials: "OLD", score: 9 }] }] }, GAMES)).toEqual({ kind: "offline" });
  });

  it("keeps ten empty slots a column on an empty board, and invents nothing", () => {
    const fame = fameTable({ available: true, boards: [] }, GAMES);
    if (fame.kind !== "table") throw new Error("table");
    expect(fame.empty).toBe(true);
    expect(fame.columns.map((c) => c.game)).toEqual(GAMES);
    for (const column of fame.columns) expect(column.rows).toEqual(Array(FAME_SIZE).fill(null));
  });

  it("fills a column with what its board holds, highest first, and pads the rest", () => {
    const fame = fameTable({ available: true, boards: [{ game: "poker", rows: [{ initials: "BBB", score: 70 }, { initials: "AAA", score: 900 }, { initials: "CCC", score: 20 }] }] }, GAMES);
    if (fame.kind !== "table") throw new Error("table");
    expect(fame.empty).toBe(false);
    const poker = fame.columns.find((c) => c.game === "poker")!;
    expect(poker.rows.slice(0, 3)).toEqual([{ initials: "AAA", score: 900 }, { initials: "BBB", score: 70 }, { initials: "CCC", score: 20 }]);
    expect(poker.rows.slice(3)).toEqual(Array(FAME_SIZE - 3).fill(null));
    expect(fame.columns.find((c) => c.game === "signal")!.rows).toEqual(Array(FAME_SIZE).fill(null));
  });

  it("shows the top ten of a longer board", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ initials: "ABC", score: 1000 - i }));
    const fame = fameTable({ available: true, boards: [{ game: "signal", rows }] }, GAMES);
    if (fame.kind !== "table") throw new Error("table");
    expect(fame.columns[0].rows).toEqual(rows.slice(0, 10));
  });

  it("lists only the cabinets it is asked for, whatever an old board still carries", () => {
    const fame = fameTable({ available: true, boards: [{ game: "pong", rows: [{ initials: "OLD", score: 4200 }] }] }, GAMES);
    if (fame.kind !== "table") throw new Error("table");
    expect(fame.columns.map((c) => c.game)).toEqual(GAMES);
    expect(fame.empty).toBe(true);
    expect(JSON.stringify(fame)).not.toContain("OLD");
  });
});
