import type { ToolEntry } from "./types";

/**
 * Relief. Every string the tool says lives here, per the house rule, including
 * the ones the pure modules in `lib/tools/relief/` refuse with: those return a
 * key and the component looks the sentence up, so no sentence is ever built
 * inside a function that is supposed to be arithmetic.
 */
export const relief: ToolEntry = {
  slug: "relief",
  name: "Relief",
  blurb:
    "A year of your activity drawn as contour ground, the way an Ordnance sheet draws a hillside. Out comes a PNG, an SVG a pen plotter can draw, and an STL a printer can make solid.",
  privacy: "browser",
  privacyNote:
    "One exception. On the GitHub path your own browser calls api.github.com with the token you paste. The token is held in this tab and nowhere else, never written to storage, and gone the moment you close it.",
  cantSee: [
    "Private repositories, unless the token you paste can read them. With no token at all GitHub's limits are far too tight for a year of commits, which is the whole reason the field is there.",
    "What time it was anywhere but where the author was sitting. The row is the hour off the commit's own local clock, offset and all, and that is deliberate: a laptop set to the wrong zone, or a fortnight abroad, moves the ground.",
    "A year with fewer than 150 events, or fewer than 30 occupied cells. It refuses instead of drawing, because contours around a handful of cells are noise with rings on them.",
    "Work. A commit is a commit: a rebase, a squash or a bulk import lands as a ridge at the hour it was replayed, not the hour it was written.",
    "The zone a CSV was written in. A date with no offset is read as it is typed, so a spreadsheet exported in one country and read in another draws the same ground either way.",
  ],
  status: "live",
  order: 30,
};

/**
 * The tool's own words. `refusal` is keyed by what the pure guard returns, so
 * `lib/tools/relief/heightmap.ts` can decide and stay free of prose.
 */
export const reliefCopy = {
  description:
    "Draw a year of commits or any dated CSV as contour ground, then take it away as a PNG, a plotter SVG or a printable STL. Runs in your browser.",
  talk: "Want one of your own year, on paper, in a frame?",
  sources: {
    demo: "Demo",
    github: "GitHub",
    csv: "CSV",
  },
  demoCaption:
    "Generated, not measured. A modelled developer's year from a fixed seed, so the page has ground on it before you give it any.",
  githubHelp:
    "Your username, and a GitHub token with no scopes ticked. A token with nothing ticked can already read every public repository, which is all this needs unless you want your private ones counted.",
  tokenLabel: "GitHub token",
  userLabel: "GitHub username",
  csvHelp:
    "Any CSV with a column of dates. Pick the column and the tool does the rest. The file is read in this tab and never sent anywhere.",
  drawing: "Reading GitHub. Window {done} of {total}, {commits} commits so far.",
  refusal: {
    "few-events":
      "That is too thin to contour. Fewer than 150 events in the year, and the rings would be drawn around single cells, which looks like a map and means nothing.",
    "few-cells":
      "That is too concentrated to contour. Fewer than 30 of the 1,248 hours have anything in them, so there is no ground between the peaks.",
    flat: "That is flat. Every hour of the year carries much the same load, so there is nothing for a contour to follow.",
  },
  method:
    "Counts per hour per week, compressed with a logarithm against the 98th percentile so one enormous hour cannot flatten the rest, smoothed twice, then contoured at six levels. Hours wrap at midnight; weeks do not.",
  downloads: {
    png: "PNG",
    svg: "SVG for a plotter",
    stl: "STL for a printer",
  },
  plotterNote:
    "The SVG is geometry only: strokes, no fills, millimetres on the page, one group per contour level so you can put a different pen in for each. No text, because a plotter has no font.",
  stlNote:
    "The STL is a closed solid, 102mm by 46mm, 2mm of base and up to 12mm of relief. Two triangles a cell on top, the same grid upside down underneath, and a wall joining them.",

  /* Added with the page. The pure modules return keys and throw named errors;
     every sentence a visitor reads is in this object. */
  sourceLegend: "What to draw",
  drawGithub: "Draw my year",
  stop: "Stop",
  useDemo: "Back to the demo",
  fileLabel: "CSV file",
  noFile: "No file chosen yet, so the sheet below is still the demo.",
  columnLabel: "Which column holds the date",
  plateAlt:
    "A contour plate. Fifty-two weeks left to right, twenty-four hours top to bottom, six levels, every second one drawn heavier. The numbers under it say what is on it.",
  exportsHeading: "Take it away",
  readout: {
    heading: "What is on the sheet",
    events: "Events",
    occupied: "Hours with anything in them",
    busiest: "Busiest hour",
    ceiling: "The top of the scale",
  },
  drawn: "Drawn. {events} events across {occupied} of the 1,248 hours in the year.",
  truncated:
    "Stopped at 5,000 commits. What is drawn is the newest 5,000 and not the whole year, which is worth knowing before you frame it.",
  stopped: "Stopped. Nothing was kept, and the sheet is still the last one it drew.",
  csvRead: "Read {read} rows out of that column and skipped {skipped}.",
  csvCapped:
    "That file runs past 200,000 rows, so only the first 200,000 were read. A phone reading more than that is a phone that stops answering.",
  noDateColumn:
    "No column in that file reads as a date. Relief takes ISO dates, with or without a time and an offset, and the space-separated version a spreadsheet writes. It will not guess at 14/01/2026, because that is two different days depending on who typed it.",
  errors: {
    auth: "GitHub refused that token. Check it has not expired, and that it was pasted whole.",
    rate: "GitHub is rate limiting this token. It goes away on its own in a few minutes; a token with no scopes ticked still gets the higher limit, so this usually means another tab is using the same one.",
    input:
      "That is not a GitHub username, or the token box is empty. A year of commits needs both.",
    other: "Something between here and GitHub went wrong, and it was not the token or the limit.",
    paint:
      "The theme did not hand the plate a colour to draw in. Switch themes at the terminal and it should come back.",
  },
} as const;
