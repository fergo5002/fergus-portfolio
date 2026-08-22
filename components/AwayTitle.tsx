"use client";

import { useEffect } from "react";
import { watchAway } from "@/lib/away";

/**
 * Renames the tab while the visitor is somewhere else. All of the behaviour and
 * all of the reasoning live in `lib/away.ts`, where a test can drive it; this is
 * only the mount point.
 *
 * Renders `null`, and the effect runs after hydration, so nothing here reaches
 * the server HTML. That is the point: the real title is what a crawler and a
 * search result see, always.
 */
export default function AwayTitle() {
  useEffect(() => watchAway(document, window), []);
  return null;
}
