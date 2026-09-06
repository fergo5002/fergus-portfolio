"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.GroupLore;
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/content/lab/copy";
import { studioCopy } from "@/content/studio/copy";
import {
  importChat,
  loreStats,
  filterMessages,
  anonymousSummary,
  type LoreFilter,
} from "@/lib/studio/lore";
import type { ChatMessage } from "@/lib/lab/chat";
import { unpackZip } from "@/lib/studio/intake";
import {
  Button,
  Field,
  FileInput,
  Metrics,
  ErrorMessage,
  download,
  jsonDownload,
  xml,
} from "@/components/lab/shared";
import { StudioIntro, Toggle } from "./Furniture";
const c = studioCopy.lore,
  days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function GroupLore() {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
      importChat(copy.chat.sample, "dmy"),
    ),
    [raw, setRaw] = useState(""),
    [filter, setFilter] = useState<LoreFilter>({}),
    [order, setOrder] = useState<"dmy" | "mdy">("dmy"),
    [pseudo, setPseudo] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(50),
    [portrait, setPortrait] = useState(false),
    worker = useRef<Worker | null>(null),
    generation = useRef(0),
    archive = useRef<HTMLElement>(null),
    deferred = useDeferredValue(filter);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  const allStats = useMemo(() => loreStats(messages), [messages]),
    filtered = useMemo(
      () => filterMessages(messages, deferred),
      [messages, deferred],
    ),
    stats = useMemo(() => loreStats(filtered), [filtered]),
    labels = useMemo(
      () =>
        new Map(
          allStats.participants.map((p, i) => [p.name, `Voice ${i + 1}`]),
        ),
      [allStats],
    );
  function change(next: Partial<LoreFilter>) {
    setFilter((f) => ({ ...f, ...next }));
    setLimit(50);
    setPortrait(false);
  }
  function label(name: string) {
    return pseudo ? (labels.get(name) ?? "Voice") : name;
  }
  function read(text: string, dateOrder = order) {
    worker.current?.terminate();
    const token = ++generation.current;
    setBusy(true);
    setError("");
    const w = new Worker(
      new URL("../../lib/studio/lore.worker.ts", import.meta.url),
    );
    worker.current = w;
    w.onmessage = (e) => {
      w.terminate();
      if (token !== generation.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else {
        setMessages(e.data.messages);
        setFilter({});
        setLimit(50);
        setPortrait(false);
      }
    };
    w.onerror = () => {
      w.terminate();
      if (token === generation.current) {
        setBusy(false);
        setError("Could not read this chat. Try a smaller export.");
      }
    };
    w.postMessage({ text, order: dateOrder });
  }
  async function upload(file: File) {
    const token = ++generation.current;
    worker.current?.terminate();
    setBusy(true);
    try {
      setError("");
      if (file.name.endsWith(".zip")) {
        if (file.size > 30_000_000) throw new Error("ZIP limit: 30 MB.");
        setBusy(true);
        const files = await unpackZip(
            new Uint8Array(await file.arrayBuffer()),
            30_000_000,
          ),
          chats = files.filter(
            (f) =>
              /\.(txt|json)$/i.test(f.path) && !f.path.startsWith("__MACOSX"),
          );
        if (chats.length !== 1)
          throw new Error(
            "Choose a ZIP containing one .txt or .json chat export, or select the chat file directly.",
          );
        if (chats[0].bytes.length > 10_000_000)
          throw new Error("Chat limit: 10 MB.");
        if (token === generation.current)
          read(new TextDecoder().decode(chats[0].bytes));
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
  const heatMax = Math.max(1, ...allStats.heat.flat()),
    personMax = Math.max(1, ...allStats.participants.map((p) => p.count));
  const portraitSvg = useMemo(() => {
    const summary = anonymousSummary(filtered),
      max = Math.max(1, ...summary.heat.flat());
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#09140f"/><g font-family="monospace"><text x="70" y="95" fill="#ffb347" font-size="18">GROUP LORE / FERGUSOS</text><text x="70" y="200" fill="#e5ffe9" font-size="65">${xml(c.portraitTitle)}</text><text x="70" y="260" fill="#94c8a4" font-size="24">${summary.count.toLocaleString("en-GB")} messages · ${summary.participants.length} voices · ${summary.activeDays} active days</text>${summary.heat.map((row, d) => `<text x="70" y="${338 + d * 44}" fill="#94c8a4" font-size="16">${days[d]}</text>${row.map((n, h) => `<rect x="${135 + h * 40}" y="${314 + d * 44}" width="31" height="31" rx="4" fill="#7bffb0" opacity="${0.08 + (0.92 * n) / max}"/>`).join("")}`).join("")}<text x="135" y="660" fill="#94c8a4" font-size="16">00:00</text><text x="565" y="660" fill="#94c8a4" font-size="16">12:00</text><text x="1010" y="660" fill="#94c8a4" font-size="16">23:00</text><text x="70" y="760" fill="#e5ffe9" font-size="24">${summary.sessions} conversations, each beginning after 30 quiet minutes.</text><text x="70" y="835" fill="#94c8a4" font-size="16">An activity portrait of the selected messages. No names. No quotations.</text></g></svg>`;
  }, [filtered]);
  return (
    <div className="lab-work studio studio-lore">
      <StudioIntro eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div className="studio-drop">
        <div className="studio-toolbar">
          <FileInput
            disabled={busy}
            label={c.upload}
            accept=".txt,.json,.zip"
            onFile={upload}
          />
          <Field label={c.dateOrder}>
            <select
              value={order}
              disabled={busy}
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="dmy">{ui.dayMonthYear}</option>
              <option value="mdy">{ui.monthDayYear}</option>
            </select>
          </Field>
          <Button disabled={busy} onClick={() => read(copy.chat.sample, "dmy")}>
            {studioCopy.example}
          </Button>
        </div>
        <p>{c.importNote}</p>
        <details>
          <summary>{c.paste}</summary>
          <Field label={c.paste}>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              maxLength={10_000_000}
            />
          </Field>
          <Button disabled={!raw.trim() || busy} onClick={() => read(raw)}>
            {c.analyse}
          </Button>
        </details>
      </div>
      <ErrorMessage error={error} />
      {busy && (
        <div className="studio-toolbar" role="status">
          <span>{ui.readingMessages}</span>
          <Button
            onClick={() => {
              generation.current++;
              worker.current?.terminate();
              setBusy(false);
            }}
          >
            {studioCopy.cancel}
          </Button>
        </div>
      )}
      <Metrics
        items={[
          ["Messages", stats.count.toLocaleString()],
          ["Voices", stats.participants.length],
          ["Active days", stats.activeDays],
          ["Conversations", stats.sessions],
        ]}
      />
      <div className="studio-toolbar">
        <Toggle active={pseudo} onClick={() => setPseudo(!pseudo)}>
          {c.pseudo}
        </Toggle>
        <Field label={c.start}>
          <input
            type="date"
            value={filter.start ?? ""}
            onChange={(e) => change({ start: e.target.value })}
          />
        </Field>
        <Field label={c.end}>
          <input
            type="date"
            value={filter.end ?? ""}
            onChange={(e) => change({ end: e.target.value })}
          />
        </Field>
        <Button
          onClick={() => {
            setFilter({});
            setLimit(50);
          }}
        >
          {c.clear}
        </Button>
      </div>
      <div className="lore-overview">
        <section className="studio-panel">
          <p className="studio-eyebrow">{ui.text01WhenYouShowUp}</p>
          <h3>{c.rhythm}</h3>
          <p>{c.rhythmNote}</p>
          <div className="lore-heat-scroll">
            <div className="lore-heat-axis">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h}>
                  {h % 4 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
            {allStats.heat.map((row, d) => (
              <div className="lore-heat-row" key={d}>
                <span>{days[d]}</span>
                {row.map((n, h) => (
                  <button
                    key={h}
                    aria-label={`${days[d]} ${h}:00, ${n} messages`}
                    aria-pressed={filter.day === d && filter.hour === h}
                    disabled={!n}
                    style={
                      {
                        "--heat": 0.06 + (0.94 * n) / heatMax,
                      } as React.CSSProperties
                    }
                    onClick={() => {
                      change({ day: d, hour: h });
                      archive.current?.scrollIntoView({
                        behavior: "instant",
                        block: "start",
                      });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="studio-note">
            {allStats.count.toLocaleString()}
            {ui.messagesInTheCompleteExportDarkerQuieter}
          </p>
        </section>
        <section className="studio-panel">
          <p className="studio-eyebrow">{ui.text02WhoSHere}</p>
          <h3>{c.people}</h3>
          <div className="lore-people">
            {allStats.participants.slice(0, 40).map((p, i) => (
              <button
                key={p.name}
                aria-pressed={filter.person === p.name}
                onClick={() =>
                  change({ person: filter.person === p.name ? "" : p.name })
                }
              >
                <span className="lore-avatar">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{label(p.name)}</strong>
                  <i style={{ width: `${(p.count / personMax) * 100}%` }} />
                </span>
                <b>{p.count.toLocaleString()}</b>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="studio-panel">
        <p className="studio-eyebrow">{ui.text03TheRunningThreads}</p>
        <h3>{c.phrases}</h3>
        <div className="lore-phrases">
          {allStats.phrases.map((p) => (
            <button
              key={p.phrase}
              aria-pressed={filter.query === p.phrase}
              onClick={() => {
                change({ query: p.phrase });
                archive.current?.scrollIntoView({
                  behavior: "instant",
                  block: "start",
                });
              }}
            >
              <span>“{p.phrase}”</span>
              <b>{p.count}×</b>
            </button>
          ))}
        </div>
        {!allStats.phrases.length && <p>{ui.noRepeatedTwoWordPhrasesInThis}</p>}
      </section>
      <section className="studio-panel lore-archive" ref={archive}>
        <div className="studio-section-head">
          <h3>{c.archive}</h3>
          <span>
            {filtered.length.toLocaleString()}
            {ui.matches}
          </span>
        </div>
        <div className="studio-toolbar">
          <Field label={c.search}>
            <input
              type="search"
              value={filter.query ?? ""}
              onChange={(e) => change({ query: e.target.value })}
            />
          </Field>
          <Field label={c.person}>
            <select
              value={filter.person ?? ""}
              onChange={(e) => change({ person: e.target.value })}
            >
              <option value="">{c.all}</option>
              {allStats.participants.map((p) => (
                <option key={p.name} value={p.name}>
                  {label(p.name)}
                </option>
              ))}
            </select>
          </Field>
          {filter.hour !== undefined && (
            <Button onClick={() => change({ hour: undefined, day: undefined })}>
              {days[filter.day!]} {filter.hour}:00 · {c.heatClear}
            </Button>
          )}
        </div>
        <p className="studio-note">{c.privacy}</p>
        <div className="lore-messages">
          {filtered.slice(0, limit).map((m, i) => (
            <article key={`${m.at}-${i}`}>
              <div>
                <span className="lore-avatar">
                  {labels.get(m.sender)?.replace("Voice ", "")}
                </span>
                <strong>{label(m.sender)}</strong>
                <time dateTime={new Date(m.at).toISOString()}>
                  {new Date(m.at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
        {!filtered.length && <p>{studioCopy.empty}</p>}
        {filtered.length > limit && (
          <Button onClick={() => setLimit(limit + 50)}>{c.more}</Button>
        )}
      </section>
      <p className="studio-note">{c.session}</p>
      <div className="studio-toolbar">
        <Button
          primary
          disabled={!filtered.length}
          onClick={() => setPortrait(!portrait)}
        >
          {c.portrait}
        </Button>
        <Button
          onClick={() =>
            jsonDownload("group-lore-summary.json", anonymousSummary(filtered))
          }
        >
          {c.summary}
        </Button>
      </div>
      {portrait && (
        <section className="studio-panel lore-portrait">
          <h3>{c.portraitTitle}</h3>
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg)}`}
            alt={ui.anonymousActivityPortraitPreview}
            width={1200}
            height={900}
          />
          <Button
            onClick={() =>
              download("group-lore-portrait.svg", portraitSvg, "image/svg+xml")
            }
          >
            {c.portraitDownload}
          </Button>
        </section>
      )}
    </div>
  );
}
