"use client";

import { useEffect, useId, useState } from "react";
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

  const [samples, setSamples] = useState("");
  // Annotated, because `driftDemo` is `as const` and an unannotated `useState`
  // would infer the demo draft's literal type and then refuse every other
  // string the visitor types.
  const [draft, setDraft] = useState<string>(driftDemo.draft);
  const [reference, setReference] = useState<Reference>(demoReference);
  const [profile, setProfile] = useState<VoiceProfile>(demoProfile);
  const [spread, setSpread] = useState<SelfSpread | null>(demoSpread);
  const [report, setReport] = useState<DriftReport>(demoReport);
  const [mine, setMine] = useState(false);
  const [note, setNote] = useState<string>(driftCopy.demoNote);
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
      setSavedAt(stored.savedAt);
      setMine(true);
      setNote(driftCopy.savedNote);
    } catch {
      // Storage blocked. Nothing to restore, and nothing to say about it.
    }
  }, []);

  function onBuild() {
    const pieces = splitPieces(samples);
    if (pieces.length === 0) {
      setNote(driftCopy.noSamples);
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
    setReport(analyse(made, draft, built, range));
    setMine(true);
    setSavedAt(null);
    setNote(made.words < MIN_PROFILE_WORDS ? driftCopy.thinProfile : driftCopy.neverSaved);
  }

  function onMeasure() {
    const started = Date.now();
    const next = analyse(profile, draft, reference, spread);
    setReport(next);
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
      setSavedAt(now);
      setNote(driftCopy.savedNote);
    } catch {
      setNote(driftCopy.neverSaved);
    }
  }

  function onDrop() {
    if (!removeSavedProfile(window.localStorage)) {
      setNote(driftCopy.dropFailed);
      return;
    }
    setSavedAt(null);
    setNote(driftCopy.droppedNote);
  }

  function onDemo() {
    setReference(demoReference);
    setProfile(demoProfile);
    setSpread(demoSpread);
    setReport(demoReport);
    setDraft(driftDemo.draft);
    setMine(false);
    setNote(driftCopy.demoNote);
  }

  const samplesId = `${uid}-samples`;
  const draftId = `${uid}-draft`;
  const number = (value: number) => value.toFixed(2);

  return (
    <div className="drift">
      <p className="drift__note" role="status">
        {note}
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
            value={samples}
            placeholder={driftCopy.samplesPlaceholder}
            onChange={(e) => setSamples(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="drift__actions">
            <button type="button" className="drift__button" onClick={onBuild}>
              {driftCopy.build}
            </button>
            <button type="button" className="drift__button" onClick={onSave} disabled={!mine}>
              {driftCopy.save}
            </button>
            <button type="button" className="drift__button" onClick={onDrop} disabled={savedAt === null}>
              {driftCopy.drop}
            </button>
          </div>
          <p className="drift__hint">{driftCopy.savedContents}</p>
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
            value={draft}
            placeholder={driftCopy.draftPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="drift__actions">
            <button type="button" className="drift__button" onClick={onMeasure}>
              {driftCopy.measure}
            </button>
            <button type="button" className="drift__button" onClick={onDemo}>
              {driftCopy.useDemo}
            </button>
          </div>
        </div>
      </div>

      <section className="drift__report" aria-live="polite">
        <h2 className="drift__heading">{driftCopy.deltaHeading}</h2>
        {report.status === "ok" ? (
          <p className="drift__delta">{number(report.delta ?? 0)}</p>
        ) : (
          <p className="drift__refusal">
            {report.status === "too-short" ? driftCopy.tooShort : driftCopy.tooFewPieces}
          </p>
        )}
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

        <h2 className="drift__heading">{driftCopy.substitutionsHeading}</h2>
        {report.substitutions.length === 0 ? (
          <p className="drift__hint">{driftCopy.noSubstitutions}</p>
        ) : (
          <ul className="drift__list">
            {report.substitutions.map((row) => (
              <li key={row.id} className="drift__item">
                You have never written &quot;{row.formal}&quot;. You write &quot;{row.plain}&quot;,{" "}
                {row.profilePlain} times. This draft uses &quot;{row.formal}&quot; {row.draftCount}{" "}
                times.
              </li>
            ))}
          </ul>
        )}
        <p className="drift__hint">{driftCopy.substitutionNote}</p>

        {report.metrics.length > 0 ? (
          <>
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
          </>
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
