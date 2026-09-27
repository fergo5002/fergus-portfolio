/**
 * The screensaver in a real browser: the beam draws it on the tube, any input
 * gives the page back and lets go of the beam, and with the CRT off the plate
 * bounces instead.
 *
 * The 45 idle seconds are skipped with Playwright's fake clock rather than
 * waited out: the page's timers, animation frames and performance.now() move
 * only when this script moves them, so the idle timer fires on demand and the
 * frames that follow are counted, not hoped for.
 *
 *   REVISION_BASE=http://localhost:3000 node scripts/saver-check.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3000";
const shots = process.env.SAVER_SHOTS || "";
const IDLE_MS = 45_000;

/**
 * Records every upload of the beam's gain, the one path its light reaches the
 * tube by. The gain and not the point count: ogl uploads a uniform only when
 * its value changes, and the saver always writes a full stroke, so the count
 * sits at the maximum and uploads once. The gain follows the beam's speed and
 * changes nearly every stroke (found 2026-09-27, when a count probe saw one
 * upload in two seconds of a saver that was drawing).
 */
function probe() {
  const log = (window.__beamUploads = []);
  const names = new WeakMap();
  for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Type) continue;
    const proto = Type.prototype;
    const location = proto.getUniformLocation;
    const uniform1f = proto.uniform1f;
    proto.getUniformLocation = function (program, name) {
      const result = location.call(this, program, name);
      if (result) names.set(result, name);
      return result;
    };
    proto.uniform1f = function (where, value) {
      if (names.get(where) === "uBeamGain") log.push({ t: performance.now(), value });
      return uniform1f.call(this, where, value);
    };
  }
}

async function open(settings) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await context.addInitScript((settings) => {
    sessionStorage.setItem("fergusos_booted", "1");
    if (settings) localStorage.setItem("fergusos_settings", JSON.stringify(settings));
  }, settings);
  await context.addInitScript(probe);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(base + "/", { waitUntil: "load" });
  await page.bringToFront();
  // Fake time does not wait for scripts to arrive, so step it in small pieces
  // until the page has really mounted (the hero's character layer) and the
  // tube has either come up or been switched off.
  let ready = null;
  for (let i = 0; i < 80 && !ready?.ok; i++) {
    await page.clock.runFor(100);
    ready = await page.evaluate(() => {
      const root = document.documentElement.classList;
      const mounted = !!document.querySelector(".heroname__ch");
      return { ok: mounted && (root.contains("webgl-ok") || root.contains("crt-off")), mounted, classes: root.value };
    });
    if (!ready.ok) await page.waitForTimeout(100);
  }
  await page.clock.runFor(500);
  return { browser, page, errors, ready };
}

const results = [];
async function check(label, fn) {
  try {
    const evidence = await fn();
    results.push(true);
    console.log(`PASS ${label}${evidence ? " " + JSON.stringify(evidence) : ""}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL ${label}\n  ${String(error.message).split("\n").join("\n  ")}`);
  }
}

{
  const first = await open(null);
  const { browser, page, errors } = first;
  try {
    await check("with a tube, the beam draws the saver and the page steps aside", async () => {
      const gl = await page.evaluate(() => document.documentElement.classList.contains("webgl-ok"));
      assert.ok(gl, `INSTRUMENT DEGRADED, not a result: WebGL never came up, so there is no tube to draw on (${JSON.stringify(first.ready)})`);
      await page.clock.fastForward(IDLE_MS + 500);
      await page.clock.runFor(2000);
      const state = await page.evaluate(() => ({
        saving: document.documentElement.classList.contains("is-saving"),
        beamSaver: !!document.querySelector(".saver--beam"),
        plate: !!document.querySelector(".saver__plate"),
        page: getComputedStyle(document.querySelector(".screen")).visibility,
        lit: window.__beamUploads.filter((u) => u.value > 0).length,
      }));
      assert.equal(state.saving, true);
      assert.equal(state.beamSaver, true);
      assert.equal(state.plate, false);
      assert.equal(state.page, "hidden");
      assert.ok(state.lit >= 5, `the beam drew ${state.lit} strokes in two seconds`);
      if (shots) {
        // A little more fake time so the persistence has built the whole figure.
        await page.clock.runFor(1200);
        await page.screenshot({ path: `${shots}/saver-beam.png` });
      }
      return { strokes: state.lit };
    });

    await check("any input gives the page back and lets go of the beam", async () => {
      await page.mouse.move(300, 300);
      await page.mouse.move(340, 320);
      await page.clock.runFor(200);
      const wokeAt = await page.evaluate(() => performance.now());
      await page.clock.runFor(1500);
      const state = await page.evaluate((wokeAt) => ({
        saving: document.documentElement.classList.contains("is-saving"),
        saver: !!document.querySelector(".saver"),
        page: getComputedStyle(document.querySelector(".screen")).visibility,
        litAfter: window.__beamUploads.filter((u) => u.t > wokeAt && u.value > 0).length,
      }), wokeAt);
      assert.equal(state.saving, false);
      assert.equal(state.saver, false);
      assert.equal(state.page, "visible");
      assert.equal(state.litAfter, 0, "the beam kept drawing after the page came back");
    });

    await check("no page errors with the beam saver", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

{
  const second = await open({ crtEnabled: false });
  const { browser, page, errors } = second;
  try {
    await check("with the CRT off, the plate bounces instead and the page stays put", async () => {
      await page.clock.fastForward(IDLE_MS + 500);
      await page.clock.runFor(500);
      const state = await page.evaluate(() => ({
        crtOff: document.documentElement.classList.contains("crt-off"),
        saving: document.documentElement.classList.contains("is-saving"),
        plate: !!document.querySelector(".saver__plate"),
      }));
      assert.equal(state.crtOff, true, `the CRT setting did not take (${JSON.stringify({ ...state, ready: second.ready })})`);
      assert.equal(state.plate, true);
      assert.equal(state.saving, false);
    });
    await check("no page errors with the plate", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} saver checks passed.`);
process.exitCode = failed ? 1 : 0;
