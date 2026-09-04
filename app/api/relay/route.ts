import { headers } from "next/headers";
import { overlapCopy } from "@/content/tools/overlap";
import { budgetKeyForIp, takeBudget } from "@/lib/budget";
import { isCode, newCode } from "@/lib/tools/overlap/code";
import { ROOM_TTL_SEC, errorReply, offerKey, validSdp, type RelayReply } from "@/lib/relay";
import { StoreUnavailableError } from "@/lib/store/errors";
import { getRedis } from "@/lib/store/redis";

/**
 * `/api/relay`: the only server part of `/tools/overlap`, and the whole of it.
 *
 * POST puts an SDP offer under a fresh six-character code for ten minutes and
 * hands the code back. GET reads the offer out again for whoever types the
 * code. That is everything the server knows: two connection blobs and a
 * hashed address. No hash from anybody's list ever reaches this file, and the
 * copy and paste route on the page skips it entirely.
 *
 * **Redis is not provisioned in production yet**, so `getRedis()` throwing
 * `StoreUnavailableError` is an ordinary answer here rather than a fault: 503,
 * a named error the client switches on, and a sentence that tells a person
 * what to do instead. Every other throw is a 500, because a real fault dressed
 * up as a missing store is a bug nobody would ever find.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" };

function reply({ status, body }: RelayReply): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

/** How many fresh codes to try before admitting the space is busy. */
const CODE_TRIES = 5;

async function budgetOr(
  scope: "ip" | "target" | "global",
  key: string,
  limit: number,
  windowSec: number,
): Promise<RelayReply | null> {
  const result = await takeBudget({ tool: "overlap-relay", scope, key, limit, windowSec });
  return result.ok ? null : errorReply("budget", overlapCopy.relay.budget, result.retryAfterSec);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(errorReply("bad-request", overlapCopy.relay.badRequest));
  }
  const offer = (body as { offer?: unknown } | null)?.offer;
  if (!validSdp(offer)) return reply(errorReply("bad-request", overlapCopy.relay.badRequest));

  try {
    const ip = budgetKeyForIp(await headers());
    const overIp = await budgetOr("ip", ip, 5, 3600);
    if (overIp) return reply(overIp);
    const overAll = await budgetOr("global", "rooms", 20, 86_400);
    if (overAll) return reply(overAll);

    const redis = getRedis();
    for (let i = 0; i < CODE_TRIES; i++) {
      const code = newCode();
      const written = await redis.set(offerKey(code), offer, { ex: ROOM_TTL_SEC, nx: true });
      if (written === "OK") {
        return new Response(JSON.stringify({ code, ttlSec: ROOM_TTL_SEC }), {
          status: 200,
          headers: NO_STORE,
        });
      }
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  }
}

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));

  try {
    const ip = budgetKeyForIp(await headers());
    const overIp = await budgetOr("ip", ip, 20, 3600);
    if (overIp) return reply(overIp);
    const overCode = await budgetOr("target", code, 5, ROOM_TTL_SEC);
    if (overCode) return reply(overCode);

    const offer = await getRedis().get<string>(offerKey(code));
    if (!offer) return reply(errorReply("no-room", overlapCopy.relay.noRoom));
    return new Response(JSON.stringify({ offer }), { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  }
}
