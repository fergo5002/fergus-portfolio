"use client";
import { useState } from "react";
import { copy } from "@/content/lab/copy";
import { cases } from "@/content/lab/cases";
import {
  investigate,
  scoreCase,
  type InvestigationState,
} from "@/lib/lab/investigation";
import {
  Button,
  Field,
  NumberField,
  ErrorMessage,
  useAction,
  Metrics,
} from "./shared";
const c = copy.prove;
export default function ProveIt() {
  const [index, setIndex] = useState(0),
    [state, setState] = useState<InvestigationState>({ used: [], spent: 0 }),
    [choice, setChoice] = useState(0),
    [confidence, setConfidence] = useState(50),
    [done, setDone] = useState(false),
    { act, error, setError } = useAction(),
    scenario = cases[index],
    score = scoreCase(scenario, state, choice, confidence);
  function reset() {
    setState({ used: [], spent: 0 });
    setDone(false);
    setConfidence(50);
    setChoice(0);
    setError("");
  }
  return (
    <div className="lab-work">
      <Field label={c.case}>
        <select
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            reset();
          }}
        >
          {cases.map((x, i) => (
            <option key={x.id} value={i}>
              {i + 1}. {x.title}
            </option>
          ))}
        </select>
      </Field>
      <section className="lab-panel">
        <h2>{scenario.title}</h2>
        <p>{scenario.setup}</p>
        <span className="lab-tag">
          {c.budget}: {scenario.budget - state.spent} / {scenario.budget}
        </span>
      </section>
      <div className="lab-two">
        <Field label={c.hypothesis}>
          <select
            disabled={done}
            value={choice}
            onChange={(e) => setChoice(Number(e.target.value))}
          >
            {scenario.hypotheses.map((h, i) => (
              <option key={h} value={i}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={c.confidence}
          value={confidence}
          min={0}
          max={100}
          onChange={setConfidence}
        />
      </div>
      <section>
        <h3>{c.investigate}</h3>
        <div className="lab-work">
          {scenario.tests.map((t) => (
            <Button
              key={t.id}
              disabled={
                done ||
                state.used.includes(t.id) ||
                state.spent + t.cost > scenario.budget
              }
              onClick={() =>
                act(() => setState(investigate(scenario, state, t.id)))
              }
            >
              {state.used.includes(t.id) ? "✓ " : ""}
              {t.label} · {c.cost} {t.cost}
            </Button>
          ))}
        </div>
      </section>
      <ErrorMessage error={error} />
      <section className="lab-panel">
        <h3>{c.evidence}</h3>
        {state.used.length ? (
          <ul>
            {state.used.map((id) => {
              const t = scenario.tests.find((x) => x.id === id)!;
              return (
                <li key={id}>
                  <strong>{t.label}</strong>
                  <p>{t.outcomes[scenario.answer]}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{c.empty}</p>
        )}
      </section>
      <Button
        primary
        disabled={done}
        onClick={() =>
          act(() => {
            if (
              !Number.isFinite(confidence) ||
              confidence < 0 ||
              confidence > 100
            )
              throw new Error("Confidence must be between 0 and 100.");
            setDone(true);
          })
        }
      >
        {c.commit}
      </Button>
      {done && (
        <section className="lab-panel">
          <h2>{score.correct ? c.correct : c.incorrect}</h2>
          <Metrics items={[[c.score, `${score.score} / 100`]]} />
          <h3>{c.answer}</h3>
          <p>{scenario.hypotheses[scenario.answer]}</p>
          <p>{scenario.lesson}</p>
          <Button onClick={reset}>{c.again}</Button>
        </section>
      )}
    </div>
  );
}
