import type { Rect } from "@/lib/lab/redact";
import { normaliseRect } from "@/lib/lab/redact";
import type { TextBox } from "./redaction";
export type RedactPage = {
  url: string;
  width: number;
  height: number;
  pointsWidth: number;
  pointsHeight: number;
  text: TextBox[];
};
export const releasePages = (pages: RedactPage[]) =>
  pages.forEach((p) => URL.revokeObjectURL(p.url));
export async function imageFrom(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
export async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image."))),
      "image/png",
    ),
  );
}
export async function readPdf(
  bytes: Uint8Array,
  progress: (s: string) => void = () => {},
  signal?: AbortSignal,
): Promise<RedactPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
      stopAtErrors: true,
    }),
    pages: RedactPage[] = [];
  const abort = () => {
    void task.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("Document limit: 20 pages.");
    let total = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      signal?.throwIfAborted();
      progress(`Rendering page ${i} / ${pdf.numPages}…`);
      const page = await pdf.getPage(i),
        base = page.getViewport({ scale: 1 }),
        view = page.getViewport({ scale: 1.5 }),
        width = Math.ceil(view.width),
        height = Math.ceil(view.height);
      total += width * height;
      if (width * height > 12_000_000 || total > 64_000_000)
        throw new Error(
          "Rendering limit: 12 megapixels per page / 64 megapixels per document.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      await page.render({ canvas, viewport: view }).promise;
      const content = await page.getTextContent(),
        text: TextBox[] = [];
      for (const item of content.items)
        if ("str" in item && item.str.trim()) {
          const m = pdfjs.Util.transform(view.transform, item.transform),
            heightText = Math.hypot(m[2], m[3]),
            angle = Math.atan2(m[1], m[0]),
            w = item.width * view.scale,
            h = Math.max(2, heightText),
            ascent = (content.styles[item.fontName]?.ascent ?? 0.85) * h;
          const corners = [
            [0, -ascent],
            [w, -ascent],
            [0, h - ascent],
            [w, h - ascent],
          ].map(([x, y]) => ({
            x: m[4] + x * Math.cos(angle) - y * Math.sin(angle),
            y: m[5] + x * Math.sin(angle) + y * Math.cos(angle),
          }));
          const rect = normaliseRect(
            Math.min(...corners.map((c) => c.x)) - 3,
            Math.min(...corners.map((c) => c.y)) - 3,
            Math.max(...corners.map((c) => c.x)) + 3,
            Math.max(...corners.map((c) => c.y)) + 3,
            width,
            height,
          );
          text.push({ ...rect, text: item.str });
        }
      const blob = await canvasBlob(canvas);
      signal?.throwIfAborted();
      pages.push({
        url: URL.createObjectURL(blob),
        width,
        height,
        pointsWidth: base.width,
        pointsHeight: base.height,
        text,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return pages;
  } catch (e) {
    releasePages(pages);
    throw e;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}
export async function readImage(file: File): Promise<RedactPage[]> {
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/avif",
      "image/bmp",
    ].includes(file.type)
  )
    throw new Error("Choose a PDF, PNG, JPEG, WebP, AVIF or BMP.");
  const url = URL.createObjectURL(file);
  try {
    const img = await imageFrom(url);
    if (img.width * img.height > 12_000_000)
      throw new Error("Image limit: 12 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await canvasBlob(canvas);
    canvas.width = 0;
    return [
      {
        url: URL.createObjectURL(blob),
        width: img.width,
        height: img.height,
        pointsWidth: img.width * 0.75,
        pointsHeight: img.height * 0.75,
        text: [],
      },
    ];
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function flatten(page: RedactPage, rects: Rect[]) {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.drawImage(await imageFrom(page.url), 0, 0);
  ctx.fillStyle = "#000";
  for (const r of rects)
    ctx.fillRect(
      Math.floor(r.x),
      Math.floor(r.y),
      Math.ceil(r.x + r.width) - Math.floor(r.x),
      Math.ceil(r.y + r.height) - Math.floor(r.y),
    );
  return canvas;
}
export async function rasterPdf(
  pages: RedactPage[],
  masks: Rect[][],
  progress: (s: string) => void,
  signal: AbortSignal,
) {
  const { PDFDocument } = await import("pdf-lib"),
    doc = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    signal.throwIfAborted();
    progress(`Flattening page ${i + 1} / ${pages.length}…`);
    const p = pages[i],
      canvas = await flatten(p, masks[i]),
      png = await doc.embedPng(await (await canvasBlob(canvas)).arrayBuffer()),
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
  doc.setProducer("Pocket Redact");
  doc.setCreator("Pocket Redact");
  return new Uint8Array(await doc.save());
}
