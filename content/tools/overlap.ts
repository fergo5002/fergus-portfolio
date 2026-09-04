import type { ToolEntry } from "./types";

/**
 * Everything `/tools/overlap` says, including the relay's refusals, because a
 * route handler is not allowed to build a sentence any more than a component
 * is. `content/voice.test.ts` lints the prose and
 * `lib/tools/overlap/copy.test.ts` holds the claims to what the design can
 * actually support.
 */
export const overlapCopy = {
  command: "./overlap --two-tabs",
  path: "~/tools",
  title: "overlap",

  honesty: {
    notPsi:
      "This is not a private set intersection protocol, and calling it one would be a lie. Both browsers agree a random salt and then swap salted hashes, so the person you are comparing with holds the same salt you do. They can hash a list of people they are curious about and see whether any of them come back. This is a tool for two people who have chosen to compare notes. It is not a defence against the person on the other end.",
    claim:
      "The honest version of the promise is short: your list never leaves your browser. The other browser receives salted hashes, the salt and a count, never your file or its names.",
    theyLearn:
      "They also learn two things that are not on the list. Roughly how many connections you have, because the number of hashes is the number of names. And your IP address, because the two browsers connect straight to each other and that is what a direct connection is. Nothing about this tool avoids either.",
    relaySees:
      "The room code service holds one connection blob from each side for ten minutes and a daily-changing hash of your address for up to an hour. It never sees a hash from your list, a name, or the file. The blob does carry your address inside it, because that is how two browsers find each other.",
    safety:
      "The four characters under the result are computed from the salt and both connection fingerprints. Read them aloud to each other. A match is a useful check, not proof: two unrelated sessions have a one in 14,641 chance of matching by accident. If you do not read them aloud they do nothing at all.",
    storage:
      "This tool writes nothing to your machine: no cookie, no local storage, nothing. The forget command has nothing to wipe here.",
    stun:
      "Unless you turn it off, your browser asks a public address server run by Cloudflare what your address looks like from outside. It sends one small packet and no part of your file. Turn on same network only if you are both on the same wifi and would rather it did not. There is no TURN server, so both routes can fail on restrictive networks.",
  },

  export: {
    how: "To get the file: LinkedIn, then Settings and Privacy, then Data privacy, then Get a copy of your data. Tick Connections, ask for the archive, and LinkedIn emails you a link when it is ready.",
    link: "https://www.linkedin.com/mypreferences/d/download-my-data",
    linkLabel: "the LinkedIn download page",
  },

  demo: {
    tab: "Demo",
    label: "Demo. Both lists are invented, both are built in this tab, and no connection is opened.",
    save: "Save the two demo files",
    hint: "Save them, open this page in two browsers, and run the real flow with files that belong to nobody.",
  },

  file: {
    legend: "Your file",
    input: "Connections.csv",
    reading: "Reading the file.",
    read: "Read {rows} rows, using {used}.",
    skipped:
      "Skipped {empty} with no profile link, {legacy} old-style links and {other} that were not profile URLs.",
    pick: "Which column holds the profile URL?",
    noColumn: "No column in this file looks like a LinkedIn profile URL. Pick one and I will try it.",
    tooFew:
      "Under {min} usable rows, so there is nothing worth comparing. This is almost always the wrong file or the wrong column.",
  },

  connect: {
    legend: "Connect the two tabs",
    create: "Create a room",
    creating: "Making a room.",
    created: "Read this code to the other person: {code}. It works for ten minutes.",
    joinLabel: "Room code",
    join: "Join a room",
    joining: "Joining.",
    waiting: "Waiting for the other tab. {seconds}s left.",
    open: "Connected.",
    gaveUp:
      "Nobody joined in a minute. The code is dead now; make another one, or use copy and paste below.",
    failed:
      "The two browsers could not reach each other. That happens on some mobile networks. Copy and paste skips the room code service, but it still needs a direct browser connection and can fail on the same restrictive networks.",
    sameNetwork: "Same network only",
    pasteLegend: "Or copy and paste, with no room code server",
    pasteStart: "Start here and send this to the other person",
    pasteOffer: "Send this to the other person",
    pasteReply: "Paste what they send back",
    pasteJoin: "Paste what they sent you",
    pasteAnswer: "Send this back to them",
    pasteHint:
      "This skips my room code server. Unless same network only is on, both browsers still ask Cloudflare for their public address, then try to connect directly. Send the two blobs however you like.",
  },

  relay: {
    unavailable:
      "The room code service is not running, so codes are off right now. Use copy and paste below instead: it skips that service, though the two browsers still have to connect directly.",
    budget:
      "Room codes are capped so this stays free to run. Try again later, or use copy and paste below, which is never capped.",
    noRoom:
      "No room with that code. Codes last ten minutes, and they are case-insensitive but the characters have to be right.",
    alreadyJoined:
      "Somebody has already joined that room. If it was not the person you are expecting, make a new code.",
    badCode:
      "That is not a room code. Six characters from 2 3 4 6 7 9 F K M R W, and the hyphen is decoration.",
    badRequest: "That request was not the shape this service takes.",
    failed: "The room code service went wrong. Copy and paste below still works.",
  },

  result: {
    heading: "You both know",
    none: "Nobody, on these two files.",
    counts: "{mine} of yours against {theirs} of theirs.",
    exact:
      "Compared exactly, so there are no false matches beyond a one in twenty billion accident.",
    bloom:
      "One side sent a Bloom filter, because a list that size is a lot to push through a browser connection. That trades bytes for a small chance of a wrong name: about {rate} per name checked, so roughly {expected} wrong names in a result this size.",
    names: "Names come from your own file. Theirs never crossed.",
    safetyLabel: "Read these to each other",
  },

  errors: {
    file: "That file did not parse as a CSV.",
    protocol:
      "The other tab sent something this version does not understand. Both sides need the same version of the page.",
    other: "Something went wrong before the comparison finished.",
  },
} as const;

export const overlap: ToolEntry = {
  slug: "overlap",
  name: "Overlap",
  blurb:
    "Two people about to meet find out who they both already know, without either handing over a contact list. Both browsers hash their connections with a shared salt and compare the hashes rather than the files.",
  privacy: "browser",
  privacyLine:
    "Your file and names stay in this browser. Salted profile hashes go directly to the other browser; the room code service sees connection blobs and a daily-changing address hash, never your list.",
  privacyNote:
    "For room codes, a service holds one connection blob from each side for ten minutes so the two browsers can find each other. It never sees a name or a hash, and the copy and paste route skips it entirely.",
  cantSee: [
    "Second-degree paths. It compares two lists of people you are each already connected to, so somebody you both reach through a third person is invisible to it.",
    "Warmth. A colleague you speak to weekly and a stranger who sent a request in 2019 look exactly the same in an export, and this tool does not read the connected-on date to guess between them.",
    "Anyone who has changed their profile URL since one of the two exports was taken. The slug is the identifier, so an old file and a new one hold two different people as far as the hashing is concerned, and nothing can detect that.",
    "Rows with no profile link. LinkedIn leaves the URL out when a connection has restricted it, and those rows are counted and reported rather than guessed at.",
    "Old style /pub/ links from exports taken years ago. They are a different identifier space from an /in/ slug and comparing the two would invent matches.",
  ],
  status: "live",
  order: 30,
};
