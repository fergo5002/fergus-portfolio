"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Magnetic from "@/components/motion/Magnetic";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { requestArcadeLeave, requestCommand } from "@/lib/shell-request";
import { profile } from "@/content/profile";
import { useSystem } from "@/components/system/SystemProvider";
import { navDoor, navItems as items } from "@/content/nav";

const getServerShell = () => INITIAL_SHELL;

/**
 * `cd arcade` is the one control here that is not a link, because the arcade
 * is not a page. It is a program the terminal hosts, so this asks the shell to
 * run the door command and makes sure the drawer is there to hear it. `open` rather than
 * `toggle`, because a drawer that is already open must stay open to run it.
 *
 * Pressed while the arcade is up, it leaves the way Escape does (2026-09-28):
 * the room has no header of its own, and a phone has no Escape key, so this is
 * a touch screen's way out. Closing the shell is the fallback for a room that
 * is not listening yet.
 */
function toggleArcade(): void {
  if (shellStore.get().arcade !== "closed") {
    if (!requestArcadeLeave()) shellStore.dispatch({ type: "close" });
    return;
  }
  requestCommand("cd arcade");
  shellStore.dispatch({ type: "open" });
}

export default function Nav() {
  const path = usePathname();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
  const { setGravity, setEjected } = useSystem();
  const arcadeOpen = shell.arcade !== "closed";
  const shownPath = arcadeOpen ? "~/arcade" : path === "/" ? "~" : path;
  const listRef = useRef<HTMLUListElement>(null);
  const leaveArcade = () => {
    shellStore.dispatch({ type: "close" });
    setGravity(false);
    setEjected(false);
  };

  // On a phone the list scrolls sideways, and the link for the page you are on
  // may start off its edge. Move the list's own scroll position, never
  // `scrollIntoView`: that is allowed to move the page too, and the nav is
  // fixed to the top of a page that has just been navigated to.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(".nav__link.is-active");
    if (!list || !active) return;
    const l = list.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < l.left || a.right > l.right - 32) list.scrollLeft += a.left - l.left - 16;
  }, [path, arcadeOpen]);

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
      <ul className="nav__list" ref={listRef}>
        {items.map((it) => {
          const active = !arcadeOpen && path === it.href;
          return (
            <li key={it.href}>
              <Magnetic pull={0.28}>
                <Link
                  href={it.href}
                  onClick={leaveArcade}
                  className={`nav__link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  cd {it.label}
                </Link>
              </Magnetic>
            </li>
          );
        })}
        <li>
          <Magnetic pull={0.28}>
            <button
              type="button"
              className={`nav__link nav__link--cmd${arcadeOpen ? " is-active" : ""}`}
              onClick={toggleArcade}
              aria-current={arcadeOpen ? "location" : undefined}
              aria-label={arcadeOpen ? navDoor.leaveLabel : undefined}
            >
              cd arcade
            </button>
          </Magnetic>
        </li>
      </ul>
    </nav>
  );
}
