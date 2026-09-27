import { webkit, chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { killOneProcess, statusPoints } from "./arcade-panic-smoke.mjs";
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option("--base", "http://localhost:3000"), out = resolve(option("--out", ".phone-check/arcade"));
await mkdir(out, { recursive: true });
const games = ["signal", "poker", "panic"], evidence = [];
function check(condition, message) { if (!condition) throw new Error(message); }
async function inspect(page) {
  return page.locator(".arcade-room").evaluate(room => {
    const controls = [...room.querySelectorAll("button,input,textarea")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; });
    const canvas = room.querySelector("canvas");
    return { overflow: room.scrollWidth - room.clientWidth, smallTargets: controls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map(el => el.textContent?.slice(0, 60)), smallInputs: controls.filter(el => el.matches("input,textarea") && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.id || el.className), canvas: canvas ? { width: canvas.width, height: canvas.height } : null };
  });
}
/** The run starts from its how-to-play card; headless WebGL is slow, so the countdown gets a generous wait. */
const phase = (page, name) => page.waitForFunction((n) => document.querySelector(".arcade-play")?.dataset.phase === n, name, { timeout: 30000 });
for (const profile of [{ name: "webkit-390", engine: webkit, device: "iPhone 12", width: 390, height: 844 }, { name: "webkit-320", engine: webkit, device: "iPhone 12", width: 320, height: 568 }, { name: "chromium-pixel", engine: chromium, device: "Pixel 5", width: 393, height: 851 }]) {
  const browser = await profile.engine.launch();
  const context = await browser.newContext({ ...devices[profile.device], viewport: { width: profile.width, height: profile.height }, reducedMotion: "no-preference" });
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  // A fixed board for reads, so the Hall of Fame's table and switcher are exercised even where the
  // store is offline (CI and local builds have no board token). Only GETs are answered; nothing is posted.
  await context.route("**/api/board", route => route.request().method() === "GET"
    ? route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true, boards: [{ game: "signal", rows: [{ initials: "FOR", score: 4250 }, { initials: "CKK", score: 1900 }] }, { game: "poker", rows: [{ initials: "ACE", score: 1240 }] }, { game: "panic", rows: [] }] }) })
    : route.continue());
  try {
    await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
    await page.locator(".statusbar__prompt").tap(); await page.locator(".term__input").fill("cd arcade"); await page.locator(".term__input").press("Enter");
    await page.locator(".arcade-room").waitFor();
    await page.locator(".arcade-entrance").waitFor({ state: "hidden", timeout: 12000 });
    check(await page.locator(".arcade-cabinet").count() === games.length, `The gallery must have ${games.length} live cabinets`);
    check(await page.locator(".arcade-room").evaluate(room => room.scrollTop === 0), "Focus skipped the arcade entrance heading");
    check(await page.locator(".arcade-bar").count() === 0, "The retired header bar is back");
    await page.screenshot({ path: resolve(out, `${profile.name}-gallery.png`) });
    const gallery = await inspect(page); check(gallery.overflow <= 0, `${profile.name} gallery overflow`);
    check(!gallery.smallTargets.length, `${profile.name} gallery targets: ${JSON.stringify(gallery.smallTargets)}`);
    // The Hall of Fame: one cabinet's column at a time on a phone, chosen with the switcher.
    const fame = page.locator(".fame");
    await fame.scrollIntoViewIfNeeded();
    const poker = fame.getByRole("button", { name: "CIRCUIT POKER", exact: true });
    await poker.waitFor({ timeout: 10000 });
    await poker.tap();
    check(await poker.getAttribute("aria-pressed") === "true", "The Hall of Fame switcher did not select a board");
    check(await fame.locator('td[data-game="poker"]').first().isVisible() && !(await fame.locator('td[data-game="signal"]').first().isVisible()), "The phone Hall of Fame did not show one board");
    check((await fame.locator('td[data-game="poker"]').first().textContent()).includes("ACE"), "The Hall of Fame lost the board's top row");
    check(await fame.locator('td[data-game="poker"] .fame__empty').count() === 9, "An empty Hall of Fame slot was filled with something nobody earned");
    await page.screenshot({ path: resolve(out, `${profile.name}-hall-of-fame.png`) });
    await page.locator(".arcade-room").evaluate((room) => { room.scrollTop = 0; });
    for (const id of games) {
      await page.locator(`.arcade-cabinet[data-game=${id}]`).tap();
      const detail = await inspect(page); check(detail.overflow <= 0 && !detail.smallTargets.length && !detail.smallInputs.length, `${profile.name}/${id} detail: ${JSON.stringify(detail)}`);
      await page.getByRole("button", { name: /start solo run/i }).tap(); await page.locator(".arcade-canvas").waitFor();
      check(await page.locator(".arcade-play").getAttribute("data-phase") === "card", `${profile.name}/${id} did not open on its how-to-play card`);
      await page.locator(".arcade-canvas").tap();
      await phase(page, "play");
      if (id === "poker") { await page.getByRole("button", { name: "Hold card 1", exact: true }).tap(); check(await page.getByRole("button", { name: "Hold card 1", exact: true }).getAttribute("aria-pressed") === "true", "Poker hold did not respond"); await page.getByRole("button", { name: "DRAW", exact: true }).tap(); }
      else if (id === "signal") { await page.locator(".arcade-action-button").tap(); for (const key of ["→", "↓", "←", "↑"]) await page.locator(".arcade-dpad").getByRole("button", { name: key, exact: true }).tap(); }
      else {
        check(await page.locator(".arcade-type__input").evaluate(el => el === document.activeElement), `${profile.name}: the tap that started Kernel Panic did not focus its text input`);
        // A coarse pointer is the touch profile: a phone is only ever asked for letters and spaces.
        const killed = await killOneProcess(page);
        check(/^[a-z]+( [a-z]+)*$/.test(killed), `${profile.name}: a touch run asked for "${killed}"`);
        await page.waitForFunction(() => /[1-9]\d* points/.test(document.querySelector(".arcade-status")?.textContent ?? ""), null, { timeout: 15000 })
          .catch(async () => { throw new Error(`${profile.name}: typing "${killed}" to death scored nothing (status: ${await statusPoints(page)})`); });
        if (profile.width === 390) {
          // A phone keyboard takes the bottom half of the screen. Stand in for it by cutting the
          // viewport and let the room's throttled --vv-h catch up. Two readings: the canvas and
          // the input together fit under the site's fixed nav; and once the input is brought into
          // view, as iOS does on focus, the input and the kernel line are both on the glass.
          // Playwright shows no keyboard, so where a real phone scrolls to is not proven here.
          await page.setViewportSize({ width: 390, height: 400 });
          await page.waitForTimeout(400);
          await page.locator(".arcade-type__input").scrollIntoViewIfNeeded();
          const fit = await page.evaluate(() => {
            const c = document.querySelector(".arcade-canvas").getBoundingClientRect(), i = document.querySelector(".arcade-type__input").getBoundingClientRect();
            const nav = document.querySelector(".nav")?.getBoundingClientRect().bottom ?? 0;
            return { navBottom: nav, canvasTop: c.top, canvasBottom: c.bottom, inputTop: i.top, inputBottom: i.bottom, height: innerHeight, vv: getComputedStyle(document.querySelector(".arcade-play")).getPropertyValue("--vv-h") };
          });
          check(fit.inputBottom - fit.canvasTop <= fit.height - fit.navBottom + 1, `${profile.name}: with a keyboard's worth of screen gone, the play area and input do not fit under the nav: ${JSON.stringify(fit)}`);
          check(fit.inputBottom <= fit.height + 1 && fit.canvasBottom <= fit.inputTop + 1 && fit.canvasBottom - (fit.canvasBottom - fit.canvasTop) * 0.2 > fit.navBottom, `${profile.name}: with the input in view, the kernel is hidden: ${JSON.stringify(fit)}`);
          evidence.push({ profile: profile.name, game: "panic", keyboardStandIn: fit, killed });
          await page.screenshot({ path: resolve(out, `${profile.name}-panic-keyboard.png`) });
          await page.setViewportSize({ width: 390, height: 844 });
        }
      }
      await page.getByRole("button", { name: /^pause$/i }).tap();
      check(await page.getByRole("heading", { name: "SYSTEM PAUSED" }).isVisible(), "Pause did not cover the game");
      await page.locator(".arcade-pause").getByRole("button", { name: /^resume$/i }).tap();
      if (profile.width === 390 && id === "signal") {
        await page.setViewportSize({ width: 320, height: 568 });
        check(await page.locator(".arcade-play__title").textContent() === "DEAD SIGNAL", "Resize reset the active game");
        check(await page.locator(".arcade-play").getAttribute("data-phase") === "play", "Resize sent the run back to its card");
      }
      const play = await inspect(page); check(play.overflow <= 0 && !play.smallTargets.length && !play.smallInputs.length, `${profile.name}/${id} play: ${JSON.stringify(play)}`);
      check(play.canvas?.width > 100 && play.canvas?.height > 80, "The game canvas was not measured");
      await page.screenshot({ path: resolve(out, `${profile.name}-${id}.png`) }); evidence.push({ profile: profile.name, game: id, ...play });
      if (profile.width === 390 && id === "signal") await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: /all cabinets/i }).first().tap();
    }
    await page.keyboard.press("Escape"); await page.locator(".term__input").waitFor({ state: "visible" });
    check(await page.locator(".term__input").evaluate(el => el === document.activeElement), "Escape did not restore prompt focus");
    check((await page.locator(".term__scroll").textContent()).includes("cd arcade"), "Escape lost scrollback");
    check(await page.locator("#shell-drawer").isVisible(), "Escape closed the drawer as well as the arcade");
    // A touch screen has no Escape key: the nav's cd arcade opens the room and, pressed again, leaves it.
    await page.locator(".shell__close").tap();
    await page.locator(".nav__list").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator(".nav__link--cmd").tap();
    await page.locator(".arcade-room").waitFor();
    await page.locator(".arcade-entrance").waitFor({ state: "detached", timeout: 12000 });
    await page.locator(".nav__link--cmd").tap();
    await page.locator(".arcade-room").waitFor({ state: "detached", timeout: 5000 }).catch(() => { throw new Error("The nav's cd arcade did not leave an open arcade"); });
    check(!errors.length, `Browser errors: ${errors.join("; ")}`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".statusbar__prompt").tap(); await page.locator(".term__input").fill("cd arcade"); await page.locator(".term__input").press("Enter");
    await page.waitForFunction(() => document.querySelector(".term__scroll")?.textContent.includes("reduced motion"));
    check(await page.locator(".arcade-room").count() === 0, "Reduced motion opened the arcade");
    check((await page.locator(".term__scroll").textContent()).includes("reduced motion"), "Reduced motion did not explain the refusal");
    console.log(`${profile.name}: all ${games.length} games, hall of fame, touch, pause, sizing, Escape, nav exit and reduced motion passed`);
  } catch (error) { await page.screenshot({ path: resolve(out, `${profile.name}-failure.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); await browser.close(); }
}
await writeFile(resolve(out, "evidence.json"), JSON.stringify(evidence, null, 2));
