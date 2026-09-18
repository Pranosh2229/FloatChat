"use client";

import { useEffect, useRef } from "react";

import { useOceanStore } from "@/stores/oceanStore";

const STORAGE_KEY = "floatchat.theme";

/**
 * The one place that touches `localStorage`/the DOM for theme: reads the saved preference once
 * on mount (deferred a tick, same pattern as FirstVisitHint's seen-before check — the lint
 * forbids a synchronous setState inside the effect body) and keeps `<html data-theme>` and
 * localStorage in sync with the store afterward. Mounted once, in TopNav, since that's already
 * on every page; nothing else needs to touch either localStorage or the attribute directly.
 *
 * `restored` guards the persist effect below from writing before the restore effect above has
 * had a chance to read: both effects fire on mount, and without this guard the persist effect
 * would synchronously overwrite the saved "dark" preference with the default "light" state
 * *before* the deferred restore ever applies it — permanently losing the saved preference on
 * every reload (confirmed live: toggling dark mode worked, but it silently reverted to light on
 * the next page navigation because of exactly this race).
 */
export function ThemeInit() {
  const theme = useOceanStore((s) => s.theme);
  const setTheme = useOceanStore((s) => s.setTheme);
  const restored = useRef(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — stay on the "light" default */
    }
    const t = window.setTimeout(() => {
      if (saved === "dark") setTheme("dark");
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [setTheme]);

  useEffect(() => {
    if (!restored.current) return;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore — the toggle still works for the rest of this session */
    }
  }, [theme]);

  return null;
}
