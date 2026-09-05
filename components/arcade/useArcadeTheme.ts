"use client";
import { useEffect, useState } from "react";
import { GREEN_PHOSPHOR, readArcadeTheme, type ArcadeTheme } from "@/lib/arcade/theme";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * The site's tokens, read off `<html>` for the canvas. Re-read after a theme
 * change, on a tick, because the attribute that swaps the theme is written by
 * a parent effect and child effects run first.
 */
export function useArcadeTheme(): ArcadeTheme {
  const { settings } = useSystem();
  const [theme, setTheme] = useState<ArcadeTheme>(GREEN_PHOSPHOR);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      setTheme(readArcadeTheme((name) => style.getPropertyValue(name)));
    };
    const timer = window.setTimeout(read, 0);
    return () => window.clearTimeout(timer);
  }, [settings.theme]);
  return theme;
}
