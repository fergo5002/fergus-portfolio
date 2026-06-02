import type { ReactNode } from "react";
import GlyphField from "./GlyphField";

/**
 * Wraps the whole app in the CRT "screen": scanlines, vignette, curvature glow,
 * and a subtle flicker. All effects are CSS-only and are disabled under
 * `prefers-reduced-motion` (see globals.css). Overlays are aria-hidden.
 * The ambient glyph-rain canvas mounts here so it sits behind every page.
 */
export default function CrtShell({ children }: { children: ReactNode }) {
  return (
    <div className="crt">
      <GlyphField />
      <div className="crt__screen">{children}</div>
      <div className="crt__scanlines" aria-hidden="true" />
      <div className="crt__vignette" aria-hidden="true" />
      <div className="crt__flicker" aria-hidden="true" />
    </div>
  );
}
