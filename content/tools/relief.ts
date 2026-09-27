import type { ToolEntry } from "./types";

/**
 * Relief. Every string the tool says lives here, per the house rule, including
 * the ones the pure modules in `lib/tools/relief/` refuse with: those return a
 * key and the component looks the sentence up, so no sentence is ever built
 * inside a function that is supposed to be arithmetic.
 */

/**
 * The tool's own words. `refusal` is keyed by what the pure guard returns, so
 * `lib/tools/relief/heightmap.ts` can decide and stay free of prose.
 */
export const reliefCopy = {
  description:
    "Draw a year of commits or any dated CSV as ground, a ridge a week or contours from above, then take it away as a PNG, a strokes-only SVG in millimetres or a binary STL whose directed edges close. Runs in your browser.",
  talk: "Want one of your own year, on paper, in a frame?",
  sources: {
    demo: "Demo",
    github: "GitHub",
    csv: "CSV",
  },
  /** On the stage whenever the demo is what is drawn. Short, because it sits beside the figures. */
  demoCaption: "Generated, not measured: a modelled developer's year.",
  githubHelp:
    "Your username, and a GitHub token with no scopes ticked. A token with nothing ticked can already read every public repository, which is all this needs unless you want your private ones counted. GitHub makes this path slow; a year usually takes about two minutes.",
  tokenLabel: "GitHub token",
  userLabel: "GitHub username",
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
    "Counts per hour per week, compressed with a logarithm against the 98th percentile so one enormous hour cannot flatten the rest, smoothed twice, then drawn two ways from the same ground: a ridge a week across the hours, and contours at six levels. Hours wrap at midnight; weeks do not. The crosshair reads the raw count, never the smoothed height.",
  downloads: {
    png: "PNG",
    svg: "SVG in millimetres",
    stl: "Binary STL mesh",
  },
  plotterNote:
    "The SVG is the view on screen. It contains strokes and no fills, reports its dimensions in millimetres, and groups paths by contour level, or by week for the ridgeline, whose hidden lines are removed before they are written. It contains no text or font dependency.",
  stlNote:
    "The binary STL is 102mm by 46mm, with 2mm of base and up to 12mm of relief. Its directed edges close exactly in the edge check: two triangles a cell on top, the same grid underneath, and a wall joining them.",

  /* Added with the page. The pure modules return keys and throw named errors;
     every sentence a visitor reads is in this object. */
  /** The source control's name. Not drawn: the three options say what they are. */
  sourceLegend: "What to draw",
  drawGithub: "Draw my year",
  stop: "Stop",
  fileLabel: "CSV file",
  /** Under the file button, where it is read at the moment of choosing. */
  fileHint: "Any CSV with a column of dates. It is read in this tab and never sent anywhere.",
  columnLabel: "Which column holds the date",
  /** The view control's name, likewise not drawn. */
  viewLabel: "View",
  views: { ridgeline: "Ridgeline", contour: "Contour" },
  /** A new seed for the modelled year. Only offered while the demo is drawn. */
  anotherDemo: "Another year",
  ridgeAlt:
    "A ridgeline of the year. Fifty-two ridges, one a week, stacked from week 1 at the back to week 52 at the front, each one that week's activity across the twenty-four hours from midnight on the left. The readout under it gives the count at the crosshair.",
  plateAlt:
    "A contour plate. Fifty-two weeks left to right, twenty-four hours top to bottom, six levels, every second one drawn heavier. The readout under it gives the count at the crosshair.",
  /** The accessible name of the export row. Not drawn: the buttons say what they make. */
  exportsHeading: "Take it away",
  week: "Week",
  hour: "Hour",
  /** The crosshair's reading: the raw count in one cell, never the smoothed height. */
  cell: (week: number, hour: number, count: number) =>
    `week ${week} · ${String(hour).padStart(2, "0")}:00 · ${count} ${count === 1 ? "event" : "events"}`,
  /** The year in one line: what is on the sheet and what full height means. */
  figures: (events: number, occupied: number, ceiling: number) =>
    `${events.toLocaleString("en-IE")} events · ${occupied.toLocaleString("en-IE")} of 1,248 hours · peaks top out at ${ceiling} an hour`,
  stale:
    "No new landscape is ready. The last one stays up, and exports wait until a file is accepted or you go back to the demo.",
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

export const relief: ToolEntry = {
  slug: "relief",
  name: "Relief",
  blurb:
    "Turn a year of your activity into a landscape, one ridge a week, then take it away as an image, a pen-plotter drawing or a 3D mesh.",
  purpose: "Turn a year of dated activity into terrain, one ridge a week, then take it away as an image, a plot or a mesh.",
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
  method: [reliefCopy.method, reliefCopy.plotterNote, reliefCopy.stlNote],
  status: "live",
  order: 40,
};
