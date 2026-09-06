export type TraceEvent = {
  at: string;
  type: "tool" | "claim" | "note";
  name?: string;
  input?: string;
  status?: "ok" | "error";
  durationMs?: number;
  text?: string;
};
export function parseTrace(text: string): TraceEvent[] {
  if (text.length > 5_000_000) throw new Error("Trace limit: 5 MB.");
  let raw: unknown;
  if (text.trim().startsWith("[")) raw = JSON.parse(text);
  else
    raw = text
      .trim()
      .split(/\r?\n/)
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch {
          throw new Error(`Invalid JSON on line ${i + 1}.`);
        }
      });
  if (!Array.isArray(raw) || !raw.length || raw.length > 10000)
    throw new Error("Provide 1–10,000 trace records.");
  return raw.map((v, i) => {
    if (
      !v ||
      !Number.isFinite(Date.parse(v.at)) ||
      !["tool", "claim", "note"].includes(v.type)
    )
      throw new Error(`Unsupported record ${i + 1}. Use the example format.`);
    if (
      v.type === "tool" &&
      (typeof v.name !== "string" ||
        typeof v.input !== "string" ||
        !["ok", "error"].includes(v.status))
    )
      throw new Error(`Tool record ${i + 1} needs name, input and status.`);
    if (v.type !== "tool" && typeof v.text !== "string")
      throw new Error(`Record ${i + 1} needs text.`);
    if (
      v.durationMs !== undefined &&
      (!Number.isFinite(v.durationMs) || v.durationMs < 0)
    )
      throw new Error(`Invalid duration in record ${i + 1}.`);
    return {
      at: v.at,
      type: v.type,
      name: v.name,
      input: v.input,
      status: v.status,
      durationMs: v.durationMs,
      text: v.text,
    };
  });
}
export function traceSummary(events: TraceEvent[]) {
  const tools = events.filter((e) => e.type === "tool"),
    seen = new Set<string>();
  let repeated = 0;
  tools.forEach((e) => {
    const key = JSON.stringify([e.name, e.input]);
    if (seen.has(key)) repeated++;
    seen.add(key);
  });
  return {
    toolCalls: tools.length,
    failures: tools.filter((e) => e.status === "error").length,
    repeated,
    claims: events.filter((e) => e.type === "claim").length,
    duration: tools.reduce((n, e) => n + (e.durationMs ?? 0), 0),
  };
}
