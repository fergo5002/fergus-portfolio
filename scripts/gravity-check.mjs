/**
 * Gravity in a real browser: the control's name, what falls, and the way back.
 *
 * The hero name used to fall twice (2026-09-26). HeroName keeps a visually
 * hidden copy of the name for screen readers beside its per-character layer,
 * and the stage measured both: a Range reports a clipped word's full layout box,
 * so "Patrick", "Fergus" and "O'Reilly" dropped as whole words on top of their
 * own letters. Anything the visitor cannot see must not fall.
 *
 *   REVISION_BASE=http://localhost:3000 node scripts/gravity-check.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/", { waitUntil: "commit" });
  await page.evaluate(() => sessionStorage.setItem("fergusos_booted", "1"));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  // The hero swaps its plain server copy for the character layer on mount, and
  // the stage measures whatever is there when the switch is pressed.
  await page.locator(".heroname__ch").first().waitFor();

  // Since 2026-11-25 gravity lives in the terminal, and while it is on the dock
  // offers "restore page" beside the handle.
  await page.locator(".term-handle").click();
  await page.locator(".shell .term__input").fill("gravity");
  await page.locator(".shell .term__input").press("Enter");
  await page.locator(".gravity__piece").first().waitFor();
  const restore = page.locator(".dock-pill", { hasText: "restore page" });
  await restore.waitFor();

  const pieces = await page.evaluate(() => [...document.querySelectorAll(".gravity__piece")].map((el) => el.textContent ?? ""));
  const name = await page.evaluate(() => document.querySelector(".heroname .vh")?.textContent ?? "");
  assert.ok(name.length > 0, "the accessible copy of the name is still in the document");
  const doubled = pieces.filter((t) => name.split(/\s+/).includes(t));
  assert.deepEqual(doubled, [], `hidden text fell as whole words: ${doubled.join(", ")}`);
  assert.ok(pieces.some((t) => t === "P"), "the visible letters of the name still fall");

  await restore.click();
  await page.waitForFunction(() => document.querySelectorAll(".gravity__piece").length === 0, null, { timeout: 15_000 });
  await restore.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(`gravity: ${pieces.length} pieces, none hidden, restored`);
} finally {
  await browser.close();
}
