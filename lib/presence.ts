/**
 * Who else is on the tube.
 *
 * `who` prints presence once Burn (X1) exists: the number of tabs that sent a
 * pointer path in the last minute. Until then there is nobody to count but the
 * visitor, and the provider says so. X1 replaces `localPresence` with one that
 * asks the server; the command and the Terminal do not change.
 */
export type PresenceProvider = { count(): Promise<number> };

export const localPresence: PresenceProvider = {
  count: () => Promise.resolve(1),
};

export function formatWho(count: number): string[] {
  if (!Number.isFinite(count) || count <= 1) return ["just you"];
  return [`${Math.floor(count)} on the tube right now, counting you`];
}
