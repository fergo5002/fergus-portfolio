import { resolve } from "node:path";
import { webkit } from "playwright";

/**
 * Group Lore's boundaries, in order: a 25,000-message archive, a cancelled
 * read that must stay cancelled, then the week on a phone.
 *
 * The phone half is why this file launches its own WebKit. On 2026-09-28 the
 * old page was measured on a WebKit phone at 390 and 320: it drew all 168
 * cells, the same at first paint and 1.5 seconds later, but opened its
 * sideways scroller on the small hours, so none of the 35 lit cells was on
 * screen, two screens below the fold. Scrolled to them, they stood 1.9 to
 * 7.4 times the ground's luminance: not too dark, and not drawn late, only
 * out of sight. So this reads what a phone shows, not what the DOM holds:
 * every cell inside the viewport, the week first on the stage, and the pixels
 * of a real screenshot, decoded in a blank page, lit where the heat says.
 */
const base = process.env.LAB_URL || "http://127.0.0.1:3106";
const prefix = process.env.STUDIO_PREFIX || "/lab";

/** Contrast of two relative luminances, as WCAG writes it. */
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Sample a PNG at CSS-pixel points, in a blank page so no CSP stands in the way. */
async function sample(context, png, scale, points) {
  const blank = await context.newPage();
  try {
    return await blank.evaluate(
      async ({ b64, scale, points }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const g = canvas.getContext("2d");
        g.drawImage(img, 0, 0);
        const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return points.map(([x, y]) => {
          const [r, gr, b] = g.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
          return 0.2126 * channel(r) + 0.7152 * channel(gr) + 0.0722 * channel(b);
        });
      },
      { b64: png.toString("base64"), scale, points },
    );
  } finally {
    await blank.close();
  }
}

async function weekOnPhone({ assert, out }, width) {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => sessionStorage.setItem("fergusos_booted", "1"));
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}${prefix}/group-lore`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator(".lore__intake").waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.visibilityState), "visible", "a hidden tab measures nothing");

    // Whole and first: every cell on screen, nothing above the week on the stage, no sideways scroll.
    const layout = await page.evaluate(() => {
      const week = document.querySelector(".lore__week");
      const stage = document.querySelector(".bench-stage");
      const cells = [...week.querySelectorAll(".lore__cell")].map((el) => el.getBoundingClientRect());
      const above = [...stage.querySelectorAll("p, output, input, button, label, select, textarea, h2, h3")].filter(
        (el) => el.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const box = week.getBoundingClientRect();
      return {
        cells: cells.length,
        offScreen: cells.filter((r) => r.left < 0 || r.right > innerWidth).length,
        above: above.map((el) => el.outerHTML.slice(0, 60)),
        overflow: document.documentElement.scrollWidth - innerWidth,
        top: Math.round(box.top + scrollY),
        bottom: Math.round(box.bottom + scrollY),
        viewport: innerHeight,
        cell: {
          width: Math.min(...cells.map((r) => r.width)),
          height: Math.min(...cells.map((r) => r.height)),
        },
      };
    });
    assert.equal(layout.cells, 168, "the week has every hour");
    assert.equal(layout.offScreen, 0, `${width}: every hour of the week is on screen`);
    assert.deepEqual(layout.above, [], `${width}: nothing sits above the week on the stage`);
    assert.ok(layout.overflow <= 1, `${width}: the page does not scroll sideways`);
    // Measured 2026-09-28 on an 844px-tall screen: 418 to 721 at 390, 465 to 768 at 320.
    assert.ok(layout.bottom <= layout.viewport, `${width}: the whole week is on the first screen (${layout.top} to ${layout.bottom}px)`);
    assert.ok(layout.cell.width >= 24, `${width}: a cell is wide enough to see and tap (${layout.cell.width}px)`);

    // Lit: the pixels of the week as drawn, each cell's centre against the ground.
    const png = await page.locator(".lore__week").screenshot();
    const cells = await page.locator(".lore__week").evaluate((week) => {
      const b = week.getBoundingClientRect();
      return [...week.querySelectorAll(".lore__cell")].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top, empty: el.hasAttribute("data-empty"), heat: Number(el.style.getPropertyValue("--heat")) };
      });
    });
    const lum = await sample(context, png, 3, cells.map((c) => [c.x, c.y]));
    const empties = lum.filter((_, i) => cells[i].empty).sort((a, b) => a - b);
    assert.ok(empties.length > 0, "the example leaves some hours empty, to read the ground from");
    const ground = empties[Math.floor(empties.length / 2)];
    const lit = lum.map((l, i) => ({ ...cells[i], contrast: ratio(l, ground) })).filter((c) => !c.empty);
    const contrasts = lit.map((c) => c.contrast).sort((a, b) => a - b);
    const brightest = lit.reduce((a, c) => (c.heat > a.heat ? c : a));
    // Measured 2026-09-28: the dimmest lit hour 2.3:1 against the ground, the median 5.9, the peak 14.7, an empty hour 1.02.
    const pixels = {
      lit: lit.length,
      dimmest: +contrasts[0].toFixed(2),
      median: +contrasts[Math.floor(contrasts.length / 2)].toFixed(2),
      peak: +brightest.contrast.toFixed(2),
      emptiest: +ratio(empties.at(-1), ground).toFixed(2),
    };
    assert.ok(lit.length >= 100, `${width}: the example lights most of the week`);
    assert.ok(pixels.dimmest >= 1.8, `${width}: the quietest lit hour is visibly lit (${pixels.dimmest}:1)`);
    assert.ok(pixels.median >= 3.5, `${width}: a typical hour glows (${pixels.median}:1)`);
    assert.ok(pixels.peak >= 8, `${width}: the busiest hour is bright (${pixels.peak}:1)`);
    assert.ok(pixels.emptiest < 1.2, `${width}: an empty hour stays dark (${pixels.emptiest}:1)`);
    await page.screenshot({ path: resolve(out, `lore-week-webkit-${width}.png`) });

    // A tap reads the hour and leaves the week where it is; a second tap on it opens its messages.
    const cell = page.locator('.lore__cell[data-d="1"][data-h="21"]');
    const before = await page.evaluate(() => scrollY);
    await cell.tap();
    await page.waitForFunction(() => /^Tuesday 21:00 · /.test(document.querySelector(".lore__reading")?.textContent ?? ""));
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".lore__explorer").count(), 0, `${width}: one tap reads the hour without opening anything`);
    assert.ok(Math.abs((await page.evaluate(() => scrollY)) - before) < 2, `${width}: one tap leaves the week where it is`);
    await cell.tap();
    await page.locator(".lore__explorer").waitFor();
    const hours = await page.locator(".lore-messages time").evaluateAll((els) =>
      els.map((el) => {
        const d = new Date(el.getAttribute("datetime"));
        return `${d.getDay()}-${d.getHours()}`;
      }),
    );
    assert.ok(hours.length > 0, "Tuesday 21:00 has messages");
    assert.deepEqual([...new Set(hours)], ["2-21"], `${width}: the second tap opens Tuesday 21:00 and nothing else`);
    assert.deepEqual(errors, [], `${width}: no page errors`);
    return { layout, pixels };
  } finally {
    await browser.close();
  }
}

export default [
  [
    "large-chat-filtering",
    async ({ page, open, out, assert }) => {
      await open("group-lore");
      await page.locator(".lore__intake").waitFor();
      const rows = Array.from({ length: 25000 }, (_, i) => ({
        sender: `Person ${i % 12}`,
        text: `Message ${i} orchid conversation`,
        at: Date.UTC(2026, 0, 1) + i * 60000,
      }));
      const file = {
          name: "large-chat.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(rows)),
        },
        start = Date.now();
      await page.getByLabel("Import a chat", { exact: true }).setInputFiles(file);
      await page.waitForFunction(() => document.querySelector(".lore__figures")?.innerText.includes("25,000"));
      const elapsed = Date.now() - start;
      // The week, the voices and the timeline are all drawn from it.
      assert.equal(await page.locator(".lore__voice").count(), 6, "the six loudest voices show");
      assert.ok((await page.locator(".lore__cell:not([data-empty])").count()) > 0);
      await page.getByRole("button", { name: "Search the messages", exact: true }).click();
      await page.locator(".lore__explorer").waitFor();
      assert.equal(await page.locator(".lore-messages article").count(), 50);
      await page.getByLabel("Search message text", { exact: true }).fill("Message 24999 ");
      await page.waitForFunction(() => document.querySelectorAll(".lore-messages article").length === 1);
      await page.locator(".studio-lore").screenshot({ path: resolve(out, "lore-large.png") });
      await page.getByRole("button", { name: "Close the messages", exact: true }).click();
      return { messages: 25000, importMs: elapsed, renderedRows: 50 };
    },
  ],
  [
    "cancelled-chat-read-stays-cancelled",
    async ({ page, b, assert }) => {
      // Hold the read until the test has clicked Cancel. A fixed 800ms delay raced
      // Playwright's actionability checks and disappeared before slower CI clicked.
      await page.evaluate(() => {
        const original = File.prototype.text;
        window.__originalStudioFileText = original;
        window.__studioReadFinished = false;
        File.prototype.text = async function () {
          if (this.name === "cancel-chat.json") {
            await new Promise((resolve) => {
              window.__releaseStudioRead = resolve;
            });
            const text = await original.call(this);
            window.__studioReadFinished = true;
            return text;
          }
          return original.call(this);
        };
      });
      try {
        await page.getByLabel("Import a chat", { exact: true }).setInputFiles({
          name: "cancel-chat.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify([{ sender: "Delayed", text: "Should not replace the archive", at: Date.now() }])),
        });
        await page.waitForFunction(() => typeof window.__releaseStudioRead === "function");
        await b("Cancel").click();
        await page.evaluate(() => window.__releaseStudioRead());
        await page.waitForFunction(() => window.__studioReadFinished);
        // Give an incorrectly started parser time to replace the existing archive.
        await page.waitForTimeout(1000);
        assert.ok((await page.locator(".lore__figures").innerText()).includes("25,000"));
        assert.equal(await page.locator(".lore__busy").count(), 0, "the busy line goes with the cancel");
      } finally {
        await page.evaluate(() => {
          window.__releaseStudioRead?.();
          File.prototype.text = window.__originalStudioFileText;
          delete window.__releaseStudioRead;
          delete window.__originalStudioFileText;
          delete window.__studioReadFinished;
        });
      }
    },
  ],
  [
    "the-week-in-the-server-html",
    async ({ assert }) => {
      // Before any script: the example's week, lit, read, and first in the tool.
      const html = await (await fetch(`${base}${prefix}/group-lore`)).text();
      const tool = html.slice(html.indexOf("studio-lore"));
      const cells = tool.match(/<span class="lore__cell"[^>]*>/g) ?? [];
      const lit = cells.filter((c) => !c.includes("data-empty")).length;
      const reading = tool.match(/<output[^>]*class="lore__reading"[^>]*>([^<]*)</)?.[1] ?? "";
      assert.equal(cells.length, 168, "the server draws every hour of the week");
      assert.ok(lit >= 100, `the server draws the example lit (${lit} cells)`);
      assert.match(reading, /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d\d:00 · [\d,]+ messages$/, "the server reads the peak");
      assert.ok(tool.indexOf("lore__week") < tool.search(/<(p|button|input|textarea|label)\b/), "the week comes before any sentence or control");
      assert.ok(!html.includes("Loading your workbench"), "no loading line in its place");
      return { lit, reading };
    },
  ],
  ["the-week-on-a-390-phone", (ctx) => weekOnPhone(ctx, 390)],
  ["the-week-on-a-320-phone", (ctx) => weekOnPhone(ctx, 320)],
];
