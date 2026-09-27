import type { GameId } from "@/lib/arcade/engine";

/**
 * The cabinets and every word the room prints.
 *
 * Two voices, on purpose. A cabinet's marquee and anything drawn on its screen
 * is uppercase, the way a real cabinet shouts its own name. Everything the
 * machine says in prose is the terminal's voice: lower case, flat, no
 * exclamation marks, the register `gravity: declined.` is written in.
 */
export type Cabinet = {
  id: GameId;
  title: string;
  subtitle: string;
  genre: string;
  description: string;
  objective: string;
  controls: string;
  action: string;
};

export const cabinets: readonly Cabinet[] = [
  {
    id: "signal",
    title: "DEAD SIGNAL",
    subtitle: "you are the last live pixel.",
    genre: "VECTOR SURVIVAL",
    description: "the noise is closing in. your beam hunts on its own; you concentrate on staying alive. thread the swarm, build a chain, and when it gets tight discharge the whole screen.",
    objective: "survive the waves. the beam aims at the nearest threat. kills build the multiplier and recharge the pulse.",
    controls: "wasd, the arrows, drag, or the direction pad. space discharges a pulse around you for 65 charge. three hull points.",
    action: "DISCHARGE",
  },
  {
    id: "poker",
    title: "CIRCUIT POKER",
    subtitle: "play the hand. break the circuit.",
    genre: "DRAW-POKER PUZZLE",
    description: "five cards, two redraws, three hands to meet a rising target. hold the pieces of a good circuit, or bank what you have before the machine asks for more.",
    objective: "beat each circuit's target within three hands. each hand allows two redraws. bank a hand to score it and deal the next.",
    controls: "tap a card or press 1 to 5 to hold it. space redraws the rest. enter banks the hand. no money, no betting, no accounts.",
    action: "REDRAW",
  },
];

/** The lines the arcade's BIOS types while the tube opens. Two of them are true rather than typed. */
export function biosLines(cabinetCount: number, boards: "online" | "offline" | "checking"): string[] {
  return [
    "FERGUSOS ARCADE BIOS 1.0",
    "(c) 2026 fergus o'reilly. free play.",
    "rom check ......... ok",
    `cabinets found .... ${cabinetCount}`,
    `boards ............ ${boards}`,
    "credits ........... unlimited",
  ];
}

export const collectionCopy = {
  label: "FergusOS arcade",
  title: "FERGUSOS ARCADE",
  ledeLead: "you found the other side of the glass.",
  lede: "the cabinets run on the machine you are already using. free play, no coins, no accounts.",
  hint: "pick a cabinet",
  arrival: "entering the arcade",
  skip: "skip",
  exit: "leave the arcade",
  exitShort: "esc",
  fame: "hall of fame",
  fameShort: "fame",
  fameLede: "every board on the machine. three initials, no accounts, no verification: a casual board, held honestly.",
  soundOn: "sound on",
  soundOff: "sound off",
  players1: "1P",
  demo: "demo",
  topFive: "top five",
  play: "start solo run",
  back: "all cabinets",
  objective: "objective",
  controls: "controls",
  pause: "pause",
  resume: "resume",
  restart: "play again",
  paused: "SYSTEM PAUSED",
  over: "SIGNAL LOST",
  won: "CIRCUIT COMPLETE",
  score: "final score",
  board: "high scores",
  allTime: "all time",
  loading: "reading the board…",
  empty: "no scores yet. be first.",
  unavailable: "the board is offline. the game still works.",
  submit: "post score",
  submitting: "posting…",
  saved: "posted. that is your row, lit.",
  yourRank: "your rank",
  offBoard: "posted, but below the top twenty. the board keeps the best.",
  noTicket: "score entry could not be prepared. play again to retry.",
  initials: "your three initials",
  boardNote: "casual, client-reported scores. no accounts.",
  privacy: "the games run in your browser. posting shares three initials and a score, nothing else. the initials are kept on this device only when you post, and the forget command clears them.",
  displayFailed: "this browser could not open the game display.",
} as const;
