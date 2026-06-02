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
        <span className="window__btns" aria-hidden="true">
          [_] [□] [x]
        </span>
      </header>
      <div className="window__body">{children}</div>
    </section>
  );
}
