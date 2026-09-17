"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOceanStore } from "@/stores/oceanStore";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/dashboard", label: "Dashboard" },
];

/**
 * The one piece of chrome shared by every page: a floating pill, centred, wordmark + three
 * links + one CTA — the layout nearly every awwwards reference used. Fixed so it floats over
 * the ocean on Explore and over the paper on Home/Dashboard alike.
 *
 * Logo + all three links + the CTA together are wider than a phone screen, so below `sm:` the
 * three links collapse behind a small menu toggle (logo and the CTA — the two things worth
 * always having one tap away — stay visible either way); `sm:` and up render exactly as before.
 */
export function TopNav() {
  const pathname = usePathname();
  const requestAskFocus = useOceanStore((s) => s.requestAskFocus);
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the mobile menu on navigation — including browser back/forward, which no Link's own
  // onClick sees. Adjusted during render (React's own pattern for "reset on prop change"), not
  // an effect: a render-time comparison, not a synchronous setState-in-effect render cascade.
  const [menuOpenedFor, setMenuOpenedFor] = useState(pathname);
  if (pathname !== menuOpenedFor) {
    setMenuOpenedFor(pathname);
    if (menuOpen) setMenuOpen(false);
  }

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
                    : "text-[var(--graphite-2)] hover:bg-[rgba(26,26,26,0.06)] hover:text-[var(--graphite)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Below sm: a compact toggle stands in for the three links. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={`grid h-8 w-8 place-items-center rounded-full text-[15px] transition-colors sm:hidden ${
            menuOpen ? "bg-[var(--graphite)] text-[var(--paper)]" : "text-[var(--graphite-2)] hover:bg-[rgba(26,26,26,0.06)]"
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
                    : "text-[var(--graphite-2)] hover:bg-[rgba(26,26,26,0.06)] hover:text-[var(--graphite)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
