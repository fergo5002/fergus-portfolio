import type { GameId } from "@/lib/arcade/engine";

/**
 * The six cabinets and every word the room prints.
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
  multiplayer: boolean;
};

export const cabinets: readonly Cabinet[] = [
  {
    id: "bounce",
    title: "BREAKPOINT",
    subtitle: "everything has a breaking point.",
    genre: "MAGNETIC BRICK BREAKER",
    description: "an electron loose inside the machine. tear through the memory banks, bend the rebound, and when the ball comes back hold the field to catch it. then let it go.",
    objective: "clear the banks. chain hits for a ×5 multiplier. every cleared sector earns an extra ball.",
    controls: "a / d, the arrows, or drag. space launches. hold space as the ball returns to catch it on the magnet; a catch costs 25 charge.",
    action: "LAUNCH / MAGNET",
    multiplayer: false,
  },
  {
    id: "pong",
    title: "PHOSPHOR PONG",
    subtitle: "the shortest path is never straight.",
    genre: "GRAVITY-WELL DUEL",
    description: "a singularity drifts down the middle of the tube and bends every rally. read the curve, hold your nerve, overcharge the return. one tube, two ends.",
    objective: "first to seven. an overcharge just before contact sends it back faster. play the machine or a friend.",
    controls: "solo: w / s or the arrows; space overcharges. two players: w / s and space for green, up / down and enter for amber. drag a paddle on touch.",
    action: "OVERCHARGE",
    multiplayer: true,
  },
  {
    id: "snake",
    title: "OUROBOROS",
    subtitle: "your past is trying to kill you.",
    genre: "PHASE-SHIFT SNAKE",
    description: "eat the signal and become the maze. for 1.8 seconds you can phase through your own history and slip off one edge of the screen onto the other. spend it well.",
    objective: "collect the amber signals. a phase costs 65 charge; food gives some back. in two-player mode the first crash ends the match.",
    controls: "wasd, the arrows, or the direction pad. space phases. two players: wasd and space for green, arrows and enter for amber.",
    action: "PHASE SHIFT",
    multiplayer: true,
  },
  {
    id: "under",
    title: "UNDER THE TERMINAL",
    subtitle: "something is still running down there.",
    genre: "DAILY DESCENT",
    description: "below the command line the abandoned processes are awake. find the key, reach the lift, go down. a different dungeon every utc day, and the same one for everybody.",
    objective: "find the amber key, then the lift. walk into a bug to attack it. a pulse clears the bugs around you. nothing moves until you do.",
    controls: "wasd, the arrows, or the direction pad. space sends a test pulse for 45 charge. moving restores charge. a green cross repairs two health.",
    action: "TEST PULSE",
    multiplayer: false,
  },
  {
    id: "signal",
    title: "DEAD SIGNAL",
    subtitle: "you are the last live pixel.",
    genre: "VECTOR SURVIVAL",
    description: "the noise is closing in. your beam hunts on its own; you concentrate on staying alive. thread the swarm, build a chain, and when it gets tight discharge the whole screen.",
    objective: "survive the waves. the beam aims at the nearest threat. kills build the multiplier and recharge the pulse.",
    controls: "wasd, the arrows, drag, or the direction pad. space discharges a pulse around you for 65 charge. three hull points.",
    action: "DISCHARGE",
    multiplayer: false,
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
    multiplayer: false,
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
  lede: "six cabinets, running on the machine you are already using. free play, no coins, no accounts.",
  hint: "pick a cabinet",
  arrival: "entering the arcade",
  skip: "skip",
  exit: "leave the arcade",
  exitShort: "esc",
  fame: "hall of fame",
  fameShort: "fame",
  fameLede: "every board on the machine. solo runs only. three initials, no accounts, no verification: a casual board, held honestly.",
  soundOn: "sound on",
  soundOff: "sound off",
  players1: "1P",
  players2: "1-2P",
  demo: "demo",
  topFive: "top five",
  play: "start solo run",
  local: "two players, one screen",
  online: "connect a friend",
  back: "all cabinets",
  objective: "objective",
  controls: "controls",
  pause: "pause",
  resume: "resume",
  restart: "play again",
  paused: "SYSTEM PAUSED",
  over: "SIGNAL LOST",
  won: "CIRCUIT COMPLETE",
  matchResult: "match result",
  draw: "DRAW",
  greenWins: "GREEN WINS",
  amberWins: "AMBER WINS",
  score: "final score",
  board: "high scores",
  allTime: "all time",
  today: "today, utc",
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
  boardNote: "casual, client-reported scores. no accounts. solo runs only.",
  privacy: "the games run in your browser. posting shares three initials and a score, nothing else. the initials are kept on this device only when you post, and the forget command clears them.",
  netPrivacy: "a direct connection shares your ip address with your opponent. cloudflare stun helps the browsers find each other. there is no relay for game traffic, so some networks cannot connect.",
  netTitle: "link the cabinets",
  netIntro: "open this game on both devices. the host sends an invite, the other player returns an answer, then the host connects.",
  create: "create invite",
  join: "answer invite",
  connect: "connect cabinets",
  copy: "copy",
  copied: "copied",
  invite: "invite or answer code",
  outgoingHost: "send this invite to your friend",
  outgoingGuest: "send this answer back to the host",
  outgoing: "outgoing connection code",
  selectToCopy: "select the code above and copy it.",
  copyFailed: "copy failed. select the code above and copy it.",
  netWait: "waiting for your friend…",
  netConnecting: "connecting the cabinets…",
  netReady: "cabinets linked. the host starts the match.",
  netFailure: "the cabinets could not connect. try again, or play on one screen.",
  disconnected: "your opponent disconnected. go back to the cabinets to reconnect.",
  networkUnsupported: "this browser cannot open a direct connection. two players can still share this screen.",
  match: "start linked match",
  notRanked: "two-player matches are for bragging rights. the boards rank solo runs.",
  displayFailed: "this browser could not open the game display.",
} as const;
