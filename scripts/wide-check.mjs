#!/usr/bin/env node
/**
 * Wide-screen check.
 *
 * The phone check proves the site at 320 and 390. This proves it at the other
 * end, from a 1600px monitor to a 5120 super-ultrawide, where the page grows to
 * four fifths of the screen (capped at 2700px) and each route opens into more
 * panes rather than stretching what it has. It fails on:
 *
 *   overflow   the document is wider than the viewport (the widest element is named)
 *   fill       the page is narrower than three quarters of the screen, or, past the
 *              cap, is not exactly the cap. This is the brief, as a number.
 *   overlap    two panes of one tiled layout cover each other: a grid placement that
 *              put two windows in one cell, or a span that reached into a neighbour
 *   scroller   something on the page scrolls sideways on a monitor. On a phone a
 *              sideways list can be the design; on a 1600px screen it means a pane
 *              was cut too narrow for what is in it (the MCP install line was, at
 *              the first try). Code blocks in prose and a tool's own stage are
 *              exempt: wrapping code changes what it says, and the stage is the
 *              tool's business.
 *   untiled    a layout that should have opened into panes at this width is still
 *              one column. Without this the tiling could vanish (a class renamed, a
 *              block deleted) and every other check would pass on the stacked page.
 *   grows      typing into the home terminal made the page taller. In a tile the
 *              scrollback must scroll; sized by its content, three commands once grew
 *              the terminal, the about window beside it and the page by 2,460px.
 *   name-wrap  the hero name broke onto two lines. Every home tier was chosen so it
 *              does not, and the width it has is the first thing a new tier gets wrong.
 *   timeout    one route at one width took longer than PAGE_DEADLINE_MS. A hung page
 *              is a finding with a name, never a silent run that never ends.
 *   assets     a stylesheet, script or document came back 4xx or 5xx, so the page
 *              under the instrument is not the page. Reported alone, as in the phone
 *              check: every other finding would be a true fact about an unstyled
 *              document and none of them about the site.
 *
 * It measures layout, so every context runs with `prefers-reduced-motion: reduce`
 * and the boot is skipped by the same rule: a box halfway through an entrance is
 * not where it lives. Nothing here reads pixels, so a hidden tab or a software
 * renderer cannot change an answer. (One thing that does differ in headless
 * Chromium: the tube's WebGL is software-rendered and can paint a bright block a
 * real GPU never shows. That is a picture, not a box, and this does not look at it.)
 *
 *   node scripts/wide-check.mjs --self-test
 *   node scripts/wide-check.mjs --base http://localhost:3000 --from-sitemap
 *   node scripts/wide-check.mjs --base http://localhost:3000 --routes /,/projects --widths 1920,2560
 *   node scripts/wide-check.mjs --routes /mcp --widths 2560 --inject ".mcp { display: block !important }"
 *
 * `--inject` adds a stylesheet to every page before measuring. It is the
 * revert-to-confirm switch: undo one layout and the check must go red.
 *
 * `--self-test` serves two bundled fixtures and asserts that every planted fault
 * in `bad.html` is caught by name and that `good.html` is clean, so loosening a
 * check is red rather than quiet.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "scripts", "wide-check-fixtures");

/** Real monitor shapes: a 1600 laptop-dock, 1080p, 1440p, 21:9 and 32:9. */
const SCREENS = [
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
  { width: 5120, height: 1440 },
];

/** Mirrors `--maxw-fill` and `--maxw-cap` in app/globals.css. */
const FILL = 0.8;
const CAP = 2700;
const MIN_FILL = 0.75;

/** The tiled layouts, whose direct children must never cover each other. */
const TILED = [
  ".home",
  ".home-highlights",
  ".exp__list",
  ".exp",
  ".proj__grid",
  ".project .window__body",
  ".writing__list--figured",
  ".post",
  ".contact-page",
  ".meeting",
  ".meeting-card__link",
  ".bench-grid",
  ".tool-workbench",
  ".mcp",
  ".nosignal",
];

/**
 * Where a layout must have split, into how many columns, from what screen
 * width, and on which route it must exist at all: a renamed or deleted hook
 * class would otherwise leave nothing to measure and read as a pass. `tracks`
 * is the exact column count a tier draws; without it, two or more will do.
 * Every `from` must be a breakpoint one of the stylesheets uses
 * (app/wide.test.ts holds them in step).
 */
const TILES = [
  { sel: ".home", on: "^/$", from: 1560, to: 1839, tracks: 2 },
  { sel: ".home", on: "^/$", from: 1840, to: 2439, tracks: 3 },
  { sel: ".home", on: "^/$", from: 2440, to: 2999, tracks: 2 },
  { sel: ".home", on: "^/$", from: 3000, tracks: 3 },
  // A commit splits into who and what until the log turns on its side, when
  // the log itself is the grid and each card stacks again.
  { sel: ".exp", on: "^/experience$", from: 1560, to: 2299, tracks: 2 },
  { sel: ".exp__list", on: "^/experience$", from: 2300 },
  { sel: ".proj__grid", on: "^/projects$", from: 1560, tracks: 3 },
  { sel: ".project .window__body", on: "^/projects$", from: 3000, tracks: 2 },
  { sel: ".writing__list--figured", on: "^/writing$", from: 1560, to: 2299, tracks: 2 },
  { sel: ".writing__list--figured", on: "^/writing$", from: 2300, tracks: 3 },
  { sel: ".post", on: "^/writing/.+", from: 1560, tracks: 3 },
  { sel: ".contact-page:not(.contact-page--meet)", on: "^/contact$", from: 1560, tracks: 2 },
  // String.raw: in a plain string "\?" is just "?", and the pattern then
  // never matched the booking page it exists for (code review, 2026-10-19).
  { sel: ".meeting", on: String.raw`^/contact\?meet=`, from: 1560, tracks: 2 },
  { sel: ".bench-grid", on: "^/tools$", from: 2300, tracks: "children" },
  { sel: ".mcp", on: "^/mcp$", from: 1840, tracks: 2 },
  { sel: ".tool-workbench", on: "^/tools/.+", from: 2000, tracks: 2 },
  { sel: ".nosignal", on: "^/wide-check-no-such-page$", from: 1560, tracks: 2 },
];

/** Sideways scrolling that is somebody else's decision. */
const SCROLLER_EXEMPT = [".prose__pre", ".bench-stage"];

function parseArgs(argv) {
  const out = { base: "http://localhost:3000", routes: [], fromSitemap: false, selfTest: false, widths: null, inject: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--routes") out.routes.push(...argv[++i].split(",").filter(Boolean));
    else if (a === "--from-sitemap") out.fromSitemap = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--widths") out.widths = argv[++i].split(",").map(Number);
    else if (a === "--inject") out.inject = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

/** Runs in the page. Returns findings as { check, el, detail }. */
function measure({ tiled, tiles, exempt, fill, cap, minFill }) {
  const findings = [];
  const name = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const vw = window.innerWidth;

  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) {
    let widest = null;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && (!widest || r.right > widest.r)) widest = { el, r: r.right };
    }
    findings.push({ check: "overflow", el: widest ? name(widest.el) : "document", detail: `${doc.scrollWidth}px in ${vw}px` });
  }

  const screen = document.querySelector(".screen");
  if (screen) {
    const w = screen.getBoundingClientRect().width;
    const expected = Math.min(cap, Math.max(1040, vw * fill));
    if (vw * fill >= cap) {
      if (Math.abs(w - cap) > 1) findings.push({ check: "fill", el: name(screen), detail: `${Math.round(w)}px, cap is ${cap}px` });
    } else if (w / vw < minFill - 0.001) {
      findings.push({ check: "fill", el: name(screen), detail: `${Math.round(w)}px is ${(100 * w / vw).toFixed(1)}% of ${vw}px (expected ${Math.round(expected)}px)` });
    }
  }

  const area = (r) => r.width * r.height;
  for (const sel of tiled) {
    for (const box of document.querySelectorAll(sel)) {
      if (getComputedStyle(box).display !== "grid") continue;
      const kids = [...box.children].filter((k) => {
        const cs = getComputedStyle(k);
        if (cs.position === "absolute" || cs.position === "fixed" || cs.display === "none") return false;
        return area(k.getBoundingClientRect()) > 0;
      });
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect();
          const b = kids[j].getBoundingClientRect();
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 1 && y > 1) {
            findings.push({ check: "overlap", el: `${name(kids[i])} + ${name(kids[j])}`, detail: `in ${sel}, ${Math.round(x)} by ${Math.round(y)}px` });
          }
        }
      }
    }
  }

  const here = location.pathname + location.search;
  for (const { sel, on, from, to = Infinity, tracks: want } of tiles) {
    if (vw < from || vw > to) continue;
    if (on && !new RegExp(on).test(here)) continue;
    const els = document.querySelectorAll(sel);
    if (on && els.length === 0) findings.push({ check: "untiled", el: sel, detail: `not on ${here}, so nothing here can tile` });
    for (const el of els) {
      const cs = getComputedStyle(el);
      const tracks = cs.display === "grid" ? cs.gridTemplateColumns.split(" ").filter(Boolean).length : 1;
      const expected = want === "children" ? el.children.length : want;
      if (expected ? tracks !== expected : tracks < 2) {
        findings.push({ check: "untiled", el: name(el), detail: `${tracks} column${tracks === 1 ? "" : "s"} at ${vw}px, the tier from ${from}px draws ${expected || "two or more"}` });
      }
    }
  }

  const main = document.querySelector("main") || document.body;
  for (const el of main.querySelectorAll("*")) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (exempt.some((s) => el.closest(s))) continue;
    // Chromium keeps a closed disclosure's contents laid out, so the MCP
    // console's raw JSON measured 5901px wide while nobody could see it. The
    // phone check ignores closed details for the same reason.
    const shut = el.closest("details:not([open])");
    if (shut && !el.closest("summary")) continue;
    if (area(el.getBoundingClientRect()) === 0) continue;
    findings.push({ check: "scroller", el: name(el), detail: `${el.scrollWidth}px of content in ${el.clientWidth}px` });
  }

  const hero = document.querySelector(".hero__name");
  if (hero && vw >= 1560) {
    const lh = parseFloat(getComputedStyle(hero).lineHeight) || parseFloat(getComputedStyle(hero).fontSize) * 1.1;
    const h = hero.getBoundingClientRect().height;
    if (h > lh * 1.5) findings.push({ check: "name-wrap", el: name(hero), detail: `${Math.round(h)}px tall at a ${Math.round(lh)}px line` });
  }
  return findings;
}

/** Types into the home terminal's tile and reports if the page got taller. */
async function terminalGrowth(page, width) {
  const input = page.locator(".home > .term .term__input");
  if (width < 1560 || (await input.count()) === 0) return [];
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await height();
  for (const cmd of ["help", "help"]) {
    await input.fill(cmd);
    await input.press("Enter");
  }
  await page.waitForTimeout(300);
  const after = await height();
  return after > before + 2
    ? [{ check: "grows", el: "div.home > .term", detail: `the page went from ${before}px to ${after}px after two commands` }]
    : [];
}

/**
 * How long one route at one width may take before it is a finding. On
 * 2026-10-19 a run hung on its first page for fifteen hours, with nothing
 * printed, while the laptop slept under it; in CI that would have held the
 * phone job until GitHub killed it, and said nothing about why.
 */
const PAGE_DEADLINE_MS = 90_000;

function deadline(ms, label) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer from ${label} within ${ms / 1000}s`)), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

async function measurePage(page, t, s, { allowDocument404, tiles, inject }) {
  const broken = [];
  // The phone check's rule: a stylesheet or document counts wherever it
  // came from, a script only under `/_next/`. `/_vercel/insights/script.js`
  // 404s on `next start` and on every real deploy's pretty path while
  // analytics works (AGENTS.md), and a checker that cries wolf about a
  // documented non-problem is worse than none.
  const onResponse = (res) => {
    const type = res.request().resourceType();
    const path = new URL(res.url()).pathname;
    if (res.status() < 400) return;
    const counts = type === "stylesheet" || type === "document" || (type === "script" && path.startsWith("/_next/"));
    if (!counts) return;
    if (type === "document" && allowDocument404(t)) return;
    broken.push(`${res.status()} ${type} ${path}`);
  };
  page.on("response", onResponse);
  try {
    await page.goto(t.url, { waitUntil: "load" });
    // A tool may hold a connection open; idle is a courtesy, not a gate.
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // The boot owns `booting` until it lets go; under reduce it lets go at
    // once, and this waits for that rather than for a guessed delay.
    await page.waitForFunction(() => !document.documentElement.classList.contains("booting"), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready);
    if (inject) await page.addStyleTag({ content: inject });
  } finally {
    page.off("response", onResponse);
  }
  if (broken.length) return broken.map((b) => ({ check: "assets", el: b, detail: "the page under the instrument is not the page" }));
  const failures = await page.evaluate(measure, { tiled: TILED, tiles, exempt: SCROLLER_EXEMPT, fill: FILL, cap: CAP, minFill: MIN_FILL });
  failures.push(...(await terminalGrowth(page, s.width)));
  return failures;
}

async function runAll(
  targets,
  screens,
  { allowDocument404 = () => false, tiles = TILES, inject = "", pageDeadline = PAGE_DEADLINE_MS } = {},
) {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const s of screens) {
      const context = await browser.newContext({ viewport: s, reducedMotion: "reduce" });
      let page = await context.newPage();
      for (const t of targets) {
        const limit = deadline(pageDeadline, t.label);
        let failures;
        try {
          failures = await Promise.race([measurePage(page, t, s, { allowDocument404, tiles, inject }), limit.promise]);
        } catch (err) {
          failures = [{ check: "timeout", el: t.label, detail: err.message }];
          // The stuck page may never answer again; the next route gets a new one.
          await page.close().catch(() => {});
          page = await context.newPage();
        } finally {
          limit.clear();
        }
        results.push({ label: t.label, width: s.width, failures });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

function report(results) {
  let bad = 0;
  for (const r of results) {
    if (r.failures.length === 0) {
      console.log(`ok    ${String(r.width).padStart(4)}  ${r.label}`);
      continue;
    }
    bad++;
    console.log(`FAIL  ${String(r.width).padStart(4)}  ${r.label}`);
    for (const f of r.failures) console.log(`        ${f.check.padEnd(9)} ${f.el}  (${f.detail})`);
  }
  return bad;
}

/** Same rule as the phone check: one article stands for the template. */
async function routesFromSitemap(base) {
  const res = await fetch(new URL("/sitemap.xml", base));
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const articles = paths.filter((p) => p.startsWith("/writing/")).slice(0, 2);
  return [...paths.filter((p) => !p.startsWith("/writing/")), ...articles];
}

async function selfTest() {
  const PAGES = { "/good": "good.html", "/bad": "bad.html" };
  const server = createServer((req, res) => {
    // Never answered: the self-test's hung page.
    if (req.url === "/hang") return;
    const file = PAGES[req.url];
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(FIXTURES, file)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const screens = [{ width: 1920, height: 1080 }];
    const results = await runAll(
      [
        { label: "bad", url: `${base}/bad` },
        { label: "good", url: `${base}/good` },
        { label: "hang", url: `${base}/hang` },
      ],
      screens,
      // The fixtures carry no route of the real site, so two expectations are
      // pointed at them: an article that must tile on both pages (it does on
      // the good one), and a layout that is missing from the bad one.
      {
        tiles: [
          ...TILES,
          { sel: ".post", on: "^/(good|bad)$", from: 1560 },
          { sel: ".exp", on: "^/bad$", from: 1560 },
        ],
        pageDeadline: 5000,
      },
    );
    report(results);
    const problems = [];
    const bad = results.find((r) => r.label === "bad");
    const good = results.find((r) => r.label === "good");
    for (const [check, el] of [
      ["overflow", "div#wide"],
      ["fill", "main"],
      ["overlap", "section#pane-a + section#pane-b"],
      ["scroller", "div#sideways"],
      ["name-wrap", "h1#name"],
      ["untiled", "article#stacked"],
      ["untiled", ".exp"],
      ["grows", "div.home > .term"],
    ]) {
      if (!bad.failures.some((f) => f.check === check && f.el.includes(el))) problems.push(`bad fixture: ${check} on ${el} was not caught`);
    }
    // Exactly the planted faults: an extra finding on the bad page is a check
    // that has started reading something else.
    if (bad.failures.length !== 8) problems.push(`bad fixture: expected 8 findings, got ${bad.failures.length}`);
    if (good.failures.length) problems.push(`good fixture: expected none, got ${good.failures.map((f) => f.check).join(", ")}`);
    const hang = results.find((r) => r.label === "hang");
    if (!(hang.failures.length === 1 && hang.failures[0].check === "timeout")) problems.push("hang fixture: a page that never answered was not reported as a timeout");
    if (problems.length) {
      for (const p of problems) console.error(`self-test: ${p}`);
      process.exitCode = 1;
    } else {
      console.log("self-test: every planted fault caught, good fixture clean");
    }
  } finally {
    server.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  const routes = [...args.routes];
  if (args.fromSitemap) routes.push(...(await routesFromSitemap(args.base)), "/contact?meet=coffee");
  // A page that does not exist, for the test card. Its document is meant to 404.
  const MISSING = "/wide-check-no-such-page";
  if (args.fromSitemap) routes.push(MISSING);
  if (routes.length === 0) throw new Error("no routes: pass --routes a,b or --from-sitemap");
  // Any width can be asked for, so a breakpoint's edges can be probed; the
  // height follows the nearest real monitor at or under it.
  const screens = args.widths
    ? args.widths.map((width) => {
        if (!Number.isFinite(width) || width < 320) throw new Error(`--widths: ${width} is not a screen width`);
        const near = [...SCREENS].reverse().find((s) => s.width <= width) || SCREENS[0];
        return { width, height: near.height };
      })
    : SCREENS;
  const targets = [...new Set(routes)].map((r) => ({ label: r, url: new URL(r, args.base).href }));
  const results = await runAll(targets, screens, { allowDocument404: (t) => t.label === MISSING, inject: args.inject });
  if (results.length === 0) throw new Error("nothing was measured");
  const bad = report(results);
  console.log(`\n${results.length - bad} of ${results.length} route-widths clean`);
  if (bad) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
