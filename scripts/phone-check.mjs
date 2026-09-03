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
 * Plus two about the run itself, because a check that quietly measures nothing
 * reads exactly like a check that passed:
 *
 *   skipped       more text runs than the allowance produced no contrast
 *                 reading at all (see MAX_SKIPPED_TEXTS)
 *   layout-moved  the document changed size across the shutter, or the
 *                 photograph is not the viewport the rectangles were measured
 *                 in, so the two do not describe the same page
 *
 * ## Why contrast is sampled from pixels rather than read from tokens
 *
 * `app/globals.test.ts` proves the colour tokens clear 4.5:1 against their
 * backgrounds. That is a fact about the stylesheet. It is not a fact about what
 * a visitor sees, because between the token and the eye sit the scanline
 * overlay, the phosphor shader, `text-shadow` glow, translucent panels and
 * whatever a theme does to `--bg`. Check the thing that ships. So this
 * screenshots the whole page, finds every element that has its own text, and
 * reads the pixels inside that text's rectangles. The foreground is estimated as the
 * mean of the 2% of pixels closest to the element's computed `color` (never
 * fewer than eight); the background is the per-channel median of the rest.
 * WCAG contrast is computed on those two.
 *
 * Two per cent, not more. A text rect is mostly paper, and a thin glyph's
 * rect is nearly all paper, so a wider slice fills up with half-covered edge
 * pixels and reads darker than the ink. Measured on the first real run: the
 * "Email me" of the call to action passed at 8.4:1 while the arrow beside it,
 * same element, same colour, same panel, read 2.5:1 with a 15% slice and
 * 10.4:1 with this one. The status bar's `--green-dim` readouts moved from
 * 1.4 to 4.7:1, which is what the tokens say they are.
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
 * ## Paper is scored twice, and the worse reading wins
 *
 * A per-channel median is the right estimate of a flat ground and a flattering
 * one of a gradient, a photograph or a striped overlay: half the ground can be
 * dark enough to swallow the text and the median never says so. So the ground
 * is also scored on its darkest quartile, and the ratio reported is the lower
 * of the two. The luminance standard deviation of the ground is carried with
 * it and printed, because that is the number that says whether the two
 * readings are allowed to differ: on a flat ground it is zero and they agree
 * exactly.
 *
 * The darkest quartile cannot be taken off the raw pixels in the rectangle.
 * Only 2% of them are called ink, so the rest still holds the whole
 * antialiasing ramp and most of the glyph interiors, and a quartile of that is
 * ink measured against ink, which reads about 1:1 for every element on any
 * page. The ground is therefore eroded first: every pixel is assigned to
 * whichever of ink and paper it is nearer, and a pixel counts as ground only
 * if no ink-side pixel sits within INK_HALO_PX of it. That is a spatial test,
 * and it is the only thing that separates an antialiased edge (which hugs the
 * glyph) from a dark band in the background (which does not).
 *
 * On this site the pair currently never bites, and that is worth knowing
 * rather than a reason to drop it. Every route here is light text on a dark
 * tube, so the darkest quartile of the ground is the more generous reading and
 * the median wins the `min`. Measured on 2026-09-03: ground standard
 * deviations of 0.008 to 0.021 across both tool routes, with the quartile
 * ratio between 0.1 and 1.8 higher than the median every time. It is there for
 * the first dark word on a light panel, or the first line over an image.
 *
 * ## Text nobody can see is not text this can read
 *
 * An absolutely positioned sibling laid over a paragraph does not move its
 * rectangle, so the sampler reads the panel on top and calls the result the
 * paragraph's contrast. Which way that lands is luck: an opaque panel the
 * colour of the ink reads about 1:1 and fails a page that is fine, one the
 * colour of the paper reads whatever the panel's own contrast is and passes
 * text nobody can read.
 *
 * `auditInPage` therefore asks `document.elementFromPoint` what is actually on
 * top at a few points across each rectangle, and a run whose points land on
 * something that is neither the element, its ancestor nor its descendant is
 * marked occluded and **skipped with a reason**, not failed. Skipped rather
 * than failed because this script cannot tell a bug from a deliberate overlay,
 * and a contrast number for a surface nobody sees is not evidence either way.
 * It is not silent, though: the element and its occluder are named, and the
 * skip counts against the route's allowance, so a page that covers a lot of
 * its own text still fails. The gap: an opaque overlay carrying
 * `pointer-events: none` is invisible to `elementFromPoint` and will still be
 * sampled. Every full-viewport overlay on this site is deliberately
 * `pointer-events: none`, which is why they are seen through rather than
 * treated as occluders, and that is the behaviour wanted: they are part of the
 * composited pixel a visitor reads.
 *
 * ## Nothing may be skipped quietly
 *
 * `sampleContrast` returns no reading for a transparent colour, for a
 * rectangle with fewer than 32 pixels inside the image, for one that has been
 * clipped away entirely, and for an occluded run. Every one of those used to
 * be a bare `continue`, so a route could report "12 sampled" while forty more
 * runs went unread and the table said `ok`. Each skip is now recorded with its
 * reason, printed on every route, and failed past MAX_SKIPPED_TEXTS.
 *
 * Adding the count found three unread runs per route on the live pages the
 * moment it was switched on: the skip link, which sits above the top of the
 * document until it is focused, and the two nav links past the right edge of a
 * nav that scrolls sideways at 390px. They were being dropped by the sampler
 * with nothing said, and the summary read `ok`. They are a separate number now
 * (`offscreen`) rather than a skip, because there was nothing in the
 * photograph to read rather than something the sampler failed on, and they are
 * printed on every route either way.
 *
 * ## One layout for the rectangles and the pixels
 *
 * The page is measured and photographed in the same layout: the viewport is
 * resized to the document's height first, and then the rectangles are read
 * and a plain screenshot of that viewport is taken. Playwright's `fullPage`
 * option was the first version and it produced a false failure on Chromium.
 *
 * What was observed, on `/tools/headline-check`, Pixel 5, with `fullPage`:
 * the document was 1929px tall before the capture and 1876px after; 41
 * elements had different boxes across it, and each of the 41 is an element a
 * `@media (hover: none)` rule touches; `.hcheck__label` measured 44px tall,
 * which is the touch floor, and photographed 20px, which is its height
 * without it; everything below rode up, 11 CSS px at the label and 18 by the
 * foot of the page; the sampler then read the panel behind the label and
 * called it 1.8:1, where WebKit read the same CSS at 12.8:1.
 *
 * The story that fits is that Chromium's full-page capture drops the emulated
 * media state. That is a **guess**. It has never been isolated, and it is not
 * the only story that fits: Chromium stitches a full-page shot by changing the
 * viewport, and a viewport change re-runs layout against every rule and every
 * box that depends on the viewport. Whether the touch rules stopped matching,
 * or something above them moved and those 41 elements are simply what a
 * `(hover: none)` rule happens to have touched below it, was never separated.
 * The check that would separate them is small and was not run: read
 * `matchMedia("(hover: none)").matches` and the label's height from inside the
 * capture, and see whether the media query or the box is what changed.
 *
 * So this does not depend on knowing which. It depends on the part both
 * stories share, that the rectangles and the pixels stopped describing the
 * same page, and the `layout-moved` check tests exactly that in two legs:
 * `scrollWidth` and `scrollHeight` are read again immediately after the
 * screenshot and compared with what the audit saw, and the photograph's own
 * size is compared with the viewport the rectangles were measured in. When it
 * fires it prints the numbers rather than a reason.
 *
 * The second leg is there because the first one, on its own, could not fail.
 * Putting `fullPage: true` back and rerunning the self-test on 2026-09-03
 * scrambled the bad fixture (2 contrast failures became 8, and 6 of 11 text
 * runs went unread on iphone-320) with `layout-moved` reading 0 on all three
 * profiles: Playwright restores the viewport before it hands back the buffer,
 * so nothing read afterwards can see what the capture did. The size of the
 * image it returns is the part that cannot be put back, and on the bad
 * fixture, whose document is wider than the phone, `fullPage` returns a 616px
 * shot for a 390px viewport. A check that has never been seen to fail is a
 * ritual; this is the second time that rule has changed something in this
 * file.
 *
 * One consequence to know about while reading the self-test: the good
 * fixture's `p#shift` case is a no-op pin on `iphone-390` and `iphone-320`.
 * WebKit's full-page capture keeps the emulation, so reverting this correction
 * leaves the good page passing on both WebKit profiles and the case can only
 * ever go red on `pixel-slow`. It is asserted on all three because the
 * assertion is written per profile, not because it bites on all three.
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
 * The good fixture also carries one case for each of the four corrections
 * above: a thin glyph in a roomy box, a line under a band only a coarse
 * pointer sees, the visually hidden idiom, and a paragraph under an opaque
 * panel. All four are fine for a reader, all four were reported as faults
 * before, and reverting any one correction brings its false failure back on
 * the good page: the wide slice reads the glyph at 1.5:1, the full-page
 * capture reads the line at 1.00:1 on the tail band below it, the old
 * visibility test measures a label nobody can see, and the covered paragraph
 * reads as white ink on white paper.
 *
 * A fifth case pins the accounting rather than a correction: `p#escape` sits
 * above the top of the document, the way the site's own skip link waits for
 * focus, and it has to appear in `offscreen`, never in the samples, and never
 * in the skip count.
 *
 * Two more things the fixtures pin, both added because the first version of
 * this self-test could not have failed on them.
 *
 * **The floors are pinned from both sides.** A fault far under a floor proves
 * nothing about where the floor is. `bad.html` planted 14px against 16, 30 by
 * 30 against 44 and 1.28:1 against 4.5, and the nearest value on the good page
 * was 16px, 48px and 12.6:1, so the floors could be moved to 15px, 42px and
 * 2.0:1 and every assertion here stayed green. Measured, one at a time, on
 * 2026-09-03. Each floor now has a fault a hair under it on the bad page and a
 * pass a hair over it on the good one, so it is red in both directions.
 *
 * **Three swatches assert a number, not a verdict.** Every other contrast
 * assertion here is "failed", "did not fail" or "was sampled", all of which a
 * sampler that systematically flatters would satisfy. `#swatch-max` (white on
 * black, 21.00), `#swatch-edge` (#767676 on white, 4.54) and `#swatch-alpha`
 * (black on a 40% black panel over white, which composites to rgb(153,153,153)
 * for 7.37) are worked out by hand from the WCAG formula, and the measured
 * ratio has to land within 10% of each. The alpha one is the one that proves
 * the pixels are being read: anything reading the declared `background` gets
 * 21.00 for it.
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

/** Fewer pixels than this inside the image and there is nothing to estimate from. */
const MIN_SAMPLE_PIXELS = 32;

/**
 * How far the ground is eroded away from the ink, in device pixels, before its
 * darkest quartile is taken. An antialiased edge is one to two device pixels
 * wide at these scale factors; two is the width that clears it at DSF 3
 * without eating a small rect's ground entirely.
 */
const INK_HALO_PX = 2;

/** Below this many ground pixels the quartile is noise, so only the median is used. */
const MIN_GROUND_PIXELS = 64;

/**
 * How many text runs a route may leave unread before the route fails.
 *
 * Two, and the number is an argument rather than a round figure. A skip is one
 * of four things: a transparent colour, a rectangle with almost nothing of it
 * left inside the image, a rectangle under 32 pixels, or a run something
 * opaque is sitting on. The first three are properties of one odd element and
 * a page can honestly have one. The fourth is the one worth failing on,
 * because a page that covers its own text covers it in quantity: an overlay, a
 * panel, a modal left open. So the allowance sits just above what a page with
 * a single odd element produces and well under what a covering overlay does.
 *
 * Measured on 2026-09-03 against a production build of this tree: `/tools` and
 * `/tools/headline-check` skipped 0 on five of the six route-profile pairs and
 * 1 on the sixth (`iphone-320` puts the status bar's working directory partly
 * under a machine button, so `elementFromPoint` calls it occluded), and the
 * good fixture skips exactly 1, the paragraph under the panel it plants on
 * purpose. Two is one clear of the worst clean reading and still fails a third
 * skip.
 *
 * Text that was never in the photograph at all is a different number and is
 * not counted here: see `offscreen` in `auditInPage`.
 *
 * It is deliberately an absolute number and not a fraction. A fraction lets a
 * long page hide more, and the pages here are long.
 */
const MAX_SKIPPED_TEXTS = 2;

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

  // A box under 2px in either direction is the visually-hidden idiom (1px by
  // 1px, clipped), which is text for a screen reader and not for an eye. It
  // has no contrast to sample and no target to tap.
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  };

  /**
   * What is actually on top of a text rectangle, or null.
   *
   * Five points across each rectangle (the middle band, at 15/35/50/65/85% of
   * the width) rather than one, because a panel that covers half a paragraph
   * is still a paragraph nobody reads. The first point that lands on something
   * outside the element's own line wins. An ancestor is not an occluder: a
   * point that falls in a gap between glyphs resolves to the block the text
   * sits in, which is the page working normally.
   */
  const occluderFor = (el, rects) => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    for (const r of rects) {
      for (const fraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const x = r.x + r.w * fraction - window.scrollX;
        const y = r.y + r.h * 0.5 - window.scrollY;
        if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
        return path(hit);
      }
    }
    return null;
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
  //
  // A rectangle outside the photographed viewport is dropped here and the
  // element is listed under `offscreen` instead. Three things land in it on
  // this site and all three are honest: the skip link, which lives above the
  // top of the page until it is focused, and the last two nav links, which sit
  // past the right edge of a nav that scrolls sideways on a phone. There is
  // nothing in the photograph to read for any of them.
  //
  // They are kept out of the skip count on purpose. A skip is the sampler
  // failing on something that was there; this is nothing being there, and the
  // two want different numbers. Where a run being off the page IS the bug the
  // overflow check has already failed the route by name.
  const texts = [];
  const offscreen = [];
  const viewportHeight = document.documentElement.clientHeight;
  const onScreen = (r) => r.x < viewportWidth && r.y < viewportHeight && r.x + r.w > 0 && r.y + r.h > 0;
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
    let dropped = 0;
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        const rect = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
        if (onScreen(rect)) rects.push(rect);
        else dropped++;
      }
    }
    if (rects.length) {
      texts.push({
        el: path(el),
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        text: (el.textContent || "").trim().slice(0, 40),
        rects,
        occludedBy: occluderFor(el, rects),
      });
    } else if (dropped) {
      offscreen.push({
        el: path(el),
        text: (el.textContent || "").trim().slice(0, 40),
        detail: `${dropped} rect(s) outside the ${viewportWidth}x${viewportHeight} viewport`,
      });
    }
  }

  return {
    failures,
    inline,
    exempt,
    texts,
    offscreen,
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

/** Population standard deviation. Zero for anything with fewer than two values. */
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/**
 * The estimate.
 *
 * Ink is the mean of the 2% of pixels nearest the computed colour (at least
 * eight); paper is the per-channel median of everything else. The header says
 * why the slice is that thin.
 *
 * The ground is then eroded away from the ink by INK_HALO_PX and its darkest
 * quartile scored as well, and the lower of the two ratios is the answer. On a
 * flat ground the two agree exactly and the standard deviation returned beside
 * them is zero; the point of the pair is a gradient, a photograph or a striped
 * overlay, where the median is the flattering half of the story.
 *
 * Returns `{ ok: false, reason }` rather than null for every case it cannot
 * read, because a skipped run has to be counted and named upstream.
 */
function sampleContrast(image, entry, scale) {
  if (entry.occludedBy) return { ok: false, reason: `occluded by ${entry.occludedBy}` };
  const fg = parseColor(entry.color);
  if (!fg) return { ok: false, reason: `unreadable colour ${entry.color}` };

  // Kept as patches rather than one flat list: the erosion below is spatial,
  // so it needs to know which pixel is next to which.
  const patches = [];
  let total = 0;
  for (const r of entry.rects) {
    const x0 = Math.max(0, Math.floor(r.x * scale));
    const y0 = Math.max(0, Math.floor(r.y * scale));
    const x1 = Math.min(image.width, Math.ceil((r.x + r.w) * scale));
    const y1 = Math.min(image.height, Math.ceil((r.y + r.h) * scale));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) continue;
    const px = new Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * image.width + (x0 + x)) * image.channels;
        px[y * w + x] = [image.data[i], image.data[i + 1], image.data[i + 2]];
      }
    }
    patches.push({ w, h, px });
    total += w * h;
  }
  if (total === 0) return { ok: false, reason: "rectangle is off the image" };
  if (total < MIN_SAMPLE_PIXELS) return { ok: false, reason: `only ${total} pixels to sample` };

  const all = patches.flatMap((patch) => patch.px);
  const ranked = all.map((p) => ({ p, d: dist2(p, fg) })).sort((a, b) => a.d - b.d);
  const n = Math.max(8, Math.floor(ranked.length * 0.02));
  const ink = meanColour(ranked.slice(0, n).map((x) => x.p));
  const paper = medianColour(ranked.slice(n).map((x) => x.p));

  // The ground: paper-side pixels with no ink-side pixel within INK_HALO_PX.
  // Nearest-of-the-two assignment splits the antialiasing ramp down the middle
  // and the halo removes the half that stayed on the paper side.
  const ground = [];
  for (const { w, h, px } of patches) {
    const inkSide = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inkSide[i] = dist2(px[i], ink) <= dist2(px[i], paper) ? 1 : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inkSide[y * w + x]) continue;
        let touchesInk = false;
        for (let dy = -INK_HALO_PX; dy <= INK_HALO_PX && !touchesInk; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -INK_HALO_PX; dx <= INK_HALO_PX; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (inkSide[ny * w + nx]) {
              touchesInk = true;
              break;
            }
          }
        }
        if (!touchesInk) ground.push(px[y * w + x]);
      }
    }
  }

  const lums = ground.map(luminance);
  const sd = stdDev(lums);
  let dark = null;
  if (ground.length >= MIN_GROUND_PIXELS) {
    const byLuminance = ground.map((p, i) => ({ p, l: lums[i] })).sort((a, b) => a.l - b.l);
    const quartile = Math.max(8, Math.floor(byLuminance.length * 0.25));
    dark = medianColour(byLuminance.slice(0, quartile).map((x) => x.p));
  }

  const viaMedian = contrast(ink, paper);
  const viaDark = dark ? contrast(ink, dark) : viaMedian;
  return {
    ok: true,
    ratio: Math.min(viaMedian, viaDark),
    viaMedian,
    viaDark,
    ink,
    paper,
    dark: dark ?? paper,
    sd,
    groundPixels: ground.length,
  };
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

  // One layout for the rectangles and the pixels (see the header). The
  // viewport takes the document's height, twice if the first resize changed
  // it, and the screenshot is of that viewport rather than a `fullPage`.
  const { width } = profile.device.viewport;
  for (let pass = 0; pass < 2; pass++) {
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.min(Math.max(profile.device.viewport.height, docHeight), 16_000);
    if (page.viewportSize()?.height === height) break;
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
  }

  const audit = await page.evaluate(auditInPage, { minInput: MIN_INPUT_FONT_PX, minTap: MIN_TAP_PX });
  const png = await page.screenshot({ fullPage: false, animations: "disabled", caret: "hide" });
  const after = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: (document.scrollingElement || document.documentElement).scrollWidth,
  }));

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${label}.${profile.id}.png`), png);

  const image = await decode(png);
  // The shot is the viewport, so its width is the viewport's CSS width times
  // the device scale factor. Anything the viewport does not contain was
  // dropped in `auditInPage` and listed under `offscreen` there; the clipping
  // in `sampleContrast` is the backstop for a rectangle that straddles the
  // edge. On an overflowing page the overflow check has already failed the
  // route by name.
  const scale = image.width / audit.viewportWidth;

  /**
   * The rectangles and the pixels have to describe the same page, and there
   * are two ways for them not to.
   *
   * One, the document moved across the shutter: `scrollHeight` or
   * `scrollWidth` is not what the audit read. Two, the photograph is not of
   * the viewport the rectangles were measured in, which makes `scale` above a
   * wrong number and lands every rectangle somewhere else on the image.
   *
   * The second leg is the one that catches `fullPage: true`, and it is here
   * because the first leg on its own did not: putting `fullPage` back and
   * rerunning the self-test scrambled the bad fixture's contrast readings (2
   * failures became 8, and 6 runs went unread on iphone-320) while
   * `scrollHeight` after the capture matched `scrollHeight` before it on every
   * profile. Playwright restores the viewport before handing the buffer back,
   * so a height read afterwards cannot see what the capture did. What it
   * cannot hide is the size of the image it returns.
   *
   * A CSS pixel of slack on the geometry: the Pixel 5's scale factor is 2.75,
   * so a 393px viewport photographs 1080 device pixels wide rather than
   * 1080.75, and that rounding is not a finding.
   */
  const dsf = profile.device.deviceScaleFactor ?? 1;
  const layoutFailures = [];
  if (after.height !== audit.scrollHeight || after.width !== audit.scrollWidth) {
    layoutFailures.push({
      check: "layout-moved",
      el: "document",
      detail:
        `document was ${audit.scrollWidth}x${audit.scrollHeight} at the rectangle read and ` +
        `${after.width}x${after.height} after the shutter`,
    });
  }
  const shotWidth = image.width / dsf;
  const shotHeight = image.height / dsf;
  const viewportHeight = page.viewportSize()?.height ?? shotHeight;
  if (Math.abs(shotWidth - audit.viewportWidth) > 1 || Math.abs(shotHeight - viewportHeight) > 1) {
    layoutFailures.push({
      check: "layout-moved",
      el: "screenshot",
      detail:
        `the photograph is ${shotWidth.toFixed(1)}x${shotHeight.toFixed(1)} CSS px and the rectangles were ` +
        `measured in a ${audit.viewportWidth}x${viewportHeight} viewport`,
    });
  }

  const contrastFailures = [];
  // Kept by name and by number, not just counted. The self-test asserts that
  // its pinned cases were measured and that three of them came back with the
  // ratio arithmetic says they have; an element the sampler quietly skips is
  // an element nobody is checking, and a count cannot tell you which one.
  const samples = [];
  const skipped = [];
  for (const entry of audit.texts) {
    const s = sampleContrast(image, entry, scale);
    if (!s.ok) {
      skipped.push({ el: entry.el, reason: s.reason, text: entry.text });
      continue;
    }
    samples.push({ el: entry.el, ratio: s.ratio, viaMedian: s.viaMedian, viaDark: s.viaDark, sd: s.sd });
    if (s.ratio < MIN_CONTRAST) {
      // The ground printed is the one that bit, so the numbers in the line and
      // the colours in the line describe the same reading.
      const quartileBit = s.viaDark < s.viaMedian;
      const bg = quartileBit ? s.dark : s.paper;
      contrastFailures.push({
        check: "contrast",
        el: entry.el,
        detail:
          `${s.ratio.toFixed(2)}:1 (${quartileBit ? "darkest quartile" : "median"}; median ` +
          `${s.viaMedian.toFixed(2)}, quartile ${s.viaDark.toFixed(2)}, ground sd ${s.sd.toFixed(3)}), ` +
          `ink rgb(${s.ink.join(",")}) on rgb(${bg.join(",")}), "${entry.text}"`,
      });
    }
  }

  // Silent exclusion reads as a clean run, so past the allowance it is a
  // failure in its own right and every skip is printed either way.
  const skipFailures =
    skipped.length > MAX_SKIPPED_TEXTS
      ? [
          {
            check: "skipped",
            el: "(route)",
            detail: `${skipped.length} of ${audit.texts.length} text runs unread, allowance ${MAX_SKIPPED_TEXTS}`,
          },
        ]
      : [];

  await context.close();
  return {
    profile: profile.id,
    url,
    label,
    failures: [...audit.failures, ...layoutFailures, ...contrastFailures, ...skipFailures],
    inline: audit.inline,
    exempt: audit.exempt,
    texts: audit.texts.length,
    sampled: samples.length,
    samples,
    skipped,
    offscreen: audit.offscreen,
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

const CHECKS = ["overflow", "input-font", "tap-target", "contrast", "layout-moved", "skipped"];

/** Prints the table and the failure lines. Returns true if anything failed. */
function printSummary(results) {
  const rows = results.map((r) => {
    const counts = CHECKS.map((c) => r.failures.filter((f) => f.check === c).length);
    return [
      r.label,
      r.profile,
      ...counts.map(String),
      `${r.sampled}/${r.texts}`,
      String(r.skipped.length),
      counts.some((n) => n > 0) ? "FAIL" : "ok",
    ];
  });
  const head = ["route", "profile", ...CHECKS, "sampled", "unread", "verdict"];
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
    // Every skip, always, whether or not the count cleared the allowance, and
    // every run that was never on the photographed page either.
    for (const s of r.skipped) {
      console.log(`skipped ${r.profile} ${r.label} contrast ${s.el} ${s.reason} "${s.text}"`);
    }
    for (const o of r.offscreen) {
      console.log(`offscreen ${r.profile} ${r.label} contrast ${o.el} ${o.detail} "${o.text}"`);
    }
    // The roughest ground on the route. A high standard deviation is what says
    // the median and the quartile were reading different things, so it is
    // printed on a clean run too rather than only when something failed.
    const roughest = [...r.samples].sort((a, b) => b.sd - a.sd)[0];
    if (roughest) {
      console.log(
        `ground ${r.profile} ${r.label} roughest ${roughest.el} sd ${roughest.sd.toFixed(3)} ` +
          `(median ${roughest.viaMedian.toFixed(2)}:1, darkest quartile ${roughest.viaDark.toFixed(2)}:1)`,
      );
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
        // The three near-boundary faults. Each one is the smallest failure its
        // floor can have, so losing any of these means the floor moved down.
        ["input-font", "input#edge-input"],
        ["tap-target", "button#edge-tap"],
        ["contrast", "p#edge-contrast"],
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

      /**
       * Three cases that the first real run put here, one for each way this
       * script was wrong about a page that was fine. Every one of them is a
       * pass on the good fixture, so the loop above already fails if the
       * correction is reverted and the false failure comes back. These lines
       * add the other half: that the element was measured at all, because a
       * sampler that silently skips an element passes it for the wrong reason.
       *
       *   span#arrow   a thin glyph alone in a roomy box. A wide ink slice
       *                fills up with paper and reads the arrow as grey.
       *   p#shift      a line under a band as tall as the viewport, on a page
       *                taller than the phone. Measured in one layout and
       *                photographed in another, its rectangle lands in the
       *                band above it.
       *   label#vhlabel  the visually hidden idiom: one clipped CSS pixel with
       *                its text overflowing. Nobody sees it, so it has no
       *                contrast to read and no target to tap.
       */
      const sampledEls = r.samples.map((s) => s.el);
      if (!sampledEls.some((e) => e.includes("span#arrow"))) {
        problems.push(`${r.profile} good: the thin glyph was never sampled`);
      }
      if (!sampledEls.some((e) => e.includes("p#shift"))) {
        problems.push(`${r.profile} good: the line under the viewport-tall band was never sampled`);
      }
      const mentions = [
        ...sampledEls,
        ...r.failures.map((f) => f.el),
        ...r.exempt.map((e) => e.el),
        ...r.inline.map((i) => i.el),
      ];
      if (mentions.some((e) => e.includes("label#vhlabel"))) {
        problems.push(`${r.profile} good: the visually hidden label was measured and must not be`);
      }

      /**
       * The fourth correction: an opaque sibling over a paragraph. It must be
       * skipped, the skip must name the panel that caused it, and the ratio
       * must never be reported, because the pixels in that rectangle belong to
       * the panel and not to the words underneath.
       */
      const covered = r.skipped.find((s) => s.el.includes("p#covered"));
      if (!covered) {
        problems.push(`${r.profile} good: the covered paragraph was measured instead of skipped`);
      } else if (!covered.reason.includes("occluded by")) {
        problems.push(`${r.profile} good: the covered paragraph was skipped for the wrong reason: ${covered.reason}`);
      }
      if (r.skipped.length !== 1) {
        problems.push(
          `${r.profile} good: ${r.skipped.length} skipped runs, expected exactly the covered paragraph: ` +
            r.skipped.map((s) => `${s.el} (${s.reason})`).join("; "),
        );
      }

      /**
       * And the line above the top of the page, which is the other half of the
       * same accounting. It has to be reported, it must never be sampled, and
       * it must not land in the skip count: a skip is the sampler failing on
       * something that was there, and there was nothing there.
       */
      if (!r.offscreen.some((o) => o.el.includes("p#escape"))) {
        problems.push(`${r.profile} good: the line above the top of the page was not reported as offscreen`);
      }
      if (sampledEls.some((e) => e.includes("p#escape"))) {
        problems.push(`${r.profile} good: the line above the top of the page was sampled`);
      }

      /**
       * The control swatches. Every other contrast assertion in this file is a
       * verdict, and a sampler that flatters everything satisfies all of them.
       * These are worked out by hand from the WCAG formula and the measured
       * number has to land within a tenth of the answer.
       *
       * The alpha one is the one that proves the pixels are being read rather
       * than the stylesheet: its declared background is `rgba(0,0,0,0.4)`, so
       * anything reading tokens gets black and reports 21.00 for it.
       */
      for (const [el, expected] of [
        ["p#swatch-max", 21.0],
        ["p#swatch-edge", 4.54],
        ["p#swatch-alpha", 7.37],
      ]) {
        const hit = r.samples.find((s) => s.el.includes(el));
        if (!hit) {
          problems.push(`${r.profile} good: the ${el} control swatch was never sampled`);
          continue;
        }
        const drift = Math.abs(hit.ratio - expected) / expected;
        if (drift > 0.1) {
          problems.push(
            `${r.profile} good: ${el} measured ${hit.ratio.toFixed(2)}:1, hand-computed ${expected.toFixed(2)}:1, ` +
              `${(drift * 100).toFixed(1)}% out`,
          );
        }
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
