"use client";

import { getNavigatorControls } from "./worldCamera";

type PanKey = "arrowup" | "arrowdown" | "arrowleft" | "arrowright";

function PanButton({ dir, label, className }: { dir: PanKey; label: string; className?: string }) {
  const press = (pressed: boolean) => getNavigatorControls()?.pan(dir, pressed);
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-md text-[13px] text-[var(--graphite)] transition-colors hover:bg-[rgba(26,26,26,0.08)] active:bg-[var(--graphite)] active:text-[var(--paper)] ${className ?? ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerLeave={() => press(false)}
      onPointerCancel={() => press(false)}
    >
      {label}
    </button>
  );
}

/**
 * Mouse/touch equivalents of the keyboard navigation: a hold-to-pan D-pad, zoom in/out
 * (one altitude band per press), snap to the nearest float, and the whole-ocean view.
 */
export function WorldControls() {
  const ctl = () => getNavigatorControls();
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      <div className="card grid grid-cols-3 grid-rows-3 gap-0.5 p-1">
        <span />
        <PanButton dir="arrowup" label="↑" />
        <span />
        <PanButton dir="arrowleft" label="←" />
        <button
          type="button"
          aria-label="Whole ocean"
          title="Whole ocean"
          onClick={() => ctl()?.wholeOcean()}
          className="grid h-8 w-8 place-items-center rounded-md text-[13px] hover:bg-[rgba(26,26,26,0.08)]"
        >
          ◎
        </button>
        <PanButton dir="arrowright" label="→" />
        <span />
        <PanButton dir="arrowdown" label="↓" />
        <span />
      </div>
      <div className="card flex flex-col p-1">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (closer band)"
          onClick={() => ctl()?.zoom(-1)}
          className="grid h-8 w-8 place-items-center rounded-md text-[16px] hover:bg-[rgba(26,26,26,0.08)]"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (higher band)"
          onClick={() => ctl()?.zoom(1)}
          className="grid h-8 w-8 place-items-center rounded-md text-[16px] hover:bg-[rgba(26,26,26,0.08)]"
        >
          −
        </button>
      </div>
      <button
        type="button"
        onClick={() => ctl()?.nearestFloat()}
        title="Jump to the nearest float (F)"
        className="btn btn-ghost card !px-2.5 !py-1.5 !text-[11px]"
      >
        ⌖ nearest float
      </button>
    </div>
  );
}
