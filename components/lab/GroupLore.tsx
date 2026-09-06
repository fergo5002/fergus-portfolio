"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import { parseChat, analyseChat } from "@/lib/lab/chat";
import {
  Button,
  Field,
  FileInput,
  Metrics,
  ErrorMessage,
  useAction,
  readText,
  Bars,
  download,
  jsonDownload,
  xml,
} from "./shared";
const c = copy.chat;
export default function GroupLore() {
  const [raw, setRaw] = useState(c.sample),
    [stats, setStats] = useState(() => analyseChat(parseChat(c.sample))),
    [pseudo, setPseudo] = useState(true),
    { act, error, setError } = useAction();
  function load(text: string) {
    const result = analyseChat(parseChat(text));
    setRaw(text);
    setStats(result);
  }
  const people = stats.participants.map((p, i) => ({
    ...p,
    name: pseudo ? `Person ${i + 1}` : p.name,
  }));
  function portrait() {
    const max = Math.max(...stats.hours, 1),
      bars = stats.hours
        .map(
          (value, i) =>
            `<rect x="${50 + i * 28}" y="${400 - (value / max) * 190}" width="20" height="${(value / max) * 190}" fill="#33ff66"/><text x="${50 + i * 28}" y="423" fill="#b5d0bd" font-size="10">${i}</text>`,
        )
        .join("");
    download(
      "group-lore-portrait.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="650" viewBox="0 0 800 650"><rect width="800" height="650" fill="#0a0e0a"/><g font-family="monospace"><text x="50" y="65" fill="#ffb000" font-size="16">FERGUSOS / GROUP LORE</text><text x="50" y="125" fill="#e4ffe9" font-size="35">${stats.count} messages. ${people.length} voices.</text><text x="50" y="165" fill="#b5d0bd" font-size="16">Hours in the supplied export · browser local time</text>${bars}${people
        .slice(0, 6)
        .map(
          (p, i) =>
            `<text x="50" y="${470 + i * 23}" fill="#b5d0bd" font-size="14">${xml(p.name)} · ${p.count} messages</text>`,
        )
        .join(
          "",
        )}<text x="50" y="625" fill="#ffb000" font-size="12">An activity portrait, not a measure of friendship.</text></g></svg>`,
      "image/svg+xml",
    );
  }
  return (
    <div className="lab-work">
      <FileInput
        label={c.label}
        accept=".txt"
        onFile={(f) => act(async () => load(await readText(f, 10_000_000)))}
      />
      <details>
        <summary>{common.input}</summary>
        <Field label={c.label}>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} />
        </Field>
      </details>
      <div className="lab-actions">
        <Button primary onClick={() => act(() => load(raw))}>
          {c.analyse}
        </Button>
        <Button onClick={() => act(() => load(c.sample))}>
          {common.example}
        </Button>
      </div>
      <ErrorMessage error={error} />
      <Metrics
        items={[
          [c.metrics[0], stats.count],
          [c.metrics[1], stats.participants.length],
          [c.metrics[2], `${stats.hours.indexOf(Math.max(...stats.hours))}:00`],
        ]}
      />
      <label className="lab-check">
        <input
          type="checkbox"
          checked={pseudo}
          onChange={(e) => setPseudo(e.target.checked)}
        />
        {c.pseudo}
      </label>
      <div className="lab-two">
        <Bars
          title={c.people}
          items={people.map((p) => ({ label: p.name, value: p.count }))}
        />
        <Bars
          title={c.months}
          items={stats.months.map((m) => ({ label: m.month, value: m.count }))}
        />
      </div>
      <Bars
        title={c.hours}
        items={stats.hours.map((value, i) => ({
          label: `${String(i).padStart(2, "0")}:00`,
          value,
        }))}
      />
      <section className="lab-panel">
        <h3>{c.phrases}</h3>
        {stats.phrases.length ? (
          <div className="lab-actions">
            {stats.phrases.map((p) => (
              <span className="lab-tag" key={p.phrase}>
                {p.phrase} × {p.count}
              </span>
            ))}
          </div>
        ) : (
          <p>{c.empty}</p>
        )}
      </section>
      <div className="lab-actions">
        <Button primary onClick={portrait}>
          {c.portrait}
        </Button>
        <Button
          onClick={() =>
            jsonDownload("group-lore-aggregate.json", {
              format: "group-lore-v1",
              ...stats,
              participants: people,
            })
          }
        >
          {c.summary}
        </Button>
      </div>
    </div>
  );
}
