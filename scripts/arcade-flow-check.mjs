import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.ARCADE_BASE || "http://localhost:3210", posting = process.env.ARCADE_POST_TEST === "1";
if (posting && new URL(base).hostname === "fergusoreilly.dev") throw new Error("Test scores must never be posted to the public production board");
const out = resolve(".phone-check/arcade-flow"); await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 920 }, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    window.__arcadeOscillators = 0; const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__arcadeOscillators++; return original.call(this); };
  });
  const page = await context.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  if (process.env.ARCADE_PREVIEW_BYPASS) {
    if (!new URL(base).hostname.endsWith(".vercel.app")) throw new Error("Preview authentication requires a Vercel deployment URL");
    // Only the selected deployment receives its existing protection credential.
    await page.route(`${new URL(base).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.ARCADE_PREVIEW_BYPASS } }));
  }
  await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator(".statusbar__prompt").click(); await page.locator(".term__input").fill("cd arcade poker"); await page.locator(".term__input").press("Enter");
  await page.getByRole("button", { name: "Sound off", exact: true }).click(); await page.getByRole("button", { name: "Sound on", exact: true }).waitFor();
  await page.getByRole("button", { name: /Start solo run/ }).click(); await page.waitForTimeout(8500);
  for (let i = 0; i < 32 && !await page.locator(".arcade-results").count(); i++) {
    try { await page.getByRole("button", { name: "BANK HAND", exact: true }).click({ timeout: 3000 }); }
    catch (error) { if (await page.locator(".arcade-results").count()) break; throw error; }
    // Completion is an asynchronous UI event. It may replace the button between
    // the loop's condition and the next action on a loaded browser.
    await page.waitForTimeout(400);
  }
  await page.getByRole("region", { name: "Run result", exact: true }).waitFor();
  const score = await page.locator(".arcade-result-summary>strong").textContent();
  if (!(Number(score.replaceAll(",", "")) > 0)) throw new Error("The completed run has no score");
  if (await page.evaluate(() => localStorage.getItem("fergusos:arcade.initials")) !== null) throw new Error("Initials were stored before a post");
  if (posting) {
    await page.getByRole("textbox", { name: "Your three initials", exact: true }).fill("DEV"); await page.getByRole("button", { name: "Post score", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Your score is on the board." }).waitFor();
    if (await page.evaluate(() => localStorage.getItem("fergusos:arcade.initials")) !== "DEV") throw new Error("Posting did not remember chosen initials");
    const persisted = await page.evaluate(async () => (await fetch("/api/board")).json());
    if (!persisted.boards.find(board => board.game === "poker")?.rows.some(row => row.initials === "DEV" && row.score === Number(score.replaceAll(",", "")))) throw new Error("The posted score disappeared on the next board read");
  }
  const oscillators = await page.evaluate(() => window.__arcadeOscillators); if (oscillators <= 0) throw new Error("Sound on did not create any game synthesis");
  await page.screenshot({ path: resolve(out, "result.png") });
  await page.getByRole("button", { name: "Play again", exact: true }).click(); await page.locator(".arcade-stage").waitFor();
  await page.keyboard.press("Escape"); await page.locator(".term__input").fill("forget"); await page.locator(".term__input").press("Enter");
  if (await page.evaluate(() => localStorage.getItem("fergusos:arcade.initials")) !== null) throw new Error("forget did not remove initials");
  if (errors.length) throw new Error(errors.join("\n"));
  const evidence = { score, posting, oscillators, replay: true, forget: true, errors }; await writeFile(resolve(out, "evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
