import type { ReactNode } from "react";
import PhosphorScreen from "./system/PhosphorScreen";
import TermDock from "./TermDock";
import Nav from "./Nav";
import RouteTransition from "./system/RouteTransition";
import EjectRig from "./system/EjectRig";
import GravityStage from "./physics/GravityStage";

/**
 * The physical machine: the tube (WebGL phosphor), the glass sitting in front of
 * it (scanlines, vignette, specular sheen), and the channel-change transitions.
 *
 * Ordering matters. `PhosphorScreen` is behind everything at z-0, content sits at
 * z-1, and the glass layers ride above at z-9000 so they fall across the content
 * the way real glass would. Every overlay is aria-hidden and pointer-events:none.
 *
 * v5 adds `.crt__assembly` around everything the tube displays. It is inert while
 * docked (no transform, no containing block, no cost) and becomes the thing the
 * camera pulls back from when ejected. Grouping the glass layers inside it is
 * what lets the whole display shrink into the bezel as one object instead of
 * the content sliding out from under its own reflections.
 *
 * The terminal's dock (its handle, its window and the ways back from gravity
 * and eject) sits outside the assembly on purpose: it is the visitor's way out
 * of whatever the machine is doing, so it stays where they left it while the
 * display shrinks or falls apart.
 */
export default function CrtShell({ children }: { children: ReactNode }) {
  return (
    <div className="crt">
      <PhosphorScreen />
      <div className="crt__assembly">
        <div className="crt__screen">{children}</div>
        <Nav />
        <div className="crt__scanlines" aria-hidden="true" />
        <div className="crt__vignette" aria-hidden="true" />
        <div className="crt__glass" aria-hidden="true" />
        <div className="crt__flicker" aria-hidden="true" />
        <RouteTransition />
        <GravityStage />
      </div>
      <TermDock />
      <EjectRig />
    </div>
  );
}
