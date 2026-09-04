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
  type ExchangeResult,
  type Side,
} from "@/lib/tools/overlap/protocol";
import { createRoom, fetchOffer, pollForAnswer, sendAnswer } from "@/lib/tools/overlap/relay-client";
import {
  openAsCreator,
  openAsJoiner,
  packSdp,
  unpackSdp,
  waitForConnection,
  type Opened,
} from "@/lib/tools/overlap/webrtc";
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
type PendingCreator = {
  complete: (answerSdp: string) => Promise<Opened>;
  close: () => void;
};

const MANUAL_CONNECTION_TIMEOUT_MS = 120_000;

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
  const awaitingAnswer = useRef<PendingCreator | null>(null);
  const relayRun = useRef<AbortController | null>(null);
  const activePeer = useRef<(() => void) | null>(null);

  const closeActive = useCallback(() => {
    relayRun.current?.abort(new DOMException("Overlap run ended", "AbortError"));
    relayRun.current = null;
    activePeer.current?.();
    activePeer.current = null;
    awaitingAnswer.current?.close();
    awaitingAnswer.current = null;
  }, []);

  const releaseRun = useCallback((controller: AbortController) => {
    if (relayRun.current !== controller) return;
    relayRun.current = null;
    activePeer.current = null;
    awaitingAnswer.current = null;
  }, []);

  // The demo runs the real exchange, in this tab, on mount.
  useEffect(() => {
    let live = true;
    runDemo()
      .then(({ a }) => {
        if (live) setDemo(a);
      })
      .catch(() => {
        if (live) setNote({ kind: "warn", text: overlapCopy.errors.other });
      });
    return () => {
      live = false;
      closeActive();
    };
  }, [closeActive]);

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
      closeActive();
      setFile(null);
      setColumn(-1);
      setEntries([]);
      setCounts(null);
      setResult(null);
      setOutbound("");
      setInbound("");
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
    [applyColumn, closeActive],
  );

  const finish = useCallback(
    async (opened: Opened, side: Side, controller: AbortController) => {
      const fingerprints =
        side === "creator"
          ? { offer: fingerprintOf(opened.localSdp), answer: fingerprintOf(opened.remoteSdp) }
          : { offer: fingerprintOf(opened.remoteSdp), answer: fingerprintOf(opened.localSdp) };
      try {
        const out = await runExchange({ side, entries, channel: opened.channel, fingerprints });
        if (!controller.signal.aborted) {
          setResult(out);
          setNote(null);
          void trackToolRun({ tool: "overlap", outcome: "ok", ms: round100(Date.now() - started.current) });
        }
      } catch {
        if (!controller.signal.aborted) {
          setNote({ kind: "warn", text: overlapCopy.errors.protocol });
          void trackToolRun({ tool: "overlap", outcome: "error", ms: round100(Date.now() - started.current) });
        }
      } finally {
        opened.channel.close();
        opened.connection.close();
        if (relayRun.current === controller) {
          awaitingAnswer.current = null;
          relayRun.current = null;
          activePeer.current = null;
          setBusy(false);
          started.current = 0;
        }
      }
    },
    [entries],
  );

  const refused = useCallback((text: string) => {
    setBusy(false);
    setNote({ kind: "warn", text });
    void trackToolRun({ tool: "overlap", outcome: "refused", ms: round100(Date.now() - started.current) });
    started.current = 0;
  }, []);

  const failed = useCallback((text: string) => {
    setBusy(false);
    setNote({ kind: "warn", text });
    void trackToolRun({ tool: "overlap", outcome: "error", ms: round100(Date.now() - started.current) });
    started.current = 0;
  }, []);

  const create = useCallback(async () => {
    closeActive();
    const controller = new AbortController();
    relayRun.current = controller;
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.creating });
    let close: (() => void) | null = null;
    try {
      const setup = await openAsCreator({ sameNetworkOnly });
      close = setup.close;
      activePeer.current = setup.close;
      if (controller.signal.aborted) {
        close();
        return;
      }
      const room = await createRoom(setup.offer, undefined, { signal: controller.signal });
      if (controller.signal.aborted) {
        close();
        return;
      }
      if (!room.ok) {
        close();
        releaseRun(controller);
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
        signal: controller.signal,
        onTick: (secondsLeft) =>
          setNote({ kind: "info", text: fill(overlapCopy.connect.waiting, { seconds: secondsLeft }) }),
      });
      if (controller.signal.aborted) {
        close();
        return;
      }
      if (!answer.ok) {
        close();
        releaseRun(controller);
        refused(answer.error === "gave-up" ? overlapCopy.connect.gaveUp : answer.message);
        return;
      }
      setNote({ kind: "info", text: overlapCopy.connect.open });
      const opened = await waitForConnection(setup.finish(answer.answer));
      close = null;
      if (controller.signal.aborted) {
        opened.channel.close();
        opened.connection.close();
        return;
      }
      activePeer.current = opened.connection.close.bind(opened.connection);
      await finish(opened, "creator", controller);
    } catch {
      close?.();
      if (!controller.signal.aborted) {
        releaseRun(controller);
        failed(overlapCopy.connect.failed);
      }
    }
  }, [closeActive, failed, finish, refused, releaseRun, sameNetworkOnly]);

  const join = useCallback(async () => {
    const clean = normaliseTypedCode(typed);
    if (!clean) {
      setNote({ kind: "warn", text: overlapCopy.relay.badCode });
      return;
    }
    closeActive();
    const controller = new AbortController();
    relayRun.current = controller;
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.joining });
    let close: (() => void) | null = null;
    try {
      const offer = await fetchOffer(clean, undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!offer.ok) {
        releaseRun(controller);
        if (offer.error === "relay-unavailable") {
          setCodesOff(true);
          setPasteOpen(true);
        }
        refused(offer.message || overlapCopy.relay.failed);
        return;
      }
      const setup = await openAsJoiner(offer.offer, { sameNetworkOnly });
      close = setup.close;
      activePeer.current = setup.close;
      if (controller.signal.aborted) {
        close();
        return;
      }
      const posted = await sendAnswer(clean, setup.answer, undefined, { signal: controller.signal });
      if (controller.signal.aborted) {
        close();
        return;
      }
      if (!posted.ok) {
        close();
        releaseRun(controller);
        refused(posted.message || overlapCopy.relay.failed);
        return;
      }
      setNote({ kind: "info", text: overlapCopy.connect.open });
      const opened = await waitForConnection(setup.opened);
      close = null;
      if (controller.signal.aborted) {
        opened.channel.close();
        opened.connection.close();
        return;
      }
      activePeer.current = opened.connection.close.bind(opened.connection);
      await finish(opened, "joiner", controller);
    } catch {
      close?.();
      if (!controller.signal.aborted) {
        releaseRun(controller);
        failed(overlapCopy.connect.failed);
      }
    }
  }, [closeActive, failed, finish, refused, releaseRun, sameNetworkOnly, typed]);

  const pasteStart = useCallback(async () => {
    closeActive();
    const controller = new AbortController();
    relayRun.current = controller;
    setBusy(true);
    started.current = Date.now();
    try {
      awaitingAnswer.current?.close();
      const setup = await openAsCreator({ sameNetworkOnly });
      if (controller.signal.aborted) {
        setup.close();
        return;
      }
      awaitingAnswer.current = { complete: setup.finish, close: setup.close };
      activePeer.current = setup.close;
      const packed = await packSdp(setup.offer);
      if (controller.signal.aborted) return;
      setOutbound(packed);
      setNote({ kind: "info", text: overlapCopy.connect.pasteStart });
      setBusy(false);
    } catch {
      awaitingAnswer.current?.close();
      awaitingAnswer.current = null;
      if (!controller.signal.aborted) {
        releaseRun(controller);
        failed(overlapCopy.errors.other);
      }
    }
  }, [closeActive, failed, releaseRun, sameNetworkOnly]);

  /**
   * One button, two meanings, decided by whether this tab already made an
   * offer. Having started means the pasted blob is the answer to it; having
   * not means the blob is somebody else's offer and this tab answers it.
   */
  const pasteContinue = useCallback(async () => {
    const controller = relayRun.current ?? new AbortController();
    relayRun.current = controller;
    setBusy(true);
    if (!started.current) started.current = Date.now();
    let close: (() => void) | null = null;
    try {
      const sdp = await unpackSdp(inbound.trim());
      if (controller.signal.aborted) return;
      const pending = awaitingAnswer.current;
      if (pending) {
        const opened = await waitForConnection(pending.complete(sdp));
        awaitingAnswer.current = null;
        if (controller.signal.aborted) {
          opened.channel.close();
          opened.connection.close();
          return;
        }
        activePeer.current = opened.connection.close.bind(opened.connection);
        await finish(opened, "creator", controller);
        return;
      }
      const setup = await openAsJoiner(sdp, { sameNetworkOnly });
      close = setup.close;
      activePeer.current = setup.close;
      if (controller.signal.aborted) {
        close();
        return;
      }
      const packed = await packSdp(setup.answer);
      if (controller.signal.aborted) {
        close();
        return;
      }
      setOutbound(packed);
      setNote({ kind: "info", text: overlapCopy.connect.pasteAnswer });
      const opened = await waitForConnection(setup.opened, MANUAL_CONNECTION_TIMEOUT_MS);
      close = null;
      if (controller.signal.aborted) {
        opened.channel.close();
        opened.connection.close();
        return;
      }
      activePeer.current = opened.connection.close.bind(opened.connection);
      await finish(opened, "joiner", controller);
    } catch {
      close?.();
      awaitingAnswer.current?.close();
      awaitingAnswer.current = null;
      if (!controller.signal.aborted) {
        releaseRun(controller);
        failed(overlapCopy.connect.failed);
      }
    }
  }, [failed, finish, inbound, releaseRun, sameNetworkOnly]);

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
            disabled={busy}
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
            aria-label={
              awaitingAnswer.current ? overlapCopy.connect.pasteOffer : overlapCopy.connect.pasteAnswer
            }
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
