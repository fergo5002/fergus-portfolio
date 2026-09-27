/**
 * The machine's version, as the BIOS prints it on a cold boot. Bumped to 6.0
 * with the 2026-09 redesign. One place, so the next bump is one line.
 */
export const SYSTEM_VERSION = "6.0";

/** Labels for the controls built into the tube. */
export const machineCopy = {
  controls: "Machine controls",
  terminal: "terminal",
  openTerminal: "Open the terminal (backtick)",
  closeTerminal: "Close the terminal (Escape)",
  close: "close",
  soundOn: "sound on",
  soundOff: "sound off",
  mute: "Mute the tube",
  unmute: "Turn on sound. Key clicks, relays and the tube, silent at rest.",
  gravity: "gravity",
  restore: "restore",
  dropPage: "Gravity. Drag or throw the pieces. Escape puts them back.",
  restorePage: "Put the page back together",
  eject: "eject",
  dock: "enter",
  viewMachine: "Eject. Step out of the screen and use the machine itself.",
  viewPage: "Back into the screen",
} as const;

/** The screensaver: the line under the beam's figure, and the plate shown when there is no tube to draw on. */
export const saverCopy = {
  wake: "move to wake",
  plateTitle: "FergusOS",
  plateSub: "no signal · move to wake",
} as const;
