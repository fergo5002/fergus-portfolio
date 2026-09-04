import { describe, it, expect } from "vitest";
import { cabinetReduce, cabinetView, createCabinet, initialCabinetState } from "@/lib/arcade/cabinet";
import type { ArcadeGame } from "@/lib/arcade/games";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import type { ProgramHost, ProgramSpec } from "@/lib/arcade/program";

const READY: ArcadeGame = { id: "bounce", title: "bounce", spec: { id: "bounce", title: "bounce", start: () => ({ tick: () => {}, key: () => {}, dispose: () => {} }) }, board: true };
const PLANNED: ArcadeGame = { id: "pong", title: GAME_TITLES.pong, spec: null, board: true };
const GAMES = [READY, PLANNED];

describe("cabinetReduce", () => {
  it("moves the cursor and wraps at both ends", () => {
    let s = initialCabinetState();
    expect(s.index).toBe(0);
    s = cabinetReduce(s, "up", GAMES).state;
    expect(s.index).toBe(1);
    s = cabinetReduce(s, "down", GAMES).state;
    expect(s.index).toBe(0);
  });

  it("launches the selected game on enter and on fire", () => {
    const s = initialCabinetState();
    expect(cabinetReduce(s, "start", GAMES).launch).toBe(READY);
    expect(cabinetReduce(s, "fire", GAMES).launch).toBe(READY);
  });

  it("says a game is not built rather than launching nothing", () => {
    const s = { index: 1, note: null };
    const out = cabinetReduce(s, "start", GAMES);
    expect(out.launch).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.cabinet.notReady);
  });

  it("jumps straight to a game on its digit", () => {
    const out = cabinetReduce(initialCabinetState(), "2", GAMES);
    expect(out.state.index).toBe(1);
    expect(out.launch).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.cabinet.notReady);
  });

  it("ignores a digit past the end of the list", () => {
    const out = cabinetReduce(initialCabinetState(), "5", GAMES);
    expect(out.state.index).toBe(0);
  });

  it("clears the note as soon as the cursor moves", () => {
    const out = cabinetReduce({ index: 1, note: "stale" }, "up", GAMES);
    expect(out.state.note).toBeNull();
  });
});

describe("cabinetView", () => {
  const render = (cols: number, rows: number) =>
    cabinetView(initialCabinetState(), GAMES, { available: true, boards: [{ game: "bounce", rows: [{ initials: "FOR", score: 12 }] }] }, cols, rows);

  it("fills the grid exactly, at both sizes", () => {
    for (const [cols, rows] of [[48, 20], [32, 16]] as const) {
      const lines = render(cols, rows);
      expect(lines, `${cols}x${rows}`).toHaveLength(rows);
      for (const line of lines) expect(line.length, line).toBe(cols);
    }
  });

  it("names every game, and marks the ones nobody has built", () => {
    const text = render(48, 20).join("\n");
    expect(text).toContain("bounce");
    expect(text).toContain(GAME_TITLES.pong);
    expect(text).toContain(`(${GAME_TITLES.pong})`);
  });

  it("puts a cursor on the selection and nowhere else", () => {
    const lines = render(48, 20);
    expect(lines.filter((l) => l.trimStart().startsWith(">"))).toHaveLength(1);
  });

  it("prints the selected game's board", () => {
    expect(render(48, 20).join("\n")).toContain("FOR");
  });

  it("prints the unavailable sentence when there is no board", () => {
    const lines = cabinetView(initialCabinetState(), GAMES, null, 32, 16);
    expect(lines.join("\n")).toContain(arcadeCopy.board.unavailable[0]);
  });

  it("shows the note in place of the footer when there is one", () => {
    const lines = cabinetView({ index: 1, note: arcadeCopy.cabinet.notReady }, GAMES, null, 48, 20);
    expect(lines.join("\n")).toContain(arcadeCopy.cabinet.notReady);
  });
});

describe("createCabinet", () => {
  function host(overrides: Partial<ProgramHost> = {}): ProgramHost {
    return { cols: 48, rows: 20, draw: () => {}, exit: () => {}, ...overrides };
  }

  it("is the program the door returns", () => {
    const cabinet = createCabinet();
    expect(cabinet.id).toBe("arcade");
    expect(cabinet.title).toBe(arcadeCopy.cabinet.title);
  });

  it("draws as soon as it starts, so the screen is never blank", () => {
    let drawn = 0;
    const p = createCabinet().start(host({ draw: () => void drawn++ }));
    expect(drawn).toBe(1);
    p.dispose();
  });

  it("hands the screen to the game it launches", () => {
    let ran: ProgramSpec | null = null;
    const p = createCabinet().start(host({ run: (spec) => void (ran = spec) }));
    p.key("start", true);
    expect(ran).not.toBeNull();
    p.dispose();
  });

  it("acts on the key going down, never on the key coming up", () => {
    let ran = 0;
    const p = createCabinet().start(host({ run: () => void ran++ }));
    p.key("start", true);
    p.key("start", false);
    expect(ran).toBe(1);
    p.dispose();
  });
});
