import { afterEach, expect, it, vi } from "vitest";
import { makeRunner } from "./run-client";

class BrokenWorker {
  static latest: BrokenWorker;
  listeners = new Map<string, Set<(event: unknown) => void>>();
  constructor() { BrokenWorker.latest = this; }
  addEventListener(type: string, callback: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }
  removeEventListener(type: string, callback: (event: unknown) => void) { this.listeners.get(type)?.delete(callback); }
  postMessage() {}
  terminate() {}
  fail() { for (const callback of this.listeners.get("error") ?? []) callback({ preventDefault() {} }); }
}
afterEach(() => vi.unstubAllGlobals());
it("rejects pending work on a worker crash and refuses subsequent requests promptly", async () => {
  vi.stubGlobal("Worker", BrokenWorker);
  const runner = makeRunner();
  const pending = runner.parse("customer,date\na,2026-01-01");
  BrokenWorker.latest.fail();
  await expect(pending).rejects.toThrow(/worker/i);
  await expect(runner.parse("again")).rejects.toThrow(/worker/i);
  runner.dispose();
});
it("refuses use after disposal", async () => {
  vi.stubGlobal("Worker", BrokenWorker);
  const runner = makeRunner();
  runner.dispose();
  await expect(runner.parse("again")).rejects.toThrow(/disposed/i);
});
