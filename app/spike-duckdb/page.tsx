"use client";

import { useState } from "react";
import { makeBookings, toCsv, ROWS, SEED } from "@/lib/tools/second-visit/synth.mjs";
import { DUCKDB_SETUP, retentionSql } from "@/lib/tools/second-visit/retention-sql.mjs";

/**
 * S3 spike page. Loads DuckDB-WASM in a worker on demand, builds the
 * synthetic table, ports the hearth functions as macros, runs the retention
 * query, and reports timings, transfer sizes and memory. On localhost it
 * also posts the rows to /api/spike-duckdb so the compare script can read them.
 *
 * Spike code. Never merges. Deliberately unstyled.
 */

type Out = Record<string, string | number>;

export default function SpikeDuckdbPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (s: string) => setLines((prev) => [...prev, `${new Date().toISOString()} ${s}`]);

  async function run() {
    setBusy(true);
    try {
      const tImport = performance.now();
      const duckdb = await import("@duckdb/duckdb-wasm");
      say(`js import ms=${Math.round(performance.now() - tImport)}`);

      // Spike change (2026-09-03): a per-click query string so repeated measurements
      // are cold fetches. DevTools' cache flag set through CDP on the page did not
      // cover the worker's own fetch of the .wasm, which then came from HTTP cache.
      const v = `?v=${Date.now()}`;
      const bundle = await duckdb.selectBundle({
        mvp: { mainModule: `/spike-duckdb/duckdb-mvp.wasm${v}`, mainWorker: `/spike-duckdb/duckdb-browser-mvp.worker.js${v}` },
        eh: { mainModule: `/spike-duckdb/duckdb-eh.wasm${v}`, mainWorker: `/spike-duckdb/duckdb-browser-eh.worker.js${v}` },
      });
      say(`bundle=${bundle.mainModule}`);

      const tLoad = performance.now();
      const worker = new Worker(bundle.mainWorker!);
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const loadMs = Math.round(performance.now() - tLoad);
      say(`wasm load+instantiate ms=${loadMs}`);

      for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        if (!e.name.includes("/spike-duckdb/")) continue;
        say(`resource ${e.name.split("/").pop()} transfer=${e.transferSize} encoded=${e.encodedBodySize} decoded=${e.decodedBodySize} ms=${Math.round(e.duration)}`);
      }

      const conn = await db.connect();
      const tGen = performance.now();
      const rows = makeBookings(SEED, ROWS);
      const csv = toCsv(rows);
      say(`generate rows=${rows.length} csvBytes=${csv.length} ms=${Math.round(performance.now() - tGen)}`);

      const tLoadTable = performance.now();
      await db.registerFileText("bookings.csv", csv);
      await conn.query(`
        create table bookings as
        select * from read_csv('bookings.csv', header = true, columns = {
          'customer_id': 'INTEGER', 'visit_date': 'DATE', 'amount_cents': 'INTEGER',
          'party_size': 'INTEGER', 'distance_prior': 'DOUBLE', 'season_factor': 'DOUBLE'
        })`);
      say(`table load ms=${Math.round(performance.now() - tLoadTable)}`);

      const tMacros = performance.now();
      for (const stmt of DUCKDB_SETUP.split(";").map((s) => s.trim()).filter(Boolean)) {
        await conn.query(stmt);
      }
      say(`macros created ms=${Math.round(performance.now() - tMacros)}`);

      const sql = retentionSql("duckdb");
      const tQuery = performance.now();
      const table = await conn.query(sql);
      const queryMs = Math.round(performance.now() - tQuery);
      const out: Out[] = table.toArray().map((r) => r.toJSON() as Out);
      const checksum = out.reduce((a, r) => a + Number(r.expected_gap_days), 0);
      say(`query rows=${out.length} ms=${queryMs} sum(expected_gap_days)=${checksum.toFixed(6)}`);

      const mem = await conn.query("select sum(memory_usage_bytes)::bigint as bytes from duckdb_memory()");
      say(`duckdb memory bytes=${String(mem.toArray()[0]?.toJSON().bytes)}`);
      say("now read Chrome Task Manager (Shift+Esc), this tab's Memory footprint, and write it in the record");

      if (location.hostname === "localhost") {
        const res = await fetch("/api/spike-duckdb", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ engine: "duckdb-wasm", queryMs, loadMs, rows: out }),
        });
        say(`posted to /api/spike-duckdb status=${res.status}`);
      }
      await conn.close();
    } catch (error) {
      say(`FAILED ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>S3 spike: DuckDB in the tab</h1>
      <button type="button" onClick={run} disabled={busy}>load engine and run</button>
      <pre>{lines.join("\n")}</pre>
    </main>
  );
}
