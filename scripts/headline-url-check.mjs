/** Public URL form, with JavaScript enabled and disabled. No private endpoint is requested. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3107";
const browser = await chromium.launch({ headless: true });
try {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${base}/tools/headline-check`, { waitUntil: "networkidle", timeout: 60_000 });
    const input = page.getByRole("textbox", { name: "Page URL", exact: true });
    await input.fill("fergusoreilly.dev");
    await page.getByRole("button", { name: /^Check the heading/ }).click();
    await page.locator(".hcheck__report").waitFor({ timeout: 30_000 });
    assert.match(await page.locator(".hcheck__verdict-title").innerText(), /Clean/);
    assert.equal(await input.inputValue(), "fergusoreilly.dev");
    console.log(`PASS public URL form with JavaScript ${javaScriptEnabled ? "on" : "off"}; clean result and input preserved`);
    await context.close();
  }
} finally { await browser.close(); }
