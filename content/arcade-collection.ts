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
    description: "rogue processes are falling towards the kernel. type a name and it dies before it lands. forks split in two, sudo clears the screen, and three landings panic the kernel.",
    objective: "type each falling name before it reaches the kernel. the first letter locks on to the lowest match. clean kills build the combo to x4, and every twelfth in a row drops a sudo.",
    controls: "type on the keyboard. a wrong letter breaks the combo. backspace steps back, and from the first letter lets go. on a phone, tap to start and the keyboard comes up: phone runs ask for letters and spaces only.",
    action: "TYPE",
    card: {
      lines: ["PROCESSES FALL TOWARDS THE KERNEL.", "TYPE A NAME TO KILL IT.", "LET THREE LAND AND THE KERNEL PANICS."],
      keys: [
        { caps: ["K", "I", "L", "L"], keys: ["type"], label: "TYPE THE NAME" },
        { caps: ["⌫"], keys: ["erase"], label: "STEP BACK" },
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
  /** Small print under the two processes that do something when they die. */
  panicTags: { fork: "KILL IT AND IT SPLITS IN TWO", sudo: "TYPE IT TO CLEAR THE SCREEN" },
  /**
   * What Kernel Panic's screen halts on. `{pid}`, `{comm}` and the hex fields
   * are filled from the run by `lib/arcade/draw/panic.ts`; the drawer prefixes
   * each line with a timestamp where the screen is wide enough.
   */
  panicDump: [
    "Kernel panic - not syncing: Attempted to kill init! exitcode=0x0000000b",
    "CPU: 0 PID: {pid} Comm: {comm} Not tainted 6.9.0-fergusos #1",
    "Hardware name: FergusOS Phosphor CRT, BIOS 1.0 09/2026",
    "Call Trace:",
    " <TASK>",
    " dump_stack_lvl+{a}/0x70",
    " panic+{b}/0x3a0",
    " kernel_line_breach+{c}/0x40",
    " do_exit+{d}/0xb20",
    " </TASK>",
    "Kernel Offset: {offset} from 0xffffffff81000000",
    "---[ end Kernel panic - not syncing: Attempted to kill init! ]---",
  ],
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
  fameTitle: "FERGUSOS ARCADE HALL OF FAME",
  fameLede: "the best runs on every cabinet. three initials, no accounts, no verification: a casual board, held honestly. each cabinet counts something different, so each keeps its own column.",
  fameRank: "rank",
  fameSwitch: "choose a cabinet's board",
  fameEmptySlot: "empty",
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
