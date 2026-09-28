"use client";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { studioCopy } from "@/content/studio/copy";
import { studioLabels } from "@/content/studio/labels";
import {
  anonymousSummary,
  filterMessages,
  loreView,
  peakCell,
  portraitSvg,
  pseudonymsOf,
  readChat,
  type Cell,
  type Order,
  type Stretch,
} from "@/lib/studio/lore";
import { exampleChat } from "@/lib/studio/lore-example";
import { unpackZip } from "@/lib/studio/intake";
import { spanOf } from "@/lib/instrument/dates";
import { DropSlot, ExportBar, Segmented, useIntake } from "@/components/instrument";
import { useSystem } from "@/components/system/SystemProvider";
import Week from "./lore/Week";
import Timeline from "./lore/Timeline";
import Voices from "./lore/Voices";
import Phrases from "./lore/Phrases";
import Explorer from "./lore/Explorer";

const c = studioCopy.lore;
const ui = studioLabels.GroupLore;

/**
 * Group Lore: when a group chat talks, who talks and what it keeps saying.
 *
 * The stage, top to bottom: the screen (the week as lit cells, the one line
 * that reads the cell under the pointer, the voices beside it), the messages
 * when something has opened them, the timeline that chooses the stretch of
 * time everything follows, one line of figures, the phrases, and one row for
 * the intake and the two downloads. The week comes first and nothing sits
 * above it.
 *
 * It opens on an invented chat, read by the real parser in a lazy
 * initialiser, and the page renders it on the server: the first paint is the
 * week. Controls that need a handler wait for hydration (`ready`).
 *
 * The stretch (`range`) moves the week, the voices and the phrases together;
 * a voice pressed narrows the week and the phrases to that voice. Pseudonyms
 * are ranked on the whole export so a label never changes hands. Both
 * downloads are built from what the week shows, and hold counts only.
 *
 * Files are read in a worker, dropped anywhere on the stage or picked. A
 * newer read, a cancel or the example supersedes an older one through
 * `generation`. A WhatsApp file whose dates could be read either way is the
 * only time the page asks which way round they are.
 */
type Chat = ReturnType<typeof readChat>;

export default function GroupLore() {
  const { scrollTo } = useSystem();
  const [chat, setChat] = useState<Chat>(() => readChat(exampleChat()));
  const [example, setExample] = useState(true);
  const [range, setRange] = useState<Stretch>({});
  const [focus, setFocus] = useState("");
  const [pseudo, setPseudo] = useState(true);
  const [aim, setAim] = useState<Cell | null>(null);
  const [pick, setPick] = useState<Cell | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  const [paste, setPaste] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** The date order just asked for, shown at once while the worker re-reads the file in it. */
  const [asked, setAsked] = useState<Order | null>(null);
  const [ready, setReady] = useState(false);
  const [sweep, setSweep] = useState(0);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const source = useRef("");
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const reveal = useRef<"panel" | "search" | null>(null);
  const readingId = useId();
  const stretch = useDeferredValue(range);
  const words = useDeferredValue(query);
  const messages = chat.messages;
  const certain = chat.certain;

  useEffect(() => {
    setReady(true);
    return () => {
      generation.current++;
      worker.current?.terminate();
    };
  }, []);

  const view = useMemo(() => loreView(messages, { range: stretch, person: focus }), [messages, stretch, focus]);
  const names = useMemo(() => pseudonymsOf(messages), [messages]);
  const span = useMemo(() => spanOf(messages.map((m) => m.at)), [messages]);
  const peak = useMemo(() => peakCell(view.stats.heat), [view]);
  const found = useMemo(
    () => (open ? filterMessages(view.focus, { query: words, day: pick?.day, hour: pick?.hour }) : []),
    [open, view, words, pick],
  );

  /* Opening the messages brings them into view when they would open out of sight. */
  useEffect(() => {
    const want = reveal.current;
    reveal.current = null;
    if (!open || !want) return;
    if (want === "search") search.current?.focus({ preventScroll: true });
    const el = panel.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight - 160) scrollTo(el);
  }, [open, pick, query, scrollTo]);

  const label = (name: string) => (pseudo ? (names.get(name) ?? "Voice") : name);
  const number = (name: string) => (names.get(name) ?? "").replace("Voice ", "");
  const shown = aim ?? (open ? pick : null) ?? peak;
  const reading = shown
    ? c.reading(shown, view.stats.heat[shown.day][shown.hour], focus ? label(focus) : undefined)
    : c.messages(0);

  function show(next: Chat, isExample: boolean) {
    setChat(next);
    setAsked(null);
    setExample(isExample);
    setRange({});
    setFocus("");
    setAim(null);
    setPick(null);
    setQuery("");
    setOpen(false);
    setPaste(false);
    setLimit(50);
    setSweep((n) => n + 1);
  }

  function stop() {
    generation.current++;
    worker.current?.terminate();
    setBusy(false);
    setAsked(null);
  }

  function read(text: string, order?: Order) {
    worker.current?.terminate();
    const token = ++generation.current;
    setBusy(true);
    setError("");
    const w = new Worker(new URL("../../lib/studio/lore.worker.ts", import.meta.url));
    worker.current = w;
    w.onmessage = (e: MessageEvent<Chat | { error: string }>) => {
      w.terminate();
      if (token !== generation.current) return;
      setBusy(false);
      if ("error" in e.data) {
        setError(e.data.error);
        setAsked(null);
      } else {
        source.current = text;
        show(e.data, false);
      }
    };
    w.onerror = () => {
      w.terminate();
      if (token === generation.current) {
        setBusy(false);
        setError(c.read);
        setAsked(null);
      }
    };
    w.postMessage({ text, order });
  }

  async function upload(file: File) {
    const token = ++generation.current;
    worker.current?.terminate();
    setBusy(true);
    try {
      setError("");
      if (file.name.endsWith(".zip")) {
        if (file.size > 30_000_000) throw new Error("ZIP limit: 30 MB.");
        const files = await unpackZip(new Uint8Array(await file.arrayBuffer()), 30_000_000),
          chats = files.filter((f) => /\.(txt|json)$/i.test(f.path) && !f.path.startsWith("__MACOSX"));
        if (chats.length !== 1)
          throw new Error("Choose a ZIP containing one .txt or .json chat export, or select the chat file directly.");
        if (chats[0].bytes.length > 10_000_000) throw new Error("Chat limit: 10 MB.");
        if (token === generation.current) read(new TextDecoder().decode(chats[0].bytes));
      } else {
        if (file.size > 10_000_000) throw new Error("Chat limit: 10 MB.");
        const text = await file.text();
        if (token === generation.current) read(text);
      }
    } catch (e) {
      if (token !== generation.current) return;
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function showExample() {
    stop();
    setError("");
    source.current = "";
    show(readChat(exampleChat()), true);
  }

  function openAt(cell: Cell) {
    setPick(cell);
    setOpen(true);
    setLimit(50);
    reveal.current = "panel";
  }

  function openPhrase(phrase: string) {
    setQuery(phrase);
    setPick(null);
    setOpen(true);
    setLimit(50);
    reveal.current = "panel";
  }

  function openSearch() {
    setPick(null);
    setQuery("");
    setOpen(true);
    setLimit(50);
    reveal.current = "search";
  }

  const intake = useIntake({
    accept: ".txt,.json,.zip",
    disabled: busy,
    onFiles: ([file]) => void upload(file),
  });

  const figures = c.figures(view.stats.count, view.voices.length, view.stats.activeDays, view.stats.sessions);

  return (
    <div className="lab-work studio studio-lore lore" {...intake.stageProps}>
      <div className="lore__screen">
        <Week
          heat={view.stats.heat}
          cursor={shown}
          aim={aim}
          pick={open ? pick : null}
          readingId={readingId}
          label={c.weekLabel}
          days={c.daysShort}
          hour={c.hour}
          sweep={sweep}
          onAim={setAim}
          onPick={openAt}
        />
        <output id={readingId} className="lore__reading" aria-live="polite">
          {reading}
        </output>
        <Voices
          voices={view.voices}
          label={label}
          focus={focus}
          onFocus={(name) => {
            setFocus(name);
            setLimit(50);
          }}
          pseudo={pseudo}
          onPseudo={setPseudo}
          ready={ready}
          words={c}
        />
      </div>

      {open && (
        <Explorer
          ref={panel}
          found={found}
          limit={limit}
          onMore={() => setLimit(limit + 50)}
          query={query}
          onQuery={(next) => {
            setQuery(next);
            setLimit(50);
          }}
          searchRef={search}
          pick={pick}
          onUnpick={() => setPick(null)}
          voice={focus}
          onUnfocus={() => setFocus("")}
          onClear={() => {
            setPick(null);
            setFocus("");
            setQuery("");
            setLimit(50);
          }}
          onClose={() => setOpen(false)}
          label={label}
          number={number}
          words={{ ...c, empty: studioCopy.empty }}
        />
      )}

      <Timeline
        messages={messages}
        span={span}
        range={range}
        lit={stretch}
        onRange={(next) => {
          setRange(next);
          setLimit(50);
        }}
        ready={ready}
        label={c.timeline}
        stretchLabel={c.stretch}
      />

      <p className="lore__figures">
        {example ? <span className="lore__caption">{c.exampleCaption}</span> : null}
        {figures.map(({ value, label: what }) => (
          <span key={what} className="lore__figure">
            <b>{value}</b> {what}
          </span>
        ))}
        <span>{c.counts}</span>
      </p>

      <Phrases
        phrases={view.stats.phrases}
        active={open ? words : ""}
        onPhrase={openPhrase}
        onSearch={openSearch}
        ready={ready}
        words={{ ...c, none: ui.noPhrases }}
      />

      <div className="lore__deck">
        {ready ? (
          <div className="lore__intake">
            <DropSlot intake={intake} id="lore-file" label={c.upload} />
            <button type="button" className="lore__quiet" aria-expanded={paste} onClick={() => setPaste(!paste)}>
              {c.paste}
            </button>
            {!example ? (
              <button type="button" className="lore__quiet" disabled={busy} onClick={showExample}>
                {studioCopy.example}
              </button>
            ) : null}
            {!certain && (
              <Segmented
                label={c.dateOrder}
                size="sm"
                value={asked ?? chat.order}
                disabled={busy}
                onChange={(order) => {
                  setAsked(order);
                  read(source.current, order);
                }}
                options={[
                  { value: "dmy", label: ui.dayMonthYear },
                  { value: "mdy", label: ui.monthDayYear },
                ]}
              />
            )}
            {busy ? (
              <span className="lore__busy" role="status">
                {ui.readingMessages}
                <button type="button" className="lore__quiet" onClick={stop}>
                  {studioCopy.cancel}
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
        {ready ? (
          <ExportBar
            className="lore__exports"
            label={c.exports}
            note={c.keepNote}
            actions={[
              {
                label: c.summary,
                kind: "json",
                disabled: !view.focus.length,
                onClick: () => save("group-lore-summary.json", JSON.stringify(anonymousSummary(view.focus), null, 2), "application/json"),
              },
              {
                label: c.portrait,
                kind: "svg",
                disabled: !view.focus.length,
                onClick: () => save("group-lore-portrait.svg", portraitSvg(view.focus, c.portraitWords), "image/svg+xml"),
              },
            ]}
          />
        ) : null}
      </div>

      {ready && paste ? (
        <div className="lore__paste">
          <label className="lore__search">
            <span>{c.pasteLabel}</span>
            <textarea
              className="lore__paste-input"
              value={raw}
              maxLength={10_000_000}
              spellCheck={false}
              onChange={(event) => setRaw(event.target.value)}
            />
          </label>
          <button type="button" className="lore__go" disabled={!raw.trim() || busy} onClick={() => read(raw)}>
            {c.analyse}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="lore__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A file handed to the browser, never uploaded: a blob, an anchor, and the URL let go. */
function save(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
