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
    "A year of your activity drawn as contour ground, the way an Ordnance sheet draws a hillside. Out comes a PNG, a strokes-only SVG in millimetres, and a binary STL closed by the mesh edge check.",
  privacy: "browser",
  privacyLine:
    "Runs in your browser. CSV contents and generated exports are never sent over the network. On the GitHub path, your browser sends the username and pasted token directly to api.github.com; the token is never written to storage.",
  cantSee: [
    "Private repositories, unless the token you paste can read them. With no token at all GitHub's limits are far too tight for a year of commits, which is the whole reason the field is there.",
    "What time it was anywhere but where the author was sitting. The row is the hour off the commit's own local clock, offset and all, and that is deliberate: a laptop set to the wrong zone, or a fortnight abroad, moves the ground.",
    "A year with fewer than 150 events, or fewer than 30 occupied cells. It refuses instead of drawing, because contours around a handful of cells are noise with rings on them.",
    "Work. A commit is a commit: a rebase, a squash or a bulk import lands as a ridge at the hour it was replayed, not the hour it was written.",
    "The zone a CSV was written in. A date with no offset is read as it is typed, so a spreadsheet exported in one country and read in another draws the same ground either way.",
    "Whether a physical plotter, slicer or printer accepts an export. The page checks the SVG's units and strokes, and the STL's binary layout and closed directed edges, but no physical machine was part of that check.",
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
    "Draw a year of commits or any dated CSV as contour ground, then take it away as a PNG, a strokes-only SVG in millimetres or a binary STL whose directed edges close. Runs in your browser.",
  talk: "Want one of your own year, on paper, in a frame?",
  sources: {
    demo: "Demo",
    github: "GitHub",
    csv: "CSV",
  },
  demoCaption:
    "Generated, not measured. A modelled developer's year from a fixed seed, so the page has ground on it before you give it any.",
  githubHelp:
    "Your username, and a GitHub token with no scopes ticked. A token with nothing ticked can already read every public repository, which is all this needs unless you want your private ones counted. GitHub makes this path slow; a year usually takes about two minutes.",
  tokenLabel: "GitHub token",
  userLabel: "GitHub username",
  csvHelp:
    "Any CSV with a column of dates. Pick the column and the tool does the rest. The file is read in this tab and never sent anywhere.",
  drawing: "Reading GitHub. Window {done} of {total}, {commits} commits so far.",
  backoff:
    "GitHub asked this tab to slow down. Waiting about {seconds} seconds, then trying this window once more.",
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
    svg: "SVG in millimetres",
    stl: "Binary STL mesh",
  },
  plotterNote:
    "The SVG contains strokes and no fills, reports its dimensions in millimetres, and groups paths by contour level. It contains no text or font dependency.",
  stlNote:
    "The binary STL is 102mm by 46mm, with 2mm of base and up to 12mm of relief. Its directed edges close exactly in the mesh check: two triangles a cell on top, the same grid underneath, and a wall joining them.",

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
    "GitHub did not return a complete year. What is drawn is incomplete, which is worth knowing before you take it away.",
  stopped: "Stopped. Nothing was kept, and the sheet is still the last one it drew.",
  csvRead: "Read {read} rows out of that column and skipped {skipped}.",
  csvCapped:
    "That file runs past 200,000 rows, so only the first 200,000 were read. A phone reading more than that is a phone that stops answering.",
  noDateColumn:
    "No column in that file reads as a date. Relief takes ISO dates, with or without a time and an offset, and the space-separated version a spreadsheet writes. It will not guess at 14/01/2026, because that is two different days depending on who typed it.",
  errors: {
    auth: "GitHub refused that token. Check it has not expired, and that it was pasted whole.",
    rate:
      "GitHub asked this tab to stop again after the retry. Nothing on the sheet changed. Give it a few minutes before trying again.",
    input:
      "That is not a GitHub username, or the token box is empty. A year of commits needs both.",
    other: "Something between here and GitHub went wrong, and it was not the token or the limit.",
    paint:
      "The theme did not hand the plate a colour to draw in. Switch themes at the terminal and it should come back.",
    csvTooLarge:
      "That CSV is over 8 MiB, so it was refused before this tab read it into memory. Export a smaller slice and try again.",
    csvRead: "That CSV could not be read. Nothing on the sheet changed.",
    export: "That export could not be made. Nothing was uploaded; try the file again.",
  },
} as const;
