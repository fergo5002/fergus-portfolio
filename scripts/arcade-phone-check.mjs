#!/usr/bin/env node

/**
 * The ordinary phone check discovers routes from the sitemap. The arcade must
 * stay out of that sitemap, so this committed check walks through its hidden
 * terminal command instead. It is intentionally a user flow, not a direct URL.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { devices, webkit } from "playwright";

const baseArg = process.argv.indexOf("--base");
const outArg = process.argv.indexOf("--out");
const base = baseArg >= 0 ? process.argv[baseArg + 1] : "http://localhost:3000";
const out = resolve(outArg >= 0 ? process.argv[outArg + 1] : ".phone-check/arcade");
const route = "/writing/why-presterly-wound-down";

await mkdir(out, { recursive: true });

const failures = [];
const browser = await webkit.launch();

async function openArcade(page, command = "cd arcade") {
  await page.locator(".statusbar__prompt").click();
  const input = page.locator(".term__input");
  await input.fill(command);
  await input.press("Enter");
  await page.locator(".arcade__grid").waitFor({ state: "visible" });
}

async function inspect(page) {
  return page.locator(".arcade__grid").evaluate((grid) => {
    const exit = document.querySelector(".arcade__exit");
    const style = getComputedStyle(grid);
    const exitRect = exit?.getBoundingClientRect();
    const lines = (grid.textContent ?? "").split("\n");
    return {
      cols: Number(grid.dataset.cols),
      rows: Number(grid.dataset.rows),
      fontPx: Number.parseFloat(style.fontSize),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridOverflow: grid.scrollWidth - grid.clientWidth,
      exitWidth: exitRect?.width ?? 0,
      exitHeight: exitRect?.height ?? 0,
      lineLengths: lines.map((line) => line.length),
      text: grid.textContent ?? "",
    };
  });
}

function requireThat(condition, message) {
  if (!condition) failures.push(message);
}

try {
  const context = await browser.newContext({
    ...devices["iPhone 12"],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const source = message.location().url;
    if (source.includes("/api/board") || source.includes("/_vercel/insights/script.js")) return;
    consoleErrors.push(source ? `${text} (${source})` : text);
  });

  await page.goto(base + route, { waitUntil: "networkidle" });
  await openArcade(page);
  const cabinet390 = await inspect(page);
  requireThat(cabinet390.cols === 40 && cabinet390.rows === 18, `390 cabinet was ${cabinet390.cols}x${cabinet390.rows}`);
  requireThat(cabinet390.fontPx >= 11, `390 font was ${cabinet390.fontPx}px`);
  requireThat(cabinet390.documentOverflow <= 0, `390 document overflowed by ${cabinet390.documentOverflow}px`);
  requireThat(cabinet390.gridOverflow <= 0, `390 grid overflowed by ${cabinet390.gridOverflow}px`);
  requireThat(cabinet390.exitWidth >= 44 && cabinet390.exitHeight >= 44, `390 exit was ${cabinet390.exitWidth}x${cabinet390.exitHeight}`);
  requireThat(cabinet390.lineLengths.length === 18 && cabinet390.lineLengths.every((n) => n === 40), "390 grid lines did not match its measured size");

  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("ArrowDown");
  const cabinetAfterKey = await inspect(page);
  requireThat(cabinetAfterKey.text !== cabinet390.text, "ArrowDown did not move the cabinet cursor");
  requireThat(await page.evaluate(() => window.scrollY) === scrollBefore, "ArrowDown scrolled the page under the arcade");

  await page.keyboard.press("Escape");
  await page.locator(".term__input").waitFor({ state: "visible" });
  requireThat((await page.locator(".term__scroll").textContent())?.includes("cd arcade"), "Escape lost the arcade command from scrollback");
  requireThat(await page.locator("#shell-drawer").isVisible(), "Escape closed the drawer instead of only leaving the arcade");

  const input = page.locator(".term__input");
  await input.fill("cd arcade bounce");
  await input.press("Enter");
  await page.locator(".arcade__grid").waitFor({ state: "visible" });
  requireThat((await inspect(page)).text.includes("O"), "Bounce did not draw before its first tick");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForFunction(() => document.querySelector(".arcade__grid")?.getAttribute("data-cols") === "32");
  const bounce320 = await inspect(page);
  requireThat(bounce320.cols === 32 && bounce320.rows === 16, `resized Bounce was ${bounce320.cols}x${bounce320.rows}`);
  requireThat(bounce320.text.includes("O"), "Bounce left the visible world after resize");
  requireThat(bounce320.lineLengths.length === 16 && bounce320.lineLengths.every((n) => n === 32), "resized Bounce lines did not match its measured size");
  requireThat(bounce320.documentOverflow <= 0 && bounce320.gridOverflow <= 0, "resized Bounce overflowed at 320px");

  await page.keyboard.press("Escape");
  await page.locator(".term__input").waitFor({ state: "visible" });
  requireThat(await page.locator(".term__input").evaluate((node) => node === document.activeElement), "Escape did not restore prompt focus");
  requireThat(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);

  if (failures.length) await page.screenshot({ path: resolve(out, "arcade-failure.png"), fullPage: true });
  await context.close();

  const reduced = await browser.newContext({
    ...devices["iPhone 12"],
    viewport: { width: 320, height: 568 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(base + route, { waitUntil: "networkidle" });
  await reducedPage.locator(".statusbar__prompt").click();
  await reducedPage.locator(".term__input").fill("cd arcade");
  await reducedPage.locator(".term__input").press("Enter");
  requireThat(await reducedPage.locator(".arcade__grid").count() === 0, "reduced motion still opened the arcade grid");
  requireThat((await reducedPage.locator(".term__scroll").textContent())?.includes("reduced motion"), "reduced-motion refusal was not printed");
  await reduced.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("arcade-phone-check: FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("arcade-phone-check: passed at 390px, after an in-place resize to 320px, and with reduced motion");
}
