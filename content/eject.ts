import { SYSTEM_VERSION } from "./machine";

/**
 * Everything the monitor's hardware says: the names printed under its
 * controls, what a screen reader hears for each position, and the on-screen
 * display a real set flashed up when you turned a knob.
 *
 * All of it is client-only. The hardware renders nothing until somebody first
 * ejects, so none of these words reach the server HTML or a text extractor
 * (the rule in AGENTS.md: costume that is not in the document costs nothing).
 */
export const ejectCopy = {
  hardware: "Monitor controls",
  channel: "channel",
  colour: "colour",
  contrast: "contrast",
  degauss: "degauss",
  power: "power",
  badge: "FergusOS",
  model: SYSTEM_VERSION,
  turnHint: "Drag to turn, or tap for the next position. Arrow keys work too.",
  degaussHint: "Degauss the tube",
  powerOnHint: "Switch the tube on",
  powerOffHint: "Switch the tube off",
  /** How the dial's positions are spoken. "~" is read as "tilde" otherwise. */
  /** What the dial says on a page that is not one of its channels. */
  channelOff: "between channels",
  channelValue: (n: number, label: string) => `channel ${n}, ${label === "~" ? "home" : label}`,
  contrastValue: (percent: number) => `${percent} percent`,
  /** The on-screen display, drawn by the tube itself in the corner of the picture. */
  osdChannel: (n: number, label: string) => `ch ${String(n).padStart(2, "0")}  ${label}`,
  osdColour: (theme: string) => `colour  ${theme}`,
  osdContrast: "contrast",
  osdDegauss: "degauss",
} as const;
