import type { ToolEntry } from "./types";

export const groupLore: ToolEntry = {
  "slug": "group-lore",
  "name": "Group Lore",
  "blurb": "Explore the rhythms and running threads of a chat archive. Filter the messages behind a pattern and make an anonymous portrait.",
  "cantSee": [
    "Supports WhatsApp text with a date-order setting and Telegram / DiscordChatExporter JSON. Missing history and omitted media remain missing.",
    "Message counts describe the export, not friendship, influence or personality. Pseudonyms change speaker labels only; the original messages may still contain names. Anonymous portrait and summary downloads omit message text."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 2
};
