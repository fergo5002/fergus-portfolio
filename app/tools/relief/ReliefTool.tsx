"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { reliefCopy } from "@/content/tools/relief";
import { contourLayers } from "@/lib/tools/relief/contour";
import { MAX_CSV_ROWS, dateColumnGuess, eventsFromCsv, parseCsv } from "@/lib/tools/relief/csv";
import { demoEvents } from "@/lib/tools/relief/demo";
import {
  type PlateKind,
  type PlateSource,
  type SaveEnv,
  canvasBlob,
  plateFilename,
  saveBlob,
  stlBlob,
  svgBlob,
} from "@/lib/tools/relief/download";
import {
  type Palette,
  ReliefPaletteError,
  paint,
  paletteFromTokens,
  planPlate,
  plateGeometry,
} from "@/lib/tools/relief/draw";
import {
  ReliefAuthError,
  ReliefInputError,
  ReliefRateLimitError,
  WINDOWS,
  fetchCommitEvents,
} from "@/lib/tools/relief/github";
import { FLAT_RANGE, buildHeightmap, checkDensity } from "@/lib/tools/relief/heightmap";
import { buildMesh, writeBinaryStl } from "@/lib/tools/relief/stl";
import { plotterSvg } from "@/lib/tools/relief/svg";
import { HOURS, WEEKS, type ReliefEvent } from "@/lib/tools/relief/types";
import { trackToolRun } from "@/lib/tools/events";

/**
 * The tool.
 *
 * Thin by design, and the thinness is the plan's whole argument arriving: by
 * this point the bucketing, the ceiling, the smoothing, the contours, the
 * chaining, the ops list, the SVG, the mesh, the CSV parser and the commit
 * search are all pure functions with tests beside them. What is left here is
 * three inputs, one canvas, three buttons and the wiring, and the wiring is
 * what `ReliefTool.test.ts` reads.
 *
 * Four things are load-bearing and each has a check:
 *
 * **It opens drawn.** The demo is built in a lazy initialiser, which runs on
 * the server render and again on hydration. Same seed, same pure pipeline,
 * same numbers, so there is no mismatch and the readout under the plate is
 * real text in the HTML before any script runs.
 *
 * **The token has one home.** It lives in state, goes into `fetchCommitEvents`
 * and nowhere else. There is no URL in this file, no form to submit, and the
 * field is a password input with autocomplete off so no browser offers to
 * remember it. `safety.test.ts` greps the whole tool for a storage API.
 *
 * **The plate does not animate.** `SystemProvider` owns the one
 * `requestAnimationFrame` loop and AGENTS.md forbids a second, so the plate is
 * painted once per change of layers, size or theme. The only motion on the
 * route is a CSS opacity fade, gated behind `prefers-reduced-motion`.
 *
 * **Nothing is uploaded to get a file out.** The three exports are a blob and
 * an anchor, through `download.ts`, which is tested with `fetch` replaced by a
 * tripwire.
 */

const SOURCES: PlateSource[] = ["demo", "github", "csv"];
const CELLS = HOURS * WEEKS;
/** Label size on the plate. The face comes from the page, so there is no font name here. */
const LABEL_PX = 12;
/** Two is enough for a plate of thin lines and halves the pixels on a phone at 3x. */
const MAX_DPR = 2;

const fill = (template: string, values: Record<string, number>): string =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, String(value)),
    template,
  );

function messageFor(error: unknown): string {
  if (error instanceof ReliefAuthError) return reliefCopy.errors.auth;
  if (error instanceof ReliefRateLimitError) return reliefCopy.errors.rate;
  if (error instanceof ReliefInputError) return reliefCopy.errors.input;
  return reliefCopy.errors.other;
}

/**
 * Null for the one failure this can have, so the effect that calls it reads
 * straight down instead of assigning into a `let` from inside a `try`, which
 * is where the compiler stops being able to tell whether the value exists.
 * Anything other than a missing token is not ours and is rethrown.
 */
function safePalette(style: CSSStyleDeclaration): Palette | null {
  try {
    return paletteFromTokens((name) => style.getPropertyValue(name));
  } catch (error) {
    if (error instanceof ReliefPaletteError) return null;
    throw error;
  }
}

export default function ReliefTool() {
  const uid = useId();
  const { settings, audio } = useSystem();

  const [source, setSource] = useState<PlateSource>("demo");
  const [events, setEvents] = useState<ReliefEvent[]>(() => demoEvents());
  const [note, setNote] = useState<string>(reliefCopy.demoCaption);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState("");
  const [token, setToken] = useState("");
  const [table, setTable] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [column, setColumn] = useState(-1);
  const [width, setWidth] = useState(720);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<AbortController | null>(null);

  const heightmap = useMemo(() => buildHeightmap(events), [events]);
  const layers = useMemo(() => contourLayers(heightmap.field), [heightmap]);
  const geometry = useMemo(() => plateGeometry(width), [width]);
  /** Task 2 exports the constant; this is the one place it is spent. */
  const flat = heightmap.hi - heightmap.lo < FLAT_RANGE;

  /* The plate is as wide as its box, so the box is measured rather than
     guessed. A ResizeObserver, not a frame callback: this fires when the
     layout changes and at no other time. */
  useEffect(() => {
    const box = frameRef.current;
    if (!box) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /* Paint. Once per change of what is drawn, how big it is, or what colour the
     machine is set to, and never on a frame. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    // One computed-style read for both the colours and the face. Two would be
    // two layout reads in one paint for no gain.
    const style = window.getComputedStyle(document.documentElement);
    const palette = safePalette(style);
    if (!palette) {
      setNote(reliefCopy.errors.paint);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(geometry.width * dpr);
    canvas.height = Math.round(geometry.height * dpr);
    canvas.style.height = `${geometry.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The face is whatever the page is set in, so no font name lives here.
    context.font = `${LABEL_PX}px ${style.fontFamily}`;
    paint(context, planPlate({ layers, geometry, palette, labels: geometry.labels }));
  }, [layers, geometry, settings.theme]);

  /**
   * The one door new events come through. A refused year never replaces the
   * one on the sheet: the message changes and the plate stays, which is more
   * use than an empty page and a sentence.
   */
  function accept(next: ReliefEvent[]): boolean {
    const density = checkDensity(next);
    if (!density.ok) {
      setNote(reliefCopy.refusal[density.reason]);
      return false;
    }
    setEvents(next);
    return true;
  }

  async function onGithub() {
    if (busy) return;
    const started = Date.now();
    const controller = new AbortController();
    runRef.current = controller;
    setBusy(true);
    // `WINDOWS`, not a literal 13, so the line cannot drift from the loop.
    setNote(fill(reliefCopy.drawing, { done: 0, total: WINDOWS, commits: 0 }));

    try {
      const { events: found, truncated } = await fetchCommitEvents({
        user: user.trim(),
        token,
        endMs: Date.now(),
        fetchImpl: window.fetch.bind(window),
        sleep: (ms) => new Promise<void>((done) => window.setTimeout(done, ms)),
        onProgress: (done, total, commits) =>
          setNote(fill(reliefCopy.drawing, { done, total, commits })),
        signal: controller.signal,
      });
      const ok = accept(found);
      if (ok) {
        setSource("github");
        setNote(
          truncated
            ? reliefCopy.truncated
            : fill(reliefCopy.drawn, { events: found.length, occupied: countOccupied(found) }),
        );
      }
      void trackToolRun({ tool: "relief", outcome: ok ? "ok" : "refused", ms: Date.now() - started });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // The visitor stopped it. Not an outcome the tool produced, so no event.
        setNote(reliefCopy.stopped);
        return;
      }
      setNote(messageFor(error));
      void trackToolRun({ tool: "relief", outcome: "error", ms: Date.now() - started });
    } finally {
      runRef.current = null;
      setBusy(false);
    }
  }

  function onStop() {
    runRef.current?.abort();
  }

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    const text = await chosen.text();
    const parsed = parseCsv(text);
    const guess = dateColumnGuess(parsed.headers, parsed.rows);
    setTable(parsed);
    setColumn(guess);
    setSource("csv");
    if (guess < 0) {
      setNote(reliefCopy.noDateColumn);
      return;
    }
    if (parsed.rows.length >= MAX_CSV_ROWS) setNote(reliefCopy.csvCapped);
    readColumn(parsed.rows, guess);
  }

  function readColumn(rows: string[][], index: number) {
    const started = Date.now();
    const reading = eventsFromCsv(rows, index);
    const ok = accept(reading.events);
    if (ok) setNote(fill(reliefCopy.csvRead, { read: reading.read, skipped: reading.skipped }));
    void trackToolRun({ tool: "relief", outcome: ok ? "ok" : "refused", ms: Date.now() - started });
  }

  function onDemo() {
    setSource("demo");
    setEvents(demoEvents());
    setNote(reliefCopy.demoCaption);
  }

  const saveEnv: SaveEnv = useMemo(
    () => ({
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      anchor: () => document.createElement("a"),
      defer: (run) => {
        window.setTimeout(run, 0);
      },
    }),
    [],
  );

  async function onExport(kind: PlateKind) {
    const name = plateFilename(source, kind, new Date().toISOString());
    audio.key();
    if (kind === "svg") {
      saveBlob(svgBlob(plotterSvg(layers)), name, saveEnv);
      return;
    }
    if (kind === "stl") {
      saveBlob(stlBlob(writeBinaryStl(buildMesh(heightmap.field))), name, saveEnv);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveBlob(await canvasBlob(canvas), name, saveEnv);
  }

  const userId = `${uid}-user`;
  const tokenId = `${uid}-token`;
  const fileId = `${uid}-file`;
  const columnId = `${uid}-column`;
  const hour = String(heightmap.hiAt.row).padStart(2, "0");

  return (
    <div className="relief">
      <fieldset className="relief__sources">
        <legend className="relief__legend">{reliefCopy.sourceLegend}</legend>
        {SOURCES.map((key) => (
          <button
            key={key}
            type="button"
            className="relief__button"
            aria-pressed={source === key}
            onClick={() => (key === "demo" ? onDemo() : setSource(key))}
          >
            {reliefCopy.sources[key]}
          </button>
        ))}
      </fieldset>

      {source === "github" ? (
        <div className="relief__panel">
          <p className="relief__hint">{reliefCopy.githubHelp}</p>
          <label className="relief__label" htmlFor={userId}>
            {reliefCopy.userLabel}
          </label>
          <input
            id={userId}
            className="relief__input"
            value={user}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <label className="relief__label" htmlFor={tokenId}>
            {reliefCopy.tokenLabel}
          </label>
          <input
            id={tokenId}
            className="relief__input"
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="relief__actions">
            <button type="button" className="relief__button" onClick={onGithub} disabled={busy}>
              {reliefCopy.drawGithub}
            </button>
            <button type="button" className="relief__button" onClick={onStop} disabled={!busy}>
              {reliefCopy.stop}
            </button>
          </div>
        </div>
      ) : null}

      {source === "csv" ? (
        <div className="relief__panel">
          <p className="relief__hint">{reliefCopy.csvHelp}</p>
          <label className="relief__label" htmlFor={fileId}>
            {reliefCopy.fileLabel}
          </label>
          <input
            id={fileId}
            className="relief__file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {table ? (
            <>
              <label className="relief__label" htmlFor={columnId}>
                {reliefCopy.columnLabel}
              </label>
              <select
                id={columnId}
                className="relief__select"
                value={column}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setColumn(next);
                  readColumn(table.rows, next);
                }}
              >
                {table.headers.map((head, i) => (
                  <option key={`${head}-${i}`} value={i}>
                    {head === "" ? `${i + 1}` : head}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="relief__hint">{reliefCopy.noFile}</p>
          )}
        </div>
      ) : null}

      <p className="relief__note" role="status">
        {flat ? reliefCopy.refusal.flat : note}
      </p>

      <div className="relief__frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          className="relief__plate"
          role="img"
          aria-label={reliefCopy.plateAlt}
        />
      </div>

      <h2 className="relief__heading">{reliefCopy.readout.heading}</h2>
      <dl className="relief__readout">
        <div className="relief__row">
          <dt>{reliefCopy.readout.events}</dt>
          <dd>{heightmap.events}</dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.occupied}</dt>
          <dd>
            {heightmap.occupied} of {CELLS}
          </dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.busiest}</dt>
          <dd>
            {hour}:00, week {heightmap.hiAt.col + 1} of {WEEKS},{" "}
            {heightmap.counts[heightmap.hiAt.row][heightmap.hiAt.col]}
          </dd>
        </div>
        <div className="relief__row">
          <dt>{reliefCopy.readout.ceiling}</dt>
          <dd>{heightmap.ceiling}</dd>
        </div>
      </dl>
      <p className="relief__hint">{reliefCopy.method}</p>

      <h2 className="relief__heading">{reliefCopy.exportsHeading}</h2>
      <div className="relief__actions">
        <button type="button" className="relief__button" onClick={() => void onExport("png")}>
          {reliefCopy.downloads.png}
        </button>
        <button type="button" className="relief__button" onClick={() => void onExport("svg")}>
          {reliefCopy.downloads.svg}
        </button>
        <button type="button" className="relief__button" onClick={() => void onExport("stl")}>
          {reliefCopy.downloads.stl}
        </button>
      </div>
      <p className="relief__hint">{reliefCopy.plotterNote}</p>
      <p className="relief__hint">{reliefCopy.stlNote}</p>
    </div>
  );
}

/** The occupied-cell count for the "drawn" line, which the heightmap also reports. */
function countOccupied(events: readonly ReliefEvent[]): number {
  return new Set(events.map((e) => `${e.hour}:${e.week}`)).size;
}
