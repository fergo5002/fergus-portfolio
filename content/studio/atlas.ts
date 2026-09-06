import type { AtlasFile } from "@/lib/studio/graph";
const clusters = [
  {
    folder: "Coast",
    terms: "tides coastline swimming weather sea sunrise",
    names: [
      "Morning swim",
      "Safe arrival",
      "Tide notes",
      "Coastal walk",
      "Weather window",
      "Sea journal",
      "Packing list",
      "Early light",
    ],
  },
  {
    folder: "Building",
    terms: "prototype product feedback experiment founder design",
    names: [
      "Small bets",
      "First customers",
      "Feedback loop",
      "Launch notes",
      "The useful thing",
      "Weekly review",
      "Product sketch",
      "Working backwards",
    ],
  },
  {
    folder: "Sound",
    terms: "rhythm music resonance synth melody pattern",
    names: [
      "After hours",
      "Pendulum ideas",
      "Slow tide",
      "Recording notes",
      "Glass tones",
      "Polyrhythms",
      "Listening room",
      "Evening set",
    ],
  },
  {
    folder: "Systems",
    terms: "phosphor graph physics knowledge memory connections",
    names: [
      "Connected notes",
      "The machine",
      "Graph paper",
      "Knowledge garden",
      "Phosphor trails",
      "Memory map",
      "Useful links",
      "Field notes",
    ],
  },
];
export const atlasExample: AtlasFile[] = clusters
  .flatMap((c) =>
    c.names.map(
      (name, i): AtlasFile => ({
        path: `${c.folder}/${name}.md`,
        size: 430,
        kind: "md",
        status: "read" as const,
        text: `# ${name}\n\nA fictional notebook for exploring Atlas. These are example notes, not private files.\n\n${c.terms}.\n\n${name} starts with a small observation and becomes a practical experiment. Record what changed, what surprised you, and what to try next.\n\nRelated: [[${c.names[(i + 1) % c.names.length]}]] and [[${i % 2 ? "Morning swim" : "Connected notes"}]].\n\n- Make time to notice the details.\n- Keep the original evidence.\n- Return to the question next week.`,
      }),
    ),
  )
  .concat([
    {
      path: "Field recordings/waves.wav",
      size: 3400200,
      kind: "audio",
      status: "metadata",
      text: "",
    },
    {
      path: "Sketches/studio.png",
      size: 82040,
      kind: "image",
      status: "metadata",
      text: "",
    },
  ]);
