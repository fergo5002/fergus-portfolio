import { chromium, webkit } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  out = resolve(".codex/studio-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
await context.addInitScript(() => {
  const Native = window.AudioContext;
  window.__studioAudio = [];
  window.__studioNotes = 0;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      window.__studioAudio.push(this);
    }
    createOscillator() {
      const o = super.createOscillator(),
        start = o.start.bind(o);
      o.start = (...args) => {
        window.__studioNotes++;
        return start(...args);
      };
      return o;
    }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [],
  report = [];
let current = "";
page.on("pageerror", (e) => errors.push({ tool: current, message: e.message }));
async function open(slug) {
  current = slug;
  const r = await page.goto(`${base}/lab/${slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.equal(r.status(), 200);
  await page.locator(".studio").first().waitFor();
}
const button = (name) => page.getByRole("button", { name, exact: true });
async function save(name) {
  const event = page.waitForEvent("download");
  await button(name).click();
  const file = await event,
    path = resolve(out, file.suggestedFilename());
  await file.saveAs(path);
  return path;
}
async function check(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  current = name;
  try {
    await fn();
    await page.screenshot({
      path: resolve(out, `${name}.png`),
      fullPage: true,
    });
    report.push({ name, ok: true });
    console.log("PASS", name);
  } catch (e) {
    report.push({ name, ok: false, error: e.message });
    console.log("FAIL", name, e.message);
    await page
      .screenshot({ path: resolve(out, `${name}-failure.png`), fullPage: true })
      .catch(() => {});
  }
}
await check("atlas", async () => {
  await open("atlas");
  assert.equal(await page.locator(".atlas-canvas").count(), 1);
  await page
    .getByLabel("Search files and contents", { exact: true })
    .fill("Morning swim");
  await page
    .locator(".atlas-file-list button")
    .filter({ hasText: "Coast/Morning swim.md" })
    .click();
  await page
    .getByRole("heading", { name: "Morning swim.md", exact: true })
    .waitFor();
  await button("Focus neighbours").click();
  await button("Pin node").click();
  await button("Release node").click();
  await button("Whole map").click();
  const zip = zipSync({
    "notes/hello.md": strToU8("# hello\n[[other]]\nphosphor magnet"),
    "notes/other.md": strToU8("# other\nphosphor magnet"),
    "photo.dat": new Uint8Array([0, 1, 2, 3]),
  });
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles({
      name: "knowledge.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await page
    .getByText("Finding connections…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Files3"),
  );
  const saved = JSON.parse(
    await readFile(await save("Save map + extracted text"), "utf8"),
  );
  assert.equal(saved.files.length, 3);
  assert(saved.files.some((f) => f.status === "metadata"));
  await page
    .getByLabel("Open a saved map", { exact: true })
    .setInputFiles({
      name: "map.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await page
    .getByText("Finding connections…", { exact: true })
    .waitFor({ state: "hidden" });
  await button("Explore an example").click();
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Files34"),
  );
  const graph = page.locator(".atlas-canvas");
  await graph.scrollIntoViewIfNeeded();
  await graph.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("0");
});
await check("group-lore", async () => {
  await open("group-lore");
  const first = page.locator(".lore-heat-row button:not(:disabled)").first();
  await first.click();
  assert((await page.locator(".lore-messages article").count()) > 0);
  await button("Clear filters").click();
  await page.getByLabel("Search message text", { exact: true }).fill("coffee");
  await page.waitForTimeout(200);
  const summary = JSON.parse(
    await readFile(await save("Download anonymous summary"), "utf8"),
  );
  assert(!JSON.stringify(summary).includes("coffee"));
  await button("Clear filters").click();
  await button("Make a portrait").click();
  const svg = await readFile(await save("Download portrait SVG"), "utf8");
  assert(svg.includes("The shape of us"));
  await page
    .getByLabel("Import chat (.txt, .json, .zip)", { exact: true })
    .setInputFiles({
      name: "telegram.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          messages: [
            {
              type: "message",
              date: "2026-09-01T10:00:00",
              from: "Private Name",
              text: ["hello ", { text: "there" }],
            },
          ],
        }),
      ),
    });
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Messages1"),
  );
  assert.equal(await page.locator(".lore-messages article").count(), 1);
  await button("Explore an example").click();
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Messages84"),
  );
});
await check("prove-it", async () => {
  await open("prove-it");
  await page.locator(".detective-hypotheses button").nth(1).click();
  await page
    .getByLabel("Before you test: what result would change your mind?", {
      exact: true,
    })
    .fill("A provider rejection on both requests would change my mind.");
  await page
    .locator(".detective-tests button")
    .filter({ hasText: "Compare a direct fast POST" })
    .click();
  await page
    .getByLabel("Confidence in your selected explanation", { exact: true })
    .fill("90");
  await button("Commit your conclusion").click();
  await page
    .getByRole("heading", {
      name: "You found it. And you can show why.",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".detective-comparison tbody tr").count(), 3);
  await save("Download case report");
  await button("Next unsolved case").click();
  await page
    .getByRole("heading", { name: "The third coffee machine", exact: true })
    .waitFor();
});
await check("resonance", async () => {
  await open("resonance");
  await button("Play voice 1").click();
  await page.waitForFunction(() => window.__studioNotes > 0);
  await button("Play sequence").click();
  const count = await page.evaluate(() => window.__studioAudio.length);
  await page.getByLabel("Tempo", { exact: true }).fill("120");
  await page
    .getByRole("button", { name: "Voice 1, step 2", exact: true })
    .click();
  await page.locator(".music-xy").click({ position: { x: 50, y: 50 } });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__studioAudio.length), count);
  await button("Stop sound").click();
  await page.waitForFunction(() =>
    window.__studioAudio.every((c) => c.state === "closed"),
  );
  const patch = JSON.parse(await readFile(await save("Save patch"), "utf8"));
  assert.equal(patch.bpm, 120);
  const wav = await readFile(await save("Render 8 bars to WAV"));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert(wav.length > 1_000_000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2)
    peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert(peak > 100 && peak < 32768);
  report.push({ name: "wav-pixels", bytes: wav.length, peak });
  await button("Play sequence").click();
  await page.locator("a.bench-back").click();
  await page.waitForFunction(() =>
    window.__studioAudio.length > 0 && window.__studioAudio.every((c) => c.state === "closed"),
  );
  await open("resonance");
});
await check("pocket-redact", async () => {
  await open("pocket-redact");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const p = pdf.addPage([600, 800]);
    p.drawText(`Page ${i + 1} private@example.org`, {
      x: 60,
      y: 650,
      font,
      size: 22,
    });
  }
  const bytes = await pdf.save();
  await page
    .getByLabel("Open a document or image", { exact: true })
    .setInputFiles({
      name: "private.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await page.locator(".redact-paper").waitFor();
  await page.getByLabel("Find mode", { exact: true }).selectOption("email");
  await button("Cover these text boxes").click();
  await button("Undo").click();
  await button("Redo").click();
  await page.getByLabel("Zoom", { exact: true }).fill("150");
  await button("Fit page").click();
  await page
    .getByRole("button", { name: "Page 2, 0 masks", exact: true })
    .click();
  await page.getByLabel("Find mode", { exact: true }).selectOption("email");
  await button("Cover these text boxes").click();
  await button("Build clean PDF").click();
  await page.locator(".redact-review").waitFor();
  assert(
    await page
      .getByRole("button", { name: "Download reviewed PDF (0/2)", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("I have inspected this exported page", { exact: true })
    .check();
  await button("Page 2").click();
  await page
    .getByLabel("I have inspected this exported page", { exact: true })
    .check();
  const path = await save("Download reviewed PDF (2/2)"),
    clean = await PDFDocument.load(await readFile(path));
  assert.equal(clean.getPageCount(), 2);
  for (const p of clean.getPages()) {
    const fonts = p.node.Resources()?.lookup(PDFName.of("Font"));
    assert(!fonts || fonts.keys().length === 0);
  }
  await button("Back to editing").click();
});
if (!process.argv[2] || process.argv[2] === "mobile") {
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const mobile = await type.launch({ headless: true }),
      ctx = await mobile.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        isMobile: true,
        hasTouch: true,
      }),
      p = await ctx.newPage();
    p.setDefaultTimeout(60000);
    for (const slug of [
      "atlas",
      "group-lore",
      "prove-it",
      "resonance",
      "pocket-redact",
    ]) {
      try {
        await p.goto(`${base}/lab/${slug}`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
        await p.locator(".studio").waitFor();
        if (slug === "pocket-redact")
          await p
            .getByRole("button", {
              name: "Try the example invoice",
              exact: true,
            })
            .click();
        await p.waitForTimeout(300);
        const dimensions = await p.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert(
          dimensions.scroll <= dimensions.width + 1,
          JSON.stringify(dimensions),
        );
        await p.screenshot({
          path: resolve(out, `${slug}-${name}-mobile.png`),
          fullPage: true,
        });
        report.push({ name: `${slug}-${name}-mobile`, ok: true });
        console.log("PASS", slug, name, "mobile");
      } catch (e) {
        report.push({
          name: `${slug}-${name}-mobile`,
          ok: false,
          error: e.message,
        });
        console.log("FAIL", slug, name, e.message);
      }
    }
    await mobile.close();
  }
}
await writeFile(
  resolve(out, "report.json"),
  JSON.stringify({ report, errors }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ report, errors }, null, 2));
if (report.some((r) => r.ok === false) || errors.length) process.exitCode = 1;
