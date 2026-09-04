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
  return {
    where: "main",
    async parse(text) {
      const started = Date.now();
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
  const pending = new Map<
    number,
    { expected: FromWorker["type"]; resolve: (value: FromWorker) => void; reject: (reason: Error) => void }
  >();

  const onMessage = (event: MessageEvent<FromWorker>) => {
    if (event.data.id === undefined) return;
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.type === "failed") {
      request.reject(Object.assign(new Error(event.data.message), { kind: event.data.kind }));
    }
    else if (event.data.type === request.expected) request.resolve(event.data);
    else request.reject(new Error(`expected ${request.expected}, got ${event.data.type}`));
  };
  worker.addEventListener("message", onMessage);

  const send = <T extends FromWorker["type"]>(message: ToWorker, expected: T) =>
    new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, {
        expected,
        resolve: (value) => resolve(value as Extract<FromWorker, { type: T }>),
        reject,
      });
      worker.postMessage({ ...message, id });
    });

  return {
    where: "worker",
    parse: (text) => send({ type: "parse", text }, "parsed"),
    analyse: (request) => send(request, "analysed"),
    dispose: () => {
      worker.removeEventListener("message", onMessage);
      for (const request of pending.values()) request.reject(new Error("runner disposed"));
      pending.clear();
      worker.terminate();
    },
  };
}
