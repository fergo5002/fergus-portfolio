/**
 * Group Lore's words. Read through `studioCopy.lore` and `studioLabels.GroupLore`.
 *
 * The rebuild (2026-09-28) put the week first and cut the prose: formats,
 * limits, the timezone and what counts as a conversation live in the shell's
 * disclosure (`content/tools/group-lore.ts`, `method`). What stays on the
 * stage is what a visitor must not miss: the example is invented, pseudonyms
 * change labels only, counts describe the export and the downloads hold no
 * names and no message text.
 */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const messages = (n: number) => (n === 0 ? "no messages" : count(n, "message", "messages"));

export const loreCopy = {
  days: DAYS,
  daysShort: SHORT,
  hour,
  /** The one line over the week: "Tuesday 21:00 · 14 messages". */
  reading: (cell: { day: number; hour: number }, n: number, voice?: string) =>
    `${voice ? `${voice} · ` : ""}${DAYS[cell.day]} ${hour(cell.hour)} · ${messages(n)}`,
  messages,
  /** The figures under the timeline. */
  figures: (n: number, voices: number, days: number, conversations: number) =>
    [messages(n), count(voices, "voice", "voices"), count(days, "active day", "active days"), count(conversations, "conversation", "conversations")],
  counts: "Counts describe this export, not relationships.",
  exampleCaption: "An invented chat.",

  weekLabel: "Messages by weekday and hour. Arrow keys move, Enter reads the messages.",
  voicesLabel: "The voices",
  phrasesLabel: "Things you keep saying",
  moreVoices: (n: number) => `${n} more`,
  pseudo: "Use pseudonyms",
  timeline: "Messages over time",
  stretch: "Stretch",

  upload: "Import a chat",
  paste: "Paste an export",
  pasteLabel: "Chat export text",
  analyse: "Read this chat",
  dateOrder: "WhatsApp date order",
  read: "Could not read this chat. Try a smaller export.",

  search: "Search message text",
  searchOpen: "Search the messages",
  close: "Close the messages",
  clear: "Clear filters",
  more: "Show 50 more",
  explorer: "Messages",
  privacy: "Pseudonyms change labels only. Message text is shown as written, names and all.",
  cellChip: (cell: { day: number; hour: number }) => `${SHORT[cell.day]} ${hour(cell.hour)}`,
  phraseChip: (phrase: string) => `“${phrase}”`,
  remove: (what: string) => `Remove ${what}`,

  exports: "Take it away",
  summary: "Anonymous summary",
  portrait: "Activity portrait",
  keepNote: "Both files hold counts only: no names, no message text.",
  portraitWords: {
    title: "The shape of us",
    days: SHORT,
    figures: (n: number, voices: number, days: number) =>
      `${count(n, "message", "messages")} · ${count(voices, "voice", "voices")} · ${count(days, "active day", "active days")}`,
    sessions: (n: number) => `${count(n, "conversation", "conversations")}, each beginning after 30 quiet minutes.`,
    footer: "An activity portrait of the chosen messages. No names. No quotations.",
  },

  /**
   * The invented group the tool opens on. `lib/studio/lore-example.ts` turns
   * these into seven months of WhatsApp export. Nothing here is a real chat.
   */
  example: {
    voices: ["Aoife", "Cian", "Niamh", "Rory", "Saoirse"],
    topics: {
      plans: [
        "quick pint after work?",
        "who's around tonight",
        "the usual spot?",
        "eight at the usual spot",
        "count me in",
        "sounds good to me",
        "quick pint?",
        "same again next week",
        "grand so",
        "who's around thursday",
      ],
      late: [
        "running five minutes late",
        "on the bus now",
        "two minutes away",
        "grab me a seat",
        "running late, order me one",
        "sorry, running late again",
      ],
      lunch: [
        "lunch anyone?",
        "the usual spot for lunch",
        "soup and a sandwich, grand",
        "back at my desk now",
        "who's in town today",
      ],
      match: [
        "did anyone see the match",
        "what a finish",
        "the ref had a shocker",
        "rematch on saturday?",
        "five-a-side on thursday",
        "who has the ball",
      ],
      weekend: [
        "brunch tomorrow?",
        "the usual spot for brunch",
        "who's up",
        "heading to the sea for a swim",
        "group photo from last night",
        "delete that photo",
        "<Media omitted>",
        "sounds good to me",
      ],
      trip: [
        "flights are booked",
        "who has the booking link",
        "the trip is on",
        "packing list anyone?",
        "group photo at the airport",
        "counting down now",
        "sharing the group photo",
      ],
      sunday: [
        "who's cooking sunday",
        "i'll bring dessert",
        "roast at mine, six o'clock",
        "sounds good to me",
        "count me in",
      ],
    },
  },
};

export const loreLabels = {
  dayMonthYear: "Day / month / year",
  monthDayYear: "Month / day / year",
  readingMessages: "Reading messages…",
  noPhrases: "No repeated two-word phrases in this stretch.",
  portraitAlt: "Anonymous activity portrait preview",
  // Legacy: the pre-rebuild page's labels, removed with it.
  messagesInTheCompleteExportDarkerQuieter: " messages in the complete export · darker = quieter",
  noRepeatedTwoWordPhrasesInThis: "No repeated two-word phrases in this export.",
  matches: " matches",
  anonymousActivityPortraitPreview: "Anonymous activity portrait preview",
} as const;

/** Legacy: the pre-rebuild page's words, removed with it. */
export const legacyLoreCopy = {
  rhythm: "The weekly rhythm",
  rhythmNote:
    "Tap a square to read that hour’s messages. Times use this browser’s timezone; WhatsApp dates have no timezone information.",
  people: "The voices",
  phrases: "Things you keep saying",
  archive: "Message explorer",
  dates: "Dates",
  person: "Participant",
  all: "All voices",
  heatClear: "Clear hour filter",
  session:
    "A conversation starts after a gap of more than 30 minutes. Counts describe this export, not relationships.",
  portraitTitle: "The shape of us",
  portraitDownload: "Download portrait SVG",
  importNote:
    "WhatsApp text; Telegram or DiscordChatExporter JSON; ZIP containing one chat export. 10 MB of chat text, up to 30 MB ZIP. Media is not analysed.",
};
