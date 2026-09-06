import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";

const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  out = resolve(".codex/lab-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
await context.addInitScript(() => {
  const NativeAudioContext = window.AudioContext;
  window.__labAudio = [];
  window.__labNotes = 0;
  window.AudioContext = class extends NativeAudioContext {
    constructor(...args) { super(...args); window.__labAudio.push(this); }
    createOscillator() { const oscillator = super.createOscillator(); const start = oscillator.start.bind(oscillator); oscillator.start = (...args) => { window.__labNotes++; return start(...args); }; return oscillator; }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const report = [],
  errors = [];
let current = "hub";
page.on("pageerror", (e) => errors.push({ tool: current, message: e.message }));
async function open(slug) {
  current = slug;
  const response = await page.goto(`${base}/lab/${slug}`, {
    timeout: 120000,
    waitUntil: "domcontentloaded",
  });
  assert.equal(response.status(), 200);
  await page.locator(".lab-work").first().waitFor();
}
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function saved(name) {
  const result = page.waitForEvent("download");
  await click(name);
  const download = await result;
  const path = resolve(out, download.suggestedFilename());
  await download.saveAs(path);
  return path;
}
async function upload(label, name, data, mimeType = "application/json") {
  await page
    .getByLabel(label, { exact: true })
    .and(page.locator("input[type=file]"))
    .setInputFiles({ name, mimeType, buffer: Buffer.from(data) });
}
async function check(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  try {
    await fn();
    await page.screenshot({
      path: resolve(out, `${name}.png`),
      fullPage: true,
    });
    report.push({ tool: name, ok: true });
    console.log("PASS", name);
  } catch (e) {
    report.push({ tool: name, ok: false, error: e.message });
    console.log("FAIL", name, e.message);
    await page
      .screenshot({ path: resolve(out, `${name}-failure.png`), fullPage: true })
      .catch(() => {});
  }
}

await check("hub", async () => {
  current = "hub";
  await page.goto(`${base}/lab`, { timeout: 120000 });
  await page.locator(".lab-hub[data-ready=true]").waitFor();
  assert.equal(await page.locator(".lab-card").count(), 12);
  await page.locator(".lab-card").first().getByRole("button").click();
  await page.locator(".lab-card-link").first().click();
  await page
    .getByLabel("What worked? What would make you return?")
    .fill("Useful capacity comparison. Try session mode next.");
  await page.getByRole("link", { name: /All twelve prototypes/ }).click();
  await page
    .getByRole("button", { name: "Shortlisted", exact: true })
    .waitFor();
  const file = await saved("Download shortlist"),
    data = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(data.tools, ["bottleneck"]);
  assert.match(data.notes.bottleneck, /capacity/);
});
await check("bottleneck", async () => {
  await open("bottleneck");
  const before = await page.locator(".lab-metrics dd").first().innerText();
  await click("Pin as baseline");
  await page.getByLabel("Service stations", { exact: true }).fill("4");
  await click("Simulate");
  const after = await page.locator(".lab-metrics dd").first().innerText();
  assert.notEqual(before, after);
  assert.equal(await page.locator(".lab-chart polyline").count(), 2);
  const file = await saved("Download people CSV");
  assert.match(await readFile(file, "utf8"), /Person/);
  await page
    .getByLabel("Service / session (minutes)", { exact: true })
    .fill("0");
  await click("Simulate");
  await page.locator(".lab-error[role=alert]").waitFor();
  await click("Load example");
});
await check("good-window", async () => {
  await open("good-window");
  await click("Load example");
  await page
    .getByRole("button", { name: "Save window to calendar", exact: true })
    .first()
    .waitFor();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save window to calendar", exact: true })
    .first()
    .click();
  const file = await download;
  await file.saveAs(resolve(out, file.suggestedFilename()));
  await page.getByLabel("Maximum wind (km/h)").fill("0");
  await page
    .getByText(
      "No complete window matches. Relax a condition or try a shorter duration.",
    )
    .waitFor();
  await page.getByLabel("Maximum wind (km/h)").fill("25");
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await click("Fetch live forecast");
  await page.locator(".lab-error[role=alert]").waitFor();
  await page.unroute("https://api.open-meteo.com/**");
  await click("Load example");
});
await check("black-box", async () => {
  await open("black-box");
  assert.equal(await page.locator(".lab-event").count(), 7);
  await page.getByLabel("Show events").selectOption("1");
  assert.equal(await page.locator(".lab-event").count(), 1);
  await page.getByLabel("Show events").selectOption("2");
  await page.getByLabel("Supporting event").first().selectOption("1");
  await page
    .getByLabel("Review note", { exact: true })
    .fill("Repeated tests did not exercise autofill.");
  const file = await saved("Download annotated review"),
    data = JSON.parse(await readFile(file, "utf8"));
  assert.equal(data.summary.failures, 1);
  assert.equal(data.evidenceLinks[4], "1");
  await upload("Import file", "bad.jsonl", "not json", "application/x-ndjson");
  await page.locator(".lab-error[role=alert]").waitFor();
  await click("Load example");
  await page.getByLabel("Show events").selectOption("0");
});
await check("same-page", async () => {
  await open("same-page");
  await click("Load example");
  const file = await saved("Download my answers");
  assert.equal(JSON.parse(await readFile(file, "utf8")).format, "same-page-v1");
  await click("Reveal differences");
  await page.getByRole("heading", { name: "Conversation agenda" }).waitFor();
  assert.equal(await page.getByLabel("Decision / next experiment").count(), 6);
  await page
    .getByLabel("Decision / next experiment")
    .first()
    .fill("Interview both segments before choosing.");
  const record = await saved("Download discussion record");
  assert.match(await readFile(record, "utf8"), /Interview both segments/);
});
await check("what-if", async () => {
  await open("what-if");
  await page.getByLabel("Guests Low", { exact: true }).fill("100");
  await page.getByLabel("Guests Likely", { exact: true }).fill("100");
  await page.getByLabel("Guests High", { exact: true }).fill("100");
  await click("Run 2,000 scenarios");
  await page.locator(".lab-histogram").waitFor();
  const file = await saved("Export JSON");
  assert.equal(JSON.parse(await readFile(file, "utf8")).ranges.guests.min, 100);
  for (const model of ["project", "runway"]) {
    await page.getByLabel("Model", { exact: true }).selectOption(model);
    await click("Run 2,000 scenarios");
    assert.equal(await page.locator(".lab-metrics dd").count(), 3);
  }
});
await check("fair-play", async () => {
  await open("fair-play");
  const first = await page.locator(".lab-two > section").first().innerText();
  await page.getByLabel("Completed rounds to preserve").fill("2");
  const input = page.getByLabel(
    "Players, one per line. Optional skill 1–5 after a comma.",
  );
  await input.fill((await input.inputValue()).split("\n").slice(1).join("\n"));
  await click("Create / replan draw");
  assert.equal(
    await page.locator(".lab-two > section").first().innerText(),
    first.replace("Round 1", "Round 1 ✓"),
  );
  const file = await saved("Download draw CSV");
  assert.match(await readFile(file, "utf8"), /Round,Court/);
  assert.doesNotMatch(
    await page.locator(".lab-two > section").nth(2).innerText(),
    /Fergus/,
  );
});
await check("prove-it", async () => {
  await open("prove-it");
  await page
    .getByRole("button", { name: /Compare a direct fast POST/ })
    .click();
  await page.getByLabel("Your current hypothesis").selectOption("1");
  await click("Commit to conclusion");
  await page
    .getByRole("heading", { name: "Correct conclusion", exact: true })
    .waitFor();
  assert.match(await page.locator(".lab-metrics dd").innerText(), /8\d/);
  await page.getByLabel("Case", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: /Time each stage/ }).click();
  await page.getByLabel("Your current hypothesis").selectOption("2");
  await click("Commit to conclusion");
  await page
    .getByRole("heading", { name: "Correct conclusion", exact: true })
    .waitFor();
});
await check("group-lore", async () => {
  await open("group-lore");
  assert.equal(await page.locator(".lab-metrics dd").first().innerText(), "84");
  const file = await saved("Download activity portrait (SVG)"),
    svg = await readFile(file, "utf8");
  assert.match(svg, /Person 1/);
  assert.doesNotMatch(svg, /Aoife/);
  await upload(
    "WhatsApp text export (day/month/year)",
    "chat.txt",
    "06/09/2026, 10:00 - Alex: hello\n06/09/2026, 10:01 - Bea: hello\ncontinuation",
    "text/plain",
  );
  await page.waitForFunction(
    () => document.querySelector(".lab-metrics dd")?.textContent === "2",
  );
  await saved("Download aggregate JSON");
});
await check("pocket-redact", async () => {
  await open("pocket-redact");
  await click("Load example");
  await page.locator(".lab-paper img").waitFor();
  await click("Cover this rectangle");
  const file = await saved("Export flattened PDF"),
    doc = await PDFDocument.load(await readFile(file));
  assert.equal(doc.getPageCount(), 1);
  const resources = doc.getPage(0).node.Resources();
  const fonts = resources?.get(PDFName.of("Font"));
  if (fonts) assert.equal(doc.context.lookup(fonts).keys().length, 0);
  await page
    .getByRole("heading", { name: "Reopened export preview" })
    .waitFor();
  const pixel = await page
    .locator(".lab-redacted-preview img")
    .evaluate(async (img) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(100, 310, 1, 1).data];
    });
  assert.deepEqual(pixel, [0, 0, 0, 255]);
  const png = await saved("Export this page as PNG");
  await upload(
    "Open PDF, PNG or JPEG",
    "redacted.png",
    await readFile(png),
    "image/png",
  );
  const input = await PDFDocument.create(),
    font = await input.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const p = input.addPage([600, 800]);
    p.drawText(`Private sample ${i + 1}`, { x: 70, y: 700, font, size: 24 });
  }
  await upload(
    "Open PDF, PNG or JPEG",
    "two-pages.pdf",
    await input.save(),
    "application/pdf",
  );
  await page.getByLabel("Page", { exact: true }).selectOption("1");
  await page.getByLabel("Top (px)").fill("90");
  await click("Cover this rectangle");
  const second = await saved("Export flattened PDF");
  assert.equal(
    (await PDFDocument.load(await readFile(second))).getPageCount(),
    2,
  );
});
await check("clear-day", async () => {
  await open("clear-day");
  await page.getByLabel("Week beginning").fill("2026-09-07");
  await click("Load example week");
  assert.equal(await page.locator(".lab-day").count(), 5);
  const before = await page
    .getByLabel("Meeting", { exact: true })
    .locator("option")
    .first()
    .innerText();
  await click("Apply hypothetical move");
  const after = await page
    .getByLabel("Meeting", { exact: true })
    .locator("option")
    .first()
    .innerText();
  assert.notEqual(before, after);
  const file = await saved("Download proposed week .ics");
  assert.match(await readFile(file, "utf8"), /BEGIN:VCALENDAR/);
  await saved("Download focus blocks .ics");
  const ics =
    "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:test\nDTSTART:20260907T100000Z\nDTEND:20260907T110000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260908T100000Z\nSUMMARY:Recurring meeting\nEND:VEVENT\nEND:VCALENDAR";
  await upload("Import .ics calendar", "week.ics", ics, "text/calendar");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".lab-block:not(.lab-block--free)").length ===
      2,
  );
});
await check("code-atlas", async () => {
  await open("code-atlas");
  const zip = zipSync({
    "src/a.ts": strToU8("one\ntwo\nthree"),
    "src/b.ts": strToU8("one\ntwo"),
    "node_modules/vendor.js": strToU8("ignored"),
  });
  await upload(
    "Open source ZIP or snapshot JSON",
    "source.zip",
    zip,
    "application/zip",
  );
  await page.waitForFunction(
    () => document.querySelector(".lab-metrics dd")?.textContent === "2",
  );
  await page.getByRole("button", { name: /src\/a.ts: 3 lines/ }).click();
  const snapshot = await saved("Download metrics snapshot"),
    data = JSON.parse(await readFile(snapshot, "utf8"));
  assert.equal(data.files.length, 2);
  data.files[0].lines = 10;
  data.files[0].bytes = 50;
  await upload(
    "Compare another snapshot / ZIP",
    "after.json",
    JSON.stringify(data),
  );
  await page
    .getByRole("heading", { name: "Changes against baseline" })
    .waitFor();
  assert.match(await page.locator(".lab-table-wrap").last().innerText(), /\+7/);
});
await check("resonance", async () => {
  await open("resonance");
  await click("Play instrument");
  await page
    .getByText("Playing. Crossing the centre plucks a note.", { exact: true })
    .waitFor();
  await page.waitForTimeout(2500);
  assert.ok(await page.evaluate(() => window.__labNotes > 0), "The instrument must schedule actual oscillator notes.");
  await click("Stop");
  await page.waitForFunction(() => window.__labAudio.every(context => context.state === "closed"));
  await page
    .getByText("Stopped. Press Play to enable sound.", { exact: true })
    .waitFor();
  const file = await saved("Download patch"),
    patch = JSON.parse(await readFile(file, "utf8"));
  assert.equal(patch.voices.length, 4);
  await upload(
    "Import patch JSON",
    "bad.json",
    '{"format":"resonance-v1","voices":[{"note":999,"period":0}]}',
  );
  await page.locator(".lab-error[role=alert]").waitFor();
  await upload("Import patch JSON", "good.json", JSON.stringify(patch));
  await click("Play instrument");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page
    .getByText("Stopped. Press Play to enable sound.", { exact: true })
    .waitFor();
});

await writeFile(
  resolve(out, "functional-report.json"),
  JSON.stringify({ base, report, errors }, null, 2),
);
console.log(JSON.stringify({ report, errors }, null, 2));
await browser.close();
if (report.some((r) => !r.ok) || errors.length) process.exitCode = 1;
