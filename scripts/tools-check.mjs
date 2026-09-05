/** Behavioural checks for the tools workbench. Synthetic files only; no accounts or mail. */
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { demoCsv } from "../lib/tools/second-visit/demo.ts";

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = option("--base", "http://localhost:3107");
const out = option("--out", ".phone-check/flows");
const engine = option("--engine", "chromium");
const only = option("--only", "");
const width = Number(option("--width", engine === "webkit" ? "390" : "1440"));
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true, isMobile: width < 700, hasTouch: width < 700 });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.setDefaultNavigationTimeout(60_000);
const errors = [];
const leaks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if ((request.postData() || "").includes("WorkbenchFixture")) leaks.push(request.url()); });
async function go(slug) { await page.goto(`${base}/tools${slug ? "/" + slug : ""}`, { waitUntil: "networkidle" }); }
async function shot(name) {
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); window.scrollTo(0, 0); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: page overflows`);
  await page.screenshot({ path: `${out}/${engine}-${width}-${name}.png`, fullPage: true });
  console.log(`PASS ${engine} ${width} ${name}`);
}
async function download(button) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}
const list = (ids) => "First Name,Last Name,URL\n" + ids.map(i => `WorkbenchFixture,Person ${i},https://www.linkedin.com/in/workbench-person-${i}`).join("\n");
const upload = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

try {
  if (!only || only === "index") {
  await go("");
  assert.equal(await page.locator(".bench-card__link").count(), 5);
  await shot("index");
  }

  if (!only || only === "headline") {
  await go("headline-check");
  await page.getByRole("button", { name: "Readable example", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector(".headline-lab__verdict")?.textContent === "Clean");
  await page.locator("#headline-source").fill('<h1>WorkbenchFixture &amp; readable words</h1><script>window.__unsafeHeadline = true</script>');
  await page.waitForFunction(() => document.querySelector(".headline-lab .hcheck__string")?.textContent === "WorkbenchFixture & readable words");
  assert.equal(await page.evaluate(() => window.__unsafeHeadline), undefined);
  await page.locator("#headline-source").fill(`<h1>${"<span>".repeat(6000)}WorkbenchFixture still readable${"</span>".repeat(6000)}</h1>`);
  await page.waitForFunction(() => document.querySelector(".headline-lab .hcheck__string")?.textContent === "WorkbenchFixture still readable");
  const unfinished = `<span data-x=${'"x"'.repeat(25)} missing tag end`;
  await page.locator("#headline-source").fill(`<h1>${unfinished}</h1>`);
  await page.waitForFunction(expected => document.querySelector(".headline-lab .hcheck__string")?.textContent === expected, unfinished);
  await page.getByRole("button", { name: "Split-letter example", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".headline-lab__verdict")?.textContent === "Fragmented");
  await shot("headline");
  }

  if (!only || only === "overlap") {
  await go("overlap");
  await page.getByRole("button", { name: "Try example lists" }).click();
  assert.ok(Number(await page.locator(".bench-metrics dd").first().innerText()) > 0);
  await page.locator("#local-list-0").setInputFiles(upload("first.csv", list([1,2,3,4,5,6])));
  await page.locator("#local-list-1").setInputFiles(upload("second.csv", list([4,5,6,7,8,9])));
  await page.waitForFunction(() => document.querySelector(".bench-metrics dd")?.textContent === "3");
  await page.locator("#overlap-search").fill("Person 4");
  assert.equal(await page.locator(".overlap-local-list li").count(), 1);
  const csv = await download(page.getByRole("button", { name: "Download this list" }));
  assert.match(csv.bytes.toString(), /Person 4/);
  assert.doesNotMatch(csv.bytes.toString(), /Person 5/);
  await shot("overlap");
  await page.locator("#local-list-1").setInputFiles(upload("broken.csv", "amount,date\n4,2026-01-01"));
  await page.getByText("That file has no usable LinkedIn profiles.", { exact: false }).waitFor();
  assert.equal(await page.locator(".bench-metrics").count(), 0);
  await page.getByRole("button", { name: "Connect with someone" }).click();
  await page.getByRole("button", { name: "Your file", exact: true }).click();
  await page.getByText("The room code service is not running", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Create a room", exact: true }).count(), 0);
  }

  if (!only || only === "drift") {
  await go("drift");
  const samples = Array.from({ length: 5 }, (_, i) => Array.from({ length: 12 }, (_, j) => [
    "I write about the things I build, and the work is usually more useful when I explain what went wrong.",
    "We tried a small change in the morning. It made the page easier to read, but we still had questions.",
    "The team can test the result before we send it out. I think that is worth doing each time.",
    "Sometimes you need to stop and ask what the reader came for. A clear answer takes time and a little care.",
    "This is my WorkbenchFixture piece about making a useful tool. We can learn from a mistake and try again.",
  ][(i + j % (i + 1)) % 5]).join(" ")).join("\n---\n");
  const draft = Array(12).fill("I think the next useful change is a clearer page. We can test it with a reader and find out whether the words are doing their job.").join(" ");
  await page.getByLabel("Things you wrote", { exact: true }).fill(samples);
  await page.getByLabel("The draft", { exact: true }).fill(draft);
  await page.getByRole("button", { name: "Build the profile", exact: true }).click();
  await page.getByText("Your writing report", { exact: true }).waitFor();
  assert.equal(await page.locator(".drift__report .bench-warning").count(), 0);
  await page.getByLabel("The draft", { exact: true }).fill(draft + " And now it has changed.");
  await page.locator(".drift__report .bench-warning").waitFor();
  assert.equal(await page.getByRole("button", { name: "Download report", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Measure the draft", exact: true }).click();
  assert.equal(await page.locator(".drift__report .bench-warning").count(), 0);
  const report = await download(page.getByRole("button", { name: "Download report", exact: true }));
  assert.match(report.bytes.toString(), /Your writing report/);
  await shot("drift");
  }

  if (!only || only === "relief") {
  await go("relief");
  await page.locator(".relief__plate").waitFor();
  const readout = await page.locator(".relief__cell").innerText();
  await page.getByRole("slider", { name: /^Week/ }).focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await page.locator(".relief__cell").innerText(), readout);
  for (const [label, ext] of [["PNG", ".png"], ["SVG in millimetres", ".svg"], ["Binary STL mesh", ".stl"]]) {
    const file = await download(page.getByRole("button", { name: label, exact: true }));
    assert.ok(file.name.endsWith(ext)); assert.ok(file.bytes.length > 100);
    if (ext === ".stl") assert.equal(file.bytes.length, 84 + file.bytes.readUInt32LE(80) * 50);
    if (ext === ".svg") assert.match(file.bytes.toString(), /<svg/);
  }
  await shot("relief");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 19 * 3600_000).toISOString());
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("dated-events.csv", "date,note\n" + dates.map(date => `${date},WorkbenchFixture`).join("\n")));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "SVG in millimetres" && !button.disabled));
  const csvPlate = await download(page.getByRole("button", { name: "SVG in millimetres", exact: true }));
  assert.match(csvPlate.name, /csv/);
  assert.match(csvPlate.bytes.toString(), /<svg/);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("too-thin.csv", "date\n2026-08-01"));
  await page.getByText("No new landscape is ready.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), false);
  }

  if (!only || only === "second-visit") {
  await go("second-visit");
  await page.getByRole("button", { name: "Or try it on a made-up sauna", exact: true }).click();
  await page.locator(".sv__big").waitFor();
  assert.match(await page.locator(".sv__big").innerText(), /^\d+\.\d+%$/);
  await page.waitForFunction(() => !document.querySelector(".sv__setup")?.open);
  const firstEstimate = await page.locator(".sv__big").innerText();
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  assert.notEqual(await page.locator(".sv__big").innerText(), firstEstimate);
  await shot("second-visit");
  const html = await download(page.getByRole("button", { name: /report/i }).last());
  assert.match(html.bytes.toString(), /<!doctype html>/i);
  const customerCount = await page.locator(".sv__results .bench-metrics dd").first().innerText();
  const fileCsv = demoCsv().trimEnd().split("\n").map((line, i) => `${line},${i === 0 ? "note" : "WorkbenchFixture"}`).join("\n");
  await page.getByLabel("Choose a file", { exact: true }).setInputFiles(upload("bookings.csv", fileCsv));
  await page.getByText("Your retention report", { exact: true }).waitFor();
  assert.equal(await page.locator(".sv__results .bench-metrics dd").first().innerText(), customerCount);
  await page.getByText("Review the file and column mapping", { exact: true }).click();
  await page.getByLabel("Visit or order date", { exact: true }).selectOption("-1");
  assert.equal(await page.locator(".sv__results").count(), 0);
  await page.getByRole("button", { name: "How many come back", exact: true }).click();
  await page.locator(".sv__message").waitFor();
  assert.equal(await page.locator(".sv__results").count(), 0);
  await page.getByLabel("Choose a file", { exact: true }).setInputFiles(upload("broken.csv", "wrong,columns\nnot,a booking"));
  await page.waitForFunction(() => document.querySelector(".sv")?.getAttribute("aria-busy") === "false");
  assert.equal(await page.locator(".sv__results").count(), 0);
  }
  assert.deepEqual(errors, [], "application exceptions");
  assert.deepEqual(leaks, [], "visitor text crossed the network");
  console.log(`PASS ${engine} ${width}: ${only || "all five tools"}, failures, downloads and no text uploads`);
} catch (error) {
  await page.screenshot({ path: `${out}/${engine}-${width}-failure.png`, fullPage: true }).catch(() => {});
  console.error(await page.locator(".drift__note, .drift__readiness, .sv__message").allTextContents());
  console.error("Application errors:", errors);
  throw error;
} finally { await browser.close(); }
