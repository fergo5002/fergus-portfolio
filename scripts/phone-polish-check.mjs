#!/usr/bin/env node
/** Browser regressions for the recovered phone-polish work. Local synthetic interactions only. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The arcade's door since 2026-11-25: hold fergus@portfolio for three seconds.
 * Pointer events are dispatched rather than a real press, so a touch emulation
 * and a mouse both reach React's handlers the same way.
 */
async function holdDoor(page) {
  const prompt = page.locator(".nav__prompt");
  const init = { pointerType: "mouse", isPrimary: true, button: 0, pointerId: 1 };
  await prompt.dispatchEvent("pointerdown", init);
  await page.waitForTimeout(3300);
  await prompt.dispatchEvent("pointerup", init);
}
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
    const input = page.locator(".shell .term__input");
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
    const last = page.locator(".nav__list a").last();
    const box = await last.boundingBox();
    const door = page.locator(".nav__link--cmd");
    assert(box && box.x >= -1 && box.x + box.width <= device.viewport.width + 1);
    assert.equal(await page.evaluate(() => window.scrollY), nav.before);
    check("the final nav control is reachable without moving the page", { nav, box });

    await press(page.locator(".term-handle"));
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
    await press(page.locator(".term-handle"));
    await page.locator(".shell").waitFor({ state: "detached" });
    await press(page.locator(".term-handle"));
    assert.match(await page.locator(".term__scroll").innerText(), /gravity/);
    // A real outside click must dismiss without requiring a second press.
    await press(page.locator(".page__title"));
    await page.locator(".shell").waitFor({ state: "detached" });
    await press(page.locator(".term-handle"));
    assert.match(await page.locator(".term__scroll").innerText(), /gravity/);
    check("inside clicks preserve the drawer; handle and outside clicks dismiss it without losing history");

    // The already-open drawer must remain mounted when its terminal receives
    // the nav request. A toggle here used to risk removing the arcade host.
    await holdDoor(page);
    await page.locator(".arcade-room").waitFor();
    assert.equal(await page.locator(".arcade-room").count(), 1);
    await page.keyboard.press("Escape");
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    check("nav arcade entry from an open drawer and Escape restore the terminal");
    // textContent counts the scrollback as written. The terminal renders none of it
    // while it hosts a program, so the count is taken here, with the prompt back.
    const exits = async () => (((await page.locator(".term__scroll").textContent()) ?? "").match(/arcade: back to the prompt\./g) ?? []).length;
    const exitsSoFar = await exits();
    await press(page.locator(".shell__light--close"));

    // The room has no header of its own, so the nav's cd .. is the way out,
    // which is the only one a phone has without an Escape key (2026-09-28).
    await holdDoor(page);
    await page.locator(".arcade-room").waitFor();
    await page.locator(".arcade-entrance").waitFor({ state: "detached", timeout: 12_000 });
    assert.equal(await page.locator(".arcade-room header, .arcade-bar").count(), 0);
    assert.equal(await door.getAttribute("aria-label"), "cd .., leave the arcade");
    await press(door);
    await page.locator(".arcade-room").waitFor({ state: "detached" });
    // It leaves the way Escape does: the drawer's terminal comes back with one new exit line.
    assert.equal(await page.locator(".shell").count(), 1);
    assert.equal(await exits(), exitsSoFar + 1);
    assert.equal(await page.locator(".term__input").evaluate(el => document.activeElement === el), true);
    assert.equal(await door.count(), 0);
    await press(page.locator(".shell__light--close"));
    check("the room draws no header, and the nav's cd .. leaves it the way Escape does");

    // Enter from a closed drawer, then use the ordinary nav after the power cycle.
    // Same-route departure matters: pathname effects cannot observe that click.
    for (const destination of ["/projects", "/experience"]) {
      await holdDoor(page);
      await page.locator(".arcade-room").waitFor();
      await page.locator(".arcade-entrance").waitFor({ state: "detached", timeout: 12_000 });
      assert.equal(await page.locator(".nav").isVisible(), true);
      assert.equal(await door.count(), 1);
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
    await holdDoor(page);
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
      await holdDoor(page);
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
    await press(page.locator(".term-handle"));
    await page.locator(".shell .term__input").waitFor();
    await page.goBack();
    await page.waitForURL(`${base}/projects`);
    assert.equal(await page.locator(".shell").count(), 1);
    await press(page.locator(".shell__light--close"));
    check("leaving the room removes its history listener");

    // The status bar went on 2026-11-25; one handle in the bottom right
    // replaced it. It must be a thumb's size and sit wholly on the screen.
    const handle = await page.evaluate(() => {
      const r = document.querySelector(".term-handle").getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
    });
    assert(handle.width >= 44 && handle.height >= 44, JSON.stringify(handle));
    assert(handle.x >= 0 && handle.y >= 0 && handle.right <= handle.vw + 1 && handle.bottom <= handle.vh + 1, JSON.stringify(handle));
    check("the terminal handle is a thumb's size and inside the screen", handle);

    // /contact is two meeting cards and three boxes since 2026-11-25. Every one
    // is a thumb's height, inside the width, and nothing overlaps.
    await page.goto(`${base}/contact`, { waitUntil: "networkidle" });
    const boxes = await page.locator(".meeting-card__link, .social--boxes .social__link").evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { cls: el.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height, vw: innerWidth };
    }));
    assert.equal(boxes.length, 5, JSON.stringify(boxes));
    assert(boxes.every(b => b.height >= 44 && b.x >= 0 && b.right <= b.vw + 1), JSON.stringify(boxes));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      const overlap = p.x < q.right - 1 && q.x < p.right - 1 && p.y < q.bottom - 1 && q.y < p.bottom - 1;
      assert(!overlap, `overlap: ${JSON.stringify([p, q])}`);
    }
    check("contact's two cards and three boxes fit, a thumb high, with no overlap", boxes.map(b => Math.round(b.height)));
    await page.screenshot({ path: join(out, `${name}-contact.png`) });
    await press(page.locator(".term-handle"));
    await page.locator(".shell .term__input").waitFor();
    await press(page.locator(".page__title"));
    await page.locator(".shell").waitFor({ state: "detached" });
    check("a press outside the window minimises it");

    // No mail is sent. Reduced motion also gives an instant home load so the
    // browser proof does not conflate timer throttling with the boot profile.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await press(page.locator(".term-handle"));
    // The window mounts on the commit after the press, not inside it.
    await page.locator(".shell .term__input").waitFor();
    assert.equal(await page.locator(".shell").count(), 1);
    assert.equal(await page.locator(".term--inline").count(), 1);
    assert.equal(await page.locator(".shell .term").count(), 1);
    assert.equal(await page.locator(".shell .term__input").evaluate(el => document.activeElement === el), true);
    if (device.hasTouch) {
      const targets = await page.locator(".term__input, .term__label, .term__hint, .social__link").evaluateAll(els => els
        // Hidden on purpose (the gravity and eject chips under reduced motion) is not a target.
        .filter(el => el.getClientRects().length > 0)
        .map(el => ({ tag: el.className || el.tagName, height: el.getBoundingClientRect().height })));
      assert(targets.every(el => el.height >= 44), JSON.stringify(targets));
      check("home terminal and social button targets have a thumb's height", targets);
    }
    await command("cd arcade");
    assert.equal(await page.locator(".arcade-room").count(), 0);
    check("home has an inline shell and one drawer; reduced motion retains the arcade refusal");
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
