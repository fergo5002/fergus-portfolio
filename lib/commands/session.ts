import { ownedKeys } from "@/lib/forget";
import { formatWho } from "@/lib/presence";
import { defineCommand } from "./registry";
import { ok } from "./shared";

/**
 * The visitor's session: what the site has kept, and who else is here.
 *
 * `forget` is the constitution's promise made typeable (AGENTS.md, "What the
 * site may keep"). It computes the owned keys from the list the Terminal
 * supplies and returns an effect; the Terminal does the removing. That keeps
 * this file pure and the promise testable.
 *
 * Both sit under `help`'s "shell" section, above its two static lines.
 */
export const session = [
  defineCommand({
    name: "forget",
    help: "forget            wipe what this site saved on your machine",
    group: "shell",
    rank: 1,
    run: (_args, ctx) => {
      const keys = ownedKeys(ctx.storageKeys ?? []);
      if (keys.length === 0) return ok(["nothing to forget"]);
      return {
        type: "effect",
        effect: { kind: "forget", keys },
        lines: ["forgotten:", ...keys.map((k) => `  ${k}`)],
      };
    },
  }),

  defineCommand({
    name: "who",
    help: "who               who else is on the tube",
    group: "shell",
    rank: 2,
    run: (_args, ctx) => ok(formatWho(ctx.presence ?? 1)),
  }),
];
