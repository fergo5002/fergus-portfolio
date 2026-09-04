import { describe, it, expect } from "vitest";
import { ARCADE_GAMES, BOARD_GAMES, findGame, isReady } from "@/lib/arcade/games";
import { GAME_TITLES } from "@/content/arcade";

describe("the game list", () => {
  it("holds the four games the design names, plus the worked example", () => {
    expect(ARCADE_GAMES.map((g) => g.id)).toEqual(["bounce", "poker", "pong", "snake", "under"]);
  });

  it("stays alphabetical by id, so two game pull requests rarely collide", () => {
    const ids = ARCADE_GAMES.map((g) => g.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("gives every game an id a command argument and a Redis key can both carry", () => {
    for (const g of ARCADE_GAMES) expect(g.id, g.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("takes every title from content, never from code", () => {
    for (const g of ARCADE_GAMES) expect(g.title).toBe(GAME_TITLES[g.id]);
  });

  it("has exactly one game ready today, and it is the worked example", () => {
    expect(ARCADE_GAMES.filter(isReady).map((g) => g.id)).toEqual(["bounce"]);
  });

  it("gives every game a board, because every game plan wants one", () => {
    expect(BOARD_GAMES).toEqual(ARCADE_GAMES.map((g) => g.id));
  });

  it("finds a game by id and nothing by a name nobody registered", () => {
    expect(findGame("pong")?.title).toBe(GAME_TITLES.pong);
    expect(findGame("tetris")).toBeUndefined();
  });
});
