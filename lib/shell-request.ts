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
