import { registerCommands } from "./registry";
import type { CommandDef } from "./registry";
import { effects } from "./effects";
import { hidden } from "./hidden";
import { info } from "./info";
import { nav } from "./nav";
import { session } from "./session";
import { sudo } from "./sudo";

/**
 * Every command module, alphabetical by module. A new module is one import
 * line and one entry here, both in alphabetical position, so two pull requests
 * adding modules rarely touch the same line. `index.test.ts` checks the order
 * and that no name or alias is claimed twice.
 *
 * Importing this file registers everything. `lib/commands.ts` imports it as
 * `./commands/index`, with the `/index` written out, so it can never be
 * mistaken for `lib/commands.ts` itself.
 */
export const MODULES: CommandDef[][] = [effects, hidden, info, nav, session, sudo];

for (const defs of MODULES) registerCommands(defs);
