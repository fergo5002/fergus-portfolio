"use client";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { DropSlot, ExportBar, useIntake } from "@/components/instrument";
import { download } from "@/components/lab/shared";
import { redactCopy as c } from "@/content/studio/redact";
import { normaliseRect, type Rect } from "@/lib/lab/redact";
import {
  candidateAt,
  centredMask,
  editMasks,
  hitMask,
  matchingBoxes,
  moveMask,
  pendingCandidates,
  redoMasks,
  resizeMask,
  undoMasks,
  type MaskHistory,
} from "@/lib/studio/redaction";
import {
  pageBlob,
  rasterPdf,
  readImage,
  readPdf,
  readPixels,
  releasePages,
  type RedactPage,
} from "@/lib/studio/pdf";
import { EXAMPLE_PAGE, EXAMPLE_SRC, exampleMask, exampleSheet } from "@/lib/studio/redact-example";
import { canDownload, scanProgress, scanReveal, verifyPage, type PageVerdict } from "@/lib/studio/redact-verify";
import { ZOOM, nextZoom, redactKey } from "@/lib/studio/redact-keys";
import { Lens, Palette, type Mode } from "./redact/Palette";
import { FindLine, type Find } from "./redact/FindLine";

/**
 * Pocket Redact.
 *
 * The document is the stage. The example invoice is open, large and already
 * masked in the server's HTML (its image is an SVG built from one layout, see
 * `lib/studio/redact-example.ts`), and you draw straight onto it. The tools
 * float on the desk's edge; find is a command line under the page that lights
 * its candidates on the page itself.
 *
 * Building the clean copy is the signature, and it is real work, not theatre:
 *
 *   burn    `rasterPdf` draws every page into pixels, paints each mask in as
 *           solid black and writes a PDF of nothing but those images, while
 *           the masks flare on the page (CSS, no-preference only).
 *   proof   `readPdf` reopens those exact bytes, `verifyPage` reads the
 *           reopened pixels under every mask and the reopened text layer, and
 *           the page on the desk becomes the reopened page. A scan line
 *           sweeps it, off the one frame clock by timestamp, only on screen,
 *           revealing each mask's verdict as it passes. The verdicts exist
 *           before the line moves; the line only shows them.
 *
 * The download is those bytes, behind `canDownload`: every page passed and
 * every page inspected by the visitor, because a machine can check the masks
 * but only a person can check what was left uncovered.
 *
 * Nothing here is stored and nothing leaves the tab. No control renders until
 * hydration can answer it (`ready`); the page does, so the first paint is the
 * document.
 */

const SHEET = exampleSheet();
const examplePage = (): RedactPage => ({
  url: EXAMPLE_SRC,
  width: EXAMPLE_PAGE.width,
  height: EXAMPLE_PAGE.height,
  pointsWidth: EXAMPLE_PAGE.pointsWidth,
  pointsHeight: EXAMPLE_PAGE.pointsHeight,
  text: SHEET.text,
  example: true,
});

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.avif,.bmp";
const MAX_BYTES = 40_000_000;
/** One mask's flare, as long as `redact-burn` in tool.css. */
const FLARE_MS = 900;
/** Masks catch top to bottom, this far apart, the sixth and later together. */
const STAGGER_MS = 60;
const STAGGER_CAP = 5;
/** One sweep of the scan line down the reopened page. */
const SCAN_MS = 1400;
/** A starved or absent frame clock still finishes the sweep. */
const SCAN_FAILSAFE_MS = SCAN_MS + 1600;
/** Page pixels a pointer may miss a mask by and still take it. */
const SLOP = 8;
/** Page pixels from a selected mask's corner that resize rather than move it. */
const HANDLE = 18;
/** Screen pixels under which a press and release is a tap, not a drag. */
const TAP = 5;

type Stage = "edit" | "burn" | "proof";
type Drag = { x: number; y: number; cx: number; cy: number; rect?: Rect; index?: number; resize?: boolean };
type Draft = { rect: Rect; index?: number };
type Proof = { pages: RedactPage[]; verdicts: PageVerdict[]; file: Blob };

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);
const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const strip = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height });
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (window.clearTimeout(id), reject(signal.reason)), { once: true });
  });
/** A tick at a mask's right end, in page units: the scan's mark for a solid mask. */
const tick = (r: Rect) => {
  const s = Math.min(14, r.height * 0.45),
    x = r.x + r.width + 10,
    y = r.y + r.height / 2;
  return `M${x} ${y}l${s * 0.4} ${s * 0.45}l${s * 0.9} -${s}`;
};

export default function PocketRedact() {
  const { onFrame, reducedMotion, audio, scrollTo } = useSystem();
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<RedactPage[]>(() => [examplePage()]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<MaskHistory>(() => ({
    past: [],
    present: [[exampleMask(SHEET)]],
    future: [],
  }));
  const [mode, setMode] = useState<Mode>("draw");
  const [selected, setSelected] = useState(-1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM.fit);
  const [query, setQuery] = useState("");
  const [find, setFind] = useState<Find>("text");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [stage, setStage] = useState<Stage>("edit");
  const [proof, setProof] = useState<Proof | null>(null);
  const [proofIndex, setProofIndex] = useState(0);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [scanned, setScanned] = useState<number[]>([]);
  const drag = useRef<Drag | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pagesRef = useRef(pages);
  const proofRef = useRef(proof);
  const mounted = useRef(true);
  const deskRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const marks = useRef<(SVGGElement | null)[]>([]);
  pagesRef.current = pages;
  proofRef.current = proof;

  useEffect(() => setReady(true), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      releasePages(pagesRef.current);
      if (proofRef.current) releasePages(proofRef.current.pages);
    };
  }, []);

  const page = pages[index];
  const rects = useMemo(() => history.present[index] ?? [], [history, index]);
  const found = useMemo(() => (page ? matchingBoxes(page.text, query, find) : []), [page, query, find]);
  const lit = useMemo(() => pendingCandidates(found, rects), [found, rects]);
  const busy = !!progress;
  const editing = stage === "edit" && !busy;
  const shown = proof?.pages[proofIndex];
  const verdict = proof?.verdicts[proofIndex];
  const scanning = stage === "proof" && !!proof && !scanned.includes(proofIndex);
  const total = history.present.reduce((n, p) => n + p.length, 0);
  /** Each mask's flare delay: top to bottom, so the burn runs down the page. */
  const delay = useMemo(() => {
    const out: number[] = [];
    rects
      .map((r, i) => [r.y, i])
      .sort((a, b) => a[0] - b[0])
      .forEach(([, i], n) => (out[i] = Math.min(n, STAGGER_CAP) * STAGGER_MS));
    return out;
  }, [rects]);

  /* ── history and masks ─────────────────────────────────────────────── */

  function change(next: Rect[]) {
    setHistory((h) => editMasks(h, index, next));
  }
  function undo() {
    setHistory(undoMasks);
    setSelected(-1);
  }
  function redo() {
    setHistory(redoMasks);
    setSelected(-1);
  }
  function remove() {
    if (selected < 0) return;
    change(rects.filter((_, i) => i !== selected));
    setSelected(-1);
  }
  function cover(boxes: Rect[]) {
    if (boxes.length) change([...rects, ...boxes.map(strip)]);
  }
  function goTo(i: number) {
    setIndex(i);
    setSelected(-1);
    setDraft(null);
    drag.current = null;
  }

  /* ── loading ───────────────────────────────────────────────────────── */

  function dropProof() {
    if (proofRef.current) releasePages(proofRef.current.pages);
    proofRef.current = null;
    setProof(null);
    setProofIndex(0);
    setReviewed([]);
    setScanned([]);
  }
  function load(next: RedactPage[], masks: Rect[][] = next.map(() => [])) {
    releasePages(pagesRef.current);
    dropProof();
    pagesRef.current = next;
    setPages(next);
    setHistory({ past: [], present: masks, future: [] });
    goTo(0);
    setQuery("");
    setZoom(ZOOM.fit);
    setStage("edit");
  }
  async function run(fn: (signal: AbortSignal) => Promise<void>, line: string) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setProgress(line);
    try {
      await fn(controller.signal);
    } catch (e) {
      if (!mounted.current) return;
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      setStage((s) => (s === "burn" ? "edit" : s));
    } finally {
      if (mounted.current && abort.current === controller) {
        setProgress("");
        abort.current = null;
      }
    }
  }
  const intake = useIntake({
    accept: ACCEPT,
    maxBytes: MAX_BYTES,
    disabled: busy || stage !== "edit",
    onFiles: ([file]) =>
      void run(async (signal) => {
        const next = file.name.toLowerCase().endsWith(".pdf")
          ? await readPdf(new Uint8Array(await file.arrayBuffer()), setProgress, signal)
          : await readImage(file);
        if (signal.aborted || !mounted.current) {
          releasePages(next);
          return;
        }
        load(next);
      }, c.opening),
  });
  function openExample() {
    abort.current?.abort();
    setError("");
    load([examplePage()], [[exampleMask(SHEET)]]);
  }

  /* ── the burn and the proof ────────────────────────────────────────── */

  async function build() {
    // Build sits under the page, so the page may be above the visitor: bring
    // it back, so the burn, the scan and the reading happen where they look.
    const desk = deskRef.current;
    if (desk && desk.getBoundingClientRect().top < 0) scrollTo(desk);
    await run(async (signal) => {
      setStage("burn");
      setSelected(-1);
      audio.relay();
      const started = performance.now();
      const source = pagesRef.current,
        masks = history.present;
      const bytes = await rasterPdf(source, masks, setProgress, signal);
      signal.throwIfAborted();
      setProgress(c.reopening);
      const reopened = await readPdf(bytes.slice(), setProgress, signal);
      try {
        if (reopened.length !== source.length) throw new Error(c.failed);
        const verdicts: PageVerdict[] = [];
        for (let i = 0; i < reopened.length; i++) {
          signal.throwIfAborted();
          verdicts.push(
            verifyPage({
              pixels: await readPixels(reopened[i]),
              masks: masks[i] ?? [],
              source: source[i],
              textBefore: source[i].text.length,
              textAfter: reopened[i].text.length,
            }),
          );
        }
        // Let the last flare finish before the page turns into its proof.
        const flare = FLARE_MS + Math.max(0, ...delay);
        const hold = reducedMotion ? 0 : flare - (performance.now() - started);
        if (hold > 0) await wait(hold, signal);
        if (!mounted.current) throw signal.reason;
        dropProof();
        const next = { pages: reopened, verdicts, file: new Blob([bytes], { type: "application/pdf" }) };
        proofRef.current = next;
        setProof(next);
        setStage("proof");
      } catch (e) {
        releasePages(reopened);
        throw e;
      }
    }, c.burning);
  }
  function backToEditing() {
    dropProof();
    setStage("edit");
  }
  async function savePng() {
    const p = proof?.pages[proofIndex],
      n = proofIndex + 1;
    if (!p) return;
    try {
      download(`redacted-page-${n}.png`, await pageBlob(p));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }

  /* The scan: once per reopened page, off the one frame clock, by the
     frame's own timestamp (the clock clamps its delta at 64ms, and a starved
     tab would stretch a delta-timed sweep for ever), subscribed only once the
     page is on screen, and not at all under reduced motion or in a hidden
     tab. It writes a CSS variable and toggles each verdict's attribute; it
     never sets state per frame. */
  useEffect(() => {
    if (!scanning || !proof) return;
    const paper = paperRef.current;
    const done = () => setScanned((s) => (s.includes(proofIndex) ? s : [...s, proofIndex]));
    if (reducedMotion || document.visibilityState !== "visible") {
      done();
      return;
    }
    if (!paper) return;
    const masks = proof.verdicts[proofIndex].masks.map((m) => m.rect),
      height = pagesRef.current[proofIndex]?.height ?? 1;
    let start = -1,
      failsafe = 0,
      stop: (() => void) | null = null;
    const finish = () => {
      stop?.();
      stop = null;
      window.clearTimeout(failsafe);
      done();
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (stop || !entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        failsafe = window.setTimeout(finish, SCAN_FAILSAFE_MS);
        stop = onFrame((time) => {
          if (start < 0) start = time;
          const t = scanProgress(start, time, SCAN_MS);
          paper.style.setProperty("--scan", t.toFixed(4));
          scanReveal(masks, t, height).forEach((on, i) => marks.current[i]?.toggleAttribute("data-passed", on));
          if (t >= 1) finish();
        });
      },
      { threshold: 0.15 },
    );
    seen.observe(paper);
    return () => {
      seen.disconnect();
      stop?.();
      window.clearTimeout(failsafe);
    };
  }, [scanning, proof, proofIndex, reducedMotion, onFrame]);

  /* ── pointer and keys ──────────────────────────────────────────────── */

  function position(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * page.width,
      y: ((e.clientY - r.top) / r.height) * page.height,
    };
  }
  function moved(e: PointerEvent<SVGSVGElement>): Rect | null {
    const d = drag.current;
    if (!d) return null;
    const p = position(e);
    if (d.rect)
      return d.resize
        ? normaliseRect(d.rect.x, d.rect.y, Math.max(d.rect.x + 2, p.x), Math.max(d.rect.y + 2, p.y), page.width, page.height)
        : moveMask(d.rect, Math.round(p.x - d.x), Math.round(p.y - d.y), page.width, page.height);
    return normaliseRect(d.x, d.y, p.x, p.y, page.width, page.height);
  }
  function onDown(e: PointerEvent<SVGSVGElement>) {
    if (!editing || e.button > 0) return;
    sheetRef.current?.focus({ preventScroll: true });
    const p = position(e),
      at = { ...p, cx: e.clientX, cy: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(null);
    if (mode === "select") {
      const hit = hitMask(rects, p.x, p.y, SLOP);
      setSelected(hit);
      if (hit < 0) {
        drag.current = at;
        return;
      }
      const r = rects[hit];
      drag.current = {
        ...at,
        rect: r,
        index: hit,
        resize: Math.abs(p.x - r.x - r.width) < HANDLE && Math.abs(p.y - r.y - r.height) < HANDLE,
      };
      return;
    }
    setSelected(-1);
    drag.current = at;
  }
  function onMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || (mode === "select" && d.index === undefined)) return;
    const r = moved(e);
    if (r) setDraft({ rect: r, index: d.index });
  }
  function onUp(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const r = moved(e);
    drag.current = null;
    setDraft(null);
    if (d.index !== undefined && d.rect) {
      if (r && !same(r, d.rect)) change(rects.map((old, i) => (i === d.index ? r : old)));
      return;
    }
    if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < TAP) {
      // A tap on a lit box covers that box alone.
      const p = position(e),
        hit = candidateAt(lit, p.x, p.y);
      if (hit >= 0) cover([lit[hit]]);
      return;
    }
    if (mode === "draw" && r && r.width > 1 && r.height > 1) {
      change([...rects, r]);
      setSelected(rects.length);
    }
  }
  function onCancel() {
    drag.current = null;
    setDraft(null);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isField(event.target)) return;
    if (!editing) return;
    const intent = redactKey(event, selected >= 0);
    if (!intent) return;
    event.preventDefault();
    const edit = (fn: (r: Rect) => Rect) => change(rects.map((r, i) => (i === selected ? fn(r) : r)));
    switch (intent.kind) {
      case "undo":
        return undo();
      case "redo":
        return redo();
      case "delete":
        return remove();
      case "mode":
        return setMode(intent.mode);
      case "new":
        change([...rects, centredMask(page.width, page.height)]);
        setSelected(rects.length);
        return setMode("select");
      case "move":
        return edit((r) => moveMask(r, intent.dx, intent.dy, page.width, page.height));
      case "resize":
        return edit((r) => resizeMask(r, intent.dw, intent.dh, page.width, page.height));
      case "zoom":
        return setZoom((z) => nextZoom(z, intent.step));
      case "fit":
        return setZoom(ZOOM.fit);
    }
  }

  /* ── the stage ─────────────────────────────────────────────────────── */

  const view = stage === "proof" && shown ? shown : page;
  const paperStyle = {
    "--aspect": (view.width / view.height).toFixed(5),
    "--zoom": (zoom / 100).toFixed(2),
  } as CSSProperties;
  /** The page the proof's masks were drawn on, which sets the verdicts' coordinates. */
  const drawn = pages[proofIndex] ?? page;
  const inspected = new Set(reviewed.filter((i) => proof && i < proof.pages.length)).size;
  const failed = !!proof && proof.verdicts.some((v) => !v.ok);
  const thumbs = stage === "proof" && proof ? proof.pages : pages;

  return (
    <div className="lab-work studio redact" data-stage={stage} onKeyDown={onKeyDown} {...intake.stageProps}>
      <div className="redact__desk" ref={deskRef}>
        <div
          className="redact__sheet"
          ref={sheetRef}
          role="group"
          tabIndex={0}
          aria-label={c.editor}
          aria-describedby="redact-help"
        >
          <div className="redact__scroll" data-lenis-prevent={zoom > ZOOM.fit ? "" : undefined}>
            <div className="redact__paper" ref={paperRef} style={paperStyle}>
              {stage === "proof" && shown ? (
                <img
                  className="redact__proof"
                  key={shown.url}
                  src={shown.url}
                  width={shown.width}
                  height={shown.height}
                  alt={c.proofAlt(proofIndex + 1)}
                  draggable={false}
                />
              ) : (
                <img
                  className="redact__page"
                  src={page.url}
                  width={page.width}
                  height={page.height}
                  alt={page.example ? c.example : c.pageAlt(index + 1)}
                  draggable={false}
                />
              )}
              {stage === "proof" && verdict ? (
                <svg
                  className="redact__verdicts"
                  viewBox={`0 0 ${drawn.width} ${drawn.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  {verdict.masks.map((m, i) => (
                    <g
                      key={`${proofIndex}-${i}`}
                      ref={(el) => {
                        marks.current[i] = el;
                      }}
                      className="redact__verdict"
                      data-solid={m.solid || undefined}
                      data-passed={scanning ? undefined : ""}
                    >
                      <rect x={m.rect.x} y={m.rect.y} width={m.rect.width} height={m.rect.height} />
                      {m.solid ? <path d={tick(m.rect)} /> : null}
                    </g>
                  ))}
                </svg>
              ) : (
                <svg
                  className="redact__marks"
                  viewBox={`0 0 ${page.width} ${page.height}`}
                  preserveAspectRatio="none"
                  data-mode={mode}
                  aria-hidden="true"
                  focusable="false"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancel}
                >
                  {stage === "edit"
                    ? lit.map((r, i) => (
                        <rect key={`lit-${i}`} className="redact__candidate" x={r.x} y={r.y} width={r.width} height={r.height} />
                      ))
                    : null}
                  {rects.map((r, i) => {
                    const box = draft && draft.index === i ? draft.rect : r;
                    return (
                      <rect
                        key={i}
                        className="redact__mask"
                        data-selected={i === selected || undefined}
                        style={{ "--delay": `${delay[i] ?? 0}ms` } as CSSProperties}
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                      />
                    );
                  })}
                  {selected >= 0 && mode === "select" && stage === "edit" && rects[selected] ? (
                    <rect
                      className="redact__handle"
                      x={(draft?.index === selected ? draft.rect : rects[selected]).x + (draft?.index === selected ? draft.rect : rects[selected]).width - HANDLE / 2}
                      y={(draft?.index === selected ? draft.rect : rects[selected]).y + (draft?.index === selected ? draft.rect : rects[selected]).height - HANDLE / 2}
                      width={HANDLE}
                      height={HANDLE}
                    />
                  ) : null}
                  {draft && draft.index === undefined ? (
                    <rect className="redact__draft" x={draft.rect.x} y={draft.rect.y} width={draft.rect.width} height={draft.rect.height} />
                  ) : null}
                </svg>
              )}
              {scanning ? <div className="redact__scan" aria-hidden="true" /> : null}
            </div>
          </div>
        </div>
        <p id="redact-help" className="inst-hidden">
          {c.editorHelp}
        </p>

        {stage === "proof" && verdict ? (
          <output className="redact__reading" data-ok={(!scanning && verdict.ok) || undefined} data-bad={(!scanning && !verdict.ok) || undefined}>
            {(scanning
              ? c.scanning
              : c.reading({
                  masks: verdict.masks.length,
                  solid: verdict.masks.filter((m) => m.solid).length,
                  before: verdict.textBefore,
                  after: verdict.textAfter,
                })
            )
              .split(" · ")
              .map((part, i) => (
                <Fragment key={i}>
                  {i ? <span aria-hidden="true"> · </span> : null}
                  <span>{part}</span>
                </Fragment>
              ))}
          </output>
        ) : (
          <>
            {ready && <Palette
              mode={mode}
              onMode={setMode}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              canDelete={selected >= 0}
              onUndo={undo}
              onRedo={redo}
              onDelete={remove}
              disabled={!editing}
            />}
            {ready && <Lens zoom={zoom} onZoom={setZoom} disabled={!editing} />}
          </>
        )}

        {ready && thumbs.length > 1 ? (
          <nav className="redact__pages" aria-label={c.pages}>
            {stage === "proof" && proof
              ? proof.pages.map((p, i) => (
                  <button
                    key={p.url}
                    type="button"
                    className="redact__thumb"
                    aria-label={c.page(i + 1)}
                    aria-pressed={proofIndex === i}
                    data-reviewed={reviewed.includes(i) || undefined}
                    data-bad={!proof.verdicts[i].ok || undefined}
                    disabled={busy}
                    onClick={() => setProofIndex(i)}
                  >
                    <img className="redact__thumb-page" src={p.url} alt="" width={p.width} height={p.height} />
                  </button>
                ))
              : pages.map((p, i) => (
                  <button
                    key={`${p.url}-${i}`}
                    type="button"
                    className="redact__thumb"
                    aria-label={c.pageMasks(i + 1, history.present[i].length)}
                    aria-pressed={index === i}
                    disabled={!editing}
                    onClick={() => goTo(i)}
                  >
                    <img className="redact__thumb-page" src={p.url} alt="" width={p.width} height={p.height} />
                    <svg className="redact__thumb-marks" viewBox={`0 0 ${p.width} ${p.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      {history.present[i].map((r, j) => (
                        <rect key={j} x={r.x} y={r.y} width={r.width} height={r.height} />
                      ))}
                    </svg>
                  </button>
                ))}
          </nav>
        ) : null}

        {ready && stage !== "proof" && (
          <FindLine
            id="redact-find"
            mode={find}
            onMode={setFind}
            query={query}
            onQuery={setQuery}
            lit={lit.length}
            onCover={() => cover(lit)}
            hasText={page.text.length > 0}
            disabled={!editing}
          />
        )}
        {stage === "proof" ? <p className="redact__note">{c.proofNote}</p> : null}
      </div>

      {busy ? (
        <div className="redact__status" role="status">
          <span>{progress}</span>
          <button type="button" className="redact__btn" onClick={() => abort.current?.abort()}>
            {c.cancel}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="redact__error" role="alert">
          {error}
        </p>
      ) : null}
      {failed ? (
        <p className="redact__error" role="alert">
          {c.failed}
        </p>
      ) : null}

      {ready && stage !== "proof" && (
        <div className="redact__deck">
          <DropSlot intake={intake} id="redact-file" label={c.upload} className="redact__intake">
            <button type="button" className="redact__btn redact__btn--quiet" disabled={busy} onClick={openExample}>
              {c.example}
            </button>
          </DropSlot>
          <div className="redact__go">
            <output className="redact__count">{c.masks(total)}</output>
            <button type="button" className="redact__btn redact__btn--go" disabled={!editing} onClick={() => void build()}>
              {c.build}
            </button>
          </div>
        </div>
      )}
      {ready && stage === "proof" && proof && verdict && (
        <div className="redact__deck redact__deck--proof">
          <label className="redact__inspected">
            <input
              type="checkbox"
              className="redact__check"
              checked={reviewed.includes(proofIndex)}
              disabled={busy}
              onChange={(e) =>
                setReviewed((r) => (e.target.checked ? [...r, proofIndex] : r.filter((i) => i !== proofIndex)))
              }
            />
            <span>{c.inspected}</span>
          </label>
          <div className="redact__go">
            <button type="button" className="redact__btn" disabled={busy} onClick={backToEditing}>
              {c.back}
            </button>
            <ExportBar
              className="redact__exports"
              label={c.exports}
              actions={[
                {
                  label: c.save(inspected, proof.pages.length),
                  kind: "pdf",
                  primary: true,
                  disabled: !canDownload(proof.verdicts, reviewed) || busy,
                  onClick: () => download("redacted-document.pdf", proof.file),
                },
                {
                  label: c.png,
                  kind: "png",
                  disabled: !verdict.ok || !reviewed.includes(proofIndex) || busy,
                  onClick: () => void savePng(),
                },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
