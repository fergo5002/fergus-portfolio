#!/usr/bin/env node
/**
 * The arcade room scrolls under a real mouse wheel.
 *
 * On 2026-09-05 the room did not. Lenis was stopped for the document behind
 * it, and a stopped Lenis cancels every wheel event it sees unless an ancestor
 * of the target carries `data-lenis-prevent`. Measured on the release build:
 * a control wheel moved the document 599px, five wheel ticks inside the room
 * moved it 0px, PageDown moved it 538px. This drives the same three readings
 * through a real Chromium wheel and fails if the room does not move.
 *
 * The control reading comes first, because a wheel that moves nothing on the
 * page is a broken instrument, not a broken room.
 *
 *   node scripts/arcade-scroll-check.mjs [--base http://localhost:3000]
 *   node scripts/arcade-scroll-check.mjs --expect-broken   (the revert-to-confirm run)
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option("--base", process.env.ARCADE_BASE || "http://localhost:3000");
const expectBroken = args.includes("--expect-broken");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const out = {};
try {
  await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(700);
  out.controlScrollY = await page.evaluate(() => window.scrollY);
  if (out.controlScrollY < 100) throw new Error(`instrument: a wheel on the page moved it ${out.controlScrollY}px, so nothing below is evidence`);

  await page.locator(".statusbar__prompt").click();
  await page.locator(".term__input").fill("cd arcade");
  await page.locator(".term__input").press("Enter");
  await page.locator(".arcade-room").waitFor();
  await page.getByRole("button", { name: /skip/i }).click();
  await page.locator(".arcade-cabinet").first().waitFor();
  await page.waitForTimeout(500);
  out.lenisStopped = await page.evaluate(() => document.documentElement.classList.contains("lenis-stopped"));
  out.roomBefore = await page.locator(".arcade-room").evaluate((r) => ({ scrollTop: r.scrollTop, scrollHeight: r.scrollHeight, clientHeight: r.clientHeight }));
  if (out.roomBefore.scrollHeight <= out.roomBefore.clientHeight) throw new Error("the room has nothing to scroll at 1280x720, so the check cannot run");
  await page.mouse.move(640, 420);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  out.roomAfterWheel = await page.locator(".arcade-room").evaluate((r) => r.scrollTop);
  out.documentAfterWheel = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(500);
  out.roomAfterPageDown = await page.locator(".arcade-room").evaluate((r) => r.scrollTop);
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));

  if (!out.lenisStopped) throw new Error("Lenis was not stopped behind the room, so this run did not test the failure it exists for");
  if (expectBroken) {
    if (out.roomAfterWheel !== 0) throw new Error(`expected the room to stay put without the fix, but it moved ${out.roomAfterWheel}px`);
    console.log("as expected without data-lenis-prevent: the wheel moved the room 0px");
  } else {
    if (out.roomAfterWheel < 200) throw new Error(`the wheel moved the room ${out.roomAfterWheel}px; it should scroll`);
    // Lenis settles its own smoothing by a pixel after the control wheel; a leak is hundreds of pixels.
    if (Math.abs(out.documentAfterWheel - out.controlScrollY) > 2) throw new Error(`the wheel leaked to the document behind the room (${out.controlScrollY} -> ${out.documentAfterWheel})`);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`the room scrolls: wheel ${out.roomAfterWheel}px, PageDown ${out.roomAfterPageDown}px, document held at ${out.documentAfterWheel}px`);
  }
} finally {
  await browser.close();
}
