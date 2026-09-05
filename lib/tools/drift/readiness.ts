import { MIN_DELTA_WORDS } from "./delta";
import { MIN_PROFILE_WORDS } from "./profile";
import { splitPieces, wordCount } from "./text";

export const MAX_SAMPLES_CHARS = 100_000;
export const MAX_DRAFT_CHARS = 30_000;

export function profileReadiness(text: string) {
  const pieces = text.length <= MAX_SAMPLES_CHARS ? splitPieces(text) : [];
  const bounded = text.length <= MAX_SAMPLES_CHARS && pieces.length <= 50;
  const words = bounded ? pieces.reduce((sum, piece) => sum + wordCount(piece), 0) : 0;
  return { bounded, pieces: pieces.length, words, enoughPieces: pieces.length >= 5, enoughWords: words >= MIN_PROFILE_WORDS };
}

export function draftReadiness(text: string) {
  const bounded = text.length <= MAX_DRAFT_CHARS;
  const words = bounded ? wordCount(text) : 0;
  return { bounded, words, ready: bounded && words >= MIN_DELTA_WORDS };
}
