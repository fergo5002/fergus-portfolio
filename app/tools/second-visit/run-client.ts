"use client";

import { analyse } from "@/lib/tools/second-visit/analyse";
import { parseCsv } from "@/lib/tools/second-visit/csv";
import { guessRoles, toBookings } from "@/lib/tools/second-visit/mapping";
import type { Booking } from "@/lib/tools/second-visit/types";
import type { FromWorker, ToWorker } from "./analysis.worker";

/**
 * One interface, two places the work can happen.
 *
 * A Web Worker if the browser has one and the bundler produced it, and the same
 * pure functions on the main thread if not. Both paths are written and both are
 * real: the fallback is not a stub, it is the identical call sequence without
 * the thread. `where` says which one ran, and the page prints it, because "it
 * is in a worker" is a claim and this is how it is checked rather than assumed.
 *
 * The worker URL is built with `new URL(..., import.meta.url)`, which is the
 * form Next's bundler recognises. If it throws, or `Worker` is undefined, the
 * main-thread runner takes over and the page still works, more slowly, on a big
 * file.
 */

export type Runner = {
  where: "worker" | "main";
  parse(text: string): Promise<Extract<FromWorker, { type: "parsed" }>>;
  analyse(request: Extract<ToWorker, { type: "analyse" }>): Promise<Extract<FromWorker, { type: "analysed" }>>;
  dispose(): void;
};

function mainThreadRunner(): Runner {
  let sheet: ReturnType<typeof parseCsv> | null = null;
  let disposed = false;
  return {
    where: "main",
    async parse(text) {
      if (disposed) throw new Error("runner disposed");
      const started = Date.now();
      sheet = null;
      sheet = parseCsv(text);
      return {
        type: "parsed",
        header: sheet.header,
        rows: sheet.rows.length,
        sample: sheet.rows.slice(0, 5),
        roles: guessRoles(sheet),
        skipped: sheet.skipped,
        truncated: sheet.truncated,
        ms: Date.now() - started,
      };
    },
    async analyse(request) {
      if (disposed) throw new Error("runner disposed");
      const started = Date.now();
      if (!sheet) throw new Error("no file read yet");
      const read = toBookings(sheet, request.roles);
      return {
        type: "analysed",
        analysis: analyse({
          bookings: read.bookings as Booking[],
          asOfDay: request.asOfDay,
          venueTown: request.venueTown,
          params: request.params,
        }),
        used: read.used,
        ignored: read.ignored,
        ambiguousDates: read.ambiguousDates,
        ms: Date.now() - started,
      };
    },
    dispose() {
      disposed = true;
      sheet = null;
    },
  };
}

export function makeRunner(): Runner {
  if (typeof Worker === "undefined") return mainThreadRunner();
  let worker: Worker;
  try {
    worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return mainThreadRunner();
  }

  let nextId = 0;
  let stopped: Error | null = null;
  const pending = new Map<
    number,
    { expected: FromWorker["type"]; resolve: (value: FromWorker) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  const onMessage = (event: MessageEvent<FromWorker>) => {
    if (event.data.id === undefined) return;
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    clearTimeout(request.timer);
    if (event.data.type === "failed") {
      request.reject(Object.assign(new Error(event.data.message), { kind: event.data.kind }));
    }
    else if (event.data.type === request.expected) request.resolve(event.data);
    else request.reject(new Error(`expected ${request.expected}, got ${event.data.type}`));
  };
  worker.addEventListener("message", onMessage);

  const stop = (error: Error) => {
    stopped = error;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
    worker.terminate();
  };
  const onError = (event: Event) => {
    event.preventDefault();
    stop(new Error("analysis worker failed; reload to retry"));
  };
  worker.addEventListener("error", onError);
  worker.addEventListener("messageerror", onError);

  const send = <T extends FromWorker["type"]>(message: ToWorker, expected: T) =>
    new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
      if (stopped) { reject(stopped); return; }
      const id = ++nextId;
      pending.set(id, {
        expected,
        resolve: (value) => resolve(value as Extract<FromWorker, { type: T }>),
        reject,
        timer: setTimeout(() => stop(new Error("analysis worker timed out; reload to retry")), 60_000),
      });
      try { worker.postMessage({ ...message, id }); }
      catch { stop(new Error("analysis worker could not receive the file")); }
    });

  return {
    where: "worker",
    parse: (text) => send({ type: "parse", text }, "parsed"),
    analyse: (request) => send(request, "analysed"),
    dispose: () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      stop(new Error("runner disposed"));
    },
  };
}
