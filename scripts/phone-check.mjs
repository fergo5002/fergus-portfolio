#!/usr/bin/env node
/**
 * Phone check.
 *
 * Drives each route through three real mobile engines and fails on the four
 * things a resized desktop window cannot tell you:
 *
 *   overflow      the document is wider than the viewport (the widest element is named)
 *   input-font    an input, textarea or select whose computed font-size is under
 *                 16px (iOS zooms the whole page when one is focused)
 *   tap-target    a tappable element whose box is under 44 by 44 CSS px
 *   contrast      text whose composited contrast, sampled from the screenshot,
 *                 is under 4.5:1
 *
 * ## Why contrast is sampled from pixels rather than read from tokens
 *
 * `app/globals.test.ts` proves the colour tokens clear 4.5:1 against their
 * backgrounds. That is a fact about the stylesheet. It is not a fact about what
 * a visitor sees, because between the token and the eye sit the scanline
 * overlay, the phosphor shader, `text-shadow` glow, translucent panels and
 * whatever a theme does to `--bg`. Check the thing that ships. So this takes a
 * full-page screenshot, finds every element that has its own text, and reads
 * the pixels inside that text's rectangles. The foreground is estimated as the
 * 15% of pixels closest to the element's computed `color`; the background is
 * the per-channel median of the rest. WCAG contrast is computed on those two.
 *
 * It is an estimate, and the summary names the element so a person can look.
 * Things that fool it: a glow that fills most of a very small rect, text over a
 * photograph, text mid-fade. The last is why every context runs with
 * `prefers-reduced-motion: reduce`: the colour of a word halfway through a
 * fade is not the colour anybody reads, and the scrambled heading under
 * `no-preference` is a stream of random glyphs at the moment of the shot. The
 * four checks are about layout and colour, which do not depend on motion;
 * motion is On the glass's job, not this script's.
 *
 * ## Tap targets and inline links
 *
 * A link inside a sentence is exempt, the way WCAG 2.5.8 exempts it: an inline
 * `<a>` whose parent has more text than the link itself is listed as `inline`
 * in the summary and does not fail. Everything else under 44 by 44 fails
 * unless it carries `data-small-target="<reason>"`, and the reason is printed.
 * Buttons and inputs are never exempt.
 *
 * ## Profiles
 *
 *   iphone-390   WebKit, Playwright's iPhone 13 (390 by 844, DSF 3)
 *   iphone-320   WebKit, the same phone at the 1st-generation SE viewport
 *                (320 by 568, DSF 2), which is the narrowest screen still in use
 *   pixel-slow   Chromium, Pixel 5, CPU throttled 4x and the network held at
 *                DevTools' "Slow 4G" preset over CDP
 *
 * "Slow 4G" is what DevTools used to call "Slow 3G": 500 kbit/s each way with
 * the 0.8 factor DevTools applies (50,000 bytes per second) and 400 ms of
 * latency times its 5x multiplier (2,000 ms). Throttling does not change what
 * the four checks measure; it is there so a page that only settles after its
 * scripts load is measured after they load on a slow phone.
 *
 * ## Self-test
 *
 * `--self-test` serves two bundled fixtures and asserts that every planted
 * fault on the bad one is caught, on every profile, that the opt-out and the
 * controls are not reported, and that the good one passes clean. It runs
 * first in CI, before any real route, because a check that has never been
 * seen to fail is a ritual (CLAIMS.md, rule 1: prove the instrument first).
 *
 * Usage:
 *   node scripts/phone-check.mjs --self-test
 *   node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools,/tools/headline-check
 *   node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap
 *   node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap --out .phone-check
 */
import { chromium, devices, webkit } from "playwright";
import sharp from "sharp";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "scripts", "phone-check-fixtures");

const MIN_INPUT_FONT_PX = 16;
const MIN_TAP_PX = 44;
const MIN_CONTRAST = 4.5;

const SLOW_4G = { offline: false, downloadThroughput: 50_000, uploadThroughput: 50_000, latency: 2000 };
const CPU_THROTTLE_RATE = 4;

const PROFILES = [
  { id: "iphone-390", engine: "webkit", device: { ...devices["iPhone 13"] } },
  {
    id: "iphone-320",
    engine: "webkit",
    device: { ...devices["iPhone 13"], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 },
  },
  { id: "pixel-slow", engine: "chromium", device: { ...devices["Pixel 5"] }, throttle: true },
];

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    base: "http://localhost:3000",
    routes: [],
    fromSitemap: false,
    selfTest: false,
    out: join(ROOT, ".phone-check"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--routes") out.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--from-sitemap") out.fromSitemap = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--out") out.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* In the page                                                          */
/* ------------------------------------------------------------------ */

/**
 * Runs inside the browser via `page.evaluate`. Self-contained on purpose:
 * Playwright serialises the function's source, so it may not reach anything
 * in this module's scope. Everything it needs arrives in the argument.
 */
function auditInPage({ minInput, minTap }) {
  const path = (el) => {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const cls = [...node.classList].slice(0, 2).join(".");
      if (cls) part += `.${cls}`;
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const failures = [];
  const inline = [];
  const exempt = [];

  // 1. Overflow, naming the element whose right edge reaches furthest.
  //
  // Measured against `documentElement.clientWidth`, not `window.innerWidth`.
  // Chromium's mobile emulation widens the layout viewport to fit overflowing
  // content, so on a 393px Pixel with a 616px element `innerWidth` reads 616
  // and the overflow it exists to report disappears. `clientWidth` stays at the
  // device width on both engines (393 and 390 on the self-test fixture).
  const doc = document.scrollingElement || document.documentElement;
  const viewportWidth = document.documentElement.clientWidth;
  if (doc.scrollWidth > viewportWidth) {
    let widest = null;
    let edge = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const right = el.getBoundingClientRect().right + window.scrollX;
      if (right > edge) {
        edge = right;
        widest = el;
      }
    }
    failures.push({
      check: "overflow",
      el: widest ? path(widest) : "(unknown)",
      detail: `scrollWidth ${doc.scrollWidth} > viewport ${viewportWidth}; widest right edge at ${Math.round(edge)}px`,
    });
  }

  // 2. Inputs under 16px.
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!visible(el) || el.type === "hidden") continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minInput) failures.push({ check: "input-font", el: path(el), detail: `${size}px` });
  }

  // 3. Tap targets.
  for (const el of document.querySelectorAll("a, button, [role=button], input, select, textarea, label[for]")) {
    if (!visible(el) || el.type === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width >= minTap && r.height >= minTap) continue;
    const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
    const reason = (el.getAttribute("data-small-target") || "").trim();
    if (reason) {
      exempt.push({ el: path(el), size, reason });
      continue;
    }
    const cs = getComputedStyle(el);
    const parentText = (el.parentElement?.textContent || "").trim();
    const ownText = (el.textContent || "").trim();
    if (el.tagName === "A" && cs.display === "inline" && parentText.length > ownText.length) {
      inline.push({ el: path(el), size });
      continue;
    }
    failures.push({ check: "tap-target", el: path(el), detail: size });
  }

  // 4. Text runs, for the contrast pass outside the page.
  const texts = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    if (el.closest("script, style, noscript, canvas, svg, template")) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const rects = [];
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        rects.push({ x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height });
      }
    }
    if (rects.length) {
      texts.push({
        el: path(el),
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        text: (el.textContent || "").trim().slice(0, 40),
        rects,
      });
    }
  }

  return {
    failures,
    inline,
    exempt,
    texts,
    viewportWidth,
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
  };
}

/* ------------------------------------------------------------------ */
/* Contrast, from the pixels                                            */
/* ------------------------------------------------------------------ */

function parseColor(css) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha === 0) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** WCAG relative luminance, the same formula as app/globals.test.ts. */
function luminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianColour = (pixels) => [0, 1, 2].map((i) => median(pixels.map((p) => p[i])));
const meanColour = (pixels) =>
  [0, 1, 2].map((i) => Math.round(pixels.reduce((s, p) => s + p[i], 0) / pixels.length));
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

async function decode(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * The estimate. Ink is the mean of the 15% of pixels nearest the computed
 * colour (at least eight); paper is the per-channel median of everything
 * else. Returns null when there is too little to sample or the text is
 * transparent.
 */
function sampleContrast(image, entry, scale) {
  const fg = parseColor(entry.color);
  if (!fg) return null;
  const pixels = [];
  for (const r of entry.rects) {
    const x0 = Math.max(0, Math.floor(r.x * scale));
    const y0 = Math.max(0, Math.floor(r.y * scale));
    const x1 = Math.min(image.width, Math.ceil((r.x + r.w) * scale));
    const y1 = Math.min(image.height, Math.ceil((r.y + r.h) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * image.width + x) * image.channels;
        pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
      }
    }
  }
  if (pixels.length < 32) return null;
  const ranked = pixels.map((p) => ({ p, d: dist2(p, fg) })).sort((a, b) => a.d - b.d);
  const n = Math.max(8, Math.floor(ranked.length * 0.15));
  const ink = meanColour(ranked.slice(0, n).map((x) => x.p));
  const paper = medianColour(ranked.slice(n).map((x) => x.p));
  return { ratio: contrast(ink, paper), ink, paper };
}

/* ------------------------------------------------------------------ */
/* One route, one profile                                               */
/* ------------------------------------------------------------------ */

async function checkRoute(browser, profile, url, outDir, label) {
  const context = await browser.newContext({ ...profile.device, reducedMotion: "reduce" });
  const page = await context.newPage();
  if (profile.throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  }
  const timeout = profile.throttle ? 120_000 : 45_000;
  await page.goto(url, { waitUntil: "networkidle", timeout });
  await page.waitForTimeout(500);

  const audit = await page.evaluate(auditInPage, { minInput: MIN_INPUT_FONT_PX, minTap: MIN_TAP_PX });
  const png = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${label}.${profile.id}.png`), png);

  const image = await decode(png);
  // Measured, not assumed: a full-page shot is the page's CSS width times the
  // device scale factor, and on an overflowing page the page is wider than
  // the viewport.
  const scale = image.width / Math.max(audit.viewportWidth, audit.scrollWidth);

  const contrastFailures = [];
  let sampled = 0;
  for (const entry of audit.texts) {
    const s = sampleContrast(image, entry, scale);
    if (!s) continue;
    sampled += 1;
    if (s.ratio < MIN_CONTRAST) {
      contrastFailures.push({
        check: "contrast",
        el: entry.el,
        detail: `${s.ratio.toFixed(2)}:1, ink rgb(${s.ink.join(",")}) on rgb(${s.paper.join(",")}), "${entry.text}"`,
      });
    }
  }

  await context.close();
  return {
    profile: profile.id,
    url,
    label,
    failures: [...audit.failures, ...contrastFailures],
    inline: audit.inline,
    exempt: audit.exempt,
    sampled,
  };
}

async function runAll(targets, outDir) {
  const results = [];
  for (const engineName of ["webkit", "chromium"]) {
    const browser = await (engineName === "webkit" ? webkit : chromium).launch();
    try {
      for (const profile of PROFILES.filter((p) => p.engine === engineName)) {
        for (const t of targets) results.push(await checkRoute(browser, profile, t.url, outDir, t.label));
      }
    } finally {
      await browser.close();
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                            */
/* ------------------------------------------------------------------ */

const CHECKS = ["overflow", "input-font", "tap-target", "contrast"];

/** Prints the table and the failure lines. Returns true if anything failed. */
function printSummary(results) {
  const rows = results.map((r) => {
    const counts = CHECKS.map((c) => r.failures.filter((f) => f.check === c).length);
    return [r.label, r.profile, ...counts.map(String), String(r.sampled), counts.some((n) => n > 0) ? "FAIL" : "ok"];
  });
  const head = ["route", "profile", ...CHECKS, "sampled", "verdict"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));

  let failed = false;
  for (const r of results) {
    for (const f of r.failures) {
      failed = true;
      console.log(`FAIL ${r.profile} ${r.label} ${f.check} ${f.el} ${f.detail}`);
    }
    for (const e of r.exempt) console.log(`exempt ${r.profile} ${r.label} tap-target ${e.el} ${e.size} (${e.reason})`);
    for (const i of r.inline) console.log(`inline ${r.profile} ${r.label} tap-target ${i.el} ${i.size}`);
  }
  return failed;
}

/* ------------------------------------------------------------------ */
/* Routes                                                               */
/* ------------------------------------------------------------------ */

function labelFor(route) {
  return route.replace(/^\//, "").replace(/\//g, "_") || "root";
}

/** Every `/tools*` path the running site's sitemap lists. */
async function routesFromSitemap(base) {
  const res = await fetch(new URL("/sitemap.xml", base));
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => p === "/tools" || p.startsWith("/tools/"));
}

/* ------------------------------------------------------------------ */
/* Self-test                                                            */
/* ------------------------------------------------------------------ */

async function selfTest(args) {
  const server = createServer((req, res) => {
    const name = req.url === "/good" ? "good.html" : req.url === "/bad" ? "bad.html" : null;
    if (!name) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(FIXTURES, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const results = await runAll(
      [
        { label: "bad", url: `${base}/bad` },
        { label: "good", url: `${base}/good` },
      ],
      join(args.out, "self-test"),
    );
    const problems = [];
    const caught = (r, check, el) => r.failures.some((f) => f.check === check && f.el.includes(el));

    for (const r of results.filter((r) => r.label === "bad")) {
      for (const [check, el] of [
        ["overflow", "div#wide"],
        ["input-font", "input#small"],
        ["tap-target", "button#tiny"],
        ["contrast", "p#dim"],
      ]) {
        if (!caught(r, check, el)) problems.push(`${r.profile} bad: ${check} on ${el} was not caught`);
      }
      for (const [check, el] of [
        ["tap-target", "button#optout"],
        ["tap-target", "button#big"],
        ["input-font", "input#ok"],
        ["contrast", "p#fine"],
      ]) {
        if (caught(r, check, el)) problems.push(`${r.profile} bad: ${check} on ${el} was reported and must not be`);
      }
      if (!r.exempt.some((e) => e.el.includes("button#optout"))) {
        problems.push(`${r.profile} bad: the opt-out was not listed as exempt`);
      }
    }

    for (const r of results.filter((r) => r.label === "good")) {
      if (r.failures.length) {
        problems.push(
          `${r.profile} good: ${r.failures.length} failure(s) on a page with none: ${r.failures.map((f) => `${f.check} ${f.el}`).join("; ")}`,
        );
      }
      if (r.sampled < 3) problems.push(`${r.profile} good: only ${r.sampled} text elements sampled`);
      if (!r.inline.some((i) => i.el.includes("a#inline"))) {
        problems.push(`${r.profile} good: the inline link was not listed as inline`);
      }
    }

    printSummary(results);
    if (problems.length) {
      console.log("\nSELF-TEST FAILED");
      for (const p of problems) console.log(` - ${p}`);
      process.exitCode = 1;
    } else {
      console.log(
        `\nSELF-TEST OK: every planted fault caught on ${PROFILES.length} profiles, the clean page passed on all of them.`,
      );
      process.exitCode = 0;
    }
  } finally {
    server.close();
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest(args);

  let routes = args.routes;
  if (args.fromSitemap) routes = [...new Set([...routes, ...(await routesFromSitemap(args.base))])];
  if (routes.length === 0) throw new Error("no routes: pass --routes a,b or --from-sitemap");

  const targets = routes.map((r) => ({ label: labelFor(r), url: new URL(r, args.base).toString() }));
  console.log(`phone-check: ${targets.length} route(s) x ${PROFILES.length} profiles against ${args.base}`);
  const results = await runAll(targets, args.out);
  const failed = printSummary(results);
  console.log(failed ? "\nphone-check: FAILED" : "\nphone-check: passed");
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`phone-check: ${error.stack || error}`);
  process.exitCode = 2;
});
