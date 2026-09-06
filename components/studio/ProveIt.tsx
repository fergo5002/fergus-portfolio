"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.ProveIt;
import { useState } from "react";
import {
  studioCases as cases,
  detectiveCopy as c,
} from "@/content/studio/cases";
import { investigate, type InvestigationState } from "@/lib/lab/investigation";
import {
  survivingHypotheses,
  dailyCase,
  calibration,
} from "@/lib/studio/detective";
import { Button, Field, Metrics, jsonDownload } from "@/components/lab/shared";
import { StudioIntro, Range } from "./Furniture";
type Belief = {
  test: string;
  choice: number;
  confidence: number;
  prediction: string;
};
export default function ProveIt() {
  const [index, setIndex] = useState(0),
    [state, setState] = useState<InvestigationState>({ used: [], spent: 0 }),
    [choice, setChoice] = useState(0),
    [confidence, setConfidence] = useState(50),
    [done, setDone] = useState(false),
    [history, setHistory] = useState<Belief[]>([]),
    [prediction, setPrediction] = useState(""),
    [completed, setCompleted] = useState<Record<string, number>>({}),
    [library, setLibrary] = useState(false);
  const scenario = cases[index],
    remaining = scenario.budget - state.spent,
    correct = choice === scenario.answer,
    survivors = survivingHypotheses(scenario, state.used),
    decisive = survivors.length === 1,
    score = Math.round(
      (correct ? 35 : 0) +
        (decisive ? 40 : 0) +
        calibration(correct, confidence) * 0.1 +
        (correct && decisive ? (remaining / scenario.budget) * 15 : 0),
    );
  function open(n: number) {
    setIndex(n);
    setState({ used: [], spent: 0 });
    setChoice(0);
    setConfidence(50);
    setDone(false);
    setHistory([]);
    setPrediction("");
    setLibrary(false);
  }
  const day = new Date().toLocaleDateString("en-CA"),
    daily = dailyCase(day, cases.length);
  return (
    <div className="lab-work studio studio-detective">
      <StudioIntro eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div className="studio-toolbar">
        <Button onClick={() => setLibrary(!library)}>
          {c.library} · {Object.keys(completed).length}/{cases.length}
        </Button>
        <Button onClick={() => open(daily)}>{c.daily}</Button>
        <Field label={ui.chooseCase}>
          <select value={index} onChange={(e) => open(Number(e.target.value))}>
            {cases.map((s, i) => (
              <option key={s.id} value={i}>
                {String(i + 1).padStart(2, "0")} · {s.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {library && (
        <div className="detective-library">
          {cases.map((s, i) => (
            <button key={s.id} onClick={() => open(i)}>
              <span className="studio-eyebrow">
                {ui.case}
                {String(i + 1).padStart(2, "0")}
                {daily === i ? " / TODAY" : ""}
              </span>
              <strong>{s.title}</strong>
              <span>
                {completed[s.id] !== undefined
                  ? `${completed[s.id]} points · reviewed`
                  : `${s.budget} credits · unsolved`}
              </span>
            </button>
          ))}
        </div>
      )}
      <section className="detective-brief">
        <div>
          <p className="studio-eyebrow">
            {ui.caseFile}
            {String(index + 1).padStart(3, "0")} / {done ? "CLOSED" : "OPEN"}
          </p>
          <h3>{scenario.title}</h3>
          <p>{scenario.setup}</p>
        </div>
        <div className="detective-budget">
          <strong>{remaining}</strong>
          <span>
            {ui.of}
            {scenario.budget}
            {ui.creditsLeft}
          </span>
          <div>
            {Array.from({ length: scenario.budget }, (_, i) => (
              <i key={i} data-spent={i >= remaining} />
            ))}
          </div>
        </div>
      </section>
      <section>
        <div className="studio-section-head">
          <h3>{c.hypotheses}</h3>
          <span>{ui.selectYourWorkingExplanation}</span>
        </div>
        <div className="detective-hypotheses">
          {scenario.hypotheses.map((h, i) => (
            <button
              key={h}
              disabled={done}
              aria-pressed={choice === i}
              data-answer={done && i === scenario.answer}
              onClick={() => setChoice(i)}
            >
              <span>{String.fromCharCode(65 + i)}</span>
              <strong>{h}</strong>
              {done && (
                <small>
                  {i === scenario.answer
                    ? "The explanation"
                    : survivors.includes(i)
                      ? "Not excluded by your evidence"
                      : "Excluded by your evidence"}
                </small>
              )}
            </button>
          ))}
        </div>
        <Range
          label={c.confidence}
          disabled={done}
          min={0}
          max={100}
          value={confidence}
          display={`${confidence}%`}
          onChange={(v) => {
            if (!done) setConfidence(v);
          }}
        />
      </section>
      <div className="detective-workspace">
        <section className="studio-panel">
          <p className="studio-eyebrow">{ui.investigateObserve}</p>
          <h3>{c.tests}</h3>
          {!done && (
            <Field label={c.prediction}>
              <textarea
                rows={2}
                maxLength={600}
                value={prediction}
                placeholder={c.predictionPlaceholder}
                onChange={(e) => setPrediction(e.target.value)}
              />
            </Field>
          )}
          <div className="detective-tests">
            {scenario.tests.map((t) => {
              const used = state.used.includes(t.id);
              return (
                <button
                  key={t.id}
                  disabled={done || used || t.cost > remaining}
                  onClick={() => {
                    setHistory((h) => [
                      ...h,
                      { test: t.id, choice, confidence, prediction },
                    ]);
                    setState(investigate(scenario, state, t.id));
                    setPrediction("");
                  }}
                >
                  <span>{used ? "✓" : String(t.cost).padStart(2, "0")}</span>
                  <strong>{t.label}</strong>
                  <small>{used ? "In notebook" : `${t.cost} ${c.cost}`}</small>
                </button>
              );
            })}
          </div>
        </section>
        <section className="studio-panel detective-notebook" aria-live="polite">
          <p className="studio-eyebrow">
            {ui.observations}
            {state.used.length}
          </p>
          <h3>{c.notebook}</h3>
          {!state.used.length ? (
            <p className="studio-empty">{c.empty}</p>
          ) : (
            state.used.map((id, i) => {
              const t = scenario.tests.find((t) => t.id === id)!,
                belief = history[i];
              return (
                <article className="detective-evidence" key={id}>
                  <span className="studio-eyebrow">
                    {ui.evidence}
                    {String(i + 1).padStart(2, "0")} / {t.cost}
                    {ui.credits}
                  </span>
                  <h4>{t.label}</h4>
                  <blockquote>{t.outcomes[scenario.answer]}</blockquote>
                  {belief.prediction && (
                    <p className="studio-note">
                      {ui.yourPrediction}
                      {belief.prediction}
                    </p>
                  )}
                  <small>
                    {ui.beforeThisTestExplanation}{" "}
                    {String.fromCharCode(65 + belief.choice)},{" "}
                    {belief.confidence}
                    {ui.confidence}
                  </small>
                </article>
              );
            })
          )}
        </section>
      </div>
      {!done && (
        <div className="detective-commit">
          <p>{ui.youCanCommitAtAnyTimeA}</p>
          <Button
            primary
            onClick={() => {
              setDone(true);
              setCompleted((p) => ({ ...p, [scenario.id]: score }));
            }}
          >
            {c.commit}
          </Button>
        </div>
      )}
      {done && (
        <section className="detective-debrief" role="status">
          <p className="studio-eyebrow">{c.debrief}</p>
          <h3>
            {correct
              ? decisive
                ? "You found it. And you can show why."
                : "Right answer. The evidence is still thin."
              : "A useful wrong turn."}
          </h3>
          <Metrics
            items={[
              ["Case score", `${score}/100`],
              [
                "Evidence",
                decisive
                  ? "Distinguishing"
                  : `${survivors.length} explanations remain`,
              ],
              ["Confidence score", `${calibration(correct, confidence)}/100`],
            ]}
          />
          <p>
            <strong>{scenario.hypotheses[scenario.answer]}</strong>
          </p>
          <p>{scenario.lesson}</p>
          <div className="detective-comparison">
            <h4>{ui.whatEachExplanationPredicted}</h4>
            <div className="studio-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ui.investigation}</th>
                    {scenario.hypotheses.map((_, i) => (
                      <th key={i}>
                        {ui.explanation}
                        {String.fromCharCode(65 + i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scenario.tests.map((t) => (
                    <tr key={t.id}>
                      <th>{t.label}</th>
                      {t.outcomes.map((o, i) => (
                        <td key={i} data-answer={i === scenario.answer}>
                          {o}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <h4>{c.history}</h4>
          <ol className="detective-history">
            {history.map((b, i) => (
              <li key={i}>
                {ui.beforeTest}
                {i + 1}: {String.fromCharCode(65 + b.choice)}
                {ui.at} {b.confidence}%
              </li>
            ))}
            <li>
              {ui.final}
              {String.fromCharCode(65 + choice)}
              {ui.at2}
              {confidence}%
            </li>
          </ol>
          <p className="studio-note">{ui.scoring35ForTheConclusion40For}</p>
          <div className="studio-toolbar">
            <Button onClick={() => open(index)}>{c.again}</Button>
            <Button
              primary
              onClick={() => {
                const next = cases.findIndex(
                  (s, i) => i !== index && completed[s.id] === undefined,
                );
                open(next >= 0 ? next : (index + 1) % cases.length);
              }}
            >
              {c.next}
            </Button>
            <Button
              onClick={() =>
                jsonDownload(`prove-it-${scenario.id}.json`, {
                  format: "prove-it-v2",
                  case: scenario.title,
                  history,
                  conclusion: scenario.hypotheses[choice],
                  confidence,
                  score,
                  lesson: scenario.lesson,
                })
              }
            >
              {c.download}
            </Button>
          </div>
        </section>
      )}
      <p className="studio-note">{c.limits}</p>
    </div>
  );
}
