"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { secondVisitCopy, TIGH_CREDIT } from "@/content/tools/second-visit";
import { trackToolRun } from "@/lib/tools/events";
import type { Analysis } from "@/lib/tools/second-visit/analyse";
import { MAX_BYTES } from "@/lib/tools/second-visit/csv";
import { DEMO_VENUE_TOWN, demoCsv } from "@/lib/tools/second-visit/demo";
import { exportFiles } from "@/lib/tools/second-visit/exports";
import { PRODUCTION_PARAMS } from "@/lib/tools/second-visit/model";
import { dayFromIso } from "@/lib/tools/second-visit/numbers";
import { reportHtml, stepPath } from "@/lib/tools/second-visit/report";
import { townOptions, TOWNS_ATTRIBUTION } from "@/lib/tools/second-visit/towns";
import type { ColumnRoles, ModelParams } from "@/lib/tools/second-visit/types";
import { makeRunner, type Runner } from "./run-client";

/**
 * The one client component on this route.
 *
 * It holds four things: a runner, what the file turned out to be, which column
 * is which, and the last analysis. Everything it displays is computed in
 * `lib/tools/second-visit/` and everything it says comes from
 * `content/tools/second-visit.ts`.
 *
 * `tool_run` carries the slug, the outcome and the milliseconds rounded to the
 * nearest hundred, and nothing else. A millisecond-precise duration correlates
 * with file size, and file size is the visitor's business.
 */

const OPTIONAL_ROLES = [
  "amount",
  "slotStart",
  "capacity",
  "status",
  "town",
  "country",
  "product",
  "party",
  "credits",
  "consent",
  "email",
  "phone",
] as const;

/** The constants the page puts a slider on, with the range each is sane over. */
const SLIDERS: { key: keyof ModelParams; label: string; min: number; max: number; step: number }[] = [
  { key: "shrinkK", label: secondVisitCopy.sliders.shrinkK, min: 0, max: 10, step: 1 },
  { key: "localKm", label: secondVisitCopy.sliders.localKm, min: 1, max: 60, step: 1 },
  { key: "catchmentKm", label: secondVisitCopy.sliders.catchmentKm, min: 5, max: 150, step: 5 },
  { key: "regionalKm", label: secondVisitCopy.sliders.regionalKm, min: 20, max: 400, step: 5 },
  { key: "priorDistant", label: secondVisitCopy.sliders.distantFactor, min: 1, max: 10, step: 0.05 },
  { key: "priorVisitor", label: secondVisitCopy.sliders.visitorFactor, min: 1, max: 20, step: 0.5 },
  { key: "companionFactor", label: secondVisitCopy.sliders.companionFactor, min: 1, max: 3, step: 0.05 },
  { key: "lapsedRatio", label: secondVisitCopy.sliders.lapsedRatio, min: 1, max: 6, step: 0.1 },
  { key: "loyalVisits", label: secondVisitCopy.sliders.loyalVisits, min: 2, max: 40, step: 1 },
  { key: "gapFloorDays", label: secondVisitCopy.sliders.floorDays, min: 1, max: 30, step: 1 },
  { key: "gapCapDays", label: secondVisitCopy.sliders.capDays, min: 60, max: 1095, step: 5 },
];

const round100 = (ms: number) => Math.round(ms / 100) * 100;

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SecondVisitTool() {
  const runner = useRef<Runner | null>(null);
  const [where, setWhere] = useState<Runner["where"] | null>(null);
  const [parsed, setParsed] = useState<Awaited<ReturnType<Runner["parse"]>> | null>(null);
  const [roles, setRoles] = useState<ColumnRoles | null>(null);
  const [venueTown, setVenueTown] = useState("");
  const [asOfIso, setAsOfIso] = useState("");
  const [params, setParams] = useState<ModelParams>(PRODUCTION_PARAMS);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conversion, setConversion] = useState<{ ignored: number; ambiguousDates: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState({ parseMs: 0, modelMs: 0 });

  useEffect(() => {
    const made = makeRunner();
    runner.current = made;
    setWhere(made.where);
    return () => {
      made.dispose();
      runner.current = null;
    };
  }, []);

  const towns = useMemo(() => townOptions(), []);

  async function read(text: string, defaultTown: string) {
    const active = runner.current;
    if (!active) return;
    setBusy(true);
    setMessage(null);
    setAnalysis(null);
    setConversion(null);
    try {
      const result = await active.parse(text);
      setParsed(result);
      setRoles(result.roles);
      setVenueTown(defaultTown);
      setAsOfIso("");
      setTiming({ parseMs: result.ms, modelMs: 0 });
    } catch (cause) {
      const kind = cause && typeof cause === "object" && "kind" in cause ? String(cause.kind) : "failed";
      setMessage(kind === "empty" ? secondVisitCopy.refusals.empty : secondVisitCopy.refusals.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage(secondVisitCopy.refusals.tooBig);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    setBusy(true);
    try {
      await read(await file.text(), "");
    } catch {
      setMessage(secondVisitCopy.refusals.failed);
      setBusy(false);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    }
  }

  async function run(next: ModelParams) {
    const active = runner.current;
    if (!active || !roles) return;
    if (roles.customer < 0) {
      setMessage(secondVisitCopy.refusals.noCustomer);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    if (roles.date < 0) {
      setMessage(secondVisitCopy.refusals.noDate);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await active.analyse({
        type: "analyse",
        roles,
        asOfDay: asOfIso === "" ? null : dayFromIso(asOfIso),
        venueTown: venueTown === "" ? null : venueTown,
        params: next,
      });
      setConversion({ ignored: result.ignored, ambiguousDates: result.ambiguousDates });
      if (result.used === 0) {
        setMessage(secondVisitCopy.refusals.badDates);
        void trackToolRun({ tool: "second-visit", outcome: "refused", ms: round100(result.ms) });
        return;
      }
      setAnalysis(result.analysis);
      setTiming((current) => ({ ...current, modelMs: result.ms }));
      void trackToolRun({ tool: "second-visit", outcome: "ok", ms: round100(result.ms) });
    } catch {
      setMessage(secondVisitCopy.refusals.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      setBusy(false);
    }
  }

  function moveSlider(key: keyof ModelParams, value: number) {
    const next = { ...params, [key]: value };
    setParams(next);
    void run(next);
  }

  const horizon = analysis?.secondVisit.horizons.find((h) => !h.beyondFile && h.defined)
    ?? analysis?.secondVisit.horizons[0];
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="sv" aria-busy={busy}>
      <section className="sv__step">
        <h2>{secondVisitCopy.steps.file.title}</h2>
        <p>{secondVisitCopy.steps.file.hint}</p>
        <input
          className="sv__file"
          type="file"
          accept=".csv,text/csv"
          aria-label={secondVisitCopy.steps.file.button}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <button className="sv__button" type="button" onClick={() => void read(demoCsv(), DEMO_VENUE_TOWN)}>
          {secondVisitCopy.steps.file.demo}
        </button>
        <p className="sv__hint">{secondVisitCopy.steps.file.demoNote}</p>
        {message ? <p className="sv__message" role="status">{message}</p> : null}
        {busy ? <p className="sv__hint" role="status">{secondVisitCopy.labels.working}</p> : null}
      </section>

      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.columns.title}</h2>
          <p>{secondVisitCopy.steps.columns.hint}</p>
          <p className="sv__hint">
            {parsed.rows} {secondVisitCopy.labels.rows}, {secondVisitCopy.labels.parseMs} {timing.parseMs} ms
            {where === null ? "" : ` (${where})`}
          </p>
          {parsed.truncated ? <p className="sv__warn" role="status">{secondVisitCopy.refusals.truncated}</p> : null}
          {parsed.skipped > 0 ? (
            <p className="sv__hint">{parsed.skipped} {secondVisitCopy.labels.skippedRows}</p>
          ) : null}
          {(["customer", "date"] as const).map((role) => (
            <label className="sv__label" key={role}>
              {role}
              <select
                className="sv__select"
                value={roles[role]}
                onChange={(event) => setRoles({ ...roles, [role]: Number(event.target.value) })}
              >
                {parsed.header.map((name, index) => (
                  <option key={`${name}-${index}`} value={index}>{name}</option>
                ))}
              </select>
            </label>
          ))}
          {OPTIONAL_ROLES.map((role) => (
            <label className="sv__label" key={role}>
              {role}
              <select
                className="sv__select"
                value={roles[role] ?? -1}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setRoles({ ...roles, [role]: index < 0 ? null : index });
                }}
              >
                <option value={-1}>{secondVisitCopy.labels.ignored}</option>
                {parsed.header.map((name, index) => (
                  <option key={`${name}-${index}`} value={index}>{name}</option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}

      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.where.title}</h2>
          <label className="sv__label">
            {secondVisitCopy.steps.where.townLabel}
            <select className="sv__select" value={venueTown} onChange={(event) => setVenueTown(event.target.value)}>
              <option value="">{secondVisitCopy.labels.unknownTown}</option>
              {towns.map((town) => (
                <option key={town.name} value={town.name}>{town.name}</option>
              ))}
            </select>
          </label>
          <p className="sv__hint">{secondVisitCopy.steps.where.townHint} {TOWNS_ATTRIBUTION}</p>
          <label className="sv__label">
            {secondVisitCopy.steps.where.asOfLabel}
            <input className="sv__input" type="date" value={asOfIso} onChange={(event) => setAsOfIso(event.target.value)} />
          </label>
          <p className="sv__hint">{secondVisitCopy.steps.where.asOfHint}</p>
          <button className="sv__button" type="button" disabled={busy} onClick={() => void run(params)}>
            {secondVisitCopy.headline.title}
          </button>
        </section>
      ) : null}

      {analysis && horizon ? (
        <section className="sv__results">
          <h2>{secondVisitCopy.headline.title}</h2>
          {analysis.secondVisit.enough ? (
            <>
              <p className="sv__big">{percent(horizon.estimate)}</p>
              <p>{secondVisitCopy.headline.kmLabel}, {secondVisitCopy.headline.horizonLabel} {horizon.day}.</p>
              {horizon.defined ? (
                <p>{secondVisitCopy.headline.intervalLabel}: {percent(horizon.lo)} to {percent(horizon.hi)}</p>
              ) : null}
              <p>{secondVisitCopy.headline.naiveLabel}: {percent(analysis.secondVisit.naive)}</p>
              <p className="sv__hint">{secondVisitCopy.headline.naiveNote}</p>
              <p>
                {secondVisitCopy.headline.medianLabel}:{" "}
                {analysis.secondVisit.medianDays === null
                  ? secondVisitCopy.headline.medianNotReached
                  : analysis.secondVisit.medianDays}
              </p>
              <svg className="sv__chart" viewBox="0 0 640 200" role="img" aria-label={secondVisitCopy.headline.kmLabel}>
                <path d={stepPath(analysis.secondVisit.curve, 640, 200)} fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </>
          ) : (
            <p>{secondVisitCopy.refusals.tooFew}</p>
          )}

          {analysis.usingProductionParams ? null : <p className="sv__warn">{secondVisitCopy.honesty.changed}</p>}
          {conversion?.ignored ? (
            <p className="sv__warn">{conversion.ignored} {secondVisitCopy.labels.ignoredRows}</p>
          ) : null}
          {conversion?.ambiguousDates ? <p className="sv__warn">{secondVisitCopy.labels.ambiguousDates}</p> : null}
          {analysis.warnings.map((line) => (
            <p className="sv__hint" key={line}>{line}</p>
          ))}

          <h3>{secondVisitCopy.slots.title}</h3>
          {analysis.slots.length === 0 ? (
            <p>{secondVisitCopy.slots.missing}</p>
          ) : (
            <>
              <p className="sv__hint">{secondVisitCopy.slots.note}</p>
              <table className="sv__table">
                <thead>
                  <tr>
                    <th>{secondVisitCopy.slots.title}</th>
                    <th>{secondVisitCopy.slots.heatLabel}</th>
                    <th>{secondVisitCopy.slots.fullLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.slots.map((slot) => (
                    <tr key={`${slot.weekday}-${slot.hour}`}>
                      <td>{secondVisitCopy.slots.weekdays[slot.weekday - 1]} {slot.hour}</td>
                      <td>{slot.visits}</td>
                      <td>{slot.full}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>{secondVisitCopy.products.title}</h3>
          {analysis.products.length === 0 ? (
            <p>{secondVisitCopy.products.missing}</p>
          ) : (
            <table className="sv__table">
              <thead>
                <tr>
                  <th>{secondVisitCopy.products.columns.product}</th>
                  <th>{secondVisitCopy.products.columns.customers}</th>
                  <th>{secondVisitCopy.products.columns.median}</th>
                  <th>{secondVisitCopy.products.columns.overdue}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.products.map((product) => (
                  <tr key={product.product}>
                    <td>{product.product}</td>
                    <td>{product.customers}</td>
                    <td>{product.medianGapDays}</td>
                    <td>{product.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>{secondVisitCopy.sliders.title}</h3>
          {SLIDERS.map((slider) => (
            <label className="sv__label" key={slider.key}>
              {slider.label} ({params[slider.key]})
              <input
                className="sv__slider"
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={params[slider.key]}
                onChange={(event) => moveSlider(slider.key, Number(event.target.value))}
              />
            </label>
          ))}
          <button className="sv__button" type="button" onClick={() => { setParams(PRODUCTION_PARAMS); void run(PRODUCTION_PARAMS); }}>
            {secondVisitCopy.sliders.reset}
          </button>

          <h3>{secondVisitCopy.exports.lapsed.name}</h3>
          {exportFiles(analysis).map((file) => (
            <p key={file.file}>
              <button className="sv__button" type="button" onClick={() => save(file.file, file.csv, "text/csv;charset=utf-8")}>
                {file.name}
              </button>
              <span className="sv__hint">{file.note}</span>
            </p>
          ))}
          <button
            className="sv__button"
            type="button"
            onClick={() => save(secondVisitCopy.report.file, reportHtml(analysis), "text/html;charset=utf-8")}
          >
            {secondVisitCopy.report.button}
          </button>
          <p className="sv__hint">{secondVisitCopy.report.note}</p>
          <p className="sv__hint">{secondVisitCopy.labels.modelMs} {timing.modelMs} ms</p>
        </section>
      ) : null}

      <section className="sv__honesty">
        <h2>{secondVisitCopy.honesty.title}</h2>
        {secondVisitCopy.honesty.body.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {TIGH_CREDIT ? (
          <p>
            {TIGH_CREDIT.line}{" "}
            <a className="prose__link" href={TIGH_CREDIT.href}>{TIGH_CREDIT.name}</a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
