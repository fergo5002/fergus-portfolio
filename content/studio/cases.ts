import {
  cases as originals,
  type InvestigationCase,
} from "@/content/lab/cases";
export const studioCases: InvestigationCase[] = [
  ...originals,
  {
    id: "lift",
    title: "The lift that got slower",
    setup:
      "Complaints about a lift doubled after a refurbishment. The building manager wants a faster motor. You have one afternoon to establish what changed.",
    hypotheses: [
      "The lift takes longer to travel",
      "More people now arrive at the same time",
      "The new waiting area makes the same wait feel longer",
    ],
    answer: 2,
    budget: 6,
    tests: [
      {
        id: "complaints",
        label: "Read the complaint totals",
        cost: 1,
        outcomes: [
          "Complaints doubled",
          "Complaints doubled",
          "Complaints doubled",
        ],
      },
      {
        id: "timer",
        label: "Compare travel and arrival logs before and after",
        cost: 3,
        outcomes: [
          "Travel time +35%; arrival pattern unchanged",
          "Travel time unchanged; peak arrivals +40%",
          "Travel time and arrival pattern unchanged",
        ],
      },
      {
        id: "mirror",
        label: "Restore the lobby mirror for a week",
        cost: 3,
        outcomes: [
          "Complaints remain high",
          "Complaints remain high",
          "Complaints return to the old level",
        ],
      },
    ],
    lesson:
      "The complaint is real. The proposed mechanism still needs testing. Separate perceived waiting from physical delay.",
  },
  {
    id: "playlist",
    title: "The disappearing bass",
    setup:
      "A track sounds full on headphones but thin on the studio monitors. Both monitors play sound. The producer reaches for an equaliser.",
    hypotheses: [
      "The master file contains no low frequencies",
      "The monitors have opposite polarity",
      "The headphones artificially add bass",
    ],
    answer: 1,
    budget: 6,
    tests: [
      {
        id: "volume",
        label: "Turn both monitors up",
        cost: 1,
        outcomes: [
          "The track gets louder",
          "The track gets louder",
          "The track gets louder",
        ],
      },
      {
        id: "one",
        label: "Compare one monitor with both, at matched level",
        cost: 2,
        outcomes: [
          "Bass stays weak in every configuration",
          "Each monitor alone has bass; together the bass collapses",
          "Bass stays weak in every configuration",
        ],
      },
      {
        id: "polarity",
        label: "Check wiring polarity and repeat a mono tone",
        cost: 3,
        outcomes: [
          "Wiring matches; the file has no low-frequency energy",
          "One cable is reversed; correcting it restores bass",
          "Wiring matches; a reference microphone measures normal bass",
        ],
      },
    ],
    lesson:
      "An interaction can create a failure neither component has alone. Test the combination, not just the parts.",
  },
  {
    id: "retention",
    title: "A brilliant new onboarding",
    setup:
      "Week-one retention rose from 24% to 40% after a redesign. The team wants to roll it out everywhere. Marketing changed its acquisition mix that same week.",
    hypotheses: [
      "The new onboarding improves retention",
      "The acquisition mix now contains more returning customers",
      "A tracking event fires twice",
    ],
    answer: 1,
    budget: 6,
    tests: [
      {
        id: "chart",
        label: "Refresh the overall retention chart",
        cost: 1,
        outcomes: [
          "24% before; 40% after",
          "24% before; 40% after",
          "24% before; 40% after",
        ],
      },
      {
        id: "cohort",
        label: "Compare onboarding variants within acquisition cohorts",
        cost: 3,
        outcomes: [
          "The new variant wins within each cohort",
          "Within-cohort retention is unchanged; returning-customer share rises",
          "Event counts exceed distinct returning users",
        ],
      },
      {
        id: "audit",
        label: "Audit distinct user IDs in the event stream",
        cost: 2,
        outcomes: [
          "Every returning user is counted once",
          "Every returning user is counted once",
          "The same return event is duplicated",
        ],
      },
    ],
    lesson:
      "An aggregate improvement can come from a changing mix. Compare like with like before attributing the change to your intervention.",
  },
  {
    id: "sauna",
    title: "The cold reading",
    setup:
      "A sauna sensor reports a sudden 12°C drop whenever the door opens. Guests report little change. The heater controller adds a large power burst each time.",
    hypotheses: [
      "The whole room cools by 12°C",
      "The sensor sits in a local draught",
      "The controller displays an old cached value",
    ],
    answer: 1,
    budget: 6,
    tests: [
      {
        id: "screen",
        label: "Film the controller display",
        cost: 1,
        outcomes: [
          "The display falls by 12°C",
          "The display falls by 12°C",
          "The display falls by 12°C",
        ],
      },
      {
        id: "probes",
        label: "Log three calibrated probes at different positions",
        cost: 3,
        outcomes: [
          "All three probes fall together",
          "The door-side probe falls sharply; the others barely move",
          "All probe readings remain steady while the display changes",
        ],
      },
      {
        id: "move",
        label: "Move the sensor away from the door and repeat",
        cost: 3,
        outcomes: [
          "The same drop appears",
          "The large reported drop disappears",
          "The old display behaviour continues",
        ],
      },
    ],
    lesson:
      "Validate what a measurement represents before changing a controller. A precise sensor can still measure the wrong location.",
  },
  {
    id: "vanishing",
    title: "The vanishing photograph",
    setup:
      "A photographer exports a correctly exposed image. It looks washed out in one browser but normal in an editor. The pixels in the exported file match the original.",
    hypotheses: [
      "The export damaged the pixel values",
      "Colour profile handling differs between viewers",
      "The monitor backlight changes randomly",
    ],
    answer: 1,
    budget: 5,
    tests: [
      {
        id: "export",
        label: "Export the same image again",
        cost: 1,
        outcomes: [
          "The browser still looks washed out",
          "The browser still looks washed out",
          "The browser still looks washed out",
        ],
      },
      {
        id: "profile",
        label: "Convert a copy to sRGB and compare viewers side by side",
        cost: 3,
        outcomes: [
          "The damaged export still differs in both viewers",
          "The converted copy matches across both viewers",
          "Both viewers brighten and dim together",
        ],
      },
      {
        id: "pixels",
        label: "Compare numeric pixel values with the original",
        cost: 2,
        outcomes: [
          "Pixel values differ",
          "Pixel values match",
          "Pixel values match",
        ],
      },
    ],
    lesson:
      "The display pipeline is part of the result. Matching source data does not prove matching output.",
  },
  {
    id: "shortcut",
    title: "The suspicious shortcut",
    setup:
      "A navigation app recommends a side road. In the logs, drivers who take it arrive six minutes earlier. Should everyone take the shortcut?",
    hypotheses: [
      "The side road itself saves six minutes",
      "Early departures disproportionately choose the side road",
      "The arrival timestamps are wrong",
    ],
    answer: 1,
    budget: 6,
    tests: [
      {
        id: "average",
        label: "Recalculate the unadjusted average",
        cost: 1,
        outcomes: [
          "Side-road drivers arrive six minutes earlier",
          "Side-road drivers arrive six minutes earlier",
          "Side-road drivers arrive six minutes earlier",
        ],
      },
      {
        id: "matched",
        label: "Compare drivers who leave at the same time",
        cost: 3,
        outcomes: [
          "The side road remains faster within each departure window",
          "Within the same window, journey times match",
          "Both routes have impossible negative journey times",
        ],
      },
      {
        id: "clock",
        label: "Audit device and server timestamps",
        cost: 2,
        outcomes: [
          "Clocks agree",
          "Clocks agree",
          "A subset of device clocks is six minutes fast",
        ],
      },
    ],
    lesson:
      "People select routes for reasons. A difference between groups is not automatically an effect of the route.",
  },
  {
    id: "archive",
    title: "The perfect search result",
    setup:
      "A knowledge-search demo answers every question correctly. It fails on new documents. The indexer reports success for every upload.",
    hypotheses: [
      "The new documents are absent from the searchable index",
      "The model has memorised the demonstration answers",
      "The query service returns a stale cache",
    ],
    answer: 0,
    budget: 6,
    tests: [
      {
        id: "demo",
        label: "Replay the original demonstration questions",
        cost: 1,
        outcomes: [
          "Every answer is correct",
          "Every answer is correct",
          "Every answer is correct",
        ],
      },
      {
        id: "needle",
        label: "Upload a unique invented phrase and query the index directly",
        cost: 3,
        outcomes: [
          "Upload succeeds but the phrase is absent from the index",
          "The phrase is present in the index",
          "The phrase is present in the index",
        ],
      },
      {
        id: "fresh",
        label: "Disable caching and ask a new question with retrieved context",
        cost: 3,
        outcomes: [
          "No new-document context is retrieved",
          "Correct context arrives but the answer repeats the demo",
          "The new answer becomes correct",
        ],
      },
    ],
    lesson:
      "A green upload status proves receipt, not indexing. Place a traceable marker at the input and follow it across the boundary.",
  },
];
export const detectiveCopy = {
  eyebrow: "PROVE IT / THE EVIDENCE ROOM",
  title: "A good hunch is only the beginning.",
  intro:
    "Spend a small investigation budget. Find what would change your mind. Then put your confidence on the record.",
  library: "Case files",
  daily: "Today’s case",
  open: "Open case",
  brief: "The brief",
  hypotheses: "Competing explanations",
  confidence: "Confidence in your selected explanation",
  tests: "Choose your next investigation",
  notebook: "Evidence notebook",
  empty:
    "Your notebook is empty. Buy an investigation to collect an observation.",
  commit: "Commit your conclusion",
  again: "Reopen this case",
  next: "Next unsolved case",
  download: "Download case report",
  cost: "credits",
  prediction: "Before you test: what result would change your mind?",
  predictionPlaceholder:
    "Write a prediction or a result that would rule out your explanation…",
  debrief: "Case debrief",
  history: "How your belief changed",
  limits:
    "These are authored puzzles with simplified, deterministic evidence. Replaying a known case changes the challenge. Progress stays in this tab unless you download a report.",
};
