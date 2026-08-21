/**
 * Validates a completed share-of-model run and stores it in `results/`.
 *
 *   node scripts/share-of-model/record.mjs path/to/run.json
 *   node scripts/share-of-model/record.mjs path/to/run.json --force
 *
 * **Why this validates rather than just writing.** The whole harness is worth
 * nothing if the stored rows do not mean what the report says they mean, and
 * every check below exists because there is a specific way a run can be wrong
 * that would still average cleanly into a trend line. Three are load-bearing:
 *
 * 1. **A surface marked `missing` may not carry rows, and a surface that ran
 *    must carry them.** A missing surface is an absence. A zero is a
 *    measurement. They average very differently and only one is a fact about
 *    the site, so the schema refuses to let a hole become a data point.
 * 2. **`cited: true` requires a citing URL on the domain.** A citation with
 *    nothing behind it is an assertion. This is the structural version of
 *    "evidence in the same breath as the claim".
 * 3. **A row's `band` must match the band the question set gives that id.** A
 *    mislabelled control row is the one error that would make a broken run read
 *    as a triumph, so it is caught here rather than in the report.
 *
 * The run shape:
 *
 * {
 *   "date": "2026-08-21",
 *   "questionSetVersion": "1.0.0",
 *   "operator": "who or what ran it",
 *   "region": "IE",
 *   "notes": "anything about the run as a whole",
 *   "surfaces": {
 *     "claude-search": {
 *       "status": "run",
 *       "instrument": { "verdict": "clear", "note": "what the probes returned" },
 *       "notes": "optional",
 *       "rows": [
 *         {
 *           "id": "ent-01",
 *           "band": "entity",
 *           "outcome": "answered",
 *           "cited": false,
 *           "mentioned": false,
 *           "citingUrls": [],
 *           "competingDomains": ["crunchbase.com", "linkedin.com"],
 *           "notes": ""
 *         }
 *       ]
 *     },
 *     "chatgpt": { "status": "missing", "reason": "no account reachable from this session" }
 *   }
 * }
 *
 * There is no `process.exit()` in this file. Setting `process.exitCode` and
 * returning lets the event loop drain, which is the same reason `indexnow.mjs`
 * avoids it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const DOMAIN = "fergusoreilly.dev";

const OUTCOMES = ["answered", "refused", "error"];
const STATUSES = ["run", "missing", "error"];
const VERDICTS = ["clear", "index-absent", "degraded"];

class RunError extends Error {}

/** Every problem is collected before throwing: one run, one full list of what is wrong. */
class Problems {
  constructor() {
    this.list = [];
  }
  add(where, what) {
    this.list.push(`${where}: ${what}`);
  }
  get count() {
    return this.list.length;
  }
}

function loadQuestionSet() {
  const raw = readFileSync(join(HERE, "questions.json"), "utf8");
  const set = JSON.parse(raw);
  const byId = new Map(set.questions.map((q) => [q.id, q]));
  return { set, byId };
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

/**
 * Hostname only, lowercased, `www.` dropped.
 *
 * Competing domains are compared across runs, so `www.crunchbase.com` and
 * `crunchbase.com` have to collapse to one thing or the league table splits a
 * competitor in two and understates them.
 */
function normaliseDomain(value) {
  let host = String(value).trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.split("/")[0].split("?")[0].split("#")[0];
  host = host.replace(/^www\./, "");
  return host;
}

function validateRow(row, index, where, byId, problems) {
  const at = `${where} row ${index}${isPlainObject(row) && row.id ? ` (${row.id})` : ""}`;

  if (!isPlainObject(row)) {
    problems.add(at, "is not an object");
    return;
  }

  const question = byId.get(row.id);
  if (!question) {
    problems.add(at, `unknown question id ${JSON.stringify(row.id)}`);
    return;
  }

  // The check that matters most. A control row filed under `topic` would turn a
  // void run into a good-looking one, and nothing downstream could tell.
  if (row.band !== question.band) {
    problems.add(at, `band is ${JSON.stringify(row.band)} but ${row.id} is a ${question.band} question`);
  }

  if (!OUTCOMES.includes(row.outcome)) {
    problems.add(at, `outcome must be one of ${OUTCOMES.join(", ")}, got ${JSON.stringify(row.outcome)}`);
  }

  if (typeof row.cited !== "boolean") problems.add(at, "cited must be true or false");
  if (typeof row.mentioned !== "boolean") problems.add(at, "mentioned must be true or false");

  if (!isStringArray(row.citingUrls)) {
    problems.add(at, "citingUrls must be an array of strings");
  } else if (row.cited === true) {
    const onDomain = row.citingUrls.some((u) => normaliseDomain(u) === DOMAIN);
    if (!onDomain) {
      problems.add(
        at,
        `cited is true but no citingUrls entry is on ${DOMAIN}. A citation with nothing behind it is an assertion. ` +
          `If the link was to a different Fergus O'Reilly, that is a competing domain, not a citation.`,
      );
    }
  } else if (row.citingUrls.some((u) => normaliseDomain(u) === DOMAIN)) {
    problems.add(at, `cited is false but citingUrls contains a ${DOMAIN} URL`);
  }

  if (!isStringArray(row.competingDomains)) {
    problems.add(at, "competingDomains must be an array of strings");
  }

  // A question that was never answered cannot have chosen a source, so a
  // citation on a refusal is a recording error rather than a finding.
  if (row.outcome !== "answered" && (row.cited || row.mentioned)) {
    problems.add(at, `outcome is ${row.outcome} but cited/mentioned is set`);
  }

  if (row.notes !== undefined && typeof row.notes !== "string") {
    problems.add(at, "notes must be a string");
  }
}

function validate(run, questionSet, byId) {
  const problems = new Problems();

  if (!isPlainObject(run)) throw new RunError("Run is not a JSON object.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(run.date ?? ""))) {
    problems.add("run", `date must be YYYY-MM-DD, got ${JSON.stringify(run.date)}`);
  }

  if (run.questionSetVersion !== questionSet.version) {
    problems.add(
      "run",
      `questionSetVersion is ${JSON.stringify(run.questionSetVersion)} but questions.json is ` +
        `${JSON.stringify(questionSet.version)}. A run stored against the wrong version is not comparable.`,
    );
  }

  if (typeof run.operator !== "string" || run.operator.trim() === "") {
    problems.add("run", "operator is required (who or what ran it)");
  }

  if (!isPlainObject(run.surfaces) || Object.keys(run.surfaces).length === 0) {
    problems.add("run", "surfaces must be a non-empty object");
    throw new RunError(problems.list.join("\n"));
  }

  for (const [key, surface] of Object.entries(run.surfaces)) {
    const where = `surfaces.${key}`;

    if (!questionSet.surfaces.includes(key)) {
      problems.add(where, `unknown surface. Known: ${questionSet.surfaces.join(", ")}`);
      continue;
    }
    if (!isPlainObject(surface)) {
      problems.add(where, "is not an object");
      continue;
    }
    if (!STATUSES.includes(surface.status)) {
      problems.add(where, `status must be one of ${STATUSES.join(", ")}`);
      continue;
    }

    if (surface.status !== "run") {
      // The rule that keeps a hole from becoming a data point.
      if (Array.isArray(surface.rows) && surface.rows.length > 0) {
        problems.add(where, `status is ${surface.status} but it carries rows. A surface is missing OR measured, never both.`);
      }
      if (typeof surface.reason !== "string" || surface.reason.trim() === "") {
        problems.add(where, `status is ${surface.status} and needs a reason. "Not reachable" is a finding and it needs saying out loud.`);
      }
      continue;
    }

    if (!isPlainObject(surface.instrument) || !VERDICTS.includes(surface.instrument.verdict)) {
      problems.add(where, `a run surface needs instrument.verdict, one of ${VERDICTS.join(", ")}. Prove the instrument before accusing the object.`);
    }

    if (!Array.isArray(surface.rows) || surface.rows.length === 0) {
      problems.add(where, "status is run but there are no rows");
      continue;
    }

    const seen = new Set();
    surface.rows.forEach((row, i) => {
      validateRow(row, i, where, byId, problems);
      if (isPlainObject(row) && typeof row.id === "string") {
        if (seen.has(row.id)) problems.add(`${where} row ${i}`, `duplicate id ${row.id}`);
        seen.add(row.id);
      }
    });
  }

  if (problems.count > 0) {
    throw new RunError(`Refusing to store a malformed run. ${problems.count} problem(s):\n  - ${problems.list.join("\n  - ")}`);
  }
}

/** Domains are normalised on the way in so the report never has to guess. */
function canonicalise(run) {
  for (const surface of Object.values(run.surfaces)) {
    if (surface.status !== "run") continue;
    for (const row of surface.rows) {
      row.competingDomains = [...new Set(row.competingDomains.map(normaliseDomain))].filter(Boolean);
      row.notes = row.notes ?? "";
    }
  }
  run.recordedAt = new Date().toISOString();
  return run;
}

function summarise(run) {
  const lines = [];
  for (const [key, surface] of Object.entries(run.surfaces)) {
    if (surface.status !== "run") {
      lines.push(`  ${key.padEnd(22)} ${surface.status.toUpperCase()} (${surface.reason})`);
      continue;
    }
    const answered = surface.rows.filter((r) => r.outcome === "answered");
    const cited = answered.filter((r) => r.cited).length;
    const mentioned = answered.filter((r) => r.mentioned).length;
    const flag = surface.instrument.verdict === "clear" ? "" : `  [instrument: ${surface.instrument.verdict}]`;
    lines.push(
      `  ${key.padEnd(22)} ${surface.rows.length} rows, ${answered.length} answered, ` +
        `${cited} cited, ${mentioned} mentioned${flag}`,
    );
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    throw new RunError(
      "Usage: node scripts/share-of-model/record.mjs <run.json> [--force]\n" +
        "The run shape is documented at the top of this file.",
    );
  }
  if (!existsSync(path)) throw new RunError(`No such file: ${path}`);

  const { set, byId } = loadQuestionSet();

  let run;
  try {
    run = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new RunError(`${path} is not valid JSON: ${err.message}`);
  }

  validate(run, set, byId);

  mkdirSync(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, `${run.date}.json`);

  if (existsSync(target) && !force) {
    throw new RunError(
      `${target} already exists. Two runs on one date is usually a mistake.\n` +
        `If you meant to re-run the same day, pass --force, and say why in the run notes.`,
    );
  }

  writeFileSync(target, `${JSON.stringify(canonicalise(run), null, 2)}\n`, "utf8");

  const stored = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).length;
  console.log(`Stored ${target}`);
  console.log(summarise(run));
  console.log(`\n${stored} run(s) on file. Read them with: node scripts/share-of-model/report.mjs`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof RunError ? err.message : err);
  process.exitCode = 1;
}
