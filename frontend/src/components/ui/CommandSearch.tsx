"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useOceanStore } from "@/stores/oceanStore";
import { regionCentroid } from "@/components/ocean/geo";

interface CommandSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ResultItem {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

const PAGES: { href: "/" | "/explore" | "/dashboard"; label: string; hint: string }[] = [
  { href: "/", label: "Home", hint: "page" },
  { href: "/explore", label: "Explore", hint: "page" },
  { href: "/dashboard", label: "Dashboard", hint: "page" },
];

/**
 * Global ⌘K search (TopNav.tsx) — every result is a real navigation, not a fabricated command
 * palette entry: the 3 pages, and any of the 11 real regions (which flies Explore's camera
 * there, the same non-cinematic direct jump the Dashboard's "Go there" button already uses).
 * Distinct from Explore's own quick-jump search (ExploreSearch.tsx), which also indexes real
 * floats/case files and is scoped to that page instead of being reachable everywhere.
 */
export function CommandSearch({ isOpen, onClose }: CommandSearchProps) {
  const router = useRouter();
  const regions = useOceanStore((s) => s.regions);
  const loadRegions = useOceanStore((s) => s.loadRegions);
  const setFlyToTarget = useOceanStore((s) => s.setFlyToTarget);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) loadRegions();
  }, [isOpen, loadRegions]);

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => {
        setQuery("");
        setActiveIndex(0);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();

    const pageItems: ResultItem[] = PAGES.map((p) => ({
      id: `page:${p.href}`,
      label: p.label,
      hint: p.hint,
      run: () => router.push(p.href),
    }));

    const regionItems: ResultItem[] = regions.map((r) => ({
      id: `region:${r.key}`,
      label: r.name,
      hint: "region — fly there",
      run: () => {
        setFlyToTarget({ ...regionCentroid(r), band: "region" });
        router.push("/explore");
      },
    }));

    const all = [...pageItems, ...regionItems];
    if (!q) return all;
    return all.filter((item) => item.label.toLowerCase().includes(q));
  }, [query, regions, router, setFlyToTarget]);

  const runAndClose = (item: ResultItem) => {
    item.run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) runAndClose(item);
    }
  };

  if (!isOpen) return null;

  // `pointer-events-auto` is load-bearing, not decorative: this renders inside TopNav's
  // `<header>`, which is `pointer-events-none` so the empty parts of the floating pill don't
  // block clicks on the page underneath. Without re-enabling it here, every click on this modal
  // (including the close button) silently passes straight through to whatever's behind it —
  // confirmed live on Explore, where clicking here was dropping a pin on the 3D world instead.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="pointer-events-auto fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="card rise w-full max-w-md overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <span aria-hidden className="text-[15px] text-[var(--graphite-3)]">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page or region…"
            className="w-full bg-transparent text-[14px] text-[var(--graphite)] placeholder:text-[var(--graphite-3)] focus:outline-none"
            aria-label="Search pages and regions"
          />
          <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--graphite-3)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5 [scrollbar-width:thin]">
          {results.length === 0 && (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--graphite-3)]">No matches.</p>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => runAndClose(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                i === activeIndex
                  ? "bg-[var(--cobalt-soft)] text-[var(--graphite)]"
                  : "text-[var(--graphite-2)] hover:bg-[var(--hover-tint)]"
              }`}
            >
              <span className="font-medium">{item.label}</span>
              <span className="font-mono text-[10px] text-[var(--graphite-3)]">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
