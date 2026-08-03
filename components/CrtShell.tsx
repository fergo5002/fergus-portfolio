import type { ReactNode } from "react";
import PhosphorScreen from "./system/PhosphorScreen";
import CursorTrail from "./system/CursorTrail";
import StatusBar from "./system/StatusBar";
import Screensaver from "./system/Screensaver";
import RouteTransition from "./system/RouteTransition";

/**
 * The physical machine: the tube (WebGL phosphor), the glass sitting in front of
 * it (scanlines, vignette, specular sheen), and the chrome bolted around it
 * (status bar, screensaver, channel-change transitions).
 *
 * Ordering matters. `PhosphorScreen` is behind everything at z-0, content sits at
 * z-1, and the glass layers ride above at z-9000 so they fall across the content
 * the way real glass would. Every overlay is aria-hidden and pointer-events:none.
 */
export default function CrtShell({ children }: { children: ReactNode }) {
  return (
    <div className="crt">
      <PhosphorScreen />
      <div className="crt__screen">{children}</div>
      <CursorTrail />
      <div className="crt__scanlines" aria-hidden="true" />
      <div className="crt__vignette" aria-hidden="true" />
      <div className="crt__glass" aria-hidden="true" />
      <div className="crt__flicker" aria-hidden="true" />
      <RouteTransition />
      <Screensaver />
      <StatusBar />
    </div>
  );
}
