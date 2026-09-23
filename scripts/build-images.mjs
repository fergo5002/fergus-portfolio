/**
 * Builds every image in `public/img/` from its source.
 *
 * The images are derived artefacts, so the recipe lives in the repo rather than
 * the results being unexplained binaries. Re-run any time a source changes:
 *
 *   node scripts/build-images.mjs
 *
 * Brand marks are vendored in `assets/sources/` so they survive the live sites
 * being redesigned. The two large sources stay where they live: the original
 * photo in the photo library, and the game screenshot with its Trinity
 * coursework. If a source is missing the script says which one and carries on,
 * so a machine without them still builds everything else.
 *
 * Requires ffmpeg on PATH for the HEIC step only.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "img");

/** Brand marks are vendored, since they are small and the live sites will change. */
const SOURCES = join(ROOT, "assets", "sources");

/** The one source too large to vendor: the original photo, straight from the library. */
const HERO_HEIC = "C:/Users/oreil/iCloudPhotos/Photos/IMG_1018.HEIC";

/** The game screenshot lives with the Trinity coursework it came from. */
const GAME_SHOT =
  "C:/Users/oreil/OneDrive - Trinity College Dublin/Projects/CSU22013-SwEng-2DGameEngine/sweng26_group23_2dgameengine/Sweng26/docs/shading-screenshots/day14-FrontSquareScene.png";

mkdirSync(OUT, { recursive: true });

/** 16:9 at a size that stays crisp on a retina card without bloating the page. */
const CARD_W = 960;
const CARD_H = 540;

const svg = (markup) => Buffer.from(markup);
const done = (name, info) => console.log(`  ok  ${name.padEnd(28)} ${info}`);
const skip = (name, why) => console.warn(`  --  ${name.padEnd(28)} skipped: ${why}`);

// ── 1. Hero portrait ────────────────────────────────────────────────────────
// Shot in the Dolomites. Cropped to 4:5 around Fergus so the mountains still
// read behind him, which ties the hero to the "in the mountains" line in his bio.
async function portrait() {
  if (!existsSync(HERO_HEIC)) return skip("portrait.jpg", `no photo at ${HERO_HEIC}`);

  // sharp cannot do this step: its libvips reads HEIC metadata happily and then
  // fails on the pixels, because the prebuilt binary ships no HEVC decoder. So
  // ffmpeg decodes to an intermediate PNG in the OS temp dir first.
  const src = join(tmpdir(), "fergus-portfolio-hero.png");
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", HERO_HEIC, src], {
      stdio: "pipe",
    });
  } catch {
    return skip("portrait.jpg", "ffmpeg is needed to decode HEIC and is not on PATH");
  }

  const info = await sharp(src)
    .extract({ left: 350, top: 900, width: 2106, height: 2632 })
    .resize(900, 1125, { fit: "cover" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(join(OUT, "portrait.jpg"));
  done("portrait.jpg", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 2. Under the Campanile ──────────────────────────────────────────────────
// Real gameplay from the Trinity Front Square scene: the Campanile on the right,
// the lamppost casting the dynamic lighting Fergus wrote. Cropped to drop the
// browser scrollbars down the right and bottom edges.
async function campanile() {
  if (!existsSync(GAME_SHOT)) return skip("under-the-campanile.jpg", "screenshot not found");

  // JPEG, not PNG: this is the one photographic card (gradients and soft
  // lighting), and lossless encoding of it costs ~8x the bytes for no visible gain.
  const info = await sharp(GAME_SHOT)
    .extract({ left: 0, top: 15, width: 1044, height: 587 })
    .resize(CARD_W, CARD_H, { fit: "cover" })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(OUT, "under-the-campanile.jpg"));
  done("under-the-campanile.jpg", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 3. Shared text measuring ────────────────────────────────────────────────
// The card font stack. Named generically: it used to be FIRESPARK_FONT, from
// the Firespark card that lived here before that brand was retired in favour of
// Tigh Sauna. Every card builder below shares it.
const CARD_FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * Render a line of text and trim it to its real ink, returning the buffer and
 * its true pixel width.
 *
 * The lockup has to be centred as a unit, which needs the wordmark's width. That
 * width cannot be predicted: the font stack resolves differently per machine
 * (Inter is not actually installed here, so this falls through to Segoe UI, and
 * a bare Linux box would land somewhere else again). Estimating it from a
 * per-glyph average would silently drift off-centre, or overlap the mark. So
 * measure the pixels instead of guessing at them.
 */
async function measuredText(text, { size, weight = 400, fill, tracking = 0 }) {
  const pad = 40;
  const box = Math.ceil(size * text.length * 1.2) + pad * 2;
  const markup = svg(`
<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${Math.ceil(size * 2)}">
  <text x="${pad}" y="${Math.round(size * 1.2)}" font-family="${CARD_FONT}"
        font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}"
        fill="${fill}">${text}</text>
</svg>`);
  const { data, info } = await sharp(markup)
    .png()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

// ── 3b. Tigh Sauna ──────────────────────────────────────────────────────────
// Approved lettering and the actual brass still served by tighsauna.com.
// Provenance: assets/sources/tigh-brand.md. Rebuild with --tigh-only.
async function tighSauna() {
  const wordSource = join(SOURCES, "tigh-wordmark-chalk.svg");
  const brassSource = join(SOURCES, "tigh-brass-sculpture.webp");
  if (!existsSync(wordSource) || !existsSync(brassSource)) {
    throw new Error("Tigh card requires both vendored brand assets");
  }
  const word = await sharp(wordSource).trim().resize({ width: 280 }).png().toBuffer();
  const brass = await sharp(brassSource).trim().resize({ height: 410 }).png().toBuffer();
  const wordSize = await sharp(word).metadata();
  const brassSize = await sharp(brass).metadata();
  const info = await sharp({
    create: { width: CARD_W, height: CARD_H, channels: 4, background: "#0B3028" },
  })
    .composite([
      { input: word, left: 76, top: Math.round((CARD_H - wordSize.height) / 2) },
      { input: brass, left: CARD_W - brassSize.width - 52, top: Math.round((CARD_H - brassSize.height) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, "tigh-sauna.png"));
  done("tigh-sauna.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 4. Presterly ────────────────────────────────────────────────────────────
// The Presterly "P" from the app favicon, on the brand's own near-black.
async function presterly() {
  const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="#1A1815"/>
  <g transform="translate(${CARD_W / 2} ${CARD_H / 2}) scale(3.1) translate(-56 -56.75)">
    <path d="M38 104 V16 H74 V60 H56" fill="none" stroke="#FFFFFF" stroke-width="13"
          stroke-linecap="butt" stroke-linejoin="miter"/>
  </g>
</svg>`;
  const info = await sharp(svg(markup)).png({ compressionLevel: 9 }).toFile(join(OUT, "presterly.png"));
  done("presterly.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 5. Loira ────────────────────────────────────────────────────────────────
// The Loira "L" swash mark, taken from loira.ai's own landing assets.
async function loira() {
  const src = join(SOURCES, "loira-l-white.svg");
  if (!existsSync(src)) return skip("loira.png", "vendored L mark missing");

  const mark = await sharp(src, { density: 400 })
    .resize({ height: 360, fit: "inside" })
    .toBuffer();

  const info = await sharp({
    create: { width: CARD_W, height: CARD_H, channels: 4, background: "#100E1B" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, "loira.png"));
  done("loira.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 6. Remand ───────────────────────────────────────────────────────────────
// An authored concept illustration, not Reddit UI or measured campaign results.
// Example questions converge on a positioning hypothesis, with no invented
// vote counts, percentages or growth curve. Rebuild with --remand-only.
async function remand() {
  const rows = [
    ["A better way to", "hand work over?"],
    ["Where did that", "client note go?"],
    ["Still chasing", "project updates?"],
  ];
  const threads = rows
    .map((lines, i) => {
      const y = 166 + i * 99;
      return `
    <g transform="translate(54 ${y})">
      <path d="M0 16 H360 V78 H37 L23 90 V78 H0 Z" fill="#1a211e" stroke="#48564d"/>
      <path d="M19 46 L32 31 L45 46 H37 V61 H27 V46 Z" fill="#ff4500"/>
      <text x="64" y="42" fill="#f4f7ef" font-size="25">${lines[0]}</text>
      <text x="64" y="69" fill="#f4f7ef" font-size="25">${lines[1]}</text>
    </g>`;
    })
    .join("");

  const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="#0c1210"/>
  <g font-family="'Courier New', monospace">
    <text x="50" y="111" font-size="82" font-weight="700" letter-spacing="-5" fill="#f4f7ef">Reddit</text>
    <path d="M372 84 H468 M450 66 L468 84 L450 102" fill="none" stroke="#ff4500" stroke-width="7"/>
    <text x="515" y="111" font-size="82" font-weight="700" letter-spacing="-5" fill="#ff6a35">growth</text>
    ${threads}
    <g fill="none" stroke="#ff4500" stroke-width="3">
      <path d="M416 214 C466 214 469 310 511 310"/>
      <path d="M416 313 H511"/>
      <path d="M416 412 C466 412 469 316 511 316"/>
      <path d="M511 313 H545 M533 301 L545 313 L533 325"/>
    </g>
    <rect x="566" y="181" width="340" height="281" fill="#ff6a35"/>
    <path d="M582 165 H922 V446" fill="none" stroke="#ff6a35" stroke-width="1"/>
    <text x="594" y="235" fill="#152019" font-size="19">A product angle to test</text>
    <text x="592" y="298" fill="#0c1210" font-size="43" font-weight="700" letter-spacing="-2">Handover,</text>
    <text x="592" y="346" fill="#0c1210" font-size="43" font-weight="700" letter-spacing="-2">without</text>
    <text x="592" y="394" fill="#0c1210" font-size="43" font-weight="700" letter-spacing="-2">the chase.</text>
    <text x="54" y="507" font-size="16" fill="#b7c5bb">Remand / illustrative questions and positioning</text>
  </g>
</svg>`;
  const info = await sharp(svg(markup)).png({ compressionLevel: 9 }).toFile(join(OUT, "remand.png"));
  done("remand.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 7. ContraBot ────────────────────────────────────────────────────────────
// Candlesticks with the crowd-sentiment line climbing while the position goes
// short against it, which is the whole thesis of the bot: fade the crowd.
async function contrabot() {
  // Everything below is in SCREEN coordinates, where a SMALLER y is a HIGHER
  // price. Getting that backwards once already produced a chart that rose while
  // claiming a profitable short, so the walk is written directly in y.
  const x0 = 80;
  const step = 46;
  const candles = [];
  let y = 165; // opens high...
  const seq = [14, -6, 18, 9, -11, 22, 7, -14, 19, 26, -9, 15, 21, -7, 24, 12, -5, 18];
  for (let i = 0; i < seq.length; i++) {
    const open = y;
    y += seq[i] * 1.45; // ...and closes low: a sustained downtrend
    const close = y;
    candles.push({
      open,
      close,
      wickTop: Math.min(open, close) - (6 + ((i * 7) % 11)),
      wickBottom: Math.max(open, close) + (6 + ((i * 5) % 13)),
    });
  }

  const body = candles
    .map((c, i) => {
      const x = x0 + i * step;
      const rose = c.close < c.open; // closed higher up the screen
      const colour = rose ? "#2ea043" : "#f85149";
      const top = Math.min(c.open, c.close);
      const h = Math.max(3, Math.abs(c.close - c.open));
      return `
    <g>
      <line x1="${x + 11}" y1="${c.wickTop}" x2="${x + 11}" y2="${c.wickBottom}" stroke="${colour}" stroke-width="2" opacity="0.75"/>
      <rect x="${x}" y="${top}" width="22" height="${h.toFixed(1)}" fill="${colour}" opacity="0.92"/>
    </g>`;
    })
    .join("");

  // Crowd sentiment climbing while the price falls. The two lines crossing is
  // the divergence the bot trades, so it is the point of the whole picture.
  const crowd = candles
    .map((_, i) => `${x0 + i * step + 11},${(400 - i * 14.5).toFixed(1)}`)
    .join(" ");

  const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="#0d1117"/>
  <g stroke="#c9d1d9" stroke-width="1" opacity="0.06">
    ${[1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${i * 90}" x2="${CARD_W}" y2="${i * 90}"/>`).join("")}
  </g>
  ${body}
  <polyline points="${crowd}" fill="none" stroke="#58a6ff" stroke-width="2.5"
            stroke-dasharray="7 6" opacity="0.85"/>
  <text x="80" y="58" font-family="monospace" font-size="13" fill="#58a6ff" opacity="0.9">CROWD SENTIMENT — BULLISH, RISING</text>
  <text x="640" y="58" font-family="monospace" font-size="13" fill="#f85149" opacity="0.9">PRICE — FALLING</text>
  <text x="80" y="500" font-family="monospace" font-size="13" fill="#f85149" opacity="0.95">POSITION SHORT · FADING THE CROWD</text>
  <text x="700" y="500" font-family="monospace" font-size="18" fill="#2ea043">P/L +12.4%</text>
</svg>`;
  const info = await sharp(svg(markup)).png({ compressionLevel: 9 }).toFile(join(OUT, "contrabot.png"));
  done("contrabot.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

console.log("building public/img ...");
const remandOnly = process.argv.includes("--remand-only");
const tighOnly = process.argv.includes("--tigh-only");
if (remandOnly && tighOnly) throw new Error("Choose either --remand-only or --tigh-only");
if (remandOnly) {
  await remand();
} else if (tighOnly) {
  await tighSauna();
} else {
  await tighSauna();
  await portrait();
  await campanile();
  await presterly();
  await loira();
  await remand();
  await contrabot();
}
console.log("done.");
