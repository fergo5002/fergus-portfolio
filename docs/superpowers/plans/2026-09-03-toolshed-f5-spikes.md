# F5 spikes: four briefs

**Date:** 2026-09-03. **Programme:** `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6 (F5), sections 4, 5, 9 and 10. **Ledger rows:** S1 to S4.

## What a spike is here

A spike is a time-boxed experiment. It is allowed to fail. It is not allowed to come back without a measurement. The output of a spike is a number and a decision, never a feature.

Rules, all four:

1. **Prediction first.** Each brief carries a prediction written before anything ran, with the result that would falsify it. Copy it verbatim into the decision record before you start, then write what actually happened beside it. A spike whose prediction was written after the run is a story, not a test.
2. **Time box.** Hours per brief below. When the box runs out, write the record with what you have, including "did not get to". Do not extend the box to make the result tidier.
3. **Own worktree, own branch, nothing merges.** Branch `toolshed/s<n>-<slug>`, in a sibling worktree made through the wrapper. Nothing from a spike branch merges to `main` except its decision record at `docs/superpowers/spikes/<id>-<slug>.md`, which lands as a docs-only commit. Dependencies added on a spike branch die with it; the programme earns them separately, on the sub-project's own PR, per AGENTS.md.
4. **Rung on every claim.** Per `C:\Users\oreil\.claude\CLAIMS.md`: guessed, observed, reproduced, isolated, explained. A number read off a dashboard once is observed. A number read twice with the same setup is reproduced. Say which.

Preview deployments only. No spike touches production, and `--prod` never appears in a spike. Two ways to get a preview:

```bash
# (a) CLI from the worktree. Link once, then deploy without --prod.
cd /c/Dev/fergus-portfolio-s1-websocket
vercel link --scope larry-pm --project fergus-portfolio --yes --token "$VERCEL_TOKEN_PERSONAL"
vercel deploy --scope larry-pm --yes --token "$VERCEL_TOKEN_PERSONAL"
# prints https://fergus-portfolio-<hash>-larry-pm.vercel.app

# (b) Git-linked preview on a pull request (needs F0 merged: public repo, git deploys READY).
git push -u origin toolshed/s1-websocket
gh pr create --draft --title "spike(s1): websocket on hobby" --body "Spike branch. Never merges. Record goes to docs/superpowers/spikes/."
DEP=$(gh api "repos/fergo5002/fergus-portfolio/deployments?ref=toolshed/s1-websocket&per_page=1" --jq '.[0].id')
gh api "repos/fergo5002/fergus-portfolio/deployments/$DEP/statuses" --jq '.[0] | .state, .environment_url'
```

Whichever route, confirm the deployment is real before measuring anything. `vercel ls` renders `BLOCKED` as `UNKNOWN`, so read the API:

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=3&target=preview" \
  | python -c "import sys,json; [print(x['uid'], x.get('readyState'), x.get('url'), (x.get('meta') or {}).get('githubCommitRef','')) for x in json.load(sys.stdin)['deployments']]"
```

Expected: your deployment as `READY`. If it is `BLOCKED`, the staging-tree workaround in `docs/PROGRESS.md` ("Why deploying was hard") applies to preview deploys too: `git archive HEAD | tar -x -C "$STAGE"`, copy `.vercel/` in, deploy from there, still without `--prod`.

Worktree, per brief (replace the number and slug):

```powershell
& 'C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1' create -Repository 'C:\Dev\fergus-portfolio' -Branch 'toolshed/s1-websocket'
& 'C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1' path -Repository 'C:\Dev\fergus-portfolio' -Branch 'toolshed/s1-websocket'
```

The `path` line prints where the worktree landed. The briefs below assume `C:\Dev\fergus-portfolio-s<n>-<slug>`; substitute the printed path if it differs. Run `npm install --legacy-peer-deps` once in the new worktree before adding anything (the `@vercel/analytics` peer trap in AGENTS.md). Scratch output goes in `.spike/` inside the worktree; add that directory to `.git/info/exclude`, never to `.gitignore`, because nothing on the branch merges.

Where to read the meters, all four briefs:

- **Provisioned Memory (GB-hours), Active CPU (hours), Invocations:** Vercel dashboard, team `larry-pm`, Usage tab, `https://vercel.com/larry-pm/~/usage`, Functions section. The page lags. Assume up to an hour, record the wall-clock time of every reading, and take the baseline reading described in each brief so the background draw from production (the MCP route, the contact form, headline-check) is separated from the spike.
- **Function logs:** `vercel logs <deployment-url> --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"` tails runtime logs on CLI 58. The dashboard equivalent is the deployment page, Logs tab, filtered by route. Every spike route prints one JSON line per event, so the logs are machine-readable.
- **Timing in code:** every route returns its own timings in the response body and prints them too. Those are the primary numbers. The dashboard confirms them.

Decision record template, used by all four (copy to `docs/superpowers/spikes/<id>-<slug>.md`):

```markdown
# S<n> <title>: decision record

- Date run: <yyyy-mm-dd>, by <who>, worktree <path>, branch <name>, commit <sha>
- Preview deployment(s): <uid> <url> (READY confirmed via API at <time>)
- Hours spent: <n> of <box>

## Question
<one sentence, copied from the brief>

## Prediction (copied verbatim from the brief before running)
<...>
Falsified by: <...>

## What ran
<commands, in order, with anything that differed from the brief and why>

## Measurements
| Name | Value | Where read | When | Rung |
|---|---|---|---|---|
| ... | ... | usage page / logs / response body | hh:mm | observed / reproduced |

## Result against the prediction
<confirmed | falsified | inconclusive>, because <the specific reading that decided it>

## Decision
<the decision rule applied, with the numbers substituted, and the outcome for the dependent sub-project>

## Not verified
<what this spike could not see>

## Meters moved
<Provisioned Memory before/after, Active CPU before/after, invocations, with timestamps>
```

---

## S1 WebSocket on Hobby

**Question:** Does a WebSocket route upgrade on this Hobby project at all, and if it does, how many Provisioned Memory GB-hours does one hour of one held socket cost, and what does the 300-second cut look like from the client?

**Prediction (written 2026-09-03, before running):** The upgrade returns 101 on Hobby once Fluid compute is on (guessed from the platform docs; if Fluid is off the route fails with an error naming it). Every held socket is closed by the platform at 300 s, plus or minus 5 s, with close code 1006 (guessed; 1000 or 1001 would not change the decision), and the client reconnects inside 2 s. The usage page rises by about 2 GB-hours per instance-hour: two tabs on one instance cost 2 GB-hours for the hour, two tabs on two instances cost 4. That is the design's assumption in section 4. **Falsified by:** (a) no 101 at all, which takes sockets off the table and makes the cost question moot; (b) the meter rising by under 0.5 GB-hours per socket-hour with the logs proving sockets were open the whole time, which would mean a held socket is not billed as provisioned time and the design's "batched HTTP by default" is more cautious than it needs to be.

**Time box:** 4 hours, of which one is the hold.

**Dependencies:** Fluid compute on for the project. `@vercel/functions` on the spike branch only. Upstash is optional: if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set on the preview, fan-out goes through Redis; if not, fan-out is in-instance only and the record says so.

### Steps

**1. Worktree and dependency.**

```powershell
& 'C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1' create -Repository 'C:\Dev\fergus-portfolio' -Branch 'toolshed/s1-websocket'
```

```bash
cd /c/Dev/fergus-portfolio-s1-websocket
npm install --legacy-peer-deps
npm install @vercel/functions --legacy-peer-deps
mkdir -p .spike && printf '.spike/\n' >> .git/info/exclude
```

**2. Check Fluid compute is on.** The upgrade needs it. Read it from the API, and if the field is not where this expects, use the dashboard (Project, Settings, Functions, the Fluid Compute toggle) and say which you used:

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v9/projects/prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx?teamId=team_SW7xEyTEz5ftQj3cIxulWxKG" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('resourceConfig'), indent=2))"
```

Expected: a `resourceConfig` object with a `fluid` key (guessed field name; it is the one the CLI writes). If `fluid` is false, turn it on in the dashboard for this project before deploying and note the time, because that changes the billing model for every function on the project, production included. Record the before and after.

**3. The route.** `app/api/spike-ws/route.ts`:

```ts
import { experimental_upgradeWebSocket } from "@vercel/functions";

/**
 * S1 spike: a WebSocket that echoes, fans out, and reports its own lifetime.
 *
 * Spike code. Never merges. Every event prints one JSON line so `vercel logs`
 * is machine-readable, and the same facts go back to the client so the tab
 * log and the function log can be lined up by timestamp.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby's ceiling. The platform closes the socket here; we want to see it.
export const maxDuration = 300;

type Handler = Parameters<typeof experimental_upgradeWebSocket>[0];
type Socket = Parameters<Handler>[0];

const BOOT = Date.now();
// Six characters that identify this instance. Two tabs printing different
// values are on different instances, which is what the fan-out test needs.
const INSTANCE = Math.random().toString(36).slice(2, 8);
const CHANNEL = "spike-ws";

const sockets = new Set<Socket>();
let subscription: AbortController | null = null;

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ spike: "s1", instance: INSTANCE, t: Date.now(), event, ...fields }));
}

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function localBroadcast(payload: string, except?: Socket): void {
  for (const s of sockets) {
    if (s === except) continue;
    try {
      s.send(payload);
    } catch (error) {
      log("send_failed", { error: String(error) });
    }
  }
}

/** PUBLISH over the Upstash REST API: POST the command as a JSON array. */
async function publish(payload: string): Promise<void> {
  const creds = upstash();
  if (!creds) return;
  const res = await fetch(creds.url, {
    method: "POST",
    headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json" },
    body: JSON.stringify(["PUBLISH", CHANNEL, payload]),
  });
  if (!res.ok) log("publish_failed", { status: res.status });
}

/**
 * SUBSCRIBE over Upstash's REST SSE endpoint, `/subscribe/<channel>`.
 *
 * Rung: guessed from the Upstash REST docs as remembered. The line shape is
 * expected to be `data: message,<channel>,<payload>`; the parser logs every
 * raw line so a different shape is visible rather than silently dropped. If
 * the endpoint does not exist (404), the record says fan-out was in-instance
 * only and the cross-instance question stays open.
 */
async function subscribe(): Promise<void> {
  const creds = upstash();
  if (!creds || subscription) return;
  subscription = new AbortController();
  log("subscribe_start");
  try {
    const res = await fetch(`${creds.url}/subscribe/${CHANNEL}`, {
      headers: { authorization: `Bearer ${creds.token}`, accept: "text/event-stream" },
      signal: subscription.signal,
    });
    if (!res.ok || !res.body) {
      log("subscribe_failed", { status: res.status });
      subscription = null;
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const body = line.slice(5).trim();
        log("subscribe_line", { raw: body.slice(0, 120) });
        const prefix = `message,${CHANNEL},`;
        if (!body.startsWith(prefix)) continue;
        const payload = body.slice(prefix.length);
        // Do not re-deliver a message this instance published: the sender
        // already got it locally. The payload carries the instance id.
        try {
          if (JSON.parse(payload).instance === INSTANCE) continue;
        } catch {
          continue;
        }
        localBroadcast(payload);
      }
    }
  } catch (error) {
    if (!subscription?.signal.aborted) log("subscribe_error", { error: String(error) });
  } finally {
    log("subscribe_end");
    subscription = null;
  }
}

export async function GET(): Promise<Response> {
  const sinceBoot = Date.now() - BOOT;
  log("upgrade_attempt", { sinceBoot, coldStart: sinceBoot < 250, open: sockets.size });

  return experimental_upgradeWebSocket((ws) => {
    const openedAt = Date.now();
    sockets.add(ws);
    log("open", { open: sockets.size, redis: upstash() !== null });
    void subscribe();

    ws.send(JSON.stringify({ t: "hello", instance: INSTANCE, openedAt, redis: upstash() !== null }));

    ws.on("message", (data: unknown) => {
      const text = typeof data === "string" ? data : String(data);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { t: "raw", raw: text.slice(0, 200) };
      }
      const now = Date.now();
      // Echo to the sender, with the instance and the socket's age.
      ws.send(JSON.stringify({ ...parsed, t: "echo", instance: INSTANCE, ageMs: now - openedAt, serverT: now }));
      // Fan out to everyone else, locally and through Redis.
      const peer = JSON.stringify({ ...parsed, t: "peer", instance: INSTANCE, serverT: now });
      localBroadcast(peer, ws);
      void publish(peer);
    });

    ws.on("close", (code: unknown, reason: unknown) => {
      sockets.delete(ws);
      const lifetimeMs = Date.now() - openedAt;
      log("close", { code, reason: String(reason ?? ""), lifetimeMs, open: sockets.size });
      if (sockets.size === 0 && subscription) {
        subscription.abort();
        subscription = null;
      }
    });

    ws.on("error", (error: unknown) => {
      log("error", { error: String(error) });
    });
  });
}
```

If `tsc` rejects the `ws.on` signatures, the package's own types are the authority; adjust the handler to them and note the difference in the record. That is a five-minute fix, not a finding.

**4. The client page.** `app/spike-ws/page.tsx`:

```tsx
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
```

**5. Optional Redis credentials on the preview, scoped to this branch only.** Skip this step if F4 has not provisioned Upstash yet; the record then says "fan-out: in-instance only, cross-instance not tested".

```bash
printf '%s' "$UPSTASH_REDIS_REST_URL"   | vercel env add UPSTASH_REDIS_REST_URL   preview toolshed/s1-websocket --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"
printf '%s' "$UPSTASH_REDIS_REST_TOKEN" | vercel env add UPSTASH_REDIS_REST_TOKEN preview toolshed/s1-websocket --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"
```

**6. Type-check, commit, deploy a preview.**

```bash
cd /c/Dev/fergus-portfolio-s1-websocket
npx tsc --noEmit
git add app/api/spike-ws/route.ts app/spike-ws/page.tsx package.json package-lock.json
git commit -m "spike(s1): websocket echo and fan-out route, never merges"
vercel link --scope larry-pm --project fergus-portfolio --yes --token "$VERCEL_TOKEN_PERSONAL"
vercel deploy --scope larry-pm --yes --token "$VERCEL_TOKEN_PERSONAL" | tee .spike/s1-deploy.txt
```

Confirm `READY` with the v6 API call from the header. Put the URL in `URL`.

**7. Prove the instrument: does it upgrade.** Before holding anything open for an hour, one socket for one minute:

```bash
URL=https://fergus-portfolio-<hash>-larry-pm.vercel.app
vercel logs "$URL" --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL" | tee .spike/s1-logs.txt &
```

Open `$URL/spike-ws` in one tab. In DevTools, Network, filter WS: the request to `/api/spike-ws` must show status `101 Switching Protocols`, and the page must print `hello instance=…`. If instead the page loops on `close code=1006` with no `hello`, read the response in Network: a 500 with a message about Fluid compute or the upgrade means step 2 was wrong, a 426 or 404 means the route did not build as a WebSocket route. Record the exact status and body. **If there is no 101 within 15 minutes of trying, stop: the spike's measurement is "does not upgrade on Hobby, error: <exact text>", and the decision rule's first branch applies.**

**8. Baseline the meter.** Read `Provisioned Memory` and `Active CPU` from the usage page and write both with the time. Wait 60 minutes with no tabs open and read again. That difference is the background draw of production over an hour, and the spike's cost is measured over it.

```
.spike/s1-meter.txt
T-60  hh:mm  provisioned=<x> GB-h  cpu=<y> h  invocations=<z>
T0    hh:mm  provisioned=<x> GB-h  cpu=<y> h  invocations=<z>
```

**9. The hold.** At T0 open `$URL/spike-ws` in two tabs, in two different browser profiles or one normal and one incognito window (so two connections rather than one shared). Leave both in the foreground of their own windows: a background tab clamps timers, which would make the ping interval and the reconnect timing evidence about the tab rather than the socket (CLAIMS.md, rule 1). Note the instance id each tab printed on `hello`. Every 15 minutes glance at each tab's stat line and write the socket-hours figure down. At T+60 close both tabs, copy each log with the button into `.spike/s1-tab-a.log` and `.spike/s1-tab-b.log`, and read the meter. Read it again at T+120.

**10. Reduce the logs.**

```bash
cd /c/Dev/fergus-portfolio-s1-websocket
for f in .spike/s1-tab-a.log .spike/s1-tab-b.log; do
  echo "== $f"
  grep -c ' open ' "$f"
  grep -o 'lifetimeS=[0-9.]*' "$f" | cut -d= -f2 | sort -n | awk '{a[NR]=$1} END {print "lifetimes n="NR" min="a[1]" median="a[int((NR+1)/2)]" max="a[NR]}'
  grep -o 'code=[0-9]*' "$f" | sort | uniq -c
  grep -o 'gapSinceLastCloseMs=[0-9]*' "$f" | cut -d= -f2 | sort -n | awk '{a[NR]=$1} END {print "reconnect gap ms n="NR" median="a[int((NR+1)/2)]" max="a[NR]}'
  grep -c ' peer ' "$f"
  grep -o 'instance=[a-z0-9]*' "$f" | sort | uniq -c
done
grep '"event":"close"' .spike/s1-logs.txt | grep -o '"lifetimeMs":[0-9]*' | cut -d: -f2 | sort -n | tail -3
```

### Measurements to take

| Measurement | Where |
|---|---|
| Upgrade works: HTTP 101 seen, `hello` received | DevTools Network (WS filter) and the tab log |
| Socket lifetime at the cut: n, median, max, in seconds | tab logs, `lifetimeS=`; cross-check `lifetimeMs` in the function log |
| Close code at the cut | tab logs, `code=` |
| Reconnect gap: median and max ms | tab logs, `gapSinceLastCloseMs=` |
| Ping RTT median | tab stat line |
| Instances seen by each tab, and whether the two tabs shared one | `hello instance=` in each tab log |
| Peer messages received per tab (fan-out) | tab stat line, `peers` |
| Socket-hours held, sum over both tabs | tab stat lines at T+60 |
| Provisioned Memory GB-hours at T-60, T0, T+60, T+120 | usage page, `https://vercel.com/larry-pm/~/usage` |
| Cost per socket-hour = ((T+120) − T0 − 2 × (T0 − (T-60))) / socket-hours | arithmetic on the above; show it |
| Invocations added over the hour | usage page; expect one per reconnect, so about 12 per tab |

### Decision rule

For Burn (X1) and Pong (G1), whose designs already prefer batched HTTP and WebRTC:

- **No 101 on Hobby**, after Fluid is confirmed on: WebSockets are off the table for the programme. Burn is batched HTTP every 4 s while visible and moving; Pong is WebRTC with the relay doing only the offer and answer over HTTP. `@vercel/functions` is not earned. Record the exact error.
- **101, and cost per socket-hour ≥ 0.5 GB-hours** (the predicted case: about 2 per instance-hour): a held socket costs 1,440 GB-hours a month if always open, four times the whole allotment, and Burn's 100 visitor-hours a month would cost 50 to 200 GB-hours, a third to a half of it. Same outcome as above: batched HTTP for Burn, WebRTC for Pong, no `@vercel/functions`. This is the design's default and the spike merely confirms the number.
- **101, and cost per socket-hour ≤ 0.3 GB-hours**, with the logs proving the sockets were open the whole hour: 100 visitor-hours costs at most 30 GB-hours, under a tenth of the allotment. Then Burn may push heat deltas over a socket instead of polling, and Pong may use the socket for signalling. The reconnect must also be clean: median gap under 2 s and no close code other than the one at 300 s. If either fails, batched HTTP anyway.
- **Between 0.3 and 0.5:** batched HTTP. The saving is not worth a transport with a 300-second reset in it.
- **Fan-out:** if both tabs landed on the same instance (one instance id in both logs), cross-instance fan-out was not tested and the record says so; do not extend the box to force two instances. If they landed on two and `peers` stayed at zero, Redis fan-out failed and the `subscribe_*` log lines say where.

Whichever branch, the ledger row S1 gets the cost per socket-hour and the close code, because the number is what the Meters section of the ledger is for.

---

## S2 WebKit in a function

**Question:** Can a Vercel Hobby function launch Playwright's WebKit and screenshot a page, and if not, how fast and how CPU-hungry is `@sparticuz/chromium` under `playwright-core` with iPhone emulation?

**Prediction (written 2026-09-03, before running):** WebKit does not launch. The Linux build wants libicu, libwebp, gstreamer and a dozen more shared libraries the runtime does not have, so `launch()` fails within 5 s with Playwright's "Host system is missing dependencies" box or a loader error naming a `.so`. The function with WebKit inside it is over 250 MB unpacked, so it needs `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` to deploy at all. Chromium from `@sparticuz/chromium` launches; cold start (first request on a fresh instance) is 3 to 8 s, a warm render of `https://fergusoreilly.dev` at 390 wide finishes in under 4 s, and the two-width run costs under 8 CPU-seconds. **Falsified by:** WebKit launching and returning a PNG (then the tool gets the real engine and the report's first line changes); Chromium cold start over 30 s or any run over 60 s (the tool as designed does not fit a Hobby function); or measured CPU per two-width run over 10.4 s (then the daily cap in section 5 has to drop, see the decision rule).

**Time box:** 6 hours. Phase A (WebKit) gets at most 2 of them, because the expected outcome is a failure and the value is in the exact error text.

**Dependencies:** `playwright-core` and `@sparticuz/chromium` on the spike branch. Fluid compute on (large functions need it; S1 step 2 checks it). `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` on preview for this branch only.

### Steps

**1. Worktree and dependencies.** Pin the pair. `@sparticuz/chromium`'s README carries a table of which Chromium major each release ships; `playwright-core` expects the Chromium major in its own `browsers.json`. Read both and pick the sparticuz release whose major matches, or the nearest below it. Write the two versions in the record.

```bash
cd /c/Dev/fergus-portfolio-s2-webkit
npm install --legacy-peer-deps
npm install playwright-core --legacy-peer-deps
python -c "import json; b=json.load(open('node_modules/playwright-core/browsers.json')); [print(x['name'], x['revision'], x.get('browserVersion')) for x in b['browsers']]"
npm view @sparticuz/chromium versions --json | python -c "import sys,json; print(json.load(sys.stdin)[-6:])"
npm install @sparticuz/chromium@<major matching the chromium browserVersion above> --legacy-peer-deps
mkdir -p .spike && printf '.spike/\n' >> .git/info/exclude
```

**2. Ship the WebKit binary inside the function bundle.** Three things have to be true: the Linux build must be downloaded during the Vercel build (not on the Windows machine, which would fetch the Windows build), it must land somewhere the file tracer can be told about, and the tracer must be told. `PLAYWRIGHT_BROWSERS_PATH=0` makes Playwright install into `node_modules/playwright-core/.local-browsers/`, which is inside the tree and therefore a path `outputFileTracingIncludes` can name.

`vercel.json` on the spike branch (the repo has none today):

```json
{
  "buildCommand": "PLAYWRIGHT_BROWSERS_PATH=0 npx playwright-core install webkit && du -sh node_modules/playwright-core/.local-browsers && next build"
}
```

`next.config.ts`, add inside `nextConfig` (keep everything already there):

```ts
  // S2 spike only. Keeps the two browser packages out of the webpack bundle so
  // they resolve their binaries from node_modules by __dirname, and tells the
  // tracer to carry the binaries into the function.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/spike-render": [
      "./node_modules/playwright-core/.local-browsers/**/*",
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
```

Set the two environment variables on preview, this branch only. `PLAYWRIGHT_BROWSERS_PATH=0` is needed at runtime too, so Playwright looks in the package directory rather than `~/.cache`:

```bash
printf '1' | vercel env add VERCEL_SUPPORT_LARGE_FUNCTIONS preview toolshed/s2-webkit --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"
printf '0' | vercel env add PLAYWRIGHT_BROWSERS_PATH        preview toolshed/s2-webkit --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"
```

What to expect from the build: the Vercel build image is Amazon Linux, not Ubuntu, and Playwright's installer picks a build by host platform. Either it warns that the platform is unknown and falls back to an Ubuntu build (most likely), or it refuses. Either way the build log line is a measurement: copy it. The `du -sh` prints the browser's on-disk size; that is the number that decides whether the large-function flag was needed, so copy that too.

**3. The route.** `app/api/spike-render/route.ts`. One route, two engines, chosen by query string, so the deploy is shared and the comparison is on the same instance class:

```ts
import { chromium as playwrightChromium, webkit, devices, type Browser } from "playwright-core";

/**
 * S2 spike: render one known page in a function and report timings.
 *
 * Spike code. Never merges. The only URL it ever loads is this site, fixed
 * below, so there is no fence question here; the real tool routes every
 * navigation through lib/fence.ts and this does not stand in for that.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET = "https://fergusoreilly.dev";
const BOOT = Date.now();
let requestsOnThisInstance = 0;

type Engine = "webkit" | "chromium";

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ spike: "s2", t: Date.now(), event, ...fields }));
}

/** Width and height straight out of the PNG header, so no image library is needed. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function launch(engine: Engine): Promise<{ browser: Browser; executablePath: string; args: string[] }> {
  if (engine === "webkit") {
    const executablePath = webkit.executablePath();
    const browser = await webkit.launch({ headless: true, executablePath });
    return { browser, executablePath, args: [] };
  }
  // Imported lazily so a WebKit run does not pay for unpacking Chromium.
  const sparticuz = (await import("@sparticuz/chromium")).default;
  const executablePath = await sparticuz.executablePath();
  // `--single-process` is in sparticuz's default args for Lambda and is a
  // known cause of hangs under Playwright. First try with the full list; if
  // launch() hangs past 20 s, set DROP_SINGLE_PROCESS=1 on the preview and
  // redeploy. Both outcomes go in the record.
  const args = process.env.DROP_SINGLE_PROCESS === "1"
    ? sparticuz.args.filter((a) => a !== "--single-process")
    : sparticuz.args;
  const browser = await playwrightChromium.launch({ headless: true, executablePath, args });
  return { browser, executablePath, args };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const engine = (url.searchParams.get("engine") === "webkit" ? "webkit" : "chromium") as Engine;
  const widths = (url.searchParams.get("widths") ?? "390,320").split(",").map((w) => Number(w));

  requestsOnThisInstance += 1;
  const sinceBootMs = Date.now() - BOOT;
  const coldStart = requestsOnThisInstance === 1;
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  const timings: Record<string, number> = {};
  const shots: Array<{ width: number; height: number; bytes: number; ms: number }> = [];
  let executablePath = "";
  let browser: Browser | null = null;

  log("start", { engine, widths, coldStart, sinceBootMs, requestsOnThisInstance });

  try {
    const launched = await launch(engine);
    browser = launched.browser;
    executablePath = launched.executablePath;
    timings.launchMs = Math.round(performance.now() - t0);

    for (const width of widths) {
      const tShot = performance.now();
      // iPhone 13 emulation: viewport, scale factor 3, touch, mobile UA. At
      // 320 only the width changes, which is the SE-class case the phone
      // rule in coding-policy names.
      const context = await browser.newContext({
        ...devices["iPhone 13"],
        viewport: { width, height: width === 390 ? 844 : 568 },
      });
      const page = await context.newPage();
      await page.goto(TARGET, { waitUntil: "networkidle", timeout: 25_000 });
      const png = await page.screenshot({ fullPage: false, type: "png" });
      await context.close();
      const size = pngSize(Buffer.from(png));
      shots.push({ ...size, bytes: png.byteLength, ms: Math.round(performance.now() - tShot) });
    }
  } catch (error) {
    const cpu = process.cpuUsage(cpu0);
    const body = {
      ok: false,
      engine,
      coldStart,
      executablePath,
      error: String(error).slice(0, 2000),
      totalMs: Math.round(performance.now() - t0),
      nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    };
    log("fail", body);
    return Response.json(body, { status: 500 });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  const cpu = process.cpuUsage(cpu0);
  const body = {
    ok: true,
    engine,
    coldStart,
    sinceBootMs,
    requestsOnThisInstance,
    executablePath,
    shots,
    timings: { ...timings, totalMs: Math.round(performance.now() - t0) },
    // Node's own CPU only. The browser is a child process and is not in this
    // figure, so it is a floor, not the cost. The usage page has the ceiling.
    nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    memoryRssMb: Math.round(process.memoryUsage().rss / 1048576),
  };
  log("done", body);
  return Response.json(body);
}
```

Nothing is uploaded anywhere. The screenshot is measured for size and discarded. The response is a few hundred bytes, well inside the 4.5 MB cap that is the reason the real tool must use Blob.

**4. Type-check, commit, deploy the preview.**

```bash
cd /c/Dev/fergus-portfolio-s2-webkit
npx tsc --noEmit
git add vercel.json next.config.ts app/api/spike-render/route.ts package.json package-lock.json
git commit -m "spike(s2): webkit and chromium render route, never merges"
vercel link --scope larry-pm --project fergus-portfolio --yes --token "$VERCEL_TOKEN_PERSONAL"
vercel deploy --scope larry-pm --yes --token "$VERCEL_TOKEN_PERSONAL" 2>&1 | tee .spike/s2-deploy.txt
```

If the deploy fails on size, the error names the limit and the flag; that is a measurement (copy the line). If it fails because the flag is set and Fluid is off, that is S1 step 2's finding repeated. Confirm `READY` via the v6 API call from the header.

**5. Phase A: WebKit, one call, then twenty if it works.**

```bash
URL=https://fergus-portfolio-<hash>-larry-pm.vercel.app
vercel logs "$URL" --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL" | tee .spike/s2-logs.txt &
curl -s --max-time 70 "$URL/api/spike-render?engine=webkit" | tee .spike/s2-webkit-1.json; echo
```

Expected (the prediction): `ok: false` with an `error` that names missing libraries or a failed spawn, in under 5 s. Copy the whole error into the record; the exact library names are the deliverable of this phase. If instead `ok: true` comes back with two shots, run the twenty-run loop in step 6 with `engine=webkit` as well as `engine=chromium`, because then the decision is between two working engines and needs both sets of numbers.

**6. Phase B: Chromium, twenty runs.** Baseline the usage page first (Active CPU, Provisioned Memory, Invocations, with the time). Then:

```bash
cd /c/Dev/fergus-portfolio-s2-webkit
: > .spike/s2-chromium.jsonl
for i in $(seq 1 20); do
  curl -s --max-time 70 "$URL/api/spike-render?engine=chromium" >> .spike/s2-chromium.jsonl
  echo >> .spike/s2-chromium.jsonl
  # Every fifth run, wait long enough for the instance to be recycled so the
  # loop measures more than one cold start. Ten minutes is a guess at the
  # idle window; the coldStart flag in the response says whether it worked.
  if [ $((i % 5)) -eq 0 ] && [ "$i" -lt 20 ]; then sleep 600; fi
done
python - <<'PY'
import json, statistics as st
rows = [json.loads(l) for l in open('.spike/s2-chromium.jsonl') if l.strip()]
ok = [r for r in rows if r.get('ok')]
cold = [r for r in ok if r['coldStart']]
warm = [r for r in ok if not r['coldStart']]
def med(xs): return round(st.median(xs), 1) if xs else None
print('runs', len(rows), 'ok', len(ok), 'failed', len(rows) - len(ok))
print('cold n', len(cold), 'total ms median', med([r['timings']['totalMs'] for r in cold]), 'max', max([r['timings']['totalMs'] for r in cold], default=None))
print('warm n', len(warm), 'total ms median', med([r['timings']['totalMs'] for r in warm]), 'launch ms median', med([r['timings']['launchMs'] for r in warm]))
print('shot ms median per width', {w: med([s['ms'] for r in ok for s in r['shots'] if s['width'] == w]) for w in (390, 320)})
print('shot px', sorted({(s['width'], s['height']) for r in ok for s in r['shots']}))
print('node cpu ms median', med([r['nodeCpuMs'] for r in ok]), 'rss mb max', max([r['memoryRssMb'] for r in ok], default=None))
for r in rows:
    if not r.get('ok'): print('FAIL', r.get('error', '')[:300])
PY
```

Then read the usage page again, an hour after the last run, and once more two hours after. Active CPU for the twenty runs is the delta over the background rate. If the page shows too few decimals to resolve twenty runs (it may report hours to two places, and twenty runs at 5 CPU-seconds is 0.03 h), run another forty in one burst without the sleeps and read again; the record states which resolution the page gave.

### Measurements to take

| Measurement | Where |
|---|---|
| WebKit: launched or not, exact error text, time to failure | `.spike/s2-webkit-1.json`, `error` and `totalMs`; the function log `fail` line |
| WebKit build: installer warning, on-disk size, whether the flag was needed | Vercel build log for the deployment (the `du -sh` line and the installer's platform line) |
| Chromium cold start: n, median, max total ms | the Python reduction above |
| Chromium warm: median total ms, median launch ms, median per-width shot ms | same |
| Screenshot pixels at 390 and 320 (expect 1170×2532 and 960×1704 at scale 3) | `shots` in each response |
| Node-process CPU per run (a floor) | `nodeCpuMs` |
| Active CPU for the batch, minus background | usage page before, +1 h, +2 h; arithmetic shown |
| Provisioned Memory for the batch | same page, same times |
| RSS of the function process | `memoryRssMb` |
| Failures in twenty | count of `ok: false` |

### Decision rule

For On the glass (T5), and the exact sentence its report prints first:

- **WebKit launched and rendered both widths** (prediction falsified): the tool uses WebKit. Report first line: *"Rendered in WebKit, the engine inside every browser on an iPhone, on a server with no phone GPU."* The per-run cost figures below still apply to the cap.
- **WebKit failed, Chromium rendered both widths, warm run ≤ 40 s and cold ≤ 60 s** (the predicted case): the tool uses `@sparticuz/chromium` under `playwright-core` with `devices["iPhone 13"]`. Report first line: *"Measured in Chromium pretending to be an iPhone 13 at 390 and 320 wide. Not WebKit, so a Safari-only bug is invisible here."* The "can't see" list gains "WebKit itself" as the design already anticipates. The decision record carries the missing-library list so nobody re-runs phase A.
- **Neither engine rendered inside 60 s, or Chromium failed more than 2 of 20:** the interactive tool does not fit a Hobby function. T5 scales down to "request a run, come back later": the URL goes on a queue in Redis, the home machine's scheduler renders it with real Playwright and pushes the report to Blob, and the page says so. That is a design change and goes in the ledger's "decisions that changed the design" section for Fergus to see.
- **The cap, in every branch:** section 5 gave On the glass 1.3 CPU-hours a month at 15 renders a day. That is 10.4 CPU-seconds a render. The measured CPU per two-width run, taken from the usage page delta divided by runs (or, if the page cannot resolve it, the warm wall-clock time, since the instance is one vCPU and rendering is CPU-bound, so wall time is the ceiling), sets the global daily cap: `floor(1.3 × 3600 / 30 / cpuSecondsPerRun)`. The real tool does more than two screenshots (a scroll pass, three seconds of frame differencing, a second device), so budget three times the spike's figure. If the cap comes out under 5 a day, say so in the record: the tool is too expensive as designed and its spec must cut work per run before it starts.

---

## S3 DuckDB in the tab

**Question:** Do `hearth.shrink` and `hearth.expected_gap_days` from Tigh Sauna's migration 0300 port to DuckDB-WASM as macros and produce the same numbers as Postgres on 100,000 synthetic bookings, and what does the engine cost a phone to load?

**Prediction (written 2026-09-03, before running):** All three functions (`shrink`, `expected_gap_days`, and `blend_prior`, which feeds the second) port as `CREATE MACRO` with the body unchanged apart from the schema line, because the migration wrote them as `language sql` single expressions and a DuckDB macro is exactly that; there is no PL/pgSQL to port. Zero rows differ at 1e-9: Postgres carries `numeric` and DuckDB carries `DOUBLE`, but every input here has under 15 significant digits and the values stay under 540, so the disagreement is around 1e-13. The retention query over 100,000 rows runs in under 500 ms in the tab. The `eh` bundle transfers about 6 MB if the CDN compresses `.wasm` and about 35 MB if it does not (guessed raw size, the Resource Timing entry gives the real one), and instantiates in 4 to 8 s on Chrome's "Slow 4G" preset. Tab memory after the query stays under 300 MB. **Falsified by:** any macro refusing to create (then the port is CTEs, the design's mitigation); any row differing by more than 1e-6 (a semantic difference such as median interpolation or decimal rounding, not precision); transfer over 12 MB or load over 20 s at Slow 4G (then the bundle question goes to Fergus, because the phone rule and the privacy rule pull against each other); memory over 500 MB.

**Time box:** 6 hours.

**Dependencies:** `@duckdb/duckdb-wasm` on the spike branch. Docker on the home machine (29.2.1 is installed). Node 24 (installed) for the compare script. No `pg` package: the script talks to Postgres through `docker exec -i … psql`, so the branch adds one dependency, not two.

### The SQL being ported, from `apps/api/migrations/0300_customer_intelligence.sql`

Quoted exactly so nobody needs the sauna repo. Note the language: `language sql`, one expression each. That fact is most of the answer to "functions or CTEs".

```sql
create function hearth.blend_prior(raw numeric, observed_gaps integer)
returns numeric
language sql immutable parallel safe as $$
  select greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                        * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))))
$$;

create function hearth.shrink(observed numeric, n integer, prior numeric)
returns numeric
language sql immutable parallel safe as $$
  select case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end
$$;

create function hearth.expected_gap_days(
  base_days numeric, distance_factor numeric, season_factor numeric, companion_factor numeric
) returns numeric
language sql immutable parallel safe as $$
  select least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)
  ))
$$;
```

How the view calls them (the shape the synthetic query below copies): a first-timer gets the cohort's median days-to-second-visit; everyone else gets `hearth.shrink(their median gap, their observed gaps, cohort median cadence)`; the distance prior is blended by `hearth.blend_prior(prior, observed gaps)`; two seats is a companion factor of 1.25; and `hearth.expected_gap_days(base, distance, season, companion)` is the number the silence ratio divides by.

### Steps

**1. Worktree, dependency, the engine files.** The wasm and its worker are served from `public/` so the measurement is of a same-origin fetch through Vercel's CDN, which is what the real tool will do (a third-party CDN would contradict "nothing leaves this tab"). They are excluded from git because forty-odd megabytes of binaries on a branch that never merges is still forty-odd megabytes in the object store; the CLI deploy uploads them anyway.

```bash
cd /c/Dev/fergus-portfolio-s3-duckdb
npm install --legacy-peer-deps
npm install @duckdb/duckdb-wasm --legacy-peer-deps
mkdir -p public/spike-duckdb .spike
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm \
   node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js \
   node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm \
   node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js \
   public/spike-duckdb/
ls -l public/spike-duckdb
printf '.spike/\npublic/spike-duckdb/\n' >> .git/info/exclude
```

Write the `ls -l` sizes in the record: they are the uncompressed figures the transfer size is compared against.

**2. The generator, shared by the page and the script.** `lib/tools/second-visit/synth.mjs`. Plain JavaScript so Node runs it without a build and Next imports it with `allowJs`. Same seed, same rows, byte-identical CSV on both sides.

```js
/**
 * S3 spike: 100,000 synthetic bookings from a seeded PRNG.
 *
 * mulberry32, so the page and the Node script produce the same rows from the
 * same seed without sharing a file. Every per-customer attribute is a pure
 * function of the customer id, so it is constant across that customer's rows
 * and `max()` recovers it in SQL on either engine.
 */

export const SEED = 300;
export const ROWS = 100_000;
export const CUSTOMERS = 15_000;
const EPOCH_UTC = Date.UTC(2025, 8, 1); // 2025-09-01
const DISTANCE_PRIORS = [1.0, 1.5, 2.5, 4.0];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBookings(seed = SEED, rows = ROWS) {
  const rand = mulberry32(seed);
  const out = new Array(rows);
  for (let i = 0; i < rows; i += 1) {
    // Skewed: low ids are regulars with many rows, high ids are one-timers.
    const customerId = 1 + Math.floor(CUSTOMERS * rand() ** 2.2);
    const day = Math.floor(rand() * 365);
    const visitDate = new Date(EPOCH_UTC + day * 86_400_000).toISOString().slice(0, 10);
    const amountCents = 1500 + 100 * Math.floor(rand() * 31);
    const partySize = rand() < 0.2 ? 2 : 1;
    out[i] = {
      customer_id: customerId,
      visit_date: visitDate,
      amount_cents: amountCents,
      party_size: partySize,
      distance_prior: DISTANCE_PRIORS[customerId % 4],
      season_factor: 1 + (customerId % 7) * 0.1,
    };
  }
  return out;
}

export function toCsv(rows) {
  const head = "customer_id,visit_date,amount_cents,party_size,distance_prior,season_factor";
  const lines = rows.map((r) =>
    `${r.customer_id},${r.visit_date},${r.amount_cents},${r.party_size},${r.distance_prior.toFixed(1)},${r.season_factor.toFixed(1)}`,
  );
  return `${head}\n${lines.join("\n")}\n`;
}
```

**3. The SQL, one text with two dialect switches.** `lib/tools/second-visit/retention-sql.mjs`. The switches are the median (Postgres `percentile_cont … within group`, DuckDB `quantile_cont`), the day difference (spelled with `datediff` on DuckDB so an `INTERVAL` surprise cannot hide), and the numeric cast, because Postgres will not pass `float8` into a `numeric` parameter without one and DuckDB's bare `NUMERIC` is `DECIMAL(18,3)`, which would round the inputs to three places and fail the comparison for the wrong reason.

```js
/**
 * S3 spike: the hearth functions on both engines, and one query that calls
 * them the way analytics.customer_intelligence does.
 */

/** Verbatim from migration 0300, plus the schema. Loaded into Postgres. */
export const POSTGRES_SETUP = `
create schema hearth;

create function hearth.blend_prior(raw numeric, observed_gaps integer)
returns numeric
language sql immutable parallel safe as $$
  select greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                        * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))))
$$;

create function hearth.shrink(observed numeric, n integer, prior numeric)
returns numeric
language sql immutable parallel safe as $$
  select case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end
$$;

create function hearth.expected_gap_days(
  base_days numeric, distance_factor numeric, season_factor numeric, companion_factor numeric
) returns numeric
language sql immutable parallel safe as $$
  select least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)
  ))
$$;

create table bookings (
  customer_id integer not null,
  visit_date date not null,
  amount_cents integer not null,
  party_size integer not null,
  distance_prior numeric not null,
  season_factor numeric not null
);
`;

/**
 * The port. Bodies are the migration's expressions, character for character
 * after the `select`. If DuckDB refuses any of these, that refusal is the
 * spike's finding and the CTE fallback in the decision rule applies.
 */
export const DUCKDB_SETUP = `
create schema if not exists hearth;

create macro hearth.blend_prior(raw, observed_gaps) as
  greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                  * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))));

create macro hearth.shrink(observed, n, prior) as
  case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end;

create macro hearth.expected_gap_days(base_days, distance_factor, season_factor, companion_factor) as
  least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)));
`;

const DIALECTS = {
  postgres: {
    median: (expr, filter) =>
      `percentile_cont(0.5) within group (order by ${expr})${filter ? ` filter (where ${filter})` : ""}`,
    days: (from, to) => `(${to} - ${from})`,
    num: "::numeric",
  },
  duckdb: {
    median: (expr, filter) => `quantile_cont(${expr}, 0.5)${filter ? ` filter (where ${filter})` : ""}`,
    days: (from, to) => `datediff('day', ${from}, ${to})`,
    num: "::double",
  },
};

export const OUTPUT_COLUMNS = [
  "customer_id", "visits", "observed_gaps", "base_gap_days", "distance_factor", "expected_gap_days",
];

export function retentionSql(dialect) {
  const d = DIALECTS[dialect];
  if (!d) throw new Error(`unknown dialect ${dialect}`);
  return `
with visits as (
  select
    customer_id,
    visit_date,
    lag(visit_date) over (partition by customer_id order by visit_date) as prev_date,
    row_number() over (partition by customer_id order by visit_date) as visit_no,
    party_size,
    distance_prior,
    season_factor
  from bookings
),
per_customer as (
  select
    customer_id,
    count(*)::integer as visits,
    count(prev_date)::integer as observed_gaps,
    ${d.median(d.days("prev_date", "visit_date"))} as visit_cadence_days,
    max(case when visit_no = 2 then ${d.days("prev_date", "visit_date")} end) as days_to_second_visit,
    max(party_size) as modal_party_size,
    max(distance_prior) as distance_prior,
    max(season_factor) as season_factor
  from visits
  group by customer_id
),
cohort as (
  select
    coalesce(${d.median("visit_cadence_days", "visits >= 3")}, 30.0) as cadence_days,
    coalesce(${d.median("days_to_second_visit")}, 45.0) as first_repeat_days
  from per_customer
),
modelled as (
  select
    p.customer_id,
    p.visits,
    p.observed_gaps,
    case when p.visits <= 1 then co.first_repeat_days${d.num}
         else hearth.shrink(p.visit_cadence_days${d.num}, p.observed_gaps, co.cadence_days${d.num})
    end as base_gap_days,
    hearth.blend_prior(p.distance_prior${d.num}, p.observed_gaps) as distance_factor,
    p.season_factor${d.num} as season_factor,
    (case when p.modal_party_size >= 2 then 1.25 else 1.00 end)${d.num} as companion_factor
  from per_customer p
  cross join cohort co
)
select
  customer_id,
  visits,
  observed_gaps,
  base_gap_days,
  distance_factor,
  hearth.expected_gap_days(base_gap_days, distance_factor, season_factor, companion_factor) as expected_gap_days
from modelled
order by customer_id
`;
}
```

**4. The page.** `app/spike-duckdb/page.tsx`. The engine is imported on the click, never at module load, because that is the rule the real tool will live by: `/tools` must not pay for DuckDB, only the visitor who drops a file does.

```tsx
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

      const bundle = await duckdb.selectBundle({
        mvp: { mainModule: "/spike-duckdb/duckdb-mvp.wasm", mainWorker: "/spike-duckdb/duckdb-browser-mvp.worker.js" },
        eh: { mainModule: "/spike-duckdb/duckdb-eh.wasm", mainWorker: "/spike-duckdb/duckdb-browser-eh.worker.js" },
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
```

**5. The dev-only sink.** `app/api/spike-duckdb/route.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";

/** S3 spike: writes the tab's rows to .spike/ so compare.mjs can read them. Dev only. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response("dev only", { status: 404 });
  const body = await request.text();
  await mkdir(".spike", { recursive: true });
  await writeFile(".spike/duckdb-out.json", body);
  return Response.json({ ok: true, bytes: body.length });
}
```

**6. The compare script.** `scripts/spike-duckdb/compare.mjs`. Starts the throwaway Postgres, loads the migration's functions verbatim, loads the same CSV, runs the Postgres dialect, and compares against the tab's rows.

```js
#!/usr/bin/env node
/**
 * S3 spike: Postgres 16 in a throwaway container against the tab's DuckDB rows.
 *
 *   node scripts/spike-duckdb/compare.mjs
 *
 * Needs .spike/duckdb-out.json, written by the page on localhost. No npm
 * dependencies: psql runs inside the container over docker exec.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { makeBookings, toCsv, ROWS, SEED } from "../../lib/tools/second-visit/synth.mjs";
import { POSTGRES_SETUP, retentionSql, OUTPUT_COLUMNS } from "../../lib/tools/second-visit/retention-sql.mjs";

const CONTAINER = "spike-pg";
const TOLERANCE = 1e-9;
const LOOSE = 1e-6;
const BIG = 256 * 1024 * 1024;

function sh(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: BIG });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout;
}
function psql(sql) {
  return sh("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At", "-F", ","], sql);
}

const t0 = performance.now();
spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
sh("docker", ["run", "-d", "--rm", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=x", "-p", "5433:5432", "postgres:16"]);
for (let i = 0; ; i += 1) {
  const r = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
  if (r.status === 0) break;
  if (i > 60) throw new Error("postgres did not become ready in 60 s");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
console.log(`postgres ready in ${Math.round(performance.now() - t0)} ms`);

psql(POSTGRES_SETUP);
const csv = toCsv(makeBookings(SEED, ROWS));
const tCopy = performance.now();
psql(`copy bookings from stdin csv header;\n${csv}\\.\n`);
console.log(`copied ${ROWS} rows in ${Math.round(performance.now() - tCopy)} ms`);

const tQuery = performance.now();
const pgOut = psql(retentionSql("postgres"));
const pgMs = Math.round(performance.now() - tQuery);
const pg = new Map();
for (const line of pgOut.split("\n")) {
  if (!line) continue;
  const parts = line.split(",");
  const row = Object.fromEntries(OUTPUT_COLUMNS.map((c, i) => [c, parts[i]]));
  pg.set(Number(row.customer_id), row);
}
console.log(`postgres query rows=${pg.size} ms=${pgMs}`);

const duck = JSON.parse(readFileSync(".spike/duckdb-out.json", "utf8"));
console.log(`duckdb rows=${duck.rows.length} queryMs=${duck.queryMs} loadMs=${duck.loadMs}`);

const numeric = ["base_gap_days", "distance_factor", "expected_gap_days"];
const exact = ["visits", "observed_gaps"];
let compared = 0;
let tight = 0;
let loose = 0;
const maxDiff = Object.fromEntries(numeric.map((c) => [c, 0]));
const examples = [];
for (const d of duck.rows) {
  const id = Number(d.customer_id);
  const p = pg.get(id);
  if (!p) { examples.push({ id, missingIn: "postgres" }); continue; }
  compared += 1;
  for (const c of exact) {
    if (Number(d[c]) !== Number(p[c])) { tight += 1; loose += 1; examples.push({ id, c, duck: d[c], pg: p[c] }); }
  }
  for (const c of numeric) {
    const diff = Math.abs(Number(d[c]) - Number(p[c]));
    if (diff > maxDiff[c]) maxDiff[c] = diff;
    if (diff > TOLERANCE) { tight += 1; if (examples.length < 10) examples.push({ id, c, duck: d[c], pg: p[c], diff }); }
    if (diff > LOOSE) loose += 1;
  }
}
const missingInDuck = [...pg.keys()].filter((id) => !duck.rows.some((r) => Number(r.customer_id) === id)).length;

const report = {
  rowsCompared: compared,
  missingInPostgres: examples.filter((e) => e.missingIn).length,
  missingInDuck,
  mismatchesAt1e9: tight,
  mismatchesAt1e6: loose,
  maxAbsDiff: maxDiff,
  postgresQueryMs: pgMs,
  duckdbQueryMs: duck.queryMs,
  duckdbLoadMs: duck.loadMs,
  examples: examples.slice(0, 10),
};
mkdirSync(".spike", { recursive: true });
writeFileSync(".spike/s3-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
sh("docker", ["stop", CONTAINER]);
```

**7. Run it locally.** Two terminals.

```bash
cd /c/Dev/fergus-portfolio-s3-duckdb
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000/spike-duckdb`, press the button, wait for `posted to /api/spike-duckdb status=200`. Then:

```bash
cd /c/Dev/fergus-portfolio-s3-duckdb
node scripts/spike-duckdb/compare.mjs | tee .spike/s3-compare.txt
```

Expected: `mismatchesAt1e9: 0`. If the page says `FAILED` on a macro, copy the DuckDB error verbatim: that is the finding, and the query still runs if you paste the macro bodies inline in `modelled` (the CTE port) to get the comparison anyway.

**8. Measure the load on a phone-shaped connection, against the CDN.** Commit, deploy a preview, and measure there, because local dev does not compress and the number that matters is what Vercel's edge sends.

```bash
cd /c/Dev/fergus-portfolio-s3-duckdb
git add app/spike-duckdb/page.tsx app/api/spike-duckdb/route.ts lib/tools/second-visit/synth.mjs lib/tools/second-visit/retention-sql.mjs scripts/spike-duckdb/compare.mjs package.json package-lock.json
git commit -m "spike(s3): duckdb-wasm retention port and the postgres compare, never merges"
vercel link --scope larry-pm --project fergus-portfolio --yes --token "$VERCEL_TOKEN_PERSONAL"
vercel deploy --scope larry-pm --yes --token "$VERCEL_TOKEN_PERSONAL" | tee .spike/s3-deploy.txt
```

Confirm `READY`. Then in Chrome: open `<preview>/spike-duckdb`, DevTools, Network tab, tick "Disable cache", set throttling to **Slow 4G** (Chrome renamed the presets in 2024; if the menu says "Fast 3G", that is the same profile and the record says which name it showed). Hard reload, press the button, copy the `wasm load+instantiate ms=` and every `resource …` line. Do it three times; take the median. Then once more unthrottled for the reference. Then Shift+Esc for the Task Manager and write the tab's memory footprint after the query.

Also check the CDN did what was assumed: `transfer` well under `decoded` on the `.wasm` line means it was compressed on the wire; equal means it was not, and the record says so, because that alone changes the bundle decision.

### Measurements to take

| Measurement | Where |
|---|---|
| Macros created without error, or the exact error | page log, `macros created` or `FAILED` |
| Rows compared, mismatches at 1e-9, mismatches at 1e-6, max abs diff per column | `.spike/s3-compare.json` |
| DuckDB query ms over 100,000 rows, and Postgres query ms for scale | page log and compare output |
| `.wasm` transfer bytes, decoded bytes, fetch ms; same for the worker | page log `resource …` lines (Resource Timing) |
| wasm load and instantiate ms at Slow 4G (median of three) and unthrottled | page log `wasm load+instantiate ms=` |
| DuckDB's own memory after the query | page log `duckdb memory bytes=` |
| Tab memory footprint after the query | Chrome Task Manager, this tab's row |
| Uncompressed file sizes on disk | `ls -l public/spike-duckdb` from step 1 |
| Whether the CDN compressed `.wasm` | transfer vs decoded on the `.wasm` resource line |

### Decision rule

For Second Visit (T4):

- **Macros created and mismatches at 1e-9 = 0:** the port is macros in a `hearth` schema, bodies verbatim, and the T4 spec ships the rest of migration 0300's functions the same way (`season_factor`, `retention_verdict`, `reachability` are all `language sql` too). The compare script becomes T4's regression test against Postgres, run in CI on a service container.
- **Macros created, mismatches at 1e-9 > 0 but at 1e-6 = 0:** precision, not semantics. Still macros. The record states the max abs diff, and T4's copy says numbers are shown to one decimal, which they are in the view anyway (`round(…, 1)`).
- **Any macro refused, or mismatches at 1e-6 > 0:** port as CTEs with the expressions inline, one afternoon, exactly the mitigation in section 10; the comparison test stays and must reach zero at 1e-6 before T4 starts. If a mismatch traces to the median (visible when `visit_cadence_days` differs and nothing else), the fix is on the query side, not the functions, and the record names it.
- **The bundle.** Loaded on demand only, never on `/tools`, in every branch. Slow 4G load ≤ 10 s: acceptable, with a one-line "loading the engine, N MB" while it fetches, N taken from this spike. 10 to 20 s: acceptable only with a progress bar driven by the fetch and the size stated before the visitor drops a file. Over 20 s, or the CDN not compressing `.wasm`, or tab memory over 500 MB: stop and put it to Fergus with the numbers, because the phone rule ("every interaction through mobile feels and looks amazing") and the privacy rule ("nothing leaves this tab") cannot both hold at that cost and one of them has to give for this tool.
- **Query time** over 5 s for 100,000 rows means the retention query needs rewriting before T4, not after; under 1 s and the sliders in T4's design can recompute live.

---

## S4 The .ie seed

**Question:** How many `.ie` hosts and registered domains does Common Crawl's `cc-main-2026-jun-jul-aug` host graph hold, and how many bytes and minutes does it take to pull only that block from the home machine?

**Prediction (written 2026-09-03, before running):** The `ie.` block is contiguous and sits in one or two of the 48 vertex part files, so the run downloads under 100 MB (two parts at about 36 MB each, plus a few kilobytes of heads) and finishes in under 10 minutes on the home connection, most of it waiting on Common Crawl's server. It finds 400,000 to 900,000 hosts, collapsing to 150,000 to 250,000 registered domains, which is 45 to 75% of the roughly 330,000 domains the registry reported in 2022. The Public Suffix List names `gov.ie` as the only second-level zone under `.ie`. **Falsified by:** the block spanning three or more parts or not being contiguous (the sort order is not what the docs say, or the parts are not sorted globally); under 50,000 registered domains (the graph does not cover `.ie` the way assumed, or the filter is wrong, and the first and last hosts printed will say which); over an hour or over 1 GB downloaded (range requests not honoured, so the heads pulled whole files); or a second-level zone beyond `gov.ie` in the PSL.

**Time box:** 3 hours.

**Dependencies:** none beyond Node 24 on the home machine. No npm packages: `fetch`, `zlib` and `readline` are built in. Nothing deploys.

### Steps

**1. Worktree.** No dependencies to install, but the branch still gets its own worktree, and `data/` is kept out of git for the spike.

```bash
cd /c/Dev/fergus-portfolio-s4-ie-seed
mkdir -p scripts/census data/census
printf 'data/\n' >> .git/info/exclude
```

**2. The script.** `scripts/census/seed-ie.mjs`. One correction to the brief's method, worth stating: the part files are single-member gzip streams, so the *tail* of a part cannot be decoded from a range request (inflate needs everything before it). The *head* can, because a partial gzip decodes from byte zero with `Z_SYNC_FLUSH`. Since the parts are globally sorted, the first host of part k+1 is the upper bound of part k, and heads alone give every boundary. The binary search below uses heads only.

```js
#!/usr/bin/env node
/**
 * S4 spike: pull the `.ie` block out of Common Crawl's host-level web graph.
 *
 *   node scripts/census/seed-ie.mjs
 *
 * Vertices are `<id>\t<reversed host>` sorted by reversed host, in 48 gzipped
 * parts. `.ie` hosts are the lines whose reversed host starts with `ie.`, a
 * contiguous block. We read the first 64 KB of a few parts to find which
 * parts hold the block (binary search over part heads), stream only those,
 * keep the block, un-reverse each host, collapse to registered domains, and
 * write data/census/ie-domains.txt plus a report of what it cost.
 *
 * No npm dependencies. Node 24: fetch, zlib and readline are built in.
 */
import { createGunzip, gunzipSync, constants as Z } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mkdirSync, writeFileSync } from "node:fs";

const CRAWL = "cc-main-2026-jun-jul-aug";
const BASE = `https://data.commoncrawl.org/projects/hyperlinkgraph/${CRAWL}/`;
const PATHS_URL = `${BASE}host/${CRAWL}-host-vertices.paths.gz`;
const DATA_ROOT = "https://data.commoncrawl.org/";
const UA = "fergusoreilly.dev census seed (one run a month; contact https://fergusoreilly.dev/contact)";
const HEAD_BYTES = 65_536;
const LOW = "ie.";   // first possible reversed host in the block
const HIGH = "ie/";  // '/' is the byte after '.', so this bounds every "ie.*"
const REGISTRY_2022 = 330_000; // .ie domains the registry reported in 2022, per the brief
const OUT_DIR = "data/census";

let bytesDownloaded = 0;
let requests = 0;

async function fetchRetry(url, init = {}) {
  for (let attempt = 0; ; attempt += 1) {
    requests += 1;
    const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
    if (res.status === 429 || res.status === 503) {
      if (attempt >= 6) throw new Error(`${url}: ${res.status} after ${attempt} retries`);
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      console.log(`  ${res.status} on ${url.split("/").pop()}, waiting ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok && res.status !== 206) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }
}

/** Reversed host on the first data line of a part, from its first 64 KB. */
const headCache = new Map();
async function firstHost(partPath) {
  if (headCache.has(partPath)) return headCache.get(partPath);
  const res = await fetchRetry(DATA_ROOT + partPath, { headers: { range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (res.status !== 206) throw new Error(`range not honoured on ${partPath}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  bytesDownloaded += buf.length;
  const text = gunzipSync(buf, { finishFlush: Z.Z_SYNC_FLUSH }).toString("utf8");
  for (const line of text.split("\n")) {
    const [id, host] = line.split("\t");
    if (/^\d+$/.test(id) && host) {
      headCache.set(partPath, host);
      return host;
    }
  }
  throw new Error(`no data line in the head of ${partPath}`);
}

/** Largest index k with firstHost(k) <= key, or -1. Binary search over heads. */
async function lastPartAtOrBelow(parts, key) {
  let lo = 0;
  let hi = parts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const h = await firstHost(parts[mid]);
    console.log(`  head ${mid.toString().padStart(2, "0")} ${h}`);
    if (h <= key) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

/** Second-level zones under .ie from the Public Suffix List, falling back to gov.ie. */
async function secondLevelZones() {
  try {
    const res = await fetchRetry("https://publicsuffix.org/list/public_suffix_list.dat");
    const text = await res.text();
    const zones = text.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".ie") && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("!"));
    return { zones: new Set(zones), source: "publicsuffix.org" };
  } catch (error) {
    console.log(`  PSL fetch failed (${String(error)}), using gov.ie only`);
    return { zones: new Set(["gov.ie"]), source: "fallback" };
  }
}

function registeredDomain(host, zones) {
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (zones.has(lastTwo)) return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  return lastTwo;
}

/** Stream one part, keeping the ie. block. Stops reading once past it. */
async function streamPart(partPath, onHost) {
  const controller = new AbortController();
  const res = await fetchRetry(DATA_ROOT + partPath, { signal: controller.signal });
  const counter = new Transform({
    transform(chunk, _enc, cb) { bytesDownloaded += chunk.length; cb(null, chunk); },
  });
  const gunzip = createGunzip();
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  let scanned = 0;
  let stopped = false;
  const consume = (async () => {
    for await (const line of lines) {
      scanned += 1;
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const host = line.slice(tab + 1);
      if (host < LOW) continue;
      if (host >= HIGH) { stopped = true; controller.abort(); break; }
      onHost(host);
    }
  })();
  try {
    await pipeline(Readable.fromWeb(res.body), counter, gunzip);
  } catch (error) {
    if (!stopped) throw error; // an abort we asked for is not an error
  }
  await consume.catch((error) => { if (!stopped) throw error; });
  return { scanned, stoppedEarly: stopped };
}

async function main() {
  const t0 = performance.now();
  console.log(`listing: ${PATHS_URL}`);
  const listing = await fetchRetry(PATHS_URL);
  const listBuf = Buffer.from(await listing.arrayBuffer());
  bytesDownloaded += listBuf.length;
  const parts = gunzipSync(listBuf).toString("utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`parts: ${parts.length}`);

  console.log("finding the part that starts the block");
  const k0 = Math.max(0, await lastPartAtOrBelow(parts, LOW));
  console.log("finding the part that ends the block");
  const k1 = Math.max(k0, await lastPartAtOrBelow(parts, HIGH));
  // Sanity: the head after k1 must be above the block, or the block runs to the end.
  const after = k1 + 1 < parts.length ? await firstHost(parts[k1 + 1]) : null;
  console.log(`block in parts ${k0}..${k1} (${k1 - k0 + 1} part(s)); first head after block: ${after ?? "none"}`);
  const headBytes = bytesDownloaded;

  const { zones, source } = await secondLevelZones();
  console.log(`second-level zones (${source}): ${[...zones].join(", ") || "none"}`);

  const hosts = [];
  const domains = new Set();
  let firstSeen = null;
  let lastSeen = null;
  let scannedTotal = 0;
  for (let k = k0; k <= k1; k += 1) {
    console.log(`streaming part ${k}: ${parts[k]}`);
    const tPart = performance.now();
    const { scanned, stoppedEarly } = await streamPart(parts[k], (reversed) => {
      const host = reversed.split(".").reverse().join(".");
      hosts.push(host);
      if (firstSeen === null) firstSeen = host;
      lastSeen = host;
      const dom = registeredDomain(host, zones);
      if (dom) domains.add(dom);
    });
    scannedTotal += scanned;
    console.log(`  scanned ${scanned} lines, stopped early: ${stoppedEarly}, ${Math.round(performance.now() - tPart)} ms`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const sorted = [...domains].sort();
  writeFileSync(`${OUT_DIR}/ie-domains.txt`, `${sorted.join("\n")}\n`);
  const wallMs = Math.round(performance.now() - t0);
  const report = {
    crawl: CRAWL,
    partsTotal: parts.length,
    partsStreamed: parts.slice(k0, k1 + 1),
    headBytes,
    bytesDownloaded,
    requests,
    linesScanned: scannedTotal,
    hosts: hosts.length,
    registeredDomains: sorted.length,
    secondLevelZones: [...zones],
    zonesSource: source,
    firstHost: firstSeen,
    lastHost: lastSeen,
    wallMs,
    coverageOf2022Registry: Number((sorted.length / REGISTRY_2022).toFixed(3)),
  };
  writeFileSync(`${OUT_DIR}/seed-ie-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
```

**3. Run it, then measure the file.**

```bash
cd /c/Dev/fergus-portfolio-s4-ie-seed
time node scripts/census/seed-ie.mjs 2>&1 | tee data/census/seed-ie-run.log
wc -l data/census/ie-domains.txt
ls -l data/census/ie-domains.txt
head -5 data/census/ie-domains.txt; tail -5 data/census/ie-domains.txt
grep -c '\.gov\.ie$' data/census/ie-domains.txt
awk -F. '{print NF}' data/census/ie-domains.txt | sort | uniq -c
```

The `awk` line counts labels per domain: the expected shape is nearly everything at 2, a few hundred at 3 (the `gov.ie` names), and nothing else. Anything at 4 or more means the collapse is wrong.

**4. Prove the instrument.** Two checks before believing the count. First, one host you know exists: `grep -c '^tighsauna\.ie$'` and `grep -c '^rte\.ie$'` should both print 1. If `rte.ie` is missing, the filter or the un-reverse is wrong, not the corpus. Second, the block boundaries: `firstHost` in the report should be a name ending `.ie` that sorts first when reversed (something like `ie.0…` or `ie.a…`) and `lastHost` should sort last (`ie.z…`). If `lastHost` is not a `z`-ish name, the stream stopped early for the wrong reason.

**5. Run it twice.** A second run an hour later gives the same counts (the corpus is static) and a second wall-clock and byte figure. Two readings make the cost a reproduced number rather than an observed one.

**6. Record the registry's current figure.** Open `https://www.weare.ie/` and find the current domains-under-management figure in its domain profile report, with the date it carries; write it beside the 2022 figure in the record. The coverage line in the report uses 330,000 because that is what the brief supplied; the record should show coverage against both.

### Measurements to take

| Measurement | Where |
|---|---|
| Parts inspected by head, and their first hosts | run log, the `head NN` lines |
| Parts streamed, and whether the block spans one or two | report `partsStreamed` |
| Bytes downloaded: heads alone, then total (compressed) | report `headBytes`, `bytesDownloaded` |
| HTTP requests made, and any 429 or 503 waits | report `requests`; run log for waits |
| Lines scanned in the streamed parts | report `linesScanned` |
| `.ie` hosts found | report `hosts` |
| Registered domains after collapsing | report `registeredDomains`; `wc -l` on the file |
| File size in bytes | `ls -l data/census/ie-domains.txt` |
| Second-level zones and their source | report `secondLevelZones`, `zonesSource` |
| Label-count distribution | the `awk` line |
| Wall clock, two runs | `time`, and report `wallMs` |
| Coverage against 330,000, and against the registry's current figure | report `coverageOf2022Registry`; step 6 for the second |

### Decision rule

For Irish Stack Census (T6):

- **150,000 or more registered domains, under 15 minutes, under 200 MB:** the corpus is the crawl seed. Monthly re-seed is this script on the home machine's scheduler, the day the new graph is published, and it is cheap (write the two measured minutes-and-megabytes figures into the T6 spec as the budget). Coverage is stated on the census page as the measured fraction of the registry's figure, and per industry bucket after the first crawl's spot check.
- **50,000 to 150,000:** still the seed, because nothing free is bigger, but the T6 spec adds a union across months (each new graph adds hosts the last one missed, and a domain stays in the seed until it fails DNS twice) and the census page prints coverage as a headline figure with the registry number beside it. The record says which end of the range it landed at.
- **Under 50,000, or the block not contiguous, or over an hour, or over 1 GB:** the host graph is not the seed. Record the exact failure. The alternatives, in order, are the previous quarter's graph (same method, a different file, ten minutes to try), then the Common Crawl index server's per-crawl domain listing, then a decision to run the census on a sample rather than the population. None of those is chosen in this spike; the record names them for T6's spec.
- **A second-level zone beyond `gov.ie` in the PSL:** add it to the collapse; it changes nothing else. The `awk` distribution is the check that the collapse is right.

---

## Self-review

Read back against the three questions in the brief.

**Does each spike end in a number?** S1 ends in cost per socket-hour, socket lifetime at the cut, the close code and the reconnect gap. S2 ends in the exact WebKit error text and on-disk size, then Chromium cold and warm milliseconds, CPU per run and a computed daily cap. S3 ends in a mismatch count at two tolerances, the max abs diff per column, the query milliseconds, the transfer and decoded bytes, the load time at Slow 4G and the tab's memory. S4 ends in hosts, domains, bytes, requests, wall clock over two runs, and a coverage fraction. Each has a table saying where every number is read.

**Is each prediction falsifiable?** Each brief names the reading that would falsify it before any command runs, and the decision record template forces the prediction to be copied in before the result. Two predictions are worth flagging as the ones most likely to fall: S1's "about 2 GB-hours per instance-hour" is the design's assumption, not a measurement, and the spike exists to test it; S3's "the CDN compresses `.wasm`" is a guess and the Resource Timing line settles it either way.

**Is anything a placeholder?** Three kinds of angle-bracket value remain, all deliberately: `<hash>` in preview URLs, `<major matching …>` in the sparticuz install line, and the fields of the decision record template. Each is a value that only exists once a command in the same brief has printed it, and the brief says which command. Nothing else is a placeholder.

**Gaps found on the read-back, fixed inline:**

- S1's Upstash `subscribe` endpoint is written from memory of the REST docs and flagged as guessed in the code comment. The parser logs every raw line so a different line shape is visible rather than dropped, and the decision rule already covers "fan-out not tested". Nothing more to fix without network access, which this document was written without.
- S1 step 2's `resourceConfig.fluid` field name is guessed and says so; the dashboard toggle is the fallback and the record has to say which was used.
- S2 originally measured CPU only from the usage page. That page may not resolve twenty runs, so the route also reports Node's own CPU (a floor) and the brief states that warm wall-clock on one vCPU is the ceiling. The decision rule uses the ceiling if the page cannot resolve the delta.
- S2's `--single-process` trap under Playwright is real and known; rather than guess which way it goes, the route takes an env switch and the brief tells the runner to record both outcomes.
- S3's first draft passed `float8` into Postgres's `numeric` parameters, which Postgres rejects (float8 to numeric is an assignment cast, not implicit). Fixed with the dialect-specific `::numeric` / `::double` token, and the reason is stated so nobody "simplifies" it away. Related: if DuckDB keeps `DECIMAL / DECIMAL` as `DECIMAL` rather than promoting to `DOUBLE`, the 1e-9 comparison catches it in `distance_factor`, and the one-line fix is `2.0::double` in the `blend_prior` macro; the record should name it if it happens.
- S3's date subtraction uses `datediff` on DuckDB instead of relying on `date - date` returning an integer, so a type surprise cannot masquerade as a numeric mismatch.
- S4's brief asked for the first *and last* few KB of each part. The last few KB of a single-member gzip cannot be decoded, so the script uses heads only and the global sort makes that sufficient. Stated in the brief rather than silently changed.
- S4's instrument checks (`rte.ie` present, `firstHost` and `lastHost` at the expected ends of the alphabet, the label-count distribution) were added after the read-back, because a count with nothing to anchor it is a number, not a measurement.
- Chrome's throttling preset names have changed; S3 says "Slow 4G" and tells the runner to record the name the menu actually showed.

**Not verified in writing this:** no command here has been run. Every code block type-checks by inspection only; `npx tsc --noEmit` is the first step of each brief for that reason. The Vercel usage page's layout and resolution, the Upstash SSE endpoint, Playwright's installer behaviour on the Vercel build image, and whether Vercel's CDN compresses `.wasm` are all stated at the rung of guessed and each brief has the reading that settles it.

