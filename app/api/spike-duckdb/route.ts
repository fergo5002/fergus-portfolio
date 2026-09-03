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
