"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Terminal from "@/components/Terminal";
import { INITIAL_SHELL, isShellHotkey, shellStore } from "@/lib/shell";

const getServerShell = () => INITIAL_SHELL;

/**
 * Open the drawer, or, on the page that already hosts the terminal inline,
 * put the caret in it. The status bar's prompt and the backtick both come here.
 */
export function summonShell(): void {
  if (shellStore.get().inline) {
    const input = document.querySelector<HTMLInputElement>(".term__input");
    input?.scrollIntoView({ block: "center" });
    input?.focus();
    return;
  }
  shellStore.dispatch({ type: "toggle" });
}

/**
 * The terminal on every route that does not host it in the page.
 *
 * Renders nothing while closed: the scrollback lives in `lib/history.ts`, so
 * unmounting loses nothing, and there is never a hidden input to trap focus.
 * `lib/shell.ts` decides whether it may open; this only feeds it the route
 * and the keys. Mounted once, in `components/CrtShell.tsx`, beside the status
 * bar inside the assembly: it is chrome on the machine, so it shrinks with the
 * display when the camera pulls back and sits above the glass like the bar
 * it hangs from.
 */
export default function ShellDrawer() {
  const path = usePathname();
  const state = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);

  useEffect(() => {
    shellStore.dispatch({ type: "route", inline: path === "/" });
  }, [path]);

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
          aria-label="Close the terminal"
        >
          esc
        </button>
      </div>
      <Terminal variant="drawer" autoFocus />
    </div>
  );
}
