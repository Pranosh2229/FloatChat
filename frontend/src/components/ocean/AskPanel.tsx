"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useOceanStore } from "@/stores/oceanStore";
import type { QueryResponse, RegionInfo } from "@/lib/api";

const INTENT_LABELS: Record<string, string> = {
  explore_region: "Region scan",
  find_events: "Events found",
  find_anomalies: "Anomalies found",
  compare_regions: "Head to head",
  inspect_float: "Float inspected",
  get_thermocline: "Thermocline",
  get_evidence: "Evidence trail",
  surface_subsurface: "Surface → depth",
  explain: "Ocean guide",
};

function regionName(regions: RegionInfo[], key: unknown): string {
  return regions.find((r) => r.key === key)?.name ?? String(key ?? "").replaceAll("_", " ");
}

/** A tiny inline bar — the visual-data rule: the number is the caption, the bar is the fact. */
function Bar({ value, max, color = "var(--cobalt)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(26,26,26,0.1)] align-middle">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

/**
 * Renders a real `/query` response as a short headline plus one small visual — every number
 * comes straight from `response.result` (the backend's controlled tool dispatch), never
 * computed or guessed here. Unknown shapes fall back to a plain "answered" line rather than
 * showing nothing.
 */
function Answer({ response, regions }: { response: QueryResponse; regions: RegionInfo[] }) {
  const { intent, result } = response;
  if (!result) return <p className="text-sm">No answer.</p>;

  if (intent === "explain" && typeof result.answer === "string") {
    return (
      <div className="space-y-2 text-[14px] leading-relaxed text-[var(--graphite)]">
        {result.answer.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    );
  }

  if (intent === "explore_region" && Array.isArray(result.floats)) {
    const n = result.floats.length;
    return (
      <div>
        <p className="font-display text-[22px] leading-tight">
          {n} float{n === 1 ? "" : "s"} in {regionName(regions, result.region)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: Math.min(n, 60) }, (_, i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-[var(--cobalt)]" />
          ))}
          {n > 60 && <span className="ml-1 text-xs text-[var(--graphite-3)]">+{n - 60}</span>}
        </div>
        <p className="mt-2 text-xs text-[var(--graphite-3)]">Highlighted on the map.</p>
      </div>
    );
  }

  if ((intent === "find_events" || intent === "find_anomalies") && Array.isArray(result.events)) {
    const events = result.events as { type: string; anomaly_count: number }[];
    const region = regionName(regions, result.region);
    if (events.length === 0) {
      return <p className="font-display text-[22px] leading-tight">Nothing unusual detected in {region}.</p>;
    }
    const byType = new Map<string, number>();
    for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    const max = Math.max(...byType.values());
    return (
      <div>
        <p className="font-display text-[22px] leading-tight">
          {events.length} event{events.length === 1 ? "" : "s"} in {region}
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {Array.from(byType.entries()).map(([type, count]) => (
            <li key={type} className="flex items-center gap-2">
              <Bar value={count} max={max} color="var(--coral)" />
              <span className="capitalize">{type.replaceAll("_", " ")}</span>
              <span className="text-[var(--graphite-3)]">{count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--graphite-3)]">
          Floats involved are ringed in coral; the timeline jumped to the latest one.
        </p>
      </div>
    );
  }

  if (intent === "compare_regions" && result.region_a && result.region_b) {
    type Stats = { name: string; float_count: number; mean_surface_temperature_c: number | null };
    const a = result.region_a as Stats;
    const b = result.region_b as Stats;
    const maxFloats = Math.max(a.float_count, b.float_count);
    const temps = [a.mean_surface_temperature_c, b.mean_surface_temperature_c].filter(
      (t): t is number => t !== null,
    );
    const maxTemp = temps.length ? Math.max(...temps) : 0;
    return (
      <div>
        <p className="font-display text-[22px] leading-tight">
          {a.name} <span className="italic text-[var(--graphite-3)]">vs</span> {b.name}
        </p>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-[var(--graphite-3)]">Floats</span>
          <span className="flex items-center gap-2">
            <Bar value={a.float_count} max={maxFloats} /> {a.float_count}
            <span className="mx-1 text-[var(--graphite-3)]">·</span>
            <Bar value={b.float_count} max={maxFloats} color="var(--graphite-2)" /> {b.float_count}
          </span>
          <span className="text-[var(--graphite-3)]">Surface °C</span>
          <span className="flex items-center gap-2">
            <Bar value={a.mean_surface_temperature_c ?? 0} max={maxTemp} color="var(--coral)" />
            {a.mean_surface_temperature_c?.toFixed(1) ?? "—"}
            <span className="mx-1 text-[var(--graphite-3)]">·</span>
            <Bar value={b.mean_surface_temperature_c ?? 0} max={maxTemp} color="var(--coral)" />
            {b.mean_surface_temperature_c?.toFixed(1) ?? "—"}
          </span>
        </div>
      </div>
    );
  }

  if (intent === "inspect_float" && result.float) {
    const f = result.float as { wmo_id: string };
    return <p className="font-display text-[22px] leading-tight">Float {f.wmo_id} — flying to it now.</p>;
  }

  if (intent === "get_thermocline") {
    const t = result.thermocline as { depth_m: number; quality: string } | null;
    if (!t) return <p className="text-sm">Not enough usable data on this float&apos;s latest profile to find a thermocline.</p>;
    return (
      <div>
        <p className="font-display text-[22px] leading-tight">Thermocline near {t.depth_m.toFixed(0)} m</p>
        <p className="mt-1 text-xs text-[var(--graphite-3)]">Detection quality: {t.quality}</p>
      </div>
    );
  }

  if (intent === "get_evidence" && result.event && result.evidence) {
    const evidence = result.evidence as { profile_ids: number[]; baseline_id: string };
    return (
      <p className="font-display text-[22px] leading-tight">
        Traced to {evidence.profile_ids.length} real profiles against {evidence.baseline_id}. Case file is open.
      </p>
    );
  }

  if (intent === "surface_subsurface") {
    const r = result.result as
      | { sst_observed_c: number; sst_anomaly_c: number | null; threshold_exceeded: boolean; nearby_floats: unknown[] }
      | null;
    if (!r) return <p className="text-sm">No satellite reading near that spot.</p>;
    const anomaly = r.sst_anomaly_c;
    return (
      <div>
        <p className="font-display text-[22px] leading-tight">
          Surface {r.sst_observed_c.toFixed(1)}°C
          {anomaly !== null && (
            <span className={anomaly >= 0 ? "text-[var(--coral)]" : "text-[var(--cobalt)]"}>
              {" "}
              {anomaly >= 0 ? "+" : ""}
              {anomaly.toFixed(1)}° vs normal
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-[var(--graphite-3)]">
          {r.nearby_floats.length} nearby float{r.nearby_floats.length === 1 ? "" : "s"} show what&apos;s underneath.
        </p>
      </div>
    );
  }

  return <p className="text-sm">Answered — the map shows the result.</p>;
}

/**
 * The Ask bar (Explore's centrepiece). Three honest states — idle, thinking, answered — and,
 * per the redesign, a way *out* of every one of them: Back restores the previous view, Clear
 * wipes the answer, Esc does the same. Idle chips are real detected events (not canned copy)
 * until the user has asked something, then their own recent questions.
 */
export function AskPanel() {
  const [question, setQuestion] = useState("");
  const askQuestion = useOceanStore((s) => s.askQuestion);
  const queryLoading = useOceanStore((s) => s.queryLoading);
  const queryError = useOceanStore((s) => s.queryError);
  const lastQuery = useOceanStore((s) => s.lastQuery);
  const regions = useOceanStore((s) => s.regions);
  const askHistory = useOceanStore((s) => s.askHistory);
  const discoveryEvents = useOceanStore((s) => s.discoveryEvents);
  const viewHistory = useOceanStore((s) => s.viewHistory);
  const goBack = useOceanStore((s) => s.goBack);
  const resetAsk = useOceanStore((s) => s.resetAsk);
  const askFocusRequest = useOceanStore((s) => s.askFocusRequest);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (askFocusRequest > 0) inputRef.current?.focus();
  }, [askFocusRequest]);

  // Recent real questions first (most useful — genuinely re-askable, e.g. after Back restores
  // the view they answered), then the same discovery-event/compare chips fill any remaining
  // slots. Previously this was "history only once you've asked anything," which meant asking a
  // single question shrank the chip row to just that one question, permanently, for the rest of
  // the session — confirmed live as the exact bug reported ("back option, the previously asked
  // question is only present and the other suggestions are not there").
  const suggestions = useMemo(() => {
    const out = [...askHistory].reverse().slice(0, 4);
    const asked = new Set(out.map((q) => q.toLowerCase()));
    const seenRegions = new Set<string>();
    for (const e of discoveryEvents) {
      if (out.length >= 4) break;
      if (seenRegions.has(e.region)) continue;
      seenRegions.add(e.region);
      const chip = `What's unusual in the ${regionName(regions, e.region)}?`;
      if (asked.has(chip.toLowerCase())) continue;
      out.push(chip);
    }
    if (out.length < 4 && regions.length >= 2) {
      const chip = `Compare ${regions[0].name} and ${regions[1].name}`;
      if (!asked.has(chip.toLowerCase())) out.push(chip);
    }
    return out;
  }, [askHistory, discoveryEvents, regions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (lastQuery || queryError)) resetAsk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastQuery, queryError, resetAsk]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || queryLoading) return;
    askQuestion(trimmed);
    setQuestion("");
  };

  const answered = !!lastQuery && !queryLoading;

  return (
    <div className="pointer-events-auto w-full max-w-xl">
      {(answered || queryError) && (
        <div className="card rise mb-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">
              {queryError ? "Couldn't answer" : lastQuery?.clarification_needed ? "Need a detail" : INTENT_LABELS[lastQuery?.intent ?? ""] ?? "Answer"}
            </p>
            <div className="flex gap-1">
              {viewHistory.length > 0 && (
                <button type="button" onClick={goBack} className="btn btn-ghost !px-2.5 !py-1 !text-[11px]">
                  ← Back
                </button>
              )}
              <button type="button" onClick={resetAsk} className="btn btn-ghost !px-2.5 !py-1 !text-[11px]">
                Clear
              </button>
            </div>
          </div>
          <div className="mt-2">
            {queryError && <p className="text-sm text-[var(--coral)]">{queryError}</p>}
            {lastQuery?.clarification_needed && (
              <p className="font-display text-[20px] leading-tight">{lastQuery.clarification_message}</p>
            )}
            {lastQuery && !lastQuery.clarification_needed && !queryError && (
              <Answer response={lastQuery} regions={regions} />
            )}
          </div>
        </div>
      )}

      <div className="card px-3 py-2.5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
          className="flex items-center gap-2"
        >
          <span className="relative ml-1 grid h-5 w-5 shrink-0 place-items-center">
            {queryLoading && <span className="ripple absolute inset-0" />}
            <span className={`h-2 w-2 rounded-full ${queryLoading ? "bg-[var(--cobalt)]" : "bg-[var(--graphite-3)]"}`} />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={queryLoading ? "Reading the ocean…" : "Ask the ocean anything about these waters"}
            disabled={queryLoading}
            className="w-full bg-transparent text-[15px] text-[var(--graphite)] placeholder:text-[var(--graphite-3)] focus:outline-none disabled:opacity-60"
            aria-label="Ask a question about the ocean data"
          />
          <button type="submit" disabled={queryLoading || question.trim().length === 0} className="btn btn-primary !py-2 !text-[12px]">
            Ask
          </button>
        </form>

        {!queryLoading && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[11px] text-[var(--graphite-2)] transition-colors hover:border-[var(--cobalt)] hover:text-[var(--cobalt)]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
