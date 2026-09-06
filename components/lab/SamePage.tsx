"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import {
  compareAnswers,
  parseAnswerFile,
  type Answers,
} from "@/lib/lab/alignment";
import {
  Button,
  Field,
  FileInput,
  ErrorMessage,
  useAction,
  readText,
  jsonDownload,
} from "./shared";
const c = copy.alignment;
export default function SamePage() {
  const [name, setName] = useState(""),
    [answers, setAnswers] = useState<Answers>(
      Object.fromEntries(c.questions.map((q) => [q.key, q.numeric ? 3 : ""])),
    ),
    [partner, setPartner] = useState<ReturnType<typeof parseAnswerFile> | null>(
      null,
    ),
    [revealed, setRevealed] = useState(false),
    [notes, setNotes] = useState<Record<string, string>>({}),
    { act, error, setError } = useAction();
  const differences = partner ? compareAnswers(answers, partner.answers) : [];
  return (
    <div className="lab-work">
      <p>{c.intro}</p>
      <Field label={c.person}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="lab-two">
        {c.questions.map((q) => (
          <Field key={q.key} label={q.label}>
            {q.numeric ? (
              <select
                value={answers[q.key]}
                onChange={(e) => {
                  setAnswers({ ...answers, [q.key]: Number(e.target.value) });
                  setRevealed(false);
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            ) : (
              <input
                value={answers[q.key]}
                onChange={(e) => {
                  setAnswers({ ...answers, [q.key]: e.target.value });
                  setRevealed(false);
                }}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="lab-actions">
        <Button
          primary
          onClick={() =>
            act(() => {
              if (
                !name.trim() ||
                c.questions.some((q) => answers[q.key] === "")
              )
                throw new Error(
                  "Add a name and answer every question before exporting.",
                );
              jsonDownload("same-page-answers.json", {
                format: "same-page-v1",
                name,
                answers,
              });
            })
          }
        >
          {c.export}
        </Button>
        <Button
          onClick={() => {
            setError("");
            setName("Fergus (example)");
            setAnswers(c.sampleA);
            setPartner({
              format: "same-page-v1",
              name: "Partner (example)",
              answers: c.sampleB,
            });
            setRevealed(false);
          }}
        >
          {common.example}
        </Button>
      </div>
      <FileInput
        label={c.partner}
        accept=".json"
        onFile={(file) =>
          act(async () => {
            const result = parseAnswerFile(await readText(file));
            if (c.questions.some((q) => !(q.key in result.answers)))
              throw new Error(
                "This file is missing questions from the current worksheet.",
              );
            setPartner(result);
            setRevealed(false);
          })
        }
      />
      <ErrorMessage error={error} />
      {partner && (
        <div className="lab-panel">
          <p>
            {c.them}: {partner.name}
          </p>
          <Button primary onClick={() => setRevealed(true)}>
            {c.compare}
          </Button>
        </div>
      )}
      {revealed && partner && (
        <section>
          <h2>{c.agenda}</h2>
          {!differences.length && <p>{c.same}</p>}
          <div className="lab-work">
            {differences.map((d) => (
              <article className="lab-panel" key={d.key}>
                <h3>
                  {c.questions.find((q) => q.key === d.key)?.label ?? d.key}
                </h3>
                <div className="lab-two">
                  <p>
                    {name || c.you}: <strong>{d.a}</strong>
                  </p>
                  <p>
                    {partner.name}: <strong>{d.b}</strong>
                  </p>
                </div>
                <Field label={c.note}>
                  <input
                    value={notes[d.key] ?? ""}
                    onChange={(e) =>
                      setNotes({ ...notes, [d.key]: e.target.value })
                    }
                  />
                </Field>
              </article>
            ))}
          </div>
          <div className="lab-actions">
            <Button
              onClick={() =>
                jsonDownload("same-page-discussion.json", {
                  format: "same-page-discussion-v1",
                  people: [{ name, answers }, partner],
                  differences,
                  notes,
                })
              }
            >
              {c.save}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
