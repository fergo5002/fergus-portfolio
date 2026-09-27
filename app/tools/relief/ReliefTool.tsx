"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { reliefCopy } from "@/content/tools/relief";
import { contourLayers } from "@/lib/tools/relief/contour";
import {
  type CsvTable,
  csvFileAllowed,
  dateColumnGuess,
  eventsFromCsv,
  parseCsv,
} from "@/lib/tools/relief/csv";
import { DEMO_SEED, demoEvents } from "@/lib/tools/relief/demo";
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
  pickPlate,
  planPlate,
  planRidgeline,
  plateGeometry,
  platePoint,
} from "@/lib/tools/relief/draw";
import {
  ReliefAuthError,
  ReliefInputError,
  ReliefRateLimitError,
  WINDOWS,
  fetchCommitEvents,
} from "@/lib/tools/relief/github";
import { FLAT_RANGE, buildHeightmap, checkDensity } from "@/lib/tools/relief/heightmap";
import { hourX, pickRidge, readCount, ridgeGeometry, ridgelines } from "@/lib/tools/relief/ridgeline";
import { buildMesh, writeBinaryStl } from "@/lib/tools/relief/stl";
import { plotterSvg, ridgelineSvg } from "@/lib/tools/relief/svg";
import { HOURS, WEEKS, type Point, type ReliefEvent, type ReliefView } from "@/lib/tools/relief/types";
import { trackToolRun } from "@/lib/tools/events";
import { DropSlot, ExportBar, Segmented, Select, Slider, useIntake } from "@/components/instrument";

/**
 * The tool.
 *
 * Still wiring, and the wiring is what `ReliefTool.test.ts` reads: the
 * bucketing, the ceiling, the smoothing, the contours, the ridgeline and its
 * hidden-line removal, the crosshair's snapping, the ops lists, the two SVGs,
 * the mesh, the CSV parser and the commit search are all pure functions with
 * tests beside them.
 *
 * The stage, top to bottom: the terrain (a ridge a week, or the contour plate
 * from above), a readout of the cell under the crosshair with the view switch
 * beside it, one line of figures, the two sliders that move the crosshair by
 * keyboard, and one row for the source and the three exports. The terrain
 * comes first and nothing sits above it.
 *
 * Five things are load-bearing and each has a check:
 *
 * **It opens drawn.** The demo is built in a lazy initialiser, which runs on
 * the server render and again on hydration. Same seed, same pure pipeline,
 * same numbers, so the readout and the figures are real text in the HTML
 * before any script runs.
 *
 * **The token has one home.** It lives in state, goes into `fetchCommitEvents`
 * and nowhere else. There is no URL in this file, no form to submit, and the
 * field is a password input with autocomplete off so no browser offers to
 * remember it. `safety.test.ts` greps the whole tool for a storage API.
 *
 * **One frame clock.** The ridges draw in once, back to front, when a new
 * year first comes on screen: off `SystemProvider`'s `onFrame`, by elapsed
 * time, subscribed only once an IntersectionObserver has seen the canvas, and
 * not at all under reduced motion or in a hidden tab. Every other paint is
 * once per change of what is drawn, how big it is or what colour the machine
 * is, and never on a frame.
 *
 * **The crosshair reads the count.** The drawn height is smoothed and
 * compressed; the readout is `readCount` on the raw counts.
 *
 * **Nothing is uploaded to get a file out.** The three exports are a blob and
 * an anchor, through `download.ts`, which is tested with `fetch` replaced by a
 * tripwire.
 */

type Cell = { week: number; hour: number };

const SOURCES: PlateSource[] = ["demo", "github", "csv"];
const VIEWS: ReliefView[] = ["ridgeline", "contour"];
/** Label size on the plate. The face comes from the page, so there is no font name here. */
const LABEL_PX = 12;
/** Two is enough for a plate of thin lines and halves the pixels on a phone at 3x. */
const MAX_DPR = 2;
/** The draw-in: fifty-two ridges in a little over a second, the time a beam takes to feel deliberate. */
const SWEEP_MS = 1100;
/** If the frame clock has not finished the draw-in by now (a starved or hidden tab), finish it at once. */
const SWEEP_FAILSAFE_MS = 2500;
/** Before the box is measured. Only ever the server's guess: nothing is painted at this width. */
const GUESS_WIDTH = 720;

const fill = (template: string, values: Record<string, number>): string =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, String(value)),
    template,
  );

const toPoints = (points: readonly Point[]) =>
  points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

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
  const { settings, audio, onFrame, reducedMotion } = useSystem();

  const [source, setSource] = useState<PlateSource>("demo");
  const [events, setEvents] = useState<ReliefEvent[]>(() => demoEvents());
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState("");
  const [token, setToken] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [column, setColumn] = useState(-1);
  const [measured, setMeasured] = useState<number | null>(null);
  const [plateSource, setPlateSource] = useState<PlateSource>("demo");
  const [exportReady, setExportReady] = useState(true);
  const [view, setView] = useState<ReliefView>("ridgeline");
  /** Null means "on the summit": every new year opens with the crosshair on its highest ground. */
  const [cursor, setCursor] = useState<Cell | null>(null);
  const fileVersion = useRef(0);
  const demoVersion = useRef(DEMO_SEED);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<AbortController | null>(null);
  /** The year the draw-in last ran for, so a resize or a theme change repaints rather than replays. */
  const swept = useRef<readonly ReliefEvent[] | null>(null);
  /** Finishes a draw-in that is still running, so a PNG is never half a year. */
  const settle = useRef<(() => void) | null>(null);
  /** A finger on the terrain: it picked its week on the way down and drags along that ridge. */
  const held = useRef<{ id: number; week: number } | null>(null);

  useEffect(() => () => runRef.current?.abort(), []);

  const width = measured ?? GUESS_WIDTH;
  const heightmap = useMemo(() => buildHeightmap(events), [events]);
  const layers = useMemo(() => contourLayers(heightmap.field), [heightmap]);
  const geometry = useMemo(() => plateGeometry(width), [width]);
  const ridgeBox = useMemo(() => ridgeGeometry(width), [width]);
  const ridges = useMemo(() => ridgelines(heightmap.profile, ridgeBox), [heightmap, ridgeBox]);
  /** Task 2 exports the constant; this is the one place it is spent. */
  const flat = heightmap.hi - heightmap.lo < FLAT_RANGE;
  const box = view === "ridgeline" ? ridgeBox : geometry;

  const at: Cell = cursor ?? { week: heightmap.hiAt.col + 1, hour: heightmap.hiAt.row };
  const count = readCount(heightmap.counts, at.week, at.hour);

  /* The plate is as wide as its box, so the box is measured rather than
     guessed. A ResizeObserver, not a frame callback: this fires when the
     layout changes and at no other time. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setMeasured(next);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  /* Paint. Once per change of what is drawn, which view, how big it is, or
     what colour the machine is set to; the ridgeline's draw-in is the one
     exception, and it runs off the shared frame clock. */
  useEffect(() => {
    settle.current = null;
    const canvas = canvasRef.current;
    if (!canvas || measured === null) return;

    const context = canvas.getContext("2d");
    if (!context) { setNote(reliefCopy.errors.paint); setExportReady(false); return; }

    // The colours are the theme's tokens on the root. The face is the canvas's
    // own, inherited from the body: the root carries no family, and reading it
    // there drew every label in the browser's default serif.
    const style = window.getComputedStyle(document.documentElement);
    const face = window.getComputedStyle(canvas).fontFamily;
    const palette = safePalette(style);
    if (!palette) {
      setNote(reliefCopy.errors.paint);
      setExportReady(false);
      return;
    }

    // The bitmap only. Its CSS height is deliberately not set here: `tool.css`
    // leaves it `auto` so the displayed shape is the bitmap's own ratio, and a
    // ResizeObserver reading that lags the box costs resolution rather than
    // stretching the ground sideways.
    const size = view === "ridgeline" ? ridgeBox : geometry;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The face is whatever the page is set in, so no font name lives here.
    context.font = `${LABEL_PX}px ${face}`;
    context.lineJoin = "round";
    context.lineCap = "round";

    if (view === "contour") {
      paint(context, planPlate({ layers, geometry, palette, labels: geometry.labels }));
      return;
    }

    const plan = planRidgeline({ ridges, geometry: ridgeBox, palette, labels: true });
    paint(context, plan.ground);
    let drawn = 0;
    const drawTo = (n: number) => {
      for (; drawn < n; drawn++) paint(context, plan.ridges[drawn]);
    };
    const all = () => drawTo(plan.ridges.length);

    const fresh = swept.current !== events;
    swept.current = events;
    if (!fresh || reducedMotion || document.visibilityState !== "visible") {
      all();
      return;
    }

    // The draw-in. Nothing is subscribed until the canvas is on screen, and
    // the subscription ends with the last ridge.
    settle.current = all;
    // The frame's own timestamp, not a sum of `dt`: the clock clamps `dt` at
    // 64ms, and a starved tab (measured: 250 to 450ms a frame in headless
    // Chromium's software WebGL) would otherwise stretch one second into five.
    let start = -1;
    let stop: (() => void) | null = null;
    let failsafe = 0;
    const done = () => {
      all();
      stop?.();
      stop = null;
      settle.current = null;
      window.clearTimeout(failsafe);
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (stop || !entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        failsafe = window.setTimeout(done, SWEEP_FAILSAFE_MS);
        stop = onFrame((time) => {
          if (start < 0) start = time;
          drawTo(Math.ceil(plan.ridges.length * Math.min(1, (time - start) / SWEEP_MS)));
          if (drawn >= plan.ridges.length) done();
        });
      },
      { threshold: 0.2 },
    );
    seen.observe(canvas);
    return () => {
      seen.disconnect();
      stop?.();
      window.clearTimeout(failsafe);
      settle.current = null;
    };
  }, [view, layers, geometry, ridges, ridgeBox, events, measured, reducedMotion, onFrame, settings.theme]);

  /** A new year on the sheet: the crosshair goes back to its summit. */
  function show(next: ReliefEvent[]) {
    setEvents(next);
    setCursor(null);
  }

  /**
   * The one door new events come through. A refused year never replaces the
   * one on the sheet: the message changes and the plate stays, which is more
   * use than an empty page and a sentence.
   */
  function accept(next: ReliefEvent[], warning?: string): boolean {
    const density = checkDensity(next);
    if (!density.ok) {
      setExportReady(false);
      setNote(
        warning
          ? `${warning} ${reliefCopy.refusal[density.reason]}`
          : reliefCopy.refusal[density.reason],
      );
      return false;
    }
    show(next);
    setExportReady(true);
    return true;
  }

  async function onGithub() {
    if (busy) return;
    const started = Date.now();
    const controller = new AbortController();
    runRef.current = controller;
    setBusy(true);
    setExportReady(false);
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
        onBackoff: (ms) =>
          setNote(fill(reliefCopy.backoff, { seconds: Math.ceil(ms / 1000) })),
        signal: controller.signal,
      });
      const ok = accept(found, truncated ? reliefCopy.truncated : undefined);
      if (ok) {
        setSource("github");
        setPlateSource("github");
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
    const version = ++fileVersion.current;
    setSource("csv");
    setExportReady(false);
    if (!csvFileAllowed(chosen.size)) {
      setTable(null);
      setColumn(-1);
      setNote(reliefCopy.errors.csvTooLarge);
      return;
    }
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setNote(reliefCopy.errors.csvRead);
      return;
    }
    if (version !== fileVersion.current) return;
    const parsed = parseCsv(text);
    const guess = dateColumnGuess(parsed.headers, parsed.rows);
    setTable(parsed);
    setColumn(guess);
    if (guess < 0) {
      setNote(
        parsed.capped
          ? `${reliefCopy.csvCapped} ${reliefCopy.noDateColumn}`
          : reliefCopy.noDateColumn,
      );
      return;
    }
    readColumn(parsed.rows, guess, parsed.capped);
  }

  function readColumn(rows: string[][], index: number, capped = false) {
    setExportReady(false);
    const started = Date.now();
    const reading = eventsFromCsv(rows, index);
    const warning = capped ? reliefCopy.csvCapped : undefined;
    const ok = accept(reading.events, warning);
    if (ok) {
      setPlateSource("csv");
      const result = fill(reliefCopy.csvRead, { read: reading.read, skipped: reading.skipped });
      setNote(warning ? `${warning} ${result}` : result);
    }
    void trackToolRun({ tool: "relief", outcome: ok ? "ok" : "refused", ms: Date.now() - started });
  }

  /** Back to the modelled year, or on to another one with `seed`. */
  function onDemo(seed = demoVersion.current) {
    fileVersion.current++;
    runRef.current?.abort();
    demoVersion.current = seed;
    setSource("demo");
    setPlateSource("demo");
    setExportReady(true);
    show(demoEvents(seed));
    setNote("");
  }

  function onSource(next: PlateSource) {
    if (next === "demo") onDemo(DEMO_SEED);
    else setSource(next);
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
    if (!exportReady || busy) { setNote(reliefCopy.stale); return; }
    try {
      const name = plateFilename(plateSource, kind, new Date().toISOString(), kind === "stl" ? "contour" : view);
      audio.key();
      if (kind === "svg") {
        saveBlob(svgBlob(view === "ridgeline" ? ridgelineSvg(heightmap.profile) : plotterSvg(layers)), name, saveEnv);
        return;
      }
      if (kind === "stl") {
        saveBlob(stlBlob(writeBinaryStl(buildMesh(heightmap.field))), name, saveEnv);
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("relief: the plate canvas is unavailable");
      settle.current?.();
      saveBlob(await canvasBlob(canvas), name, saveEnv);
    } catch {
      setNote(reliefCopy.errors.export);
    }
  }

  /* The crosshair. A mouse reads wherever it hovers; a finger picks a ridge
     where it lands and then drags along it, because across the ridges they
     are a few pixels apart and the page has to stay scrollable. */
  function locate(event: PointerEvent<HTMLCanvasElement>): Cell {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * box.width) / rect.width;
    const y = ((event.clientY - rect.top) * box.height) / rect.height;
    return view === "ridgeline" ? pickRidge(ridges, ridgeBox, x, y) : pickPlate(geometry, x, y);
  }

  function aim(next: Cell) {
    setCursor((prev) => (prev && prev.week === next.week && prev.hour === next.hour ? prev : next));
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const cell = locate(event);
    aim(cell);
    if (event.pointerType === "mouse") return;
    held.current = { id: event.pointerId, week: cell.week };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const finger = held.current;
    if (finger && finger.id === event.pointerId) {
      const cell = locate(event);
      aim(view === "ridgeline" ? { week: finger.week, hour: cell.hour } : cell);
    } else if (event.pointerType === "mouse") {
      aim(locate(event));
    }
  }

  function onPointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    if (held.current?.id === event.pointerId) held.current = null;
  }

  /* The whole plate takes a dropped CSV, whichever source is showing. */
  const intake = useIntake({ accept: ".csv,text/csv", onFiles: ([chosen]) => void onFile(chosen) });

  const userId = `${uid}-user`;
  const tokenId = `${uid}-token`;
  const fileId = `${uid}-file`;
  const columnId = `${uid}-column`;

  const ridge = ridges[at.week - 1];
  const sight =
    view === "ridgeline" ? { x: hourX(ridgeBox, at.hour), y: ridge.hourY[at.hour] } : platePoint(geometry, at.week, at.hour);
  const disabled = !exportReady || busy;

  return (
    <div className="relief" {...intake.stageProps}>
      <div className="relief__screen">
        <div className="relief__frame" ref={frameRef} data-view={view}>
          <div className="relief__glass">
            <canvas
              ref={canvasRef}
              className="relief__plate"
              role="img"
              aria-label={view === "ridgeline" ? reliefCopy.ridgeAlt : reliefCopy.plateAlt}
              width={box.width}
              height={Math.round(box.height)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
            />
            <svg
              className="relief__sight"
              viewBox={`0 0 ${box.width} ${box.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {view === "ridgeline" ? (
                <>
                  <polyline className="relief__sight-behind" points={toPoints(ridge.points)} />
                  {ridge.visible.map((line, i) => (
                    <polyline key={i} className="relief__sight-ridge" points={toPoints(line)} />
                  ))}
                  <line className="relief__sight-drop" x1={sight.x} y1={sight.y} x2={sight.x} y2={ridgeBox.height - ridgeBox.padBottom} />
                </>
              ) : (
                <>
                  <line className="relief__sight-drop" x1={sight.x} y1={geometry.padTop} x2={sight.x} y2={geometry.padTop + geometry.plotHeight} />
                  <line className="relief__sight-drop" x1={geometry.padLeft} y1={sight.y} x2={geometry.padLeft + geometry.plotWidth} y2={sight.y} />
                </>
              )}
            </svg>
            <span
              className="relief__dot"
              aria-hidden="true"
              style={{ left: `${(100 * sight.x) / box.width}%`, top: `${(100 * sight.y) / box.height}%` }}
            />
          </div>
        </div>
        {/* The screen's own display: the reading in the sky over the terrain,
            and the view switch beside it where there is room for both. */}
        <output className="relief__cell">{reliefCopy.cell(at.week, at.hour, count)}</output>
        <Segmented
          className="relief__views"
          label={reliefCopy.viewLabel}
          hideLabel
          size="sm"
          value={view}
          onChange={setView}
          options={VIEWS.map((key) => ({ value: key, label: reliefCopy.views[key] }))}
        />
      </div>

      <p className="relief__figures">
        {plateSource === "demo" ? <span className="relief__caption">{reliefCopy.demoCaption}</span> : null}
        <span>{reliefCopy.figures(heightmap.events, heightmap.occupied, heightmap.ceiling)}</span>
      </p>

      <div className="relief__dials">
        <Slider
          label={reliefCopy.week}
          min={1}
          max={WEEKS}
          value={at.week}
          onChange={(week) => setCursor({ week, hour: at.hour })}
        />
        <Slider
          label={reliefCopy.hour}
          min={0}
          max={HOURS - 1}
          value={at.hour}
          onChange={(hour) => setCursor({ week: at.week, hour })}
          format={(h) => `${String(h).padStart(2, "0")}:00`}
        />
      </div>

      <div className="relief__deck">
        <div className="relief__sources">
          <Segmented
            label={reliefCopy.sourceLegend}
            hideLabel
            size="sm"
            value={source}
            disabled={busy}
            onChange={onSource}
            options={SOURCES.map((key) => ({ value: key, label: reliefCopy.sources[key] }))}
          />
          {source === "demo" ? (
            <button type="button" className="relief__again" onClick={() => onDemo(demoVersion.current + 1)}>
              <svg className="relief__again-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5" />
              </svg>
              {reliefCopy.anotherDemo}
            </button>
          ) : null}
        </div>
        <ExportBar
          className="relief__exports"
          label={reliefCopy.exportsHeading}
          actions={[
            { label: reliefCopy.downloads.png, kind: "png", disabled, onClick: () => void onExport("png") },
            { label: reliefCopy.downloads.svg, kind: "svg", disabled, onClick: () => void onExport("svg") },
            { label: reliefCopy.downloads.stl, kind: "stl", disabled, onClick: () => void onExport("stl") },
          ]}
        />
      </div>

      {source === "github" ? (
        <div className="relief__panel">
          <p className="relief__hint">{reliefCopy.githubHelp}</p>
          <div className="relief__fields">
            <label className="relief__field" htmlFor={userId}>
              <span className="relief__label">{reliefCopy.userLabel}</span>
              <input
                id={userId}
                className="relief__input"
                value={user}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setUser(e.target.value)}
                onKeyDown={() => audio.key()}
              />
            </label>
            <label className="relief__field" htmlFor={tokenId}>
              <span className="relief__label">{reliefCopy.tokenLabel}</span>
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
            </label>
          </div>
          <div className="relief__actions">
            <button type="button" className="relief__button relief__button--go" onClick={onGithub} disabled={busy}>
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
          <DropSlot intake={intake} id={fileId} label={reliefCopy.fileLabel} hint={reliefCopy.fileHint} />
          {table ? (
            <Select
              id={columnId}
              label={reliefCopy.columnLabel}
              value={String(column)}
              onChange={(value) => {
                const next = Number(value);
                setColumn(next);
                readColumn(table.rows, next, table.capped);
              }}
            >
              {table.headers.map((head, i) => (
                <option key={`${head}-${i}`} value={i}>
                  {head === "" ? `${i + 1}` : head}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}

      <p className="relief__note" role="status">
        {flat ? reliefCopy.refusal.flat : note}
      </p>
      {!exportReady && <p className="bench-warning">{reliefCopy.stale}</p>}
    </div>
  );
}

/** The occupied-cell count for the "drawn" line, which the heightmap also reports. */
function countOccupied(events: readonly ReliefEvent[]): number {
  return new Set(events.map((e) => `${e.hour}:${e.week}`)).size;
}
