import type { ToolEntry } from "./types";

export type Credit = { name: string; href: string; line: string };

/** One value controls the visible credit, link and schema edge. */
export const TIGH_CREDIT: Credit | null = {
  name: "Tigh Sauna",
  href: "https://tighsauna.com",
  line:
    "The model is Tigh Sauna's, a booking system for Irish saunas. It was ported from the SQL that runs in that product's database, and a test in this repository checks the port against that SQL, row for row, on every pull request.",
};

export const secondVisit: ToolEntry = {
  slug: "second-visit",
  name: "Second visit",
  blurb:
    "Drop a bookings or orders export and find out how many first-time customers come back, with the uncertainty beside the number. A real retention model from a business that runs on it.",
  privacy: "browser",
  cantSee: [
    "Why anyone left. Every verdict here is a shape in your own dates. Somebody who moved house and somebody who had a bad time look identical from the outside, and nothing in this tool can tell them apart.",
    "Anyone whose town is not in the table, and anyone with no town at all. Distance is worked out from town centroids, so a row with no match gets no distance and is judged on behaviour alone. That is deliberate: not knowing where somebody lives is a gap in your records, and it must not be charged to the customer as suspicion.",
    "Your summer, if your file covers fewer than twelve months. The season factor is switched off below that and the page says so. One winter is no evidence at all about your summer.",
    "The difference between a no-show and a completed visit, unless your export has a status column and you map it. Without one, every row that is not cancelled counts as a visit, which is a slightly kinder reading than the model uses in production.",
    "Anything that is not in the file. No addresses, no marketing consent, no memberships or prepaid credits unless a column carries them, and nothing at all about people who have never booked.",
    "Whether any of the verdicts are right. The model has never been scored against what customers went on to do. It reorganises what your dates already say, which is useful, and it is not the same thing as being correct.",
  ],
  status: "live",
  order: 50,
};

export const secondVisitCopy = {
  steps: {
    file: {
      title: "1. Your export",
      hint: "A CSV from your booking system, your till or your shop. One row per booking or order. Your file never leaves this tab.",
      button: "Choose a file",
      demo: "Or try it on a made-up sauna",
      demoNote: "A generated file, 180 customers over two years. Nothing in it is a real person.",
    },
    columns: {
      title: "2. Which column is which",
      hint: "Guessed from the headers. Change anything that is wrong. Only the first two are needed.",
      required: "Needed",
      optional: "Optional, and each one switches something on",
    },
    where: {
      title: "3. Where you are, and when the file ends",
      townLabel: "The town your business is in",
      townHint: "Distance bands are worked out from here. Leave it blank and everybody is judged on behaviour alone.",
      asOfLabel: "Treat the file as ending on",
      asOfHint: "Defaults to the newest date in your file, because that is when the export was taken. Silence is measured to this date.",
      staleWarning:
        "This file ends more than two months ago, so every silence in it is measured to that date rather than to today.",
    },
  },
  headline: {
    title: "How many come back",
    kmLabel: "Estimated share of first-time customers who return",
    naiveLabel: "The figure a dashboard would show you",
    naiveNote:
      "That second number counts somebody who first came last week as a customer who never returned. On a growing business it gets worse the faster you grow.",
    intervalLabel: "95% interval",
    medianLabel: "Half of those who return do so within",
    medianNotReached: "not reached inside this file",
    horizonLabel: "by day",
    horizonDisabled: "Longer than your file covers.",
  },
  honesty: {
    title: "What this is, and what it is not",
    body: [
      "Your file never leaves this tab. It is read and modelled in your own browser, and the page names whether that happened in a background worker or on the main thread. Nothing is uploaded, stored or sent anywhere. The forget command has nothing to wipe here, because this tool writes nothing to your machine at all.",
      "The distance bands were drawn for a rural Irish sauna. Fifteen kilometres is habit range, ninety-five is the point where Dublin stops being a catchment and starts being a day out. For your business those numbers may be nonsense, which is why every one of them is a slider.",
      "The priors are stated assumptions rather than fitted parameters, and the people who wrote them say so in the code. One venue and eighteen months is not enough history to fit five coefficients without overfitting, so somebody wrote down what they believed and left it arguable.",
      "The model has never been scored against what customers went on to do. Nobody has taken a list of people it called lapsed and checked how many were. It reorganises the dates you already have, which is worth doing, and it is a different thing from knowing what happens next.",
    ],
    changed: "You have moved a slider, so these numbers are no longer the ones the production model would give.",
  },
  verdicts: {
    prospect: { label: "Never booked", note: "In your file with no attended booking." },
    visiting: { label: "Was always visiting", note: "Too far away and too little history to call this a habit that broke. Chasing them costs goodwill." },
    loyal: { label: "Loyal", note: "Ten visits or more and inside their own window." },
    first_time: { label: "First time", note: "One visit, and not yet late by their own clock." },
    repeat: { label: "Repeat", note: "Coming back, and inside their own window." },
    committed_idle: { label: "Paid and not coming", note: "They hold credits or a membership and have gone quiet. The cheapest and the most urgent list here." },
    squeezed: { label: "Shut out", note: "Their usual slot kept selling out after they stopped coming. The fix is the timetable, not a discount." },
    dormant: { label: "Out of season", note: "They only ever come when you are busy. Expected back, so the reminder is a seasonal one." },
    lapsed: { label: "Lapsed", note: "Well past their own window with no reason found." },
    at_risk: { label: "At risk", note: "Past their own window with no reason found." },
  },
  exports: {
    lapsed: { name: "Lapsed regulars", file: "lapsed-regulars.csv", note: "People with a real rhythm who are well past it, ranked by what winning them back is worth." },
    nudges: { name: "Second-visit nudges", file: "second-visit-nudges.csv", note: "One visit, still inside a plausible window, nothing yet to worry about. This is the list where a nudge is cheapest." },
    stalls: { name: "Stall risks", file: "stall-risks.csv", note: "Two or three visits and drifting. The point where a habit either forms or does not." },
    assumesConsent: "This ranking assumes you are allowed to contact these people. Your export does not say whether you are, and the model in production refuses to guess.",
  },
  slots: {
    title: "Slots",
    note: "Counted from your own bookings, so a slot nobody booked is not in the file and is not in this grid. The sold-out share below is the share of the slots that had at least one booking.",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    heatLabel: "Visits",
    fullLabel: "Sold out",
    missing: "No slot time column, so there is nothing to draw. Map one and this fills in.",
  },
  products: {
    title: "Reorder radar",
    note: "Anybody who has bought the same thing at least twice, with their own rhythm for that one thing, and how far past it they are.",
    missing: "No product column, so there is nothing to compare. Map one and this fills in.",
    columns: { product: "Product", customers: "Customers", median: "Median gap, days", overdue: "Overdue now" },
  },
  report: {
    button: "Save the report",
    file: "second-visit-report.html",
    note: "One HTML file with the numbers in it. It opens in any browser with no internet connection and no scripts. It contains your customers' identifiers, so treat it like the export it came from.",
    title: "Second visit report",
    sections: {
      summary: "The headline",
      curve: "Time to a second visit",
      bands: "By distance",
      verdicts: "Verdicts",
      slots: "Slots",
      products: "Reorder radar",
      settings: "Settings used",
      limits: "What this cannot see",
    },
  },
  sliders: {
    title: "The constants, if you disagree with them",
    reset: "Put the production values back",
    shrinkK: "How many visits it takes to outweigh the starting assumption",
    localKm: "Local, up to",
    catchmentKm: "Catchment, up to",
    regionalKm: "Regional, up to",
    distantFactor: "A distant customer takes this many times longer",
    visitorFactor: "Somebody from another country takes this many times longer",
    companionFactor: "A pair takes this many times longer than a solo visitor",
    lapsedRatio: "Lapsed once they are this far past their own window",
    loyalVisits: "Loyal from this many visits",
    floorDays: "Never expect anybody back sooner than",
    capDays: "Never expect anybody back later than",
  },
  refusals: {
    noFile: "No file yet.",
    empty: "That file has no rows in it.",
    noHeader: "No header row found. The first row of the file should name the columns.",
    noCustomer: "Pick the column that identifies the customer. Without it there is nothing to follow.",
    noDate: "Pick the column with the booking or order date.",
    badDates: "None of the values in that column parsed as a date. Pick a different one.",
    tooFew: "Under twenty customers with a booking, there is nothing here a survival curve could honestly say. Come back with more of the file.",
    tooBig: "That file is over 60 MB. Nothing here can hold it. Export a narrower date range.",
    truncated: "Only the first 500,000 rows were read. Every result and export below is incomplete.",
    failed: "Something went wrong reading that file, and it stopped rather than guessing.",
  },
  labels: {
    rows: "rows read",
    customers: "customers",
    used: "used",
    ignored: "ignored",
    skippedRows: "preamble rows skipped before the header",
    ignoredRows: "rows ignored because a required value could not be read",
    ambiguousDates: "The dates were ambiguous, so day-first order was used. Check the result before acting on it.",
    working: "Working in your browser.",
    parseMs: "read in",
    modelMs: "modelled in",
    seasonOff: "Season factor off: this file covers fewer than twelve months.",
    seasonOn: "Season factor on.",
    unknownTown: "no town matched",
    towns: "Town coordinates from GeoNames, CC BY 4.0.",
  },
} as const;
