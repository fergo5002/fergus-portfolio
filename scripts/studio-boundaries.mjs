/**
 * Studio file boundaries and redaction pixels, with real motion on.
 *
 * One module per studio under `scripts/studio-boundaries/`, each exporting an
 * ordered list of `[name, check]` pairs that share one page, so the agents
 * rebuilding one studio each can change that studio's boundaries without
 * touching anyone else's. Same interface as before: `LAB_URL` and
 * `STUDIO_PREFIX` in the environment. An optional first argument runs only
 * the studio whose module name contains it (atlas, group-lore, pocket-redact).
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import atlas from "./studio-boundaries/atlas.mjs";
import groupLore from "./studio-boundaries/group-lore.mjs";
import pocketRedact from "./studio-boundaries/pocket-redact.mjs";

const STUDIOS = [
  ["atlas", atlas],
  ["group-lore", groupLore],
  ["pocket-redact", pocketRedact],
];

const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  prefix = process.env.STUDIO_PREFIX || "/lab",
  out = resolve(".codex/studio-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "no-preference",
  }),
  page = await context.newPage();
page.setDefaultTimeout(60000);
const results = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const b = (name) => page.getByRole("button", { name, exact: true });
async function open(slug) {
  await page.goto(`${base}${prefix}/${slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator(".studio").waitFor();
}
async function save(name) {
  const wait = page.waitForEvent("download");
  await b(name).click();
  const d = await wait,
    path = resolve(out, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}
async function check(name, fn) {
  try {
    const details = await fn();
    results.push({ name, ok: true, ...details });
    console.log("PASS", name, details ?? "");
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log("FAIL", name, e.message);
  }
}
const ctx = { page, open, save, b, button: b, out, assert };
for (const [studio, checks] of STUDIOS) {
  if (process.argv[2] && !studio.includes(process.argv[2])) continue;
  for (const [name, run] of checks) await check(name, () => run(ctx));
}
await writeFile(
  resolve(out, "boundaries.json"),
  JSON.stringify({ results, errors }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
if (results.some((r) => !r.ok) || errors.length) process.exitCode = 1;
