import type { ToolEntry } from "./types";

export const groupLore: ToolEntry = {
  "slug": "group-lore",
  "name": "Group Lore",
  "blurb": "Explore the rhythms and running threads of a chat archive. Filter the messages behind a pattern and make an anonymous portrait.",
  "purpose": "See when a group chat talks, who talks most and what it keeps saying.",
  "method": [
    "Reads a WhatsApp text export, a Telegram or DiscordChatExporter JSON file, or a ZIP holding one of them: up to 10 MB of chat text, or a 30 MB ZIP. Media is not read.",
    "WhatsApp writes dates without saying which way round they are. The tool reads the order from the file when a day passes twelve or only one reading keeps the messages in time order, and asks only when it cannot tell.",
    "Hours are shown in this browser's timezone, because WhatsApp exports carry none.",
    "A conversation starts after more than 30 minutes of quiet.",
    "The timeline chooses a stretch of time, and the week, the voices and the phrases follow it. Pressing a voice narrows the week and the phrases to that voice."
  ],
  "cantSee": [
    "Supports WhatsApp text with a date-order setting and Telegram / DiscordChatExporter JSON. Missing history and omitted media remain missing.",
    "Message counts describe the export, not friendship, influence or personality. Pseudonyms change speaker labels only; the original messages may still contain names. Anonymous portrait and summary downloads omit message text."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 2
};
