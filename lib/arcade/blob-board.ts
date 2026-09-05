import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { ScoreError, type BoardRepository, type Ledger } from "./score-service";

/**
 * Dedicated personal Vercel private Blob store; one small document. Conditional
 * writes protect concurrent scores. No in-process persistence fallback.
 * API reference checked 2026-09-05: https://vercel.com/docs/vercel-blob/using-blob-sdk
 * Private origin reads bypass CDN propagation; public Blob's useCache:false does
 * not do that (caught by the real-store test). Only the API exposes board rows.
 */
const PATH = "arcade/v2/boards.json";
export function boardNamespace() { return process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "development"; }
export function boardSecret() { const secret = process.env.ARCADE_READ_WRITE_TOKEN; if (!secret) throw new ScoreError("The board is offline. Your game still works.", 503); return secret; }
export function blobRepository(): BoardRepository {
  const token = boardSecret();
  return {
    async read() {
      try {
        const result = await get(PATH, { access: "private", token, useCache: false, abortSignal: AbortSignal.timeout(5000) });
        if (!result) return { ledger: null, version: null };
        if (result.statusCode !== 200 || result.blob.size > 100_000) throw new Error("Invalid board document");
        const ledger: Ledger = await new Response(result.stream).json();
        if (ledger.version !== 2 || !ledger.boards || !Array.isArray(ledger.receipts) || ledger.receipts.length > 100 || !Number.isSafeInteger(ledger.dayCount) || !Number.isSafeInteger(ledger.monthCount)) throw new Error("Invalid board document");
        return { ledger, version: result.blob.etag };
      } catch (error) { if (error instanceof BlobNotFoundError) return { ledger: null, version: null }; throw error; }
    },
    async write(ledger, expectedVersion) {
      try {
        await put(PATH, JSON.stringify(ledger), { token, access: "private", addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60, ...(expectedVersion ? { ifMatch: expectedVersion } : { allowOverwrite: false }), abortSignal: AbortSignal.timeout(5000) });
        return true;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || error instanceof Error && /already exists/i.test(error.message)) return false;
        throw error;
      }
    },
  };
}
