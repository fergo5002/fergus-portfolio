import { createStore } from "./external-store";
import type { Store } from "./external-store";

/**
 * The terminal's memory: the scrollback and the recall list.
 *
 * Module-level, so `cd projects` typed in the drawer on one route and
 * `history` typed on the home page agree. Never persisted: a reload is a
 * fresh session, and nothing a visitor typed is written anywhere.
 */
export type Entry = { cmd: string; lines: string[] };

export type HistoryState = {
  /** What is on screen. `cmd` is "" for lines the machine printed unprompted. */
  entries: Entry[];
  /** What was typed, for up/down and the `history` command. */
  commands: string[];
};

export type HistoryEvent =
  | { type: "typed"; cmd: string }
  | { type: "print"; cmd: string; lines: string[] }
  | { type: "clear" };

export const WELCOME: string[] = [
  "FergusOS 5.0 'Mass' · interactive shell ready.",
  "tab completes · up/down recalls · try 'help', or 'gravity' if you are brave.",
];

/** Scrollback kept. A drawer open all afternoon must not grow without limit. */
export const ENTRY_CAP = 300;
/** Recall list kept. */
export const COMMAND_CAP = 500;

export const initialHistory = (): HistoryState => ({
  entries: [{ cmd: "", lines: WELCOME }],
  commands: [],
});

export function historyReduce(state: HistoryState, event: HistoryEvent): HistoryState {
  switch (event.type) {
    case "typed": {
      const cmd = event.cmd.trim();
      if (!cmd) return state;
      return { ...state, commands: [...state.commands, cmd].slice(-COMMAND_CAP) };
    }
    case "print":
      return {
        ...state,
        entries: [...state.entries, { cmd: event.cmd, lines: event.lines }].slice(-ENTRY_CAP),
      };
    case "clear":
      return state.entries.length === 0 ? state : { ...state, entries: [] };
  }
}

export const historyStore: Store<HistoryState, HistoryEvent> = createStore(historyReduce, initialHistory());
