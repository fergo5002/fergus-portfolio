/** Group Lore's words. Read through `studioCopy.lore` and `studioLabels.GroupLore`. */
export const loreCopy = {
  upload: "Import a chat",
  dateOrder: "WhatsApp date order",
  paste: "Paste an export",
  analyse: "Read this chat",
  rhythm: "The weekly rhythm",
  rhythmNote:
    "Tap a square to read that hour’s messages. Times use this browser’s timezone; WhatsApp dates have no timezone information.",
  people: "The voices",
  phrases: "Things you keep saying",
  archive: "Message explorer",
  portrait: "Make a portrait",
  summary: "Download anonymous summary",
  exports: "Take it away",
  pseudo: "Use pseudonyms",
  dates: "Dates",
  search: "Search message text",
  person: "Participant",
  all: "All voices",
  more: "Show 50 more",
  clear: "Clear filters",
  heatClear: "Clear hour filter",
  session:
    "A conversation starts after a gap of more than 30 minutes. Counts describe this export, not relationships.",
  privacy:
    "Pseudonyms change speaker labels only. The explorer still contains the original message text. Portraits and anonymous summaries contain counts, with no quotations or names.",
  portraitTitle: "The shape of us",
  portraitDownload: "Download portrait SVG",
  importNote:
    "WhatsApp text; Telegram or DiscordChatExporter JSON; ZIP containing one chat export. 10 MB of chat text, up to 30 MB ZIP. Media is not analysed.",
};

export const loreLabels = {
  dayMonthYear: "Day / month / year",
  monthDayYear: "Month / day / year",
  readingMessages: "Reading messages…",
  messagesInTheCompleteExportDarkerQuieter: " messages in the complete export · darker = quieter",
  noRepeatedTwoWordPhrasesInThis: "No repeated two-word phrases in this export.",
  matches: " matches",
  anonymousActivityPortraitPreview: "Anonymous activity portrait preview",
} as const;
