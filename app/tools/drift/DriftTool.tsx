"use client";

import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { driftWorkbenchCopy as workbench } from "@/content/tool-workbench";
import { draftReadiness, profileReadiness } from "@/lib/tools/drift/readiness";
import { useSystem } from "@/components/system/SystemProvider";
import { driftCopy, driftDemo } from "@/content/tools/drift";
import { buildReference, type Reference } from "@/lib/tools/drift/reference";
import { selfSpread, type SelfSpread } from "@/lib/tools/drift/delta";
import { MIN_PROFILE_WORDS, profileOf, type VoiceProfile } from "@/lib/tools/drift/profile";
import { analyse, type DriftReport } from "@/lib/tools/drift/report";
import {
  DRIFT_PROFILE_KEY,
  parseProfile,
  removeSavedProfile,
  serialiseProfile,
} from "@/lib/tools/drift/storage";
import { splitPieces } from "@/lib/tools/drift/text";
import {
  afterBuild,
  afterDelete,
  afterDemo,
  afterRestore,
  afterSave,
  canMeasure,
  demoSession,
} from "@/lib/tools/drift/session";
import { trackToolRun } from "@/lib/tools/events";

/**
 * The tool.
 *
 * Everything here is arithmetic in this tab. There is no action, no fetch and
 * no server call: the visitor's pieces build their own reference table a few
 * lines below, and every function it feeds is pure. That is what lets the
 * privacy line say what it says.
 *
 * `reference` is state, not a prop. It starts as the worked example's table,
 * built from my eleven articles on the server, and `onBuild` replaces it with
 * one built from the visitor's pieces. Everything downstream reads the state,
 * so once they have pressed build there is no path left that scores their draft
 * against my writing. That was the bug: a Delta is measured in the reference
 * population's standard deviations, so a stranger measured against my articles
 * gets a real number in somebody else's units, on somebody else's words, under
 * a sentence about their own voice.
 *
 * Local storage is touched in exactly three places and never on a timer: read
 * once on mount (a profile the visitor saved on a previous visit, reference and
 * all), written in `onSave`, removed in `onDrop`. `app/tools/drift/page.test.ts`
 * counts the writes, because "saved only if they press save" is a promise and a
 * promise needs a test.
 *
 * Every storage call sits in a try/catch. Safari in private mode throws on
 * `setItem` rather than failing quietly, and a tool that dies on a browser
 * setting is worse than one that cannot remember anything.
 */
export default function DriftTool({
  demoReference,
  demoProfile,
  demoSpread,
  demoReport,
}: {
  demoReference: Reference;
  demoProfile: VoiceProfile;
  demoSpread: SelfSpread | null;
  demoReport: DriftReport;
}) {
  const uid = useId();
  const { audio } = useSystem();

  const [session, setSession] = useState(() => demoSession(driftDemo.draft));
  const [reference, setReference] = useState<Reference>(demoReference);
  const [profile, setProfile] = useState<VoiceProfile>(demoProfile);
  const [spread, setSpread] = useState<SelfSpread | null>(demoSpread);
  const [report, setReport] = useState<DriftReport>(demoReport);
  const [note, setNote] = useState<string>(driftCopy.demoNote);
  const [announcement, setAnnouncement] = useState("");
  const [measured, setMeasured] = useState<{ samples: string; draft: string }>({ samples: "", draft: driftDemo.draft });
  const deferredSamples = useDeferredValue(session.samples);
  const deferredDraft = useDeferredValue(session.draft);
  const sampleReady = useMemo(() => profileReadiness(deferredSamples), [deferredSamples]);
  const draftReady = useMemo(() => draftReadiness(deferredDraft), [deferredDraft]);
  const stale = session.samples !== measured.samples || session.draft !== measured.draft;

  useEffect(() => {
    try {
      const stored = parseProfile(window.localStorage.getItem(DRIFT_PROFILE_KEY));
      if (!stored) return;
      setReference(stored.reference);
      setProfile(stored.profile);
      setSpread(stored.spread);
      // The server rendered the worked example. Once a saved profile replaces
      // its reference and profile, replace its report in the same turn too;
      // otherwise the note says the saved profile is active while the numbers
      // immediately below still say they were built from my eleven articles.
      setReport(analyse(stored.profile, driftDemo.draft, stored.reference, stored.spread));
      setSession((current) => afterRestore(current, stored.savedAt));
      setNote(driftCopy.savedNote);
      setAnnouncement(driftCopy.announceRestored);
    } catch {
      // Storage blocked. Nothing to restore, and nothing to say about it.
    }
  }, []);

  function onBuild() {
    if (!profileReadiness(session.samples).bounded || !draftReadiness(session.draft).bounded) {
      setNote(workbench.oversized); setAnnouncement(workbench.oversized); return;
    }
    const pieces = splitPieces(session.samples);
    if (pieces.length === 0) {
      setNote(driftCopy.noSamples);
      setAnnouncement(driftCopy.announceNoSamples);
      return;
    }
    // Their pieces, their table. Built before the profile, because the profile
    // is a set of z-scores against exactly this.
    const built = buildReference(pieces);
    const made = profileOf(pieces, built);
    const range = selfSpread(pieces, built);
    setReference(built);
    setProfile(made);
    setSpread(range);
    // Re-measure straight away, so the demo's numbers never sit under a profile
    // that has just been replaced. Not a `tool_run`: nothing was measured on a
    // draft the visitor chose to measure.
    setReport(analyse(made, session.draft, built, range));
    setMeasured({ samples: session.samples, draft: session.draft });
    setSession((current) => afterBuild(current));
    const profileNote = made.words < MIN_PROFILE_WORDS ? driftCopy.thinProfile : "";
    const persistenceNote =
      session.savedAt === null ? driftCopy.neverSaved : driftCopy.unsavedOverSaved;
    setNote(`${profileNote} ${persistenceNote}`.trim());
    setAnnouncement(driftCopy.announceBuilt);
  }

  function onMeasure() {
    if (!draftReadiness(session.draft).bounded) { setNote(workbench.oversized); return; }
    if (session.samples !== measured.samples) { onBuild(); return; }
    if (!canMeasure(session)) {
      setNote(driftCopy.noProfile);
      setAnnouncement(driftCopy.noProfile);
      return;
    }
    const started = Date.now();
    const next = analyse(profile, session.draft, reference, spread);
    setReport(next);
    setMeasured({ samples: session.samples, draft: session.draft });
    setAnnouncement(
      next.status === "ok" ? driftCopy.announceMeasured : driftCopy.announceRefused,
    );
    void trackToolRun({
      tool: "drift",
      outcome: next.status === "ok" ? "ok" : "refused",
      ms: Date.now() - started,
    });
  }

  function onSave() {
    const now = new Date().toISOString();
    const record = serialiseProfile(reference, profile, spread, now);
    try {
      window.localStorage.setItem(DRIFT_PROFILE_KEY, record);
      setSession((current) => afterSave(current, now));
      setNote(driftCopy.savedNote);
      setAnnouncement(driftCopy.announceSaved);
    } catch {
      setNote(driftCopy.neverSaved);
      setAnnouncement(driftCopy.announceSaveFailed);
    }
  }

  function onDrop() {
    if (!removeSavedProfile(window.localStorage)) {
      setNote(driftCopy.dropFailed);
      setAnnouncement(driftCopy.announceDeleteFailed);
      return;
    }
    setSession((current) => afterDelete(current, true, driftDemo.draft));
    setReference(demoReference);
    setProfile(demoProfile);
    setSpread(demoSpread);
    setReport(demoReport);
    setMeasured({ samples: "", draft: driftDemo.draft });
    setNote(driftCopy.droppedNote);
    setAnnouncement(driftCopy.announceDeleted);
  }

  function onDemo() {
    setReference(demoReference);
    setProfile(demoProfile);
    setSpread(demoSpread);
    setReport(demoReport);
    setMeasured({ samples: session.samples, draft: driftDemo.draft });
    setSession((current) => afterDemo(current, driftDemo.draft));
    setNote(driftCopy.demoNote);
    setAnnouncement(driftCopy.announceDemo);
  }

  const samplesId = `${uid}-samples`;
  const draftId = `${uid}-draft`;
  const number = (value: number) => value.toFixed(2);

  function onDownload() {
    try {
      const text = [
        `# ${session.source === "demo" ? workbench.demo : workbench.yours}`,
        `${driftCopy.deltaHeading}: ${report.delta === null ? report.status : number(report.delta)}`,
        workbench.rangeNote,
        `\n## ${driftCopy.metricsHeading}`,
        ...report.metrics.map(row => `${driftCopy.metricLabels[row.key]}: ${number(row.profile)} → ${number(row.draft)}`),
        `\n## ${driftCopy.substitutionsHeading}`,
        ...report.substitutions.map(row => driftCopy.substitutionRow(row)),
        `\n## ${driftCopy.pullsHeading}`,
        ...report.pulls.map(pull => `${pull.text}\n${pull.reasons.map(reason => driftCopy.reasonLabels[reason]).join(", ")}`),
      ].join("\n\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "drift-report.md"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNote(workbench.downloadFailed); }
  }

  return (
    <div className="drift">
      <p className="drift__note">
        {note}
      </p>
      <p className="drift__announcement" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="drift__fields">
        <div className="drift__field">
          <label className="drift__label" htmlFor={samplesId}>
            {driftCopy.samplesLabel}
          </label>
          <p className="drift__hint">{driftCopy.samplesHint}</p>
          <textarea
            id={samplesId}
            className="drift__input"
            rows={8}
            value={session.samples}
            placeholder={driftCopy.samplesPlaceholder}
            onChange={(e) => setSession((current) => ({ ...current, samples: e.target.value }))}
            onKeyDown={() => audio.key()}
          />
          <p className="drift__readiness">{sampleReady.bounded ? workbench.samples(sampleReady.pieces, sampleReady.words) : workbench.oversized}</p>
          <div className="drift__actions">
            <button type="button" className="drift__button" onClick={onBuild}>
              {driftCopy.build}
            </button>
            <button type="button" className="drift__button" onClick={() => {
              setSession(current => ({ ...current, samples: current.samples.trimEnd() + "\n\n---\n\n" }));
              document.getElementById(samplesId)?.focus();
            }}>{workbench.addPiece}</button>
          </div>
          <details className="bench-details">
          <summary>{workbench.storage}</summary>
          <div className="drift__actions">
            <button
              type="button"
              className="drift__button"
              onClick={onSave}
              disabled={session.source !== "visitor"}
            >
              {driftCopy.save}
            </button>
            <button
              type="button"
              className="drift__button"
              onClick={onDrop}
              disabled={session.savedAt === null}
            >
              {driftCopy.drop}
            </button>
          </div>
          <p className="drift__hint">{driftCopy.savedContents}</p>
          </details>
        </div>

        <div className="drift__field">
          <label className="drift__label" htmlFor={draftId}>
            {driftCopy.draftLabel}
          </label>
          <p className="drift__hint">{driftCopy.draftHint}</p>
          <textarea
            id={draftId}
            className="drift__input"
            rows={8}
            value={session.draft}
            placeholder={driftCopy.draftPlaceholder}
            onChange={(e) => setSession((current) => ({ ...current, draft: e.target.value }))}
            onKeyDown={() => audio.key()}
          />
          <p className="drift__readiness">{draftReady.bounded ? workbench.draft(draftReady.words) : workbench.oversized}</p>
          <div className="drift__actions">
            <button
              type="button"
              className="drift__button"
              onClick={onMeasure}
              disabled={!canMeasure(session)}
            >
              {driftCopy.measure}
            </button>
            <button type="button" className="drift__button" onClick={onDemo}>
              {driftCopy.useDemo}
            </button>
          </div>
        </div>
      </div>

      <section className="drift__report">
        <div className="drift__report-top"><p>{session.source === "demo" ? workbench.demo : workbench.yours}</p><button type="button" className="bench-button" onClick={onDownload} disabled={stale}>{workbench.download}</button></div>
        {stale ? <p className="bench-warning" role="status">{workbench.stale}</p> : null}
        <h2 className="drift__heading">{driftCopy.deltaHeading}</h2>
        {report.status === "ok" ? (
          <p className="drift__delta">{number(report.delta ?? 0)}</p>
        ) : (
          <p className="drift__refusal">
            {report.status === "too-short" ? driftCopy.tooShort : driftCopy.tooFewPieces}
          </p>
        )}
        {report.status === "ok" && report.selfSpread && report.delta !== null ? <div className="drift__reading">
          <strong>{report.delta > report.selfSpread.max ? workbench.above : report.delta < report.selfSpread.min ? workbench.below : workbench.within}</strong>
          <p className="bench-note">{workbench.rangeNote}</p>
          <div className="drift__range" role="img" aria-label={`${driftCopy.spreadHeading}: ${number(report.selfSpread.min)} to ${number(report.selfSpread.max)}. ${driftCopy.deltaHeading}: ${number(report.delta)}`}>
            <span style={{ left: `${Math.min(95, 100 * report.selfSpread.min / Math.max(report.selfSpread.max, report.delta, .01) / 1.1)}%`, width: `${Math.min(95, 100 * (report.selfSpread.max - report.selfSpread.min) / Math.max(report.selfSpread.max, report.delta, .01) / 1.1)}%` }} />
            <i style={{ left: `${Math.min(98, 100 * report.delta / Math.max(report.selfSpread.max, report.delta, .01) / 1.1)}%` }} />
          </div>
        </div> : null}
        <details className="bench-details">
        <summary>{workbench.method}</summary>
        <p className="drift__hint">{driftCopy.referenceNote}</p>
        <p className="drift__hint">
          {driftCopy.builtFrom}: {report.reference.documents} pieces, {report.reference.totalWords}{" "}
          words, {report.reference.markers} marker words.
        </p>

        {report.selfSpread ? (
          <p className="drift__spread">
            {driftCopy.spreadHeading}: {number(report.selfSpread.min)} to{" "}
            {number(report.selfSpread.max)}, median {number(report.selfSpread.median)}, across{" "}
            {report.selfSpread.pieces} of your own pieces. This draft is at{" "}
            {number(report.delta ?? 0)}.
          </p>
        ) : null}
        </details>

        <h2 className="drift__heading">{driftCopy.substitutionsHeading}</h2>
        {report.substitutions.length === 0 ? (
          <p className="drift__hint">{driftCopy.noSubstitutions}</p>
        ) : (
          <ul className="drift__list">
            {report.substitutions.map((row) => (
              <li key={row.id} className="drift__item">
                {driftCopy.substitutionRow(row)}
              </li>
            ))}
          </ul>
        )}
        <p className="drift__hint">{driftCopy.substitutionNote}</p>

        {report.metrics.length > 0 ? (
          <details className="bench-details">
            <summary>{driftCopy.metricsHeading}</summary>
            <h2 className="drift__heading">{driftCopy.metricsHeading}</h2>
            <div className="drift__scroll">
              <table className="drift__table">
                <thead>
                  <tr>
                    <th scope="col">{driftCopy.metricsHeading}</th>
                    <th scope="col">{driftCopy.profileColumn}</th>
                    <th scope="col">{driftCopy.draftColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{driftCopy.metricLabels[row.key]}</th>
                      <td>{number(row.profile)}</td>
                      <td>{number(row.draft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="drift__heading">{driftCopy.shapeHeading}</h2>
            <div className="drift__scroll">
              <table className="drift__table">
                <thead>
                  <tr>
                    <th scope="col">{driftCopy.shapeHeading}</th>
                    <th scope="col">{driftCopy.profileColumn}</th>
                    <th scope="col">{driftCopy.draftColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.shape.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.key}</th>
                      <td>{number(row.profile)}</td>
                      <td>{number(row.draft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="drift__hint">{driftCopy.splitterNote}</p>
          </details>
        ) : null}

        {report.status === "ok" ? (
          <>
            <h2 className="drift__heading">{driftCopy.pullsHeading}</h2>
            {report.pulls.length === 0 ? (
              <p className="drift__hint">{driftCopy.noPulls}</p>
            ) : (
              <ol className="drift__list">
                {report.pulls.map((pull) => (
                  <li key={pull.index} className="drift__item">
                    <span className="drift__sentence">{pull.text}</span>
                    <span className="drift__reasons">
                      {pull.reasons.map((reason) => driftCopy.reasonLabels[reason]).join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
