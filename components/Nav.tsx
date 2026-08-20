"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Magnetic from "@/components/motion/Magnetic";
import { profile } from "@/content/profile";

const items = [
  { href: "/", label: "~" },
  { href: "/experience", label: "experience" },
  { href: "/projects", label: "projects" },
  { href: "/writing", label: "writing" },
];

export default function Nav() {
  const path = usePathname();
  const shownPath = path === "/" ? "~" : path;

  return (
    <nav className="nav" aria-label="Primary">
      <span className="nav__prompt">
        <span className="nav__user">
          {profile.user}@{profile.host}
        </span>
        :<span className="nav__path">{shownPath}</span>$
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
