"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Magnetic from "@/components/motion/Magnetic";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { requestArcadeLeave, requestCommand } from "@/lib/shell-request";
import { profile } from "@/content/profile";
import { useSystem } from "@/components/system/SystemProvider";
import { ARCADE_HOLD_MS, navDoor, navShown as items } from "@/content/nav";

const getServerShell = () => INITIAL_SHELL;

/**
 * The arcade is not a page. It is a program the terminal hosts, so this asks
 * the shell to run the door command and makes sure the terminal is up to hear
 * it: `open` rather than `toggle`, because a terminal that is already open must
 * stay open to run it.
 */
function openArcade(): void {
  requestCommand(navDoor.command);
  shellStore.dispatch({ type: "open" });
}

/**
 * Leaves the room the way Escape does. The room has no header of its own and a
 * phone has no Escape key, so the top bar carries this while the room is up.
 * Closing the shell is the fallback for a room that is not listening yet.
 */
function leaveArcadeRoom(): void {
  if (!requestArcadeLeave()) shellStore.dispatch({ type: "close" });
}

export default function Nav() {
  const path = usePathname();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
  const { setGravity, setEjected } = useSystem();
  const arcadeOpen = shell.arcade !== "closed";
  const shownPath = arcadeOpen ? "~/arcade" : path === "/" ? "~" : path;
  const listRef = useRef<HTMLUListElement>(null);
  const holdTimer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const leaveArcade = () => {
    shellStore.dispatch({ type: "close" });
    setGravity(false);
    setEjected(false);
  };

  // Press and hold `fergus@portfolio` for three seconds to open the arcade
  // (Fergus, 2026-11-25). The fill that sweeps the name while it is held is the
  // feedback: a hold with nothing to show for it would read as a dead control.
  // Letting go, sliding off or the browser taking the gesture for a scroll all
  // cancel it.
  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };
  const startHold = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 || arcadeOpen) return;
    cancelHold();
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setHolding(false);
      openArcade();
    }, ARCADE_HOLD_MS);
  };
  useEffect(() => cancelHold, []);

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
        crawler has to follow them. It is also the arcade's hidden door, held
        rather than clicked, and stays aria-hidden because `cd arcade` in the
        terminal is the way in for everyone else.
      */}
      <span
        className={`nav__prompt${holding ? " is-holding" : ""}`}
        aria-hidden="true"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => {
          if (holdTimer.current !== null) event.preventDefault();
        }}
        style={
          {
            "--nav-user": JSON.stringify(`${profile.user}@${profile.host}`),
            "--nav-path": JSON.stringify(shownPath),
            "--hold-ms": `${ARCADE_HOLD_MS}ms`,
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
        {arcadeOpen && (
          <li>
            <button
              type="button"
              className="nav__link nav__link--cmd is-active"
              onClick={leaveArcadeRoom}
              aria-label={navDoor.leaveLabel}
            >
              {navDoor.leave}
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
