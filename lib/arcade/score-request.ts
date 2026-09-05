import { ScoreError } from "./score-service";
/** Bound before JSON parsing, including callers that omit Content-Length. */
export async function scoreRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ScoreError("Use the arcade on this site to post scores.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ScoreError("Use the arcade on this site to post scores.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ScoreError("Send a JSON score.", 415);
  if (Number(request.headers.get("content-length")) > 2048) throw new ScoreError("The score request is too large.", 413);
  if (!request.body) throw new ScoreError("The score is missing.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2048) { await reader.cancel(); throw new ScoreError("The score request is too large.", 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ScoreError("The score is invalid."); }
}
export function scoreFailure(error: unknown) {
  return Response.json({ available: false, boards: [], reason: error instanceof ScoreError ? error.message : "The board is offline. Your score is here; try again." }, { status: error instanceof ScoreError ? error.status : 503, headers: { "cache-control": "no-store" } });
}
