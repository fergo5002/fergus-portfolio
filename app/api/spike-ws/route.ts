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

/**
 * Spike addition (2026-09-03). The 18:35 to 18:49 probes on
 * dpl_6bXiFfoQXs52p6MXz8bWXusQmo6B produced two different errors from this
 * one route, and they mean opposite things:
 *
 *   "experimental_upgradeWebSocket is not available in the current runtime
 *    environment"  -> the platform did not inject ctx.upgradeWebSocket.
 *   "TypeError: d is not a constructor"  -> it DID, and the failure is later,
 *    at `new WebSocketServer(...)`, which would be our own bundling.
 *
 * Guessing between them is exactly the move CLAIMS.md forbids, so the route
 * now reads both conditions itself and logs them before it calls anything.
 */
function upgradeAvailable(): string {
  const ctx = (globalThis as Record<symbol, { get?: () => Record<string, unknown> }>)[
    Symbol.for("@vercel/request-context")
  ];
  return typeof ctx?.get?.().upgradeWebSocket;
}

async function wsServerCtor(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: Record<string, unknown> = await import("ws" as string);
    const direct = typeof mod.WebSocketServer;
    const viaDefault = typeof (mod.default as { WebSocketServer?: unknown } | undefined)?.WebSocketServer;
    return `direct=${direct} viaDefault=${viaDefault} keys=${Object.keys(mod).slice(0, 8).join("|")}`;
  } catch (error) {
    return `import_failed:${String(error).slice(0, 120)}`;
  }
}

export async function GET(): Promise<Response> {
  const sinceBoot = Date.now() - BOOT;
  log("upgrade_attempt", { sinceBoot, coldStart: sinceBoot < 250, open: sockets.size });
  log("diag", { upgradeWebSocket: upgradeAvailable(), ws: await wsServerCtor() });

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
