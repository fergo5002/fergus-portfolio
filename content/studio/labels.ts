import { atlasLabels, graphLabels } from "./atlas-copy";
import { proveItLabels } from "./cases";
import { loreLabels } from "./lore-copy";
import { musicLabels } from "./music-copy";
import { redactLabels } from "./redact";

/**
 * A barrel. Supporting interface labels for the five studios, each kept in its
 * own studio's file so parallel rebuilds never collide here.
 */
export const studioLabels = {
  Atlas: atlasLabels,
  GraphCanvas: graphLabels,
  GroupLore: loreLabels,
  PocketRedact: redactLabels,
  ProveIt: proveItLabels,
  Resonance: musicLabels,
} as const;
