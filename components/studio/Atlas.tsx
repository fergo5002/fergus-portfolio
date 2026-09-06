"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.Atlas;
import { useEffect, useMemo, useRef, useState } from "react";
import { studioCopy } from "@/content/studio/copy";
import { atlasExample } from "@/content/studio/atlas";
import {
  buildGraph,
  parseGraph,
  type AtlasFile,
  type AtlasGraph,
} from "@/lib/studio/graph";
import { importFiles, importGithub, droppedFiles } from "@/lib/studio/intake";
import {
  Button,
  Field,
  FileInput,
  ErrorMessage,
  jsonDownload,
  Metrics,
} from "@/components/lab/shared";
import { StudioIntro, Toggle } from "./Furniture";
import GraphCanvas from "./GraphCanvas";
const c = studioCopy.atlas;
export default function Atlas() {
  const [files, setFiles] = useState<AtlasFile[]>(atlasExample),
    [graph, setGraph] = useState<AtlasGraph>(() => buildGraph(atlasExample)),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [focus, setFocus] = useState(false),
    [kinds, setKinds] = useState(["folder", "reference", "terms"]),
    [github, setGithub] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [limit, setLimit] = useState(60),
    [over, setOver] = useState(false),
    [media, setMedia] = useState<Record<string, { url: string; kind: string }>>(
      {},
    ),
    mediaRef = useRef<Record<string, { url: string; kind: string }>>({}),
    controller = useRef<AbortController | null>(null),
    worker = useRef<Worker | null>(null),
    folder = useRef<HTMLInputElement>(null);
  useEffect(() => {
    folder.current?.setAttribute("webkitdirectory", "");
    return () => {
      controller.current?.abort();
      worker.current?.terminate();
      Object.values(mediaRef.current).forEach((m) =>
        URL.revokeObjectURL(m.url),
      );
    };
  }, []);
  const node = graph.nodes.find((n) => n.id === selected),
    matches = useMemo(
      () =>
        graph.nodes.filter(
          (n) =>
            (type === "all" || n.kind === type) &&
            (!query ||
              `${n.path}\n${n.text}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        ),
      [graph, query, type],
    ),
    connected = graph.links.filter(
      (l) => l.source === selected || l.target === selected,
    );
  async function run(
    loader: (
      signal: AbortSignal,
      onMedia: (path: string, blob: Blob, kind: string) => void,
    ) => Promise<AtlasFile[]>,
  ) {
    controller.current?.abort();
    worker.current?.terminate();
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setProgress("Reading files…");
    let pendingMedia: Record<string, { url: string; kind: string }> = {};
    try {
      const next = await loader(abort.signal, (path, blob, kind) => {
        if (!abort.signal.aborted)
          pendingMedia[path] = { url: URL.createObjectURL(blob), kind };
      });
      abort.signal.throwIfAborted();
      if (!next.length) throw new Error("No files found in this input.");
      setProgress("Finding connections…");
      const nextGraph = await new Promise<AtlasGraph>((resolve, reject) => {
        const w = new Worker(
          new URL("../../lib/studio/graph.worker.ts", import.meta.url),
        );
        worker.current = w;
        abort.signal.addEventListener(
          "abort",
          () => {
            w.terminate();
            reject(new DOMException("Cancelled", "AbortError"));
          },
          { once: true },
        );
        w.onmessage = (e) => {
          w.terminate();
          e.data.error
            ? reject(new Error(e.data.error))
            : resolve(e.data.graph);
        };
        w.onerror = () => {
          w.terminate();
          reject(new Error("Could not build the map. Try a smaller input."));
        };
        w.postMessage(next);
      });
      abort.signal.throwIfAborted();
      setFiles(next);
      setGraph(nextGraph);
      setSelected("");
      setFocus(false);
      setQuery("");
      setType("all");
      setLimit(60);
      Object.values(mediaRef.current).forEach((m) =>
        URL.revokeObjectURL(m.url),
      );
      mediaRef.current = pendingMedia;
      setMedia(pendingMedia);
      pendingMedia = {};
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      Object.values(pendingMedia).forEach((m) => URL.revokeObjectURL(m.url));
      if (controller.current === abort) {
        setProgress("");
        controller.current = null;
      }
    }
  }
  return (
    <div className="lab-work studio studio-atlas">
      <StudioIntro eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div
        className={`studio-drop ${over ? "is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const incoming = droppedFiles(e.dataTransfer.items);
          void run(async (signal, onMedia) =>
            importFiles(await incoming, setProgress, signal, onMedia),
          );
        }}
      >
        <strong>{c.drop}</strong>
        <div className="studio-toolbar">
          <Field label={studioCopy.files}>
            <input
              type="file"
              multiple
              disabled={!!progress}
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = "";
                if (list.length)
                  void run((signal, onMedia) =>
                    importFiles(list, setProgress, signal, onMedia),
                  );
              }}
            />
          </Field>
          <Field label={studioCopy.folder}>
            <input
              ref={folder}
              type="file"
              multiple
              disabled={!!progress}
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = "";
                if (list.length)
                  void run((signal, onMedia) =>
                    importFiles(list, setProgress, signal, onMedia),
                  );
              }}
            />
          </Field>
          <Button
            disabled={!!progress}
            onClick={() => run(async () => atlasExample)}
          >
            {studioCopy.example}
          </Button>
        </div>
        <p>{c.limits}</p>
      </div>
      <details className="studio-details">
        <summary>{c.github}</summary>
        <div className="studio-toolbar">
          <Field label={c.github}>
            <input
              value={github}
              placeholder={ui.githubComOwnerRepository}
              onChange={(e) => setGithub(e.target.value)}
            />
          </Field>
          <Button
            disabled={!!progress || !github.trim()}
            onClick={() =>
              run((signal) => importGithub(github, setProgress, signal))
            }
          >
            {c.fetch}
          </Button>
        </div>
        <p>{c.githubNote}</p>
      </details>
      <ErrorMessage error={error} />
      {progress && (
        <div className="studio-toolbar" role="status">
          <span>{progress}</span>
          <Button onClick={() => controller.current?.abort()}>
            {studioCopy.cancel}
          </Button>
        </div>
      )}
      <Metrics
        items={[
          ["Files", files.length],
          ["Text extracted", files.filter((f) => f.status === "read").length],
          [
            "Metadata only",
            files.filter((f) => f.status === "metadata").length,
          ],
          [
            "Connections",
            graph.links.filter((l) => l.kind !== "folder").length,
          ],
        ]}
      />
      <div className="studio-toolbar">
        <Field label={c.query}>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(60);
            }}
          />
        </Field>
        <Field label={ui.fileType}>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setLimit(60);
            }}
          >
            <option value="all">{ui.allTypes}</option>
            {[...new Set(graph.nodes.map((n) => n.kind))].sort().map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        {(
          [
            ["folder", c.containment],
            ["reference", c.reference],
            ["terms", c.terms],
          ] as const
        ).map(([kind, label]) => (
          <Toggle
            key={kind}
            active={kinds.includes(kind)}
            onClick={() =>
              setKinds(
                kinds.includes(kind)
                  ? kinds.filter((k) => k !== kind)
                  : [...kinds, kind],
              )
            }
          >
            {label}
          </Toggle>
        ))}
        <Toggle
          active={focus}
          disabled={!selected}
          onClick={() => setFocus(!focus)}
        >
          {focus ? c.all : c.focus}
        </Toggle>
      </div>
      <div className="atlas-workspace">
        <GraphCanvas
          graph={graph}
          selected={selected}
          onSelect={setSelected}
          focus={focus}
          kinds={kinds}
        />
        <aside className="atlas-inspector">
          <p className="studio-eyebrow">{c.inspect}</p>
          {node ? (
            <>
              <h3>{node.label}</h3>
              <p className="studio-path">{node.path}</p>
              <span className="studio-badge">
                {node.status === "read" ? c.read : c.metadata} ·{" "}
                {node.size.toLocaleString()}
                {ui.bytes}
              </span>
              {node.note && <p className="studio-note">{node.note}</p>}
              {media[node.id]?.kind === "image" && (
                <img
                  className="atlas-media"
                  src={media[node.id].url}
                  alt={node.label}
                  onError={() =>
                    setError(
                      "This browser could not decode the selected image.",
                    )
                  }
                />
              )}
              {media[node.id]?.kind === "audio" && (
                <audio
                  className="atlas-media"
                  key={node.id}
                  src={media[node.id].url}
                  controls
                  preload="metadata"
                  onError={() =>
                    setError("This browser could not play this audio format.")
                  }
                />
              )}
              {media[node.id]?.kind === "video" && (
                <video
                  className="atlas-media"
                  key={node.id}
                  src={media[node.id].url}
                  controls
                  preload="metadata"
                  playsInline
                  onError={() =>
                    setError("This browser could not play this video format.")
                  }
                />
              )}
              {node.text && (
                <pre className="atlas-text">
                  {node.text.slice(0, 14000)}
                  {node.text.length > 14000
                    ? "\n… Preview limited to 14,000 characters. Save the map for the full extracted text."
                    : ""}
                </pre>
              )}
              <h4>{c.connections}</h4>
              {connected.length ? (
                connected.slice(0, 50).map((l, i) => {
                  const id = l.source === selected ? l.target : l.source;
                  return (
                    <button
                      className="atlas-related"
                      key={i}
                      onClick={() => setSelected(id)}
                    >
                      <strong>
                        {graph.nodes.find((n) => n.id === id)?.label}
                      </strong>
                      <span>{l.evidence}</span>
                    </button>
                  );
                })
              ) : (
                <p>{c.noLinks}</p>
              )}
            </>
          ) : (
            <p>{c.noSelection}</p>
          )}
        </aside>
      </div>
      <details className="studio-details" open={!!query || type !== "all"}>
        <summary>
          {c.list} · {matches.length}
        </summary>
        <div className="atlas-file-list">
          {matches.slice(0, limit).map((n) => (
            <button
              key={n.id}
              aria-pressed={selected === n.id}
              onClick={() => setSelected(n.id)}
            >
              <span>{n.path}</span>
              <small>
                {n.kind} · {n.degree}
                {ui.links}
              </small>
            </button>
          ))}
        </div>
        {matches.length > limit && (
          <Button onClick={() => setLimit(limit + 60)}>
            {ui.show60MoreFiles}
          </Button>
        )}
        {!matches.length && <p>{studioCopy.empty}</p>}
      </details>
      <div className="studio-toolbar">
        <Button
          onClick={() =>
            jsonDownload("atlas-map.json", { format: "atlas-v1", files })
          }
        >
          {c.export}
        </Button>
        <FileInput
          label={c.load}
          accept=".json"
          disabled={!!progress}
          onFile={(f) =>
            run(async () => {
              if (f.size > 15_000_000)
                throw new Error("Saved map limit: 15 MB.");
              return parseGraph(await f.text());
            })
          }
        />
      </div>
      <p className="studio-note">{c.source}</p>
    </div>
  );
}
