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
 * The one entry in the nav that is not a page. The arcade is a program the
 * terminal hosts, so the nav asks the shell to run this command rather than
 * linking anywhere (see `lib/shell-request.ts`).
 */
export const navDoor = { label: "arcade", command: "cd arcade", leaveLabel: "cd arcade, leave the arcade" } as const;
