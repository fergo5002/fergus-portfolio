import { headers } from "next/headers";
import { overlapCopy } from "@/content/tools/overlap";
import { budgetKeyForIp, takeBudget } from "@/lib/budget";
import { isCode } from "@/lib/tools/overlap/code";
import { ROOM_TTL_SEC, answerKey, errorReply, offerKey, validSdp, type RelayReply } from "@/lib/relay";
import { StoreUnavailableError } from "@/lib/store/errors";
import { getRedis } from "@/lib/store/redis";

/**
 * The other half of the introduction: the joiner posts an answer, the creator
 * polls for it.
 *
 * The answer is a separate key with `nx`, so the first answer wins and a
 * second joiner is told the room is taken rather than silently replacing
 * somebody. Its expiry is whatever is left on the offer, so an answer can
 * never outlive its room.
 *
 * The poll is budgeted against the code alone. The address budget is the wrong
 * shape here: the creator polls fifteen times for one room and would eat an
 * hourly address allowance in a minute, while a client that ignores the window
 * is exactly what a per-code cap stops.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" };
const reply = ({ status, body }: RelayReply) =>
  new Response(JSON.stringify(body), { status, headers: NO_STORE });

const unavailable = () => reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
const failed = () => reply(errorReply("failed", overlapCopy.relay.failed));

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(errorReply("bad-request", overlapCopy.relay.badRequest));
  }
  const { code, answer } = (body ?? {}) as { code?: unknown; answer?: unknown };
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));
  if (!validSdp(answer)) return reply(errorReply("bad-request", overlapCopy.relay.badRequest));

  try {
    const ip = await takeBudget({
      tool: "overlap-relay",
      scope: "ip",
      key: budgetKeyForIp(await headers()),
      limit: 20,
      windowSec: 3600,
    });
    if (!ip.ok) return reply(errorReply("budget", overlapCopy.relay.budget, ip.retryAfterSec));
    const perCode = await takeBudget({
      tool: "overlap-relay",
      scope: "target",
      key: code,
      limit: 3,
      windowSec: ROOM_TTL_SEC,
    });
    if (!perCode.ok) {
      return reply(errorReply("budget", overlapCopy.relay.budget, perCode.retryAfterSec));
    }

    const redis = getRedis();
    const left = await redis.ttl(offerKey(code));
    if (typeof left !== "number" || left <= 0) {
      return reply(errorReply("no-room", overlapCopy.relay.noRoom));
    }

    const written = await redis.set(answerKey(code), answer, { ex: left, nx: true });
    if (written !== "OK") return reply(errorReply("already-joined", overlapCopy.relay.alreadyJoined));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: NO_STORE });
  } catch (error) {
    return error instanceof StoreUnavailableError ? unavailable() : failed();
  }
}

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));

  try {
    const perCode = await takeBudget({
      tool: "overlap-relay",
      scope: "target",
      key: code,
      limit: 20,
      windowSec: ROOM_TTL_SEC,
    });
    if (!perCode.ok) {
      return reply(errorReply("budget", overlapCopy.relay.budget, perCode.retryAfterSec));
    }

    const answer = (await getRedis().get<string>(answerKey(code))) ?? null;
    return new Response(JSON.stringify({ answer }), { status: 200, headers: NO_STORE });
  } catch (error) {
    return error instanceof StoreUnavailableError ? unavailable() : failed();
  }
}
