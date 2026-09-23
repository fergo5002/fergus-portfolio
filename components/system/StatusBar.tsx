"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { shortPwd } from "@/lib/system";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { summonShell } from "@/components/ShellDrawer";
import { machineCopy as copy } from "@/content/machine";
import MachineControls from "./MachineControls";

const getServerShell = () => INITIAL_SHELL;

/** The machine's controls, with its current location kept quietly to the left. */
export default function StatusBar() {
  const path = usePathname();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
  const pwd = path === "/" ? "~" : `~${path}`;
  const short = shortPwd(path);

  return (
    <div className="statusbar" role="region" aria-label={copy.controls}>
      <span className="statusbar__readouts" aria-hidden="true">
        <span className="statusbar__seg statusbar__brand">FergusOS</span>
        <span className="statusbar__seg statusbar__pwd" title={pwd}>
          <span className="statusbar__pwd-full">{pwd}</span>
          <span className="statusbar__pwd-short">{short}</span>
        </span>
      </span>
      <MachineControls />
      <button
        type="button"
        className="statusbar__prompt"
        onClick={summonShell}
        aria-expanded={shell.open}
        aria-controls={shell.open ? "shell-drawer" : undefined}
        title={shell.open ? copy.closeTerminal : copy.openTerminal}
      >
        {/* The dollar is drawn by CSS. Decorative text stays out of server HTML. */}
        <span className="statusbar__prompt-label">{copy.terminal}</span>
      </button>
    </div>
  );
}
