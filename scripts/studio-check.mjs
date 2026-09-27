/**
 * The five studios' workflows, downloads and phone layouts.
 *
 * One module per studio under `scripts/studio-check/`, each a default export
 * taking the shared context below, so the agents rebuilding one studio each
 * can change that studio's checks without touching anyone else's. Same
 * interface as before: `LAB_URL` and `STUDIO_PREFIX` in the environment, and an
 * optional first argument that runs only the checks whose name contains it
 * (`mobile` runs only the phone pass).
 *
 * Every desktop check also asserts the instrument redesign's promise
 * (`scripts/instrument-guard.mjs`): no stock date input, no visible stock file
 * input and no range still wearing the browser's own appearance.
 */
import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { stockControls } from "./instrument-guard.mjs";
import atlas from "./studio-check/atlas.mjs";
import groupLore from "./studio-check/group-lore.mjs";
import proveIt from "./studio-check/prove-it.mjs";
import resonance from "./studio-check/resonance.mjs";
import pocketRedact from "./studio-check/pocket-redact.mjs";

const CHECKS = [
  ["atlas", atlas],
  ["group-lore", groupLore],
  ["prove-it", proveIt],
  ["resonance", resonance],
  ["pocket-redact", pocketRedact],
];

const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  prefix = process.env.STUDIO_PREFIX || "/lab",
  out = resolve(".codex/studio-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
await context.addInitScript(() => {
  const Native = window.AudioContext;
  window.__studioAudio = [];
  window.__studioNotes = 0;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      window.__studioAudio.push(this);
    }
    createOscillator() {
      const o = super.createOscillator(),
        start = o.start.bind(o);
      o.start = (...args) => {
        window.__studioNotes++;
        return start(...args);
      };
      return o;
    }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [],
  report = [];
let current = "";
page.on("pageerror", (e) => errors.push({ tool: current, message: e.message }));
async function open(slug) {
  current = slug;
  const r = await page.goto(`${base}${prefix}/${slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.equal(r.status(), 200);
  await page.locator(".studio").first().waitFor();
}
const button = (name) => page.getByRole("button", { name, exact: true });
async function save(name) {
  const event = page.waitForEvent("download");
  await button(name).click();
  const file = await event,
    path = resolve(out, file.suggestedFilename());
  await file.saveAs(path);
  return path;
}
async function check(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  current = name;
  try {
    await fn();
    assert.deepEqual(await stockControls(page), [], `${name}: stock controls on the page`);
    await page.screenshot({
      path: resolve(out, `${name}.png`),
      fullPage: true,
    });
    report.push({ name, ok: true });
    console.log("PASS", name);
  } catch (e) {
    report.push({ name, ok: false, error: e.message });
    console.log("FAIL", name, e.message);
    await page
      .screenshot({ path: resolve(out, `${name}-failure.png`), fullPage: true })
      .catch(() => {});
  }
}
const ctx = { page, open, button, save, assert, report };
for (const [name, run] of CHECKS) await check(name, () => run(ctx));

if (!process.argv[2] || process.argv[2] === "mobile") {
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const mobile = await type.launch({ headless: true }),
      ctx = await mobile.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        isMobile: true,
        hasTouch: true,
      }),
      p = await ctx.newPage();
    p.setDefaultTimeout(60000);
    for (const slug of CHECKS.map(([slug]) => slug)) {
      try {
        await p.goto(`${base}${prefix}/${slug}`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
        await p.locator(".studio").waitFor();
        if (slug === "pocket-redact")
          await p
            .getByRole("button", {
              name: "Try the example invoice",
              exact: true,
            })
            .click();
        await p.waitForTimeout(300);
        const dimensions = await p.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert(
          dimensions.scroll <= dimensions.width + 1,
          JSON.stringify(dimensions),
        );
        await p.screenshot({
          path: resolve(out, `${slug}-${name}-mobile.png`),
          fullPage: true,
        });
        report.push({ name: `${slug}-${name}-mobile`, ok: true });
        console.log("PASS", slug, name, "mobile");
      } catch (e) {
        report.push({
          name: `${slug}-${name}-mobile`,
          ok: false,
          error: e.message,
        });
        console.log("FAIL", slug, name, e.message);
      }
    }
    await mobile.close();
  }
}
await writeFile(
  resolve(out, "report.json"),
  JSON.stringify({ report, errors }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ report, errors }, null, 2));
if (report.some((r) => r.ok === false) || errors.length) process.exitCode = 1;
