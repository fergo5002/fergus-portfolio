import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/arcade/blob-board", () => ({
  blobRepository: () => ({ read: async () => ({ ledger: null, version: null }) }),
  boardNamespace: () => "preview",
  boardSecret: () => "test-only",
}));
import { GET } from "./route";
describe("leaderboard responses", () => {
  it("cannot serve an old board after a successful score post", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).boards).toHaveLength(6);
  });
});
