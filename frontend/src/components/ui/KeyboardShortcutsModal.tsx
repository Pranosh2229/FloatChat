"use client";

import { useEffect } from "react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GLOBAL_SHORTCUTS: [string, string][] = [
  ["⌘ / Ctrl + K", "Open search"],
  ["?", "Show this shortcuts list"],
  ["Esc", "Close a panel, modal, or search"],
];

const EXPLORE_SHORTCUTS: [string, string][] = [
  ["Arrow keys / drag", "Pan the ocean world"],
  ["Scroll / pinch / +  −", "Change altitude band"],
  ["F", "Jump to the nearest float"],
  ["Click / tap a float", "Inspect it"],
];

/** A real reference list — only shortcuts that actually exist elsewhere in the app (WorldNavigator.tsx,
 * CommandSearch.tsx), not a placeholder table. Opened by the `?` nav button or the `?` key itself. */
export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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
      aria-labelledby="shortcuts-title"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 id="shortcuts-title" className="font-display text-[22px] leading-tight">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost !px-2 !py-1 !text-[12px]"
          >
            ✕
          </button>
        </div>

        <p className="eyebrow mt-4">Everywhere</p>
        <dl className="mt-2 space-y-1.5">
          {GLOBAL_SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-[13px]">
              <dt className="text-[var(--graphite-2)]">{label}</dt>
              <dd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--graphite)]">
                {key}
              </dd>
            </div>
          ))}
        </dl>

        <p className="eyebrow mt-4">On Explore</p>
        <dl className="mt-2 space-y-1.5">
          {EXPLORE_SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-[13px]">
              <dt className="text-[var(--graphite-2)]">{label}</dt>
              <dd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--graphite)]">
                {key}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
