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

// ── 3. Firespark ────────────────────────────────────────────────────────────
// Rebuilt in Firespark's own design language rather than just dropping the logo
// on a blank card: the ember spark and wordmark lockup from its header, its
// near-black on white, and its own product line underneath.
const FIRESPARK_INK = "#0A0C10";
const FIRESPARK_FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

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
  <text x="${pad}" y="${Math.round(size * 1.2)}" font-family="${FIRESPARK_FONT}"
        font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}"
        fill="${fill}">${text}</text>
</svg>`);
  const { data, info } = await sharp(markup)
    .png()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

async function firespark() {
  const src = join(SOURCES, "firespark-spark.svg");
  if (!existsSync(src)) return skip("firespark.png", "vendored spark mark missing");

  const SPARK = 112; // the mark is square (24x24 viewBox), so width === height
  const GAP = 24;
  const midY = 250;

  const spark = await sharp(src, { density: 700 }).resize({ height: SPARK }).toBuffer();
  const word = await measuredText("Firespark", {
    size: 82,
    weight: 700,
    fill: FIRESPARK_INK,
    tracking: -2.5,
  });
  const tag = await measuredText("Booking and operations software for saunas", {
    size: 26,
    fill: "#5b636e",
  });

  const lockup = SPARK + GAP + word.width;
  const startX = Math.round((CARD_W - lockup) / 2);

  if (startX < 0) {
    throw new Error(
      `firespark: lockup is ${lockup}px, wider than the ${CARD_W}px card. Reduce the font size.`,
    );
  }

  const info = await sharp({
    create: { width: CARD_W, height: CARD_H, channels: 4, background: "#ffffff" },
  })
    .composite([
      { input: spark, left: startX, top: midY - Math.round(SPARK / 2) },
      {
        input: word.buffer,
        left: startX + SPARK + GAP,
        top: midY - Math.round(word.height / 2),
      },
      {
        input: tag.buffer,
        left: Math.round((CARD_W - tag.width) / 2),
        top: midY + 96,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, "firespark.png"));
  done("firespark.png", `${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}

// ── 3b. Tigh Sauna ──────────────────────────────────────────────────────────
// Typographic lockup in Tigh Sauna's own colours: `steam #0f6472` on the warm
// `birch #faf6f0` secondary surface. No vendored mark, so unlike every other
// builder here this one can never skip.
//
// Steam is the brand's text colour precisely because it is legible (6.8:1 on
// white). Do not restyle this card in the old ember orange: ember only reached
// 3.94:1, which is why it stopped being used for text in the first place.
//
// The three bars are the product in one glance: a diary with sessions in it.
// They are deliberately not a logo, because there isn't one to copy here yet
// and inventing a mark on a portfolio card would be a claim about the brand.
async function tighSauna() {
  const STEAM = "#0f6472";
  const BIRCH = "#faf6f0";
  const midY = 244;

  const word = await measuredText("Tigh Sauna", {
    size: 86,
    weight: 700,
    fill: STEAM,
    tracking: -2.5,
  });
  const tag = await measuredText("Booking and operations for saunas", {
    size: 26,
    fill: "#5b636e",
  });

  if (word.width > CARD_W) {
    throw new Error(
      `tigh-sauna: wordmark is ${word.width}px, wider than the ${CARD_W}px card. Reduce the font size.`,
    );
  }

  // Three session slots on a rule, drawn at the card's own scale so the bars
  // line up with the wordmark's optical centre rather than floating.
  const barsY = midY + 150;
  const barW = 108;
  const barGap = 18;
  const barsTotal = barW * 3 + barGap * 2;
  const barsX = Math.round((CARD_W - barsTotal) / 2);
  const bars = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="24">
  <rect x="${barsX}" y="8" width="${barW}" height="8" rx="4" fill="${STEAM}" opacity="0.9"/>
  <rect x="${barsX + barW + barGap}" y="8" width="${barW}" height="8" rx="4" fill="${STEAM}" opacity="0.55"/>
  <rect x="${barsX + (barW + barGap) * 2}" y="8" width="${barW}" height="8" rx="4" fill="${STEAM}" opacity="0.25"/>
</svg>`);

  const info = await sharp({
    create: { width: CARD_W, height: CARD_H, channels: 4, background: BIRCH },
  })
    .composite([
      {
        input: word.buffer,
        left: Math.round((CARD_W - word.width) / 2),
        top: midY - Math.round(word.height / 2),
      },
      { input: tag.buffer, left: Math.round((CARD_W - tag.width) / 2), top: midY + 84 },
      { input: bars, left: 0, top: barsY },
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
// Authored rather than a stock screenshot: a thread list with vote momentum and
// a clustered demand signal, which is what Remand actually does to online noise.
async function remand() {
  const rows = [
    { votes: "4.2k", w: 300, sub: "r/entrepreneur", hot: 1 },
    { votes: "1.8k", w: 236, sub: "r/SaaS", hot: 0.72 },
    { votes: "942", w: 188, sub: "r/smallbusiness", hot: 0.5 },
    { votes: "411", w: 140, sub: "r/startups", hot: 0.32 },
  ];

  const thread = rows
    .map((r, i) => {
      const y = 150 + i * 78;
      return `
    <g transform="translate(70 ${y})">
      <path d="M0 14 L11 0 L22 14 Z" fill="#FF4500" opacity="${0.35 + r.hot * 0.65}"/>
      <text x="4" y="34" font-family="monospace" font-size="15" fill="#8b98a5">${r.votes}</text>
      <rect x="74" y="0" width="${r.w}" height="13" rx="6.5" fill="#c9d1d9" opacity="${0.28 + r.hot * 0.45}"/>
      <rect x="74" y="22" width="${r.w * 0.62}" height="9" rx="4.5" fill="#c9d1d9" opacity="0.16"/>
      <text x="${74 + r.w + 26}" y="12" font-family="monospace" font-size="14" fill="#FF4500" opacity="0.75">${r.sub}</text>
    </g>`;
    })
    .join("");

  // Momentum curve climbing to the right of the thread list.
  const pts = [0, 0.12, 0.1, 0.28, 0.34, 0.3, 0.52, 0.66, 0.62, 0.84, 1]
    .map((v, i, a) => `${740 + (i / (a.length - 1)) * 160},${430 - v * 190}`)
    .join(" ");

  const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="#0d1117"/>
  <g stroke="#c9d1d9" stroke-width="1" opacity="0.06">
    ${[1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${i * 90}" x2="${CARD_W}" y2="${i * 90}"/>`).join("")}
  </g>
  <text x="70" y="86" font-family="monospace" font-size="20" fill="#c9d1d9" opacity="0.85">listening to the noise</text>
  <text x="70" y="112" font-family="monospace" font-size="13" fill="#8b98a5">4 threads clustered into one demand signal</text>
  ${thread}
  <polyline points="${pts}" fill="none" stroke="#FF4500" stroke-width="3" stroke-linejoin="round" opacity="0.9"/>
  <text x="740" y="466" font-family="monospace" font-size="13" fill="#FF4500" opacity="0.8">MOMENTUM</text>
  <rect x="70" y="470" width="600" height="8" rx="4" fill="#c9d1d9" opacity="0.1"/>
  <rect x="70" y="470" width="430" height="8" rx="4" fill="#FF4500" opacity="0.75"/>
  <text x="70" y="502" font-family="monospace" font-size="13" fill="#8b98a5">SIGNAL STRENGTH 72%</text>
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
await portrait();
await campanile();
await firespark();
await tighSauna();
await presterly();
await loira();
await remand();
await contrabot();
console.log("done.");
