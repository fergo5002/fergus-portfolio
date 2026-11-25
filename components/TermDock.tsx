"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AnimationEvent, CSSProperties } from "react";
import { usePathname } from "next/navigation";
import Terminal from "@/components/Terminal";
import { INITIAL_SHELL, isShellHotkey, shellStore } from "@/lib/shell";
import { dockPhaseFor, type DockPhase } from "@/lib/dock";
import { machineCopy as copy } from "@/content/machine";
import { profile } from "@/content/profile";
import { useSystem } from "@/components/system/SystemProvider";

const getServerShell = () => INITIAL_SHELL;

/** The handle's toggle, shared by the backtick and the handle itself. */
export function summonShell(): void {
  shellStore.dispatch({ type: "toggle" });
}

/** Where focus goes when the window minimises: the handle it went into. */
function focusHandle(): void {
  document.querySelector<HTMLElement>(".term-handle")?.focus();
}

/**
 * The terminal, everywhere. Replaced the status bar along the bottom of the
 * tube on 2026-11-25: Fergus wanted the bar gone and everything it did to live
 * in the terminal, opened from a handle in the bottom right that "expands a
 * terminal apple mac windows expanding/compressing style".
 *
 * - **The handle** is a real button. Hover or focus widens it to say what it
 *   is; a dot under it shows the window is up, like a dock.
 * - **The window** grows out of the handle and shrinks back into it, a genie
 *   drawn in CSS (`globals.css`, "THE TERMINAL DOCK"). Its three lights close,
 *   minimise and zoom it. Under `prefers-reduced-motion: reduce` it simply
 *   appears and goes.
 * - **The two ways back**: while gravity has dropped the page or eject has
 *   pulled the camera back, a button beside the handle puts things back. They
 *   exist only while there is something to undo, because a control that can
 *   do nothing must not be rendered, and a phone has no Escape key.
 *
 * `lib/shell.ts` owns whether the terminal is open and `lib/history.ts` what it
 * shows, so the window unmounts once it has shrunk away and loses nothing. It
 * sits outside the tube's assembly in `CrtShell`, so an ejected monitor does
 * not take the way back in with it.
 */
export default function TermDock() {
  const state = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
  const path = usePathname();
  const { reducedMotion, gravityOn, setGravity, ejected, setEjected } = useSystem();
  const [phase, setPhase] = useState<DockPhase>("closed");
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setPhase((current) => dockPhaseFor(current, state.open, reducedMotion));
  }, [state.open, reducedMotion]);

  // The animation's own end moves the phase on. This is the backstop for the
  // one that never ends: a tab hidden mid-genie, or a stylesheet that lost it.
  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = window.setTimeout(() => setPhase(phase === "opening" ? "open" : "closed"), 700);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!shellStore.get().open || !(event.target instanceof Element)) return;
      // The arcade is a portal owned by this terminal. Its buttons are outside
      // the window in the DOM, but dismissing their owner would end every game.
      // The handle is excluded because closing on pointerdown and then toggling
      // on click would open it again. The nav closes it on click instead.
      if (event.target.closest(".shell, .term-dock, .nav, .arcade-room")) return;
      shellStore.dispatch({ type: "close" });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!shellStore.get().open) return;
        e.preventDefault();
        shellStore.dispatch({ type: "close" });
        focusHandle();
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!isShellHotkey(e.key, e, target)) return;
      e.preventDefault();
      summonShell();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    shellStore.dispatch({ type: "close" });
    focusHandle();
  };

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === "opening") setPhase("open");
    else if (phase === "closing") setPhase("closed");
  };

  const where = path === "/" ? "~" : `~${path}`;

  return (
    <>
      {phase !== "closed" && (
        <div
          id="shell-drawer"
          className={`shell${zoomed ? " is-zoomed" : ""}${phase === "opening" ? " is-opening" : ""}${phase === "closing" ? " is-closing" : ""}`}
          role="region"
          aria-label="Terminal"
          onAnimationEnd={onAnimationEnd}
          inert={phase === "closing" ? true : undefined}
        >
          <div className="shell__bar">
            <div className="shell__lights">
              <button type="button" className="shell__light shell__light--close" onClick={close} aria-label={copy.closeWindow} />
              <button type="button" className="shell__light shell__light--min" onClick={close} aria-label={copy.closeTerminal} />
              <button
                type="button"
                className="shell__light shell__light--zoom"
                onClick={() => setZoomed((z) => !z)}
                aria-label={zoomed ? copy.zoomOut : copy.zoomIn}
                aria-pressed={zoomed}
              />
            </div>
            {/* Costume, drawn from CSS for the reason in `components/PromptLine.tsx`. */}
            <span
              className="shell__title"
              aria-hidden="true"
              style={{ "--shell-title": JSON.stringify(`${profile.user}@${profile.host}: ${where}`) } as CSSProperties}
            />
          </div>
          <Terminal variant="drawer" autoFocus />
        </div>
      )}
      <div className="term-dock">
        {gravityOn && (
          <button type="button" className="dock-pill" onClick={() => setGravity(false)} title={copy.restorePage}>
            {copy.restore}
          </button>
        )}
        {ejected && (
          <button type="button" className="dock-pill" onClick={() => setEjected(false)} title={copy.viewPage}>
            {copy.dock}
          </button>
        )}
        <button
          type="button"
          className="term-handle"
          onClick={summonShell}
          aria-expanded={state.open}
          aria-controls={state.open ? "shell-drawer" : undefined}
          aria-label={state.open ? copy.closeTerminal : copy.openTerminal}
        >
          <span className="term-handle__label">{copy.terminal}</span>
        </button>
      </div>
    </>
  );
}
