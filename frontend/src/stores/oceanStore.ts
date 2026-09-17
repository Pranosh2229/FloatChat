import { create } from "zustand";

import {
  api,
  type EventSummary,
  type EvidenceOut,
  type FloatDetail,
  type FloatSummary,
  type ProfileDetail,
  type QueryContext,
  type QueryResponse,
  type RegionInfo,
  type RegionStats,
  type ThermoclineOut,
  type TrajectoryResponse,
} from "@/lib/api";
import { regionCentroid } from "@/components/ocean/geo";
import { DEFAULT_BAND, type AltitudeBand } from "@/components/ocean/worldCamera";
import type { RegionSelection } from "@/components/ocean/types";

/**
 * Centralized ocean state (spec §38) — the single source of truth every visual layer (globe,
 * float/trajectory layers, timeline, info panels) reads from, replacing the prop-drilled
 * per-component state Parts 1-2 used. Deliberately smaller than the spec's full schema: only
 * the fields something in this codebase actually reads or writes. Extend it when a real
 * consumer needs a new field, not preemptively.
 */

// The ingestion window is a rolling 24 months to today (backend `regions.ingestion_window`).
// The end of the scrubbable range is refined to the real latest observation once floats load,
// and the start is always 24 months before that end.
const INGESTION_MONTHS = 24;
const INGESTION_END = new Date();
const INGESTION_START = new Date(INGESTION_END.getFullYear(), INGESTION_END.getMonth() - INGESTION_MONTHS, 1);

interface OceanState {
  // Floats (loaded once, shared by every consumer)
  floats: FloatSummary[];
  floatsLoading: boolean;
  // Part 12 hardening: set when the initial floats fetch itself fails (backend unreachable,
  // not just "genuinely zero floats") — `page.tsx` shows a real banner instead of a silently
  // empty globe a judge has no way to explain.
  floatsError: string | null;
  loadFloats: () => Promise<void>;

  // Timeline
  timeRange: { start: Date; end: Date };
  currentTime: Date;
  setCurrentTime: (time: Date) => void;

  // Selection
  selectedFloatId: number | null;
  floatDetail: FloatDetail | null;
  trajectory: TrajectoryResponse | null;
  // The float's latest real profile (full pressure/temperature/salinity arrays) and its
  // deterministic thermocline detection — fetched once the trajectory reveals which profile is
  // latest. Phase 2's real depth-vs-temperature chart reads these directly; never fabricated
  // client-side.
  latestProfile: ProfileDetail | null;
  latestThermocline: ThermoclineOut | null;
  selection: RegionSelection | null;
  selectFloat: (float: FloatSummary) => void;
  clearFloatSelection: () => void;
  setRegionSelection: (selection: RegionSelection | null) => void;

  // Named regions (for resolving a query's region key to a fly-to target) — loaded once.
  regions: RegionInfo[];
  loadRegions: () => Promise<void>;

  // Part 10: Question -> World. A question's answer changes this same ocean state rather than
  // being a separate chat transcript — the globe/timeline/highlighted floats ARE the answer.
  lastQuery: QueryResponse | null;
  queryLoading: boolean;
  queryError: string | null;
  askQuestion: (question: string) => Promise<void>;
  highlightedFloatIds: number[];
  // Among `highlightedFloatIds`, the one that actually drove the anomaly most strongly (real
  // `Event.primary_float_id` from the backend — never guessed client-side). `null` whenever an
  // answer doesn't have a meaningful "most important one" (e.g. a plain region float list).
  primaryFloatId: number | null;
  // `band` picks which altitude the camera settles at (see worldCamera.ts BANDS): a whole
  // region for region-level answers, float level for a specific point/float. Defaults to region.
  flyToTarget: {
    lat: number;
    lon: number;
    band?: AltitudeBand["key"];
    // True when restoring a previous view via `goBack` — WorldNavigator must not push another
    // history entry for it, or Back would ping-pong forever.
    restoring?: boolean;
    // True only for a resolved Ask answer (REDESIGN_PLAN.md decision #8): WorldNavigator runs
    // the 3-beat pull-back / arc / dive sequence instead of a plain direct fly-to. Discovery
    // cards, comparisons, Back, and the Dashboard CTA all stay a plain fly-to on purpose — the
    // cinematic treatment is specifically the payoff of asking a question, not every navigation.
    cinematic?: boolean;
  } | null;
  clearFlyToTarget: () => void;
  setFlyToTarget: (target: NonNullable<OceanState["flyToTarget"]>) => void;

  // Redesign Phase 1: which altitude band the free-roam camera is currently in. Written by
  // WorldNavigator only when a band transition *starts* (not per frame), read by the HUD/hints.
  altitudeBand: number;
  setAltitudeBand: (band: number) => void;

  // Redesign: an answer never traps the user. Before any store-driven camera move,
  // WorldNavigator pushes where the camera *was*; `goBack` pops it, restores the view, and
  // clears whatever that answer put on screen. `askHistory` is the running list of questions
  // asked this session, shown as re-askable chips.
  viewHistory: { lat: number; lon: number; band: AltitudeBand["key"] }[];
  pushView: (view: { lat: number; lon: number; band: AltitudeBand["key"] }) => void;
  goBack: () => void;
  resetAsk: () => void;
  askHistory: string[];
  // Nav's "Ask the ocean" button: bumps this so the Ask input focuses (on whichever page it
  // lands, since the store outlives route changes).
  askFocusRequest: number;
  requestAskFocus: () => void;

  // Part 11: Discovery Mode — real detected events as an idle-state entry point, so a judge
  // has something to click before they've typed a single question.
  discoveryEvents: EventSummary[];
  discoveryLoading: boolean;
  loadDiscoveryEvents: () => Promise<void>;

  // Part 11: Evidence panel (CONCLUSION -> WHY -> EVIDENCE), reachable either by clicking a
  // Discovery card or by a contextual "how do you know?" question once an event is selected.
  selectedEventId: number | null;
  eventDetail: EventSummary | null;
  evidence: EvidenceOut | null;
  selectEvent: (eventId: number) => Promise<void>;
  clearEventSelection: () => void;

  // Part 11: Regional comparison — a dedicated side-by-side view over the same real `/compare`
  // stats the Ask bar's `compare_regions` intent already surfaces as text.
  comparison: { region_a: RegionStats; region_b: RegionStats } | null;
  comparisonLoading: boolean;
  loadComparison: (regionA: string, regionB: string) => Promise<void>;
  clearComparison: () => void;
}

export const useOceanStore = create<OceanState>((set, get) => ({
  floats: [],
  floatsLoading: false,
  floatsError: null,
  loadFloats: async () => {
    if (get().floatsLoading || get().floats.length > 0) return;
    set({ floatsLoading: true, floatsError: null });
    try {
      const floats = await api.floats();
      const latestTimes = floats.map((f) => new Date(f.latest_time).getTime());
      const observedEnd = latestTimes.length > 0 ? new Date(Math.max(...latestTimes)) : INGESTION_END;
      const observedStart = new Date(observedEnd.getFullYear(), observedEnd.getMonth() - INGESTION_MONTHS, 1);
      set((state) => ({
        floats,
        floatsLoading: false,
        timeRange: { start: observedStart, end: observedEnd },
        currentTime: observedEnd < state.currentTime ? observedEnd : state.currentTime,
      }));
    } catch (error) {
      console.error("Failed to load floats:", error);
      set({
        floatsLoading: false,
        floatsError: error instanceof Error ? error.message : "Failed to load floats",
      });
    }
  },

  timeRange: { start: INGESTION_START, end: INGESTION_END },
  currentTime: INGESTION_END,
  setCurrentTime: (time) => set({ currentTime: time }),

  selectedFloatId: null,
  floatDetail: null,
  trajectory: null,
  latestProfile: null,
  latestThermocline: null,
  selection: null,

  selectFloat: (float) => {
    // Selecting a float is a fresh focus — drop whatever else was showing in the same header
    // slot (an event's evidence, a region comparison) rather than stacking panels.
    set({
      selectedFloatId: float.id,
      selection: null,
      floatDetail: null,
      trajectory: null,
      latestProfile: null,
      latestThermocline: null,
      selectedEventId: null,
      eventDetail: null,
      evidence: null,
      comparison: null,
    });
    const requestedId = float.id;
    api
      .floatDetail(float.id)
      .then((detail) => {
        if (get().selectedFloatId === requestedId) set({ floatDetail: detail });
      })
      .catch((error) => console.error("Failed to load float detail:", error));
    api
      .floatTrajectory(float.id)
      .then((trajectory) => {
        if (get().selectedFloatId !== requestedId) return;
        set({ trajectory });
        // Trajectory points are time-ordered ascending (TrajectoryLayer relies on this too) —
        // the last one is the float's most recent real profile, the one the depth chart shows.
        const latest = trajectory.points[trajectory.points.length - 1];
        if (!latest) return;
        api
          .profile(latest.profile_id)
          .then((profile) => {
            if (get().selectedFloatId === requestedId) set({ latestProfile: profile });
          })
          .catch((error) => console.error("Failed to load latest profile:", error));
        api
          .thermocline(latest.profile_id)
          .then((thermocline) => {
            if (get().selectedFloatId === requestedId) set({ latestThermocline: thermocline });
          })
          .catch((error) => console.error("Failed to load thermocline:", error));
      })
      .catch((error) => console.error("Failed to load trajectory:", error));
  },
  clearFloatSelection: () =>
    set({
      selectedFloatId: null,
      floatDetail: null,
      trajectory: null,
      latestProfile: null,
      latestThermocline: null,
    }),
  setRegionSelection: (selection) =>
    set({
      selection,
      selectedFloatId: null,
      selectedEventId: null,
      eventDetail: null,
      evidence: null,
      comparison: null,
    }),

  regions: [],
  loadRegions: async () => {
    if (get().regions.length > 0) return;
    try {
      set({ regions: await api.regions() });
    } catch (error) {
      console.error("Failed to load regions:", error);
    }
  },

  discoveryEvents: [],
  discoveryLoading: false,
  loadDiscoveryEvents: async () => {
    if (get().discoveryLoading || get().discoveryEvents.length > 0) return;
    set({ discoveryLoading: true });
    try {
      // Already ordered by anomaly_count desc server-side (GET /events) — the most notable
      // real detected patterns surface first, not an arbitrary/insertion order.
      const events = await api.events();
      set({ discoveryEvents: events.slice(0, 6), discoveryLoading: false });
    } catch (error) {
      console.error("Failed to load discovery events:", error);
      set({ discoveryLoading: false });
    }
  },

  selectedEventId: null,
  eventDetail: null,
  evidence: null,
  selectEvent: async (eventId) => {
    set({
      selectedEventId: eventId,
      eventDetail: null,
      evidence: null,
      selectedFloatId: null,
      floatDetail: null,
      trajectory: null,
      latestProfile: null,
      latestThermocline: null,
      selection: null,
      comparison: null,
    });
    try {
      const [eventDetail, evidence] = await Promise.all([
        api.event(eventId),
        api.eventEvidence(eventId),
      ]);
      if (get().selectedEventId !== eventId) return; // superseded by a newer selection
      set({
        eventDetail,
        evidence,
        highlightedFloatIds: eventDetail.affected_float_ids,
        primaryFloatId: eventDetail.primary_float_id,
      });
      const region = get().regions.find((r) => r.key === eventDetail.region);
      if (region) set({ flyToTarget: regionCentroid(region) });
    } catch (error) {
      console.error("Failed to load event evidence:", error);
    }
  },
  clearEventSelection: () =>
    set({
      selectedEventId: null,
      eventDetail: null,
      evidence: null,
      highlightedFloatIds: [],
      primaryFloatId: null,
    }),

  comparison: null,
  comparisonLoading: false,
  loadComparison: async (regionA, regionB) => {
    set({
      comparisonLoading: true,
      selectedFloatId: null,
      floatDetail: null,
      trajectory: null,
      latestProfile: null,
      latestThermocline: null,
      selectedEventId: null,
      eventDetail: null,
      evidence: null,
      selection: null,
    });
    try {
      const comparison = await api.compare(regionA, regionB);
      set({ comparison, comparisonLoading: false });
      const region = get().regions.find((r) => r.key === regionA);
      if (region) set({ flyToTarget: regionCentroid(region) });
    } catch (error) {
      console.error("Failed to load region comparison:", error);
      set({ comparisonLoading: false });
    }
  },
  clearComparison: () => set({ comparison: null }),

  lastQuery: null,
  queryLoading: false,
  queryError: null,
  highlightedFloatIds: [],
  primaryFloatId: null,
  flyToTarget: null,
  clearFlyToTarget: () => set({ flyToTarget: null }),
  setFlyToTarget: (target) => set({ flyToTarget: target }),
  altitudeBand: DEFAULT_BAND,
  setAltitudeBand: (band) => set({ altitudeBand: band }),

  viewHistory: [],
  pushView: (view) => set((state) => ({ viewHistory: [...state.viewHistory.slice(-19), view] })),
  goBack: () => {
    const history = get().viewHistory;
    const previous = history[history.length - 1];
    get().resetAsk();
    if (!previous) return;
    set({
      viewHistory: history.slice(0, -1),
      flyToTarget: { lat: previous.lat, lon: previous.lon, band: previous.band, restoring: true },
    });
  },
  resetAsk: () =>
    set({
      lastQuery: null,
      queryError: null,
      highlightedFloatIds: [],
      primaryFloatId: null,
      selectedFloatId: null,
      floatDetail: null,
      trajectory: null,
      latestProfile: null,
      latestThermocline: null,
      selectedEventId: null,
      eventDetail: null,
      evidence: null,
      comparison: null,
      selection: null,
    }),
  askHistory: [],
  askFocusRequest: 0,
  requestAskFocus: () => set((state) => ({ askFocusRequest: state.askFocusRequest + 1 })),

  askQuestion: async (question) => {
    set((state) => ({
      queryLoading: true,
      queryError: null,
      askHistory: state.askHistory.includes(question)
        ? state.askHistory
        : [...state.askHistory.slice(-7), question],
    }));
    const state = get();
    // Whatever's already selected in the UI — the backend never guesses a float/event that
    // wasn't actually clicked, so this is the only way `inspect_float`/`get_thermocline`/
    // `get_evidence` can resolve at all. A Discovery card (or `selectEvent`) sets
    // `selectedEventId`, making "how do you know?" work as a genuine contextual follow-up.
    const context: QueryContext = {
      selected_float_id: state.selectedFloatId,
      selected_event_id: state.selectedEventId,
      lat: state.selection?.lat ?? null,
      lon: state.selection?.lon ?? null,
    };
    try {
      const response = await api.query(question, context);
      set({ lastQuery: response, queryLoading: false });
      applyQueryVisualization(response, get, set);
    } catch (error) {
      console.error("Query failed:", error);
      set({
        queryLoading: false,
        queryError: error instanceof Error ? error.message : "Query failed",
      });
    }
  },
}));

/**
 * Turns a real `/query` response into ocean-state changes — the literal "Question -> World"
 * mechanism (spec §8/§41): a question's answer is the world changing, not a chat bubble. Reads
 * only fields the backend actually returned for that specific intent (`app/query/tools.py`);
 * never infers or fabricates a float/region/time it didn't get back.
 */
function applyQueryVisualization(
  response: QueryResponse,
  get: () => OceanState,
  set: (partial: Partial<OceanState>) => void,
) {
  if (response.clarification_needed || !response.query || !response.result) {
    set({ highlightedFloatIds: [], primaryFloatId: null });
    return;
  }

  const { intent, spatial, visualization } = response.query;
  const result = response.result;

  if (visualization.fly_to_region && spatial.region) {
    const region = get().regions.find((r) => r.key === spatial.region);
    if (region) set({ flyToTarget: { ...regionCentroid(region), cinematic: true } });
  }

  if (intent === "explore_region" && Array.isArray(result.floats)) {
    const floats = result.floats as FloatSummary[];
    set({ highlightedFloatIds: floats.map((f) => f.id), primaryFloatId: null });
    return;
  }

  if ((intent === "find_events" || intent === "find_anomalies") && Array.isArray(result.events)) {
    const events = result.events as {
      affected_float_ids: number[];
      primary_float_id: number | null;
      end_time: string;
    }[];
    const ids = Array.from(new Set(events.flatMap((e) => e.affected_float_ids)));
    // `/events` (and this same query) already orders by anomaly_count desc server-side, so the
    // first event here is genuinely the most notable one this answer surfaced — its primary
    // float is what should read as visually primary among everything highlighted.
    set({ highlightedFloatIds: ids, primaryFloatId: events[0]?.primary_float_id ?? null });
    // Real event end-times, not a fabricated "5 years ago" — jump the timeline to the most
    // recent event this answer surfaced, so the highlighted floats read as "active then."
    const latestEnd = events.reduce<Date | null>((latest, e) => {
      const t = new Date(e.end_time);
      return !latest || t > latest ? t : latest;
    }, null);
    if (latestEnd) set({ currentTime: latestEnd });
    return;
  }

  if (intent === "surface_subsurface") {
    const lat = result.lat as number | null;
    const lon = result.lon as number | null;
    if (typeof lat === "number" && typeof lon === "number") {
      set({ flyToTarget: { lat, lon, band: "floats", cinematic: true } });
    }
    const nested = result.result as { nearby_floats?: { float_id: number }[] } | null;
    set({ highlightedFloatIds: nested?.nearby_floats?.map((f) => f.float_id) ?? [], primaryFloatId: null });
    return;
  }

  if (intent === "inspect_float" && result.float) {
    const detail = result.float as FloatDetail;
    const trajectory = (result.trajectory as TrajectoryResponse | undefined) ?? null;
    set({
      selectedFloatId: detail.id,
      floatDetail: detail,
      trajectory,
      latestProfile: null,
      latestThermocline: null,
      selection: null,
      highlightedFloatIds: [detail.id],
      primaryFloatId: null,
      // In a free-roam world the float may be nowhere near the camera — go to it.
      flyToTarget: { lat: detail.latest_lat, lon: detail.latest_lon, band: "floats", cinematic: true },
    });
    // Same latest-real-profile fetch selectFloat does — this path arrives via a query answer
    // rather than a click, but the depth chart needs the same data either way.
    const latest = trajectory?.points[trajectory.points.length - 1];
    if (latest) {
      api
        .profile(latest.profile_id)
        .then((profile) => {
          if (get().selectedFloatId === detail.id) set({ latestProfile: profile });
        })
        .catch((error) => console.error("Failed to load latest profile:", error));
      api
        .thermocline(latest.profile_id)
        .then((thermocline) => {
          if (get().selectedFloatId === detail.id) set({ latestThermocline: thermocline });
        })
        .catch((error) => console.error("Failed to load thermocline:", error));
    }
    return;
  }

  if (intent === "get_evidence" && result.event && result.evidence) {
    const eventDetail = result.event as EventSummary;
    const evidence = result.evidence as EvidenceOut;
    set({
      selectedEventId: eventDetail.id,
      eventDetail,
      evidence,
      highlightedFloatIds: eventDetail.affected_float_ids,
      primaryFloatId: eventDetail.primary_float_id,
    });
    return;
  }

  if (intent === "compare_regions" && result.region_a && result.region_b) {
    set({
      comparison: result as unknown as { region_a: RegionStats; region_b: RegionStats },
      highlightedFloatIds: [],
      primaryFloatId: null,
    });
    return;
  }

  set({ highlightedFloatIds: [], primaryFloatId: null });
}
