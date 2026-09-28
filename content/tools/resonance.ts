import type { ToolEntry } from "./types";

export const resonance: ToolEntry = {
  "slug": "resonance",
  "name": "Resonance",
  "blurb": "Play four voices, shape a live sixteen-step sequence and perform with an XY surface. Save a patch or render eight bars to WAV.",
  "purpose": "Play four synthesised voices over sixteen steps, and keep the patch or eight bars as a WAV.",
  "method": [
    "Press play and the four voices loop over sixteen steps. A lit pad is a note, and the column of light is where the sequence has got to.",
    "Press a voice's note to hear it and to put it on the Note, Decay, Pan and Tone knobs. With the instrument focused, A S D F play the four voices and Escape stops everything.",
    "Drag across the square pad to play brightness from left to right and echo from bottom to top. The Brightness and Echo knobs move with it.",
    "Sound starts only when you press play or a voice, and it stops when you press stop, leave the page or hide the tab. The WAV is rendered in this browser from the current patch: eight bars plus the release tail."
  ],
  "cantSee": [
    "A synthesised step sequencer with a live scope. Changing a note or effect keeps the sequence running.",
    "Sound starts only after you play a voice or the sequence and stops when the page becomes hidden. WAV export renders the current patch, including its release tail."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 5
};
