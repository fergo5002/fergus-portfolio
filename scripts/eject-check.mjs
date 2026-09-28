/**
 * Eject in a real browser: the monitor's hardware, the ways back in, and
 * whether the DOM screen lands on the bezel the shader draws.
 *
 * Three runs, one browser each, so any one can be run alone:
 *
 *  - desktop: Chromium at 1440x900 with the tab in front. Each control does
 *    what it says (the channel dial changes route and stays ejected, colour
 *    changes `data-theme`, contrast changes the scanline intensity, power goes
 *    off and comes back, degauss runs in the shader and the DOM), Escape docks
 *    and leaves the tube switched on, and the DOM screen's corners are compared
 *    with the bezel's inner edge read off the canvas with `readPixels`.
 *  - phone / phone320: WebKit as an iPhone 13 (390x844) and at 320x568, with
 *    touch. Every control at least 44px each way, inside the viewport, and the
 *    thing a finger at its centre would land on.
 *  - reduced: Chromium under `prefers-reduced-motion: reduce`. The eject
 *    control is not offered, and nothing ejects.
 *
 * The canvas is read inside the draw call that paints it, because the tube's
 * drawing buffer is not preserved: a read after the frame returns black. The
 * geometry is read only once the pointer is still and the pull-back has
 * settled, so the DOM rect and the canvas describe the same frame.
 *
 * Instrument first (CLAIMS.md, rule 1): every run checks the tab is visible and
 * takes a control reading of the canvas before trusting a pixel.
 *
 *   REVISION_BASE=http://localhost:3242 node scripts/eject-check.mjs
 *     [--only desktop|phone|phone320|reduced] [--shots dir] [--no-shots] [--gpu]
 *     [--nudge px]
 *
 * `--nudge 4` moves the DOM screen four pixels before the pixel check reads it.
 * That run is expected to FAIL the corners step: it is the revert that shows
 * the check can see a disagreement at all.
 *
 * `--gpu` asks headless Chromium for the machine's GPU (ANGLE on D3D11) rather
 * than SwiftShader. The software path is slow enough that the pull-back, which
 * eases per frame, takes several seconds to settle; the waits allow for it.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3000";
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const only = option("--only", "");
const shots = args.includes("--no-shots") ? null : option("--shots", ".revision-check/eject");
const gpu = args.includes("--gpu");
// Revert-to-red for the pixel check: shift the DOM screen this many pixels
// before reading the canvas. A run with --nudge 4 must FAIL that step.
const nudge = Number(option("--nudge", "0"));
/** Where the pointer rests between steps: on the desk, clear of every link and
 *  hover preview on the page, so the photographs show the page as it is. */
const REST = [720, 800];
if (shots) await mkdir(shots, { recursive: true });

let failed = 0;
async function step(run, label, fn) {
  try {
    const evidence = await fn();
    console.log(`PASS ${run}: ${label}${evidence === undefined ? "" : ` ${JSON.stringify(evidence)}`}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${run}: ${label}\n  ${String(error?.message || error).split("\n").join("\n  ")}`);
  }
}

/**
 * Installed before the page's own scripts. Wraps drawArrays so that, when the
 * check asks, the rows and columns it wants are read from the tube's canvas
 * inside the draw that painted them, and records the degauss uniform's age.
 */
function probe() {
  sessionStorage.setItem("fergusos_booted", "1");
  const p = (window.__ejectProbe = { want: null, got: null, degauss: [], draws: 0 });
  for (const proto of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
    const names = new WeakMap();
    const location = proto.getUniformLocation;
    proto.getUniformLocation = function (program, name) {
      const result = location.call(this, program, name);
      if (result) names.set(result, name);
      return result;
    };
    const uniform1f = proto.uniform1f;
    proto.uniform1f = function (where, value) {
      if (names.get(where) === "uDegauss" && value < 2.4) {
        p.degauss.push(value);
        if (p.degauss.length > 400) p.degauss.shift();
      }
      return uniform1f.call(this, where, value);
    };
    const draw = proto.drawArrays;
    proto.drawArrays = function (...a) {
      const result = draw.apply(this, a);
      if (!this.canvas.classList?.contains("phosphor__canvas")) return result;
      if (this.getParameter(this.FRAMEBUFFER_BINDING) !== null) return result;
      p.draws++;
      const want = p.want;
      if (!want) return result;
      p.want = null;
      const W = this.drawingBufferWidth;
      const H = this.drawingBufferHeight;
      const sx = W / innerWidth;
      const sy = H / innerHeight;
      const green = (px) => Array.from({ length: px.length / 4 }, (_, i) => px[i * 4 + 1]);
      const rows = want.rows.map((y) => {
        const by = Math.min(H - 1, Math.max(0, Math.round(H - 1 - y * sy)));
        const px = new Uint8Array(W * 4);
        this.readPixels(0, by, W, 1, this.RGBA, this.UNSIGNED_BYTE, px);
        return { y, g: green(px) };
      });
      const cols = want.cols.map((x) => {
        const bx = Math.min(W - 1, Math.max(0, Math.round(x * sx)));
        const px = new Uint8Array(H * 4);
        this.readPixels(bx, 0, 1, H, this.RGBA, this.UNSIGNED_BYTE, px);
        // Bottom-up in GL; flipped so index 0 is the top of the viewport.
        return { x, g: green(px).reverse() };
      });
      p.got = { rows, cols, sx, sy, W, H, rect: document.querySelector(".crt__assembly")?.getBoundingClientRect().toJSON() };
      return result;
    };
  }
}

async function open(engine, name, context) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch(gpu ? { args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] } : {});
  const ctx = await browser.newContext(context);
  await ctx.addInitScript(probe);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.bringToFront();
  return { browser, page, errors, name };
}

const shot = async (page, file) => {
  if (!shots) return null;
  const path = join(shots, file);
  await page.screenshot({ path });
  return path;
};

/** The eject control in the status strip. */
const ejectControl = (page) => page.locator(".machine__motion .machine__btn").last();

/** Waits for the camera to be off the glass and the monitor to stop moving. */
async function settle(page, label, timeout = 40_000) {
  try {
    await page.waitForFunction(
      () => {
        const a = document.querySelector(".crt__assembly");
        const hw = document.querySelector(".ejhw");
        if (!document.documentElement.classList.contains("is-ejecting") || !a || !hw) return false;
        // At rest the hardware is drawn at its layout's own size, scale 1. A
        // slow engine can go most of a second between frames, so "unchanged
        // for a while" alone once passed one step into the pull-back.
        const k = Number(/scale\(([\d.]+)\)/.exec(hw.style.transform)?.[1] ?? 0);
        if (Math.abs(k - 1) > 0.0005) return false;
        const now = `${a.style.transform}|${hw.style.transform}`;
        const s = (window.__settle ??= { last: "", since: performance.now() });
        if (now !== s.last) {
          s.last = now;
          s.since = performance.now();
          return false;
        }
        return performance.now() - s.since > 600;
      },
      null,
      { timeout, polling: 50 },
    );
  } catch (error) {
    throw new Error(`the monitor never settled (${label})`, { cause: error });
  }
  await page.evaluate(() => delete window.__settle);
}

async function docked(page, timeout = 40_000) {
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-ejecting"), null, { timeout, polling: 50 });
}

const bootOpen = (page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) || 0);

/** Reads rows and columns of the canvas from inside its next draw. */
async function readCanvas(page, rows, cols) {
  await page.evaluate(([r, c]) => {
    window.__ejectProbe.got = null;
    window.__ejectProbe.want = { rows: r, cols: c };
  }, [rows, cols]);
  await page.waitForFunction(() => window.__ejectProbe.got !== null, null, { timeout: 20_000, polling: 30 });
  return page.evaluate(() => window.__ejectProbe.got);
}

/**
 * Where the glass stops and the bezel starts along one line of green values,
 * scanning outward from `from` (inside the glass) in `dir`. The glass's edge is
 * dark (the tube's vignette), the bezel's inner edge carries the phosphor glow,
 * so the edge is the first pixel brighter than halfway between the two. Returns
 * the boundary between pixels, the same convention as a DOM rect's edge.
 */
function edge(g, from, dir, span = 40) {
  const glass = g[from];
  let peak = 0;
  for (let i = 0; i <= span; i++) peak = Math.max(peak, g[from + dir * i] ?? 0);
  const threshold = (glass + peak) / 2;
  for (let i = 0; i <= span; i++) {
    const v = g[from + dir * i];
    if (v === undefined) break;
    if (v > threshold) return dir > 0 ? from + i : from - i + 1;
  }
  return Number.NaN;
}

async function desktop() {
  const run = await open("chromium", "desktop", { viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const { page, browser, errors } = run;
  try {
    await step("desktop", "the tab is in front and the canvas draws (the instrument works)", async () => {
      assert.equal(await page.evaluate(() => document.visibilityState), "visible");
      await page.waitForFunction(() => window.__ejectProbe.draws > 3, null, { timeout: 20_000 });
      // Control reading on the docked tube: a row through the middle must not be all black.
      const got = await readCanvas(page, [450], []);
      const lit = got.rows[0].g.filter((v) => v > 4).length;
      assert.ok(lit > 100, `only ${lit} lit pixels across the docked tube`);
      return { buffer: [got.W, got.H], lit };
    });

    await step("desktop", "eject pulls back to a monitor with its hardware in the chin", async () => {
      const control = ejectControl(page);
      assert.equal((await control.locator(".machine__label").innerText()).trim(), "eject");
      await control.click();
      await page.mouse.move(...REST);
      // The first pull-back also mounts the hardware and warms the shader. On
      // CI's software renderer it took about 40 seconds (2026-09-27: the next
      // step, four seconds after a 40-second wait timed out, found it settled
      // with the corners within 0.2px), so it gets more room than the rest.
      await settle(page, "first eject", 90_000);
      const box = await page.locator(".ejhw").boundingBox();
      assert.ok(box && box.width > 300, "the hardware is laid out");
      assert.equal(await control.getAttribute("aria-pressed"), "true");
      return { hardware: box };
    });
    await shot(page, "desktop-green.png");

    await step("desktop", "the DOM screen's corners sit on the bezel's inner edge, within 2px", async () => {
      await page.mouse.move(...REST);
      await settle(page, "pointer still");
      if (nudge) await page.evaluate((n) => (document.querySelector(".crt__assembly").style.translate = `${n}px ${n}px`), nudge);
      const r = await page.evaluate(() => document.querySelector(".crt__assembly").getBoundingClientRect().toJSON());
      if (nudge) await page.evaluate(() => (document.querySelector(".crt__assembly").style.translate = ""));
      const ys = [r.top + r.height * 0.12, r.top + r.height * 0.88];
      const xs = [r.left + r.width * 0.12, r.left + r.width * 0.88];
      const got = await readCanvas(page, ys, xs);
      const inX = (x) => Math.round(x * got.sx);
      const inY = (y) => Math.round(y * got.sy);
      const corners = [];
      for (const [row, top] of [[0, true], [1, false]]) {
        for (const [col, left] of [[0, true], [1, false]]) {
          const g = got.rows[row].g;
          const c = got.cols[col].g;
          const x = edge(g, inX(left ? r.left + 12 : r.right - 12), left ? -1 : 1) / got.sx;
          const y = edge(c, inY(top ? r.top + 12 : r.bottom - 12), top ? -1 : 1) / got.sy;
          const dom = { x: left ? r.left : r.right, y: top ? r.top : r.bottom };
          corners.push({ corner: `${top ? "top" : "bottom"}-${left ? "left" : "right"}`, canvas: { x: +x.toFixed(1), y: +y.toFixed(1) }, dom: { x: +dom.x.toFixed(1), y: +dom.y.toFixed(1) } });
        }
      }
      for (const c of corners) {
        assert.ok(Math.abs(c.canvas.x - c.dom.x) <= 2 && Math.abs(c.canvas.y - c.dom.y) <= 2, `${c.corner} off: ${JSON.stringify(c)}`);
      }
      return corners.map((c) => `${c.corner} dx ${(c.canvas.x - c.dom.x).toFixed(1)} dy ${(c.canvas.y - c.dom.y).toFixed(1)}`);
    });

    await step("desktop", "the channel dial changes route by keyboard and stays ejected", async () => {
      const dial = page.locator(".ejhw__ctl--channel input");
      await dial.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForURL(base + "/experience");
      await page.waitForFunction(() => document.querySelector(".page__title")?.textContent === "experience", null, { timeout: 20_000 });
      assert.ok(await page.evaluate(() => document.documentElement.classList.contains("is-ejecting")), "still ejected");
      assert.equal(await ejectControl(page).getAttribute("aria-pressed"), "true");
      assert.ok(await page.evaluate(() => document.activeElement?.closest(".ejhw__ctl--channel") !== null), "the dial keeps focus");
      return page.url();
    });

    await step("desktop", "the spacer is re-measured to the new page, so the scroll range is right", async () => {
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        spacer: parseFloat(document.querySelector(".eject-spacer").style.height),
        screen: document.querySelector(".crt__screen").offsetHeight,
        scroll: document.documentElement.scrollHeight,
      }));
      assert.ok(Math.abs(m.spacer - m.screen) <= 2, JSON.stringify(m));
      return m;
    });

    await step("desktop", "a tap on the dial is the next channel, and the page scrolls inside the monitor", async () => {
      const cap = await page.locator(".ejhw__ctl--channel .ejhw__knob").boundingBox();
      await page.mouse.click(cap.x + cap.width / 2, cap.y + cap.height / 2);
      await page.waitForURL(base + "/projects");
      await settle(page, "after the channel change");
      // The page scrolls inside the monitor: the document moves, the assembly does not.
      await page.mouse.move(720, 400);
      await page.mouse.wheel(0, 900);
      await page.waitForFunction(() => window.scrollY > 300, null, { timeout: 10_000 });
      const m = await page.evaluate(() => ({ y: window.scrollY, screen: document.querySelector(".crt__screen").style.transform }));
      assert.match(m.screen, /translate3d\(0(px)?, -\d+/);
      await page.mouse.wheel(0, -2000);
      await page.waitForFunction(() => window.scrollY < 5, null, { timeout: 10_000 });
      return m;
    });
    await page.mouse.move(...REST);
    await settle(page, "back at the top");
    await shot(page, "desktop-channel.png");

    await step("desktop", "the colour knob changes the phosphor, by a tap and by the keyboard", async () => {
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      const cap = await page.locator(".ejhw__ctl--colour .ejhw__knob").boundingBox();
      await page.mouse.click(cap.x + cap.width / 2, cap.y + cap.height / 2);
      await page.waitForFunction(() => document.documentElement.dataset.theme === "amber");
      await page.mouse.move(...REST);
      await settle(page, "amber");
      await shot(page, "desktop-amber.png");
      await page.locator(".ejhw__ctl--colour input").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.documentElement.dataset.theme === "ice");
      await page.mouse.move(...REST);
      await settle(page, "ice");
      await shot(page, "desktop-ice.png");
      return [before, "amber", "ice"];
    });

    await step("desktop", "the contrast knob changes the scanline intensity", async () => {
      const read = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scanline-intensity").trim());
      const before = await read();
      await page.locator(".ejhw__ctl--contrast input").focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
      await page.waitForFunction((b) => getComputedStyle(document.documentElement).getPropertyValue("--scanline-intensity").trim() !== b, before);
      const after = await read();
      assert.ok(Number(after) < Number(before), `${before} -> ${after}`);
      assert.ok(Number(after) >= 0 && Number(after) <= 1);
      return `${before} -> ${after}`;
    });

    await step("desktop", "degauss rings the tube and swims the picture", async () => {
      await page.evaluate(() => (window.__ejectProbe.degauss = []));
      await page.locator(".ejhw__btn--degauss").click();
      const cls = await page.evaluate(() => document.querySelector(".crt__assembly").classList.contains("is-degaussing"));
      await page.waitForTimeout(180);
      await shot(page, "desktop-degauss.png");
      // A fresh pulse: the shader sees a degauss under half a second old. An
      // older one (the colour change's) would not count.
      await page.waitForFunction(() => window.__ejectProbe.degauss.some((v) => v < 0.5), null, { timeout: 10_000 });
      const youngest = await page.evaluate(() => Math.min(...window.__ejectProbe.degauss));
      const osd = await page.evaluate(() => document.querySelector(".ejosd")?.textContent ?? "");
      assert.ok(cls, "the assembly carries is-degaussing");
      assert.match(osd, /degauss/);
      return { youngestDegaussSeconds: +youngest.toFixed(3), osd };
    });

    await step("desktop", "power collapses the picture to a line inside the glass and brings it back", async () => {
      await page.mouse.move(...REST);
      await page.waitForTimeout(1200);
      const power = page.locator(".ejhw__btn--power");
      assert.equal(await power.getAttribute("aria-pressed"), "true");
      await power.click();
      await page.mouse.move(...REST);
      assert.equal(await power.getAttribute("aria-pressed"), "false");
      await page.waitForFunction(() => {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open"));
        return v > 0.05 && v < 0.6;
      }, null, { timeout: 10_000, polling: 16 });
      await shot(page, "desktop-power-off-mid.png");
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) === 0, null, { timeout: 15_000 });
      await page.waitForTimeout(900);
      const off = await page.evaluate(() => document.querySelector(".crt__assembly").style.transform);
      // The room is still there while the tube is off: read the desk under the monitor.
      const got = await readCanvas(page, [860], []);
      const room = Math.max(...got.rows[0].g);
      await shot(page, "desktop-power-off.png");
      await power.click();
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) === 1, null, { timeout: 15_000 });
      assert.equal(await power.getAttribute("aria-pressed"), "true");
      assert.match(off, /scale\([\d.]+, 0\.00[\d]+\)/, `squashed while off: ${off}`);
      return { off, deskPeakGreen: room };
    });

    await step("desktop", "Escape docks, and switches the tube back on if it was off", async () => {
      const power = page.locator(".ejhw__btn--power");
      await power.click();
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) < 0.5, null, { timeout: 15_000 });
      await page.keyboard.press("Escape");
      // The decision is immediate; the camera move is not. It eases per frame,
      // and SwiftShader at 1440x900 draws a handful of frames a second.
      await page.waitForFunction(() => document.querySelector(".machine__motion .machine__btn:last-child")?.getAttribute("aria-pressed") === "false", null, { timeout: 5_000 });
      await docked(page, 120_000);
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) === 1, null, { timeout: 15_000 });
      assert.equal(await ejectControl(page).getAttribute("aria-pressed"), "false");
      assert.equal(await page.locator(".ejhw").isVisible(), false);
      return "docked, power on";
    });

    await step("desktop", "no page errors", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

async function phone(name, device) {
  const run = await open("webkit", name, { ...device, reducedMotion: "no-preference" });
  const { page, browser, errors } = run;
  try {
    await step(name, "the tab is in front", async () => {
      assert.equal(await page.evaluate(() => document.visibilityState), "visible");
      return page.viewportSize();
    });

    await step(name, "eject is offered in the phone bar and pulls back", async () => {
      const control = ejectControl(page);
      await control.tap();
      await settle(page, "phone eject", 60_000);
      return await page.evaluate(() => document.querySelector(".crt__assembly").style.transform);
    });
    await shot(page, `${name}-green.png`);

    await step(name, "every control is at least 44px, inside the viewport, and the thing under its centre", async () => {
      const found = await page.evaluate(() =>
        [...document.querySelectorAll(".ejhw .ejhw__ctl")].map((el) => {
          const target = el.querySelector(".ejhw__knob, .ejhw__switch") ?? el;
          const r = target.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            name: el.className.replace(/.*ejhw__(ctl|btn)--(\w+).*/, "$2"),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
            inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            reachable: !!hit && el.contains(hit),
          };
        }),
      );
      assert.equal(found.length, 5, JSON.stringify(found));
      for (const c of found) {
        assert.ok(c.w >= 44 && c.h >= 44, `${c.name} is ${c.w}x${c.h}`);
        assert.ok(c.inside, `${c.name} is off the viewport`);
        assert.ok(c.reachable, `${c.name} is covered at its centre`);
      }
      return found.map((c) => `${c.name} ${c.w}x${c.h}`);
    });

    await step(name, "the way back in: the enter control's size, reported rather than judged", async () => {
      const r = await ejectControl(page).boundingBox();
      return { enter: r && { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } };
    });

    await step(name, "a tap turns the colour knob, and the power switch works by touch", async () => {
      await page.locator(".ejhw__ctl--colour .ejhw__knob").tap();
      await page.waitForFunction(() => document.documentElement.dataset.theme === "amber");
      await settle(page, "phone amber", 60_000);
      await shot(page, `${name}-amber.png`);
      await page.locator(".ejhw__ctl--colour .ejhw__knob").tap();
      await page.waitForFunction(() => document.documentElement.dataset.theme === "ice");
      await settle(page, "phone ice", 60_000);
      await shot(page, `${name}-ice.png`);
      const power = page.locator(".ejhw__btn--power");
      await power.tap();
      assert.equal(await power.getAttribute("aria-pressed"), "false");
      await power.tap();
      assert.equal(await power.getAttribute("aria-pressed"), "true");
      return "amber, ice, off, on";
    });

    await step(name, "no page errors", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

async function reduced() {
  const run = await open("chromium", "reduced", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const { page, browser, errors } = run;
  try {
    await step("reduced", "the eject control is not offered under reduced motion", async () => {
      const shown = await page.evaluate(() => {
        const m = document.querySelector(".machine__motion");
        return m ? getComputedStyle(m).display : "absent";
      });
      assert.ok(shown === "none" || shown === "absent", shown);
      assert.equal(await ejectControl(page).isVisible(), false);
      return shown;
    });

    await step("reduced", "and asking the terminal declines, so nothing ejects", async () => {
      await page.keyboard.press("Backquote");
      const input = page.locator(".shell .term__input");
      await input.waitFor();
      await input.fill("eject");
      await input.press("Enter");
      await page.waitForTimeout(800);
      const text = await page.locator(".shell").innerText();
      assert.match(text, /eject: declined/);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("is-ejecting")), false);
      assert.equal(await page.locator(".ejhw").count(), 0);
      return "declined";
    });

    await step("reduced", "no page errors", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

if (!only || only === "desktop") await desktop();
// The whole screen, 390x844, rather than Playwright's iPhone 13 viewport (390x664,
// the screen less Safari's bars): the chin is tightest when the monitor is tallest.
if (!only || only === "phone") await phone("phone-390", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
if (!only || only === "phone320") await phone("phone-320", { ...devices["iPhone 13"], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 });
if (!only || only === "reduced") await reduced();

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exitCode = failed ? 1 : 0;
