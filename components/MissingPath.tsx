"use client";

import { useEffect, useState } from "react";

/**
 * The path the visitor asked for, printed as a failed `cd`. The not-found page
 * is rendered once for every missing URL, so the path is only known in the
 * browser; the server renders nothing here, and the line appears after mount.
 */
export default function MissingPath({ suffix }: { suffix: string }) {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    const raw = window.location.pathname;
    // A malformed escape (a mistyped link can hold one) makes decoding throw;
    // the raw path is still worth showing.
    try {
      setPath(decodeURIComponent(raw));
    } catch {
      setPath(raw);
    }
  }, []);
  if (!path) return null;
  return (
    <p className="nosignal__missing">
      cd {path}: {suffix}
    </p>
  );
}
