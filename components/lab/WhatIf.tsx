"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import {
  estimate,
  type EstimateTemplate,
  type Range,
} from "@/lib/lab/estimate";
import {
  Button,
  Field,
  NumberField,
  Metrics,
  ErrorMessage,
  useAction,
  jsonDownload,
  fmt,
  Bars,
} from "./shared";
const c = copy.estimate;
export default function WhatIf() {
  const [template, setTemplate] = useState<EstimateTemplate>("event"),
    [ranges, setRanges] = useState<Record<string, Range>>(c.defaults.event),
    [seed, setSeed] = useState(42),
    [result, setResult] = useState<ReturnType<typeof estimate> | null>(() =>
      estimate("event", c.defaults.event, 42),
    ),
    { act, error, setError } = useAction();
  return (
    <div className="lab-work">
      <div className="lab-fields">
        <Field label={c.model}>
          <select
            value={template}
            onChange={(e) => {
              const t = e.target.value as EstimateTemplate;
              setTemplate(t);
              setRanges(c.defaults[t]);
              setResult(null);
            }}
          >
            {(["event", "project", "runway"] as const).map((t, i) => (
              <option value={t} key={t}>
                {c.models[i]}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={c.seed}
          value={seed}
          onChange={(n) => {
            setSeed(n);
            setResult(null);
          }}
        />
      </div>
      <p className="lab-tag">{c.formula[template]}</p>
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
            {Object.entries(ranges).map(([key, r]) => (
              <tr key={key}>
                <th scope="row">{c.labels[key as keyof typeof c.labels]}</th>
                {(["min", "likely", "max"] as const).map((bound, i) => (
                  <td key={bound}>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${c.labels[key as keyof typeof c.labels]} ${c.columns[i + 1]}`}
                      value={Number.isFinite(r[bound]) ? r[bound] : ""}
                      onChange={(e) => {
                        setRanges({
                          ...ranges,
                          [key]: {
                            ...r,
                            [bound]:
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                          },
                        });
                        setResult(null);
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lab-actions">
        <Button
          primary
          onClick={() => act(() => setResult(estimate(template, ranges, seed)))}
        >
          {c.run}
        </Button>
        <Button
          onClick={() => {
            setError("");
            setRanges(c.defaults[template]);
            setResult(estimate(template, c.defaults[template], seed));
          }}
        >
          {common.example}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {result && (
        <>
          <Metrics
            items={c.metrics.map((l, i) => [
              l,
              `${template === "runway" ? "" : "€"}${fmt([result.p10, result.p50, result.p90][i])}`,
            ])}
          />
          <section className="lab-chart">
            <h3>{c.histogram}</h3>
            <div
              className="lab-histogram"
              role="img"
              aria-label={`${c.histogram}: ${fmt(result.p10)} – ${fmt(result.p90)}`}
            >
              {result.bins.map((bin, i) => (
                <span
                  key={i}
                  title={`${fmt(bin.from)}: ${bin.count}`}
                  style={{
                    height: `${(bin.count / Math.max(1, ...result.bins.map((b) => b.count))) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="lab-row lab-note">
              <span>{fmt(result.bins[0].from)}</span>
              <span>{fmt(result.bins.at(-1)!.from)}</span>
            </div>
          </section>
          <Bars
            title={c.sensitivity}
            items={result.sensitivity.map((s) => ({
              label: c.labels[s.key as keyof typeof c.labels],
              value: Math.abs(s.high - s.low),
            }))}
          />
          <p className="lab-note">{c.note}</p>
          <Button
            onClick={() =>
              jsonDownload("what-if-scenario.json", {
                format: "what-if-v1",
                template,
                ranges,
                seed,
                samples: 2000,
                result,
              })
            }
          >
            {common.export}
          </Button>
        </>
      )}
    </div>
  );
}
