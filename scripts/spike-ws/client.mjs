/**
 * S1 spike: a Node stand-in for app/spike-ws/page.tsx.
 *
 * Spike code. Never merges. Same behaviour as the page (ping every 10 s,
 * reconnect with backoff, one log line per event, same grep-able tokens) but
 * driven from Node with the `ws` package, because the preview sits behind
 * deployment protection and a browser tab cannot be kept in the foreground of
 * its own window from here. The bypass secret comes from the BYPASS env var
 * and is never written to the log.
 *
 *   BYPASS=... node scripts/spike-ws/client.mjs url=wss://host/api/spike-ws name=a seconds=3600 out=.spike/s1-tab-a.log
 */
import WebSocket from "ws";
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const URL = args.url;
const NAME = args.name ?? "a";
const SECONDS = Number(args.seconds ?? 60);
const OUT = args.out ?? `.spike/s1-tab-${NAME}.log`;
const BYPASS = process.env.BYPASS ?? "";
const PING_MS = 10_000;
const BACKOFF_CAP_MS = 30_000;
const TAB = `${NAME}${Math.random().toString(36).slice(2, 5)}`;

const stats = { opens: 0, closes: 0, pingsSent: 0, echoes: 0, peers: 0, instances: {}, lifetimesS: [], rttMs: [], gapsMs: [], codes: {} };
let stop = false;
let socket = null;
let attempt = 0;
let lastCloseAt = null;
let pingTimer = null;
let reconnectTimer = null;
const startedAt = Date.now();

fs.writeFileSync(OUT, "");
const say = (s) => {
  const line = `${new Date().toISOString()} ${s}`;
  console.log(line);
  fs.appendFileSync(OUT, line + "\n");
};
const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const summary = () => ({
  tab: TAB, elapsedS: (Date.now() - startedAt) / 1000, ...stats,
  medianLifetimeS: med(stats.lifetimesS), maxLifetimeS: stats.lifetimesS.length ? Math.max(...stats.lifetimesS) : null,
  medianGapMs: med(stats.gapsMs), maxGapMs: stats.gapsMs.length ? Math.max(...stats.gapsMs) : null,
  medianRttMs: med(stats.rttMs),
  socketHours: stats.lifetimesS.reduce((a, b) => a + b, 0) / 3600,
});

function connect() {
  if (stop) return;
  const openedAt = Date.now();
  let seq = 0;
  say(`connect attempt=${attempt} ${URL}`);
  socket = new WebSocket(URL, { headers: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {} });

  socket.on("upgrade", (res) => say(`upgrade status=${res.statusCode}`));
  socket.on("unexpected-response", (req, res) => {
    let body = "";
    res.on("data", (c) => { body += c; });
    res.on("end", () => say(`unexpected-response status=${res.statusCode} body=${JSON.stringify(body.slice(0, 300))}`));
  });

  socket.on("open", () => {
    const gap = lastCloseAt === null ? null : Date.now() - lastCloseAt;
    say(`open tab=${TAB} gapSinceLastCloseMs=${gap ?? "n/a"}`);
    stats.opens += 1;
    if (gap !== null) stats.gapsMs.push(gap);
    pingTimer = setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      seq += 1;
      socket.send(JSON.stringify({ t: "ping", tab: TAB, seq, sent: Date.now() }));
      stats.pingsSent += 1;
    }, PING_MS);
  });

  socket.on("message", (data) => {
    let m = {};
    try { m = JSON.parse(String(data)); } catch { say(`raw ${String(data).slice(0, 100)}`); return; }
    const inst = String(m.instance ?? "?");
    if (m.t === "hello") {
      say(`hello instance=${inst} redis=${String(m.redis)}`);
      stats.instances[inst] = (stats.instances[inst] ?? 0) + 1;
    } else if (m.t === "echo") {
      const rtt = Date.now() - Number(m.sent);
      stats.echoes += 1; stats.rttMs.push(rtt);
      if (Number(m.seq) % 6 === 0) say(`echo seq=${String(m.seq)} rttMs=${rtt} ageMs=${String(m.ageMs)} instance=${inst}`);
    } else if (m.t === "peer") {
      stats.peers += 1;
      say(`peer from tab=${String(m.tab)} seq=${String(m.seq)} via instance=${inst}`);
    }
  });

  socket.on("close", (code, reason) => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    const lifetimeS = (Date.now() - openedAt) / 1000;
    lastCloseAt = Date.now();
    say(`close code=${code} reason="${String(reason ?? "")}" lifetimeS=${lifetimeS.toFixed(1)}`);
    stats.closes += 1; stats.lifetimesS.push(lifetimeS);
    stats.codes[code] = (stats.codes[code] ?? 0) + 1;
    if (stop) return;
    if (lifetimeS > 60) attempt = 0;
    const delay = Math.min(BACKOFF_CAP_MS, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
    attempt += 1;
    say(`reconnect in ${delay}ms`);
    reconnectTimer = setTimeout(connect, delay);
  });

  socket.on("error", (e) => say(`error ${String(e.message ?? e).slice(0, 200)}`));
}

connect();
const statTimer = setInterval(() => { const s = summary(); say(`stat opens=${s.opens} closes=${s.closes} pings=${s.pingsSent} echoes=${s.echoes} peers=${s.peers} socketHours=${s.socketHours.toFixed(3)} instances=${JSON.stringify(s.instances)}`); }, 300_000);
setTimeout(() => {
  stop = true;
  clearInterval(statTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, "spike done");
  setTimeout(() => {
    const s = summary();
    say(`summary ${JSON.stringify(s)}`);
    fs.writeFileSync(`${OUT}.summary.json`, JSON.stringify(s, null, 2));
    process.exit(0);
  }, 1500);
}, SECONDS * 1000);
