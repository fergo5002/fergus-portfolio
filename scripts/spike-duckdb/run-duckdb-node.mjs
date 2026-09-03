#!/usr/bin/env node
/**
 * S3 spike, Node path: run the same DuckDB-WASM engine the page uses, but
 * under Node's worker_threads, and write .spike/duckdb-out.json in the shape
 * compare.mjs expects. Used when the browser step cannot be driven here.
 * The numbers it gives are macro creation, row values and query ms in the
 * WASM engine; it says nothing about a phone's fetch or instantiate time.
 *
 *   node scripts/spike-duckdb/run-duckdb-node.mjs
 */
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { makeBookings, toCsv, ROWS, SEED } from "../../lib/tools/second-visit/synth.mjs";
import { DUCKDB_SETUP, retentionSql } from "../../lib/tools/second-visit/retention-sql.mjs";

const require = createRequire(import.meta.url);
const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node.cjs");
const DUCKDB_NODE_CJS = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node.cjs");
const DIST = path.dirname(DUCKDB_NODE_CJS);
const say = (s) => console.log(`${new Date().toISOString()} ${s}`);
const jsonSafe = (_k, v) => (typeof v === "bigint" ? Number(v) : v);

const bundle = await duckdb.selectBundle({
  mvp: { mainModule: path.join(DIST, "duckdb-mvp.wasm"), mainWorker: path.join(DIST, "duckdb-node-mvp.worker.cjs") },
  eh: { mainModule: path.join(DIST, "duckdb-eh.wasm"), mainWorker: path.join(DIST, "duckdb-node-eh.worker.cjs") },
});
say(`bundle=${path.basename(bundle.mainModule)} bytesOnDisk=${statSync(bundle.mainModule).size}`);

const tLoad = performance.now();
// AsyncDuckDB wants a browser-shaped Worker (addEventListener, events with .data).
// worker_threads.Worker has .on(). The bundle's createWorker fetches a URL and
// hands a blob URL to its inlined web-worker shim, which Node's fetch cannot do
// for a file path ("unknown scheme", observed). The worker script itself talks
// over parentPort, so only the main side needs this adapter.
class BrowserShapedWorker {
  constructor(file) {
    // Replicates the bundle's inlined web-worker shim: load duckdb-node.cjs in a
    // worker thread with workerData.mod, and it sets up self/addEventListener/
    // postMessage there and requires the real worker script (read from the
    // minified source: `new R.Worker(__filename,{workerData:{mod:o,name:n,type:a}})`).
    this.inner = new Worker(DUCKDB_NODE_CJS, { workerData: { mod: file, name: undefined, type: undefined } });
    this.listeners = new Map();
    this.inner.on("message", (data) => this.dispatch("message", { data }));
    this.inner.on("error", (error) => { console.error(`[worker error] ${error?.stack ?? String(error)}`); this.dispatch("error", error); });
    this.inner.on("exit", (code) => { console.error(`[worker exit] code=${code}`); this.dispatch("close", {}); });
    this.inner.stderr?.on("data", (d) => process.stderr.write(`[worker stderr] ${d}`));
  }
  addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn); }
  removeEventListener(type, fn) { const a = this.listeners.get(type); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  dispatch(type, event) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
  postMessage(message, transfer) { this.inner.postMessage(message, transfer); }
  terminate() { return this.inner.terminate(); }
}
const worker = new BrowserShapedWorker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const loadMs = Math.round(performance.now() - tLoad);
say(`wasm load+instantiate (node, from disk) ms=${loadMs}`);
say(`duckdb version=${await db.getVersion()}`);

const conn = await db.connect();
const tGen = performance.now();
const rows = makeBookings(SEED, ROWS);
const csv = toCsv(rows);
say(`generate rows=${rows.length} csvBytes=${csv.length} ms=${Math.round(performance.now() - tGen)}`);

const tTable = performance.now();
await db.registerFileText("bookings.csv", csv);
await conn.query(`
  create table bookings as
  select * from read_csv('bookings.csv', header = true, columns = {
    'customer_id': 'INTEGER', 'visit_date': 'DATE', 'amount_cents': 'INTEGER',
    'party_size': 'INTEGER', 'distance_prior': 'DOUBLE', 'season_factor': 'DOUBLE'
  })`);
say(`table load ms=${Math.round(performance.now() - tTable)}`);

const macroErrors = [];
const tMacros = performance.now();
for (const stmt of DUCKDB_SETUP.split(";").map((s) => s.trim()).filter(Boolean)) {
  try {
    await conn.query(stmt);
  } catch (error) {
    macroErrors.push({ stmt: stmt.slice(0, 60), error: String(error) });
    say(`MACRO FAILED: ${stmt.slice(0, 60)}... -> ${String(error)}`);
  }
}
say(`macros created ms=${Math.round(performance.now() - tMacros)} failures=${macroErrors.length}`);

const sql = retentionSql("duckdb");
const timings = [];
let out = [];
for (let i = 0; i < 3; i += 1) {
  const tQuery = performance.now();
  const table = await conn.query(sql);
  timings.push(Math.round(performance.now() - tQuery));
  out = table.toArray().map((r) => r.toJSON());
}
const queryMs = timings[0];
const checksum = out.reduce((a, r) => a + Number(r.expected_gap_days), 0);
say(`query rows=${out.length} ms(run1,run2,run3)=${timings.join(",")} sum(expected_gap_days)=${checksum.toFixed(6)}`);
say(`column types: ${Object.entries(out[0] ?? {}).map(([k, v]) => `${k}:${typeof v}`).join(" ")}`);

const mem = await conn.query("select sum(memory_usage_bytes)::bigint as bytes from duckdb_memory()");
say(`duckdb memory bytes=${String(mem.toArray()[0]?.toJSON().bytes)}`);
say(`node process rss bytes=${process.memoryUsage().rss}`);

mkdirSync(".spike", { recursive: true });
writeFileSync(
  ".spike/duckdb-out-node.json",
  JSON.stringify({ engine: "duckdb-wasm-node", queryMs, queryMsRuns: timings, loadMs, macroErrors, rows: out }, jsonSafe),
);
say("wrote .spike/duckdb-out-node.json");
await conn.close();
await db.terminate();
await worker.terminate();
