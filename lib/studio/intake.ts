import { ATLAS_LIMITS as L, canonicalPath, type AtlasFile } from "./graph";
const textExtensions = new Set(
  "txt md markdown mdx rst log csv tsv json jsonl ndjson yaml yml toml ini env conf config ts tsx js jsx mjs cjs py rb rs go java c h cpp hpp cs swift kt sh bash ps1 sql css scss sass less html htm xml svg tex bib r vue svelte astro dockerfile gitignore ipynb".split(
    " ",
  ),
);
export const extension = (path: string) => path.split(".").pop()!.toLowerCase();
export const isText = (path: string) =>
  textExtensions.has(extension(path)) ||
  /^(readme|license|dockerfile|makefile)$/i.test(path.split("/").pop()!);
function xmlText(raw: string) {
  const doc = new DOMParser().parseFromString(raw, "text/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Invalid XML in document.");
  return doc.documentElement.textContent ?? "";
}
export async function unpackZip(
  bytes: Uint8Array,
  max = 80_000_000,
): Promise<{ path: string; bytes: Uint8Array }[]> {
  const { unzip } = await import("fflate");
  let total = 0,
    entries = 0,
    rejected = false;
  const result = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(
        bytes,
        {
          filter: (f) => {
            entries++;
            total += f.originalSize;
            if (entries > L.files || total > max) rejected = true;
            return !rejected && !f.name.endsWith("/");
          },
        },
        (error, files) =>
          error
            ? reject(new Error("Could not open this ZIP."))
            : resolve(files),
      ),
  );
  if (rejected)
    throw new Error(
      `Archive limit: ${L.files} entries / ${max / 1e6} MB expanded. Choose a smaller archive.`,
    );
  return Object.entries(result).map(([path, bytes]) => ({
    path: canonicalPath(path),
    bytes,
  }));
}
export async function extractFile(
  path: string,
  bytes: Uint8Array,
): Promise<AtlasFile> {
  path = canonicalPath(path);
  const ext = extension(path),
    base: AtlasFile = {
      path,
      size: bytes.byteLength,
      text: "",
      kind: ext || "file",
      status: "metadata",
    };
  try {
    if (isText(path)) {
      let text = new TextDecoder().decode(bytes.subarray(0, L.text * 4));
      if (text.includes("\0"))
        return { ...base, note: "Binary content in a text extension." };
      // HTML is inspected as source text. Never create a document that could
      // load uploaded markup's external images, frames or scripts.
      return {
        ...base,
        text: text.slice(0, L.text),
        status: "read",
        note:
          text.length > L.text || bytes.length > L.text * 4
            ? "Text truncated to 150,000 characters."
            : undefined,
      };
    }
    if (ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({
        data: bytes.slice(),
        useSystemFonts: true,
        stopAtErrors: true,
      });
      try {
        const pdf = await task.promise;
        let text = "";
        let pages = 0;
        for (
          let p = 1;
          p <= Math.min(pdf.numPages, 60) && text.length < L.text;
          p++
        ) {
          const page = await pdf.getPage(p),
            content = await page.getTextContent();
          text +=
            `\n[Page ${p}]\n` +
            content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
          page.cleanup();
          pages++;
        }
        const readable = text.replace(/\[Page \d+\]/g, "").trim().length > 0;
        return {
          ...base,
          text: text.slice(0, L.text),
          status: readable ? "read" : "metadata",
          note: !readable
            ? "No extractable text. This may be a scanned PDF."
            : pages < pdf.numPages || text.length > L.text
              ? "PDF excerpt limited to 60 pages / 150,000 characters."
              : undefined,
        };
      } finally {
        await task.destroy();
      }
    }
    if (["docx", "pptx", "xlsx", "odt", "ods", "odp", "epub"].includes(ext)) {
      const files = await unpackZip(bytes, 30_000_000),
        decoder = new TextDecoder();
      const relevant = files.filter(
        (f) =>
          /^(word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml|content\.xml)$/.test(
            f.path,
          ) ||
          (ext === "epub" && /\.(xhtml|html|htm)$/.test(f.path)),
      );
      let text = "";
      for (const f of relevant) {
        const raw = decoder.decode(f.bytes);
        text +=
          `\n[${f.path}]\n` +
          xmlText(
            raw.replace(/<\/(?:w:p|a:p|row|text:p|p|h[1-6])>/g, "$&\n"),
          ).trim();
        if (text.length > L.text) break;
      }
      return {
        ...base,
        text: text.slice(0, L.text),
        status: text.trim() ? "read" : "metadata",
        note:
          ext === "xlsx"
            ? "Raw sheet values and shared strings; formulas, layout and cell relationships are not reconstructed."
            : text.length > L.text
              ? "Text truncated to 150,000 characters."
              : "Text extraction only; layout and embedded media are not indexed.",
      };
    }
    return {
      ...base,
      kind: /^(png|jpe?g|gif|webp|avif|bmp)$/.test(ext)
        ? "image"
        : /^(mp3|wav|ogg|m4a|flac)$/.test(ext)
          ? "audio"
          : /^(mp4|webm|mov)$/.test(ext)
            ? "video"
            : base.kind,
      note: "Metadata only. This format has no text extractor here.",
    };
  } catch (error) {
    return {
      ...base,
      note: `Could not extract text: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
export async function importFiles(
  files: File[],
  progress: (s: string) => void,
  signal: AbortSignal,
  onMedia?: (path: string, blob: Blob, kind: string) => void,
) {
  if (files.length > L.files || files.reduce((n, f) => n + f.size, 0) > L.bytes)
    throw new Error("Import limit: 1,000 files / 80 MB.");
  const entries: { path: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extension(file.name) === "zip")
      entries.push(...(await unpackZip(bytes)));
    else entries.push({ path: file.webkitRelativePath || file.name, bytes });
  }
  if (
    entries.length > L.files ||
    entries.reduce((n, f) => n + f.bytes.length, 0) > L.bytes
  )
    throw new Error("Expanded import limit: 1,000 files / 80 MB.");
  const result: AtlasFile[] = [];
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    signal.throwIfAborted();
    progress(`Reading ${i + 1} / ${entries.length}: ${entries[i].path}`);
    const f = await extractFile(entries[i].path, entries[i].bytes);
    if (total + f.text.length > L.totalText) {
      f.text = "";
      f.status = "metadata";
      f.note = "The 10 MB extracted-text budget was reached.";
    }
    total += f.text.length;
    result.push(f);
    if (["image", "audio", "video"].includes(f.kind) && onMedia) {
      const mime = (
        {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          avif: "image/avif",
          bmp: "image/bmp",
          wav: "audio/wav",
          mp3: "audio/mpeg",
          ogg: "audio/ogg",
          m4a: "audio/mp4",
          flac: "audio/flac",
          mp4: "video/mp4",
          webm: "video/webm",
          mov: "video/quicktime",
        } as Record<string, string>
      )[extension(f.path)];
      if (mime)
        onMedia(
          f.path,
          new Blob([new Uint8Array(entries[i].bytes)], { type: mime }),
          f.kind,
        );
    }
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return result;
}
async function boundedResponse(response: Response, max: number) {
  if (!response.ok)
    throw new Error(
      `GitHub returned ${response.status}. Try a public repository or upload its ZIP.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max)
        throw new Error("GitHub response exceeds the import limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
export async function importGithub(
  input: string,
  progress: (s: string) => void,
  signal: AbortSignal,
) {
  const match = input
    .trim()
    .match(/^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)\/?$/);
  if (!match)
    throw new Error("Use github.com/owner/repository (repository root only).");
  const [, owner, repo] = match,
    headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    };
  const get = async (url: string) =>
    JSON.parse(
      new TextDecoder().decode(
        await boundedResponse(
          await fetch(url, {
            headers,
            signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          }),
          7_000_000,
        ),
      ),
    );
  progress("Reading public repository tree…");
  const info = await get(`https://api.github.com/repos/${owner}/${repo}`),
    tree = await get(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`,
    );
  if (tree.truncated)
    throw new Error(
      "GitHub truncated this tree. Upload a smaller folder or ZIP to avoid an incomplete map.",
    );
  const rows = (
    tree.tree as { path: string; type: string; size?: number }[]
  ).filter((r) => r.type === "blob");
  if (rows.length > L.files)
    throw new Error(
      "Repository exceeds 1,000 files. Download and select a smaller folder.",
    );
  let read = 0,
    total = 0;
  const result: AtlasFile[] = [];
  for (const row of rows) {
    signal.throwIfAborted();
    progress(`Reading ${result.length + 1} / ${rows.length}: ${row.path}`);
    if (
      isText(row.path) &&
      read < 100 &&
      (row.size ?? 0) < 500_000 &&
      total + (row.size ?? 0) <= 8_000_000
    ) {
      read++;
      try {
        const bytes = await boundedResponse(
          await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(info.default_branch)}/${row.path.split("/").map(encodeURIComponent).join("/")}`,
            { signal, credentials: "omit", referrerPolicy: "no-referrer" },
          ),
          Math.min(500_000, 8_000_000 - total),
        );
        total += bytes.length;
        result.push(await extractFile(row.path, bytes));
      } catch (error) {
        signal.throwIfAborted();
        result.push({
          path: row.path,
          text: "",
          size: row.size ?? 0,
          kind: extension(row.path),
          status: "metadata",
          note:
            error instanceof Error ? error.message : "Could not fetch file.",
        });
      }
    } else
      result.push({
        path: row.path,
        text: "",
        size: row.size ?? 0,
        kind: extension(row.path),
        status: "metadata",
        note: "GitHub preview reads up to 100 text files / 8 MB. Upload this file for text extraction.",
      });
  }
  return result;
}
export async function droppedFiles(
  items: DataTransferItemList,
): Promise<File[]> {
  const result: File[] = [];
  let visited = 0;
  async function visit(entry: FileSystemEntry) {
    if (++visited > 3000 || entry.fullPath.split("/").length > 80)
      throw new Error(
        "Folder traversal limit reached. Choose a smaller folder.",
      );
    if (result.length >= L.files) throw new Error("Folder limit: 1,000 files.");
    if (entry.isFile) {
      const f = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      Object.defineProperty(f, "webkitRelativePath", {
        value: entry.fullPath.replace(/^\//, ""),
      });
      result.push(f);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await visit(child);
      }
    }
  }
  // Capture handles synchronously before the drag data store is closed by the browser.
  const captured = [...items].map((item) => ({
    entry: item.webkitGetAsEntry?.(),
    file: item.getAsFile(),
  }));
  for (const { entry, file } of captured) {
    if (entry) await visit(entry);
    else if (file) result.push(file);
  }
  return result;
}
