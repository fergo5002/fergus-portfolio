"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { atlasCopy as copy } from "@/content/studio/atlas-copy";
import { studioCopy } from "@/content/studio/copy";
import { atlasExample } from "@/content/studio/atlas";
import { buildGraph, parseGraph, type AtlasFile, type AtlasGraph } from "@/lib/studio/graph";
import { importFiles, importGithub, droppedFiles } from "@/lib/studio/intake";
import { findNodes, inspect, litSet, mapSummary, readingFor, typesOf, type LinkKind } from "@/lib/studio/atlas-view";
import { DEFAULT_KINDS } from "@/lib/studio/atlas-scene";
import { download, jsonDownload } from "@/components/lab/shared";
import { DropSlot, ExportBar, FilePicker, Select, Toggle, useIntake } from "@/components/instrument";
import { Press } from "./Furniture";
import GraphCanvas, { type GraphHandle } from "./GraphCanvas";
import AtlasInspector, { type Media } from "./AtlasInspector";

/**
 * Atlas: files, a folder or a public repository, drawn as a map of how they
 * connect.
 *
 * The map is the stage and the first thing on it: already laid out on the
 * example notebook, the beam walking its links. Everything else is either on
 * the stage's edges (the reading line and the `find ›` command line along
 * the top, the zoom at the corner, one row of kit controls along the bottom,
 * the inspector sliding over the map) or in one compact deck under it (where
 * a map comes from, how it is kept, and the list of every file).
 *
 * This file is wiring. What is found, lit, read out and inspected comes from
 * `lib/studio/atlas-view.ts`; the drawing, the camera and the hand are
 * `GraphCanvas`'s; every word is `content/studio/atlas-copy.ts`'s.
 *
 * Nothing leaves the tab except the GitHub fetch, which asks GitHub for a
 * public repository and nothing else. Nothing is stored: a map is kept only
 * when the visitor saves one, and it says beside the button that the file
 * includes the text read from theirs.
 */
const LIST_STEP = 60;
const SAVED_MAP_LIMIT = 15_000_000;
const KIND_LABEL: Record<LinkKind, string> = { folder: copy.folders, reference: copy.references, terms: copy.terms };

export default function Atlas() {
  const [files, setFiles] = useState<AtlasFile[]>(atlasExample);
  const [graph, setGraph] = useState<AtlasGraph>(() => buildGraph(atlasExample));
  const [isExample, setIsExample] = useState(true);
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [focus, setFocus] = useState(false);
  const [kinds, setKinds] = useState<LinkKind[]>([...DEFAULT_KINDS]);
  const [pins, setPins] = useState<ReadonlySet<string>>(() => new Set());
  const [github, setGithub] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [limit, setLimit] = useState(LIST_STEP);
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const mediaRef = useRef<Record<string, Media>>({});
  const controller = useRef<AbortController | null>(null);
  const worker = useRef<Worker | null>(null);
  const graphHandle = useRef<GraphHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      controller.current?.abort();
      worker.current?.terminate();
      Object.values(mediaRef.current).forEach((m) => URL.revokeObjectURL(m.url));
    };
  }, []);

  const summary = useMemo(() => mapSummary(files, graph), [files, graph]);
  const matches = useMemo(() => findNodes(graph.nodes, query, type), [graph, query, type]);
  const lit = useMemo(() => litSet(graph.nodes, query, type), [graph, query, type]);
  const types = useMemo(() => typesOf(graph.nodes), [graph]);
  const view = useMemo(() => (selected ? inspect(graph, selected) : null), [graph, selected]);
  const pointedAt = hovered || selected;
  const reading = pointedAt ? readingFor(graph, pointedAt) : null;
  const line = reading ? copy.reading(reading) : isExample ? copy.exampleSummary(summary) : copy.summary(summary);

  function choose(id: string) {
    setSelected(id);
    if (!id) setFocus(false);
  }

  // ── intake ───────────────────────────────────────────────────────────

  const intake = useIntake({
    multiple: true,
    disabled: !!progress,
    onFiles: (list) => void run((signal, onMedia) => importFiles(list, setProgress, signal, onMedia)),
    // Folders arrive as DataTransfer items, which must be read during the drop.
    onDrop: (data) => {
      const incoming = droppedFiles(data.items);
      void run(async (signal, onMedia) => importFiles(await incoming, setProgress, signal, onMedia));
    },
  });
  const mapIntake = useIntake({
    accept: ".json",
    disabled: !!progress,
    onFiles: ([f]) =>
      void run(async () => {
        if (f.size > SAVED_MAP_LIMIT) throw new Error(copy.errors.mapSize);
        return parseGraph(await f.text());
      }),
  });

  async function run(
    loader: (signal: AbortSignal, onMedia: (path: string, blob: Blob, kind: string) => void) => Promise<AtlasFile[]>,
    example = false,
  ) {
    controller.current?.abort();
    worker.current?.terminate();
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setProgress(copy.readingFiles);
    let pendingMedia: Record<string, Media> = {};
    try {
      const next = await loader(abort.signal, (path, blob, kind) => {
        if (!abort.signal.aborted) pendingMedia[path] = { url: URL.createObjectURL(blob), kind };
      });
      abort.signal.throwIfAborted();
      if (!next.length) throw new Error(copy.errors.empty);
      setProgress(copy.building);
      const nextGraph = await new Promise<AtlasGraph>((resolve, reject) => {
        const w = new Worker(new URL("../../lib/studio/graph.worker.ts", import.meta.url));
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
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.graph);
        };
        w.onerror = () => {
          w.terminate();
          reject(new Error(copy.errors.build));
        };
        w.postMessage(next);
      });
      abort.signal.throwIfAborted();
      setFiles(next);
      setGraph(nextGraph);
      setIsExample(example);
      setSelected("");
      setHovered("");
      setFocus(false);
      setPins(new Set());
      setQuery("");
      setType("all");
      setLimit(LIST_STEP);
      Object.values(mediaRef.current).forEach((m) => URL.revokeObjectURL(m.url));
      mediaRef.current = pendingMedia;
      setMedia(pendingMedia);
      pendingMedia = {};
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      Object.values(pendingMedia).forEach((m) => URL.revokeObjectURL(m.url));
      if (controller.current === abort) {
        setProgress("");
        controller.current = null;
      }
    }
  }

  function fetchRepo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progress && github.trim()) void run((signal) => importGithub(github, setProgress, signal));
  }

  // ── find ─────────────────────────────────────────────────────────────

  /** Enter walks the matches, choosing each in turn; Escape clears the line, then leaves it. */
  function onFindKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!matches.length) return;
      const at = matches.findIndex((n) => n.id === selected);
      choose(matches[(at + 1) % matches.length].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else event.currentTarget.blur();
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setError(copy.errors.fullscreen);
    }
  }

  async function saveImage() {
    const blob = await graphHandle.current?.image();
    if (blob) download("atlas-map.png", blob);
    else setError(copy.errors.image);
  }

  const shown = matches.slice(0, limit);

  return (
    <div className="studio atlas" {...intake.stageProps}>
      <div className="atlas-stage" ref={stageRef}>
        <div className="atlas-graph" data-inspecting={view ? "" : undefined}>
          <GraphCanvas
            ref={graphHandle}
            graph={graph}
            kinds={kinds}
            focus={focus}
            selected={selected}
            hovered={hovered}
            lit={lit}
            pins={pins}
            label={copy.canvas}
            onSelect={choose}
            onHover={setHovered}
            onError={() => setError(copy.errors.paint)}
          />
          <div className="atlas-osd">
            {progress ? (
              <p className="atlas-reading atlas-reading--busy" role="status">
                <span className="atlas-reading__text">{progress}</span>
                <button type="button" className="atlas-chip" onClick={() => controller.current?.abort()}>
                  {copy.cancel}
                </button>
              </p>
            ) : (
              <p className="atlas-reading" data-files={summary.files}>
                {line}
              </p>
            )}
            <label className="atlas-find">
              <span className="atlas-find__prompt" aria-hidden="true" />
              <input
                className="atlas-find__input"
                type="text"
                role="searchbox"
                aria-label={copy.find}
                placeholder={copy.findPlaceholder}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(LIST_STEP);
                }}
                onKeyDown={onFindKey}
              />
              {query ? (
                <span className="atlas-find__count" aria-live="polite">
                  {copy.matches(matches.length)}
                </span>
              ) : null}
            </label>
          </div>
          <div className="atlas-zoom" role="group" aria-label={copy.zoom}>
            <button type="button" className="atlas-icon" aria-label={copy.zoomIn} onClick={() => graphHandle.current?.zoom(1.25)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <button type="button" className="atlas-icon" aria-label={copy.zoomOut} onClick={() => graphHandle.current?.zoom(0.8)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M3 8h10" />
              </svg>
            </button>
            <button type="button" className="atlas-icon" aria-label={copy.fit} onClick={() => graphHandle.current?.fit()}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 5.25a2.75 2.75 0 1 0 0 5.5a2.75 2.75 0 1 0 0-5.5" />
              </svg>
            </button>
            {canFullscreen ? (
              <button
                type="button"
                className="atlas-icon"
                aria-label={fullscreen ? copy.exitFullscreen : copy.fullscreen}
                aria-pressed={fullscreen}
                onClick={() => void toggleFullscreen()}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  {fullscreen ? <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" /> : <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" />}
                </svg>
              </button>
            ) : null}
          </div>
          {view ? (
            <AtlasInspector
              view={view}
              media={media[view.id]}
              pinned={pins.has(view.id)}
              onClose={() => choose("")}
              onPin={() =>
                setPins((was) => {
                  const next = new Set(was);
                  if (next.has(view.id)) next.delete(view.id);
                  else next.add(view.id);
                  return next;
                })
              }
              onSelect={choose}
              onMediaError={setError}
            />
          ) : null}
        </div>
        <div className="atlas-strip" role="group" aria-label={copy.controls}>
          <Select className="atlas-type" label={copy.type} hideLabel value={type} onChange={(value) => { setType(value); setLimit(LIST_STEP); }}>
            <option value="all">{copy.allTypes}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {DEFAULT_KINDS.map((kind) => (
            <Toggle
              key={kind}
              className={`atlas-kind atlas-kind--${kind}`}
              label={KIND_LABEL[kind]}
              checked={kinds.includes(kind)}
              onChange={(on) => setKinds((was) => DEFAULT_KINDS.filter((k) => (k === kind ? on : was.includes(k))))}
            />
          ))}
          <Press active={focus} disabled={!selected} onClick={() => setFocus(!focus)}>
            {focus ? copy.whole : copy.focus}
          </Press>
        </div>
      </div>

      <div className="atlas-deck">
        <DropSlot intake={intake} id="atlas-files" label={studioCopy.files} hint={copy.hint}>
          <FilePicker intake={intake} id="atlas-folder" label={studioCopy.folder} directory variant="quiet" />
        </DropSlot>
        <form className="atlas-repo" onSubmit={fetchRepo}>
          <input
            className="atlas-repo__input"
            type="text"
            aria-label={copy.repo}
            placeholder={copy.repoPlaceholder}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
          />
          <button type="submit" className="atlas-repo__go" disabled={!!progress || !github.trim()}>
            {copy.fetch}
          </button>
        </form>
        {isExample ? null : (
          <button type="button" className="atlas-back" disabled={!!progress} onClick={() => void run(async () => atlasExample, true)}>
            {copy.example}
          </button>
        )}
        <p className="atlas-error" role="alert">
          {error}
        </p>
      </div>

      <div className="atlas-keep">
        <ExportBar
          label={copy.exports}
          note={copy.keepNote}
          actions={[
            { label: copy.save, kind: "json", onClick: () => jsonDownload("atlas-map.json", { format: "atlas-v1", files }) },
            { label: copy.image, kind: "png", onClick: () => void saveImage() },
          ]}
        />
        <DropSlot intake={mapIntake} id="atlas-map" label={copy.open} zone />
      </div>

      <details className="atlas-list">
        <summary>{copy.list(matches.length, graph.nodes.length)}</summary>
        <div className="atlas-list__body" data-lenis-prevent="">
          {shown.map((n) => (
            <button
              key={n.id}
              type="button"
              className="atlas-list__item"
              aria-pressed={selected === n.id}
              onClick={() => {
                choose(n.id);
                stageRef.current?.scrollIntoView({ block: "nearest" });
              }}
            >
              <span className="atlas-list__path">{n.path}</span>
              <span className="atlas-list__kind">{n.kind}</span>
            </button>
          ))}
          {matches.length > limit ? (
            <button type="button" className="atlas-list__more" onClick={() => setLimit(limit + LIST_STEP)}>
              {copy.listMore}
            </button>
          ) : null}
          {matches.length ? null : <p className="atlas-list__empty">{copy.empty}</p>}
        </div>
      </details>
    </div>
  );
}
