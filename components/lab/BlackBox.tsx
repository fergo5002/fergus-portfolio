"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import { parseTrace, traceSummary, type TraceEvent } from "@/lib/lab/trace";
import {
  Button,
  Field,
  FileInput,
  Metrics,
  ErrorMessage,
  useAction,
  readText,
  download,
  jsonDownload,
  dateTime,
} from "./shared";
const c = copy.trace,
  example = c.example.map((e) => JSON.stringify(e)).join("\n");
export default function BlackBox() {
  const [raw, setRaw] = useState(example),
    [events, setEvents] = useState<TraceEvent[]>(() => parseTrace(example)),
    [filter, setFilter] = useState(0),
    [links, setLinks] = useState<Record<number, string>>({}),
    [note, setNote] = useState(""),
    { act, error, setError } = useAction();
  function inspect(text: string) {
    const parsed = parseTrace(text);
    setEvents(parsed);
    setLinks({});
    setRaw(text);
  }
  const s = traceSummary(events),
    seen = new Set<string>();
  const visible = events
    .map((e, i) => {
      const key = JSON.stringify([e.name, e.input]),
        repeated = e.type === "tool" && seen.has(key);
      if (e.type === "tool") seen.add(key);
      return { e, i, repeated };
    })
    .filter(
      ({ e, repeated }) =>
        filter === 0 ||
        (filter === 1 && e.status === "error") ||
        (filter === 2 && e.type === "claim") ||
        (filter === 3 && repeated),
    );
  return (
    <div className="lab-work">
      <details>
        <summary>{c.schema}</summary>
        <p className="lab-note">{c.schemaText}</p>
        <Button
          onClick={() =>
            download("black-box-example.jsonl", example, "application/x-ndjson")
          }
        >
          {c.download}
        </Button>
      </details>
      <Field label={c.label}>
        <textarea
          spellCheck={false}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </Field>
      <FileInput
        label={common.import}
        accept=".json,.jsonl,.ndjson"
        onFile={(f) => act(async () => inspect(await readText(f)))}
      />
      <div className="lab-actions">
        <Button primary onClick={() => act(() => inspect(raw))}>
          {c.analyse}
        </Button>
        <Button onClick={() => act(() => inspect(example))}>
          {common.example}
        </Button>
      </div>
      <ErrorMessage error={error} />
      <Metrics
        items={c.metrics.map((l, i) => [
          l,
          [s.toolCalls, s.failures, s.repeated, s.claims][i],
        ])}
      />
      <Field label={c.filter}>
        <select
          value={filter}
          onChange={(e) => setFilter(Number(e.target.value))}
        >
          {c.filters.map((x, i) => (
            <option value={i} key={x}>
              {x}
            </option>
          ))}
        </select>
      </Field>
      <h2>{c.timeline}</h2>
      <div className="lab-work">
        {visible.map(({ e, i, repeated }) => (
          <article
            className="lab-event"
            data-error={e.status === "error"}
            key={i}
          >
            <div className="lab-row">
              <time>{dateTime(Date.parse(e.at))}</time>
              <span className="lab-tag">
                #{i + 1} · {e.type} {e.status ?? ""} {repeated ? "↻" : ""}
              </span>
            </div>
            <p>{e.name ?? e.text}</p>
            {e.input && <pre>{e.input}</pre>}
            {e.durationMs !== undefined && (
              <p className="lab-note">{e.durationMs} ms</p>
            )}
            {e.type === "claim" && (
              <Field label={c.link}>
                <select
                  value={links[i] ?? ""}
                  onChange={(e) => setLinks({ ...links, [i]: e.target.value })}
                >
                  <option value="">{c.unlinked}</option>
                  {events.map((candidate, j) =>
                    candidate.type === "tool" ? (
                      <option key={j} value={j}>
                        #{j + 1} · {candidate.name}: {candidate.input}
                      </option>
                    ) : null,
                  )}
                </select>
              </Field>
            )}
          </article>
        ))}
      </div>
      <Field label={c.note}>
        <textarea
          value={note}
          placeholder={c.noteHint}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button
        onClick={() =>
          jsonDownload("black-box-review.json", {
            format: "black-box-review-v1",
            summary: s,
            events,
            evidenceLinks: links,
            note,
          })
        }
      >
        {c.export}
      </Button>
    </div>
  );
}
