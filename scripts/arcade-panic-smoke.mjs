/**
 * Kernel Panic's smoke, shared by the arcade checks: type one falling process
 * to death through the room's real text input, and prove the kill scored.
 *
 * The canvas is opaque to a script and there are no test hooks in the room,
 * so this plays the way the text contract allows: the input mirrors the
 * game's buffer. A first letter that some process starts with stays in the
 * input (the lock took); one that nothing starts with is cleared. From a lock
 * it tries the short names that begin with that letter, a character at a
 * time, backing out with Backspace when one does not extend the line, until
 * the line empties on the last letter, which is the kill. The short names are
 * read from the module's own list so the smoke cannot drift from the game.
 *
 * It never calls `.focus()`: the tap or key that started the run must already
 * have put focus in the input, and the callers assert that first.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("lib/arcade/games/panic.ts"), "utf8");
const lists = [...source.matchAll(/short: \[([\s\S]*?)\]/g)].map((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((w) => w[1]));
if (lists.length < 2 || lists.some((l) => l.length < 10)) throw new Error("panic smoke: could not read the short name lists from lib/arcade/games/panic.ts");
const SHORT = [...new Set(lists.flat())];

/** Types until a process dies. Returns the name it killed; throws with what it tried if nothing does in `seconds`. */
export async function killOneProcess(page, { seconds = 45 } = {}) {
  const input = page.locator(".arcade-type__input");
  const value = () => input.inputValue();
  const clear = async () => { for (let i = 0; i < 24 && (await value()); i++) await page.keyboard.press("Backspace"); };
  const firsts = [...new Set(SHORT.map((w) => w[0]))];
  const deadline = Date.now() + seconds * 1000;
  const tried = [];
  while (Date.now() < deadline) {
    for (const first of firsts) {
      await page.keyboard.type(first);
      if ((await value()) !== first) continue;
      // Locked on to something starting with `first`: try its names.
      for (const word of SHORT.filter((w) => w[0] === first)) {
        tried.push(word);
        let ok = true;
        for (let i = 1; i < word.length; i++) {
          const before = await value();
          await page.keyboard.type(word[i]);
          const after = await value();
          if (after === "" && i === word.length - 1) return word; // the last letter killed it and cleared the line
          if (after === "") { ok = false; break; } // it landed under us, or the run halted
          if (after.length === before.length) { ok = false; break; } // not this name: the letter did not take
        }
        if (!ok) { await clear(); await page.keyboard.type(first); if ((await value()) !== first) break; }
      }
      await clear();
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`panic smoke: typed for ${seconds}s and killed nothing (tried ${tried.slice(-12).join(", ")})`);
}

/** The hidden status line's points, which the room writes about once a second. */
export async function statusPoints(page) {
  const status = (await page.locator(".arcade-status").textContent()) ?? "";
  const match = /(\d+) points/.exec(status);
  return match ? Number(match[1]) : null;
}
