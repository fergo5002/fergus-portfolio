import type { ReactNode } from "react";

/**
 * A phosphor-framed panel with a title bar and faux window controls.
 * Used to group content into "windows" within the terminal.
 */
export default function Window({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`window ${className}`.trim()}>
      <header className="window__bar">
        <span className="window__title">{title}</span>
        {/*
          Drawn by `.window__btns::before`, not written here. Four windows on
          the landing page put twelve tokens of pure decoration into the
          extractable text, and `aria-hidden` does nothing about that: it is an
          accessibility property and a text extractor has no reason to read it.
          The title beside it stays, because a title is a section label rather
          than costume. See `components/PromptLine.tsx` for the rule.
        */}
        <span className="window__btns" aria-hidden="true" />
      </header>
      <div className="window__body">{children}</div>
    </section>
  );
}
