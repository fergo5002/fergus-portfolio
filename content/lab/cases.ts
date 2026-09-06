export type InvestigationCase = {
  id: string;
  title: string;
  setup: string;
  hypotheses: string[];
  answer: number;
  budget: number;
  tests: { id: string; label: string; cost: number; outcomes: string[] }[];
  lesson: string;
};
export const cases: InvestigationCase[] = [
  {
    id: "green",
    title: "438 green tests. One broken button.",
    setup:
      "A contact form says Sent, but some messages never arrive. The test suite is green. Where would you look first?",
    hypotheses: [
      "The mail provider rejects every message",
      "A timing filter silently discards fast submissions",
      "The browser never submits the form",
    ],
    answer: 1,
    budget: 5,
    tests: [
      {
        id: "suite",
        label: "Run the same test suite again",
        cost: 1,
        outcomes: ["438 tests pass", "438 tests pass", "438 tests pass"],
      },
      {
        id: "post",
        label: "Compare a direct fast POST, a slow POST and provider logs",
        cost: 3,
        outcomes: [
          "Both requests reach the provider and are rejected",
          "Fast request reports success with no provider call; slow request is delivered",
          "Both direct POST requests are delivered",
        ],
      },
      {
        id: "human",
        label: "Try one slow manual submission",
        cost: 2,
        outcomes: [
          "Reports success but no delivery",
          "Message is delivered",
          "Submit does nothing",
        ],
      },
    ],
    lesson:
      "A green suite only describes the paths it exercises. Vary the suspected trigger and observe the external effect.",
  },
  {
    id: "queue",
    title: "The third coffee machine",
    setup:
      "A café owner wants another espresso machine. Customers queue for 12 minutes each morning. Which stage is holding things up?",
    hypotheses: ["Taking payment", "Making drinks", "Handing orders over"],
    answer: 2,
    budget: 5,
    tests: [
      {
        id: "count",
        label: "Count people in the queue",
        cost: 1,
        outcomes: ["18 people", "18 people", "18 people"],
      },
      {
        id: "times",
        label: "Time each stage for ten consecutive orders",
        cost: 3,
        outcomes: [
          "Payment 90s; coffee 25s; handover 15s",
          "Payment 15s; coffee 100s; handover 15s",
          "Payment 15s; coffee 25s; handover 110s",
        ],
      },
      {
        id: "machine",
        label: "Borrow another machine for one hour",
        cost: 5,
        outcomes: [
          "Queue barely changes",
          "Queue shrinks",
          "Queue barely changes",
        ],
      },
    ],
    lesson:
      "More capacity only helps at the constrained stage. Measure the whole path before buying equipment.",
  },
  {
    id: "promo",
    title: "The promotion that doubled sales",
    setup:
      "Sales rose after a discount launched. The founder calls it a success. What explains the jump?",
    hypotheses: [
      "The discount changed purchase behaviour",
      "Traffic doubled from a newsletter feature",
      "Duplicate purchase events inflated analytics",
    ],
    answer: 1,
    budget: 5,
    tests: [
      {
        id: "chart",
        label: "Look at the sales dashboard again",
        cost: 1,
        outcomes: [
          "Sales line doubles",
          "Sales line doubles",
          "Sales line doubles",
        ],
      },
      {
        id: "audit",
        label: "Compare visitors, conversion and unique paid order IDs",
        cost: 3,
        outcomes: [
          "Same visitors; conversion doubles; paid IDs double",
          "Visitors double; conversion unchanged; paid IDs double",
          "Visitors and conversion unchanged; paid IDs unchanged",
        ],
      },
      {
        id: "survey",
        label: "Ask three customers if the price was good",
        cost: 2,
        outcomes: ["Two say yes", "Two say yes", "Two say yes"],
      },
    ],
    lesson:
      "Separate traffic, conversion and measurement. An attractive before-and-after chart does not isolate causation.",
  },
  {
    id: "plant",
    title: "A very dramatic basil plant",
    setup:
      "A basil plant wilts every afternoon. Adding water yesterday did not fix it. What is happening?",
    hypotheses: ["Dry roots", "Waterlogged roots", "Afternoon heat stress"],
    answer: 2,
    budget: 5,
    tests: [
      {
        id: "photo",
        label: "Take another afternoon photograph",
        cost: 1,
        outcomes: ["Leaves droop", "Leaves droop", "Leaves droop"],
      },
      {
        id: "check",
        label: "Check root moisture and compare morning with shaded afternoon",
        cost: 3,
        outcomes: [
          "Dry soil; droops morning and afternoon",
          "Sodden soil; droops morning and afternoon",
          "Moist soil; morning healthy; shade restores leaves",
        ],
      },
      {
        id: "water",
        label: "Add more water without checking the soil",
        cost: 2,
        outcomes: [
          "Leaves recover",
          "No recovery",
          "Brief recovery, then wilts again",
        ],
      },
    ],
    lesson:
      "The same symptom can arise from opposite causes. Choose a measurement that distinguishes the alternatives.",
  },
  {
    id: "slow",
    title: "Fast laptop. Slow website.",
    setup:
      "A page feels instant on the developer’s laptop but takes eight seconds for a new visitor. Why?",
    hypotheses: [
      "A large uncached asset",
      "A slow server response",
      "An animation hides already-loaded content",
    ],
    answer: 0,
    budget: 5,
    tests: [
      {
        id: "reload",
        label: "Refresh the developer’s warm browser",
        cost: 1,
        outcomes: ["Fast", "Fast", "Fast"],
      },
      {
        id: "cold",
        label: "Record a cold-load network and filmstrip trace",
        cost: 3,
        outcomes: [
          "HTML 150ms; hero asset 7s; content waits for asset",
          "HTML arrives after 7s; assets load quickly",
          "HTML and assets finish in 500ms; content hidden until 8s",
        ],
      },
      {
        id: "score",
        label: "Check only the final HTTP status",
        cost: 1,
        outcomes: ["200", "200", "200"],
      },
    ],
    lesson:
      "Reproduce the visitor’s initial conditions. A warm cache and a final status code miss the experience.",
  },
];
