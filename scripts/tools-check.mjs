/**
 * Behavioural checks for the tools workbench. Synthetic files only; no accounts or mail.
 *
 * One module per tool under `scripts/tools-check/`, each a default export
 * taking the shared context below, so the agents rebuilding one tool each can
 * change that tool's checks without touching anyone else's. Same flags as
 * before: `--base`, `--out`, `--engine`, `--width`, and `--only <name>`
 * (index, headline, overlap, drift, relief, second-visit).
 *
 * Every screenshot also asserts the instrument redesign's promise
 * (`scripts/instrument-guard.mjs`): no stock date input, no visible stock file
 * input and no range still wearing the browser's own appearance.
 */
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { stockControls } from "./instrument-guard.mjs";
import index from "./tools-check/index.mjs";
import headline from "./tools-check/headline.mjs";
import overlap from "./tools-check/overlap.mjs";
import drift from "./tools-check/drift.mjs";
import relief from "./tools-check/relief.mjs";
import secondVisit from "./tools-check/second-visit.mjs";

const CHECKS = [
  ["index", index],
  ["headline", headline],
  ["overlap", overlap],
  ["drift", drift],
  ["relief", relief],
  ["second-visit", secondVisit],
];

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = option("--base", "http://localhost:3107");
const out = option("--out", ".phone-check/flows");
const engine = option("--engine", "chromium");
const only = option("--only", "");
const width = Number(option("--width", engine === "webkit" ? "390" : "1440"));
if (only && !CHECKS.some(([name]) => name === only)) throw new Error(`--only ${only}: no such check (${CHECKS.map(([name]) => name).join(", ")})`);
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true, isMobile: width < 700, hasTouch: width < 700 });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.setDefaultNavigationTimeout(60_000);
const errors = [];
const leaks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if ((request.postData() || "").includes("WorkbenchFixture")) leaks.push(request.url()); });
async function go(slug) { await page.goto(`${base}/tools${slug ? "/" + slug : ""}`, { waitUntil: "networkidle" }); }
async function shot(name) {
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); window.scrollTo(0, 0); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: page overflows`);
  assert.deepEqual(await stockControls(page), [], `${name}: stock controls on the page`);
  await page.screenshot({ path: `${out}/${engine}-${width}-${name}.png`, fullPage: true });
  console.log(`PASS ${engine} ${width} ${name}`);
}
async function download(button) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}
const list = (ids) => "First Name,Last Name,URL\n" + ids.map(i => `WorkbenchFixture,Person ${i},https://www.linkedin.com/in/workbench-person-${i}`).join("\n");
const upload = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
const ctx = { page, base, engine, width, go, shot, download, list, upload, assert };

try {
  for (const [name, run] of CHECKS) if (!only || only === name) await run(ctx);
  assert.deepEqual(errors, [], "application exceptions");
  assert.deepEqual(leaks, [], "visitor text crossed the network");
  console.log(`PASS ${engine} ${width}: ${only || "original five tool workflows"}, failures, downloads and no text uploads`);
} catch (error) {
  await page.screenshot({ path: `${out}/${engine}-${width}-failure.png`, fullPage: true }).catch(() => {});
  console.error(await page.locator(".drift__note, .drift__readiness, .sv__message").allTextContents());
  console.error("Application errors:", errors);
  throw error;
} finally { await browser.close(); }
