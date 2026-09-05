import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.ARCADE_BASE || "http://localhost:3210";
const out = resolve(".phone-check/arcade-multiplayer"); await mkdir(out, { recursive: true });
const browsers = [await chromium.launch(), await chromium.launch()], evidence = [];
try {
  for (const game of ["pong", "snake"]) {
    const contexts = await Promise.all(browsers.map(b => b.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "no-preference" })));
    await Promise.all(contexts.map(c => c.addInitScript(() => {
      const send = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function (raw) {
        try { const packet = JSON.parse(raw); if (packet.type === "state") window.__arcadeLatestState = packet.state; } catch {}
        return send.call(this, raw);
      };
    })));
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    await Promise.all(pages.map(async page => {
      await page.goto(base + "/experience", { waitUntil: "networkidle", timeout: 120000 });
      await page.locator(".statusbar__prompt").click(); await page.locator(".term__input").fill(`cd arcade ${game}`); await page.locator(".term__input").press("Enter");
      await page.getByRole("button", { name: "Connect a friend", exact: true }).click();
    }));
    const [host, guest] = pages;
    await host.getByRole("button", { name: "Create invite", exact: true }).click(); await host.getByRole("textbox", { name: "Outgoing connection code" }).waitFor();
    await guest.locator("#arcade-link-input").fill(await host.getByRole("textbox", { name: "Outgoing connection code" }).inputValue());
    await guest.getByRole("button", { name: "Answer invite", exact: true }).click(); await guest.getByRole("textbox", { name: "Outgoing connection code" }).waitFor();
    await host.locator("#arcade-link-input").fill(await guest.getByRole("textbox", { name: "Outgoing connection code" }).inputValue());
    await host.getByRole("button", { name: "Connect cabinets", exact: true }).click();
    await host.getByRole("button", { name: "Start linked match", exact: true }).waitFor({ timeout: 30000 }); await host.getByRole("button", { name: "Start linked match", exact: true }).click();
    await Promise.all(pages.map(p => p.locator(".arcade-canvas").waitFor()));
    await host.waitForFunction(() => !!window.__arcadeLatestState);
    const before = await host.evaluate(id => id === "pong" ? window.__arcadeLatestState.rival.y : window.__arcadeLatestState.snake2[0].y, game);
    await guest.locator(".arcade-stage").evaluate(stage => stage.focus()); await guest.keyboard.down("ArrowDown");
    await host.waitForFunction(({ id, before }) => (id === "pong" ? window.__arcadeLatestState.rival.y : window.__arcadeLatestState.snake2[0].y) > before, { id: game, before });
    await guest.keyboard.up("ArrowDown");
    // Pause immediately after the proven input. Snake reaches a wall in seconds;
    // extra focus/stability waits would test the driver rather than the connection.
    await host.getByRole("button", { name: "Pause", exact: true }).evaluate(button => button.click());
    await guest.getByRole("heading", { name: "SYSTEM PAUSED", exact: true }).waitFor();
    const status = await Promise.all(pages.map(p => p.locator(".arcade-live-hud").textContent()));
    await host.screenshot({ path: resolve(out, `${game}-host.png`) }); await guest.screenshot({ path: resolve(out, `${game}-guest.png`) });
    await contexts[0].close(); await guest.getByRole("alert").filter({ hasText: "disconnected" }).waitFor({ timeout: 15000 });
    evidence.push({ game, connected: true, guestInputMovedHostState: true, pausePropagated: true, disconnectShown: true, status });
    await contexts[1].close(); console.log(`${game}: linked, played, paused on both peers, disconnected visibly`);
  }
  await writeFile(resolve(out, "evidence.json"), JSON.stringify(evidence, null, 2));
} finally { await Promise.all(browsers.map(b => b.close())); }
