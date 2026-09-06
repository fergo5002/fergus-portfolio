"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSystem } from "./SystemProvider";
import { markNavigated } from "@/lib/navigation";

/**
 * Changing route is changing channel.
 *
 * On every path change the tube loses lock for a moment: a burst of static, a
 * horizontal roll, and a degauss pulse through the shader. It also moves focus to
 * the main region, which is the bit that actually matters: client-side
 * navigation otherwise strands screen-reader and keyboard users at the top of a
 * document that has silently swapped underneath them.
 */
export default function RouteTransition() {
  const path = usePathname();
  const { degauss, reducedMotion } = useSystem();
  const [rolling, setRolling] = useState(false);
  const firstRender = useRef(true);
  const firstPath = useRef(path);

  // The first in-site navigation is what makes the next page one nobody has
  // seen, and `lib/navigation.ts` keys every load-time effect on that. A
  // layout effect rather than an effect so `html.navigated` is on the
  // document before the new page paints: a frame later and its reveal blocks
  // would paint visible, then hide, then paint in.
  useLayoutEffect(() => {
    if (path !== firstPath.current) markNavigated();
  }, [path]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    // Focus management runs regardless of motion preference.
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }

    if (reducedMotion) return;

    degauss();
    setRolling(true);
    const timer = window.setTimeout(() => setRolling(false), 520);
    return () => window.clearTimeout(timer);
  }, [path, degauss, reducedMotion]);

  if (!rolling) return null;
  return <div className="channel" aria-hidden="true" />;
}
