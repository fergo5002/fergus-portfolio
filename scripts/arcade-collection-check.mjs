import { webkit, chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option("--base", "http://localhost:3000"), out = resolve(option("--out", ".phone-check/arcade"));
await mkdir(out, { recursive: true });
const games = ["bounce", "pong", "snake", "under", "signal", "poker"], evidence = [];
function check(condition, message) { if (!condition) throw new Error(message); }
async function inspect(page) {
  return page.locator(".arcade-room").evaluate(room => {
    const controls = [...room.querySelectorAll("button,input,textarea")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; });
    const canvas = room.querySelector("canvas");
    return { overflow: room.scrollWidth - room.clientWidth, smallTargets: controls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map(el => el.textContent?.slice(0, 60)), smallInputs: controls.filter(el => el.matches("input,textarea") && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.id), canvas: canvas ? { width: canvas.width, height: canvas.height } : null };
  });
}
for (const profile of [{ name: "webkit-390", engine: webkit, device: "iPhone 12", width: 390, height: 844 }, { name: "webkit-320", engine: webkit, device: "iPhone 12", width: 320, height: 568 }, { name: "chromium-pixel", engine: chromium, device: "Pixel 5", width: 393, height: 851 }]) {
  const browser = await profile.engine.launch();
  const context = await browser.newContext({ ...devices[profile.device], viewport: { width: profile.width, height: profile.height }, reducedMotion: "no-preference" });
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
    await page.locator(".statusbar__prompt").tap(); await page.locator(".term__input").fill("cd arcade"); await page.locator(".term__input").press("Enter");
    await page.locator(".arcade-room").waitFor();
    await page.locator(".arcade-entrance").waitFor({ state: "hidden", timeout: 12000 });
    check(await page.locator(".arcade-cabinet").count() === 6, "The gallery must have six live cabinets");
    check(await page.locator(".arcade-room").evaluate(room => room.scrollTop === 0), "Focus skipped the arcade entrance heading");
    await page.screenshot({ path: resolve(out, `${profile.name}-gallery.png`) });
    const gallery = await inspect(page); check(gallery.overflow <= 0, `${profile.name} gallery overflow`);
    for (const id of games) {
      await page.locator(`.arcade-cabinet[data-game=${id}]`).tap();
      const detail = await inspect(page); check(detail.overflow <= 0 && !detail.smallTargets.length && !detail.smallInputs.length, `${profile.name}/${id} detail: ${JSON.stringify(detail)}`);
      await page.getByRole("button", { name: /start solo run/i }).tap(); await page.locator(".arcade-canvas").waitFor();
      if (id === "poker") { await page.getByRole("button", { name: "Hold card 1", exact: true }).tap(); check(await page.getByRole("button", { name: "Hold card 1", exact: true }).getAttribute("aria-pressed") === "true", "Poker hold did not respond"); await page.getByRole("button", { name: "REDRAW", exact: true }).tap(); }
      else { await page.locator(".arcade-action-button").tap(); if (id === "under") for (const key of ["→", "↓", "←", "↑"]) await page.locator(".arcade-dpad").getByRole("button", { name: key, exact: true }).tap(); }
      await page.getByRole("button", { name: /^pause$/i }).tap();
      check(await page.getByRole("heading", { name: "SYSTEM PAUSED" }).isVisible(), "Pause did not cover the game");
      await page.locator(".arcade-pause").getByRole("button", { name: /^resume$/i }).tap();
      if (profile.width === 390 && id === "bounce") { await page.setViewportSize({ width: 320, height: 568 }); check(await page.locator(".arcade-play__title").textContent() === "BREAKPOINT", "Resize reset the active game"); }
      const play = await inspect(page); check(play.overflow <= 0 && !play.smallTargets.length && !play.smallInputs.length, `${profile.name}/${id} play: ${JSON.stringify(play)}`);
      check(play.canvas?.width > 100 && play.canvas?.height > 80, "The game canvas was not measured");
      await page.screenshot({ path: resolve(out, `${profile.name}-${id}.png`) }); evidence.push({ profile: profile.name, game: id, ...play });
      if (profile.width === 390 && id === "bounce") await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: /all cabinets/i }).first().tap();
    }
    await page.keyboard.press("Escape"); await page.locator(".term__input").waitFor({ state: "visible" });
    check(await page.locator(".term__input").evaluate(el => el === document.activeElement), "Escape did not restore prompt focus");
    check((await page.locator(".term__scroll").textContent()).includes("cd arcade"), "Escape lost scrollback");
    check(await page.locator("#shell-drawer").isVisible(), "Escape closed the drawer as well as the arcade"); check(!errors.length, `Browser errors: ${errors.join("; ")}`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".statusbar__prompt").tap(); await page.locator(".term__input").fill("cd arcade"); await page.locator(".term__input").press("Enter");
    await page.waitForFunction(() => document.querySelector(".term__scroll")?.textContent.includes("reduced motion"));
    check(await page.locator(".arcade-room").count() === 0, "Reduced motion opened the arcade");
    check((await page.locator(".term__scroll").textContent()).includes("reduced motion"), "Reduced motion did not explain the refusal");
    console.log(`${profile.name}: all six games, touch, pause, sizing, Escape and reduced motion passed`);
  } catch (error) { await page.screenshot({ path: resolve(out, `${profile.name}-failure.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); await browser.close(); }
}
await writeFile(resolve(out, "evidence.json"), JSON.stringify(evidence, null, 2));
