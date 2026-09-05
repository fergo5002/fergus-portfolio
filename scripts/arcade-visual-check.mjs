import { chromium, webkit, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.ARCADE_BASE || "http://localhost:3210";
const out = resolve(".phone-check/arcade-rebuild"); await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, reducedMotion: "no-preference" });
const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
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
  for (const id of ["bounce", "pong", "snake", "under", "signal", "poker"]) {
    await page.locator(`.arcade-cabinet[data-game=${id}]`).click();
    await page.getByRole("button", { name: /start solo run/i }).click();
    await page.locator(".arcade-stage").focus();
    await page.keyboard.press("Space");
    if (id === "under") for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    if (id === "poker") { await page.keyboard.press("1"); await page.keyboard.press("Space"); await page.keyboard.press("Enter"); }
    if (["bounce", "signal"].includes(id)) { await page.keyboard.down("ArrowRight"); await page.waitForTimeout(250); await page.keyboard.up("ArrowRight"); }
    await page.waitForTimeout(1500);
    const status = await page.locator(".arcade-live-hud").textContent();
    await page.screenshot({ path: resolve(out, `game-${id}.png`) });
    evidence.push({ id, status });
    await page.getByRole("button", { name: /all cabinets/i }).first().click();
  }
  await page.keyboard.press("Escape");
  if (!await page.locator(".term__input").evaluate(e => e === document.activeElement)) throw new Error("Prompt focus was not restored");
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(resolve(out, "desktop.json"), JSON.stringify({ evidence, errors }, null, 2));
  console.log(JSON.stringify({ evidence, errors }));
} finally { await browser.close(); }
