#!/usr/bin/env node
/**
 * S3 spike: Postgres 16 in a throwaway container against the tab's DuckDB rows.
 *
 *   node scripts/spike-duckdb/compare.mjs
 *
 * Needs .spike/duckdb-out.json, written by the page on localhost. No npm
 * dependencies: psql runs inside the container over docker exec.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { makeBookings, toCsv, ROWS, SEED } from "../../lib/tools/second-visit/synth.mjs";
import { POSTGRES_SETUP, retentionSql, OUTPUT_COLUMNS } from "../../lib/tools/second-visit/retention-sql.mjs";

const CONTAINER = "spike-pg";
const TOLERANCE = 1e-9;
const LOOSE = 1e-6;
const BIG = 256 * 1024 * 1024;

function sh(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: BIG });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout;
}
function psql(sql) {
  return sh("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At", "-F", ","], sql);
}

const t0 = performance.now();
spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
sh("docker", ["run", "-d", "--rm", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=x", "-p", "5433:5432", "postgres:16"]);
for (let i = 0; ; i += 1) {
  const r = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
  if (r.status === 0) break;
  if (i > 60) throw new Error("postgres did not become ready in 60 s");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
console.log(`postgres ready in ${Math.round(performance.now() - t0)} ms`);

psql(POSTGRES_SETUP);
const csv = toCsv(makeBookings(SEED, ROWS));
const tCopy = performance.now();
psql(`copy bookings from stdin csv header;\n${csv}\\.\n`);
console.log(`copied ${ROWS} rows in ${Math.round(performance.now() - tCopy)} ms`);

const tQuery = performance.now();
const pgOut = psql(retentionSql("postgres"));
const pgMs = Math.round(performance.now() - tQuery);
const pg = new Map();
for (const line of pgOut.split("\n")) {
  if (!line) continue;
  const parts = line.split(",");
  const row = Object.fromEntries(OUTPUT_COLUMNS.map((c, i) => [c, parts[i]]));
  pg.set(Number(row.customer_id), row);
}
console.log(`postgres query rows=${pg.size} ms=${pgMs}`);

const DUCK_PATH = process.argv[2] ?? ".spike/duckdb-out.json"; // spike change: allow the Node-path output too
const duck = JSON.parse(readFileSync(DUCK_PATH, "utf8"));
console.log(`comparing against ${DUCK_PATH} engine=${duck.engine}`);
console.log(`duckdb rows=${duck.rows.length} queryMs=${duck.queryMs} loadMs=${duck.loadMs}`);

const numeric = ["base_gap_days", "distance_factor", "expected_gap_days"];
const exact = ["visits", "observed_gaps"];
let compared = 0;
let tight = 0;
let loose = 0;
const maxDiff = Object.fromEntries(numeric.map((c) => [c, 0]));
const examples = [];
for (const d of duck.rows) {
  const id = Number(d.customer_id);
  const p = pg.get(id);
  if (!p) { examples.push({ id, missingIn: "postgres" }); continue; }
  compared += 1;
  for (const c of exact) {
    if (Number(d[c]) !== Number(p[c])) { tight += 1; loose += 1; examples.push({ id, c, duck: d[c], pg: p[c] }); }
  }
  for (const c of numeric) {
    const diff = Math.abs(Number(d[c]) - Number(p[c]));
    if (diff > maxDiff[c]) maxDiff[c] = diff;
    if (diff > TOLERANCE) { tight += 1; if (examples.length < 10) examples.push({ id, c, duck: d[c], pg: p[c], diff }); }
    if (diff > LOOSE) loose += 1;
  }
}
const missingInDuck = [...pg.keys()].filter((id) => !duck.rows.some((r) => Number(r.customer_id) === id)).length;

const report = {
  rowsCompared: compared,
  missingInPostgres: examples.filter((e) => e.missingIn).length,
  missingInDuck,
  mismatchesAt1e9: tight,
  mismatchesAt1e6: loose,
  maxAbsDiff: maxDiff,
  postgresQueryMs: pgMs,
  duckdbQueryMs: duck.queryMs,
  duckdbLoadMs: duck.loadMs,
  examples: examples.slice(0, 10),
};
mkdirSync(".spike", { recursive: true });
writeFileSync(DUCK_PATH.replace(/duckdb-out(-node)?\.json$/, "s3-compare$1.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
sh("docker", ["stop", CONTAINER]);
