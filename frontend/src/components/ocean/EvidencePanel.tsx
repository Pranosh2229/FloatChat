"use client";

import type { EventSummary, EvidenceOut } from "@/lib/api";
import { BASELINE_WHAT, EVENT_EXPLAINERS, HONESTY_LINE } from "@/lib/explainers";
import { useOceanStore } from "@/stores/oceanStore";
import { CorkboardEvidence, type CorkNode } from "./CorkboardEvidence";

interface EvidencePanelProps {
  event: EventSummary;
  evidence: EvidenceOut;
  onClose: () => void;
}

/** Observed vs expected as two short bars sharing a scale — the anomaly is the visible gap. */
function AnomalyBars({
  label,
  unit,
  observed,
  expected,
}: {
  label: string;
  unit: string;
  observed: number;
  expected: number;
}) {
  const max = Math.max(Math.abs(observed), Math.abs(expected), 0.01);
  const w = (v: number) => `${Math.max(3, (Math.abs(v) / max) * 100)}%`;
  const delta = observed - expected;
  return (
    <div className="text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        <span className={`font-mono ${delta >= 0 ? "text-[var(--coral)]" : "text-[var(--cobalt)]"}`}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)}
          {unit} {delta >= 0 ? "warmer / higher" : "cooler / lower"} than normal
        </span>
      </div>
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[var(--graphite-3)]">measured</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
            <span className="block h-full rounded-full bg-[var(--coral)]" style={{ width: w(observed) }} />
          </span>
          <span className="w-12 text-right font-mono text-[10px]">{observed.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-[var(--graphite-3)]">normal</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
            <span className="block h-full rounded-full bg-[var(--graphite-2)]" style={{ width: w(expected) }} />
          </span>
          <span className="w-12 text-right font-mono text-[10px]">{expected.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The case file: what was found, what it means, why it matters, what probably caused it, and
 * the trail of real data behind it. Every number comes straight from a real persisted
 * `Event`/`Evidence` row; the explanations are general oceanography (lib/explainers.ts) and are
 * honest about the difference between a measured pattern and a proven cause.
 */
export function EvidencePanel({ event, evidence, onClose }: EvidencePanelProps) {
  const regions = useOceanStore((s) => s.regions);
  const region = regions.find((r) => r.key === event.region)?.name ?? event.region;
  const ex = EVENT_EXPLAINERS[event.type];
  const days = Math.max(
    1,
    Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 86400000),
  );
  const temp = evidence.calculation.temperature;
  const sal = evidence.calculation.salinity;

  const corkNodes: CorkNode[] = [
    {
      id: "conclusion",
      label: "the case",
      value: `#${event.id}`,
      caption: (ex?.title ?? event.type).toLowerCase(),
    },
    {
      id: "floats",
      label: "witnesses",
      value: String(evidence.float_ids.length),
      caption: `real float${evidence.float_ids.length === 1 ? "" : "s"}`,
    },
    {
      id: "profiles",
      label: "dives",
      value: String(evidence.profile_ids.length),
      caption: "real profiles",
    },
    {
      id: "readings",
      label: "vs. " + evidence.baseline_id,
      value: String(evidence.observation_ids.length),
      caption: "flagged readings",
    },
  ];

  return (
    <div className="card rise pointer-events-auto w-[calc(100vw-2.5rem)] max-h-[calc(100dvh-var(--footer-h,21.25rem)-6.5rem)] overflow-y-auto p-5 [scrollbar-width:thin] sm:w-[26rem]">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Case file #{event.id} · {region}</p>
          <p className="font-display text-[28px] leading-none">{ex?.title ?? event.type}</p>
          <p className="mt-1 text-[12px] text-[var(--graphite-3)]">
            {event.depth_min.toFixed(0)}–{event.depth_max.toFixed(0)} m down · {days} day{days === 1 ? "" : "s"} ·{" "}
            {new Date(event.start_time).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close case file" className="btn btn-ghost !px-2 !py-1 !text-[11px]">
          ✕
        </button>
      </div>

      {ex && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] leading-relaxed text-[var(--graphite)]">
            <span className="font-semibold">What happened. </span>
            {ex.what}
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--graphite-2)]">
            <span className="font-semibold text-[var(--graphite)]">Why it matters. </span>
            {ex.why}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-3">
        <p className="eyebrow">What the data shows</p>
        {temp && <AnomalyBars label="Temperature (°C)" unit="°C" observed={temp.mean_observed} expected={temp.mean_expected} />}
        {sal && <AnomalyBars label="Salinity (PSU)" unit=" PSU" observed={sal.mean_observed} expected={sal.mean_expected} />}
        <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">
          On average across{" "}
          <span className="font-semibold text-[var(--graphite)]">{evidence.observation_ids.length} readings</span> from{" "}
          <span className="font-semibold text-[var(--graphite)]">{evidence.float_ids.length} float{evidence.float_ids.length === 1 ? "" : "s"}</span>
          {temp && (
            <>
              , the water measured{" "}
              <span className={`font-semibold ${temp.mean_anomaly >= 0 ? "text-[var(--coral)]" : "text-[var(--cobalt)]"}`}>
                {Math.abs(temp.mean_anomaly).toFixed(2)}°C {temp.mean_anomaly >= 0 ? "warmer" : "cooler"}
              </span>{" "}
              than the long-term normal for this place and season (the biggest single reading was{" "}
              {temp.max_anomaly >= 0 ? "+" : ""}
              {temp.max_anomaly.toFixed(2)}°C)
            </>
          )}
          .
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">{BASELINE_WHAT}</p>
      </div>

      {ex && (
        <div className="mt-4 rounded-lg bg-[var(--paper-2)] p-3">
          <p className="eyebrow mb-1">What usually causes this</p>
          <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">{ex.causes}</p>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className="eyebrow mb-1.5">The trail — pinned to the board</p>
        {/* Keyed on event id so a newly opened case file starts fresh — unrevealed, pins at
            their default spots — instead of inheriting the previous case's progress. */}
        <CorkboardEvidence key={event.id} nodes={corkNodes} />
        <p className="mt-2 font-mono text-[10px] text-[var(--graphite-3)]">
          baseline {evidence.baseline_id} · QC flags {(evidence.qc_summary.qc_flags_used ?? []).join(",") || "—"} (good &amp; probably-good only) ·{" "}
          {event.method.replaceAll("_", " ")}
        </p>
      </div>

      <p className="annotation mt-3 text-[13px]">{HONESTY_LINE}</p>
    </div>
  );
}
