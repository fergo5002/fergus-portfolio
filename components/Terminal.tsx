"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { runCommand } from "@/lib/commands";
import { profile } from "@/content/profile";

type Entry = { cmd: string; lines: string[] };

const HINTS = ["help", "ls", "whoami", "cd projects", "sudo hire-me"];

const WELCOME: string[] = [
  "Interactive shell ready. Type a command, or tap a chip below.",
  "Try 'help' to see what's available.",
];

/**
 * A real (if playful) command line on the landing hero. Commands are parsed by
 * the pure runCommand(); navigate results push the router, output results print
 * to the scrollback. Fully keyboard-accessible; clickable hint chips serve
 * non-typists.
 */
export default function Terminal() {
  const [history, setHistory] = useState<Entry[]>([{ cmd: "", lines: WELCOME }]);
  const [value, setValue] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const run = (raw: string) => {
    const res = runCommand(raw);
    if (res.type === "navigate") {
      setHistory((h) => [...h, { cmd: raw, lines: [`→ ${res.href}`] }]);
      router.push(res.href);
      return;
    }
    if (res.type === "clear") {
      setHistory([]);
      return;
    }
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

  return (
    <div className="term" onClick={() => inputRef.current?.focus()}>
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
        <input
          id="term-input"
          ref={inputRef}
          className="term__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Terminal command input"
          placeholder="type 'help'..."
        />
      </form>

      <div className="term__hints" aria-label="Command shortcuts">
        {HINTS.map((h) => (
          <button key={h} type="button" className="term__hint" onClick={() => run(h)}>
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
