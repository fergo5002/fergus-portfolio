/**
 * Reads every stored run and prints the share-of-model report.
 *
 *   node scripts/share-of-model/report.mjs
 *   node scripts/share-of-model/report.mjs --surface claude-search
 *
 * **Share of model** is cited answers over answered questions. Refusals and
 * errors are excluded from the denominator, because a question that was never
 * answered cannot have chosen a source, and counting it as a miss would make a
 * rate-limited afternoon look like a drop in visibility.
 *
 * Three things this file deliberately refuses to do:
 *
 * - **It will not draw a trend through one point.** With a single run it says
 *   so and prints nothing that looks like a direction.
 * - **It will not print a share-of-model number for a surface whose instrument
 *   was not clear.** An `index-absent` surface produces a real, honest, useless
 *   zero: the site was never a candidate. Reporting that as 0% visibility next
 *   to a healthy surface's 0% would be two different findings sharing a number.
 * - **It will not quietly average a void run.** Any citation in the control
 *   band voids that surface, loudly, at the top.
 *
 * Plain text on purpose. It gets pasted into notes and read in a terminal.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const BANDS = ["entity", "topic", "competitive", "control"];

/**
 * Below this many answered questions, a percentage is arithmetic rather than a
 * finding, so it is printed with a marker. One out of two is not fifty percent
 * of anything.
 */
const LOW_N = 5;

function loadQuestions() {
  const set = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"));
  return { set, byId: new Map(set.questions.map((q) => [q.id, q])) };
}

function loadRuns() {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
}

/** `null` rather than 0 when nothing was answered: no data is not a zero. */
function rate(cited, answered) {
  return answered === 0 ? null : cited / answered;
}

function pct(value) {
  return value === null ? "  n/a" : `${(value * 100).toFixed(0).padStart(4)}%`;
}

function tally(rows, predicate = () => true) {
  const picked = rows.filter(predicate);
  const answered = picked.filter((r) => r.outcome === "answered");
  return {
    total: picked.length,
    answered: answered.length,
    refused: picked.filter((r) => r.outcome === "refused").length,
    errored: picked.filter((r) => r.outcome === "error").length,
    cited: answered.filter((r) => r.cited).length,
    mentioned: answered.filter((r) => r.mentioned).length,
    share: rate(answered.filter((r) => r.cited).length, answered.length),
  };
}

function heading(text) {
  return `\n${text}\n${"=".repeat(text.length)}`;
}

function subheading(text) {
  return `\n${text}\n${"-".repeat(text.length)}`;
}

function main() {
  const wanted = process.argv.includes("--surface")
    ? process.argv[process.argv.indexOf("--surface") + 1]
    : null;

  const { set, byId } = loadQuestions();
  const runs = loadRuns();

  if (runs.length === 0) {
    console.log("No runs stored yet. Follow run.md, then record it with record.mjs.");
    return;
  }

  const out = [];
  out.push(heading("Share of model: fergusoreilly.dev"));
  out.push(`Question set v${set.version}, ${set.questions.length} questions across ${BANDS.length} bands.`);
  out.push(`${runs.length} run(s): ${runs.map((r) => r.date).join(", ")}`);

  // --- Void check first. Nothing below is readable if this fires. ---
  const voided = [];
  for (const run of runs) {
    for (const [key, surface] of Object.entries(run.surfaces)) {
      if (surface.status !== "run") continue;
      const hits = surface.rows.filter((r) => r.band === "control" && (r.cited || r.mentioned));
      if (hits.length > 0) voided.push({ date: run.date, key, ids: hits.map((h) => h.id) });
    }
  }
  if (voided.length > 0) {
    out.push(subheading("VOID RUNS"));
    out.push("The control band produced hits. These questions were chosen because the site should");
    out.push("never win them, so this is a broken instrument rather than a result. Do not quote a");
    out.push("share-of-model number off these surfaces.");
    for (const v of voided) out.push(`  ${v.date} ${v.key}: ${v.ids.join(", ")}`);
  }

  // --- Instrument state, before any number. ---
  out.push(subheading("Instrument"));
  for (const run of runs) {
    for (const [key, surface] of Object.entries(run.surfaces)) {
      if (wanted && key !== wanted) continue;
      if (surface.status !== "run") {
        out.push(`  ${run.date}  ${key.padEnd(22)} MISSING: ${surface.reason}`);
      } else {
        const note = surface.instrument.note ? ` (${surface.instrument.note})` : "";
        out.push(`  ${run.date}  ${key.padEnd(22)} ${surface.instrument.verdict}${note}`);
      }
    }
  }
  out.push("");
  out.push("  clear         the surface can retrieve the domain, so a zero means it was not chosen");
  out.push("  index-absent  the surface cannot see the domain at all, so a zero means nothing else");
  out.push("  degraded      the measurement path itself was unhealthy, so the rows are not evidence");
  out.push("  MISSING       never counted as a zero, in either direction");

  // --- Per surface, latest run. ---
  const latest = runs[runs.length - 1];
  let lowN = false;
  out.push(subheading(`Share of model by surface (${latest.date}, latest run)`));
  out.push("  surface                 share   cited  ment.  answ.  refused  errors");

  for (const [key, surface] of Object.entries(latest.surfaces)) {
    if (wanted && key !== wanted) continue;
    if (surface.status !== "run") {
      out.push(`  ${key.padEnd(22)}  missing`);
      continue;
    }
    const t = tally(surface.rows, (r) => r.band !== "control");
    const share = surface.instrument.verdict === "clear" ? pct(t.share) : "  n/a";
    const thin = surface.instrument.verdict === "clear" && t.answered > 0 && t.answered < LOW_N;
    out.push(
      `  ${key.padEnd(22)} ${share}${thin ? "*" : " "} ${String(t.cited).padStart(5)}  ${String(t.mentioned).padStart(5)}  ` +
        `${String(t.answered).padStart(5)}  ${String(t.refused).padStart(7)}  ${String(t.errored).padStart(6)}`,
    );
    if (surface.instrument.verdict !== "clear") {
      out.push(`      no share printed: instrument was ${surface.instrument.verdict}, so the zeros are not about the site`);
    }
    if (thin) lowN = true;
  }
  out.push("");
  out.push("  Control band excluded from these figures. It is a check, not a target.");
  if (lowN) {
    out.push(`  * fewer than ${LOW_N} answered questions. One citation out of two is not 50% of anything,`);
    out.push("    it is two samples. Finish the set before quoting the percentage.");
  }

  // --- Per band. ---
  out.push(subheading(`Share of model by band (${latest.date}, latest run)`));
  for (const [key, surface] of Object.entries(latest.surfaces)) {
    if (wanted && key !== wanted) continue;
    if (surface.status !== "run") continue;
    out.push(`  ${key}`);
    for (const band of BANDS) {
      const t = tally(surface.rows, (r) => r.band === band);
      if (t.total === 0) {
        out.push(`    ${band.padEnd(13)} not run`);
        continue;
      }
      const readable = surface.instrument.verdict === "clear";
      const value = band === "control" ? (t.cited === 0 ? "  clean" : "  HITS ") : readable ? pct(t.share) : "  n/a";
      out.push(`    ${band.padEnd(13)} ${value}   ${t.cited}/${t.answered} answered${t.total > t.answered ? `, ${t.total - t.answered} not answered` : ""}`);
    }
  }

  // --- Trend. ---
  out.push(subheading("Trend"));
  if (runs.length < 2) {
    out.push("  One run, no trend available.");
    out.push("  A single run is one sample from a non-deterministic system. It is a starting point");
    out.push("  to compare against, not a measurement of anything on its own.");
  } else {
    const surfaces = [...new Set(runs.flatMap((r) => Object.keys(r.surfaces)))];
    for (const key of surfaces) {
      if (wanted && key !== wanted) continue;
      const points = runs.map((run) => {
        const surface = run.surfaces[key];
        if (!surface || surface.status !== "run") return `${run.date} —`;
        if (surface.instrument.verdict !== "clear") return `${run.date} n/a`;
        const t = tally(surface.rows, (r) => r.band !== "control");
        return `${run.date} ${pct(t.share).trim()}`;
      });
      out.push(`  ${key.padEnd(22)} ${points.join("  ->  ")}`);
    }
    out.push("");
    out.push("  A dash is a surface that was not reached that month, not a zero.");
    out.push("  Movement between two single samples is not a result. Two runs is a line through two");
    out.push("  noisy points, and it takes a few before a direction means anything.");
  }

  // --- Who is winning instead. ---
  out.push(subheading("Competing domains cited instead (all runs)"));
  const counts = new Map();
  for (const run of runs) {
    for (const [key, surface] of Object.entries(run.surfaces)) {
      if (wanted && key !== wanted) continue;
      if (surface.status !== "run") continue;
      for (const row of surface.rows) {
        if (row.band === "control") continue;
        for (const domain of row.competingDomains) {
          const entry = counts.get(domain) ?? { n: 0, bands: new Set() };
          entry.n += 1;
          entry.bands.add(row.band);
          counts.set(domain, entry);
        }
      }
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
  if (ranked.length === 0) {
    out.push("  Nothing recorded. Either no answers cited sources, or competingDomains was left empty.");
  } else {
    for (const [domain, entry] of ranked) {
      out.push(`  ${String(entry.n).padStart(4)}  ${domain.padEnd(34)} ${[...entry.bands].join(", ")}`);
    }
  }

  // --- The questions that have never landed. ---
  out.push(subheading("Never once cited"));
  const everCited = new Set();
  const everAsked = new Set();
  const askedOnClearSurface = new Set();
  for (const run of runs) {
    for (const surface of Object.values(run.surfaces)) {
      if (surface.status !== "run") continue;
      for (const row of surface.rows) {
        everAsked.add(row.id);
        if (surface.instrument.verdict === "clear") askedOnClearSurface.add(row.id);
        if (row.cited) everCited.add(row.id);
      }
    }
  }

  const never = set.questions.filter(
    (q) => q.band !== "control" && everAsked.has(q.id) && !everCited.has(q.id),
  );
  if (never.length === 0) {
    out.push("  Every question asked has produced at least one citation.");
  } else {
    for (const q of never) {
      const seen = askedOnClearSurface.has(q.id) ? "" : "   [never asked on a clear instrument]";
      out.push(`  ${q.id}  ${q.band.padEnd(12)} ${q.text}${seen}`);
    }
    out.push("");
    out.push("  A question flagged [never asked on a clear instrument] tells you nothing about the");
    out.push("  site: no surface that could see the domain has been asked it yet.");
  }

  const notAsked = set.questions.filter((q) => !everAsked.has(q.id));
  if (notAsked.length > 0) {
    out.push(subheading("Never asked"));
    out.push("  In the question set, absent from every stored run. Not a zero.");
    for (const q of notAsked) out.push(`  ${q.id}  ${q.band.padEnd(12)} ${q.text}`);
  }

  out.push("");
  out.push("What this report cannot see is in README.md. Read it before quoting a number.");
  out.push("");

  console.log(out.join("\n"));
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
