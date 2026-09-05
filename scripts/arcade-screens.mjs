#!/usr/bin/env node
/**
 * Screenshots of every arcade screen, for reading by eye. Not a gate: the
 * gates are the other arcade scripts. This exists because a check that
 * passes says nothing about whether the thing is beautiful, and the only way
 * to know that is to look.
 *
 *   node scripts/arcade-screens.mjs [--base http://localhost:3210] [--out .phone-check/arcade-screens]
 */
import { chromium, webkit, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option("--base", process.env.ARCADE_BASE || "http://localhost:3210");
const out = resolve(option("--out", ".phone-check/arcade-screens"));
await mkdir(out, { recursive: true });

async function enter(page, tap = false) {
  // The prompt toggles the drawer: open it only if the input is not already there.
  if (!(await page.locator(".term__input").count())) {
    const prompt = page.locator(".statusbar__prompt");
    if (tap) await prompt.tap(); else await prompt.click();
  }
  await page.locator(".term__input").fill("cd arcade");
  await page.locator(".term__input").press("Enter");
  await page.locator(".arcade-room").waitFor();
}

async function desktop(theme) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference", deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => page.screenshot({ path: resolve(out, `${theme}-${name}.png`) });
  try {
    await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
    if (theme !== "green") {
      await page.locator(".statusbar__prompt").click();
      await page.locator(".term__input").fill(`theme ${theme}`);
      await page.locator(".term__input").press("Enter");
      await page.waitForTimeout(600);
      await page.locator(".term__input").fill("cd arcade");
      await page.locator(".term__input").press("Enter");
      await page.locator(".arcade-room").waitFor();
    } else {
      await enter(page);
    }
    // The entrance, three moments: the channel loss, the dark tube, the BIOS.
    await page.waitForTimeout(300);
    await shot("entrance-1-static");
    await page.waitForTimeout(1000);
    await shot("entrance-2-collapse");
    await page.waitForTimeout(1600);
    await shot("entrance-3-bios");
    await page.locator(".arcade-entrance").waitFor({ state: "hidden", timeout: 15000 });
    await page.waitForTimeout(1700);
    await shot("gallery");
    await page.waitForTimeout(9000);
    await shot("gallery-attract-later");
    await page.locator(".arcade-room").evaluate((r) => (r.scrollTop = r.scrollHeight));
    await page.waitForTimeout(400);
    await shot("gallery-bottom");
    await page.locator(".arcade-room").evaluate((r) => (r.scrollTop = 0));
    await page.getByRole("button", { name: /hall of fame/i }).click();
    await page.waitForTimeout(800);
    await shot("hall-of-fame");
    await page.getByRole("button", { name: /all cabinets/i }).first().click();
    await page.locator(".arcade-cabinet[data-game=bounce]").click();
    await page.waitForTimeout(900);
    await shot("detail-bounce");
        await page.getByRole("button", { name: /start solo run/i }).click();
    await page.locator(".arcade-stage").focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(2500);
    await shot("play-bounce");
    await page.getByRole("button", { name: /^pause$/i }).click();
    await page.waitForTimeout(300);
    await shot("play-paused");
    await page.getByRole("button", { name: /all cabinets/i }).first().click();
    // Circuit Poker to a result, by banking every hand.
    await page.locator(".arcade-cabinet[data-game=poker]").click();
    await page.getByRole("button", { name: /start solo run/i }).click();
    await page.locator(".arcade-stage").focus();
    await page.waitForTimeout(600);
    for (let i = 0; i < 32 && !(await page.locator(".arcade-results").count()); i++) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(350);
    }
    await page.getByRole("region", { name: "Run result" }).waitFor();
    await page.waitForTimeout(500);
    await shot("result-poker");
    await page.keyboard.press("Escape");
    await page.locator(".term__input").waitFor();
    await page.waitForTimeout(400);
    await shot("after-exit");
    // Re-entry: the short form.
    await enter(page);
    await page.waitForTimeout(250);
    await shot("reentry-static");
    await page.locator(".arcade-entrance").waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForTimeout(700);
    await shot("reentry-gallery");
    console.log(`${theme}: done, errors: ${errors.length ? errors.join("; ") : "none"}`);
  } finally {
    await browser.close();
  }
}

async function phone() {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPhone 12"], viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => page.screenshot({ path: resolve(out, `phone-${name}.png`) });
  try {
    await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
    await enter(page, true);
    await page.waitForTimeout(2900);
    await shot("entrance-bios");
    await page.locator(".arcade-entrance").waitFor({ state: "hidden", timeout: 15000 });
    await page.waitForTimeout(1700);
    await shot("gallery");
    await page.getByRole("button", { name: /fame/i }).tap();
    await page.waitForTimeout(700);
    await shot("hall-of-fame");
    await page.getByRole("button", { name: /all cabinets/i }).first().tap();
    await page.locator(".arcade-cabinet[data-game=signal]").tap();
    await page.waitForTimeout(800);
    await shot("detail-signal");
    await page.getByRole("button", { name: /start solo run/i }).tap();
    await page.locator(".arcade-canvas").waitFor();
    await page.waitForTimeout(2000);
    await shot("play-signal");
    console.log(`phone: done, errors: ${errors.length ? errors.join("; ") : "none"}`);
  } finally {
    await browser.close();
  }
}

const only = option("--only", "green,amber,phone").split(",");
if (only.includes("green")) await desktop("green");
if (only.includes("amber")) await desktop("amber");
if (only.includes("phone")) await phone();
