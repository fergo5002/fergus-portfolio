/**
 * The tool's background thread.
 *
 * A 50 MB export parsed on the main thread is a frozen tab, and the phone is
 * the product surface. So the file is read and modelled here, and the page gets
 * progress and a finished `Analysis`.
 *
 * Deliberately thin: everything it calls is a pure function from
 * `lib/tools/second-visit/`, tested in node with no worker anywhere near it.
 * The parsed bookings are kept in module state so moving a slider re-models
 * without re-reading a file that has not changed.
 *
 * Typed through `globalThis` rather than `self`, because the DOM lib types
 * `self` as a `Window` and this is not one.
 */
import { analyse, type AnalyseInput } from "@/lib/tools/second-visit/analyse";
import { parseCsv } from "@/lib/tools/second-visit/csv";
import { guessRoles, toBookings } from "@/lib/tools/second-visit/mapping";
import type { Booking, ColumnRoles, ModelParams } from "@/lib/tools/second-visit/types";

export type ToWorker =
  | { type: "parse"; text: string; id?: number }
  | { type: "analyse"; roles: ColumnRoles; asOfDay: number | null; venueTown: string | null; params: ModelParams; id?: number };

export type FromWorker =
  | { type: "parsed"; id?: number; header: string[]; rows: number; sample: string[][]; roles: ColumnRoles; skipped: number; truncated: boolean; ms: number }
  | { type: "analysed"; id?: number; analysis: ReturnType<typeof analyse>; used: number; ignored: number; ambiguousDates: boolean; ms: number }
  | { type: "failed"; id?: number; kind: string; message: string };

const scope = globalThis as unknown as {
  addEventListener(type: "message", handler: (event: { data: ToWorker }) => void): void;
  postMessage(message: FromWorker): void;
};

let sheet: ReturnType<typeof parseCsv> | null = null;

scope.addEventListener("message", (event) => {
  const started = Date.now();
  try {
    if (event.data.type === "parse") {
      sheet = parseCsv(event.data.text);
      scope.postMessage({
        type: "parsed",
        id: event.data.id,
        header: sheet.header,
        rows: sheet.rows.length,
        sample: sheet.rows.slice(0, 5),
        roles: guessRoles(sheet),
        skipped: sheet.skipped,
        truncated: sheet.truncated,
        ms: Date.now() - started,
      });
      return;
    }
    if (!sheet) throw new Error("no file read yet");
    const read = toBookings(sheet, event.data.roles);
    const input: AnalyseInput = {
      bookings: read.bookings as Booking[],
      asOfDay: event.data.asOfDay,
      venueTown: event.data.venueTown,
      params: event.data.params,
    };
    scope.postMessage({
      type: "analysed",
      id: event.data.id,
      analysis: analyse(input),
      used: read.used,
      ignored: read.ignored,
      ambiguousDates: read.ambiguousDates,
      ms: Date.now() - started,
    });
  } catch (cause) {
    const kind = cause && typeof cause === "object" && "kind" in cause ? String((cause as { kind: unknown }).kind) : "failed";
    scope.postMessage({ type: "failed", id: event.data.id, kind, message: cause instanceof Error ? cause.message : "unknown" });
  }
});
