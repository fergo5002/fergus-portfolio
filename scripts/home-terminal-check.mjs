/** The homepage shell and drawer share history; only the drawer owns arcade. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3213";
const out = ".revision-check/home-terminal";
await mkdir(out, { recursive: true });
const probe = await readFile("C:/Users/oreil/.claude/scripts/instrument-check.js", "utf8").catch(() => null);
for (const [width, engine] of [[1440, chromium], [390, webkit], [320, webkit]]) {
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const command = async (selector, text) => {
    await page.locator(selector).fill(text);
    await page.locator(selector).press("Enter");
  };
  try {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
    await page.evaluate(async () => { await Promise.all([...document.fonts].map(face => face.load().catch(() => null))); });
    if (probe) console.log(width, "instrument", await page.evaluate(probe));
    assert.equal(await page.locator("main .term--inline").count(), 1, "shell restored below About");
    assert.equal(await page.locator(".meeting-card").count(), 0, "home has only the contact button");
    assert.equal(await page.locator(".contact-invitation").innerText(), "Get in touch");
    const order = await page.evaluate(() => {
      const about = document.querySelector(".about").getBoundingClientRect();
      const terminal = document.querySelector(".term--inline").getBoundingClientRect();
      const contact = document.querySelector(".contact-invitation").getBoundingClientRect();
      return { aboutBottom: about.bottom, terminalTop: terminal.top, terminalBottom: terminal.bottom, contactTop: contact.top };
    });
    assert(order.terminalTop >= order.aboutBottom && order.contactTop >= order.terminalBottom, JSON.stringify(order));
    const inline = ".term--inline .term__input";
    const drawer = ".shell .term__input";
    assert.equal(await page.locator(inline).evaluate(el => el === document.activeElement), false);
    await command(inline, "help");
    assert.match(await page.locator(".term--inline .term__scroll").innerText(), /gravity/);
    await command(inline, "cd arcade");
    assert.equal(await page.locator(".shell").count(), 0, "reduced motion declines inline without opening drawer");
    assert.equal(await page.locator(".arcade-room").count(), 0);
    await page.locator(".statusbar__prompt").click();
    await page.locator(drawer).waitFor();
    assert.equal(await page.locator(".term__input").count(), 2);
    const ids = await page.locator(".term__input").evaluateAll(els => els.map(el => ({ id: el.id, label: el.labels?.length, help: !!document.getElementById(el.getAttribute("aria-describedby")) })));
    assert.equal(new Set(ids.map(el => el.id)).size, 2);
    assert(ids.every(el => el.label === 1 && el.help));
    assert.match(await page.locator(".shell .term__scroll").innerText(), /gravity/);
    // The floating drawer can cover the inline input near the page bottom.
    // Dismiss with a real click in the unobscured About text first.
    await page.locator(".about__p").first().click();
    await page.locator(".shell").waitFor({ state: "detached" });
    await page.locator(inline).click();
    assert.equal(await page.locator(inline).evaluate(el => el === document.activeElement), true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await command(inline, "cd arcade poker");
    await page.locator(".arcade-room").waitFor();
    assert.equal(await page.locator(".shell .term--program").count(), 1);
    assert.equal(await page.locator(".term--inline.term--program").count(), 0);
    await page.keyboard.press("Escape");
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    assert.equal(await page.locator(drawer).evaluate(el => el === document.activeElement), true);
    await command(drawer, "history");
    const history = await page.locator(".shell .term__entry").last().locator(".term__out").allTextContents();
    assert.equal(history.filter(line => line.trim().endsWith("cd arcade poker")).length, 1, "forwarded command recorded once");
    await page.locator(".shell__close").click();
    await page.locator(".nav__list").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator(".nav__link--cmd").click();
    await page.locator(".arcade-room").waitFor();
    assert.equal(await page.locator(".shell .term--program").count(), 1, "nav request belongs to drawer");
    await page.locator(".arcade-entrance").waitFor({ state: "detached", timeout: 12000 });
    await page.locator(".nav__list").evaluate(el => { el.scrollLeft = 0; });
    await page.locator('.nav__link[href="/"]').click();
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    await page.locator(".shell").waitFor({ state: "detached" });
    assert.equal(await page.locator("main").isVisible(), true);
    assert.equal(await page.locator("html").evaluate(el => el.classList.contains("scroll-locked")), false);
    await command(inline, "whoami");
    assert.match(await page.locator(".term--inline .term__entry").last().innerText(), /Fergus/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "home overflow");
    await page.screenshot({ path: `${out}/${width}-home.png`, fullPage: true });
    for (const route of ["/projects", "/experience", "/writing", "/tools"]) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      assert.equal(await page.locator(".meeting-card").count(), 0, route);
      assert.equal(await page.locator(".contact-invitation").innerText(), "Get in touch", route);
    }
    await page.goto(`${base}/contact`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".meeting-card").count(), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "contact overflow");
    await page.screenshot({ path: `${out}/${width}-contact.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`${width}: inline shell, history, drawer, arcade ownership and contact placement passed`);
  } finally {
    await browser.close();
  }
}
