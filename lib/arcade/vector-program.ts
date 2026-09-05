import { GAME_TITLES } from "@/content/arcade";
import { createGame, pressGame, stepGame, type GameId } from "./engine";
import { blankGrid, centre, toLines, write } from "./grid";
import type { ProgramSpec } from "./program";

/** The same engine on the legacy character host, for ProgramSpec compatibility. */
export function vectorProgram(id: GameId): ProgramSpec {
  return { id, title: GAME_TITLES[id], start(host) {
    const s = createGame(id, 1), held = new Set<string>(); let disposed = false;
    const draw = () => {
      const grid = blankGrid(host.cols, host.rows);
      centre(grid, 0, GAME_TITLES[id]); write(grid, 1, 1, `score ${s.score}`);
      const put = (x: number, y: number, glyph: string) => write(grid, Math.max(0, Math.min(host.cols - 1, Math.round(x))), Math.max(2, Math.min(host.rows - 2, Math.round(y))), glyph);
      if (id === "snake") { s.snake.forEach(p => put(p.x / 30 * host.cols, 2 + p.y / 16 * (host.rows - 4), "o")); put(s.food.x / 30 * host.cols, 2 + s.food.y / 16 * (host.rows - 4), "*"); }
      else if (id === "under") {
        for (let y = 0; y < s.map.length; y++) for (let x = 0; x < s.map[y].length; x++) if (s.seen[y][x]) put(x, y + 2, s.map[y][x] ? "#" : ".");
        put(s.player.x, s.player.y + 2, "@"); put(s.food.x, s.food.y + 2, "k"); put(s.exit.x, s.exit.y + 2, ">");
      } else if (id === "poker") { s.cards.forEach((c, i) => write(grid, 2 + i * 6, 5, `${s.held[i] ? "[" : " "}${c % 13 + 2}${s.held[i] ? "]" : " "}`)); centre(grid, 8, s.handName); }
      else { put(s.player.x / 900 * host.cols, 2 + s.player.y / 560 * (host.rows - 4), id === "pong" ? "|" : "@"); put(s.ball.x / 900 * host.cols, 2 + s.ball.y / 560 * (host.rows - 4), "O"); }
      centre(grid, host.rows - 1, "arrows move . space action"); host.draw(toLines(grid));
    };
    draw(); return {
      tick(ms) { if (disposed) return; stepGame(s, ms / 1000, held); draw(); if (s.over) { disposed = true; host.exit({ score: s.score }); } },
      key(key, down) { const k = key === "fire" ? "action" : key === "start" ? "bank" : key; if (down) { held.add(k); pressGame(s, k); } else held.delete(k); draw(); },
      resize() { draw(); }, dispose() { disposed = true; held.clear(); },
    };
  } };
}
