"use client";

import { useEffect, useRef, useState } from "react";

import { OceanWorld } from "@/components/ocean/OceanWorld";
import { FloatInfoPanel } from "@/components/ocean/FloatInfoPanel";
import { EvidencePanel } from "@/components/ocean/EvidencePanel";
import { ComparisonPanel } from "@/components/ocean/ComparisonPanel";
import { CaseFiles } from "@/components/ocean/CaseFiles";
import { Timeline } from "@/components/ocean/Timeline";
import { AskPanel } from "@/components/ocean/AskPanel";
import { WorldControls } from "@/components/ocean/WorldControls";
import { HUD } from "@/components/ocean/HUD";
import { FirstVisitHint } from "@/components/ocean/FirstVisitHint";
import { ExploreSearch } from "@/components/ocean/ExploreSearch";
import { useOceanStore } from "@/stores/oceanStore";

export default function ExplorePage() {
  const selection = useOceanStore((s) => s.selection);
  const floatDetail = useOceanStore((s) => s.floatDetail);
  const trajectory = useOceanStore((s) => s.trajectory);
  const latestProfile = useOceanStore((s) => s.latestProfile);
  const latestThermocline = useOceanStore((s) => s.latestThermocline);
  const selectedFloatId = useOceanStore((s) => s.selectedFloatId);
  const clearFloatSelection = useOceanStore((s) => s.clearFloatSelection);
  const loadRegions = useOceanStore((s) => s.loadRegions);
  const loadFloats = useOceanStore((s) => s.loadFloats);
  const floatsError = useOceanStore((s) => s.floatsError);
  const selectedEventId = useOceanStore((s) => s.selectedEventId);
  const eventDetail = useOceanStore((s) => s.eventDetail);
  const evidence = useOceanStore((s) => s.evidence);
  const clearEventSelection = useOceanStore((s) => s.clearEventSelection);
  const comparison = useOceanStore((s) => s.comparison);
  const clearComparison = useOceanStore((s) => s.clearComparison);
  const setRegionSelection = useOceanStore((s) => s.setRegionSelection);
  const discoveryEvents = useOceanStore((s) => s.discoveryEvents);
  const [casesOpen, setCasesOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  // The footer (Ask bar + Timeline) is a fixed anchor at the bottom, but its real height varies
  // — an answered question adds a card above the input, suggestion chips wrap to more rows on a
  // narrow phone — so the side panels' max-height can't be a single guessed constant without
  // either wasting space on desktop or overlapping the footer on mobile. Measured live instead:
  // a `--footer-h` custom property the panels' own `calc()` reads, always the real number.
  // Both a ResizeObserver (catches box-size changes generally) and a MutationObserver watching
  // the footer's own subtree (catches the answer card being added/removed specifically, which
  // is the one that matters most here) — belt and suspenders, since relying on either alone
  // missed real changes in testing.
  useEffect(() => {
    const footer = footerRef.current;
    const root = rootRef.current;
    if (!footer || !root) return;
    const sync = () => root.style.setProperty("--footer-h", `${footer.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(footer);
    const mo = new MutationObserver(sync);
    mo.observe(footer, { childList: true, subtree: true, attributes: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    loadRegions();
    // Also loaded here, not just by FloatLayer's own effect — reduced-motion/no-WebGL visitors
    // never mount FloatLayer (see OceanWorld.tsx), but the Ask bar/case files still need real
    // float data, and a connectivity failure should surface even for them.
    loadFloats();
  }, [loadRegions, loadFloats]);

  // Guard on ID match at render rather than trusting stale state — a float/event can be
  // deselected (or a different one selected) before its detail fetch resolves.
  const activeFloatDetail = floatDetail?.id === selectedFloatId ? floatDetail : null;
  const activeTrajectory = trajectory?.float_id === selectedFloatId ? trajectory : null;
  const activeProfile = latestProfile?.float_id === selectedFloatId ? latestProfile : null;
  const activeEvidence =
    eventDetail?.id === selectedEventId && evidence?.event_id === selectedEventId
      ? { event: eventDetail, evidence }
      : null;

  const focusPanel = activeFloatDetail ? (
    <FloatInfoPanel
      float={activeFloatDetail}
      trajectory={activeTrajectory}
      latestProfile={activeProfile}
      latestThermocline={activeProfile ? latestThermocline : null}
      onClose={clearFloatSelection}
    />
  ) : activeEvidence ? (
    <EvidencePanel event={activeEvidence.event} evidence={activeEvidence.evidence} onClose={clearEventSelection} />
  ) : comparison ? (
    <ComparisonPanel regionA={comparison.region_a} regionB={comparison.region_b} onClose={clearComparison} />
  ) : selection ? (
    <div className="card rise pointer-events-auto w-72 px-4 py-3">
      <div className="flex items-start justify-between">
        <p className="eyebrow">Pin dropped</p>
        <button onClick={() => setRegionSelection(null)} className="btn btn-ghost !px-2 !py-1 !text-[11px]">
          ✕
        </button>
      </div>
      <p className="mt-1 font-mono text-[13px]">
        {selection.lat.toFixed(2)}°, {selection.lon.toFixed(2)}°
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--graphite-2)]">
        Open water — no float exactly here. Try asking &ldquo;what&apos;s the surface like here?&rdquo; below, or press F
        to jump to the nearest float.
      </p>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative h-dvh w-full">
      <OceanWorld />
      <FirstVisitHint />

      {floatsError && (
        <div className="card pointer-events-auto absolute left-1/2 top-20 z-10 -translate-x-1/2 px-4 py-2 text-xs text-[var(--coral)]">
          Can&apos;t reach the FloatChat backend ({floatsError}). Is it running at{" "}
          {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}?{" "}
          <button onClick={loadFloats} className="underline">
            Retry
          </button>
        </div>
      )}

      {/* Left rail: the case files drawer (toggleable) with altitude readout underneath. On a
          narrow screen it and the right rail would both be near-full-width and overlap, so the
          case files rail stands down (still mounted, just visually hidden) whenever something
          is in focus on the right — from `sm:` up there's room for both, unchanged from before. */}
      <aside
        className={`pointer-events-none absolute left-5 top-20 z-10 flex-col gap-3 sm:left-8 sm:flex ${
          focusPanel ? "hidden" : "flex"
        }`}
      >
        {casesOpen ? (
          <CaseFiles onClose={() => setCasesOpen(false)} />
        ) : (
          <button onClick={() => setCasesOpen(true)} className="btn card pointer-events-auto w-fit !text-[12px]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--coral)]" />
            Open cases{discoveryEvents.length ? ` (${discoveryEvents.length})` : ""}
          </button>
        )}
      </aside>

      {/* Right rail: the quick-jump search (always available) above whichever one thing is in
          focus. */}
      <aside className="pointer-events-none absolute right-5 top-20 z-10 flex flex-col items-end gap-3 sm:right-8">
        <ExploreSearch />
        {focusPanel}
      </aside>

      {/* Bottom-left: map controls + the toggleable HUD (off by default). Wraps rather than
          running off the right edge if the HUD is opened on a narrow phone. */}
      <div className="pointer-events-none absolute bottom-6 left-5 z-10 flex max-w-[calc(100vw-2.5rem)] flex-wrap items-end gap-3 sm:left-8">
        <WorldControls />
        <HUD />
      </div>

      <footer
        ref={footerRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-5 sm:p-8"
      >
        <AskPanel />
        <Timeline />
        {/* Two wordings, not one hidden by breakpoint alone — "arrows"/"scroll"/"F" describe
            input a touch device doesn't have, so phones get their own real gesture list rather
            than silently dropping the hint. */}
        <p className="hidden text-center font-mono text-[10px] tracking-[0.12em] text-[var(--graphite-2)] uppercase sm:block">
          arrows / drag to roam · scroll or +/− for altitude · F nearest float · click a float
        </p>
        <p className="block text-center font-mono text-[10px] tracking-[0.12em] text-[var(--graphite-2)] uppercase sm:hidden">
          drag to roam · pinch or +/− for altitude · tap a float
        </p>
      </footer>
    </div>
  );
}
