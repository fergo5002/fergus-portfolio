import { parseChat, type ChatMessage, analyseChat } from "@/lib/lab/chat";
export function importChat(text: string, order: "dmy" | "mdy"): ChatMessage[] {
  if (text.length > 10_000_000) throw new Error("Chat limit: 10 MB.");
  if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    const data = JSON.parse(text),
      rows = Array.isArray(data) ? data : data.messages;
    if (!Array.isArray(rows))
      throw new Error(
        "JSON needs a messages array (Telegram, DiscordChatExporter or {sender, text, at}).",
      );
    const result: ChatMessage[] = [];
    for (const row of rows) {
      if (row.type && !["message", "Default", "Reply"].includes(row.type))
        continue;
      const sender =
        row.sender ?? row.from ?? row.author?.name ?? row.author?.nickname;
      const content = row.text ?? row.content;
      const at =
        typeof row.at === "number"
          ? row.at
          : Date.parse(row.date ?? row.timestamp);
      if (typeof sender !== "string" || !Number.isFinite(at)) continue;
      const body = Array.isArray(content)
        ? content
            .map((t) => (typeof t === "string" ? t : (t?.text ?? "")))
            .join("")
        : content;
      if (typeof body === "string") result.push({ sender, at, text: body });
    }
    if (!result.length)
      throw new Error("No dated messages recognised in this JSON.");
    return result.sort((a, b) => a.at - b.at);
  }
  if (order === "mdy")
    text = text.replace(
      /^(\[?)(\d{1,2})([/.])(\d{1,2})([/.]\d{2,4})/gm,
      "$1$4$3$2$5",
    );
  return parseChat(text).sort((a, b) => a.at - b.at);
}
export type LoreFilter = {
  query?: string;
  person?: string;
  start?: string;
  end?: string;
  day?: number;
  hour?: number;
};
export function filterMessages(messages: ChatMessage[], f: LoreFilter) {
  const start = f.start ? new Date(f.start + "T00:00:00").getTime() : -Infinity,
    end = f.end ? new Date(f.end + "T23:59:59.999").getTime() : Infinity,
    query = f.query?.toLocaleLowerCase();
  return messages.filter((m) => {
    const d = new Date(m.at);
    return (
      (!f.person || m.sender === f.person) &&
      m.at >= start &&
      m.at <= end &&
      (!query || m.text.toLocaleLowerCase().includes(query)) &&
      (f.day === undefined || (d.getDay() + 6) % 7 === f.day) &&
      (f.hour === undefined || d.getHours() === f.hour)
    );
  });
}
export function loreStats(messages: ChatMessage[]) {
  const base = analyseChat(messages),
    heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]),
    days = new Set<string>();
  let sessions = 0,
    last = -Infinity,
    longest = 0,
    run = 0;
  for (const m of messages) {
    const d = new Date(m.at);
    heat[(d.getDay() + 6) % 7][d.getHours()]++;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (m.at - last > 30 * 60 * 1000) {
      sessions++;
      run = 0;
    }
    run++;
    longest = Math.max(longest, run);
    last = m.at;
  }
  return { ...base, heat, sessions, longest, activeDays: days.size };
}
export function anonymousSummary(messages: ChatMessage[]) {
  const s = loreStats(messages);
  return {
    format: "group-lore-v2",
    count: s.count,
    participants: s.participants.map((p, i) => ({
      name: `Voice ${i + 1}`,
      count: p.count,
    })),
    hours: s.hours,
    months: s.months,
    heat: s.heat,
    sessions: s.sessions,
    activeDays: s.activeDays,
  };
}
