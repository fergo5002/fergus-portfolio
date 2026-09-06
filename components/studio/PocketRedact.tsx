"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.PocketRedact;
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { redactCopy as c } from "@/content/studio/redact";
import { normaliseRect, type Rect } from "@/lib/lab/redact";
import {
  editMasks,
  undoMasks,
  redoMasks,
  moveMask,
  matchingBoxes,
  type MaskHistory,
} from "@/lib/studio/redaction";
import {
  readPdf,
  readImage,
  flatten,
  canvasBlob,
  rasterPdf,
  releasePages,
  type RedactPage,
} from "@/lib/studio/pdf";
import {
  Button,
  Field,
  FileInput,
  NumberField,
  ErrorMessage,
  download,
} from "@/components/lab/shared";
import { StudioIntro, Toggle, Range } from "./Furniture";
type Drag = {
  x: number;
  y: number;
  rect?: Rect;
  index?: number;
  resize?: boolean;
};
export default function PocketRedact() {
  const [pages, setPages] = useState<RedactPage[]>([]),
    [index, setIndex] = useState(0),
    [history, setHistory] = useState<MaskHistory>({
      past: [],
      present: [],
      future: [],
    }),
    [mode, setMode] = useState("draw"),
    [selected, setSelected] = useState(-1),
    [draft, setDraft] = useState<Rect | null>(null),
    [zoom, setZoom] = useState(100),
    [query, setQuery] = useState(""),
    [findMode, setFindMode] = useState("text"),
    [coords, setCoords] = useState([70, 290, 630, 45]),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [previews, setPreviews] = useState<RedactPage[]>([]),
    [reviewIndex, setReviewIndex] = useState(0),
    [reviewed, setReviewed] = useState<number[]>([]),
    [output, setOutput] = useState<Blob | null>(null),
    drag = useRef<Drag | null>(null),
    abort = useRef<AbortController | null>(null),
    pageRef = useRef(pages),
    previewRef = useRef(previews),
    mounted = useRef(true);
  pageRef.current = pages;
  previewRef.current = previews;
  const page = pages[index],
    rects = history.present[index] ?? [],
    candidates = useMemo(
      () => (page ? matchingBoxes(page.text, query, findMode) : []),
      [page, query, findMode],
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      releasePages(pageRef.current);
      releasePages(previewRef.current);
    };
  }, []);
  function clearOutput() {
    releasePages(previewRef.current);
    previewRef.current = [];
    setPreviews([]);
    setOutput(null);
    setReviewed([]);
  }
  function load(next: RedactPage[]) {
    releasePages(pageRef.current);
    clearOutput();
    pageRef.current = next;
    setPages(next);
    setIndex(0);
    setHistory({ past: [], present: next.map(() => []), future: [] });
    setSelected(-1);
    setQuery("");
    setDraft(null);
    drag.current = null;
    setZoom(100);
  }
  async function run(fn: (signal: AbortSignal) => Promise<void>) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setProgress("Preparing document…");
    try {
      await fn(controller.signal);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current && abort.current === controller) {
        setProgress("");
        abort.current = null;
      }
    }
  }
  function change(next: Rect[]) {
    setHistory((h) => editMasks(h, index, next));
    clearOutput();
  }
  function undo() {
    setHistory((h) => undoMasks(h));
    setSelected(-1);
    clearOutput();
  }
  function redo() {
    setHistory((h) => redoMasks(h));
    setSelected(-1);
    clearOutput();
  }
  function remove() {
    if (selected < 0) return;
    change(rects.filter((_, i) => i !== selected));
    setSelected(-1);
  }
  function position(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * page.width,
      y: ((e.clientY - r.top) / r.height) * page.height,
    };
  }
  function moved(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current,
      p = position(e);
    if (!d) return null;
    if (d.rect)
      return d.resize
        ? normaliseRect(
            d.rect.x,
            d.rect.y,
            Math.max(d.rect.x + 2, p.x),
            Math.max(d.rect.y + 2, p.y),
            page.width,
            page.height,
          )
        : moveMask(d.rect, p.x - d.x, p.y - d.y, page.width, page.height);
    return normaliseRect(d.x, d.y, p.x, p.y, page.width, page.height);
  }
  async function example() {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 900, 1160);
    ctx.fillStyle = "#171b18";
    ctx.font = "bold 38px monospace";
    ctx.fillText(c.sampleTitle, 70, 120);
    ctx.font = "22px monospace";
    const text = c.sample.map((line, i) => {
      const y = 230 + i * 80;
      ctx.fillText(line, 70, y);
      return {
        text: line,
        x: 67,
        y: y - 24,
        width: Math.ceil(ctx.measureText(line).width) + 6,
        height: 32,
      };
    });
    ctx.strokeStyle = "#bbb";
    ctx.strokeRect(50, 50, 800, 1060);
    const blob = await canvasBlob(canvas);
    if (!mounted.current) return;
    load([
      {
        url: URL.createObjectURL(blob),
        width: 900,
        height: 1160,
        pointsWidth: 600,
        pointsHeight: 773.333,
        text,
      },
    ]);
  }
  return (
    <div className="lab-work studio studio-redact">
      <StudioIntro eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div className="studio-drop">
        <div className="studio-toolbar">
          <FileInput
            label={c.upload}
            disabled={!!progress}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.avif,.bmp"
            onFile={(file) =>
              run(async (signal) => {
                if (file.size > 40_000_000)
                  throw new Error("File limit: 40 MB.");
                const next = file.name.toLowerCase().endsWith(".pdf")
                  ? await readPdf(
                      new Uint8Array(await file.arrayBuffer()),
                      setProgress,
                      signal,
                    )
                  : await readImage(file);
                if (signal.aborted || !mounted.current) {
                  releasePages(next);
                  return;
                }
                load(next);
              })
            }
          />
          <Button disabled={!!progress} onClick={() => run(example)}>
            {c.example}
          </Button>
        </div>
        <p>{c.limits}</p>
      </div>
      <ErrorMessage error={error} />
      {progress && (
        <div className="studio-toolbar" role="status">
          <span>{progress}</span>
          <Button onClick={() => abort.current?.abort()}>{ui.cancel}</Button>
        </div>
      )}
      {!page && <p className="studio-empty">{c.empty}</p>}
      {page && !previews.length && (
        <>
          <div className="studio-toolbar">
            <Toggle
              active={mode === "draw"}
              onClick={() => setMode("draw")}
              disabled={!!progress}
            >
              {c.draw}
            </Toggle>
            <Toggle
              active={mode === "select"}
              onClick={() => setMode("select")}
              disabled={!!progress}
            >
              {c.select}
            </Toggle>
            <Button
              disabled={!history.past.length || !!progress}
              onClick={undo}
            >
              {c.undo}
            </Button>
            <Button
              disabled={!history.future.length || !!progress}
              onClick={redo}
            >
              {c.redo}
            </Button>
            <Button disabled={selected < 0 || !!progress} onClick={remove}>
              {c.delete}
            </Button>
            <Range
              label={c.zoom}
              min={50}
              max={250}
              step={10}
              value={zoom}
              display={`${zoom}%`}
              onChange={setZoom}
            />
            <Button onClick={() => setZoom(100)}>{c.fit}</Button>
          </div>
          <p className="studio-note">{c.instruction}</p>
          <div className="redact-workspace">
            <nav className="redact-thumbnails" aria-label={ui.documentPages}>
              {pages.map((p, i) => (
                <button
                  key={i}
                  aria-label={`Page ${i + 1}, ${history.present[i].length} masks`}
                  aria-pressed={index === i}
                  disabled={!!progress}
                  onClick={() => {
                    setIndex(i);
                    setSelected(-1);
                    setDraft(null);
                    drag.current = null;
                  }}
                >
                  <div>
                    <img src={p.url} alt="" width={p.width} height={p.height} />
                    <svg viewBox={`0 0 ${p.width} ${p.height}`}>
                      {history.present[i].map((r, j) => (
                        <rect key={j} {...r} fill="black" />
                      ))}
                    </svg>
                  </div>
                  <span>
                    {i + 1} · {history.present[i].length}
                    {ui.masks}
                  </span>
                </button>
              ))}
            </nav>
            <div
              className="redact-viewport"
              tabIndex={0}
              aria-label={ui.redactionEditor}
              onKeyDown={(e) => {
                if (e.target instanceof HTMLInputElement) return;
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                  e.preventDefault();
                  if (!progress) e.shiftKey ? redo() : undo();
                } else if (!progress && selected >= 0) {
                  if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    remove();
                  } else if (e.key.startsWith("Arrow")) {
                    e.preventDefault();
                    const amount = e.shiftKey ? 10 : 1;
                    change(
                      rects.map((r, i) =>
                        i === selected
                          ? moveMask(
                              r,
                              e.key === "ArrowRight"
                                ? amount
                                : e.key === "ArrowLeft"
                                  ? -amount
                                  : 0,
                              e.key === "ArrowDown"
                                ? amount
                                : e.key === "ArrowUp"
                                  ? -amount
                                  : 0,
                              page.width,
                              page.height,
                            )
                          : r,
                      ),
                    );
                  }
                }
              }}
            >
              <div
                className="redact-paper"
                style={{
                  width: `${zoom}%`,
                  aspectRatio: `${page.width}/${page.height}`,
                }}
              >
                <img
                  src={page.url}
                  width={page.width}
                  height={page.height}
                  alt={`Original page ${index + 1}`}
                />
                <svg
                  viewBox={`0 0 ${page.width} ${page.height}`}
                  aria-label={ui.drawOrMoveRedactionMasks}
                  onPointerDown={(e) => {
                    if (progress) return;
                    e.currentTarget.parentElement?.parentElement?.focus({
                      preventScroll: true,
                    });
                    const p = position(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    if (mode === "select") {
                      let hit = -1;
                      for (let i = rects.length - 1; i >= 0; i--) {
                        const r = rects[i];
                        if (
                          p.x >= r.x - 8 &&
                          p.x <= r.x + r.width + 8 &&
                          p.y >= r.y - 8 &&
                          p.y <= r.y + r.height + 8
                        ) {
                          hit = i;
                          break;
                        }
                      }
                      setSelected(hit);
                      if (hit >= 0) {
                        const r = rects[hit];
                        drag.current = {
                          ...p,
                          rect: r,
                          index: hit,
                          resize:
                            Math.abs(p.x - r.x - r.width) < 18 &&
                            Math.abs(p.y - r.y - r.height) < 18,
                        };
                      }
                    } else {
                      setSelected(-1);
                      drag.current = p;
                    }
                    setDraft(null);
                  }}
                  onPointerMove={(e) => {
                    if (drag.current) setDraft(moved(e));
                  }}
                  onPointerUp={(e) => {
                    const d = drag.current,
                      r = moved(e);
                    drag.current = null;
                    setDraft(null);
                    if (r && r.width > 1 && r.height > 1) {
                      if (d?.index !== undefined) {
                        change(
                          rects.map((old, i) => (i === d.index ? r : old)),
                        );
                      } else {
                        change([...rects, r]);
                        setSelected(rects.length);
                      }
                    }
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDraft(null);
                  }}
                >
                  {candidates.map((r, i) => (
                    <rect
                      key={`candidate-${i}`}
                      {...r}
                      fill="#ffbf00"
                      fillOpacity=".25"
                      stroke="#bd8100"
                      strokeWidth="2"
                      pointerEvents="none"
                    />
                  ))}
                  {rects.map((r, i) => (
                    <g key={i}>
                      <rect
                        {...(draft && drag.current?.index === i ? draft : r)}
                        fill="#000"
                        stroke={i === selected ? "#ffb000" : "none"}
                        strokeWidth="3"
                      />
                      {i === selected && mode === "select" && (
                        <rect
                          x={r.x + r.width - 9}
                          y={r.y + r.height - 9}
                          width="18"
                          height="18"
                          fill="#ffb000"
                        />
                      )}
                    </g>
                  ))}
                  {draft && drag.current?.index === undefined && (
                    <rect
                      {...draft}
                      fill="#000"
                      opacity=".8"
                      stroke="#ffb000"
                      strokeWidth="2"
                    />
                  )}
                </svg>
              </div>
            </div>
            <aside className="redact-inspector">
              <h3>{c.search}</h3>
              <Field label={c.searchType}>
                <select
                  value={findMode}
                  onChange={(e) => setFindMode(e.target.value)}
                >
                  <option value="text">{ui.exactText}</option>
                  <option value="email">{ui.emailLikeText}</option>
                  <option value="phone">{ui.phoneLongNumbers}</option>
                </select>
              </Field>
              {findMode === "text" && (
                <Field label={c.search}>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </Field>
              )}
              <p>{page.text.length ? c.searchNote : c.noText}</p>
              <strong>
                {candidates.length} {c.suggestions.toLowerCase()}
              </strong>
              <div className="redact-candidates">
                {candidates.slice(0, 20).map((t, i) => (
                  <p key={i}>{t.text}</p>
                ))}
              </div>
              <Button
                disabled={!candidates.length || !!progress}
                onClick={() => {
                  change([...rects, ...candidates.map(({ text, ...r }) => r)]);
                  setQuery("");
                  setFindMode("text");
                }}
              >
                {c.apply}
              </Button>
              <details>
                <summary>{c.coords}</summary>
                {coords.map((n, i) => (
                  <NumberField
                    key={i}
                    label={c.fields[i]}
                    value={n}
                    min={0}
                    onChange={(v) =>
                      setCoords((old) => old.map((x, j) => (j === i ? v : x)))
                    }
                  />
                ))}
                <Button
                  disabled={!!progress}
                  onClick={() => {
                    const [x, y, w, h] = coords;
                    if (
                      coords.some((n) => !Number.isFinite(n) || n < 0) ||
                      w < 1 ||
                      h < 1 ||
                      x + w > page.width ||
                      y + h > page.height
                    ) {
                      setError("Rectangle must fit inside this page.");
                      return;
                    }
                    setError("");
                    change([...rects, { x, y, width: w, height: h }]);
                  }}
                >
                  {c.add}
                </Button>
              </details>
              <Button
                disabled={!rects.length || !!progress}
                onClick={() => {
                  change([]);
                  setSelected(-1);
                }}
              >
                {c.clear}
              </Button>
            </aside>
          </div>
          <div className="redact-export">
            <span>
              {history.present.flat().length}
              {ui.masksAcross}
              {pages.length}
              {ui.pages}
            </span>
            <Button
              primary
              disabled={!!progress}
              onClick={() =>
                run(async (signal) => {
                  const bytes = await rasterPdf(
                    pages,
                    history.present,
                    setProgress,
                    signal,
                  );
                  signal.throwIfAborted();
                  const next = await readPdf(
                    bytes.slice(),
                    setProgress,
                    signal,
                  );
                  if (!mounted.current || signal.aborted) {
                    releasePages(next);
                    return;
                  }
                  clearOutput();
                  previewRef.current = next;
                  setPreviews(next);
                  setOutput(new Blob([bytes], { type: "application/pdf" }));
                  setReviewIndex(0);
                })
              }
            >
              {c.export}
            </Button>
            <Button
              disabled={!!progress}
              onClick={() =>
                run(async (signal) => {
                  const canvas = await flatten(page, rects),
                    blob = await canvasBlob(canvas);
                  signal.throwIfAborted();
                  download("redacted-page.png", blob);
                  canvas.width = 0;
                })
              }
            >
              {c.png}
            </Button>
          </div>
        </>
      )}
      {previews.length > 0 && (
        <section className="redact-review">
          <StudioIntro
            eyebrow="EXPORT / PIXEL REVIEW"
            title={c.review}
            intro={c.reviewNote}
          />
          <div className="studio-toolbar">
            {previews.map((_, i) => (
              <Toggle
                key={i}
                active={reviewIndex === i}
                onClick={() => setReviewIndex(i)}
              >
                {ui.page}
                {i + 1}
                {reviewed.includes(i) ? " ✓" : ""}
              </Toggle>
            ))}
          </div>
          <img
            src={previews[reviewIndex].url}
            alt={`Reopened redacted page ${reviewIndex + 1}`}
            width={previews[reviewIndex].width}
            height={previews[reviewIndex].height}
          />
          <label className="lab-check">
            <input
              type="checkbox"
              checked={reviewed.includes(reviewIndex)}
              onChange={(e) =>
                setReviewed((r) =>
                  e.target.checked
                    ? [...r, reviewIndex]
                    : r.filter((i) => i !== reviewIndex),
                )
              }
            />
            {c.reviewed}
          </label>
          <div className="studio-toolbar">
            <Button onClick={clearOutput}>{c.back}</Button>
            <Button
              primary
              disabled={reviewed.length !== previews.length || !output}
              onClick={() =>
                output && download("redacted-document.pdf", output)
              }
            >
              {c.save} ({reviewed.length}/{previews.length})
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
