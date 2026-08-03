"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { complete, runCommand } from "@/lib/commands";
import type { SystemEffect } from "@/lib/commands";
import { profile } from "@/content/profile";
import Magnetic from "@/components/motion/Magnetic";
import { useSystem } from "@/components/system/SystemProvider";

type Entry = { cmd: string; lines: string[] };

const HINTS = ["help", "neofetch", "theme amber", "matrix", "sudo hire-me"];

const WELCOME: string[] = [
  "FergusOS 4.0 'Phosphor' — interactive shell ready.",
  "tab completes · up/down recalls · try 'help' or 'neofetch'.",
];

/**
 * A real (if playful) command line, and the only place in the app allowed to
 * apply a `SystemEffect`. Commands like `theme` and `crt` genuinely rewrite the
 * running site — the parser decides what should happen, this decides how.
 */
export default function Terminal() {
  const [history, setHistory] = useState<Entry[]>([{ cmd: "", lines: WELCOME }]);
  const [value, setValue] = useState("");
  const [commands, setCommands] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [wiping, setWiping] = useState(false);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { frame, settings, setTheme, setCrtEnabled, setScanlines, degauss, burstRain } = useSystem();

  const applyEffect = (effect: SystemEffect) => {
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
      case "reboot":
        degauss();
        setWiping(true);
        // Forget that this session already booted, so the machine genuinely
        // comes back up with the full POST rather than snapping to the page.
        try {
          sessionStorage.removeItem("fergusos_booted");
        } catch {
          /* private mode — the reload is still the point */
        }
        window.setTimeout(() => window.location.reload(), 1600);
        break;
    }
  };

  const run = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed) setCommands((c) => [...c, trimmed]);
    setCursor(null);

    const res = runCommand(raw, {
      history: commands,
      uptimeMs: frame.current.uptimeMs,
      theme: settings.theme,
    });

    if (res.type === "navigate") {
      setHistory((h) => [...h, { cmd: raw, lines: [`-> ${res.href}`] }]);
      router.push(res.href);
      return;
    }
    if (res.type === "clear") {
      setHistory([]);
      return;
    }
    if (res.type === "effect") applyEffect(res.effect);

    setHistory((h) => [...h, { cmd: raw, lines: res.lines }]);
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
    if (e.key === "Tab") {
      e.preventDefault();
      const completed = complete(value);
      if (completed && completed !== value) setValue(completed);
      return;
    }

    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setHistory([]);
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
    <div className={`term${wiping ? " is-wiping" : ""}`} onClick={() => inputRef.current?.focus()}>
      <div className="term__scroll" ref={scrollRef}>
        {history.map((entry, i) => (
          <div key={i} className="term__entry">
            {entry.cmd !== "" && (
              <p className="promptline">
                <span className="promptline__user">
                  {profile.user}@{profile.host}
                </span>
                <span className="promptline__sep">:</span>
                <span className="promptline__path">~</span>
                <span className="promptline__dollar">$</span>
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
        <label htmlFor="term-input" className="term__label">
          <span className="promptline__user">
            {profile.user}@{profile.host}
          </span>
          <span className="promptline__sep">:</span>
          <span className="promptline__path">~</span>
          <span className="promptline__dollar">$</span>
        </label>
        <span className="term__field">
          {/* The typed half is rendered transparent purely to position the
              suggestion; the input itself stays the single source of truth. */}
          <span className="term__ghost" aria-hidden="true">
            <span className="term__ghost-typed">{value}</span>
            <span className="term__ghost-rest">{ghost}</span>
          </span>
          <input
            id="term-input"
            ref={inputRef}
            className="term__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Terminal command input"
            aria-describedby="term-help"
            placeholder="type 'help'..."
          />
        </span>
      </form>

      <p id="term-help" className="term__srhint">
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
