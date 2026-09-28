import { GAME_TITLES } from "@/content/arcade";
import { createGame, gameHud, pressGame, stepGame, type GameId } from "./engine";
import { blankGrid, centre, toLines, write } from "./grid";
import type { ProgramSpec } from "./program";

/**
 * The same engine on the legacy character host, for ProgramSpec compatibility.
 *
 * The terminal hands every collection id to the arcade room, so nothing on the
 * site starts this; it exists so `ARCADE_GAMES` can say a cabinet is built and
 * so a host that only speaks ProgramSpec still gets a working game. It draws
 * the title, the score and the HUD's stage rather than a picture: the picture
 * is the room's job.
 */
export function vectorProgram(id: GameId): ProgramSpec {
  return { id, title: GAME_TITLES[id], start(host) {
    const s = createGame(id, 1), held = new Set<string>(); let disposed = false;
    const draw = () => {
      const grid = blankGrid(host.cols, host.rows);
      const hud = gameHud(s);
      centre(grid, 0, GAME_TITLES[id]); write(grid, 1, 2, `score ${s.score}`);
      if (hud.stage) write(grid, 1, 3, `${hud.stage.label.toLowerCase()} ${hud.stage.value}`);
      centre(grid, host.rows - 1, "arrows move . space action"); host.draw(toLines(grid));
    };
    draw(); return {
      tick(ms) { if (disposed) return; stepGame(s, ms / 1000, held); draw(); if (s.over) { disposed = true; host.exit({ score: s.score }); } },
      key(key, down) { const k = key === "fire" ? "action" : key === "start" ? "bank" : key; if (down) { held.add(k); pressGame(s, k); } else held.delete(k); draw(); },
      resize() { draw(); }, dispose() { disposed = true; held.clear(); },
    };
  } };
}
