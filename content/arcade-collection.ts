import type { GameId } from "@/lib/arcade/engine";
import type { KeySpec } from "@/lib/arcade/chrome";

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
  /** The how-to-play card drawn on the screen before a run: two or three short lines and the real keys. */
  card: { lines: readonly string[]; keys: readonly KeySpec[] };
  /** What the GAME OVER screen says under the words GAME OVER. */
  overLine: string;
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
    card: {
      lines: ["THE BEAM AIMS ITSELF. YOU DODGE.", "KILLS CHARGE THE PULSE.", "THREE HITS AND THE SIGNAL IS LOST."],
      keys: [
        { caps: ["↑", "←", "↓", "→"], keys: ["up", "left", "down", "right"], label: "MOVE / WASD", cluster: true, touch: ["D-PAD", "DRAG"], touchLabel: "MOVE" },
        { caps: ["SPACE"], keys: ["action"], label: "PULSE", touch: ["DISCHARGE"], touchLabel: "THE PULSE" },
      ],
    },
    overLine: "SIGNAL LOST",
  },
  {
    id: "poker",
    title: "CIRCUIT POKER",
    subtitle: "play the hand. break the circuit.",
    genre: "DRAW-POKER PUZZLE",
    description: "five cards, two redraws, three hands to meet a rising target. hold the pieces of a good circuit, or bank what you have before the machine asks for more.",
    objective: "beat each circuit's target within three hands. each hand allows two redraws. bank a hand to score it and deal the next.",
    controls: "tap a card or press 1 to 5 to hold it. space redraws the rest. enter banks the hand. no money, no betting, no accounts.",
    action: "DRAW",
    card: {
      lines: ["HOLD THE CARDS THAT MAKE A HAND.", "DRAW UP TO TWICE, THEN BANK IT.", "THREE HANDS TO BEAT THE TARGET."],
      keys: [
        { caps: ["1", "2", "3", "4", "5"], keys: ["1", "2", "3", "4", "5"], label: "HOLD A CARD", touch: ["TAP A CARD"], touchLabel: "TO HOLD IT" },
        { caps: ["SPACE"], keys: ["action"], label: "DRAW THE REST", touch: ["DRAW"], touchLabel: "THE REST" },
        { caps: ["ENTER"], keys: ["bank"], label: "BANK THE HAND", touch: ["BANK"], touchLabel: "THE HAND" },
      ],
    },
    overLine: "CIRCUIT BROKEN",
  },
  {
    id: "panic",
    title: "KERNEL PANIC",
    subtitle: "type fast. the kernel is watching.",
    genre: "TYPING DEFENCE",
    description: "rogue processes are falling towards the kernel. type a process's name and it dies before it lands. let three through and the kernel panics.",
    objective: "type each falling name before it reaches the kernel. a wrong letter clears the line. the waves get faster.",
    controls: "type on the keyboard. backspace takes a letter back. on a phone, tap to start and the keyboard comes up.",
    action: "TYPE",
    card: {
      lines: ["PROCESSES FALL TOWARDS THE KERNEL.", "TYPE A NAME TO KILL IT.", "LET THREE LAND AND IT PANICS."],
      keys: [
        { caps: ["A", "…", "Z"], keys: ["type"], label: "TYPE A NAME", touch: ["KEYBOARD"] },
        { caps: ["⌫"], keys: ["erase"], label: "TAKE BACK" },
      ],
    },
    overLine: "KERNEL PANIC",
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

/** Every word drawn on a game's screen. A cabinet's own voice, so uppercase. */
export const screenCopy = {
  pressSpace: "PRESS SPACE",
  tapToStart: "TAP TO START",
  orEnter: "OR ENTER",
  howToPlay: "HOW TO PLAY",
  demo: "DEMO",
  score: "SCORE",
  best: "BEST",
  gameOver: "GAME OVER",
  finalScore: "FINAL SCORE",
  newBest: "NEW BEST",
  reached: "REACHED",
  held: "HELD",
  bank: "BANK",
  lives: { hull: "HULL", hand: "HANDS", core: "KERNEL" },
  /** Circuit Poker's table. */
  table: { banked: "BANKED", target: "TARGET", worth: "WORTH", draws: "DRAWS", hand: "HAND" },
  /** Kernel Panic's floor. */
  kernel: "KERNEL",
} as const;

export const collectionCopy = {
  label: "FergusOS arcade",
  title: "FERGUSOS ARCADE",
  ledeLead: "you found the other side of the glass.",
  lede: "three cabinets, running on the machine you are already using. free play, no coins, no accounts.",
  hint: "pick a cabinet",
  arrival: "entering the arcade",
  skip: "skip",
  exit: "leave the arcade",
  fame: "hall of fame",
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
  pausedHelp: "p or the resume button carries on. escape leaves the arcade.",
  typeLabel: "type here",
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

/** What the hidden status line tells a screen reader about the run, about once a second. */
export function statusLine(parts: { title: string; phase: "card" | "countdown" | "play" | "over"; score: number; stage?: string; lives?: string; paused: boolean }): string {
  if (parts.phase === "card") return `${parts.title.toLowerCase()}. press space or enter to start.`;
  if (parts.phase === "countdown") return `${parts.title.toLowerCase()}. get ready.`;
  if (parts.phase === "over") return `game over. ${parts.score} points.`;
  const bits = [`${parts.score} points`, parts.stage, parts.lives].filter(Boolean).join(". ");
  return parts.paused ? `paused. ${bits}.` : `${bits}.`;
}
