"use client";

import { useEffect, useSyncExternalStore } from "react";
import Terminal from "@/components/Terminal";
import { INITIAL_SHELL, isShellHotkey, shellStore } from "@/lib/shell";
import { machineCopy } from "@/content/machine";

const getServerShell = () => INITIAL_SHELL;

/** The same drawer handle on every route. */
export function summonShell(): void {
  shellStore.dispatch({ type: "toggle" });
}

/**
 * The terminal on every route, including the home page.
 *
 * Renders nothing while closed: the scrollback lives in `lib/history.ts`, so
 * unmounting loses nothing, and there is never a hidden input to trap focus.
 * `lib/shell.ts` owns its state; this supplies pointer and key input.
 * Mounted once, in `components/CrtShell.tsx`, beside the status
 * bar inside the assembly: it is chrome on the machine, so it shrinks with the
 * display when the camera pulls back and sits above the glass like the bar
 * it hangs from.
 */
export default function ShellDrawer() {
  const state = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!shellStore.get().open || !(event.target instanceof Element)) return;
      // The arcade is a portal owned by this drawer. Its buttons are outside
      // the drawer in the DOM, but dismissing their owner would end every game.
      // Exclude the handle: closing on pointerdown then toggling on click reopens.
      // Nav closes on click. Doing it here could scroll its newly active link
      // under the pointer before the visitor releases their finger.
      if (event.target.closest(".shell, .statusbar__prompt, .nav, .arcade-room")) return;
      shellStore.dispatch({ type: "close" });
      // Let the actual pointer target take focus. Keyboard dismissal below
      // restores the handle, but an outside link or field keeps its own focus.
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
        // Focus goes back to the control that represents the drawer on
        // every route, so a keyboard user is not dropped on the body.
        document.querySelector<HTMLElement>(".statusbar__prompt")?.focus();
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

  if (!state.open) return null;

  return (
    <div className="shell" id="shell-drawer" role="region" aria-label="Terminal">
      <div className="shell__bar">
        <span className="shell__title" aria-hidden="true">
          fsh
        </span>
        <button
          type="button"
          className="shell__close"
          onClick={() => {
            shellStore.dispatch({ type: "close" });
            document.querySelector<HTMLElement>(".statusbar__prompt")?.focus();
          }}
          aria-label={machineCopy.closeTerminal}
        >
          {machineCopy.close}
        </button>
      </div>
      <Terminal variant="drawer" autoFocus />
    </div>
  );
}
