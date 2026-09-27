/**
 * The 404 page in a real browser: the status, the heading, the path the visitor
 * asked for, the test card and a way home.
 *
 * Kept out of scripts/phone-check.mjs on purpose: that instrument reads a 4xx
 * document as a broken asset, which is the right call everywhere except here.
 *
 *   REVISION_BASE=http://localhost:3000 node scripts/not-found-check.mjs
 */
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3000";
const missing = "/no-such-channel";
for (const [engine, width] of [[chromium, 1440], [webkit, 390]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 500 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const response = await page.goto(base + missing, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 404, "a missing page answers 404");
    assert.equal((await page.locator("h1").innerText()).trim().toLowerCase(), "no signal");
    await page.locator(".nosignal__missing").waitFor();
    assert.match(await page.locator(".nosignal__missing").innerText(), /cd \/no-such-channel: no such directory/);
    assert.equal(await page.locator(".nosignal__card").count(), 1);
    const home = page.locator(".nosignal__links a").first();
    assert.equal(await home.getAttribute("href"), "/");
    const box = await home.boundingBox();
    assert.ok(box && box.height >= 44, "the way home is a full-size target");
    assert.deepEqual(errors, []);
    console.log(`not-found ${width}: 404, heading, path, card and links`);
  } finally {
    await browser.close();
  }
}
