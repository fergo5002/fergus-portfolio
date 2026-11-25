/**
 * The machine's version, as the BIOS prints it on a cold boot and `help`,
 * `neofetch` and `status` print it in the terminal. Bumped to 6.0 with the
 * 2026-09 redesign. One place, so the next bump is one line.
 */
export const SYSTEM_VERSION = "6.0";

/**
 * Labels for the terminal's dock: the handle in the bottom right that opens
 * the terminal window, the window's own buttons, and the two ways back that
 * appear only while gravity or eject is on. The bottom status bar these used to
 * live in went on 2026-11-25; everything it did is a terminal command now.
 */
export const machineCopy = {
  terminal: "terminal",
  openTerminal: "Open the terminal (backtick)",
  closeTerminal: "Minimise the terminal (Escape)",
  /** The red light. It minimises too, as on a Mac, but says close. */
  closeWindow: "Close the terminal window",
  zoomIn: "Make the terminal bigger",
  zoomOut: "Make the terminal smaller",
  restore: "restore page",
  restorePage: "Put the page back together",
  dock: "back in",
  viewPage: "Back into the screen",
} as const;
