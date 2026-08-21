/**
 * Measures how many award-winning websites fragment their own headline in the
 * HTML they serve.
 *
 *   node scripts/split-text-audit.mjs --self-test   # prove the classifier first
 *   node scripts/split-text-audit.mjs --collect     # rebuild the seed from Awwwards
 *   node scripts/split-text-audit.mjs               # run the audit, write the dataset
 *
 * **Why this exists.** `/writing/split-text-is-costing-you-search` describes a
 * failure mode: a headline animated one character per element extracts as loose
 * letters for anything doing naive HTML-to-text, which is most of the machinery
 * feeding an answer engine. That article says it happens. Nobody had counted it.
 * This counts it.
 *
 * **What it reads, and what it deliberately cannot see.** Server HTML only. One
 * GET per site, no JavaScript, no hydration, no computed styles. That is not a
 * shortcut, it is the measurement: the naive crawler's view is the thing under
 * test, and running a browser would answer a different question. So a heading
 * that arrives whole and is split apart on the client counts as clean here, and
 * a heading that is absent until React mounts counts as absent, because that is
 * exactly what the crawler gets.
 *
 * **The classifier, in one sentence.** A heading is fragmented when its markup
 * contains a run of four or more consecutive single-character elements AND
 * fewer than half of its non-whitespace characters survive a pessimistic
 * tag-stripping inside tokens of two characters or more.
 *
 * The second half of that rule is what stops the article's own recommended fix
 * being scored as the bug. That fix renders the headline twice, once whole for
 * readers of text and once split for the animation, so the split run is present
 * and the words are present too. Requiring both conditions means the count is a
 * floor rather than a ceiling: a heading with one small split word among intact
 * prose scores clean. Erring low is the right direction for a number that is
 * going to be quoted.
 *
 * No dependencies, by the same reasoning as `lib/markdown.ts`: the HTML this
 * needs to understand is a heading and its children, and a parser for that is
 * eighty lines.
 *
 * There is no `process.exit()` in this file. It tears the event loop down while
 * sockets from `fetch` are still open and libuv asserts on Windows, printing a
 * crash after a run that succeeded. See `scripts/indexnow.mjs`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SEED_PATH = resolve(HERE, "split-text-audit-seed.txt");
const OUT_PATH = resolve(ROOT, "public/data/split-text-audit-2026-08.json");

/** A real browser string. A site that serves a bot a different document is a site we would be measuring wrong. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const CONCURRENCY = 8;
/** One retry, and only for a transport failure. An HTTP status is an answer, not a fault. */
const RETRIES = 1;
const RETRY_DELAY_MS = 1_500;
/** Rows carry the extracted heading verbatim. A pathological one should not carry the whole page. */
const HEADING_CAP = 300;

/** The two thresholds the classifier turns on. Stated here so a sceptic can move them and re-run. */
const MIN_CHAR_RUN = 4;
const MAX_INTACT_RATIO = 0.5;

/** Where the sample comes from. Rebuilt by --collect, quoted in the dataset and in the article. */
const AWWWARDS_LISTING = "https://www.awwwards.com/websites/sites_of_the_day/";
const COLLECT_PAGES = 5;

// ---------------------------------------------------------------------------
// HTML, the small amount of it this needs
// ---------------------------------------------------------------------------

/**
 * Elements that never have a closing tag. `br` matters here: it is a real word
 * boundary inside a heading and must not be pushed onto the open-element stack,
 * or everything after it nests one level too deep for the rest of the document.
 */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’",
  lsquo: "‘", ldquo: "“", rdquo: "”", shy: "",
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Script, style and comments are never heading content and their bodies contain things shaped like tags. */
export function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
}

/**
 * Matches one tag. The attribute part steps over quoted values so a `>` inside
 * `title="a > b"` does not end the tag early, which a plain `[^>]*` gets wrong.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;

/**
 * Finds the first element with the given name and returns its inner HTML.
 *
 * Counts nested opens of the same name so a heading containing another heading
 * (invalid, but the web is full of it) closes at the right place rather than at
 * the first `</h1>` it meets.
 */
export function findElement(html, name) {
  const re = new RegExp(TAG.source, "g");
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(html))) {
    if (m[2].toLowerCase() !== name) continue;
    const closing = m[1] === "/";
    if (!closing) {
      if (m[4] === "/" || VOID.has(name)) continue; // self-closed: no content to take
      if (depth === 0) start = re.lastIndex;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) return html.slice(start, m.index);
    }
  }
  // Unterminated. Take the rest of the document rather than reporting nothing:
  // a truncated heading is still evidence, and it is recorded as such.
  return start === -1 ? null : html.slice(start);
}

/** A tolerant fragment parser. Elements and text, nothing else, no error states. */
export function parseFragment(html) {
  const root = { name: "#root", children: [] };
  const stack = [root];
  const re = new RegExp(TAG.source, "g");
  let last = 0;
  let m;

  const text = (value) => {
    if (value !== "") stack[stack.length - 1].children.push({ name: "#text", value });
  };

  while ((m = re.exec(html))) {
    if (m.index > last) text(html.slice(last, m.index));
    last = re.lastIndex;

    const name = m[2].toLowerCase();
    if (m[1] === "/") {
      // Close the nearest matching ancestor. An unmatched close tag is ignored,
      // which is what a browser does and what keeps a stray `</div>` in a
      // heading from unwinding the whole stack.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const node = { name, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(name) && m[4] !== "/") stack.push(node);
  }

  if (last < html.length) text(html.slice(last));
  return root;
}

/** Text content, tags contributing nothing. What a browser paints, near enough. */
export function textContent(node) {
  if (node.name === "#text") return node.value;
  return node.children.map(textContent).join("");
}

/** Whitespace-collapsed and entity-decoded. */
function collapse(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

/**
 * Walks the fragment in document order, emitting text nodes and leaf elements.
 *
 * A leaf is an element with no element children, which is what a per-character
 * wrapper is. Emitting leaves whole, rather than descending into them, is what
 * lets a run of them be counted regardless of how many word wrappers a split
 * library nested them inside.
 */
export function* stream(node) {
  for (const child of node.children) {
    if (child.name === "#text") {
      yield { kind: "text", value: child.value };
      continue;
    }
    if (child.children.some((c) => c.name !== "#text")) {
      yield* stream(child);
      continue;
    }
    yield { kind: "element", name: child.name, value: textContent(child) };
  }
}

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/**
 * Measures one heading's inner HTML.
 *
 * `naive` is the pessimistic extraction: every tag becomes a space, which is
 * what the article's own curl one-liner does and what a large amount of
 * scraping code does. `strict` is the optimistic one: tags contribute nothing,
 * so only real whitespace in the source separates anything. A heading that
 * comes out separated under `strict` as well is broken even for a crawler that
 * handles inline elements correctly, which is the strictly worse case and is
 * recorded separately.
 */
export function measureHeading(innerHtml) {
  // An inline SVG's `<title>` and `<text>` would otherwise land in the string.
  // A heading's meaning is its text, not its logo.
  const html = innerHtml.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ");

  const naive = collapse(html.replace(new RegExp(TAG.source, "g"), " "));
  const tree = parseFragment(html);
  const strict = collapse(textContent(tree));
  const letters = strict.replace(/\s/g, "").length;

  let charElements = 0;
  let maxCharRun = 0;
  let run = 0;
  for (const item of stream(tree)) {
    if (item.kind === "text") {
      // Whitespace between wrappers is expected and neutral. Real text is not:
      // it means the characters either side are not one continuous split run.
      if (collapse(item.value) !== "") run = 0;
      continue;
    }
    if (item.name === "br" || item.name === "wbr") continue;
    const value = collapse(item.value).replace(/\s/g, "");
    if (value.length === 1) {
      charElements++;
      run++;
      if (run > maxCharRun) maxCharRun = run;
    } else if (value.length > 1) {
      run = 0;
    }
    // An empty or whitespace-only element is neutral. Split libraries emit one
    // per space, and treating those as a break would cut every run at every word.
  }

  const tokens = naive.split(" ").filter(Boolean);
  const intactChars = tokens.reduce((sum, t) => sum + (t.length >= 2 ? t.length : 0), 0);
  const intactRatio = letters === 0 ? 0 : intactChars / letters;

  return {
    naive,
    strict,
    letters,
    charElements,
    maxCharRun,
    intactChars,
    intactRatio: Number(intactRatio.toFixed(4)),
    // The optimistic extraction still coming out as loose letters means the
    // whitespace is in the served markup, not introduced by the extractor.
    separatedInSource: longestSingleCharRun(strict) >= MIN_CHAR_RUN,
    fragmented: maxCharRun >= MIN_CHAR_RUN && intactRatio < MAX_INTACT_RATIO,
  };
}

/**
 * One element wrapping exactly one non-whitespace character and nothing else.
 *
 * The attribute part is a flat `[^<>]*` rather than the quote-aware alternation
 * `TAG` uses, and that is not laziness. This pattern fails on almost every tag
 * it meets, because almost no tag is a single-character wrapper, and a failing
 * match is where a nested alternation with overlapping branches backtracks
 * exponentially. The quote-aware version hung for over ten minutes on a single
 * 203 kB document while `classifyHtml` finished the same input in 4 ms. A flat
 * character class cannot backtrack ambiguously.
 *
 * The cost is that an element whose attributes contain a literal `>` is skipped
 * by this scan. That is rare, it only ever undercounts, and this is a coarse
 * signature count rather than the classifier.
 */
const SINGLE_CHAR_ELEMENT = /<([a-zA-Z][a-zA-Z0-9-]*)[^<>]*>([^<>\s])<\/\1\s*>/g;

/**
 * Scans a whole document for the per-character wrapper signature, headline or
 * not.
 *
 * This is the falsification check, and it earns its place in the output. The
 * headline result is a near-zero, and a near-zero has two explanations: either
 * per-character splitting is absent from served HTML, or it is present and the
 * heading rule is somehow missing it. Counting the same signature across the
 * entire document separates those. If pages are full of split runs and none of
 * them land in a heading, that is a different finding and it should be visible
 * in the data rather than argued about.
 *
 * A run is consecutive single-character elements with nothing but whitespace
 * between them, which is the same definition the heading rule uses.
 */
export function documentSplitScan(rawHtml) {
  const html = stripNoise(rawHtml).replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ");
  const re = new RegExp(SINGLE_CHAR_ELEMENT.source, "g");
  let count = 0;
  let run = 0;
  let maxRun = 0;
  let previousEnd = -1;
  let m;
  while ((m = re.exec(html))) {
    count++;
    const contiguous = previousEnd >= 0 && html.slice(previousEnd, m.index).trim() === "";
    run = contiguous ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
    previousEnd = re.lastIndex;
  }
  return { singleCharElements: count, maxRun };
}

function longestSingleCharRun(text) {
  let best = 0;
  let run = 0;
  for (const token of text.split(" ")) {
    if (token.length === 1) {
      run++;
      if (run > best) best = run;
    } else if (token.length > 1) {
      run = 0;
    }
  }
  return best;
}

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * Classifies one page's HTML.
 *
 * The h1 decides the classification. When there is no h1, or the h1 is an empty
 * shell waiting for the client to fill it, the page is `no-h1-in-html`: the
 * strongest string on the URL is not in the document a crawler receives, which
 * is its own citation problem and a separate finding. The largest heading that
 * IS present is measured anyway and recorded as `fallback`, so the row is
 * useful rather than merely negative.
 */
export function classifyHtml(rawHtml) {
  const html = stripNoise(rawHtml);

  const h1 = findElement(html, "h1");
  if (h1 !== null) {
    const measured = measureHeading(h1);
    if (measured.letters > 0) {
      return {
        classification: measured.fragmented ? "fragmented" : "clean",
        reason: null,
        headingTag: "h1",
        measured,
        fallback: null,
      };
    }
  }

  let fallback = null;
  for (const tag of HEADINGS.slice(1)) {
    const inner = findElement(html, tag);
    if (inner === null) continue;
    const measured = measureHeading(inner);
    if (measured.letters === 0) continue;
    fallback = { headingTag: tag, measured };
    break;
  }

  return {
    classification: "no-h1-in-html",
    reason: h1 === null ? "no-h1-element" : "h1-empty-in-server-html",
    headingTag: null,
    measured: null,
    fallback,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * One GET, capped and timed out, read as a stream so an enormous document costs
 * the cap rather than its own size.
 */
async function fetchCapped(url) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  if (res.body) {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.length;
      if (bytes >= MAX_BYTES) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
  }

  const buffer = Buffer.concat(chunks);
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  let html;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = new TextDecoder("utf-8").decode(buffer);
  }

  return { status: res.status, finalUrl: res.url || url, contentType, bytes, truncated, html };
}

function cap(text) {
  if (text === null || text === undefined) return null;
  return text.length > HEADING_CAP ? `${text.slice(0, HEADING_CAP)}…` : text;
}

function rowFor(entry, verdict, extra) {
  const m = verdict?.measured ?? null;
  return {
    url: entry.url,
    awwwardsSlug: entry.slug,
    awardedOn: entry.awardedOn,
    fetchedAt: new Date().toISOString(),
    classification: verdict?.classification ?? "unreachable",
    reason: verdict?.reason ?? null,
    headingTag: verdict?.headingTag ?? null,
    heading: cap(m?.naive ?? null),
    headingContiguous: cap(m?.strict ?? null),
    headingCharacters: m?.letters ?? null,
    charElementCount: m?.charElements ?? null,
    maxCharRun: m?.maxCharRun ?? null,
    intactCharacters: m?.intactChars ?? null,
    intactRatio: m?.intactRatio ?? null,
    separatedInSource: m?.separatedInSource ?? null,
    fallbackHeadingTag: verdict?.fallback?.headingTag ?? null,
    fallbackHeading: cap(verdict?.fallback?.measured?.naive ?? null),
    fallbackFragmented: verdict?.fallback?.measured?.fragmented ?? null,
    documentTitle: null,
    documentSingleCharElements: null,
    documentMaxCharRun: null,
    ...extra,
  };
}

async function auditOne(entry) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      const res = await fetchCapped(entry.url);
      const base = {
        finalUrl: res.finalUrl,
        status: res.status,
        bytes: res.bytes,
        truncated: res.truncated,
        error: null,
      };

      if (res.status < 200 || res.status >= 300) {
        return rowFor(entry, null, { ...base, reason: `http-${res.status}` });
      }
      if (!/html|xml/i.test(res.contentType) && res.html.trim() === "") {
        return rowFor(entry, null, { ...base, reason: `content-type-${res.contentType || "none"}` });
      }

      const verdict = classifyHtml(res.html);
      // A capped body with no heading at all is ambiguous: the heading may have
      // been past the cut. Say so rather than counting it as a real absence.
      if (res.truncated && verdict.classification === "no-h1-in-html" && !verdict.fallback) {
        return rowFor(entry, null, { ...base, reason: "body-capped-before-any-heading" });
      }
      const scan = documentSplitScan(res.html);
      // A page with no heading in its HTML is not blind to a crawler, it still
      // has a title element. Recording it keeps the no-h1 finding honest about
      // what is and is not missing.
      const title = findElement(stripNoise(res.html), "title");
      return rowFor(entry, verdict, {
        ...base,
        documentTitle: title === null ? null : cap(collapse(title)),
        documentSingleCharElements: scan.singleCharElements,
        documentMaxCharRun: scan.maxRun,
      });
    } catch (err) {
      lastError = err;
    }
  }

  const name = lastError?.name ?? "Error";
  const message = lastError?.cause?.code ?? lastError?.message ?? String(lastError);
  return rowFor(entry, null, {
    finalUrl: null,
    status: null,
    bytes: null,
    truncated: false,
    error: `${name}: ${message}`,
    reason: name === "TimeoutError" ? "timeout" : "transport",
  });
}

/** A fixed-size pool. Ordered output, so a re-run produces a diffable file. */
async function runPool(entries, worker, size) {
  const out = new Array(entries.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, entries.length) }, async () => {
    while (next < entries.length) {
      const i = next++;
      out[i] = await worker(entries[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

export function parseSeed(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [url, slug, awardedOn] = trimmed.split(/\s+/);
    if (!url) continue;
    entries.push({ url, slug: slug ?? null, awardedOn: awardedOn ?? null });
  }
  return entries;
}

/**
 * Rebuilds the seed from the Awwwards Sites of the Day listing.
 *
 * That listing is a rolling window, so the file this writes is a snapshot and
 * the date in its header is load-bearing. Each entry keeps its Awwwards slug,
 * which does not move, so a stranger can still find every site in the sample
 * long after the listing has scrolled past them.
 */
async function collect() {
  const seen = new Set();
  const entries = [];
  const excluded = [];

  for (let page = 1; page <= COLLECT_PAGES; page++) {
    const url = page === 1 ? AWWWARDS_LISTING : `${AWWWARDS_LISTING}?page=${page}`;
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Awwwards page ${page} returned ${res.status}`);
    const html = await res.text();

    // Award date and title ride along in the collectable payload on each card.
    const meta = new Map();
    for (const m of html.matchAll(/data-collectable-model-value="([^"]*)"/g)) {
      try {
        const parsed = JSON.parse(decodeEntities(m[1]));
        if (parsed?.slug) meta.set(parsed.slug, parsed);
      } catch {
        // A card whose payload will not parse still has its visit link below.
      }
    }

    const links = [
      ...html.matchAll(
        /href="(https?:\/\/[^"]+)"[^>]*data-visit-count-identifier-value="([^"]+)"[^>]*data-visit-count-type-value="submission"/g,
      ),
    ];
    if (links.length === 0) throw new Error(`Awwwards page ${page} yielded no entries. The markup has changed.`);

    for (const [, href, slug] of links) {
      const target = decodeEntities(href);
      let host;
      try {
        host = new URL(target).hostname.replace(/^www\./, "");
      } catch {
        excluded.push(`${slug}: unparseable URL ${target}`);
        continue;
      }
      if (seen.has(host)) {
        excluded.push(`${slug}: duplicate host ${host}`);
        continue;
      }
      seen.add(host);
      const createdAt = meta.get(slug)?.createdAt;
      const awardedOn = typeof createdAt === "number"
        ? new Date(createdAt * 1000).toISOString().slice(0, 10)
        : "unknown";
      entries.push({ url: target, slug, awardedOn });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const header = [
    "# Sample: Awwwards Sites of the Day.",
    "#",
    `# Collected on ${today} by \`node scripts/split-text-audit.mjs --collect\`, from pages 1 to`,
    `# ${COLLECT_PAGES} of ${AWWWARDS_LISTING} (31 entries per page).`,
    "#",
    "# Awwwards gives one Site of the Day every day and the listing is a rolling window, so",
    "# re-running --collect on a later date returns a different, overlapping set. That is why",
    "# this file is checked in: it is the snapshot the published numbers were measured against.",
    "# Each row keeps its Awwwards slug, which is stable, so every site in the sample can still",
    `# be found at ${AWWWARDS_LISTING.replace("/websites/sites_of_the_day/", "/sites/")}<slug>.`,
    "#",
    "# The URL is the one Awwwards links out to, taken verbatim from the listing markup.",
    "#",
    "# Exclusions, applied at collection time and nowhere else:",
    "#   - a second entry resolving to a hostname already in the list (a studio winning twice)",
    "#   - an entry whose outbound URL will not parse",
    `# Entries excluded on this run: ${excluded.length}`,
    ...excluded.map((line) => `#   - ${line}`),
    "#",
    "# Format: <url> <awwwards-slug> <award-date>",
    "",
  ].join("\n");

  const body = entries.map((e) => `${e.url} ${e.slug} ${e.awardedOn}`).join("\n");
  await writeFile(SEED_PATH, `${header}${body}\n`, "utf8");
  console.log(`Wrote ${entries.length} entries to ${SEED_PATH} (${excluded.length} excluded).`);
}

// ---------------------------------------------------------------------------
// Self-test: prove the instrument before pointing it at anything
// ---------------------------------------------------------------------------

/**
 * Fixtures, not a unit test suite. The point is that the classifier is shown to
 * fire on the shapes it claims to detect and, more importantly, shown NOT to
 * fire on the two shapes that look similar and are fine: a headline split per
 * word, and a headline carrying both a whole copy and a split copy, which is
 * the fix the article recommends.
 */
const FIXTURES = [
  {
    name: "plain heading",
    html: "<h1>Patrick Fergus O'Reilly</h1>",
    expect: "clean",
  },
  {
    name: "per-character spans, no whitespace between them",
    html:
      "<h1>" +
      [..."PatrickFergus"].map((c) => `<span class="ch">${c}</span>`).join("") +
      "</h1>",
    expect: "fragmented",
  },
  {
    name: "per-character spans with newlines between them, the article's own case",
    html:
      "<h1>\n" +
      [..."Patrick"].map((c) => `  <span class="ch">${c}</span>`).join("\n") +
      "\n</h1>",
    expect: "fragmented",
    alsoSeparatedInSource: true,
  },
  {
    name: "word wrappers holding per-character wrappers, the GSAP SplitText shape",
    html:
      "<h1>" +
      ["Patrick", "Fergus"]
        .map((w) => `<span class="word">${[...w].map((c) => `<span class="ch">${c}</span>`).join("")}</span>`)
        .join(" ") +
      "</h1>",
    expect: "fragmented",
  },
  {
    name: "split per word, which extracts perfectly well",
    html: '<h1><span class="word">Patrick</span> <span class="word">Fergus</span></h1>',
    expect: "clean",
  },
  {
    name: "the recommended fix: a whole copy beside the split copy",
    html:
      '<h1><span class="visually-hidden">Patrick Fergus</span><span aria-hidden="true">' +
      [..."PatrickFergus"].map((c) => `<span class="ch">${c}</span>`).join("") +
      "</span></h1>",
    expect: "clean",
  },
  {
    name: "a drop cap, one single-character element and no run",
    html: '<h1><span class="cap">N</span>ews from the workshop</h1>',
    expect: "clean",
  },
  {
    name: "empty h1 waiting for the client",
    html: '<h1 class="hero"><span></span></h1>',
    expect: "no-h1-in-html",
    reason: "h1-empty-in-server-html",
  },
  {
    name: "no h1 at all, h2 present",
    html: "<main><h2>Selected work</h2></main>",
    expect: "no-h1-in-html",
    reason: "no-h1-element",
  },
  {
    name: "heading text inside a script is not heading text",
    html: '<h1>Real<script>document.write("x")</script></h1>',
    expect: "clean",
  },
  {
    name: "an inline logo does not become the headline",
    html: '<h1><svg><title>Logo</title></svg>Studio Name Here</h1>',
    expect: "clean",
  },
  {
    name: "malformed markup does not throw",
    html: "<h1><span>A</b><div>B</h1>",
    expect: "clean",
  },
];

/**
 * The document scan's own checks: that it counts what it claims to, and that it
 * finishes.
 *
 * The second one is a regression, not a formality. The first version of this
 * scan used the same quote-aware attribute alternation as `TAG`, which
 * backtracks exponentially on the tags it fails to match, and it is the tags it
 * fails to match that it spends all its time on. A 154-site run went past ten
 * minutes with no output and no error. A budget makes that a red line rather
 * than a hung terminal.
 */
function scanTests() {
  const results = [];

  const split = [..."Headline"].map((c) => `<span class="ch">${c}</span>`).join("");
  const scan = documentSplitScan(`<div>${split}</div>`);
  results.push([
    "counts a per-character run outside any heading",
    scan.singleCharElements === 8 && scan.maxRun === 8,
    JSON.stringify(scan),
  ]);

  const spread = documentSplitScan("<p><b>A</b> words here <b>B</b></p>");
  results.push([
    "does not join single-character elements separated by real text",
    spread.singleCharElements === 2 && spread.maxRun === 1,
    JSON.stringify(spread),
  ]);

  const hostile = '<div class="a b c d e f g h i j" data-x="1" data-y="2">text</div>'.repeat(6000);
  const started = Date.now();
  const hostileScan = documentSplitScan(hostile);
  const elapsed = Date.now() - started;
  results.push([
    `finishes on ${Math.round(hostile.length / 1000)} kB of non-matching attribute soup`,
    elapsed < 1000 && hostileScan.singleCharElements === 0,
    `${elapsed}ms`,
  ]);

  return results;
}

function selfTest() {
  let failures = 0;
  for (const [name, ok, detail] of scanTests()) {
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"}  documentSplitScan ${name}\n        ${detail}`);
  }
  for (const fixture of FIXTURES) {
    const verdict = classifyHtml(fixture.html);
    const ok =
      verdict.classification === fixture.expect &&
      (fixture.reason === undefined || verdict.reason === fixture.reason) &&
      (fixture.alsoSeparatedInSource === undefined ||
        verdict.measured?.separatedInSource === fixture.alsoSeparatedInSource);
    if (!ok) failures++;
    const detail = verdict.measured
      ? `run=${verdict.measured.maxCharRun} chars=${verdict.measured.charElements} intact=${verdict.measured.intactRatio} text=${JSON.stringify(verdict.measured.naive)}`
      : `reason=${verdict.reason}`;
    console.log(`${ok ? "ok  " : "FAIL"}  ${fixture.name}\n        got ${verdict.classification}, ${detail}`);
  }
  const total = FIXTURES.length + scanTests().length;
  console.log(`\n${total - failures}/${total} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function audit() {
  const seedText = await readFile(SEED_PATH, "utf8");
  const entries = parseSeed(seedText);
  if (entries.length === 0) throw new Error(`No entries in ${SEED_PATH}. Run --collect first.`);

  const collectedOn = /# Collected on (\d{4}-\d{2}-\d{2})/.exec(seedText)?.[1] ?? "unknown";
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const list = limitArg ? entries.slice(0, Number(limitArg.split("=")[1])) : entries;

  console.log(`Auditing ${list.length} sites at concurrency ${CONCURRENCY}.`);
  let done = 0;
  const rows = await runPool(
    list,
    async (entry) => {
      const row = await auditOne(entry);
      done++;
      if (done % 10 === 0 || done === list.length) console.log(`  ${done}/${list.length}`);
      return row;
    },
    CONCURRENCY,
  );

  const totals = { clean: 0, fragmented: 0, "no-h1-in-html": 0, unreachable: 0 };
  for (const row of rows) totals[row.classification]++;

  const reachable = rows.length - totals.unreachable;
  const dataset = {
    dataset: "split-text-audit",
    version: 1,
    runDate: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    script: "scripts/split-text-audit.mjs",
    article: "https://fergusoreilly.dev/writing/split-text-audit-2026",
    sample: {
      source: "Awwwards Sites of the Day",
      listing: AWWWARDS_LISTING,
      pages: COLLECT_PAGES,
      collectedOn,
      seedFile: "scripts/split-text-audit-seed.txt",
      size: list.length,
    },
    method: {
      reads: "server HTML from a single GET, no JavaScript executed",
      userAgent: UA,
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      retries: RETRIES,
      headingRule:
        "The first h1 decides the classification. With no h1, or an h1 whose text is empty in the served HTML, the page is no-h1-in-html and the largest heading that is present is recorded as a fallback.",
      fragmentedRule: `A heading is fragmented when its markup contains a run of ${MIN_CHAR_RUN} or more consecutive single-character elements AND fewer than ${MAX_INTACT_RATIO * 100}% of its non-whitespace characters survive a pessimistic tag-stripping inside tokens of two characters or more.`,
      documentScan:
        "documentSingleCharElements and documentMaxCharRun apply the same single-character-element rule to the whole served document rather than to the heading. They are the falsification check: they separate 'per-character splitting is not in the served HTML' from 'it is there and the heading rule missed it'.",
      cannotSee:
        "Post-hydration DOM, computed styles, and anything rendered to canvas or WebGL. That is deliberate: the naive crawler's view is what is being measured.",
      biases:
        "Both halves of the fragmentation rule must hold, so a heading with one split word among intact prose scores clean. The count is a floor.",
    },
    totals: {
      ...totals,
      total: rows.length,
      reachable,
      // Pages carrying the split signature anywhere in the served document,
      // whether or not it reached a heading.
      documentSplitRun4Plus: rows.filter((r) => (r.documentMaxCharRun ?? 0) >= MIN_CHAR_RUN).length,
    },
    rows,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  const pct = (n) => (reachable === 0 ? "0.0" : ((n / reachable) * 100).toFixed(1));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  total          ${rows.length}`);
  console.log(`  unreachable    ${totals.unreachable}`);
  console.log(`  reachable      ${reachable}`);
  console.log(`  clean          ${totals.clean} (${pct(totals.clean)}% of reachable)`);
  console.log(`  fragmented     ${totals.fragmented} (${pct(totals.fragmented)}% of reachable)`);
  console.log(`  no-h1-in-html  ${totals["no-h1-in-html"]} (${pct(totals["no-h1-in-html"])}% of reachable)`);
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (process.argv.includes("--collect")) return collect();
  return audit();
}

// Only when run as a command. Everything above is exported so the classifier
// can be imported and pointed at a fixture without starting a 154-site crawl.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}
