"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import { simulateService, type ServiceConfig } from "@/lib/lab/service";
import {
  Button,
  Field,
  NumberField,
  Metrics,
  LineChart,
  ErrorMessage,
  useAction,
  download,
  csvCell,
  fmt,
} from "./shared";
const c = copy.bottleneck,
  initial: ServiceConfig = {
    arrivalsPerHour: 24,
    duration: 180,
    servers: 2,
    service: 8,
    turnover: 2,
    capacity: 6,
    mode: "queue",
    seed: 42,
  };
export default function Bottleneck() {
  const [config, setConfig] = useState(initial),
    [result, setResult] = useState<ReturnType<typeof simulateService> | null>(
      () => simulateService(initial),
    ),
    [baseline, setBaseline] = useState<ReturnType<
      typeof simulateService
    > | null>(null),
    { act, error, setError } = useAction();
  const keys = [
    "arrivalsPerHour",
    "duration",
    "servers",
    "service",
    "turnover",
    "capacity",
    "seed",
  ] as const;
  function update(next: ServiceConfig) {
    setConfig(next);
    setResult(null);
  }
  return (
    <div className="lab-work">
      <div className="lab-fields">
        <Field label={c.mode}>
          <select
            value={config.mode}
            onChange={(e) =>
              update({
                ...config,
                mode: e.target.value as ServiceConfig["mode"],
              })
            }
          >
            {["queue", "session"].map((v, i) => (
              <option value={v} key={v}>
                {c.modes[i]}
              </option>
            ))}
          </select>
        </Field>
        {keys.map((key, i) => (
          <NumberField
            key={key}
            label={c.fields[i]}
            value={config[key]}
            onChange={(value) => update({ ...config, [key]: value })}
            min={key === "turnover" ? 0 : 1}
          />
        ))}
      </div>
      <div className="lab-actions">
        <Button
          primary
          onClick={() => act(() => setResult(simulateService(config)))}
        >
          {c.run}
        </Button>
        <Button
          onClick={() => {
            setError("");
            setConfig(initial);
            setResult(simulateService(initial));
            setBaseline(null);
          }}
        >
          {common.example}
        </Button>
        <Button disabled={!result} onClick={() => setBaseline(result)}>
          {c.pin}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {result && (
        <>
          <Metrics
            items={[
              [c.metrics[0], `${fmt(result.averageWait)} min`],
              [c.metrics[1], result.completed],
              [c.metrics[2], result.unserved],
              [c.metrics[3], `${fmt(result.p90)} min`],
            ]}
          />
          <LineChart
            title={c.chart}
            values={result.timeline.map((t) => t.queue)}
            baseline={baseline?.timeline.map((t) => t.queue)}
            axis={`${c.axis} (0–${Math.max(config.duration, baseline?.timeline.at(-1)?.minute ?? 0)})`}
          />
          {baseline && <p className="lab-note">{c.baselineNote}</p>}
          <div className="lab-actions">
            <Button
              onClick={() =>
                download(
                  "bottleneck-people.csv",
                  [
                    c.columns.map(csvCell).join(","),
                    ...result.people.map((p) =>
                      [
                        p.id + 1,
                        p.arrival.toFixed(2),
                        p.start?.toFixed(2) ?? "",
                        p.end?.toFixed(2) ?? "",
                      ]
                        .map(csvCell)
                        .join(","),
                    ),
                  ].join("\n"),
                  "text/csv",
                )
              }
            >
              {c.csv}
            </Button>
          </div>
          <details>
            <summary>{c.people}</summary>
            <div className="lab-table-wrap">
              <table>
                <thead>
                  <tr>
                    {c.columns.map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.people.slice(0, 80).map((p) => (
                    <tr key={p.id}>
                      <td>{p.id + 1}</td>
                      <td>{fmt(p.arrival)}</td>
                      <td>{p.start === null ? c.notServed : fmt(p.start)}</td>
                      <td>{p.end === null ? "Not applicable" : fmt(p.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
