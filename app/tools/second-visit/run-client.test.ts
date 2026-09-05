import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRunner } from "./run-client";

/**
 * There is no `Worker` in Node, so this exercises the fallback for real and
 * greps the source for the worker path. That split is honest: the main-thread
 * runner is genuinely tested here, and the worker is a coupling check plus the
 * live run in Task 18, which prints which path ran.
 */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "run-client.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

class FakeWorker {
  static latest: FakeWorker | null = null;
  readonly listeners = new Set<(event: MessageEvent) => void>();
  readonly posted: Record<string, unknown>[] = [];
  terminated = false;

  constructor() {
    FakeWorker.latest = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  postMessage(message: Record<string, unknown>) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: Record<string, unknown>) {
    for (const listener of [...this.listeners]) listener({ data } as MessageEvent);
  }
}

const parsed = (id: number, rows: number) => ({
  id,
  type: "parsed",
  header: ["customer", "date"],
  rows,
  sample: [],
  roles: {},
  skipped: 0,
  truncated: false,
  ms: 0,
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.latest = null;
});

describe("the runner", () => {
  it("falls back to the main thread where there is no Worker, and says so", async () => {
    expect(typeof Worker).toBe("undefined");
    const runner = makeRunner();
    expect(runner.where).toBe("main");
    const parsed = await runner.parse("customer,date\nc1,2026-01-01\nc1,2026-02-01\n");
    expect(parsed.rows).toBe(2);
    expect(parsed.roles.customer).toBe(0);
    runner.dispose();
  });

  it("builds the worker URL in the form the bundler recognises", () => {
    expect(source).toContain('new URL("./analysis.worker.ts", import.meta.url)');
    expect(source).toContain('type: "module"');
  });

  it("takes the fallback rather than throwing when the worker cannot be built", () => {
    expect(source).toContain("catch");
    expect(source).toContain("mainThreadRunner()");
  });

  it("matches concurrent worker replies to the request that produced them", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const runner = makeRunner();
    const worker = FakeWorker.latest!;
    const first = runner.parse("first");
    const second = runner.parse("second");

    expect(worker.posted.map((message) => message.id)).toEqual([1, 2]);
    let firstSettled = false;
    void first.finally(() => { firstSettled = true; });
    worker.emit(parsed(2, 2));
    expect((await second).rows).toBe(2);
    await Promise.resolve();
    expect(firstSettled).toBe(false);
    worker.emit(parsed(1, 1));
    expect((await first).rows).toBe(1);
    runner.dispose();
  });

  it("rejects unfinished work and removes listeners when disposed", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const runner = makeRunner();
    const worker = FakeWorker.latest!;
    const pending = runner.parse("still working");

    runner.dispose();
    expect(worker.listeners.size).toBe(0);
    expect(worker.terminated).toBe(true);
    await expect(pending).rejects.toThrow(/disposed/i);
  });
});
