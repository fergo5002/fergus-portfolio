import type { ToolEntry } from "@/content/tools/types";
export const labCopy = {
  title: "Twelve ideas. Now try them.",
  intro:
    "A working first version of every pitch, built for your local review. Open an example, change something, and see whether it earns a place in the Toolshed.",
  back: "All twelve prototypes",
  badge: "LOCAL REVIEW · MVP",
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
  limit: "MVP boundary",
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
    "Five short mysteries. Pick the investigation that separates the explanations, then commit to a conclusion.",
    [
      "Five authored, deterministic cases with a deliberately simplified model of evidence.",
      "The score rewards investigation, not real-world expertise. Replaying a known case changes the challenge.",
    ],
  ],
  [
    "group-lore",
    "Group Lore",
    "Your group chat has a history.",
    "Understand",
    "Drop in a WhatsApp text export. Find its rhythms, repeated phrases and an activity portrait worth keeping.",
    [
      "Supports day/month/year WhatsApp text exports. Missing history and omitted media remain missing.",
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
      "Raster export removes text search, links, forms, signatures and accessibility structure. Maximum 8 pages, 15 MB and 12 megapixels per page.",
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
    "code-atlas",
    "Code Atlas",
    "Walk around your codebase.",
    "Understand",
    "Turn a source ZIP into a city of files, inspect the actual measurements and compare its shape with another snapshot.",
    [
      "Height is line count, area is bytes. These are size measurements, not quality or complexity scores.",
      "ZIPs up to 10 MB compressed / 30 MB expanded, 1,000 entries. Vendor, generated and binary files are excluded; no Git history is inferred.",
    ],
  ],
  [
    "resonance",
    "Resonance",
    "A tiny machine that makes music.",
    "Make",
    "Give pendulums different periods and notes. Hear patterns form, save a patch, and see where the next variation leads.",
    [
      "A synthesised pendulum sequencer, not a physically exact pendulum or full audio workstation.",
      "Sound starts only when you press Play and stops when the page becomes hidden. Timing depends on your browser; no audio recording in this MVP.",
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
      slug === "good-window"
        ? "The example stays in this tab. Fetching a live forecast sends the selected location and your IP address to Open-Meteo."
        : "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
    order: i,
  }),
);
