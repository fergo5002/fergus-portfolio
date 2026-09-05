import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: mocks.get, put: mocks.put, BlobNotFoundError: class extends Error {}, BlobPreconditionFailedError: class extends Error {} }));
import { blobRepository, boardSecret } from "./blob-board";
import { emptyLedger } from "./score-service";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ARCADE_READ_WRITE_TOKEN", "private-test-token"); });
it("uses the dedicated private token and an origin read, not the public tools store", async () => {
  mocks.get.mockResolvedValue(null); await blobRepository().read();
  expect(mocks.get).toHaveBeenCalledWith("arcade/v2/boards.json", expect.objectContaining({ token: "private-test-token", access: "private", useCache: false }));
});
it("passes the observed ETag for every update and refuses overwriting on creation", async () => {
  const repo = blobRepository(); await repo.write(emptyLedger(), '"observed-version"');
  expect(mocks.put).toHaveBeenCalledWith("arcade/v2/boards.json", expect.any(String), expect.objectContaining({ access: "private", ifMatch: '"observed-version"' }));
  await repo.write(emptyLedger(), null);
  expect(mocks.put).toHaveBeenLastCalledWith("arcade/v2/boards.json", expect.any(String), expect.objectContaining({ allowOverwrite: false }));
});
it("fails visibly when the arcade credential is absent, even if a public-store token exists", () => {
  vi.stubEnv("ARCADE_READ_WRITE_TOKEN", ""); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "wrong-store"); expect(() => boardSecret()).toThrow("offline");
});
