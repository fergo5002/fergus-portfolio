"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { complete, runCommand } from "@/lib/commands";
import type { SystemEffect } from "@/lib/commands";
import { historyStore, initialHistory } from "@/lib/history";
import { listKeys, removeKeys } from "@/lib/forget";
import { localPresence } from "@/lib/presence";
import { profile } from "@/content/profile";
import Magnetic from "@/components/motion/Magnetic";
import { useSystem } from "@/components/system/SystemProvider";

const HINTS = ["gravity", "eject", "sound on", "neofetch", "sudo hire-me"];

/**
 * The server never dispatches, so its snapshot is the welcome line, built once
 * and handed back by reference: `useSyncExternalStore` requires a stable
 * server snapshot.
 */
const SERVER_HISTORY = initialHistory();
const getServerHistory = () => SERVER_HISTORY;

/** Never throws: a browser that refuses storage reads as an empty store. */
function readStorageKeys(): string[] {
  try {
    return listKeys(window.localStorage);
  } catch {
    return [];
  }
}

type Props = {
  /** `inline` on the home page, `drawer` everywhere else. Only the class differs. */
  variant?: "inline" | "drawer";
  /** Put the caret in the input on mount. The drawer wants this; the page does not. */
  autoFocus?: boolean;
};

/**
 * A real (if playful) command line, and the only place in the app allowed to
 * apply a `SystemEffect` or act on a `program` result. Commands like `theme`
 * and `crt` genuinely rewrite the running site: the parser decides what should
 * happen, this decides how.
 *
 * Its memory is not its own. `lib/history.ts` holds the scrollback and the
 * recall list at module level, so the inline terminal on the home page and the
 * drawer on every other route are one shell with one history.
 */
export default function Terminal({ variant = "inline", autoFocus = false }: Props) {
  const { entries, commands } = useSyncExternalStore(historyStore.subscribe, historyStore.get, getServerHistory);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [wiping, setWiping] = useState(false);
  const [presence, setPresence] = useState<number | undefined>(undefined);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Two terminals never mount at once today, but ids are document-global and a
  // duplicate would break every label and describedby on the second one.
  const uid = useId();
  const inputId = `term-input-${uid}`;
  const helpId = `term-help-${uid}`;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    let live = true;
    void localPresence.count().then((n) => {
      if (live) setPresence(n);
    });
    return () => {
      live = false;
    };
  }, []);

  const {
    frame,
    settings,
    setTheme,
    setCrtEnabled,
    setScanlines,
    setAudioEnabled,
    setGravity,
    setEjected,
    degauss,
    burstRain,
    audio,
    reducedMotion,
  } = useSystem();

  /** Applies an effect and returns any lines the application itself has to add. */
  const applyEffect = (effect: SystemEffect): string[] => {
    const extra: string[] = [];
    switch (effect.kind) {
      case "theme":
        setTheme(effect.theme);
        degauss();
        break;
      case "crt":
        setCrtEnabled(effect.on);
        break;
      case "scanlines":
        setScanlines(effect.value);
        break;
      case "matrix":
        burstRain(effect.ms);
        break;
      case "degauss":
        degauss();
        break;
      case "gravity":
        setGravity(effect.on);
        break;
      case "eject":
        setEjected(effect.on);
        break;
      case "sound":
        setAudioEnabled(effect.on);
        break;
      case "forget":
        // Ownership is re-checked inside removeKeys, so a descriptor cannot
        // reach a key the site does not own however it was built.
        try {
          removeKeys(window.localStorage, effect.keys);
        } catch {
          extra.push("storage refused the change. nothing was removed.");
        }
        break;
      case "reboot":
        degauss();
        setWiping(true);
        // Forget that this session already booted, so the machine genuinely
        // comes back up with the full POST rather than snapping to the page.
        try {
          sessionStorage.removeItem("fergusos_booted");
        } catch {
          /* private mode: the reload is still the point */
        }
        window.setTimeout(() => window.location.reload(), 1600);
        break;
    }
    return extra;
  };

  const run = (raw: string) => {
    historyStore.dispatch({ type: "typed", cmd: raw });
    setCursor(null);

    const res = runCommand(raw, {
      history: commands,
      uptimeMs: frame.current.uptimeMs,
      theme: settings.theme,
      reducedMotion,
      storageKeys: readStorageKeys(),
      presence,
    });

    if (res.type === "navigate") {
      historyStore.dispatch({ type: "print", cmd: raw, lines: [`-> ${res.href}`] });
      router.push(res.href);
      return;
    }
    if (res.type === "clear") {
      historyStore.dispatch({ type: "clear" });
      return;
    }
    if (res.type === "program") {
      // G0 replaces this with the arcade runtime. Until then the door opens
      // onto a note and the prompt comes straight back.
      historyStore.dispatch({ type: "print", cmd: raw, lines: [res.program.title, "no runtime yet"] });
      return;
    }
    const extra = res.type === "effect" ? applyEffect(res.effect) : [];
    historyStore.dispatch({ type: "print", cmd: raw, lines: [...res.lines, ...extra] });
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    run(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // One click per key that actually does something. Modifiers on their own are
    // silent, because a real keyboard's shift key does not click either.
    if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Tab") {
      audio.key();
    }

    // Escape always releases the field, whatever else is going on. In the
    // drawer, the same keydown reaches the window and closes it.
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }

    if (e.key === "Tab") {
      // Never swallow Shift+Tab, and only swallow forward Tab when there is
      // genuinely something left to complete. Otherwise this input becomes a
      // keyboard trap: focus could never move past the terminal in either
      // direction, which strands keyboard users before the rest of the page
      // (WCAG 2.1.2). Pressing Tab once completes; pressing it again moves on.
      if (e.shiftKey) return;
      const completed = complete(value);
      if (!completed || completed === value) return;
      e.preventDefault();
      setValue(completed);
      return;
    }

    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      historyStore.dispatch({ type: "clear" });
      return;
    }

    if (e.key === "ArrowUp") {
      if (commands.length === 0) return;
      e.preventDefault();
      const next = cursor === null ? commands.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setValue(commands[next]);
      return;
    }

    if (e.key === "ArrowDown") {
      if (cursor === null) return;
      e.preventDefault();
      const next = cursor + 1;
      if (next >= commands.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(next);
        setValue(commands[next]);
      }
    }
  };

  // Inline ghost text showing what Tab would complete to.
  const ghost = useMemo(() => {
    if (!value.trim()) return "";
    const completed = complete(value);
    if (!completed || completed === value || !completed.startsWith(value)) return "";
    return completed.slice(value.length);
  }, [value]);

  return (
    <div
      className={`term term--${variant}${wiping ? " is-wiping" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="term__scroll" ref={scrollRef}>
        {entries.map((entry, i) => (
          <div key={i} className="term__entry">
            {entry.cmd !== "" && (
              <p className="promptline">
                <span className="promptline__user">
                  {profile.user}@{profile.host}
                </span>
                <span className="promptline__sep" />
                <span className="promptline__path">~</span>
                <span className="promptline__dollar" />
                <span className="promptline__cmd">{entry.cmd}</span>
              </p>
            )}
            {entry.lines.map((line, j) => (
              <p key={j} className="term__out">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      <form className="term__form" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="term__label">
          <span className="promptline__user">
            {profile.user}@{profile.host}
          </span>
          <span className="promptline__sep" />
          <span className="promptline__path">~</span>
          <span className="promptline__dollar" />
        </label>
        <span className="term__field">
          {/* The typed half is rendered transparent purely to position the
              suggestion; the input itself stays the single source of truth. */}
          <span className="term__ghost" aria-hidden="true">
            <span className="term__ghost-typed">{value}</span>
            <span className="term__ghost-rest">{ghost}</span>
          </span>
          <input
            id={inputId}
            ref={inputRef}
            className="term__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Terminal command input"
            aria-describedby={helpId}
            placeholder="type 'help'..."
          />
        </span>
      </form>

      <p id={helpId} className="term__srhint">
        Press Tab to complete a command, Up and Down arrows to recall previous commands, and
        Control plus L to clear the screen.
      </p>

      <div className="term__hints" aria-label="Command shortcuts">
        {HINTS.map((h) => (
          <Magnetic key={h} pull={0.3}>
            <button type="button" className="term__hint" onClick={() => run(h)}>
              {h}
            </button>
          </Magnetic>
        ))}
      </div>
    </div>
  );
}
