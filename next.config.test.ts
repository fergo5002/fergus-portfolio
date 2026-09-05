import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";
describe("Next.js workspace root", () => {
  it("traces from the active checkout, including a Codex worktree", () => {
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
    expect(path.isAbsolute(nextConfig.outputFileTracingRoot ?? "")).toBe(true);
  });
});
