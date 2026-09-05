/** Two local Chromium contexts, real WebRTC, synthetic files. Does not prove two real networks. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3107";
const browser = await chromium.launch({ headless: true });
const contexts = await Promise.all([browser.newContext({ reducedMotion: "reduce" }), browser.newContext({ reducedMotion: "reduce" })]);
const pages = await Promise.all(contexts.map(context => context.newPage()));
const csv = ids => "First Name,Last Name,URL\n" + ids.map(id => `PeerFixture,Person ${id},https://www.linkedin.com/in/peer-fixture-${id}`).join("\n");
const errors = [];
try {
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}/tools/overlap`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByRole("button", { name: "Connect with someone" }).click();
    await page.getByRole("button", { name: "Your file", exact: true }).click();
    await page.locator("#overlap-file").setInputFiles({ name: "Connections.csv", mimeType: "text/csv", buffer: Buffer.from(csv(i === 0 ? [1,2,3,4,5,6] : [4,5,6,7,8,9])) });
    await page.getByRole("button", { name: "Same network only", exact: true }).click();
    await page.locator(".overlap__paste > summary").click();
  }
  const [a, b] = pages;
  await a.getByRole("button", { name: "Start here and send this to the other person", exact: true }).click();
  await a.waitForFunction(() => document.querySelector("textarea[readonly]")?.value.length > 0);
  await b.locator("#overlap-inbound").fill(await a.locator("textarea[readonly]").inputValue());
  await b.getByRole("button", { name: "Paste what they send back", exact: true }).click();
  await b.waitForFunction(() => document.querySelector("textarea[readonly]")?.value.length > 0);
  await a.locator("#overlap-inbound").fill(await b.locator("textarea[readonly]").inputValue());
  await a.getByRole("button", { name: "Paste what they send back", exact: true }).click();
  for (const page of pages) {
    await page.locator(".overlap__result").waitFor({ timeout: 30_000 });
    assert.equal(await page.locator(".overlap__names li").count(), 3);
  }
  assert.equal(await a.locator(".overlap__safety strong").innerText(), await b.locator(".overlap__safety strong").innerText());
  assert.deepEqual(errors, []);
  console.log("PASS manual Overlap: two Chromium contexts, three shared profiles, matching verification codes, no room server or STUN");
} catch (error) {
  for (const page of pages) console.error(await page.locator(".overlap__note").allTextContents());
  throw error;
} finally { await browser.close(); }
