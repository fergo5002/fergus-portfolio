import { boardNamespace, boardSecret } from "@/lib/arcade/blob-board";
import { issueTicket } from "@/lib/arcade/score-service";
import { scoreFailure, scoreRequest } from "@/lib/arcade/score-request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const body = await scoreRequest(request); return Response.json({ ticket: issueTicket(body?.game, boardNamespace(), boardSecret()) }, { headers: { "cache-control": "no-store" } }); }
  catch (e) { return scoreFailure(e); }
}
