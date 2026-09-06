import type { ToolEntry } from "./types";

export const resonance: ToolEntry = {
  "slug": "resonance",
  "name": "Resonance",
  "blurb": "Play four voices, shape a live sixteen-step sequence and perform with an XY surface. Save a patch or render eight bars to WAV.",
  "cantSee": [
    "A synthesised step sequencer with visual pendulums. Changing a note or effect keeps the sequence running.",
    "Sound starts only after you play a pad or sequence and stops when the page becomes hidden. WAV export renders the current patch, including its release tail."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 5
};
