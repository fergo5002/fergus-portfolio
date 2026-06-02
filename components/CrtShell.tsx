import type { ReactNode } from "react";

/**
 * Wraps the whole app in the CRT "screen": scanlines, vignette, curvature glow,
 * and a subtle flicker. All effects are CSS-only and are disabled under
 * `prefers-reduced-motion` (see globals.css). Overlays are aria-hidden.
 */
export default function CrtShell({ children }: { children: ReactNode }) {
  return (
    <div className="crt">
      <div className="crt__screen">{children}</div>
      <div className="crt__scanlines" aria-hidden="true" />
      <div className="crt__vignette" aria-hidden="true" />
      <div className="crt__flicker" aria-hidden="true" />
    </div>
  );
}
