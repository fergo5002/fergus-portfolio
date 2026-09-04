/** One usable connection: the identifier that crosses, and the name that never does. */
export type Entry = {
  /** The normalised profile slug. This is the only thing that is ever hashed. */
  slug: string;
  /** What to print if this person turns out to be shared. Local to this tab, always. */
  label: string;
};

export type SlugRefusal = "empty" | "legacy-pub" | "not-a-profile";

export type SlugResult = { ok: true; slug: string } | { ok: false; reason: SlugRefusal };

/** Thrown when a peer sends a frame this version cannot read. Never shown raw. */
export class OverlapProtocolError extends Error {
  constructor(public readonly detail: string) {
    super(`overlap protocol: ${detail}`);
    this.name = "OverlapProtocolError";
  }
}

/** Thrown when a file has too little in it to be worth comparing. */
export class OverlapInputError extends Error {
  constructor(public readonly detail: string) {
    super(`overlap input: ${detail}`);
    this.name = "OverlapInputError";
  }
}
