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
      window.__polishKeys = [];
      for (const type of ["focusin", "keydown"]) document.addEventListener(type, event => {
        window.__polishKeys.push({ type, key: event.key, target: event.target?.className,
          room: !!document.querySelector(".arcade-room"), at: performance.now() });
        if (window.__polishKeys.length > 40) window.__polishKeys.shift();
      }, true);
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

    await press(page.locator(".term__input"));
    assert.equal(await page.locator(".shell").count(), 1);
    await press(page.locator(".statusbar__prompt"));
    await page.locator(".shell").waitFor({ state: "detached" });
    await press(page.locator(".statusbar__prompt"));
    assert.match(await page.locator(".term__scroll").innerText(), /gravity/);
    // A real outside click must dismiss without requiring a second press.
    await press(page.locator(".page__title"));
    await page.locator(".shell").waitFor({ state: "detached" });
    await press(page.locator(".statusbar__prompt"));
    assert.match(await page.locator(".term__scroll").innerText(), /gravity/);
    check("inside clicks preserve the drawer; handle and outside clicks dismiss it without losing history");

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

    // Enter from a closed drawer, then use the ordinary nav after the power cycle.
    // Same-route departure matters: pathname effects cannot observe that click.
    for (const destination of ["/projects", "/experience"]) {
      await page.locator(".nav__list").evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await press(door);
      await page.locator(".arcade-room").waitFor();
      await page.locator(".arcade-entrance").waitFor({ state: "detached", timeout: 12_000 });
      assert.equal(await page.locator(".nav").isVisible(), true);
      assert.equal(await door.getAttribute("aria-current"), "location");
      assert.equal(await page.locator(".arcade-room").getAttribute("aria-modal"), null);
      const roomTop = await page.locator(".arcade-room").evaluate(el => el.getBoundingClientRect().top);
      const navBottom = await page.locator(".nav").evaluate(el => el.getBoundingClientRect().bottom);
      assert(roomTop >= navBottom);
      // A click inside the portal must leave its Terminal owner mounted.
      await press(page.locator(".arcade-cabinet").first());
      await page.locator(".arcade-start").waitFor();
      assert.equal(await page.locator(".arcade-room").count(), 1);
      await page.locator(".nav__list").evaluate(el => { el.scrollLeft = 0; });
      await press(page.locator(`.nav__link[href="${destination}"]`));
      await page.waitForURL(`${base}${destination}`);
      await page.locator(".arcade-room").waitFor({ state: "detached" });
      await page.waitForFunction(() => !document.documentElement.classList.contains("scroll-locked"));
      assert.equal(await page.locator(".shell").count(), 0);
      assert.equal(await page.locator("main").isVisible(), true);
      check("ordinary navigation exits the arcade and releases its host", { destination });
    }
    await page.locator(".nav__list").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await press(door);
    await page.locator(".arcade-room").waitFor();
    await page.goBack();
    await page.waitForURL(`${base}/projects`);
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.documentElement.classList.contains("scroll-locked"));
    check("browser history also releases the arcade during its entrance");

    // The same pathname can be a different view, as on /contact?meet=coffee.
    // A native history entry gives this check its own query without depending
    // on contact copy or creating a meeting request.
    await page.evaluate(() => window.history.pushState(window.history.state, "", "?chrome-history=1"));
    await page.waitForURL(`${base}/projects?chrome-history=1`);
    for (const direction of ["back", "forward"]) {
      await page.locator(".nav__list").evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await press(door);
      await page.locator(".arcade-room").waitFor();
      if (direction === "back") await page.goBack();
      else await page.goForward();
      await page.waitForURL(`${base}/projects${direction === "forward" ? "?chrome-history=1" : ""}`);
      await page.locator(".arcade-room").waitFor({ state: "detached" });
      await page.waitForFunction(() => !document.documentElement.classList.contains("scroll-locked"));
      assert.equal(await page.locator(".shell").count(), 0);
      check("query-only history exits the arcade and releases scroll", { direction });
    }
    // A listener left behind by the room would close an ordinary drawer now.
    await press(page.locator(".statusbar__prompt"));
    await page.locator(".shell .term__input").waitFor();
    await page.goBack();
    await page.waitForURL(`${base}/projects`);
    assert.equal(await page.locator(".shell").count(), 1);
    await press(page.locator(".shell__close"));
    check("leaving the room removes its history listener");

    const geometry = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const controls = [...document.querySelectorAll(".machine__btn, .statusbar__prompt")].map(el => {
        const r = el.getBoundingClientRect();
        const label = el.querySelector(".machine__label, .statusbar__prompt-label");
        const l = label.getBoundingClientRect();
        return { text: label.textContent, x: r.x, right: r.right, width: r.width, height: r.height, labelWidth: l.width, labelHeight: l.height };
      });
      return { bar: rect(".statusbar"), prompt: rect(".statusbar__prompt"), controls, width: innerWidth, height: innerHeight };
    });
    if (device.hasTouch) {
      assert(geometry.prompt.width >= 44 && geometry.prompt.height >= 44);
      assert(geometry.controls.every(c => c.width >= 44 && c.height >= 44));
      assert(geometry.prompt.bottom <= geometry.height + 1);
    }
    assert(geometry.controls.every(c => c.x >= 0 && c.right <= geometry.width && c.labelWidth > 10 && c.labelHeight > 10));
    for (let i = 1; i < geometry.controls.length; i++) assert(geometry.controls[i - 1].right <= geometry.controls[i].x + 1);
    check("status controls keep visible labels and fit without overlap", geometry);

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
    await press(page.locator(".statusbar__prompt"));
    const outsideField = page.locator('.cform__input[name="name"]');
    await press(outsideField);
    await page.locator(".shell").waitFor({ state: "detached" });
    assert.equal(await outsideField.evaluate(el => document.activeElement === el), true);
    check("outside dismissal lets the clicked contact field keep focus");

    // No mail is sent. Reduced motion also gives an instant home load so the
    // browser proof does not conflate timer throttling with the boot profile.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await press(page.locator(".statusbar__prompt"));
    assert.equal(await page.locator(".shell").count(), 1);
    assert.equal(await page.locator(".term").count(), 1);
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    if (device.hasTouch) {
      const targets = await page.locator(".term__input, .term__label, .term__hint, .contact__row a").evaluateAll(els => els.map(el => ({ tag: el.className || el.tagName, height: el.getBoundingClientRect().height })));
      assert(targets.every(el => el.height >= 44), JSON.stringify(targets));
      check("home terminal and contact targets have a thumb's height", targets);
    }
    await command("cd arcade");
    assert.equal(await page.locator(".arcade-room").count(), 0);
    check("home has one drawer and reduced motion retains the arcade refusal");
    await page.screenshot({ path: join(out, `${name}-home.png`) });

    // Observe a real cold boot without skipping or speeding up its timers.
    // Assert the selected script; record elapsed time rather than pretending
    // timer scheduling on a busy host is a production performance guarantee.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => sessionStorage.removeItem("fergusos_booted"));
    await page.addInitScript(() => {
      window.__polishBoot = { started: null, finished: null, text: "", visibility: [document.visibilityState] };
      document.addEventListener("visibilitychange", () => window.__polishBoot.visibility.push(document.visibilityState));
      new MutationObserver(() => {
        const state = window.__polishBoot;
        const boot = document.querySelector(".boot");
        if (boot) {
          state.started ??= performance.now();
          const text = boot.textContent || "";
          if (text.length > state.text.length) state.text = text;
        } else if (state.started !== null && state.finished === null) state.finished = performance.now();
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.bringToFront();
    await page.waitForFunction(() => window.__polishBoot.finished !== null, null, { timeout: 40_000 });
    const boot = await page.evaluate(() => ({ ...window.__polishBoot, hidden: document.documentElement.classList.contains("booting") }));
    assert.equal(boot.hidden, false);
    const elapsedMs = Math.round(boot.finished - boot.started);
    const completed = /checking\s+caffeine reserves/.test(boot.text);
    if (completed) {
      assert.equal(boot.text.includes("CPU: Trinity"), !device.hasTouch);
      check("cold boot completes with the phone or desktop script", { elapsedMs, phone: !!device.hasTouch, visibility: boot.visibility });
    } else {
      // Background timer clamping is explicitly unbounded (lib/boot.ts). A
      // 20-second watchdog reveal is valid, but must never be reported as a
      // completed animation or as a timing measurement of the short profile.
      assert(elapsedMs >= 19_500, `boot ended early: ${JSON.stringify(boot)}`);
      check("stalled cold boot recovers through its watchdog", { elapsedMs, visibility: boot.visibility });
    }
    assert.deepEqual(errors, []);
    result.passed = true;
  } catch (error) {
    result.keys = await page.evaluate(() => window.__polishKeys).catch(() => []);
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

const only = option("--profile", "");
assert(["", "webkit-390", "webkit-320", "chromium-desktop"].includes(only), `Unknown browser profile: ${only}`);
if (!only || only === "webkit-390") await run("webkit-390", webkit, { ...devices["iPhone 13"] });
if (!only || only === "webkit-320") await run("webkit-320", webkit, { ...devices["iPhone 13"], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 });
if (!only || only === "chromium-desktop") await run("chromium-desktop", chromium, { viewport: { width: 1440, height: 900 } });
process.exitCode = results.every(result => result.passed) ? 0 : 1;
