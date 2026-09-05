import { blobRepository, boardNamespace, boardSecret } from "@/lib/arcade/blob-board";
import { boardSnapshot, recordScore } from "@/lib/arcade/score-service";
import { scoreFailure, scoreRequest } from "@/lib/arcade/score-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { ledger } = await blobRepository().read();
    return Response.json(boardSnapshot(ledger, boardNamespace()), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (e) { return scoreFailure(e); }
}
export async function POST(request: Request) {
  try {
    const entry = await scoreRequest(request);
    const board = await recordScore(blobRepository(), entry, boardNamespace(), boardSecret());
    return Response.json({ board }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return scoreFailure(e); }
}
