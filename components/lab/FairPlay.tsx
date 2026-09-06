"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import { scheduleDoubles, type Player, type Round } from "@/lib/lab/schedule";
import {
  Button,
  Field,
  NumberField,
  ErrorMessage,
  useAction,
  Bars,
  download,
  csvCell,
} from "./shared";
const c = copy.fair;
function roster(text: string): Player[] {
  const players = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, level = "3"] = line.split(",").map((s) => s.trim()),
        skill = Number(level);
      if (!name || skill < 1 || skill > 5 || !Number.isFinite(skill))
        throw new Error(
          "Each player needs a name and a skill between 1 and 5.",
        );
      return { id: name.toLowerCase(), name, skill };
    });
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("Give each player a unique name.");
  return players;
}
export default function FairPlay() {
  const [text, setText] = useState(c.sample),
    [courts, setCourts] = useState(3),
    [total, setTotal] = useState(6),
    [played, setPlayed] = useState(0),
    [seed, setSeed] = useState(42),
    [rounds, setRounds] = useState<Round[]>(() =>
      scheduleDoubles(roster(c.sample), 3, 6, [], 42),
    ),
    [names, setNames] = useState<Record<string, string>>(
      Object.fromEntries(roster(c.sample).map((p) => [p.id, p.name])),
    ),
    { act, error, setError } = useAction();
  const counts = new Map<string, number>();
  rounds.forEach((r) =>
    r.matches.forEach((m) =>
      [...m.a, ...m.b].forEach((id) =>
        counts.set(id, (counts.get(id) ?? 0) + 1),
      ),
    ),
  );
  function draw() {
    const players = roster(text);
    if (
      !Number.isInteger(played) ||
      played < 0 ||
      played > rounds.length ||
      played > total
    )
      throw new Error(
        "Completed rounds must fit within the existing and proposed draw.",
      );
    setRounds(
      scheduleDoubles(players, courts, total, rounds.slice(0, played), seed),
    );
    setNames({
      ...names,
      ...Object.fromEntries(players.map((p) => [p.id, p.name])),
    });
  }
  return (
    <div className="lab-work">
      <div className="lab-two">
        <Field label={c.roster}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="lab-fields">
          <NumberField
            label={c.courts}
            value={courts}
            min={1}
            max={10}
            onChange={setCourts}
          />
          <NumberField
            label={c.rounds}
            value={total}
            min={1}
            max={20}
            onChange={setTotal}
          />
          <NumberField
            label={c.played}
            value={played}
            min={0}
            max={rounds.length}
            onChange={setPlayed}
          />
          <NumberField label={c.seed} value={seed} onChange={setSeed} />
        </div>
      </div>
      <p className="lab-note">{c.note}</p>
      <div className="lab-actions">
        <Button primary onClick={() => act(draw)}>
          {c.generate}
        </Button>
        <Button
          onClick={() => {
            setError("");
            setText(c.sample);
            setPlayed(0);
            setCourts(3);
            setTotal(6);
            setRounds(scheduleDoubles(roster(c.sample), 3, 6, [], 42));
          }}
        >
          {common.example}
        </Button>
        <Button onClick={() => window.print()}>{common.print}</Button>
        <Button
          onClick={() =>
            download(
              "fair-play-draw.csv",
              [
                "Round,Court,Team A,Team B,Rest",
                ...rounds.flatMap((r, i) =>
                  r.matches.map((m, j) =>
                    [
                      i + 1,
                      j + 1,
                      m.a.map((id) => names[id] ?? id).join(" + "),
                      m.b.map((id) => names[id] ?? id).join(" + "),
                      r.rest.map((id) => names[id] ?? id).join("; "),
                    ]
                      .map(csvCell)
                      .join(","),
                  ),
                ),
              ].join("\n"),
              "text/csv",
            )
          }
        >
          {c.csv}
        </Button>
      </div>
      <ErrorMessage error={error} />
      <Bars
        title={c.balance}
        items={[...counts].map(([id, value]) => ({
          label: names[id] ?? id,
          value,
        }))}
      />
      <div className="lab-two">
        {rounds.map((r, i) => (
          <section className="lab-panel" key={i}>
            <h2>
              {c.round} {i + 1} {i < played ? "✓" : ""}
            </h2>
            <ul className="lab-list">
              {r.matches.map((m, j) => (
                <li key={j}>
                  <span className="lab-tag">
                    {c.court} {j + 1}
                  </span>
                  <p>
                    {m.a.map((id) => names[id] ?? id).join(" + ")}
                    <br />
                    vs
                    <br />
                    {m.b.map((id) => names[id] ?? id).join(" + ")}
                  </p>
                </li>
              ))}
            </ul>
            <p className="lab-note">
              {c.rest}:{" "}
              {r.rest.map((id) => names[id] ?? id).join(", ") ||
                "Not applicable"}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
