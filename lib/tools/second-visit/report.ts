import { TIGH_CREDIT, secondVisit, secondVisitCopy } from "@/content/tools/second-visit";
import type { Analysis } from "./analyse";

/**
 * The saved report: one HTML file, no network, no scripts.
 *
 * It opens from a `file://` URL on a laptop with the wifi off, in five years,
 * in whatever browser exists then. That rules out a stylesheet, a font, an
 * image, an `@import` and any `url()`, and `report.test.ts` greps for all of
 * them. The one link is the credit, which is something somebody clicks rather
 * than something the document loads.
 *
 * Everything a visitor's file put into it goes through `escapeHtml`. The
 * identifiers in here came out of somebody else's system and this file is
 * handed back as a document a browser will render.
 *
 * The chart is an inline SVG path built here rather than a library, for the
 * same reason: a library is a script.
 */

/** Ampersand first, or every other replacement gets escaped a second time. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (cents: number) => `${(cents / 100).toFixed(2)}`;

/**
 * A survival curve is a step function: it holds flat between events and drops
 * at one. Drawing it with a smooth line would claim knowledge about the days
 * between events that nobody has.
 */
export function stepPath(
  points: readonly { day: number; returned: number }[],
  width: number,
  height: number,
): string {
  if (points.length === 0) return "";
  const maxDay = Math.max(...points.map((p) => p.day), 1);
  const x = (day: number) => ((day / maxDay) * width).toFixed(2);
  const y = (value: number) => (height - value * height).toFixed(2);
  let path = `M0 ${y(0)}`;
  for (const point of points) {
    path += ` H${x(point.day)} V${y(point.returned)}`;
  }
  path += ` H${width.toFixed(2)}`;
  return path;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 32px; max-width: 900px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 32px 0 8px; }
  p { margin: 0 0 10px; }
  .sub { opacity: 0.7; margin-bottom: 24px; }
  .big { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
  .muted { opacity: 0.7; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid rgba(128,128,128,0.3); }
  td.n, th.n { text-align: right; }
  svg { max-width: 100%; height: auto; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
`;

function table(header: readonly string[], rows: readonly (string | number | null)[][]): string {
  const head = header.map((h, i) => `<th${i > 0 ? ' class="n"' : ""}>${e(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td${i > 0 ? ' class="n"' : ""}>${cell === null ? "" : e(String(cell))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function reportHtml(analysis: Analysis): string {
  const copy = secondVisitCopy;
  const horizon = analysis.secondVisit.horizons.find((h) => !h.beyondFile && h.defined)
    ?? analysis.secondVisit.horizons[0];

  const headline = analysis.secondVisit.enough
    ? `<p class="big">${pct(horizon.estimate)}</p>
       <p class="muted">${e(copy.headline.kmLabel)}, ${e(copy.headline.horizonLabel)} ${horizon.day}.
       ${horizon.defined ? `${e(copy.headline.intervalLabel)} ${pct(horizon.lo)} to ${pct(horizon.hi)}.` : ""}</p>
       <p class="muted">${e(copy.headline.naiveLabel)}: ${pct(analysis.secondVisit.naive)}. ${e(copy.headline.naiveNote)}</p>
       <p class="muted">${e(copy.headline.medianLabel)}: ${
         analysis.secondVisit.medianDays === null
           ? e(copy.headline.medianNotReached)
           : `${analysis.secondVisit.medianDays} days`
       }.</p>`
    : `<p>${e(copy.refusals.tooFew)}</p>`;

  const curve = analysis.secondVisit.curve.length
    ? `<svg viewBox="0 0 640 200" role="img" aria-label="${e(copy.report.sections.curve)}">
         <path d="${stepPath(analysis.secondVisit.curve, 640, 200)}" fill="none" stroke="currentColor" stroke-width="2"/>
       </svg>`
    : "";

  const settings = Object.entries(analysis.params).map(([key, value]) => [key, value as number]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(copy.report.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${e(copy.report.title)}</h1>
<p class="sub">${e(analysis.counts.customers.toLocaleString("en-IE"))} customers, ${e(
    analysis.counts.attended.toLocaleString("en-IE"),
  )} attended bookings, ${e(analysis.span.firstIso ?? "")} to ${e(analysis.span.lastIso ?? "")}, measured as at ${e(
    analysis.asOfIso,
  )}${analysis.venue ? `, from ${e(analysis.venue.name)}` : ""}.</p>

<h2>${e(copy.report.sections.summary)}</h2>
${headline}

<h2>${e(copy.report.sections.curve)}</h2>
${curve}
${table(
  ["Day", "Returned by then"],
  analysis.secondVisit.horizons.map((h) => [h.day, h.beyondFile ? copy.headline.horizonDisabled : pct(h.estimate)]),
)}

<h2>${e(copy.report.sections.verdicts)}</h2>
${table(
  ["Verdict", "Customers"],
  analysis.verdicts.map((v) => [
    (copy.verdicts as Record<string, { label: string }>)[v.lifecycle]?.label ?? v.lifecycle,
    v.count,
  ]),
)}

<h2>${e(copy.report.sections.bands)}</h2>
${table(
  ["Band", "Customers", "Median expected gap, days"],
  analysis.bands.map((b) => [b.band, b.customers, b.medianExpectedGapDays]),
)}

<h2>${e(copy.report.sections.slots)}</h2>
<p class="muted">${e(copy.slots.note)}</p>
${
  analysis.slots.length === 0
    ? `<p>${e(copy.slots.missing)}</p>`
    : table(
        ["Weekday", "Hour", "Slots", "Visits", "Sold out"],
        analysis.slots.map((s) => [copy.slots.weekdays[s.weekday - 1], s.hour, s.slots, s.visits, s.full]),
      )
}

<h2>${e(copy.report.sections.products)}</h2>
${
  analysis.products.length === 0
    ? `<p>${e(copy.products.missing)}</p>`
    : table(
        [copy.products.columns.product, copy.products.columns.customers, copy.products.columns.median, copy.products.columns.overdue],
        analysis.products.map((p) => [p.product, p.customers, p.medianGapDays, p.overdue]),
      )
}

<h2>Top of the winback list</h2>
${table(
  ["Customer", "Visits", "Last visit", "Verdict", "Worth, euro"],
  [...analysis.rows]
    .sort((a, b) => b.winnabilityCents - a.winnabilityCents)
    .slice(0, 50)
    .map((r) => [r.id, r.visits, r.lastIso, r.lifecycle, money(r.winnabilityCents)]),
)}

<h2>${e(copy.report.sections.settings)}</h2>
<p class="muted">${
    analysis.usingProductionParams ? "" : e(copy.honesty.changed)
  }</p>
${table(["Constant", "Value"], settings)}

<h2>${e(copy.report.sections.limits)}</h2>
<ul>${secondVisit.cantSee.map((line) => `<li>${e(line)}</li>`).join("")}</ul>
${analysis.warnings.map((line) => `<p class="muted">${e(line)}</p>`).join("")}
${
  TIGH_CREDIT
    ? `<p class="muted">${e(TIGH_CREDIT.line)} <a href="${e(TIGH_CREDIT.href)}">${e(TIGH_CREDIT.name)}</a></p>`
    : ""
}
<p class="muted">${e(copy.report.note)}</p>
</body>
</html>
`;
}

