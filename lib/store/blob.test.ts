import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  put: vi.fn(async () => ({ url: "https://blob.example/a.png" })),
  head: vi.fn(async () => ({ size: 1 })),
  list: vi.fn(async () => ({ blobs: [], hasMore: false })),
  del: vi.fn(async () => undefined),
}));

vi.mock("@vercel/blob", () => spies);

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.set("BLOB_READ_WRITE_TOKEN", process.env.BLOB_READ_WRITE_TOKEN);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterEach(() => {
  const value = saved.get("BLOB_READ_WRITE_TOKEN");
  if (value === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = value;
});

/**
 * A fresh module instance, and the `StoreUnavailableError` class that instance
 * imported. `vi.resetModules()` re-evaluates `./errors` as well, so a class
 * imported at the top of this file would be a different identity from the one
 * the fresh module throws. See `redis.test.ts`.
 */
async function fresh() {
  vi.resetModules();
  const errors = await import("./errors");
  const blob = await import("./blob");
  return { ...blob, FreshError: errors.StoreUnavailableError };
}

describe("requireBlobToken", () => {
  it("throws the named error when the token is missing", async () => {
    const { requireBlobToken, FreshError } = await fresh();
    expect(() => requireBlobToken()).toThrow(FreshError);
    expect(() => requireBlobToken()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("returns the token when it is set", async () => {
    const { requireBlobToken } = await fresh();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(requireBlobToken()).toBe("vercel_blob_rw_test");
  });
});

describe("getBlob", () => {
  it("calls nothing at import time", async () => {
    await fresh();
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("refuses to build without the token", async () => {
    const { getBlob, FreshError } = await fresh();
    expect(() => getBlob()).toThrow(FreshError);
  });

  it("binds the token onto every call so no caller reads the environment", async () => {
    const { getBlob } = await fresh();
    process.env.BLOB_READ_WRITE_TOKEN = "tok";
    const blob = getBlob();

    await blob.put("reports/a.png", "bytes", { access: "public", contentType: "image/png" });
    expect(spies.put).toHaveBeenCalledWith("reports/a.png", "bytes", {
      access: "public",
      contentType: "image/png",
      token: "tok",
    });

    await blob.head("https://blob.example/a.png");
    expect(spies.head).toHaveBeenCalledWith("https://blob.example/a.png", { token: "tok" });

    await blob.list({ prefix: "reports/" });
    expect(spies.list).toHaveBeenCalledWith({ prefix: "reports/", token: "tok" });

    await blob.list();
    expect(spies.list).toHaveBeenLastCalledWith({ token: "tok" });

    await blob.del(["https://blob.example/a.png"]);
    expect(spies.del).toHaveBeenCalledWith(["https://blob.example/a.png"], { token: "tok" });
  });
});
