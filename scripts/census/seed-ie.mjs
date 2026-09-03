#!/usr/bin/env node
/**
 * S4 spike: pull the `.ie` block out of Common Crawl's host-level web graph.
 *
 *   node scripts/census/seed-ie.mjs
 *
 * Vertices are `<id>\t<reversed host>` sorted by reversed host, in 48 gzipped
 * parts. `.ie` hosts are the lines whose reversed host starts with `ie.`, a
 * contiguous block. We read the first 64 KB of a few parts to find which
 * parts hold the block (binary search over part heads), stream only those,
 * keep the block, un-reverse each host, collapse to registered domains, and
 * write data/census/ie-domains.txt plus a report of what it cost.
 *
 * No npm dependencies. Node 24: fetch, zlib and readline are built in.
 */
import { createGunzip, gunzipSync, constants as Z } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mkdirSync, writeFileSync } from "node:fs";

const CRAWL = "cc-main-2026-jun-jul-aug";
const BASE = `https://data.commoncrawl.org/projects/hyperlinkgraph/${CRAWL}/`;
const PATHS_URL = `${BASE}host/${CRAWL}-host-vertices.paths.gz`;
const DATA_ROOT = "https://data.commoncrawl.org/";
const UA = "fergusoreilly.dev census seed (one run a month; contact https://fergusoreilly.dev/contact)";
const HEAD_BYTES = 65_536;
const LOW = "ie.";   // first possible reversed host in the block
const HIGH = "ie/";  // '/' is the byte after '.', so this bounds every "ie.*"
const REGISTRY_2022 = 330_000; // .ie domains the registry reported in 2022, per the brief
const OUT_DIR = "data/census";

let bytesDownloaded = 0;
let requests = 0;

async function fetchRetry(url, init = {}) {
  for (let attempt = 0; ; attempt += 1) {
    requests += 1;
    const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
    if (res.status === 429 || res.status === 503) {
      if (attempt >= 6) throw new Error(`${url}: ${res.status} after ${attempt} retries`);
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      console.log(`  ${res.status} on ${url.split("/").pop()}, waiting ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok && res.status !== 206) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }
}

/** Reversed host on the first data line of a part, from its first 64 KB. */
const headCache = new Map();
async function firstHost(partPath) {
  if (headCache.has(partPath)) return headCache.get(partPath);
  const res = await fetchRetry(DATA_ROOT + partPath, { headers: { range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (res.status !== 206) throw new Error(`range not honoured on ${partPath}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  bytesDownloaded += buf.length;
  const text = gunzipSync(buf, { finishFlush: Z.Z_SYNC_FLUSH }).toString("utf8");
  for (const line of text.split("\n")) {
    const [id, host] = line.split("\t");
    if (/^\d+$/.test(id) && host) {
      headCache.set(partPath, host);
      return host;
    }
  }
  throw new Error(`no data line in the head of ${partPath}`);
}

/** Largest index k with firstHost(k) <= key, or -1. Binary search over heads. */
async function lastPartAtOrBelow(parts, key) {
  let lo = 0;
  let hi = parts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const h = await firstHost(parts[mid]);
    console.log(`  head ${mid.toString().padStart(2, "0")} ${h}`);
    if (h <= key) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

/** Second-level zones under .ie from the Public Suffix List, falling back to gov.ie. */
async function secondLevelZones() {
  try {
    const res = await fetchRetry("https://publicsuffix.org/list/public_suffix_list.dat");
    const text = await res.text();
    const zones = text.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".ie") && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("!"));
    return { zones: new Set(zones), source: "publicsuffix.org" };
  } catch (error) {
    console.log(`  PSL fetch failed (${String(error)}), using gov.ie only`);
    return { zones: new Set(["gov.ie"]), source: "fallback" };
  }
}

function registeredDomain(host, zones) {
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (zones.has(lastTwo)) return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  return lastTwo;
}

/** Stream one part, keeping the ie. block. Stops reading once past it. */
async function streamPart(partPath, onHost) {
  const controller = new AbortController();
  const res = await fetchRetry(DATA_ROOT + partPath, { signal: controller.signal });
  const counter = new Transform({
    transform(chunk, _enc, cb) { bytesDownloaded += chunk.length; cb(null, chunk); },
  });
  const gunzip = createGunzip();
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  let scanned = 0;
  let stopped = false;
  // Spike fix (2026-09-03): after controller.abort() the pipeline destroys
  // gunzip with an AbortError, readline re-emits it as 'error' on the
  // Interface, and by then the for-await loop has broken out so nothing is
  // listening and Node throws. Swallow only the abort we asked for.
  const swallowAfterStop = (error) => { if (!stopped) console.error(`stream error before stop: ${String(error)}`); };
  gunzip.on("error", swallowAfterStop);
  lines.on("error", swallowAfterStop);
  const consume = (async () => {
    for await (const line of lines) {
      scanned += 1;
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const host = line.slice(tab + 1);
      if (host < LOW) continue;
      if (host >= HIGH) { stopped = true; controller.abort(); break; }
      onHost(host);
    }
  })();
  try {
    await pipeline(Readable.fromWeb(res.body), counter, gunzip);
  } catch (error) {
    if (!stopped) throw error; // an abort we asked for is not an error
  }
  await consume.catch((error) => { if (!stopped) throw error; });
  return { scanned, stoppedEarly: stopped };
}

async function main() {
  const t0 = performance.now();
  console.log(`listing: ${PATHS_URL}`);
  const listing = await fetchRetry(PATHS_URL);
  const listBuf = Buffer.from(await listing.arrayBuffer());
  bytesDownloaded += listBuf.length;
  const parts = gunzipSync(listBuf).toString("utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`parts: ${parts.length}`);

  console.log("finding the part that starts the block");
  const k0 = Math.max(0, await lastPartAtOrBelow(parts, LOW));
  console.log("finding the part that ends the block");
  const k1 = Math.max(k0, await lastPartAtOrBelow(parts, HIGH));
  // Sanity: the head after k1 must be above the block, or the block runs to the end.
  const after = k1 + 1 < parts.length ? await firstHost(parts[k1 + 1]) : null;
  console.log(`block in parts ${k0}..${k1} (${k1 - k0 + 1} part(s)); first head after block: ${after ?? "none"}`);
  const headBytes = bytesDownloaded;

  const { zones, source } = await secondLevelZones();
  console.log(`second-level zones (${source}): ${[...zones].join(", ") || "none"}`);

  const hosts = [];
  const domains = new Set();
  let firstSeen = null;
  let lastSeen = null;
  let scannedTotal = 0;
  for (let k = k0; k <= k1; k += 1) {
    console.log(`streaming part ${k}: ${parts[k]}`);
    const tPart = performance.now();
    const { scanned, stoppedEarly } = await streamPart(parts[k], (reversed) => {
      const host = reversed.split(".").reverse().join(".");
      hosts.push(host);
      if (firstSeen === null) firstSeen = host;
      lastSeen = host;
      const dom = registeredDomain(host, zones);
      if (dom) domains.add(dom);
    });
    scannedTotal += scanned;
    console.log(`  scanned ${scanned} lines, stopped early: ${stoppedEarly}, ${Math.round(performance.now() - tPart)} ms`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const sorted = [...domains].sort();
  writeFileSync(`${OUT_DIR}/ie-domains.txt`, `${sorted.join("\n")}\n`);
  const wallMs = Math.round(performance.now() - t0);
  const report = {
    crawl: CRAWL,
    partsTotal: parts.length,
    partsStreamed: parts.slice(k0, k1 + 1),
    headBytes,
    bytesDownloaded,
    requests,
    linesScanned: scannedTotal,
    hosts: hosts.length,
    registeredDomains: sorted.length,
    secondLevelZones: [...zones],
    zonesSource: source,
    firstHost: firstSeen,
    lastHost: lastSeen,
    wallMs,
    coverageOf2022Registry: Number((sorted.length / REGISTRY_2022).toFixed(3)),
  };
  writeFileSync(`${OUT_DIR}/seed-ie-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
