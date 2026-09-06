"use client";
import { useState } from "react";
import { copy } from "@/content/lab/copy";
import { common } from "@/content/lab/copy";
import {
  analyseFiles,
  compareSnapshots,
  parseSnapshot,
  safePath,
  type Snapshot,
} from "@/lib/lab/atlas";
import {
  Button,
  Field,
  FileInput,
  Metrics,
  ErrorMessage,
  useAction,
  jsonDownload,
  fmt,
} from "./shared";
const c = copy.atlas;
function example() {
  return analyseFiles(
    c.sample.map((f) => ({
      path: f.path,
      text: Array.from(
        { length: f.lines },
        (_, i) => `// Example source line ${i + 1}`,
      ).join("\n"),
    })),
  );
}
async function readArchive(file: File): Promise<Snapshot> {
  if (file.size > 10_000_000)
    throw new Error("Archive limit: 10 MB compressed.");
  if (file.name.toLowerCase().endsWith(".json"))
    return parseSnapshot(await file.text());
  const { unzipSync, strFromU8 } = await import("fflate");
  let expanded = 0,
    entries = 0;
  const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      safePath(entry.name);
      expanded += entry.originalSize;
      if (++entries > 1000 || expanded > 30_000_000)
        throw new Error("Archive exceeds 1,000 entries or 30 MB expanded.");
      return /\.(?:[cm]?[jt]sx?|py|rs|go|java|rb|php|css|scss|html|md|json|yaml|yml|sql|sh|c|cpp|h|vue|svelte|toml)$/i.test(
        entry.name,
      );
    },
  });
  const files = Object.entries(unzipped).map(([path, bytes]) => ({
    path,
    text: strFromU8(bytes),
  }));
  const result = analyseFiles(files);
  if (!result.files.length)
    throw new Error("No supported source files found in the archive.");
  return result;
}
export default function CodeAtlas() {
  const [snapshot, setSnapshot] = useState(example),
    [baseline, setBaseline] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState("lib/physics.ts"),
    [filter, setFilter] = useState(""),
    [synthetic, setSynthetic] = useState(true),
    { act, error, busy, setError } = useAction();
  const files = snapshot.files.filter((f) =>
      f.path.toLowerCase().includes(filter.toLowerCase()),
    ),
    file = snapshot.files.find((f) => f.path === selected),
    max = Math.max(1, ...files.map((f) => f.lines)),
    maxBytes = Math.max(1, ...files.map((f) => f.bytes)),
    diff = baseline ? compareSnapshots(baseline, snapshot) : [];
  function apply(s: Snapshot) {
    setSnapshot(s);
    setSelected(s.files[0]?.path ?? "");
    setSynthetic(false);
  }
  return (
    <div className="lab-work">
      <div className="lab-two">
        <FileInput
          disabled={busy}
          label={c.upload}
          accept=".zip,.json"
          onFile={(f) => act(async () => apply(await readArchive(f)))}
        />
        <FileInput
          disabled={busy}
          label={c.compare}
          accept=".zip,.json"
          onFile={(f) =>
            act(async () => {
              const next = await readArchive(f);
              setBaseline(snapshot);
              apply(next);
            })
          }
        />
      </div>
      <div className="lab-actions">
        <Button
          onClick={() => {
            setError("");
            setSnapshot(example());
            setSynthetic(true);
            setBaseline(null);
            setSelected("lib/physics.ts");
          }}
        >
          {common.example}
        </Button>
        <Button onClick={() => setBaseline(snapshot)}>{c.baseline}</Button>
        <Button
          primary
          onClick={() => jsonDownload("code-atlas-snapshot.json", snapshot)}
        >
          {c.export}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {busy && <p role="status">{common.working}</p>}
      {synthetic && <p className="lab-note">{c.sampleNote}</p>}
      <Metrics
        items={[
          [c.metrics[0], snapshot.files.length],
          [
            c.metrics[1],
            fmt(
              snapshot.files.reduce((n, f) => n + f.lines, 0),
              0,
            ),
          ],
          [
            c.metrics[2],
            fmt(
              snapshot.files.reduce((n, f) => n + f.bytes, 0),
              0,
            ),
          ],
        ]}
      />
      <Field label={c.filter}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Field>
      <h2>{c.city}</h2>
      <p className="lab-note">{c.help}</p>
      <div className="lab-city" aria-label={c.city}>
        {files.slice(0, 120).map((f) => (
          <button
            key={f.path}
            className="lab-building"
            aria-label={`${f.path}: ${f.lines} lines, ${f.bytes} bytes`}
            aria-pressed={selected === f.path}
            title={f.path}
            style={{
              height: 48 + Math.sqrt(f.lines / max) * 200,
              width: 36 + Math.sqrt(f.bytes / maxBytes) * 45,
            }}
            onClick={() => setSelected(f.path)}
          >
            <span>{f.path.split("/").at(-1)}</span>
          </button>
        ))}
      </div>
      {!files.length && <p>{c.empty}</p>}
      {file && (
        <section className="lab-panel">
          <h3>{c.details}</h3>
          <pre>{file.path}</pre>
          <p>
            {file.lines} {c.metrics[1].toLowerCase()} · {file.bytes}{" "}
            {c.metrics[2].toLowerCase()}
          </p>
        </section>
      )}
      <details>
        <summary>
          {c.metrics[0]} · {files.length}
        </summary>
        <div className="lab-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{c.columns[0]}</th>
                <th>{c.metrics[1]}</th>
                <th>{c.metrics[2]}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.path}>
                  <td>
                    <button
                      className="bench-button"
                      onClick={() => setSelected(f.path)}
                    >
                      {f.path}
                    </button>
                  </td>
                  <td>{f.lines}</td>
                  <td>{f.bytes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {baseline && (
        <section>
          <h2>{c.delta}</h2>
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
                {diff.map((d) => (
                  <tr key={d.path}>
                    <td>{d.path}</td>
                    <td>{d.before}</td>
                    <td>{d.after}</td>
                    <td>
                      {d.delta > 0 ? "+" : ""}
                      {d.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
