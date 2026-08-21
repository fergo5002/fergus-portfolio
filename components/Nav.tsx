"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Magnetic from "@/components/motion/Magnetic";
import { profile } from "@/content/profile";

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
 */
const items = [
  { href: "/", label: "~" },
  { href: "/experience", label: "experience" },
  { href: "/projects", label: "projects" },
  { href: "/writing", label: "writing" },
  { href: "/tools", label: "tools" },
  { href: "/mcp", label: "mcp" },
];

export default function Nav() {
  const path = usePathname();
  const shownPath = path === "/" ? "~" : path;

  return (
    <nav className="nav" aria-label="Primary">
      {/*
        Drawn from CSS, not written into the document, for the reason set out in
        `components/PromptLine.tsx`: this is costume, it sits above the headline
        on every route, and it was the first thing a text extractor read. The
        links below stay as real text because they are real navigation and a
        crawler has to follow them.
      */}
      <span
        className="nav__prompt"
        aria-hidden="true"
        style={
          {
            "--nav-user": JSON.stringify(`${profile.user}@${profile.host}`),
            "--nav-path": JSON.stringify(shownPath),
          } as CSSProperties
        }
      >
        <span className="nav__user" />
        <span className="nav__path" />
      </span>
      <ul className="nav__list">
        {items.map((it) => {
          const active = path === it.href;
          return (
            <li key={it.href}>
              <Magnetic pull={0.28}>
                <Link
                  href={it.href}
                  className={`nav__link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  cd {it.label}
                </Link>
              </Magnetic>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
