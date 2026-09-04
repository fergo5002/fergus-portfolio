# S1 WebSocket on Hobby: decision record

- Date run: 2026-09-03 into 2026-09-04, by Claude (Fable 5.1, then Opus 5 after a quota cut) on Fergus's home machine, worktree `C:\Dev\fergus-portfolio-toolshed-s1-websocket`, branch `toolshed/s1-websocket`, commits `d8e5b11`, `0568d89`
- Preview deployment(s):
  - `dpl_6bXiFfoQXs52p6MXz8bWXusQmo6B`, `https://fergus-portfolio-40btlzxsw-larry-pm.vercel.app`, READY. Built from `d8e5b11`. **Does not upgrade.** Kept as the revert control.
  - `dpl_71JBSupivi2yCVnU15BiuVE2g9gr`, `https://fergus-portfolio-5j43vc42y-larry-pm.vercel.app`, READY (v6 API, `target=preview`, confirmed 23:33:34Z before any measurement). Built from `0568d89`. **Upgrades.** Everything below ran here.
  - Two deployments in between came back `BLOCKED` (`dpl_4vNaxkuWsqxFR5hCoGQt8usdiAi6`, `dpl_xcAbMQWmrEfsNB3NzkwzSWB3f7Wx`) and one `ERROR` (`dpl_3uMDk3fXxsd1hj6FiBUAEB78NBWX`, which is S2's). Those are facts about the deploy path, not about WebSockets, and nothing was measured on them.
- No `--prod` in any command. This session deployed nothing, so no pre-deploy hook gate was crossed here; the S2 worktree records the one deploy that was made tonight.
- Hours spent: about 2.4 of 4, of which one is the hold (predecessor 17:30 to 19:00 local, this session 23:15 to 00:45 UTC)
- Record opened, before any run of this session: 2026-09-03 23:20 UTC. The prediction below was fixed in the brief on 2026-09-03 and is copied unchanged.

## Question
Does a WebSocket route upgrade on this Hobby project at all, and if it does, how many Provisioned Memory GB-hours does one hour of one held socket cost, and what does the 300-second cut look like from the client?

## Prediction (copied verbatim from the brief before running)
The upgrade returns 101 on Hobby once Fluid compute is on (guessed from the platform docs; if Fluid is off the route fails with an error naming it). Every held socket is closed by the platform at 300 s, plus or minus 5 s, with close code 1006 (guessed; 1000 or 1001 would not change the decision), and the client reconnects inside 2 s. The usage page rises by about 2 GB-hours per instance-hour: two tabs on one instance cost 2 GB-hours for the hour, two tabs on two instances cost 4. That is the design's assumption in section 4. **Falsified by:** (a) no 101 at all, which takes sockets off the table and makes the cost question moot; (b) the meter rising by under 0.5 GB-hours per socket-hour with the logs proving sockets were open the whole time, which would mean a held socket is not billed as provisioned time and the design's "batched HTTP by default" is more cautious than it needs to be.

## What ran

**Fluid compute, read first.** `GET /v9/projects/prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx` returns `resourceConfig: {fluid: true, functionDefaultRegions: ["iad1"], buildMachineType: "basic"}` and `defaultResourceConfig: {fluid: true, functionDefaultTimeout: 300, functionDefaultMemoryType: "standard"}`. The field the brief guessed at is the right one and it was already on, so nothing was toggled and production's billing model was not touched.

**The first deployment did not upgrade, and it took two probes to say why.** On `dpl_6bXiFf…` the same route threw two different errors on different requests:

```
Error: experimental_upgradeWebSocket is not available in the current runtime environment.
This feature requires a Vercel runtime that supports WebSocket upgrades.
TypeError: d is not a constructor
```

Those point opposite ways: the first says the platform never injected `ctx.upgradeWebSocket`, the second says it did and the failure is later, at `new WebSocketServer(…)`, which would be our own bundling. Commit `0568d89` refuses to pick between them: it reads both conditions in the route and logs them before calling anything, and it adds `serverExternalPackages: ["ws"]` to `next.config.ts` so the bundling candidate is removed rather than argued about.

**The client.** Two Node clients using the `ws` package (8.21.3), `scripts/spike-ws/client.mjs`, not two browser tabs. The preview sits behind deployment protection and there is no way from here to hold two browser tabs in the foreground of their own windows for an hour, which is what the brief's step 9 needs to stop timer clamping making the result evidence about the tab. Node has no clamping to worry about, and the client is a line-for-line stand-in for `app/spike-ws/page.tsx`: ping every 10 s, exponential backoff, the same log tokens. The bypass header carries the project's automation-bypass secret and it is never written to the log. Both clients ran on the same machine and the same connection, so their round-trip times are one measurement, not two.

**The hold.** Client `a` from 23:37:26Z for 3,600 s, client `b` from 23:37:57Z for 3,540 s, both against `wss://fergus-portfolio-5j43vc42y-larry-pm.vercel.app/api/spike-ws`. Function logs pulled with `vercel logs … --json` at 00:26Z and 00:39Z and deduped.

**Upstash was not provisioned**, so `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` were never set. The route reported `redis: false` on every `hello`. Cross-instance fan-out is therefore untested, and it would have been untested anyway, because the two clients never landed on different instances at the same time.

## Measurements

| Name | Value | Where read | When (UTC) | Rung |
|---|---|---|---|---|
| Fluid compute | `fluid: true`, region `iad1`, `functionDefaultTimeout: 300`, memory type `standard` | `/v9/projects/…` | 18:48 | observed |
| Upgrade, pre-fix build | No response at all. `curl` with the WebSocket handshake headers held for 45 s and returned `http=000`, exit 28 (timeout). The function log for the same second carries the error | `.spike/s1-revert-control.txt`, `.spike/s1-logs-probe2.txt` | 23:34 | reproduced (the same hang at 17:35 and 17:49 from the Node client, which logged `connect` and then nothing for 77 s) |
| Upgrade, post-fix build | **`HTTP/1.1 101 Switching Protocols`**, `Sec-Websocket-Accept` present, `X-Matched-Path: /api/spike-ws`, followed immediately by the `hello` frame | `.spike/s1-upgrade-curl.txt` | 23:33:47 | reproduced (24 more upgrades over the hour, `upgrade status=101` on every one) |
| Why the fix worked | `diag` line: `upgradeWebSocket: "function"`, `ws: direct=function viaDefault=undefined keys=…\|WebSocketServer\|…` | function log, every request | 23:33 onward | explained (the mechanism predicted a callable `WebSocketServer` on the externalised namespace, and that is what the diag prints) |
| Sockets held | **1.9754 socket-hours** over the hour: tab a 0.9962, tab b 0.9793 | client summary JSON | 00:37 | observed |
| Opens / closes | 12 and 12 per client, 24 upgrades in the hour | same | 00:37 | observed |
| Socket lifetime, **server side** | **299,995 to 299,999 ms** on all 10 platform cuts captured. 300.000 s to within 5 ms | function log `close.lifetimeMs` | 00:26 and 00:39 | reproduced (10 closes, two log pulls) |
| Socket lifetime, **client side** | tab a median **315.55 s** (min 310.79, max 316.20, n=11); tab b median **310.91 s** (min 310.59, max 316.17, n=11) | client summary JSON | 00:37 | reproduced |
| **The blind window** | Client lifetime minus 300 s: **10.59 to 16.20 s**, tab a median 15.55, tab b median 10.91. Each client's value is stable across the hour with occasional swaps between the two values | arithmetic on the two rows above | 00:40 | reproduced (22 cuts) |
| Close code at the cut | **1006** on all 22 platform cuts. The only `1000` in either log is the client's own clean close at the end of its hour | client summary `codes`, function log | 00:37 | reproduced |
| Reconnect gap | tab a median **1,826 ms** (min 1,474, max 2,382); tab b median **1,881 ms** (min 1,606, max 2,936) | client summary `gapsMs` | 00:37 | reproduced (22 reconnects) |
| Ping round trip | median **79 ms** on both clients; min 76, max 382 (one outlier each at 246 and 382) | client summary `rttMs`, n=331 and 328 | 00:37 | reproduced |
| Instances | Two across the whole hour, `6ncq7r` and `do48ca`. Both clients report the identical split, `{6ncq7r: 2, do48ca: 10}` | client summary `instances` | 00:37 | reproduced |
| Concurrency on one instance | `open: 2` is the maximum the function ever logged. **Both sockets were always on the same instance at the same time** | function log `open` field | 00:39 | observed |
| Fan-out, in-instance | **319 peer messages received by each client**, every ping from the other side arriving | client summary `peers` | 00:37 | reproduced |
| Fan-out, cross-instance | **Not measured.** No Upstash resource exists, `redis: false` on every `hello`, and the two clients never occupied different instances at once | `hello` frames, instance split | 00:37 | observed |
| Provisioned Memory GB-hours at T-60, T0, T+60, T+120 | **Not read.** Both routes to the meter are closed, see below | — | 23:47 to 23:55 | observed |
| Cost per socket-hour | **Not measured.** It is the ratio of a number that could not be read to 1.9754 | — | — | — |
| Invocations added over the hour | 24 upgrades from the clients, plus 1 from the opening curl probe. The brief expected about 12 per tab and got exactly 12 per tab | client summaries, function log | 00:37 | observed (from the clients' own count, not from the usage page) |

### The meter could not be read, and that is a finding about the plan

The brief has all four spikes read Provisioned Memory and Active CPU from `https://vercel.com/larry-pm/~/usage`. Neither route works from here:

- **API.** `GET https://api.vercel.com/v1/usage` answers `{"error":{"code":"plan_upgrade_required","message":"This API endpoint is only available to Teams on the Pro or Enterprise plan."}}` on every combination tried: with `teamId`, with `projectId`, bare, hour and day granularity, ISO and epoch timestamps. `GET /v2/teams/team_SW7xEyTEz5ftQj3cIxulWxKG` returns `slug larry-pm`, `billing.plan hobby`, and `GET /v2/user` returns `fergo5002`, plan `hobby`. The gate is exactly what it says.
- **Dashboard.** The Chrome profile is signed in as `fergus@tighsauna.com`, which is not a member of `larry-pm`. The usage page renders `Select Team / 404 / You're logged in as fergus@tighsauna.com`, and `/api/usage` from that session answers `403 forbidden` with a team id and `400 invalid_time_range` without one. Signing in as the other account is not something an agent does.

Instrument note, because the first reading lied: the first two script evaluations in that tab timed out after 45 s with "the renderer may be frozen". A control expression, `1+1`, timed out too, so that was evidence about the tab, not about Vercel. After a reload the control returned 2 and the real errors appeared. The predecessor's `.spike/usage-day.json` and `.spike/usage-3h.json`, pulled at 17:26Z with the same shape the brief wants, prove the dashboard endpoint worked earlier the same day, so the browser session changed between 17:26Z and 23:47Z. **Rung on why it changed: guessed, untested.**

## Result against the prediction

**Confirmed on the transport, confirmed on the close code, tightened on the timing, and the cost half could not be tested.**

- **101 on Hobby with Fluid on: confirmed.** It took a fix first, which is the part of the story worth keeping: the platform's own error message, `experimental_upgradeWebSocket is not available in the current runtime environment`, was **wrong about its own cause here**. `upgradeWebSocket` was on the request context all along; what was missing was a callable `WebSocketServer` on the webpack-bundled `ws` namespace. Anyone who reads that message as "Hobby does not do WebSockets" will give up one line too early.
- **Closed at 300 s: confirmed, and sharper than predicted.** Server side it is 300.000 s to within 5 ms, ten times out of ten. The prediction's plus or minus 5 s is generous by three orders of magnitude.
- **Close code 1006: confirmed**, 22 of 22.
- **Client reconnects inside 2 s: confirmed on the median** (1,826 and 1,881 ms) but not on every attempt: the worst of 22 was 2,936 ms. Those figures include the client's own 1,000 ms base backoff plus jitter, so they are the client's policy as much as the platform's.
- **New, and not in the prediction: the client does not learn about the cut for another 10.6 to 16.2 s.** The socket is dead at 300 s and the client still thinks it is open until roughly 311 to 316 s. Anything sent into that window is lost silently.
- **About 2 GB-hours per instance-hour: not tested.** Neither named falsifier could fire. Falsifier (a) did not: there is a 101. Falsifier (b) could not be evaluated, because the meter it reads is not readable from here.
- **A structural half of the cost question did get answered.** Two sockets shared one instance for the entire hour, maximum `open` of 2, only two instance identities across 24 upgrades. So on this traffic shape, provisioned time is a per-instance cost and a second visitor was free. That is the shape the prediction assumed. It is not the price.

## Decision

Rule applied: there is a 101, so the first branch does not apply. The cost branch cannot be selected, because cost per socket-hour was not measured. **When the branch that would change the design cannot be opened, the design's default stands.**

- **Burn (X1): batched HTTP every 4 s while visible and moving.** Unchanged.
- **Stranger Pong (G1): WebRTC, with the relay doing only the offer and answer over HTTP.** Unchanged, and now with a measured reason rather than a cautious one: a 300-second hard cut with a 10 to 16 second window where the client is talking into a dead socket is not a transport for a live game. A socket is fine for *signalling*, because an offer and an answer are done inside the first two seconds, but the game itself must not depend on the socket surviving.
- **`@vercel/functions` is not earned.** The dependency stays on this branch and dies with it. The door is not shut: the route works, and if the meter ever becomes readable the ≤0.3 GB-hour branch could still be opened, and the reconnect half of that branch's test already passes (median gap under 2 s on both clients, and no close code other than 1006 at the cut).

Three things the run settled that the ledger should carry regardless of transport:

1. **The 300 s cut is exact, and the client is blind for 10 to 16 s after it.** Any design that keeps a socket open has to treat "no echo within one ping interval" as a closed socket rather than waiting for `onclose`.
2. **`serverExternalPackages: ["ws"]`** is the difference between a route that upgrades and a route that hangs with no response at all. Without it the client gets nothing back, not an error, so the failure is invisible from outside.
3. **The upgrade never returns an HTTP error to the client.** A failing route on this platform hangs the handshake. Every diagnosis has to come from the function log.

## Not verified

- **Cost per socket-hour, in GB-hours.** The headline number of the spike. Not measured, for the two reasons above. Nothing here says a held socket is cheap or dear.
- **Cross-instance fan-out.** No Upstash resource exists, so the Redis path never ran; `redis: false` on all 24 `hello` frames, and the `subscribe_*` lines never appear in the log. Independently, the two clients were on the same instance at every moment, so even a working Redis path would have had nothing to prove. The record does not extend the box to force two instances, as the brief instructs.
- **Whether the fix is isolated.** Commit `0568d89` shipped two changes at once: `serverExternalPackages: ["ws"]` and the diagnostic logging. The pre-fix deployment still reproduces the hang and the post-fix one upgrades every time, so the pair is confirmed by revert, but the two changes were not separated. Diagnostic `console.log` calls cannot plausibly change an upgrade outcome. Rung: **reproduced and explained, not isolated.**
- **Browser behaviour.** Every measurement came from Node clients on a desktop connection in Ireland to `iad1`. A real phone on mobile data, a backgrounded tab, a locked screen and a Safari `WebSocket` implementation are all untested, and the phone is the product surface, so this says less about Burn and Pong in the field than it looks like it does.
- **More than two sockets.** Never tried. Whether a third and fourth client would land on the same instance, and where the platform starts a second, is unknown.
- **Anything over an hour.** One hold, one hour, one deployment.
- **Message size, throughput, backpressure.** Every frame was a small JSON ping. Nothing was measured about payloads that matter.
- **What happens without the deployment-protection bypass header.** Every upgrade in this run carried it.

## Meters moved

Not read, and not readable from here: see the section above. What is countable instead:

- **Sockets held: 1.9754 socket-hours** across two clients over one hour, with the function log confirming they were open the whole time (10 cuts at 300.0 s, each followed by a reconnect inside 3 s).
- **Invocations added by the hold: 24** upgrades of `/api/spike-ws`, exactly 12 per client, plus one opening curl probe and two probes against the pre-fix deployment. Each invocation ran for 300 s of wall clock.
- **Function-seconds consumed: about 7,110** (23.7 socket-lives at roughly 300 s each). What that is in GB-hours depends on the memory the platform provisioned for a `standard` Fluid function, which is the number the usage page holds.
- The background draw the brief's step 8 wants baselined was never separated. Three other `toolshed/*` branches (`f2-shell-everywhere`, `f3-tool-registry`, `fix-doubled-prompt`) deployed previews to this same project during the hold window, so even a readable meter would have needed that traffic subtracted.
