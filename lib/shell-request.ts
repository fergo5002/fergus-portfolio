/**
 * A command somebody asked the shell to run from outside the terminal.
 *
 * The nav's `cd arcade` (Fergus, 2026-09-06) is the reason this exists. The
 * arcade is not a page: it is a program the terminal hosts, and
 * `components/Terminal.tsx` is the only place allowed to act on a program
 * result. So the nav does not open the arcade; it asks the shell to, and
 * the drawer's Terminal takes the request and runs it as if it had been typed.
 *
 * One slot, not a queue: a person pressing the control means one thing, and
 * the latest press wins. Taken once, so two terminals mounting in quick
 * succession (StrictMode, Fast Refresh) cannot both open the door. Module
 * level and never persisted, like the drawer state it works with.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export function requestCommand(cmd: string): void {
  pending = cmd;
  for (const listener of [...listeners]) listener();
}

/** The pending command, and nothing the next time. */
export function takeRequest(): string | null {
  const cmd = pending;
  pending = null;
  return cmd;
}

export function subscribeRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Leaving the arcade from outside it (2026-09-28). The room has no header of
 * its own, so the nav's `cd arcade` is the way out on a screen with no Escape
 * key, and it should leave the way Escape does: through the room's own
 * `leave()`, which degausses, prints the exit line and hands the drawer's
 * terminal back. Closing the shell instead would take the drawer with it.
 */
const leaveListeners = new Set<() => void>();

/** Ask the running room to leave. False when no room is listening. */
export function requestArcadeLeave(): boolean {
  if (leaveListeners.size === 0) return false;
  for (const listener of [...leaveListeners]) listener();
  return true;
}

export function subscribeArcadeLeave(listener: () => void): () => void {
  leaveListeners.add(listener);
  return () => {
    leaveListeners.delete(listener);
  };
}
