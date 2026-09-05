"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { localOverlapCopy as copy } from "@/content/tool-workbench";
import { compareLists, connectionsCsv, MAX_LOCAL_BYTES, readLocalList } from "@/lib/tools/overlap/local";
import { demoLists } from "@/lib/tools/overlap/demo";
import type { Entry } from "@/lib/tools/overlap/types";

const PeerTool = dynamic(() => import("./OverlapTool"));
type List = { name: string; entries: Entry[]; skipped: number };
type View = "shared" | "onlyA" | "onlyB";

export default function OverlapWorkbench({ roomsAvailable = false }: { roomsAvailable?: boolean }) {
  const [peer, setPeer] = useState(false);
  const [lists, setLists] = useState<[List | null, List | null]>([null, null]);
  const [example, setExample] = useState(false);
  const [view, setView] = useState<View>("shared");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [reading, setReading] = useState<[boolean, boolean]>([false, false]);
  const [fileKey, setFileKey] = useState(0);
  const versions = useRef([0, 0]);
  const result = useMemo(() => lists[0] && lists[1] ? compareLists(lists[0].entries, lists[1].entries) : null, [lists]);
  const filtered = useMemo(() => (result?.[view] ?? []).filter(e => `${e.label} ${e.slug}`.toLowerCase().includes(query.trim().toLowerCase())), [result, view, query]);

  async function read(file: File | undefined, side: 0 | 1) {
    if (!file) return;
    const version = ++versions.current[side];
    setExample(false);
    setNote("");
    setLists(current => { const next: [List | null, List | null] = [...current]; next[side] = null; return next; });
    if (file.size > MAX_LOCAL_BYTES) { setNote(copy.tooLarge); return; }
    setReading(current => { const next: [boolean, boolean] = [...current]; next[side] = true; return next; });
    try {
      const text = await file.text();
      if (versions.current[side] !== version) return;
      const { entries, counts } = readLocalList(text);
      setLists(current => { const next: [List | null, List | null] = [...current]; next[side] = { name: file.name, entries, skipped: counts.rows - counts.used }; return next; });
    } catch (error) {
      if (versions.current[side] === version) setNote(error instanceof Error && error.message === "too-large" ? copy.tooLarge : copy.failed);
    } finally {
      if (versions.current[side] === version) setReading(current => { const next: [boolean, boolean] = [...current]; next[side] = false; return next; });
    }
  }

  function clear() {
    versions.current = versions.current.map(v => v + 1);
    setLists([null, null]); setReading([false, false]); setExample(false); setNote(""); setQuery(""); setView("shared"); setFileKey(k => k + 1);
  }

  function demo() {
    clear();
    const pair = demoLists();
    setLists([{ name: copy.first, entries: pair.a, skipped: 0 }, { name: copy.second, entries: pair.b, skipped: 0 }]);
    setExample(true);
  }

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([connectionsCsv(filtered)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = `overlap-${view}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNote(copy.exportFailed); }
  }

  return <div className="overlap-workbench">
    <div className="bench-actions" role="group" aria-label={copy.local}>
      <button className="bench-button" type="button" aria-pressed={!peer} onClick={() => setPeer(false)}>{copy.local}</button>
      <button className="bench-button" type="button" aria-pressed={peer} onClick={() => setPeer(true)}>{copy.peer}</button>
    </div>
    {peer ? <PeerTool roomsAvailable={roomsAvailable} /> : <>
      <p className="bench-note">{copy.intro}</p>
      <div className="bench-actions">
        <button type="button" className="bench-button bench-button--primary" onClick={demo}>{copy.demo}</button>
        {(lists[0] || lists[1]) && <button type="button" className="bench-button" onClick={clear}>{copy.clear}</button>}
      </div>
      <div className="bench-columns">
        {([0, 1] as const).map(side => <div className="overlap-upload" key={side}>
          <label className="bench-label" htmlFor={`local-list-${side}`}>{side === 0 ? copy.first : copy.second}</label>
          <input key={`${side}-${fileKey}`} className="bench-input" id={`local-list-${side}`} type="file" accept=".csv,text/csv" onChange={e => void read(e.target.files?.[0], side)} />
          <p className="bench-note">{reading[side] ? copy.reading : lists[side] ? copy.count(lists[side]!.entries.length, lists[side]!.skipped) : copy.choose}</p>
        </div>)}
      </div>
      <p className="bench-note" role="status">{note || (example ? copy.example : "")}</p>
      {result ? <section aria-label={copy.shared}>
        <dl className="bench-metrics">
          <div><dt>{copy.shared}</dt><dd>{result.shared.length}</dd></div>
          <div><dt>{copy.onlyA}</dt><dd>{result.onlyA.length}</dd></div>
          <div><dt>{copy.onlyB}</dt><dd>{result.onlyB.length}</dd></div>
        </dl>
        <p className="bench-note">{copy.exact}</p>
        <div className="bench-actions" role="group" aria-label={copy.shared}>
          {(["shared", "onlyA", "onlyB"] as const).map(key => <button key={key} type="button" className="bench-button" aria-pressed={view === key} onClick={() => setView(key)}>{copy[key]}</button>)}
        </div>
        <label className="bench-label" htmlFor="overlap-search">{copy.search}</label>
        <input id="overlap-search" className="bench-input" type="search" placeholder={copy.searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)} />
        <div className="bench-actions"><button type="button" className="bench-button" onClick={download} disabled={!filtered.length}>{copy.download}</button></div>
        <ul className="overlap-local-list">
          {filtered.slice(0, 100).map(entry => <li key={entry.slug}><span>{entry.label}</span><span className="bench-note">{entry.slug}</span></li>)}
        </ul>
        <p className="bench-note" role="status">{filtered.length ? copy.showing(Math.min(filtered.length, 100), filtered.length) : copy.empty}</p>
      </section> : <p className="overlap-empty">{copy.waiting}</p>}
    </>}
  </div>;
}
