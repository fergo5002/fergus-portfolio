import { createStore } from "./external-store";
import type { Store } from "./external-store";

/**
 * The shell drawer's state, kept pure so it can be tested without a DOM.
 *
 * One drawer on every route. The arcade remains a program inside its Terminal,
 * and reports its phase so the navigation can join it after the entrance.
 * Closing the owner clears that phase, including when a navigation interrupts it.
 */
export type ShellState = {
  open: boolean;
  arcade: "closed" | "entering" | "ready";
};

export type ShellEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "arcade"; phase: ShellState["arcade"] };

export const INITIAL_SHELL: ShellState = { open: false, arcade: "closed" };

export function shellReduce(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case "open":
      return state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { open: false, arcade: "closed" } : state;
    case "toggle":
      return shellReduce(state, { type: state.open ? "close" : "open" });
    case "arcade":
      if (!state.open || event.phase === state.arcade) return state;
      return { ...state, arcade: event.phase };
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
