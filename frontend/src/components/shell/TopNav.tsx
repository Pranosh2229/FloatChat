"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOceanStore } from "@/stores/oceanStore";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal";
import { CommandSearch } from "@/components/ui/CommandSearch";
import { ThemeInit } from "@/components/shell/ThemeInit";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/dashboard", label: "Dashboard" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * The one piece of chrome shared by every page: a floating pill, centred, wordmark + three
 * links + one CTA — the layout nearly every awwwards reference used. Fixed so it floats over
 * the ocean on Explore and over the paper on Home/Dashboard alike.
 *
 * Logo + all three links + the CTA together are wider than a phone screen, so below `sm:` the
 * three links collapse behind a small menu toggle (logo and the CTA — the two things worth
 * always having one tap away — stay visible either way); `sm:` and up render exactly as before.
 *
 * Also owns the global chrome that isn't a route: dark mode + shortcuts help (top-right, before
 * the primary CTA) and the ⌘K command search (ThemeInit and CommandSearch render here since this
 * is the one component already mounted on every page).
 */
export function TopNav() {
  const pathname = usePathname();
  const requestAskFocus = useOceanStore((s) => s.requestAskFocus);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Close the mobile menu on navigation — including browser back/forward, which no Link's own
  // onClick sees. Adjusted during render (React's own pattern for "reset on prop change"), not
  // an effect: a render-time comparison, not a synchronous setState-in-effect render cascade.
  const [menuOpenedFor, setMenuOpenedFor] = useState(pathname);
  if (pathname !== menuOpenedFor) {
    setMenuOpenedFor(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  // Global shortcuts: ⌘/Ctrl+K for search, "?" for the shortcuts list — everywhere except while
  // actually typing somewhere else.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-40 flex flex-col items-center px-4">
      <nav className="card pointer-events-auto flex items-center gap-1 rounded-full py-1.5 pl-4 pr-1.5">
        <Link
          href="/"
          className="mr-3 font-display text-[19px] leading-none tracking-tight text-[var(--graphite)]"
        >
          Float<span className="italic text-[var(--cobalt)]">chat</span>
        </Link>

        {/* sm: and up — unchanged from before. */}
        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--graphite)] text-[var(--paper)]"
                    : "text-[var(--graphite-2)] hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Search + dark mode + shortcuts — always visible, before the mobile menu toggle and
            the primary CTA. The "?" reads slightly larger than the other icon buttons since it's
            a standalone glyph rather than a drawn icon. */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search (⌘K)"
          title="Search (⌘K)"
          className="ml-1 grid h-8 w-8 place-items-center rounded-full text-[14px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
        >
          ⌕
        </button>
        <DarkModeToggle />
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="grid h-9 w-9 place-items-center rounded-full font-mono text-[17px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
        >
          ?
        </button>

        {/* Below sm: a compact toggle stands in for the three links. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={`grid h-8 w-8 place-items-center rounded-full text-[15px] transition-colors sm:hidden ${
            menuOpen ? "bg-[var(--graphite)] text-[var(--paper)]" : "text-[var(--graphite-2)] hover:bg-[var(--hover-tint)]"
          }`}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <Link href="/explore" onClick={requestAskFocus} className="btn btn-primary ml-2 !py-2 !text-[12px]">
          <span className="hidden sm:inline">Ask the ocean</span>
          <span className="sm:hidden">Ask</span>
          <span aria-hidden>→</span>
        </Link>
      </nav>

      {menuOpen && (
        <div className="card rise pointer-events-auto mt-2 flex w-44 flex-col gap-0.5 p-1.5 sm:hidden">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-full px-3 py-2 text-center text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--graphite)] text-[var(--paper)]"
                    : "text-[var(--graphite-2)] hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}

      <ThemeInit />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
