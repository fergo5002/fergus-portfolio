"use client";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { studioShellCopy } from "@/content/studio/copy";

const Atlas = lazy(() => import("./Atlas"));

/**
 * Atlas's host on `/tools/atlas`, in place of the shared `Studio` wrapper.
 *
 * It does what `Studio` does (the same `tool-studio` box with
 * `data-studio-host`, the instrument loaded in its own chunk once the page
 * has hydrated, so no control is ever on screen before its handler, and the
 * same `<noscript>` line) with one difference: until the instrument is
 * ready, the stage holds the server's picture of the example map
 * (`AtlasPoster`, passed in from the page) rather than a loading sentence.
 * The shared wrapper's loading slot takes no props, and changing it would
 * change all five studios, so Atlas has its own. The local lab still mounts
 * `Atlas` directly through `components/lab/Workbench.tsx`.
 */
export default function AtlasStudio({ poster }: { poster: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="tool-studio" data-studio-host>
      {ready ? (
        <Suspense fallback={poster}>
          <Atlas />
        </Suspense>
      ) : (
        poster
      )}
      <noscript>{studioShellCopy.noScript}</noscript>
    </div>
  );
}
