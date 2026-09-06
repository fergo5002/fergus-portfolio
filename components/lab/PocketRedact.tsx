"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { copy, common } from "@/content/lab/copy";
import { normaliseRect, type Rect } from "@/lib/lab/redact";
import {
  Button,
  Field,
  FileInput,
  NumberField,
  ErrorMessage,
  useAction,
  download,
} from "./shared";
const c = copy.redact;
type Page = {
  url: string;
  width: number;
  height: number;
  pointsWidth: number;
  pointsHeight: number;
  rects: Rect[];
};
async function imageFrom(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
async function renderPdf(bytes: Uint8Array): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    stopAtErrors: true,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 8)
      throw new Error("This MVP supports PDFs with at most 8 pages.");
    const pages: Page[] = [];
    let pixels = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        base = page.getViewport({ scale: 1 }),
        view = page.getViewport({ scale: 1.5 }),
        width = Math.ceil(view.width),
        height = Math.ceil(view.height);
      pixels += width * height;
      if (width * height > 12_000_000 || pixels > 32_000_000)
        throw new Error(
          "Document exceeds the 12 megapixel page / 32 megapixel document limit.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      await page.render({ canvas, viewport: view }).promise;
      pages.push({
        url: canvas.toDataURL("image/png"),
        width,
        height,
        pointsWidth: base.width,
        pointsHeight: base.height,
        rects: [],
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
async function flattened(page: Page) {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.drawImage(await imageFrom(page.url), 0, 0);
  ctx.fillStyle = "#000";
  page.rects.forEach((r) => ctx.fillRect(r.x, r.y, r.width, r.height));
  return canvas;
}
function samplePage(): Page {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 900, 1160);
  ctx.fillStyle = "#111";
  ctx.font = "bold 38px monospace";
  ctx.fillText(c.sampleTitle, 70, 120);
  ctx.font = "23px monospace";
  c.sampleBody.forEach((line, i) => ctx.fillText(line, 70, 230 + i * 80));
  ctx.strokeStyle = "#bbb";
  ctx.strokeRect(50, 50, 800, 1060);
  return {
    url: canvas.toDataURL("image/png"),
    width: 900,
    height: 1160,
    pointsWidth: 600,
    pointsHeight: 773.333,
    rects: [],
  };
}
export default function PocketRedact() {
  const [pages, setPages] = useState<Page[]>([]),
    [index, setIndex] = useState(0),
    [draft, setDraft] = useState<Rect | null>(null),
    [coords, setCoords] = useState([70, 290, 630, 45]),
    [previews, setPreviews] = useState<Page[]>([]),
    [exportUrl, setExportUrl] = useState(""),
    drag = useRef<{ x: number; y: number } | null>(null),
    { act, error, busy, setError } = useAction(),
    page = pages[index];
  useEffect(
    () => () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    },
    [exportUrl],
  );
  function load(next: Page[]) {
    setPages(next);
    setIndex(0);
    setPreviews([]);
    setExportUrl("");
    setDraft(null);
    drag.current = null;
  }
  async function read(file: File) {
    if (file.size > 15_000_000) throw new Error("File limit: 15 MB.");
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      load(await renderPdf(new Uint8Array(await file.arrayBuffer())));
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type))
      throw new Error("Use a PDF, PNG or JPEG.");
    const url = URL.createObjectURL(file);
    try {
      const img = await imageFrom(url);
      if (img.width * img.height > 12_000_000)
        throw new Error("Image limit: 12 megapixels.");
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      load([
        {
          url: canvas.toDataURL("image/png"),
          width: img.width,
          height: img.height,
          pointsWidth: img.width * 0.75,
          pointsHeight: img.height * 0.75,
          rects: [],
        },
      ]);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function changeRects(rects: Rect[]) {
    setPages(pages.map((p, i) => (i === index ? { ...p, rects } : p)));
    setPreviews([]);
    setExportUrl("");
  }
  function position(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * page.width,
      y: ((e.clientY - r.top) / r.height) * page.height,
    };
  }
  function add(r: Rect) {
    if (r.width > 0 && r.height > 0) changeRects([...page.rects, r]);
  }
  async function exportPdf() {
    const { PDFDocument } = await import("pdf-lib"),
      doc = await PDFDocument.create();
    for (const p of pages) {
      const canvas = await flattened(p),
        png = await doc.embedPng(canvas.toDataURL("image/png")),
        out = doc.addPage([p.pointsWidth, p.pointsHeight]);
      out.drawImage(png, {
        x: 0,
        y: 0,
        width: p.pointsWidth,
        height: p.pointsHeight,
      });
      canvas.width = 0;
      canvas.height = 0;
    }
    const bytes = await doc.save(),
      blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const reopened = await renderPdf(new Uint8Array(bytes));
    setPreviews(reopened);
    setExportUrl(URL.createObjectURL(blob));
    download("redacted-document.pdf", blob);
  }
  return (
    <div className="lab-work">
      <FileInput
        disabled={busy}
        label={c.upload}
        accept=".pdf,.png,.jpg,.jpeg"
        onFile={(file) => act(() => read(file))}
      />
      <div className="lab-actions">
        <Button
          primary
          disabled={busy}
          onClick={() => act(() => load([samplePage()]))}
        >
          {common.example}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {busy && <p role="status">{c.busy}</p>}
      {page && (
        <>
          <p>{c.instruction}</p>
          <Field label={c.page}>
            <select
              value={index}
              disabled={busy}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setDraft(null);
              }}
            >
              {pages.map((_, i) => (
                <option key={i} value={i}>
                  {i + 1} / {pages.length}
                </option>
              ))}
            </select>
          </Field>
          <div
            className="lab-paper"
            style={{ aspectRatio: `${page.width}/${page.height}` }}
          >
            <img
              src={page.url}
              width={page.width}
              height={page.height}
              alt={`${c.page} ${index + 1}`}
            />
            <svg
              viewBox={`0 0 ${page.width} ${page.height}`}
              aria-label={c.instruction}
              onPointerDown={(e) => {
                if (busy) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = position(e);
                setDraft(null);
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const p = position(e);
                setDraft(
                  normaliseRect(
                    drag.current.x,
                    drag.current.y,
                    p.x,
                    p.y,
                    page.width,
                    page.height,
                  ),
                );
              }}
              onPointerUp={(e) => {
                if (!drag.current) return;
                const p = position(e);
                add(
                  normaliseRect(
                    drag.current.x,
                    drag.current.y,
                    p.x,
                    p.y,
                    page.width,
                    page.height,
                  ),
                );
                drag.current = null;
                setDraft(null);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDraft(null);
              }}
            >
              {page.rects.map((r, i) => (
                <rect key={i} {...r} fill="black" />
              ))}
              {draft && (
                <rect
                  {...draft}
                  fill="black"
                  opacity=".7"
                  stroke="#ffb000"
                  strokeWidth="3"
                />
              )}
            </svg>
          </div>
          <p className="lab-note">
            {page.width} × {page.height} px · {c.marks}: {page.rects.length}
          </p>
          <section className="lab-panel">
            <h3>{c.rect}</h3>
            <div className="lab-fields">
              {coords.map((v, i) => (
                <NumberField
                  key={i}
                  label={c.fields[i]}
                  value={v}
                  min={0}
                  onChange={(n) =>
                    setCoords(coords.map((x, j) => (i === j ? n : x)))
                  }
                />
              ))}
            </div>
            <div className="lab-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  act(() => {
                    const [x, y, width, height] = coords;
                    if (
                      coords.some((n) => !Number.isFinite(n) || n < 0) ||
                      width <= 0 ||
                      height <= 0 ||
                      x + width > page.width ||
                      y + height > page.height
                    )
                      throw new Error(c.bounds);
                    add(
                      normaliseRect(
                        x,
                        y,
                        x + width,
                        y + height,
                        page.width,
                        page.height,
                      ),
                    );
                  })
                }
              >
                {c.add}
              </Button>
              <Button
                disabled={busy || !page.rects.length}
                onClick={() => changeRects(page.rects.slice(0, -1))}
              >
                {c.undo}
              </Button>
              <Button
                disabled={busy || !page.rects.length}
                onClick={() => changeRects([])}
              >
                {c.clear}
              </Button>
            </div>
          </section>
          <div className="lab-actions">
            <Button primary disabled={busy} onClick={() => act(exportPdf)}>
              {c.pdf}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const canvas = await flattened(page);
                  const blob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                      (b) =>
                        b
                          ? resolve(b)
                          : reject(new Error("PNG export failed.")),
                      "image/png",
                    ),
                  );
                  download("redacted-page.png", blob);
                })
              }
            >
              {c.png}
            </Button>
          </div>
        </>
      )}
      {previews.length > 0 && (
        <section className="lab-panel">
          <h2>{c.review}</h2>
          <p className="lab-note">{c.reviewNote}</p>
          <div className="lab-redacted-preview">
            {previews.map((p, i) => (
              <img
                key={i}
                src={p.url}
                width={p.width}
                height={p.height}
                alt={`${c.review} ${i + 1}`}
              />
            ))}
          </div>
          <div className="lab-actions">
            <a href={exportUrl} target="_blank" rel="noreferrer">
              {c.open}
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
