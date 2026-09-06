import { it, expect } from "vitest";
import {
  importChat,
  loreStats,
  filterMessages,
  anonymousSummary,
} from "./lore";
it("imports Telegram rich text and explicit American WhatsApp dates", () => {
  expect(
    importChat(
      JSON.stringify({
        messages: [
          {
            type: "message",
            date: "2026-02-03T10:00:00",
            from: "F",
            text: ["hello ", { text: "world" }],
          },
        ],
      }),
      "dmy",
    )[0].text,
  ).toBe("hello world");
  expect(
    new Date(
      importChat("12/31/2025, 10:00 - F: hello", "mdy")[0].at,
    ).getMonth(),
  ).toBe(11);
});
it("filters and groups actual messages with stable pseudonyms", () => {
  const msgs = importChat(
    "01/01/2026, 10:00 - Fergus: private Fergus address\n01/01/2026, 10:03 - Ava: hello\n02/01/2026, 11:00 - Fergus: hello",
    "dmy",
  );
  expect(
    filterMessages(msgs, { query: "hello", person: "Fergus" }),
  ).toHaveLength(1);
  expect(loreStats(msgs).sessions).toBe(2);
  expect(
    loreStats(msgs)
      .heat.flat()
      .reduce((a, b) => a + b, 0),
  ).toBe(3);
  expect(JSON.stringify(anonymousSummary(msgs))).not.toMatch(
    /Fergus|Ava|private|address/,
  );
});
