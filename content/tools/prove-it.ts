import type { ToolEntry } from "./types";

export const proveIt: ToolEntry = {
  "slug": "prove-it",
  "name": "Prove It",
  "blurb": "Twelve case files. Collect evidence, track your confidence and discover what would change your mind.",
  "purpose": "Twelve short cases: spend a small budget on evidence, then put your confidence on the record.",
  "method": [
    "You can commit at any time. A correct guess earns less than a conclusion supported by evidence.",
    "Scoring: 35 for the conclusion, 40 for evidence that separates the explanations, up to 15 for budget efficiency, and up to 10 for confidence accuracy (one minus squared error). This is a game score."
  ],
  "cantSee": [
    "Twelve authored, deterministic cases with a deliberately simplified model of evidence.",
    "The score rewards investigation, not real-world expertise. Replaying a known case changes the challenge."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 4
};
