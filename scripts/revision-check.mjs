/** Changed journeys only. Use synthetic contact details; send only with --send. */
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

const base = process.env.REVISION_BASE || "http://localhost:3210";
const out = ".revision-check";
const send = process.argv.includes("--send");
await mkdir(out, { recursive: true });
const probe = await readFile("C:/Users/oreil/.claude/scripts/instrument-check.js", "utf8").catch(() => null);
for (const [width, engine] of [[1440, chromium], [390, webkit], [320, webkit]]) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
  // The instrument flags declared unicode subsets too. Load them explicitly
  // for the probe so an unused subset cannot be confused with missing text.
  await page.evaluate(async () => { await Promise.all([...document.fonts].map(face => face.load().catch(() => null))); });
  if (probe) console.log(width, "instrument", await page.evaluate(probe));
  assert.match(await page.locator(".hero__tagline").innerText(), /I build things\. Then I scale them\./);
  assert.equal(await page.locator("main .term").count(), 0);
  assert.equal(await page.locator(".skills").count(), 0);
  assert.equal(await page.locator(".about__routes a").count(), 2);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "home overflow");
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${out}/${width}-home.png`, fullPage: true });
  if (width > 500) {
    await page.locator(".work-preview__link").filter({ hasText: "CTO @ Presterly" }).hover();
    assert.equal(await page.locator(".work-preview__panel").nth(1).evaluate(el => getComputedStyle(el).visibility), "visible");
    await page.screenshot({ path: `${out}/${width}-preview.png` });
  }
  for (const kind of ["coffee", "call"]) {
    await page.goto(`${base}/contact?meet=${kind}`, { waitUntil: "networkidle" });
    await page.locator(".meeting__picker:not([inert])").waitFor();
    await page.locator(".meeting__slots button:not(:disabled)").first().click();
    await page.locator("#meeting-name").fill("Fergus portfolio verification");
    await page.locator("#meeting-email").fill("oreillferg@gmail.com");
    await page.locator("#meeting-note").fill("Website release verification. This is a test request, no meeting needed.");
    assert.equal(await page.locator(".meeting__submit button").isEnabled(), true);
    const sizes = await page.locator(".meeting__days button:not(:disabled), .meeting__slots button:not(:disabled)").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
    assert.ok(sizes.every(r => r.width >= 43.9 && r.height >= 43.9), JSON.stringify(sizes));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "body overflow");
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `${out}/${width}-${kind}.png`, fullPage: true });
    if (send && width === 1440 && kind === "coffee") {
      await page.locator(".meeting__submit button").click();
      await page.getByRole("heading", { name: "Request sent." }).waitFor();
      console.log("Provider accepted the live meeting request. Mailbox receipt not checked here.");
    } else if (!base.startsWith("https://")) {
      await page.locator(".meeting__submit button").click();
      await page.getByText("That didn't send. Your details are still here.", { exact: false }).waitFor();
      assert.equal(await page.locator("#meeting-note").inputValue(), "Website release verification. This is a test request, no meeting needed.");
      assert.ok(await page.locator("input[name=slot]").inputValue());
    }
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(`${width}: home, previews, calendar selection, fields and bounds passed`);
}

{
  const browser = await chromium.launch();
  const context = await browser.newContext();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await context.route("**/_next/**/*.js*", async route => { await gate; await route.continue(); });
  const page = await context.newPage();
  await page.goto(`${base}/contact?meet=coffee`, { waitUntil: "commit" });
  await page.locator("select[name=slot]").waitFor();
  const chosen = await page.locator("select[name=slot] option:not(:disabled)").nth(1).getAttribute("value");
  await page.locator("select[name=slot]").selectOption(chosen);
  await page.locator("#meeting-name").fill("Already chosen before hydration");
  release();
  await page.locator(".meeting__picker:not([inert])").waitFor();
  assert.equal(await page.locator("input[name=slot]").inputValue(), chosen);
  assert.equal(await page.locator("#meeting-name").inputValue(), "Already chosen before hydration");
  assert.equal(await page.locator(".meeting__submit button").isEnabled(), true);
  await browser.close();
  console.log("Delayed hydration retains an already selected meeting time and entered name");
}

if (!base.startsWith("https://")) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto(`${base}/contact?meet=call`);
  const option = await page.locator("select[name=slot] option:not(:disabled)").first().getAttribute("value");
  await page.locator("select[name=slot]").selectOption(option);
  await page.locator("#meeting-name").fill("No JavaScript verification");
  await page.locator("#meeting-email").fill("visitor@example.com");
  await page.locator("#meeting-note").fill("Keep this note after a failed send.");
  // Exercise native keyboard submission. With page scripts disabled, Chromium's
  // frame-based pointer stability check can stall whilst scrolling this form.
  // A real Tab/Enter still goes through native validation and the form POST.
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(".meeting__submit button").evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Enter");
  await page.getByText("That didn't send. Your details are still here.", { exact: false }).waitFor();
  assert.equal(await page.locator("#meeting-note").inputValue(), "Keep this note after a failed send.");
  assert.equal(await page.locator("select[name=slot]").inputValue(), option);
  await browser.close();
  console.log("No-JavaScript meeting POST and field preservation passed");
}
