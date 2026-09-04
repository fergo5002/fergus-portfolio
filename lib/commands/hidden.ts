import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { createCabinet } from "@/lib/arcade/cabinet";
import { findGame, isReady } from "@/lib/arcade/games";
import { defineCommand } from "./registry";
import { argOf, ok } from "./shared";

/**
 * Doors. Nothing in this file appears in help, completion or ls. A door is
 * reached by name or as `cd <name>`, and the only hint anywhere is the
 * `arcade` row in `top`.
 *
 * `arcade` with no argument returns the cabinet, and `arcade <game>` returns
 * that game, so `cd arcade bounce` skips the list. Both are `{ type:
 * "program" }`: this file starts nothing and draws nothing, because
 * `lib/commands.ts` is pure and `components/Terminal.tsx` is the only thing
 * allowed to act on a result.
 */

/**
 * The refusal, as a named constant and a one-line guard, so
 * `scripts/mutation-check.mjs` can anchor on the guard and prove the tests
 * notice when it goes. Same shape as `GRAVITY_DECLINED` and `EJECT_DECLINED`
 * in `lib/commands/effects.ts`, and the same reason: a game is motion all the
 * way down and there is no still version of one.
 */
export const ARCADE_DECLINED: string[] = [...arcadeCopy.declined];

export const hidden = [
  defineCommand({
    name: "arcade",
    hidden: true,
    run: (args, ctx) => {
      if (ctx.reducedMotion) return ok(ARCADE_DECLINED);
      const wanted = argOf(args);
      if (!wanted) return { type: "program", program: createCabinet() };
      const game = findGame(wanted);
      if (!game) return ok([`arcade: no game called '${wanted}'`]);
      if (!isReady(game) || !game.spec) {
        return ok([`${GAME_TITLES[game.id] ?? game.id}: ${arcadeCopy.cabinet.notReady}`]);
      }
      return { type: "program", program: game.spec };
    },
  }),
];
