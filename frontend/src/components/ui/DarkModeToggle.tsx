"use client";

import { useOceanStore } from "@/stores/oceanStore";

/** Simple line-art sun/moon, drawn in the same graphite-ink style as every other icon in the
 * app (HUD's compass, WorldControls' pan arrows) rather than an emoji or an icon-font glyph. */
function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M10 1.5v2.2M10 16.3v2.2M18.5 10h-2.2M3.7 10H1.5" />
        <path d="M15.6 4.4l-1.55 1.55M5.95 14.05L4.4 15.6M15.6 15.6l-1.55-1.55M5.95 5.95L4.4 4.4" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M17 11.5A7.5 7.5 0 0 1 8.5 3a7.5 7.5 0 1 0 8.5 8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Dark mode toggle — top-right of the nav (TopNav.tsx). A real preference, not a
 * `prefers-color-scheme` branch: persisted by `ThemeInit`, read everywhere (including the 3D
 * Explore scene, via `worldTheme.ts`) off the same `oceanStore.theme` value.
 */
export function DarkModeToggle() {
  const theme = useOceanStore((s) => s.theme);
  const toggleTheme = useOceanStore((s) => s.toggleTheme);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      title={dark ? "Light mode" : "Dark mode"}
      className="grid h-8 w-8 place-items-center rounded-full text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
