"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { mcpCopy as copy, type McpPreset } from "@/content/mcp";
import { consoleHeaders, consoleRequest, consoleSummary } from "@/lib/mcp-console";

/**
 * A copy button that only exists where copying works. Rendered after mount and
 * only when `navigator.clipboard.writeText` is there: a control that can do
 * nothing must not be rendered (AGENTS.md, the /contact rule).
 */
export function CopyButton({ text, label = copy.copy }: { text: string; label?: string }) {
  const [able, setAble] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setAble(typeof navigator !== "undefined" && !!navigator.clipboard?.writeText), []);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1600);
    return () => window.clearTimeout(t);
  }, [done]);
  if (!able) return null;
  return (
    <button
      type="button"
      className="mcp-copy"
      onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true), () => setAble(false))}
    >
      {done ? copy.copied : label}
    </button>
  );
}

/** Two ways to add the server, as tabs: one tab stop, arrows to move. */
export function McpInstall({ claude, json }: { claude: string; json: string }) {
  const tabs = [
    { id: "claude", label: copy.clients.claude, snippet: claude },
    { id: "json", label: copy.clients.json, snippet: json },
  ];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="mcp-install">
      <div className="mcp-install__tabs" role="tablist" aria-label={copy.add} onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`mcp-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls="mcp-install-panel"
            tabIndex={i === active ? 0 : -1}
            className="mcp-install__tab"
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="mcp-install-panel" role="tabpanel" aria-labelledby={`mcp-tab-${tabs[active].id}`} className="mcp-install__panel">
        <pre className="mcp-install__code"><code>{tabs[active].snippet}</code></pre>
        <CopyButton text={tabs[active].snippet} />
      </div>
    </div>
  );
}

type Exchange =
  | { state: "idle" }
  | { state: "sending"; preset: McpPreset; request: string }
  | { state: "done"; preset: McpPreset; request: string; status: number; ms: number; lines: string[]; raw: string }
  | { state: "failed"; preset: McpPreset; request: string };

/**
 * The console: real JSON-RPC calls to /api/mcp, the request on one side and the
 * answer on the other. It asks its first question once, when it first comes
 * into view, so the page opens with the server visibly working.
 */
export function McpConsole({ endpoint }: { endpoint: string }) {
  const [exchange, setExchange] = useState<Exchange>({ state: "idle" });
  const [active, setActive] = useState<string | null>(null);
  const seq = useRef(0);
  const rootRef = useRef<HTMLElement>(null);

  const send = async (preset: McpPreset) => {
    const id = ++seq.current;
    const body = consoleRequest(preset, id);
    const request = JSON.stringify(body, null, 2);
    setActive(preset.id);
    setExchange({ state: "sending", preset, request });
    const started = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...consoleHeaders(preset) },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json();
      if (id !== seq.current) return;
      setExchange({
        state: "done",
        preset,
        request,
        status: res.status,
        ms: Math.round(performance.now() - started),
        lines: consoleSummary(preset, json),
        raw: JSON.stringify(json, null, 2),
      });
    } catch {
      if (id === seq.current) setExchange({ state: "failed", preset, request });
    }
  };

  // Held in a ref so the observer below is set up once and still calls the
  // current `send`.
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void sendRef.current(copy.presets[0]);
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={rootRef} className="mcp-console window" aria-labelledby="mcp-console-title">
      <div className="window__bar">
        <span className="window__title" id="mcp-console-title">{copy.ask}</span>
        <span className="mcp-console__live">{copy.askHint}</span>
      </div>
      <div className="mcp-console__body">
        <div className="mcp-console__presets">
          {copy.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mcp-console__preset"
              aria-pressed={active === p.id}
              onClick={() => void send(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mcp-console__panes">
          <div className="mcp-console__pane">
            <p className="mcp-console__label">{copy.request}</p>
            <pre className="mcp-console__code"><code>{exchange.state === "idle" ? "" : exchange.request}</code></pre>
          </div>
          <div className="mcp-console__pane mcp-console__pane--answer" aria-live="polite">
            <p className="mcp-console__label">
              {copy.answer}
              {exchange.state === "done" && <span className="mcp-console__meta">{exchange.status} · {exchange.ms} ms</span>}
            </p>
            {exchange.state === "idle" && <p className="mcp-console__hint">{copy.idle}</p>}
            {exchange.state === "sending" && <p className="mcp-console__hint mcp-console__hint--busy">{copy.sending}</p>}
            {exchange.state === "failed" && <p className="mcp-console__hint" role="alert">{copy.failed}</p>}
            {exchange.state === "done" && (
              <>
                <ul className="mcp-console__lines">
                  {exchange.lines.map((line, i) => <li key={i} style={{ "--i": i } as React.CSSProperties}>{line}</li>)}
                </ul>
                <details className="mcp-console__raw">
                  <summary>{copy.raw}</summary>
                  <pre className="mcp-console__code"><code>{exchange.raw}</code></pre>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
