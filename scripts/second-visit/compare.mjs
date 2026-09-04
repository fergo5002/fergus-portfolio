/**
 * The oracle. Runs migration 0300's own SQL in a throwaway Postgres 16 and
 * either checks the committed golden files against it, or rewrites them.
 *
 *   node scripts/second-visit/compare.mjs            verify (default)
 *   node scripts/second-visit/compare.mjs --write    regenerate
 *   node scripts/second-visit/compare.mjs --keep     leave the container up
 *
 * Not part of `npm test` and not run in CI, for the same reason
 * scripts/mutation-check.mjs is not: it needs Docker and it takes a minute.
 * What runs in CI is lib/tools/second-visit/oracle.test.ts, which reads the
 * golden files this produced. So the division is:
 *
 *   this script      is the golden file really what Postgres says
 *   the vitest test  does the TypeScript port agree with the golden file
 *
 * **Neither of them ever reads the TypeScript.** A golden file regenerated
 * from the port would be a mirror rather than an oracle.
 *
 * `--duckdb` is documented in oracle/0300-macros.sql and is not implemented
 * here. S3 already established that DuckDB and Postgres agree to 1.14e-13.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ORACLE = "lib/tools/second-visit/oracle";
const CONTAINER = "sv-oracle-pg";
const PORT = "55432";
const TOLERANCE = 1e-9;

const write = process.argv.includes("--write");
const keep = process.argv.includes("--keep");

/** Every function, its argument types, and whether the result is a number. */
const SIGNATURES = {
  distance_km: { args: ["double precision", "double precision", "double precision", "double precision"], numeric: true },
  distance_band: { args: ["double precision", "boolean"], numeric: false },
  distance_prior_factor: { args: ["text"], numeric: true },
  blend_prior: { args: ["numeric", "integer"], numeric: true },
  shrink: { args: ["numeric", "integer", "numeric"], numeric: true },
  season_factor: { args: ["numeric"], numeric: true },
  expected_gap_days: { args: ["numeric", "numeric", "numeric", "numeric"], numeric: true },
  retention_verdict: { args: ["integer", "numeric", "boolean", "boolean", "boolean", "boolean"], numeric: false },
  reachability: { args: ["boolean", "boolean", "boolean", "boolean"], numeric: true },
  p_return_prior: { args: ["text", "integer"], numeric: true },
  smooth_rate: { args: ["numeric", "numeric", "numeric", "numeric"], numeric: true },
  winnability_cents: { args: ["numeric", "numeric", "numeric"], numeric: true },
};

function sql(value, type) {
  if (value === null || value === undefined) return `null::${type}`;
  if (typeof value === "boolean") return `${value}::${type}`;
  if (typeof value === "number") return `(${value})::${type}`;
  const quoted = String(value).replace(/'/g, "''");
  return `'${quoted}'::${type}`;
}

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function psql(text) {
  return docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], text);
}

function start() {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  } catch {
    // Nothing to remove, which is the normal case.
  }
  execFileSync("docker", [
    "run", "--rm", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=oracle",
    "-p", `${PORT}:5432`, "postgres:16",
  ], { stdio: "inherit" });
  for (let i = 0; i < 60; i++) {
    const ready = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (ready.status === 0) return;
    execFileSync("node", ["-e", "setTimeout(()=>{},1000)"]);
  }
  throw new Error("postgres did not come up within sixty seconds");
}

function stop() {
  if (keep) {
    console.log(`container ${CONTAINER} left running on port ${PORT}`);
    return;
  }
  try {
    execFileSync("docker", ["stop", CONTAINER], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}

/** CSV normalised to LF, because a Windows checkout hands these over as CRLF. */
const lf = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function loadFixture() {
  const manifest = JSON.parse(lf(`${ORACLE}/manifest.json`));
  psql(`
    create schema fx;
    create table fx.bookings (
      customer_id text, booking_date date, amount numeric, slot_start text,
      capacity int, status text, town text, country text, product text,
      party_size int, credits_remaining int
    );
    create table fx.towns (name text, county text, country text, lat double precision, lng double precision);
    create table fx.settings (as_of date, venue_town text);
  `);
  docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "\\copy fx.bookings from stdin with (format csv, header true)"], lf(`${ORACLE}/bookings.csv`));
  docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "\\copy fx.towns from stdin with (format csv, header true)"], lf(`${ORACLE}/towns.csv`));
  psql(`insert into fx.settings values ('${manifest.asOfIso}', '${manifest.venueTown.replace(/'/g, "''")}');`);
  // The pipeline SQL reads `slot_hour` and `amount_cents`; the export column is
  // a clock time and a decimal, so the two derived columns are added here
  // rather than making the fixture carry a shape no real export has.
  psql(`
    alter table fx.bookings add column slot_hour int;
    alter table fx.bookings add column amount_cents numeric;
    alter table fx.bookings add column local_date date;
    update fx.bookings set
      slot_hour = nullif(split_part(slot_start, ':', 1), '')::int,
      amount_cents = round(amount * 100),
      local_date = booking_date;
  `);
  return manifest;
}

function runScalars() {
  const cases = JSON.parse(lf(`${ORACLE}/scalars.json`));
  const parts = cases.map(({ i, fn, args }) => {
    const signature = SIGNATURES[fn];
    if (!signature) throw new Error(`no signature for ${fn}`);
    const rendered = args.map((value, index) => sql(value, signature.args[index])).join(", ");
    return `select ${i} as i, coalesce(hearth.${fn}(${rendered})::text, 'NULL') as value`;
  });
  const out = {};
  // Chunked so one statement does not run to megabytes.
  for (let start = 0; start < parts.length; start += 200) {
    const text = parts.slice(start, start + 200).join(" union all ") + " order by i;";
    for (const line of psql(text).trim().split("\n")) {
      if (line === "") continue;
      const [i, ...rest] = line.split("|");
      out[Number(i)] = rest.join("|");
    }
  }
  return cases.map(({ i, fn, args }) => ({ i, fn, args, value: out[i] }));
}
function runPipeline() {
  // psql already has -At. Repeating the formatting commands writes status
  // prose to stdout, ahead of the JSON this function parses.
  const pipeline = lf(ORACLE + "/pipeline.sql").replace(/;\s*$/, "");
  const text = "select coalesce(json_agg(x), '[]'::json)::text from (" + pipeline + ") x;";
  return JSON.parse(psql(text).trim());
}

function compare(name, fresh, goldenPath) {
  const golden = JSON.parse(lf(goldenPath));
  const problems = [];
  if (golden.length !== fresh.length) {
    problems.push(`${name}: ${golden.length} golden rows against ${fresh.length} fresh`);
  }
  const limit = Math.min(golden.length, fresh.length);
  for (let i = 0; i < limit; i++) {
    for (const key of Object.keys(fresh[i])) {
      const a = golden[i][key];
      const b = fresh[i][key];
      if (a === b) continue;
      // Scalar cases retain their argument arrays so a mismatch can name the
      // exact input. JSON parsing creates distinct arrays on each side, so
      // compare their values before falling through to numeric tolerance.
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      const bothNumbers = typeof a !== "boolean" && typeof b !== "boolean" && a !== null && b !== null && Number.isFinite(Number(a)) && Number.isFinite(Number(b));
      if (bothNumbers && Math.abs(Number(a) - Number(b)) <= TOLERANCE) continue;
      problems.push(`${name}[${i}].${key}: golden ${JSON.stringify(a)} against fresh ${JSON.stringify(b)}`);
    }
  }
  return problems;
}

try {
  start();
  psql(lf(`${ORACLE}/0300-functions.sql`));
  const manifest = loadFixture();
  console.log(`fixture: ${manifest.rows} rows, ${manifest.customers} customers, as of ${manifest.asOfIso}`);

  const scalars = runScalars();
  const pipeline = runPipeline();
  console.log(`postgres answered ${scalars.length} scalar cases and ${pipeline.length} customer rows`);

  if (write) {
    writeFileSync(`${ORACLE}/scalars.golden.json`, JSON.stringify(scalars) + "\n", "utf8");
    writeFileSync(`${ORACLE}/pipeline.golden.json`, JSON.stringify(pipeline) + "\n", "utf8");
    console.log("golden files rewritten from postgres");
  } else {
    const problems = [
      ...compare("scalars", scalars, `${ORACLE}/scalars.golden.json`),
      ...compare("pipeline", pipeline, `${ORACLE}/pipeline.golden.json`),
    ];
    if (problems.length > 0) {
      console.error(`${problems.length} differences between the committed golden files and postgres:`);
      for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("the committed golden files still match postgres");
    }
  }
} finally {
  stop();
}
