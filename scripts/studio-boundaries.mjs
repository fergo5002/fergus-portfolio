import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  prefix = process.env.STUDIO_PREFIX || "/lab",
  out = resolve(".codex/studio-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "no-preference",
  }),
  page = await context.newPage();
page.setDefaultTimeout(60000);
const results = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const b = (name) => page.getByRole("button", { name, exact: true });
async function open(slug) {
  await page.goto(`${base}${prefix}/${slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator(".studio").waitFor();
}
async function save(name) {
  const wait = page.waitForEvent("download");
  await b(name).click();
  const d = await wait,
    path = resolve(out, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}
async function check(name, fn) {
  try {
    const details = await fn();
    results.push({ name, ok: true, ...details });
    console.log("PASS", name, details ?? "");
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log("FAIL", name, e.message);
  }
}
await check("document-formats-and-media", async () => {
  await open("atlas");
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Secret orchid observatory</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const pptx = zipSync({
    "ppt/slides/slide1.xml": strToU8(
      '<a:p xmlns:a="urn:test"><a:r><a:t>Constellation planning</a:t></a:r></a:p>',
    ),
  });
  const xlsx = zipSync({
    "xl/sharedStrings.xml": strToU8(
      "<sst><si><t>Orchid revenue</t></si></sst>",
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      "<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>",
    ),
  });
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("The phosphor observatory", { font, size: 20 });
  const image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#ee8800" },
  })
    .png()
    .toBuffer();
  const remote = [];
  page.on("request", (r) => {
    if (r.url().includes("never-load.invalid")) remote.push(r.url());
  });
  const files = [
    { name: "report.docx", buffer: docx },
    { name: "slides.pptx", buffer: pptx },
    { name: "sheet.xlsx", buffer: xlsx },
    { name: "paper.pdf", buffer: await pdf.save() },
    { name: "orange.png", buffer: image },
    {
      name: "source.html",
      buffer: strToU8(
        '<img src="https://never-load.invalid/private"><script>fetch("https://never-load.invalid/run")</script>',
      ),
    },
    { name: "mystery.bin", buffer: new Uint8Array([0, 3, 5]) },
  ];
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(
      files.map((f) => ({
        name: f.name,
        mimeType: "application/octet-stream",
        buffer: Buffer.from(f.buffer),
      })),
    );
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Files7"),
  );
  const data = JSON.parse(
    await readFile(await save("Save map + extracted text"), "utf8"),
  );
  for (const [path, term] of [
    ["report.docx", "orchid"],
    ["slides.pptx", "Constellation"],
    ["sheet.xlsx", "42"],
    ["paper.pdf", "phosphor"],
  ])
    assert(data.files.find((f) => f.path === path).text.includes(term), path);
  assert.equal(remote.length, 0);
  await page
    .getByLabel("Search files and contents", { exact: true })
    .fill("orange.png");
  await page
    .locator(".atlas-file-list button")
    .filter({ hasText: "orange.png" })
    .click();
  await page.locator(".atlas-media").waitFor();
  await page.waitForFunction(
    () => document.querySelector("img.atlas-media")?.naturalWidth === 80,
  );
  await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const picture=await sharp(await readFile(await save("Save map image"))).stats();
  assert.equal(picture.channels[3].min,255);
  assert(picture.channels[1].max>100,"Export should contain the visible graph, with an opaque background.");
  return { formats: 7, unexpectedRequests: remote.length };
});
await check("one-thousand-file-map", async () => {
  const files = Array.from({ length: 1000 }, (_, i) => ({
      path: `folder-${Math.floor(i / 50)}/note-${i}.md`,
      text: `# Note ${i}\n[[note-${(i + 1) % 1000}]]\n${["phosphor magnet", "orchid garden", "tide coast", "synth melody"][i % 4]}`,
      size: 80,
      kind: "md",
      status: "read",
    })),
    start = Date.now();
  await page
    .getByLabel("Open a saved map", { exact: true })
    .setInputFiles({
      name: "large-map.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "atlas-v1", files })),
    });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".lab-metrics")
        ?.textContent?.includes("Files1,000") ||
      document
        .querySelector(".lab-metrics")
        ?.textContent?.includes("Files1000"),
  );
  const elapsed = Date.now() - start;
  await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
  await page
    .getByLabel("Search files and contents", { exact: true })
    .fill("note-999.md");
  await page
    .locator(".atlas-file-list button")
    .filter({ hasText: "note-999.md" })
    .click();
  await page
    .getByRole("heading", { name: "note-999.md", exact: true })
    .waitFor();
  await b("Focus neighbours").click();
  await page.waitForTimeout(250);
  await page
    .locator(".atlas-workspace")
    .screenshot({ path: resolve(out, "atlas-focus.png") });
  return { files: 1000, importMs: elapsed };
});
await check("archive-limit-preserves-current-map", async () => {
  const zip = zipSync(
    Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`f${i}.txt`, strToU8("hello")]),
    ),
  );
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles({
      name: "too-many.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await page
    .locator(".lab-error")
    .filter({ hasText: "Archive limit" })
    .waitFor();
  assert((await page.locator(".lab-metrics").textContent()).includes("1000"));
});
await check("public-github", async () => {
  await page
    .getByText("Public GitHub repository", { exact: true })
    .first()
    .click();
  await page
    .getByLabel("Public GitHub repository", { exact: true })
    .fill("octocat/Hello-World");
  await b("Fetch repository").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".lab-metrics")?.textContent?.includes("Files1") &&
      !document
        .querySelector(".lab-metrics")
        ?.textContent?.includes("Files1000"),
    {},
    { timeout: 60000 },
  );
  const data = JSON.parse(
    await readFile(await save("Save map + extracted text"), "utf8"),
  );
  assert(
    data.files.some(
      (f) => f.path === "README" && f.text.includes("Hello World"),
    ),
  );
  return { repository: "octocat/Hello-World", files: data.files.length };
});
await check("large-chat-filtering", async () => {
  await open("group-lore");
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
  await page
    .getByLabel("Import chat (.txt, .json, .zip)", { exact: true })
    .setInputFiles(file);
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("25,000"),
  );
  const elapsed = Date.now() - start;
  assert.equal(await page.locator(".lore-messages article").count(), 50);
  await page
    .getByLabel("Search message text", { exact: true })
    .fill("Message 24999 ");
  await page.waitForFunction(
    () => document.querySelectorAll(".lore-messages article").length === 1,
  );
  await page
    .locator(".studio-lore")
    .screenshot({ path: resolve(out, "lore-large.png") });
  return { messages: 25000, importMs: elapsed, renderedRows: 50 };
});
await check("cancelled-chat-read-stays-cancelled", async () => {
  await b("Clear filters").click();
  // Hold the read until the test has clicked Cancel. A fixed 800ms delay raced
  // Playwright's actionability checks and disappeared before slower CI clicked.
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.__originalStudioFileText = original;
    window.__studioReadFinished = false;
    File.prototype.text = async function () {
      if (this.name === "cancel-chat.json") {
        await new Promise((resolve) => { window.__releaseStudioRead = resolve; });
        const text = await original.call(this);
        window.__studioReadFinished = true;
        return text;
      }
      return original.call(this);
    };
  });
  try {
    await page.getByLabel("Import chat (.txt, .json, .zip)", { exact: true }).setInputFiles({
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
    assert((await page.locator(".lab-metrics").textContent()).includes("25,000"));
  } finally {
    await page.evaluate(() => {
      window.__releaseStudioRead?.();
      File.prototype.text = window.__originalStudioFileText;
      delete window.__releaseStudioRead;
      delete window.__originalStudioFileText;
      delete window.__studioReadFinished;
    });
  }
});
await check("redacted-pixels-and-moving-mask", async () => {
  await open("pocket-redact");
  await b("Try the example invoice").click();
  await page.locator(".redact-paper").waitFor();
  await page.getByLabel("Find mode", { exact: true }).selectOption("email");
  await b("Cover these text boxes").click();
  await b("Select / move").click();
  const svg = page.locator(".redact-paper>svg"),
    box = await svg.boundingBox();
  const point = {
    x: box.x + (150 / 900) * box.width,
    y: box.y + (300 / 1160) * box.height,
  };
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("ArrowRight");
  await b("Undo").click();
  await b("Build clean PDF").click();
  await page.locator(".redact-review>img").waitFor();
  const pixel = await page
    .locator(".redact-review>img")
    .evaluate(async (img) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return {
        black: [...ctx.getImageData(150, 300, 1, 1).data],
        white: [...ctx.getImageData(20, 20, 1, 1).data],
      };
    });
  assert.deepEqual(pixel.black, [0, 0, 0, 255]);
  assert.deepEqual(pixel.white, [255, 255, 255, 255]);
  return pixel;
});
await writeFile(
  resolve(out, "boundaries.json"),
  JSON.stringify({ results, errors }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
if (results.some((r) => !r.ok) || errors.length) process.exitCode = 1;
