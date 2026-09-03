import { createStore } from "./external-store";
import type { Store } from "./external-store";

/**
 * The shell drawer's state, kept pure so it can be tested without a DOM.
 *
 * Two facts, one machine. `open` is whether the drawer is showing. `inline` is
 * whether the current route already hosts the terminal in the page (the home
 * page does), in which case the drawer refuses to open: one terminal on a
 * page, never two. `components/ShellDrawer.tsx` feeds the route in and reads
 * the result; nothing else decides.
 */
export type ShellState = {
  open: boolean;
  inline: boolean;
};

export type ShellEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "route"; inline: boolean };

export const INITIAL_SHELL: ShellState = { open: false, inline: false };

export function shellReduce(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case "open":
      return state.inline || state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false } : state;
    case "toggle":
      return shellReduce(state, { type: state.open ? "close" : "open" });
    case "route":
      if (event.inline === state.inline) return state;
      // Arriving on the inline host closes the drawer. Leaving it changes
      // nothing else: a drawer that was open stays open across navigation.
      return { open: event.inline ? false : state.open, inline: event.inline };
  }
}

/** The part of an event target the hotkey rule needs. */
export type KeyTarget = { tagName: string; isContentEditable?: boolean };

/**
 * Whether a keydown should summon the shell: the backtick, unmodified, with
 * focus outside anything a person types into. A backtick typed into the
 * contact form's message is a backtick.
 */
export function isShellHotkey(
  key: string,
  mods: { ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  target: KeyTarget | null,
): boolean {
  if (key !== "`") return false;
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return false;
  if (!target) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target.isContentEditable) return false;
  return true;
}

export function createShellStore(): Store<ShellState, ShellEvent> {
  return createStore(shellReduce, INITIAL_SHELL);
}

/**
 * The one drawer. Module-level so it survives client navigation. Never
 * persisted: a reload starts closed, which is what a reload should do.
 */
export const shellStore = createShellStore();
