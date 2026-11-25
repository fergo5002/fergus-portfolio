/**
 * The terminal window's life, kept pure so it can be tested without a DOM.
 *
 * `lib/shell.ts` says whether the terminal is open. The window needs two more
 * states than that, because it grows out of its handle and shrinks back into
 * it (`components/TermDock.tsx`): it must stay mounted while it shrinks, and
 * it must turn round if the shell opens again halfway. Under reduced motion it
 * goes straight between closed and open.
 */
export type DockPhase = "closed" | "opening" | "open" | "closing";

export function dockPhaseFor(current: DockPhase, open: boolean, reducedMotion: boolean): DockPhase {
  if (open) {
    if (reducedMotion) return "open";
    return current === "open" || current === "opening" ? current : "opening";
  }
  if (reducedMotion) return "closed";
  return current === "closed" || current === "closing" ? current : "closing";
}
