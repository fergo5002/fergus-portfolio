"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { secondVisitCopy, TIGH_CREDIT } from "@/content/tools/second-visit";
import { secondVisitWorkbenchCopy as workbench } from "@/content/tool-workbench";
import { trackToolRun } from "@/lib/tools/events";
import type { Analysis } from "@/lib/tools/second-visit/analyse";
import { MAX_BYTES } from "@/lib/tools/second-visit/csv";
import { DEMO_VENUE_TOWN, demoCsv } from "@/lib/tools/second-visit/demo";
import { exportFiles } from "@/lib/tools/second-visit/exports";
import { PRODUCTION_PARAMS } from "@/lib/tools/second-visit/model";
import { dayFromIso, isoFromDay } from "@/lib/tools/second-visit/numbers";
import { formatDay } from "@/lib/instrument/dates";
import { DropSlot, ExportBar, Select, Slider, useIntake } from "@/components/instrument";
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The worked example, modelled once on the server so its curve and numbers are
 * in the first paint and in the HTML. Everything but the per-customer rows,
 * which are a third of a megabyte and only feed the downloads; the page fills
 * them in by modelling the same file in the background, and keeps the
 * downloads off until it has.
 */
export type SecondVisitDemo = {
  analysis: Analysis;
  conversion: { ignored: number; ambiguousDates: boolean };
};

export default function SecondVisitTool({ demo }: { demo?: SecondVisitDemo }) {
  const runner = useRef<Runner | null>(null);
  const [where, setWhere] = useState<Runner["where"] | null>(null);
  const [parsed, setParsed] = useState<Awaited<ReturnType<Runner["parse"]>> | null>(null);
  const [roles, setRoles] = useState<ColumnRoles | null>(null);
  const [venueTown, setVenueTown] = useState("");
  const [asOfIso, setAsOfIso] = useState("");
  const [params, setParams] = useState<ModelParams>(PRODUCTION_PARAMS);
  const [analysis, setAnalysis] = useState<Analysis | null>(demo?.analysis ?? null);
  /** False while the analysis on screen is the server's summary, with no rows behind the downloads. */
  const [full, setFull] = useState(!demo);
  const [message, setMessage] = useState<string | null>(null);
  const [conversion, setConversion] = useState<{ ignored: number; ambiguousDates: boolean } | null>(demo?.conversion ?? null);
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState({ parseMs: 0, modelMs: 0 });
  const [example, setExample] = useState(Boolean(demo));
  const [horizonDay, setHorizonDay] = useState(90);
  /** The newest attended date in the file, the default end, once a first analysis has found it. */
  const [fileEnd, setFileEnd] = useState<string | null>(demo?.analysis.asOfIso ?? null);
  const generation = useRef(0);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const made = makeRunner();
    runner.current = made;
    setWhere(made.where);
    // The server drew the made-up sauna. Model the same file here, quietly and
    // without clearing the screen, so the downloads and the settings have the
    // full analysis behind them.
    void read(demoCsv(), DEMO_VENUE_TOWN, ++generation.current, true);
    return () => {
      generation.current++;
      if (sliderTimer.current) clearTimeout(sliderTimer.current);
      made.dispose();
      runner.current = null;
    };
  }, []);

  const towns = useMemo(() => townOptions(), []);

  /** `quiet` refreshes what is already on screen: nothing is cleared and no busy line is shown. */
  async function read(text: string, defaultTown: string, ticket = ++generation.current, quiet = false) {
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    const active = runner.current;
    if (!active) return;
    if (!quiet) {
      setBusy(true);
      setMessage(null);
      setAnalysis(null);
      setFull(false);
      setConversion(null);
      setParsed(null);
      setRoles(null);
      setParams(PRODUCTION_PARAMS);
      setFileEnd(null);
    }
    setExample(defaultTown === DEMO_VENUE_TOWN);
    try {
      const result = await active.parse(text);
      if (ticket !== generation.current) return;
      setParsed(result);
      setRoles(result.roles);
      setVenueTown(defaultTown);
      setAsOfIso("");
      setTiming({ parseMs: result.ms, modelMs: 0 });
      if (result.roles.customer >= 0 && result.roles.date >= 0) {
        const analysed = await active.analyse({ type: "analyse", roles: result.roles, asOfDay: null, venueTown: defaultTown || null, params: PRODUCTION_PARAMS });
        if (ticket !== generation.current) return;
        setConversion({ ignored: analysed.ignored, ambiguousDates: analysed.ambiguousDates });
        if (analysed.used === 0) { setMessage(secondVisitCopy.refusals.badDates); }
        else {
          setAnalysis(analysed.analysis);
          setFull(true);
          setFileEnd(analysed.analysis.asOfIso);
          setTiming({ parseMs: result.ms, modelMs: analysed.ms });
        }
      }
    } catch (cause) {
      if (ticket !== generation.current) return;
      const kind = cause && typeof cause === "object" && "kind" in cause ? String(cause.kind) : "failed";
      setMessage(kind === "empty" ? secondVisitCopy.refusals.empty : workbench.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const ticket = ++generation.current;
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    setAnalysis(null); setParsed(null); setRoles(null); setConversion(null); setMessage(null); setExample(false); setFileEnd(null);
    if (file.size > MAX_BYTES) {
      setMessage(secondVisitCopy.refusals.tooBig);
      setBusy(false);
      void trackToolRun({ tool: "second-visit", outcome: "refused", ms: 0 });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (ticket !== generation.current) return;
      await read(text, "", ticket);
    } catch {
      if (ticket !== generation.current) return;
      setMessage(secondVisitCopy.refusals.failed);
      setBusy(false);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    }
  }

  async function run(next: ModelParams) {
    const active = runner.current;
    if (!active || !roles) return;
    const ticket = ++generation.current;
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
      if (ticket !== generation.current) return;
      setConversion({ ignored: result.ignored, ambiguousDates: result.ambiguousDates });
      if (result.used === 0) {
        setAnalysis(null);
        setMessage(secondVisitCopy.refusals.badDates);
        void trackToolRun({ tool: "second-visit", outcome: "refused", ms: round100(result.ms) });
        return;
      }
      setAnalysis(result.analysis);
      setFull(true);
      setTiming((current) => ({ ...current, modelMs: result.ms }));
      void trackToolRun({ tool: "second-visit", outcome: "ok", ms: round100(result.ms) });
    } catch {
      if (ticket !== generation.current) return;
      setAnalysis(null);
      setMessage(workbench.failed);
      void trackToolRun({ tool: "second-visit", outcome: "error", ms: 0 });
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  function moveSlider(key: keyof ModelParams, value: number) {
    const next = { ...params, [key]: value };
    setParams(next);
    setBusy(true);
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(() => void run(next), 200);
  }

  function invalidate() {
    generation.current++;
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    setAnalysis(null); setFull(false); setConversion(null); setBusy(false);
  }

  function download(name: string, body: string, type: string) {
    try { save(name, body, type); }
    catch { setMessage(workbench.downloadFailed); }
  }

  // Never disabled: a new file bumps the generation, so it wins over a read in flight.
  const intake = useIntake({ accept: ".csv,text/csv", onFiles: ([file]) => void onFile(file) });
  const horizon = analysis?.secondVisit.horizons.find((h) => h.day === horizonDay && !h.beyondFile && h.defined)
    ?? analysis?.secondVisit.horizons.find((h) => !h.beyondFile && h.defined)
    ?? analysis?.secondVisit.horizons[0];
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const chartEnd = analysis?.secondVisit.curve.reduce((max, point) => Math.max(max, point.day), 1) ?? 1;
  /* "Treat the file as ending on": a slider from the file's own end (the
     default) forward to today, capped at two years. No stock date input. */
  const endDay = fileEnd === null ? null : dayFromIso(fileEnd);
  const todayDay = dayFromIso(new Date().toISOString().slice(0, 10)) ?? 0;
  const asOfMax = endDay === null ? 0 : Math.max(0, Math.min(730, todayDay - endDay));
  const asOfOffset = endDay === null || asOfIso === "" ? 0 : Math.max(0, (dayFromIso(asOfIso) ?? endDay) - endDay);

  return (
    <div className="sv" aria-busy={busy} {...intake.stageProps}>
      <section className="sv__step sv__intake">
        <div className="sv__intake-row">
          <DropSlot intake={intake} id="sv-file" label={secondVisitCopy.steps.file.button} hint={secondVisitCopy.steps.file.hint} />
          <button className="sv__button sv__primary" type="button" disabled={busy} onClick={() => void read(demoCsv(), DEMO_VENUE_TOWN)}>
            {secondVisitCopy.steps.file.demo}
          </button>
        </div>
        {message ? <p className="sv__message" role="status">{message}</p> : null}
        {busy ? <p className="sv__hint" role="status">{secondVisitCopy.labels.working}</p> : null}
      </section>

      {analysis && horizon ? (
        <section className="sv__results">
          <p className="bench-subline">{example ? workbench.example : workbench.results}</p>
          {analysis.secondVisit.enough ? (
            <div className="sv__headline">
              <div className="sv__figure">
                <p className="sv__big">{percent(horizon.estimate)}</p>
                <p>{secondVisitCopy.headline.kmLabel}, {secondVisitCopy.headline.horizonLabel} {horizon.day}.</p>
                {horizon.defined ? (
                  <p>{secondVisitCopy.headline.intervalLabel}: {percent(horizon.lo)} to {percent(horizon.hi)}</p>
                ) : null}
              </div>
              <div className="sv__chart-frame">
                <div className="sv__axis-y"><span>100%</span><span>50%</span><span>0%</span></div>
                <svg className="sv__chart" viewBox="0 0 640 200" role="img" aria-label={secondVisitCopy.headline.kmLabel}>
                  {[0, .5, 1].map(v => <path key={v} className="sv__gridline" d={`M0 ${200 - v * 200}H640`} />)}
                  <path d={stepPath(analysis.secondVisit.curve, 640, 200)} fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d={`M${Math.min(640, horizon.day / chartEnd * 640)} 0V200`} className="sv__horizon" />
                </svg>
                <div className="sv__axis-x"><span>0</span><span>{Math.round(chartEnd / 2)}</span><span>{chartEnd}</span></div>
                <p className="sv__axis-title">{workbench.chartDays}</p>
              </div>
            </div>
          ) : (
            <p>{secondVisitCopy.refusals.tooFew}</p>
          )}
          <div className="sv__horizons" role="group" aria-label={workbench.horizon}>
            {analysis.secondVisit.horizons.map(h => <button key={h.day} type="button" className="bench-button" disabled={h.beyondFile || !h.defined} aria-pressed={h.day === horizon.day} onClick={() => setHorizonDay(h.day)}>{h.day} {workbench.days}</button>)}
          </div>
          <dl className="bench-metrics">
            <div><dt>{workbench.customers}</dt><dd>{analysis.counts.customers.toLocaleString("en-IE")}</dd></div>
            <div><dt>{workbench.visits}</dt><dd>{analysis.counts.attended.toLocaleString("en-IE")}</dd></div>
            <div><dt>{workbench.returned}</dt><dd>{analysis.secondVisit.events.toLocaleString("en-IE")}</dd></div>
          </dl>
          {analysis.secondVisit.enough ? (
            <>
              <p>{secondVisitCopy.headline.naiveLabel}: {percent(analysis.secondVisit.naive)}</p>
              <p className="sv__hint">{secondVisitCopy.headline.naiveNote}</p>
              <p>
                {secondVisitCopy.headline.medianLabel}:{" "}
                {analysis.secondVisit.medianDays === null
                  ? secondVisitCopy.headline.medianNotReached
                  : analysis.secondVisit.medianDays}
              </p>
            </>
          ) : null}

          {analysis.usingProductionParams ? null : <p className="sv__warn">{secondVisitCopy.honesty.changed}</p>}
          {conversion?.ignored ? (
            <p className="sv__warn">{conversion.ignored} {secondVisitCopy.labels.ignoredRows}</p>
          ) : null}
          {conversion?.ambiguousDates ? <p className="sv__warn">{secondVisitCopy.labels.ambiguousDates}</p> : null}
          {analysis.warnings.map((line) => (
            <p className="sv__hint" key={line}>{line}</p>
          ))}

          <h3>{workbench.groups}</h3>
          <p className="sv__hint">{workbench.groupNote}</p>
          <dl className="sv__groups">
            {analysis.verdicts.filter(group => group.count > 0).map(group => <div key={group.lifecycle}>
              <dt>{secondVisitCopy.verdicts[group.lifecycle].label}<span className="sv__hint">{secondVisitCopy.verdicts[group.lifecycle].note}</span></dt>
              <dd>{group.count}</dd>
              <span className="sv__group-bar" aria-hidden="true" style={{ width: `${100 * group.count / Math.max(1, analysis.counts.customers)}%` }} />
            </div>)}
          </dl>

          <details className="bench-details"><summary>{secondVisitCopy.slots.title}</summary>
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

          </details>
          <details className="bench-details"><summary>{secondVisitCopy.products.title}</summary>
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

          </details>
          <details className="bench-details"><summary>{workbench.settings}</summary>
          <div className="sv__sliders">
          {SLIDERS.map((slider) => (
            <Slider
              key={slider.key}
              label={slider.label}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={params[slider.key]}
              layout="stack"
              onChange={(value) => moveSlider(slider.key, value)}
            />
          ))}
          </div>
          <button className="sv__button" type="button" onClick={() => { setParams(PRODUCTION_PARAMS); void run(PRODUCTION_PARAMS); }}>
            {secondVisitCopy.sliders.reset}
          </button>
          </details>

          <h3>{workbench.actions}</h3>
          <ExportBar
            label={workbench.actions}
            note={secondVisitCopy.report.note}
            actions={[
              ...exportFiles(analysis).map((file) => ({
                label: file.name,
                kind: "csv" as const,
                disabled: busy || !full,
                onClick: () => download(file.file, file.csv, "text/csv;charset=utf-8"),
              })),
              {
                label: secondVisitCopy.report.button,
                kind: "html" as const,
                disabled: busy || !full,
                onClick: () => download(secondVisitCopy.report.file, reportHtml(analysis), "text/html;charset=utf-8"),
              },
            ]}
          />
        </section>
      ) : null}

      {/* Rendered while the server's example is on screen too, before the file has
          been read here, so the line does not appear under the results later. */}
      {(parsed && roles) || analysis ? <details className="bench-details sv__setup" open={!analysis}>
      <summary>{workbench.setup}</summary>
      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.columns.title}</h2>
          <p>{secondVisitCopy.steps.columns.hint}</p>
          <p className="sv__hint">
            {parsed.rows} {secondVisitCopy.labels.rows}, {secondVisitCopy.labels.parseMs} {timing.parseMs} ms,{" "}
            {secondVisitCopy.labels.modelMs} {timing.modelMs} ms
            {where === null ? "" : ` (${where})`}
          </p>
          {parsed.truncated ? <p className="sv__warn" role="status">{secondVisitCopy.refusals.truncated}</p> : null}
          {parsed.skipped > 0 ? (
            <p className="sv__hint">{parsed.skipped} {secondVisitCopy.labels.skippedRows}</p>
          ) : null}
          <div className="bench-columns">
          {(["customer", "date"] as const).map((role) => (
            <Select
              key={role}
              label={workbench.mappings[role]}
              value={String(roles[role])}
              onChange={(value) => { invalidate(); setRoles({ ...roles, [role]: Number(value) }); }}
            >
              <option value={-1}>{workbench.chooseColumn}</option>
              {parsed.header.map((name, index) => (
                <option key={`${name}-${index}`} value={index}>{name}</option>
              ))}
            </Select>
          ))}
          </div>
          <details className="bench-details"><summary>{workbench.optional}</summary>
          <div className="bench-columns">
          {OPTIONAL_ROLES.map((role) => (
            <Select
              key={role}
              label={workbench.mappings[role]}
              value={String(roles[role] ?? -1)}
              onChange={(value) => {
                const index = Number(value);
                invalidate();
                setRoles({ ...roles, [role]: index < 0 ? null : index });
              }}
            >
              <option value={-1}>{secondVisitCopy.labels.ignored}</option>
              {parsed.header.map((name, index) => (
                <option key={`${name}-${index}`} value={index}>{name}</option>
              ))}
            </Select>
          ))}
          </div></details>
        </section>
      ) : null}

      {parsed && roles ? (
        <section className="sv__step">
          <h2>{secondVisitCopy.steps.where.title}</h2>
          <Select
            label={secondVisitCopy.steps.where.townLabel}
            value={venueTown}
            onChange={(value) => { invalidate(); setVenueTown(value); }}
          >
            <option value="">{secondVisitCopy.labels.unknownTown}</option>
            {towns.map((town) => (
              <option key={town.name} value={town.name}>{town.name}</option>
            ))}
          </Select>
          <p className="sv__hint">{secondVisitCopy.steps.where.townHint} {TOWNS_ATTRIBUTION}</p>
          {endDay !== null && asOfMax > 0 ? (
            <Slider
              label={secondVisitCopy.steps.where.asOfLabel}
              min={0}
              max={asOfMax}
              value={asOfOffset}
              layout="stack"
              format={(offset) => formatDay(isoFromDay(endDay + offset))}
              onChange={(offset) => { invalidate(); setAsOfIso(offset === 0 ? "" : isoFromDay(endDay + offset)); }}
            />
          ) : null}
          <p className="sv__hint">{secondVisitCopy.steps.where.asOfHint}</p>
          <button className="sv__button" type="button" disabled={busy} onClick={() => void run(params)}>
            {secondVisitCopy.headline.title}
          </button>
        </section>
      ) : null}
      </details> : null}
    </div>
  );
}
