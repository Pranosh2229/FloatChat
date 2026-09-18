"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SHOW_AFTER_PX = 480;

/**
 * A floating "back to top" for the long-scroll pages (Home, Dashboard) — never rendered on
 * Explore, which is a fixed-viewport 3D scene with no page scroll of its own (and already has
 * its own bottom-left/right chrome that this would collide with). Mounted once in the root
 * layout, next to TopNav, rather than per-page.
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname === "/explore" || !visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="card rise fixed bottom-6 right-5 z-30 grid h-11 w-11 place-items-center rounded-full text-[16px] text-[var(--graphite-2)] transition-colors hover:text-[var(--graphite)] sm:right-8"
    >
      ↑
    </button>
  );
}
