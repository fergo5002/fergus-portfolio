export type ChatMessage = { at: number; sender: string; text: string };
export function parseChat(text: string): ChatMessage[] {
  if (text.length > 10_000_000) throw new Error("Chat limit: 10 MB.");
  const messages: ChatMessage[] = [];
  let current: ChatMessage | undefined;
  for (const raw of text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .split(/\r?\n/)) {
    const match = raw.match(
      /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?(?:\]\s*|\s+-\s+)(.*)$/i,
    );
    if (match) {
      current = undefined;
      const [, dd, mm, yy, hh, min, ampm, body] = match,
        split = body.indexOf(": ");
      if (split < 0) continue;
      const year = Number(yy) + (yy.length === 2 ? 2000 : 0),
        hour = ampm
          ? (Number(hh) % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0)
          : Number(hh);
      const date = new Date(
        year,
        Number(mm) - 1,
        Number(dd),
        hour,
        Number(min),
      );
      if (
        date.getMonth() !== Number(mm) - 1 ||
        date.getDate() !== Number(dd) ||
        hour > 23 ||
        Number(min) > 59
      )
        throw new Error(
          "Unsupported date. This MVP expects day/month/year exports.",
        );
      current = {
        at: date.getTime(),
        sender: body.slice(0, split),
        text: body.slice(split + 2),
      };
      messages.push(current);
    } else if (current) current.text += "\n" + raw;
  }
  if (!messages.length)
    throw new Error(
      "No messages recognised. Use a WhatsApp text export with day/month/year dates.",
    );
  return messages;
}
export function analyseChat(messages: ChatMessage[]) {
  const people = new Map<string, number>(),
    words = new Map<string, number>(),
    hours = Array(24).fill(0) as number[],
    months = new Map<string, number>();
  messages.forEach((m) => {
    people.set(m.sender, (people.get(m.sender) ?? 0) + 1);
    hours[new Date(m.at).getHours()]++;
    const date = new Date(m.at),
      month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.set(month, (months.get(month) ?? 0) + 1);
    const tokens = m.text.toLowerCase().match(/[a-z']{3,}/g) ?? [];
    tokens.forEach((w, i) => {
      if (
        i &&
        ![
          "the",
          "and",
          "you",
          "was",
          "this",
          "that",
          "omitted",
          "media",
        ].includes(w)
      ) {
        const phrase = tokens[i - 1] + " " + w;
        words.set(phrase, (words.get(phrase) ?? 0) + 1);
      }
    });
  });
  return {
    count: messages.length,
    participants: [...people]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    hours,
    months: [...months].sort().map(([month, count]) => ({ month, count })),
    phrases: [...words]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase, count]) => ({ phrase, count })),
  };
}
