"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { overlapCopy } from "@/content/tools/overlap";
import { trackToolRun } from "@/lib/tools/events";
import {
  MIN_USABLE_ROWS,
  entriesFrom,
  readConnections,
  type ConnectionsFile,
  type ReadCounts,
} from "@/lib/tools/overlap/csv";
import { displayCode, normaliseTypedCode } from "@/lib/tools/overlap/code";
import { demoCsv, demoLists, runDemo } from "@/lib/tools/overlap/demo";
import {
  fingerprintOf,
  runExchange,
  type Channel,
  type ExchangeResult,
  type Side,
} from "@/lib/tools/overlap/protocol";
import { createRoom, fetchOffer, pollForAnswer, sendAnswer } from "@/lib/tools/overlap/relay-client";
import { openAsCreator, openAsJoiner, packSdp, unpackSdp } from "@/lib/tools/overlap/webrtc";
import type { Entry } from "@/lib/tools/overlap/types";

/**
 * The one client component, and it is wiring.
 *
 * Every decision in this tool is a pure function in `lib/tools/overlap/` with
 * a test beside it. This file picks a file, picks a route to the other tab,
 * and paints what comes back. There is no maths here and there must not be,
 * and there are no sentences either: every visible string comes from
 * `content/tools/overlap.ts`, where the voice lint can reach it.
 *
 * **Nothing is written anywhere.** No storage API appears in this file and
 * `lib/tools/overlap/safety.test.ts` greps for that. The file the visitor
 * chooses is read into memory, reduced to slugs, and dropped when the tab
 * closes.
 *
 * The page opens on the demo, which runs the real exchange in this tab through
 * `pairedChannels`, so nobody ever meets an empty form and a broken protocol
 * shows before a second browser is involved.
 */

type Panel = "demo" | "file";
type Note = { kind: "info" | "warn"; text: string };
type Opened = { channel: Channel; localSdp: string; remoteSdp: string };

const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);

/**
 * A millisecond-precise duration correlates with how many rows somebody has,
 * and the number is only wanted as a rough performance signal.
 */
const round100 = (ms: number) => Math.round(ms / 100) * 100;

export default function OverlapTool() {
  const [panel, setPanel] = useState<Panel>("demo");
  const [sameNetworkOnly, setSameNetworkOnly] = useState(false);
  const [codesOff, setCodesOff] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const [demo, setDemo] = useState<ExchangeResult | null>(null);
  const [file, setFile] = useState<ConnectionsFile | null>(null);
  const [column, setColumn] = useState(-1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<ReadCounts | null>(null);

  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [outbound, setOutbound] = useState("");
  const [inbound, setInbound] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExchangeResult | null>(null);

  const started = useRef(0);
  /** Set once a paste-route offer has been made here, so the reply is an answer. */
  const awaitingAnswer = useRef<((answerSdp: string) => Promise<Opened>) | null>(null);

  // The demo runs the real exchange, in this tab, on mount.
  useEffect(() => {
    let live = true;
    runDemo()
      .then(({ a }) => {
        if (live) setDemo(a);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const applyColumn = useCallback((parsed: ConnectionsFile, index: number) => {
    if (index < 0) {
      setNote({ kind: "warn", text: overlapCopy.file.noColumn });
      setEntries([]);
      setCounts(null);
      return;
    }
    const { entries: found, counts: c } = entriesFrom(parsed, index, parsed.nameColumns);
    setEntries(found);
    setCounts(c);
    setNote(
      found.length < MIN_USABLE_ROWS
        ? { kind: "warn", text: fill(overlapCopy.file.tooFew, { min: MIN_USABLE_ROWS }) }
        : { kind: "info", text: fill(overlapCopy.file.read, { rows: c.rows, used: c.used }) },
    );
  }, []);

  const readFile = useCallback(
    (chosen: File) => {
      const reader = new FileReader();
      setNote({ kind: "info", text: overlapCopy.file.reading });
      reader.onerror = () => setNote({ kind: "warn", text: overlapCopy.errors.file });
      reader.onload = () => {
        const parsed = readConnections(String(reader.result ?? ""));
        setFile(parsed);
        setColumn(parsed.urlColumn);
        applyColumn(parsed, parsed.urlColumn);
      };
      reader.readAsText(chosen);
    },
    [applyColumn],
  );

  const finish = useCallback(
    async (opened: Opened, side: Side) => {
      const fingerprints =
        side === "creator"
          ? { offer: fingerprintOf(opened.localSdp), answer: fingerprintOf(opened.remoteSdp) }
          : { offer: fingerprintOf(opened.remoteSdp), answer: fingerprintOf(opened.localSdp) };
      try {
        const out = await runExchange({ side, entries, channel: opened.channel, fingerprints });
        setResult(out);
        setNote(null);
        void trackToolRun({ tool: "overlap", outcome: "ok", ms: round100(Date.now() - started.current) });
      } catch {
        setNote({ kind: "warn", text: overlapCopy.errors.protocol });
        void trackToolRun({ tool: "overlap", outcome: "error", ms: round100(Date.now() - started.current) });
      } finally {
        awaitingAnswer.current = null;
        setBusy(false);
      }
    },
    [entries],
  );

  const refused = useCallback((text: string) => {
    setBusy(false);
    setNote({ kind: "warn", text });
    void trackToolRun({ tool: "overlap", outcome: "refused", ms: round100(Date.now() - started.current) });
  }, []);

  const create = useCallback(async () => {
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.creating });
    const { offer, finish: complete } = await openAsCreator({ sameNetworkOnly });
    const room = await createRoom(offer);
    if (!room.ok) {
      if (room.error === "relay-unavailable" || room.error === "budget") {
        setCodesOff(room.error === "relay-unavailable");
        setPasteOpen(true);
      }
      refused(room.message || overlapCopy.relay.failed);
      return;
    }
    setCode(room.code);
    setNote({ kind: "info", text: fill(overlapCopy.connect.created, { code: displayCode(room.code) }) });
    const answer = await pollForAnswer(room.code, undefined, {
      onTick: (secondsLeft) =>
        setNote({ kind: "info", text: fill(overlapCopy.connect.waiting, { seconds: secondsLeft }) }),
    });
    if (!answer.ok) {
      refused(answer.error === "gave-up" ? overlapCopy.connect.gaveUp : answer.message);
      return;
    }
    setNote({ kind: "info", text: overlapCopy.connect.open });
    await finish(await complete(answer.answer), "creator");
  }, [finish, refused, sameNetworkOnly]);

  const join = useCallback(async () => {
    const clean = normaliseTypedCode(typed);
    if (!clean) {
      setNote({ kind: "warn", text: overlapCopy.relay.badCode });
      return;
    }
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.joining });
    const offer = await fetchOffer(clean);
    if (!offer.ok) {
      if (offer.error === "relay-unavailable") {
        setCodesOff(true);
        setPasteOpen(true);
      }
      refused(offer.message || overlapCopy.relay.failed);
      return;
    }
    const { answer, opened } = await openAsJoiner(offer.offer, { sameNetworkOnly });
    const posted = await sendAnswer(clean, answer);
    if (!posted.ok) {
      refused(posted.message || overlapCopy.relay.failed);
      return;
    }
    setNote({ kind: "info", text: overlapCopy.connect.open });
    await finish(await opened, "joiner");
  }, [finish, refused, sameNetworkOnly, typed]);

  const pasteStart = useCallback(async () => {
    setBusy(true);
    started.current = Date.now();
    const { offer, finish: complete } = await openAsCreator({ sameNetworkOnly });
    awaitingAnswer.current = complete;
    setOutbound(await packSdp(offer));
    setNote({ kind: "info", text: overlapCopy.connect.pasteStart });
    setBusy(false);
  }, [sameNetworkOnly]);

  /**
   * One button, two meanings, decided by whether this tab already made an
   * offer. Having started means the pasted blob is the answer to it; having
   * not means the blob is somebody else's offer and this tab answers it.
   */
  const pasteContinue = useCallback(async () => {
    setBusy(true);
    if (!started.current) started.current = Date.now();
    try {
      const sdp = await unpackSdp(inbound.trim());
      const complete = awaitingAnswer.current;
      if (complete) {
        await finish(await complete(sdp), "creator");
        return;
      }
      const { answer, opened } = await openAsJoiner(sdp, { sameNetworkOnly });
      setOutbound(await packSdp(answer));
      setNote({ kind: "info", text: overlapCopy.connect.pasteAnswer });
      await finish(await opened, "joiner");
    } catch {
      setBusy(false);
      setNote({ kind: "warn", text: overlapCopy.errors.other });
    }
  }, [finish, inbound, sameNetworkOnly]);

  const saveDemoFiles = useCallback(() => {
    const { a, b } = demoLists();
    for (const [list, owner] of [
      [a, "aoife"],
      [b, "cormac"],
    ] as const) {
      const url = URL.createObjectURL(new Blob([demoCsv(list, owner)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `overlap-demo-${owner}.csv`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }, []);

  const ready = entries.length >= MIN_USABLE_ROWS;
  const shown = result ?? (panel === "demo" && !result ? demo : null);

  return (
    <div className="overlap">
      <p className="overlap__honesty">{overlapCopy.honesty.notPsi}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.claim}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.theyLearn}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.relaySees}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.storage}</p>

      <div className="overlap__panels" role="group" aria-label={overlapCopy.title}>
        <button
          type="button"
          className="overlap__tab"
          aria-pressed={panel === "demo"}
          onClick={() => setPanel("demo")}
        >
          {overlapCopy.demo.tab}
        </button>
        <button
          type="button"
          className="overlap__tab"
          aria-pressed={panel === "file"}
          onClick={() => setPanel("file")}
        >
          {overlapCopy.file.legend}
        </button>
      </div>

      {panel === "demo" ? (
        <section className="overlap__block">
          <p className="overlap__demo-label">{overlapCopy.demo.label}</p>
          <p className="overlap__hint">{overlapCopy.demo.hint}</p>
          <button type="button" className="overlap__button" onClick={saveDemoFiles}>
            {overlapCopy.demo.save}
          </button>
        </section>
      ) : (
        <section className="overlap__block">
          <p className="overlap__hint">
            {overlapCopy.export.how}{" "}
            <a
              className="prose__link"
              href={overlapCopy.export.link}
              rel="noopener noreferrer"
              target="_blank"
            >
              {overlapCopy.export.linkLabel}
            </a>
          </p>
          <label className="overlap__label" htmlFor="overlap-file">
            {overlapCopy.file.input}
          </label>
          <input
            id="overlap-file"
            className="overlap__file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) readFile(chosen);
            }}
          />
          {file && column < 0 ? (
            <>
              <label className="overlap__label" htmlFor="overlap-column">
                {overlapCopy.file.pick}
              </label>
              <select
                id="overlap-column"
                className="overlap__select"
                value={column}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setColumn(index);
                  applyColumn(file, index);
                }}
              >
                <option value={-1}>{overlapCopy.file.pick}</option>
                {file.headers.map((header, i) => (
                  <option key={`${header}-${i}`} value={i}>
                    {header || `${i + 1}`}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {counts ? (
            <p className="overlap__counts">
              {fill(overlapCopy.file.skipped, {
                empty: counts.empty,
                legacy: counts.legacyPub,
                other: counts.notAProfile,
              })}
            </p>
          ) : null}
        </section>
      )}

      <fieldset className="overlap__block" disabled={!ready}>
        <legend className="overlap__legend">{overlapCopy.connect.legend}</legend>

        <button
          type="button"
          className="overlap__tab"
          aria-pressed={sameNetworkOnly}
          onClick={() => setSameNetworkOnly((on) => !on)}
        >
          {overlapCopy.connect.sameNetwork}
        </button>
        <p className="overlap__hint">{overlapCopy.honesty.stun}</p>

        {codesOff ? null : (
          <div className="overlap__row">
            <button type="button" className="overlap__button" onClick={create} disabled={busy}>
              {overlapCopy.connect.create}
            </button>
            {code ? <output className="overlap__code">{displayCode(code)}</output> : null}
            <label className="overlap__label" htmlFor="overlap-code">
              {overlapCopy.connect.joinLabel}
            </label>
            <input
              id="overlap-code"
              className="overlap__input"
              inputMode="text"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <button type="button" className="overlap__button" onClick={join} disabled={busy}>
              {overlapCopy.connect.join}
            </button>
          </div>
        )}

        <details
          className="overlap__paste"
          open={pasteOpen}
          onToggle={(event) => setPasteOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="overlap__summary">{overlapCopy.connect.pasteLegend}</summary>
          <p className="overlap__hint">{overlapCopy.connect.pasteHint}</p>
          <button type="button" className="overlap__button" onClick={pasteStart} disabled={busy}>
            {overlapCopy.connect.pasteStart}
          </button>
          <textarea
            className="overlap__blob"
            readOnly
            value={outbound}
            rows={4}
            aria-label={overlapCopy.connect.pasteAnswer}
          />
          <label className="overlap__label" htmlFor="overlap-inbound">
            {overlapCopy.connect.pasteJoin}
          </label>
          <textarea
            id="overlap-inbound"
            className="overlap__blob"
            rows={4}
            value={inbound}
            onChange={(event) => setInbound(event.target.value)}
          />
          <button
            type="button"
            className="overlap__button"
            onClick={pasteContinue}
            disabled={busy || inbound.trim() === ""}
          >
            {overlapCopy.connect.pasteReply}
          </button>
        </details>
      </fieldset>

      {note ? (
        <p className={`overlap__note overlap__note--${note.kind}`} role="status">
          {note.text}
        </p>
      ) : null}

      {shown ? (
        <section className="overlap__result" aria-live="polite">
          <h2 className="overlap__heading">{overlapCopy.result.heading}</h2>
          <p className="overlap__counts">
            {fill(overlapCopy.result.counts, { mine: shown.mine, theirs: shown.theirs })}
          </p>
          <p className="overlap__counts">
            {shown.theirMode === "bloom" && shown.falsePositives !== null
              ? fill(overlapCopy.result.bloom, {
                  rate: `1 in ${Math.round(
                    Math.max(1, shown.mine) / Math.max(shown.falsePositives, Number.MIN_VALUE),
                  ).toLocaleString("en-IE")}`,
                  expected: shown.falsePositives.toFixed(3),
                })
              : overlapCopy.result.exact}
          </p>
          <p className="overlap__safety">
            {overlapCopy.result.safetyLabel}: <strong>{shown.safety}</strong>
          </p>
          <p className="overlap__hint">{overlapCopy.honesty.safety}</p>
          {shown.shared.length === 0 ? (
            <p className="overlap__counts">{overlapCopy.result.none}</p>
          ) : (
            <ul className="overlap__names">
              {shown.shared.map((entry) => (
                <li key={entry.slug}>{entry.label}</li>
              ))}
            </ul>
          )}
          <p className="overlap__hint">{overlapCopy.result.names}</p>
        </section>
      ) : null}
    </div>
  );
}
