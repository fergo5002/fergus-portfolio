/**
 * The nav is also the site's internal link graph, which is why `/tools` and
 * `/mcp` are here rather than only in the sitemap.
 *
 * A page reachable by sitemap alone is reachable, but it is the weakest form of
 * it: nothing on the site says it matters, and internal links are how a crawler
 * decides that. `/contact` is the deliberate exception and always has been, and
 * it gets away with it because every `Talk` block links to it, so it is well
 * linked without being in the chrome. These two had nothing pointing at them at
 * all.
 *
 * Its own file since the eject rebuild (2026-09-27): the monitor's channel dial
 * has a detent per route, and it reads this list rather than keeping a copy that
 * could fall one route behind.
 */
export const navItems = [
  { href: "/", label: "~" },
  { href: "/experience", label: "experience" },
  { href: "/projects", label: "projects" },
  { href: "/writing", label: "writing" },
  { href: "/tools", label: "tools" },
  { href: "/mcp", label: "mcp" },
] as const;

/**
 * The routes the top bar shows. `/mcp` stays a channel on the ejected
 * monitor's dial and a `cd mcp` in the terminal, and `/tools` links to it, but
 * Fergus took it out of the top bar on 2026-11-25 along with `cd arcade`.
 */
export const navShown = navItems.filter((item) => item.href !== "/mcp");

/**
 * The arcade is a program the terminal hosts, not a page, so nothing links to
 * it: the shell runs this command (see `lib/shell-request.ts`). Since
 * 2026-11-25 the top bar has no `cd arcade`. The way in is `cd arcade` in the
 * terminal, or pressing and holding `fergus@portfolio` in the top left for
 * `ARCADE_HOLD_MS`. Nothing on the page says so; `top` still lists the arcade
 * as a running process. While the room is up the top bar shows `leave`, because
 * a phone has no Escape key.
 */
export const navDoor = {
  label: "arcade",
  command: "cd arcade",
  leave: "cd ..",
  leaveLabel: "cd .., leave the arcade",
} as const;

export const ARCADE_HOLD_MS = 3000;
