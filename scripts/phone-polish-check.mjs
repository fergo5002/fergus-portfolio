#!/usr/bin/env node
/** Browser regressions for the recovered phone-polish work. Local synthetic interactions only. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, devices } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option("--base", "http://127.0.0.1:3116");
const out = option("--out", ".phone-check/polish");
await mkdir(out, { recursive: true });
const results = [];

async function run(name, engine, device) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...device, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const result = { name, checks: [], errors };
  let delayScripts = true;
  const check = (label, evidence) => { result.checks.push({ label, evidence }); console.log(`PASS ${name}: ${label}`); };
  const press = async locator => device.hasTouch ? locator.tap() : locator.click();
  const command = async text => {
    const input = page.locator(".term__input");
    await input.fill(text);
    await input.press("Enter");
  };
  try {
    // Hold app scripts back after the server text has arrived. This exercises the
    // original visible-text-then-scramble failure, including its scrolled-past case.
    await page.route("**/_next/**/*.js", async route => {
      if (delayScripts) await new Promise(resolve => setTimeout(resolve, 900));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__polishTitles = [];
      let previous = "";
      const observer = new MutationObserver(() => {
        const text = document.querySelector(".page__title")?.textContent;
        if (text && text !== previous) { window.__polishTitles.push(text); previous = text; }
      });
      observer.observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto(`${base}/experience`, { waitUntil: "commit" });
    await page.locator(".page__title").waitFor();
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelector(".raster.is-revealed"));
    await page.waitForTimeout(500);
    const load = await page.evaluate(() => ({
      titles: window.__polishTitles,
      hiddenSeen: [...document.querySelectorAll(".raster")].filter(el => el.getBoundingClientRect().top < innerHeight && getComputedStyle(el).opacity === "0").length,
    }));
    assert.deepEqual(load.titles, ["experience"]);
    assert.equal(load.hiddenSeen, 0);
    check("slow hard load keeps the title and already seen blocks readable", load);
    delayScripts = false;

    await press(page.locator('.nav__link[href="/projects"]'));
    await page.waitForURL(`${base}/projects`);
    await page.waitForFunction(() => document.documentElement.classList.contains("navigated"));
    await page.waitForFunction(() => document.querySelector(".page__title")?.textContent === "projects");
    check("real in-site navigation still enables reveals", await page.locator("main").getAttribute("tabindex"));

    const nav = await page.locator(".nav__list").evaluate(el => {
      const before = window.scrollY;
      el.scrollLeft = el.scrollWidth;
      return { before, width: el.clientWidth, scrollWidth: el.scrollWidth };
    });
    await page.waitForTimeout(250);
    const door = page.locator(".nav__link--cmd");
    const box = await door.boundingBox();
    assert(box && box.x >= -1 && box.x + box.width <= device.viewport.width + 1);
    assert.equal(await page.evaluate(() => window.scrollY), nav.before);
    check("the final nav control is reachable without moving the page", { nav, box });

    await press(page.locator(".statusbar__prompt"));
    await page.locator(".shell .term__input").waitFor();
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    await command("help");
    await page.waitForFunction(() => document.querySelector(".term__scroll")?.textContent?.includes("gravity"));
    const help = (await page.locator(".term__entry").last().locator(".term__out").allTextContents()).join("\n");
    if (device.hasTouch) assert.match(help, /\n    gravity\n      /);
    check("drawer opens with focus and help uses the available width", { narrow: !!device.hasTouch });
    await page.screenshot({ path: join(out, `${name}-help.png`) });

    // The already-open drawer must remain mounted when its terminal receives
    // the nav request. A toggle here used to risk removing the arcade host.
    await press(door);
    await page.locator(".arcade-room").waitFor();
    assert.equal(await page.locator(".arcade-room").count(), 1);
    await page.keyboard.press("Escape");
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    check("nav arcade entry from an open drawer and Escape restore the terminal");
    await press(page.locator(".shell__close"));

    const geometry = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return { bar: rect(".statusbar"), prompt: rect(".statusbar__prompt"), machine: rect(".machine"), readouts: rect(".statusbar__readouts"), width: innerWidth, height: innerHeight };
    });
    if (device.hasTouch) {
      assert(geometry.prompt.width >= 44 && geometry.prompt.height >= 44);
      assert(geometry.readouts.right <= geometry.machine.x + 1);
      assert(geometry.machine.right <= geometry.prompt.x + 1);
      assert(geometry.prompt.bottom <= geometry.height + 1);
    }
    check("status controls fit without overlapping the readouts", geometry);

    await page.goto(`${base}/contact`, { waitUntil: "networkidle" });
    await press(page.locator(".cform__submit"));
    // WebKit pans towards the invalid field asynchronously after focusing it.
    // Wait for that native movement, without scrolling or focusing it ourselves.
    await page.waitForTimeout(1200);
    const invalid = await page.evaluate(() => {
      const field = document.querySelector(".cform__input:invalid");
      const r = field?.getBoundingClientRect();
      return { top: r?.top, navBottom: document.querySelector(".nav").getBoundingClientRect().bottom, invalid: !!field };
    });
    assert(invalid.invalid && invalid.top >= invalid.navBottom, JSON.stringify(invalid));
    if (device.hasTouch) {
      const fields = await page.locator(".cform__input, .cform__label").evaluateAll(els => els.map(el => ({
        tag: el.tagName, height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize),
      })));
      assert(fields.every(el => el.height >= 44 && (el.tag === "LABEL" || el.font >= 16)), JSON.stringify(fields));
      check("contact fields resist iOS zoom and fields/labels have a thumb's height", fields);
    }
    check("native validation leaves the invalid field below the fixed nav", invalid);
    await page.screenshot({ path: join(out, `${name}-contact.png`) });

    // No mail is sent. Reduced motion also gives an instant home load so the
    // browser proof does not conflate timer throttling with the boot profile.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await press(page.locator(".statusbar__prompt"));
    assert.equal(await page.locator(".shell").count(), 0);
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    if (device.hasTouch) {
      const targets = await page.locator(".term__input, .term__label, .term__hint, .contact__row a").evaluateAll(els => els.map(el => ({ tag: el.className || el.tagName, height: el.getBoundingClientRect().height })));
      assert(targets.every(el => el.height >= 44), JSON.stringify(targets));
      check("home terminal and contact targets have a thumb's height", targets);
    }
    await command("cd arcade");
    assert.equal(await page.locator(".arcade-room").count(), 0);
    check("reduced motion retains the arcade refusal and inline prompt");
    await page.screenshot({ path: join(out, `${name}-home.png`) });
    assert.deepEqual(errors, []);
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.failure = error.stack;
    console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: join(out, `${name}-failure.png`) }).catch(() => {});
  } finally {
    results.push(result);
    await page.unrouteAll({ behavior: "wait" });
    await browser.close();
    await writeFile(join(out, "report.json"), JSON.stringify(results, null, 2));
  }
}

await run("webkit-390", webkit, { ...devices["iPhone 13"] });
await run("webkit-320", webkit, { ...devices["iPhone 13"], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 });
await run("chromium-desktop", chromium, { viewport: { width: 1440, height: 900 } });
process.exitCode = results.every(result => result.passed) ? 0 : 1;
