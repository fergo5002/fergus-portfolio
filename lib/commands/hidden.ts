import { defineCommand } from "./registry";
import { ok } from "./shared";

/**
 * Doors. Nothing in this file appears in help, completion or ls. A door is
 * reached by name or as `cd <name>`, and the only hint anywhere is the
 * `arcade` row in `top`.
 *
 * G0 replaces the arcade's `run` with `{ type: "program", program }` and the
 * Terminal hands that to the runtime. Until then the door exists and is closed.
 */
export const hidden = [
  defineCommand({
    name: "arcade",
    hidden: true,
    run: () => ok(["arcade: no runtime yet"]),
  }),
];
