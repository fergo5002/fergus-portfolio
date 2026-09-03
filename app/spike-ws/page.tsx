"use client";

import { useEffect, useRef, useState } from "react";

/**
 * S1 spike client. Opens a socket to /api/spike-ws, pings every 10 s,
 * reconnects with backoff, and keeps a log you can copy into .spike/.
 *
 * Spike code. Never merges. Deliberately unstyled.
 */

const PING_MS = 10_000;
const BACKOFF_CAP_MS = 30_000;
const TAB = Math.random().toString(36).slice(2, 6);

type Stats = {
  opens: number;
  closes: number;
  pingsSent: number;
  echoes: number;
  peers: number;
  instances: Record<string, number>;
  lifetimesS: number[];
  rttMs: number[];
  gapsMs: number[];
};

const initial = (): Stats => ({
  opens: 0, closes: 0, pingsSent: 0, echoes: 0, peers: 0,
  instances: {}, lifetimesS: [], rttMs: [], gapsMs: [],
});

export default function SpikeWsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(initial);
  const statsRef = useRef<Stats>(initial());
  const stopRef = useRef(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let attempt = 0;
    let lastCloseAt: number | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const say = (s: string) => {
      const line = `${new Date().toISOString()} ${s}`;
      console.log(line);
      setLines((prev) => [...prev.slice(-400), line]);
    };
    const bump = (fn: (s: Stats) => void) => {
      fn(statsRef.current);
      setStats({ ...statsRef.current });
    };

    const connect = () => {
      if (stopRef.current) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${location.host}/api/spike-ws`;
      const openedAt = Date.now();
      let seq = 0;
      say(`connect attempt=${attempt} ${url}`);
      socket = new WebSocket(url);

      socket.onopen = () => {
        const gap = lastCloseAt === null ? null : Date.now() - lastCloseAt;
        say(`open tab=${TAB} gapSinceLastCloseMs=${gap ?? "n/a"}`);
        bump((s) => { s.opens += 1; if (gap !== null) s.gapsMs.push(gap); });
        pingTimer = setInterval(() => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          seq += 1;
          socket.send(JSON.stringify({ t: "ping", tab: TAB, seq, sent: Date.now() }));
          bump((s) => { s.pingsSent += 1; });
        }, PING_MS);
      };

      socket.onmessage = (ev) => {
        let m: Record<string, unknown> = {};
        try { m = JSON.parse(String(ev.data)); } catch { say(`raw ${String(ev.data).slice(0, 100)}`); return; }
        const inst = String(m.instance ?? "?");
        if (m.t === "hello") {
          say(`hello instance=${inst} redis=${String(m.redis)}`);
          bump((s) => { s.instances[inst] = (s.instances[inst] ?? 0) + 1; });
        } else if (m.t === "echo") {
          const rtt = Date.now() - Number(m.sent);
          bump((s) => { s.echoes += 1; s.rttMs.push(rtt); });
          if (Number(m.seq) % 6 === 0) say(`echo seq=${String(m.seq)} rttMs=${rtt} ageMs=${String(m.ageMs)} instance=${inst}`);
        } else if (m.t === "peer") {
          bump((s) => { s.peers += 1; });
          say(`peer from tab=${String(m.tab)} seq=${String(m.seq)} via instance=${inst}`);
        }
      };

      socket.onclose = (ev) => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        const lifetimeS = (Date.now() - openedAt) / 1000;
        lastCloseAt = Date.now();
        say(`close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} lifetimeS=${lifetimeS.toFixed(1)}`);
        bump((s) => { s.closes += 1; s.lifetimesS.push(lifetimeS); });
        // A socket that lived over a minute was healthy; do not punish the next attempt.
        if (lifetimeS > 60) attempt = 0;
        const delay = Math.min(BACKOFF_CAP_MS, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
        attempt += 1;
        say(`reconnect in ${delay}ms`);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => say("error (see close)");
    };

    connect();
    return () => {
      stopRef.current = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const med = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
  const socketHours = stats.lifetimesS.reduce((a, b) => a + b, 0) / 3600;

  return (
    <main>
      <h1>S1 spike: tab {TAB}</h1>
      <p>
        opens {stats.opens} · closes {stats.closes} · pings {stats.pingsSent} · echoes {stats.echoes} · peers {stats.peers}
        · median lifetime {med(stats.lifetimesS)?.toFixed(1) ?? "-"} s · median reconnect gap {med(stats.gapsMs) ?? "-"} ms
        · median rtt {med(stats.rttMs) ?? "-"} ms · socket-hours {socketHours.toFixed(3)}
        · instances {JSON.stringify(stats.instances)}
      </p>
      <button type="button" onClick={() => navigator.clipboard.writeText(lines.join("\n"))}>copy log</button>
      <pre>{lines.join("\n")}</pre>
    </main>
  );
}
