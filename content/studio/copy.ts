import { atlasCopy } from "./atlas-copy";
import { legacyLoreCopy, loreCopy } from "./lore-copy";
import { musicCopy } from "./music-copy";
import { studioSharedCopy } from "./shared";

/**
 * A barrel. Each studio's words live in their own file so the agents
 * rebuilding one studio each never edit the same line; this keeps the
 * `studioCopy.atlas.drop` shape every studio already imports.
 */
export const studioCopy = {
  ...studioSharedCopy,
  atlas: atlasCopy,
  lore: { ...legacyLoreCopy, ...loreCopy },
  music: musicCopy,
};

export { studioShellCopy } from "./shared";
