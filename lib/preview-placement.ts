/**
 * Which side of its link a hover preview opens on.
 *
 * The homepage previews used to open downward unconditionally, so a link near
 * the bottom of the window dropped its card under the fixed status strip and
 * off the screen (Fergus, 2026-09-26). The strip is the real floor, not the
 * viewport edge, which is why it is an input here.
 *
 * Below is the default. Above is chosen only when below does not fit and above
 * does, or when neither fits and above has more room.
 */
export type PreviewPlacementInput = {
  anchorTop: number;
  anchorBottom: number;
  panelHeight: number;
  viewportHeight: number;
  /** Height of whatever is fixed along the bottom edge (the status strip). */
  reservedBottom: number;
  /** Height of whatever is fixed along the top edge (the nav). */
  reservedTop?: number;
  /** Space between the link and the card. */
  gap: number;
};

export function previewPlacement(p: PreviewPlacementInput): "below" | "above" {
  const floor = p.viewportHeight - p.reservedBottom;
  const roomBelow = floor - p.anchorBottom - p.gap;
  const roomAbove = p.anchorTop - p.gap - (p.reservedTop ?? 0);
  if (roomBelow >= p.panelHeight) return "below";
  if (roomAbove >= p.panelHeight) return "above";
  return roomAbove > roomBelow ? "above" : "below";
}
