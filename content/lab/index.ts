import type { ToolEntry } from "@/content/tools/types";
export const labCopy = {
  title: "Five tools. Go deeper.",
  intro:
    "The five selected tools have grown into working studios. Play, investigate, explore and make something worth keeping. The other experiments are still here below.",
  back: "Back to the lab",
  badge: "LOCAL REVIEW · STUDIOS",
  open: "Open workbench",
  all: "All",
  categories: ["Decide", "Understand", "Organise", "Make"],
  review: "Your shortlist",
  reviewNote:
    "Mark the ones you would come back to. Notes and selections survive navigation within this lab, but refreshing or closing the tab clears them. Download your review to keep it.",
  notes: "What worked? What would make you return?",
  save: "Download shortlist",
  selected: "Shortlisted",
  select: "Shortlist",
  empty: "No favourites yet. Try a few tools first.",
  limit: "Scope and limits",
  previous: "Previous",
  next: "Next",
  loading: "Loading workbench…",
  error: "Something went wrong",
  retry: "Try again",
};
const entries: [string, string, string, string, string, string[]][] = [
  [
    "bottleneck",
    "Bottleneck",
    "Build the queue before you build the business.",
    "Decide",
    "Change demand, staffing and session capacity. Compare the same simulated arrivals before committing to a plan.",
    [
      "Illustrative seeded arrivals and fixed service times, not a prediction of your business.",
      "Wait statistics include people who start service; unserved people are shown separately.",
    ],
  ],
  [
    "good-window",
    "Good Window",
    "Find the gap in the weather.",
    "Organise",
    "Give the next few days a job: a walk, a cycle or an outdoor session. Pick conditions and save a suitable window.",
    [
      "Hourly weather forecasts are uncertain. This is not a marine or outdoor safety assessment.",
      "Live forecasts use Open-Meteo. The free endpoint is suitable for this personal local review; production service terms need a separate decision.",
    ],
  ],
  [
    "black-box",
    "Black Box",
    "Did the agent actually prove it?",
    "Understand",
    "Open a run as a timeline. Find failed calls, repeated work and claims whose supporting evidence you still need to inspect.",
    [
      "Imports the documented example JSON/JSONL schema, not arbitrary vendor logs.",
      "Evidence links are your annotations. A successful tool status does not prove a claim.",
    ],
  ],
  [
    "same-page",
    "Same Page",
    "Have the founder argument while it is still cheap.",
    "Decide",
    "Answer separately, exchange files, and reveal the differences. Turn vague agreement into a concrete conversation.",
    [
      "A structured conversation aid, not a personality test or compatibility score.",
      "No remote rooms in this MVP. Exchange answer files or use separate browser tabs.",
    ],
  ],
  [
    "what-if",
    "What If",
    "Replace one confident number with a range.",
    "Decide",
    "Run thousands of possible outcomes for an event, project or runway. See which assumption moves the answer most.",
    [
      "Independent triangular input distributions are assumptions, not measured probabilities.",
      "No seasonality, correlation or causal inference. Runway assumes positive net monthly spending throughout the ranges.",
    ],
  ],
  [
    "fair-play",
    "Fair Play",
    "Less organising. More playing.",
    "Organise",
    "Create a rotating doubles session, balance rests and reduce repeated partners. Keep completed rounds when someone leaves.",
    [
      "A seeded search reduces repeats; it does not prove a globally optimal draw.",
      "Rest balance takes precedence over team strength. Historical rounds remain intact when the roster changes.",
    ],
  ],
  [
    "prove-it",
    "Prove It",
    "Spend evidence, not confidence.",
    "Understand",
    "Twelve case files. Collect evidence, track your confidence and discover what would change your mind.",
    [
      "Twelve authored, deterministic cases with a deliberately simplified model of evidence.",
      "The score rewards investigation, not real-world expertise. Replaying a known case changes the challenge.",
    ],
  ],
  [
    "group-lore",
    "Group Lore",
    "Your group chat has a history.",
    "Understand",
    "Explore the rhythms and running threads of a chat archive. Filter the messages behind a pattern and make an anonymous portrait.",
    [
      "Supports WhatsApp text with a date-order setting and Telegram / DiscordChatExporter JSON. Missing history and omitted media remain missing.",
      "Message counts describe the export, not friendship, influence or personality. Shared portraits use pseudonyms by default.",
    ],
  ],
  [
    "pocket-redact",
    "Pocket Redact",
    "Paint it out. Export only the pixels.",
    "Organise",
    "Cover sensitive areas of a PDF or image, then create and reopen a fresh flattened document to inspect the result.",
    [
      "Raster export removes text search, links, forms, signatures and accessibility structure. Maximum 20 pages, 40 MB, 12 megapixels per page and 64 megapixels per document.",
      "Only the areas you mark are covered. Review every exported page before sharing; filenames and anything visibly left on the page may still identify you.",
    ],
  ],
  [
    "clear-day",
    "Clear Day",
    "See what one meeting costs your day.",
    "Organise",
    "Import a calendar, find proper blocks of free time and try moving a meeting before touching your real calendar.",
    [
      "Availability means gaps in the supplied calendar only. Missing calendars remain invisible.",
      "Expands recurrence within the chosen week. Embedded timezone definitions are supported; floating dates use this browser’s timezone. Unsupported named zones are rejected.",
      "Exports are detached proposed events, not updates to an online calendar.",
    ],
  ],
  [
    "atlas",
    "Atlas",
    "Find the thread.",
    "Understand",
    "Turn files, folders, archives or a public GitHub repository into a draggable knowledge graph. Follow references, shared words and the files behind them.",
    [
      "Connections distinguish folders, explicit references and shared words. Word overlap is not proof of semantic similarity.",
      "Up to 1,000 files / 80 MB. Readable formats get text extraction; others retain metadata. GitHub reads up to 100 text files / 8 MB. No OCR or private repositories.",
    ],
  ],
  [
    "resonance",
    "Resonance",
    "A tiny machine that makes music.",
    "Make",
    "Play four voices, shape a live sixteen-step sequence and perform with an XY surface. Save a patch or render eight bars to WAV.",
    [
      "A synthesised step sequencer with visual pendulums. Changing a note or effect keeps the sequence running.",
      "Sound starts only after you play a pad or sequence and stops when the page becomes hidden. WAV export renders the current patch, including its release tail.",
    ],
  ],
];
export type LabTool = ToolEntry & { category: string; hook: string };
export const labTools: LabTool[] = entries.map(
  ([slug, name, hook, category, blurb, cantSee], i) => ({
    slug,
    name,
    hook,
    category,
    blurb,
    cantSee,
    status: "live",
    privacy: "browser",
    privacyLine:
      slug === "atlas"
        ? "Files are processed in this browser. GitHub import sends requests to GitHub. Saved maps include extracted text; nothing is saved automatically."
        : slug === "good-window"
          ? "The example stays in this tab. Fetching a live forecast sends the selected location and your IP address to Open-Meteo."
          : "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
    order: i,
  }),
);
