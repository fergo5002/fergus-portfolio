import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.ARCADE_BASE || "http://localhost:3210";
const out = resolve(".phone-check/arcade-rebuild"); await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, reducedMotion: "no-preference" });
const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
/** Headless WebGL runs the page at a few frames a second, so the countdown gets a generous wait. */
const phase = (name) => page.waitForFunction((n) => document.querySelector(".arcade-play")?.dataset.phase === n, name, { timeout: 30000 });
try {
  await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator(".statusbar__prompt").click();
  await page.locator(".term__input").fill("cd arcade"); await page.locator(".term__input").press("Enter");
  await page.locator(".arcade-entrance").waitFor();
  await page.screenshot({ path: resolve(out, "01-arrival.png") });
  await page.getByRole("button", { name: /skip/i }).click();
  await page.locator(".arcade-cabinet").first().waitFor();
  await page.screenshot({ path: resolve(out, "02-gallery.png") });
  const evidence = [];
  for (const id of ["signal", "poker", "panic"]) {
    await page.locator(`.arcade-cabinet[data-game=${id}]`).click();
    await page.getByRole("button", { name: /start solo run/i }).click();
    // No explicit focus: the first Space after starting must reach the game, not a button.
    // Pre-focusing the stage here hid a live bug where Space activated "all cabinets".
    await page.locator(".arcade-canvas").waitFor();
    // The assertion is that focus ENDS on the stage after start. Waiting for it (rather than
    // pressing at once) closes the gap where Space could fire before either focus effect ran
    // and pass for the wrong reason; on the old code this times out on the back button.
    await page.waitForFunction(() => document.activeElement?.classList.contains("arcade-stage"), null, { timeout: 3000 })
      .catch(() => { throw new Error(`${id}: focus did not land on the stage after start `); });
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    if (!await page.locator(".arcade-play").count()) throw new Error(`${id}: the first Space after start left the game`);
    if (await page.locator(".arcade-play").getAttribute("data-phase") === "card") throw new Error(`${id}: the first Space did not start the run from its card`);
    await phase("play");
    if (id === "poker") { await page.keyboard.press("1"); await page.keyboard.press("Space"); await page.keyboard.press("Enter"); }
    if (id === "signal") { await page.keyboard.down("ArrowRight"); await page.waitForTimeout(250); await page.keyboard.up("ArrowRight"); }
    if (id === "panic") {
      if (!await page.locator(".arcade-type__input").evaluate(e => e === document.activeElement)) throw new Error("panic: starting the run did not hand focus to its text input");
      await page.keyboard.type("zq");
    }
    await page.waitForTimeout(1500);
    const status = await page.locator(".arcade-status").textContent();
    if (!/points/.test(status ?? "")) throw new Error(`${id}: the screen-reader status line is empty or stale: ${status}`);
    await page.screenshot({ path: resolve(out, `game-${id}.png`) });
    evidence.push({ id, status });
    if (id !== "panic") await page.getByRole("button", { name: /all cabinets/i }).first().click();
  }
  // Escape leaves the arcade even from inside the typing game's own text input.
  await page.keyboard.press("Escape");
  await page.locator(".arcade-room").waitFor({ state: "detached", timeout: 5000 }).catch(() => { throw new Error("Escape from the text input did not leave the arcade"); });
  if (!await page.locator(".term__input").evaluate(e => e === document.activeElement)) throw new Error("Prompt focus was not restored");
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(resolve(out, "desktop.json"), JSON.stringify({ evidence, errors }, null, 2));
  console.log(JSON.stringify({ evidence, errors }));
} finally { await browser.close(); }
