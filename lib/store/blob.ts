import { del, head, list, put } from "@vercel/blob";
import { StoreUnavailableError } from "./errors";

/**
 * Vercel Blob, with the token bound so no caller ever reads the environment.
 *
 * `@vercel/blob` reads `BLOB_READ_WRITE_TOKEN` from `process.env` on its own
 * when no token is passed, which is convenient and is exactly the behaviour
 * this file exists to remove: a caller that forgot the variable would get a
 * runtime error from inside the SDK, on the first write, in production,
 * rather than `StoreUnavailableError` naming the variable. `requireBlobToken`
 * is the guard, `getBlob` is the guard applied to every call.
 *
 * Store `fergus-portfolio-blob` is public (Task 1 of the F4 plan says why):
 * every pathname gets the SDK's random suffix, nothing enumerable is written,
 * and the things that go there (On the glass screenshots, filmstrips) are
 * meant to be linked to from a report. Nothing private is ever put here.
 */

export const BLOB_TOKEN_VAR = "BLOB_READ_WRITE_TOKEN";

export function requireBlobToken(): string {
  const token = process.env[BLOB_TOKEN_VAR];
  if (!token) throw new StoreUnavailableError("blob", BLOB_TOKEN_VAR);
  return token;
}

type PutBody = Parameters<typeof put>[1];
type PutOptions = NonNullable<Parameters<typeof put>[2]>;
type ListOptions = NonNullable<Parameters<typeof list>[0]>;

export type BlobStore = {
  put(pathname: string, body: PutBody, options: Omit<PutOptions, "token">): ReturnType<typeof put>;
  head(url: string): ReturnType<typeof head>;
  list(options?: Omit<ListOptions, "token">): ReturnType<typeof list>;
  del(urls: string | string[]): ReturnType<typeof del>;
};

export function getBlob(): BlobStore {
  const token = requireBlobToken();
  return {
    // `PutOptions` is a union in the SDK's types and `Omit` over a union keeps
    // only the shared keys, so the spread is widened back rather than typed
    // through. The test asserts the exact object that reaches the SDK.
    put: (pathname, body, options) => put(pathname, body, { ...options, token } as PutOptions),
    head: (url) => head(url, { token }),
    list: (options) => list({ ...options, token }),
    del: (urls) => del(urls, { token }),
  };
}
