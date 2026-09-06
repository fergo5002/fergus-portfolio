import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.LAB_URL || "http://127.0.0.1:3106",
  out = resolve(".codex/lab-review/mobile");
await mkdir(out, { recursive: true });
const slugs = [
    "bottleneck",
    "good-window",
    "black-box",
    "same-page",
    "what-if",
    "fair-play",
    "prove-it",
    "group-lore",
    "pocket-redact",
    "clear-day",
    "code-atlas",
    "resonance",
  ],
  reports = [];
for (const [engineName, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  let browser;
  try {
    browser = await engine.launch({ headless: true });
  } catch (error) {
    reports.push({ engine: engineName, unavailable: error.message });
    continue;
  }
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(60000);
  for (const slug of slugs) {
    const errors = [];
    const listener = (e) => errors.push(e.message);
    page.on("pageerror", listener);
    try {
      await page.goto(`${base}/lab/${slug}`, { timeout: 120000 });
      await page.locator(".lab-work").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (["good-window", "pocket-redact"].includes(slug))
        await page
          .getByRole("button", { name: "Load example", exact: true })
          .click();
      if (slug === "clear-day")
        await page
          .getByRole("button", { name: "Load example week", exact: true })
          .click();
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        width: document.documentElement.scrollWidth,
        smallInputs: [
          ...document.querySelectorAll(
            '.lab input:not([type="checkbox"]),.lab textarea,.lab select',
          ),
        ]
          .filter(
            (e) =>
              e.getBoundingClientRect().width &&
              parseFloat(getComputedStyle(e).fontSize) < 16,
          )
          .map((e) => ({ tag: e.tagName, font: getComputedStyle(e).fontSize })),
        smallButtons: [...document.querySelectorAll(".lab button")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width && r.height && (r.width < 43 || r.height < 43);
          })
          .map((e) => ({
            text: e.textContent?.slice(0, 40),
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
      }));
      await page.screenshot({
        path: resolve(out, `${engineName}-${slug}.png`),
        fullPage: true,
      });
      reports.push({ engine: engineName, slug, ...metrics, errors });
      console.log(engineName, slug, JSON.stringify(metrics));
    } catch (error) {
      reports.push({ engine: engineName, slug, error: error.message, errors });
      console.log("FAIL", engineName, slug, error.message);
    }
    page.off("pageerror", listener);
  }
  await browser.close();
}
await writeFile(resolve(out, "report.json"), JSON.stringify(reports, null, 2));
if (
  reports.some(
    (r) =>
      r.error ||
      r.overflow ||
      r.smallInputs?.length ||
      r.smallButtons?.length ||
      r.errors?.length,
  )
)
  process.exitCode = 1;
