const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FloatSummary {
  id: number;
  wmo_id: string;
  latest_lat: number;
  latest_lon: number;
  latest_time: string;
  depth_min: number | null;
  depth_max: number | null;
  data_mode: string;
}

export interface FloatDetail extends FloatSummary {
  deployment_lat: number;
  deployment_lon: number;
  float_metadata: Record<string, unknown>;
}

export interface TrajectoryPoint {
  profile_id: number;
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface TrajectoryResponse {
  float_id: number;
  wmo_id: string;
  points: TrajectoryPoint[];
}

export interface ProfileDetail {
  id: number;
  float_id: number;
  timestamp: string;
  latitude: number;
  longitude: number;
  pressure_dbar: number[];
  temperature_c: (number | null)[];
  salinity_psu: (number | null)[] | null;
  qc_temperature: string[];
  qc_salinity: string[] | null;
  data_mode: string;
  source: string;
}

export interface ThermoclineOut {
  depth_m: number;
  min_depth_m: number;
  max_depth_m: number;
  max_gradient_c_per_m: number;
  method: string;
  quality: "clear" | "weak" | "insufficient_data";
}

export interface RegionInfo {
  key: string;
  name: string;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface RegionStats {
  key: string;
  name: string;
  float_count: number;
  profile_count: number;
  mean_surface_temperature_c: number | null;
  mean_surface_salinity_psu: number | null;
}

// --- Part 8: events & evidence ---

export interface EventSummary {
  id: number;
  type: string;
  region: string;
  start_time: string;
  end_time: string;
  depth_min: number;
  depth_max: number;
  affected_float_ids: number[];
  primary_float_id: number | null;
  anomaly_count: number;
  spatial_extent: Record<string, unknown>;
  confidence: number | null;
  coverage: { profile_count: number; float_count: number; observation_count: number };
  method: string;
}

interface VariableCalculation {
  count: number;
  mean_observed: number;
  mean_expected: number;
  mean_anomaly: number;
  min_anomaly: number;
  max_anomaly: number;
}

export interface EvidenceOut {
  id: number;
  event_id: number | null;
  float_ids: number[];
  profile_ids: number[];
  observation_ids: number[];
  baseline_id: string;
  calculation: { temperature: VariableCalculation | null; salinity: VariableCalculation | null };
  source: string;
  qc_summary: { qc_flags_used?: string[] };
  coverage: { profile_count: number; float_count: number; observation_count: number };
}

// --- Redesign Phase 0: Dashboard aggregate stats ---

export interface RegionAggregateStats {
  key: string;
  name: string;
  float_count: number;
  profile_count: number;
  event_count: number;
  sst_point_count: number;
}

export interface DashboardStats {
  total_regions: number;
  total_floats: number;
  total_profiles: number;
  total_events: number;
  total_sst_points: number;
  regions: RegionAggregateStats[];
  most_active_region_key: string | null;
}

// --- Part 9/10: LLM query layer ---

export interface QueryContext {
  selected_region?: string | null;
  selected_float_id?: number | null;
  selected_event_id?: number | null;
  lat?: number | null;
  lon?: number | null;
}

export interface OceanQuery {
  intent: string;
  spatial: { region: string | null; region_b: string | null; lat: number | null; lon: number | null };
  temporal: { start: string | null; end: string | null };
  depth: { min_m: number | null; max_m: number | null };
  variables: string[];
  visualization: {
    fly_to_region: boolean;
    update_timeline: boolean;
    highlight_floats: boolean;
    show_anomalies: boolean;
  };
}

export interface QueryResponse {
  intent: string;
  clarification_needed: boolean;
  clarification_message: string | null;
  query: OceanQuery | null;
  // Shape depends on `intent` — see backend/app/query/tools.py, mirrored loosely below in
  // stores/oceanStore.ts's per-intent handling. Never assume a field is present without
  // checking; a `null`/missing field means the backend genuinely has nothing there, not that
  // this type is wrong.
  result: Record<string, unknown> | null;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, `${path} -> ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  regions: () => apiFetch<RegionInfo[]>("/regions"),
  floats: () => apiFetch<FloatSummary[]>("/floats"),
  floatDetail: (id: number) => apiFetch<FloatDetail>(`/floats/${id}`),
  floatTrajectory: (id: number) => apiFetch<TrajectoryResponse>(`/floats/${id}/trajectory`),
  profile: (id: number) => apiFetch<ProfileDetail>(`/profiles/${id}`),
  thermocline: (profileId: number) =>
    apiFetch<ThermoclineOut | null>(`/profiles/${profileId}/thermocline`),
  events: (region?: string) =>
    apiFetch<EventSummary[]>(`/events${region ? `?region=${region}` : ""}`),
  event: (id: number) => apiFetch<EventSummary>(`/events/${id}`),
  eventEvidence: (id: number) => apiFetch<EvidenceOut>(`/events/${id}/evidence`),
  dashboardStats: () => apiFetch<DashboardStats>("/dashboard/stats"),
  compare: (regionA: string, regionB: string) =>
    apiFetch<{ region_a: RegionStats; region_b: RegionStats }>(
      `/compare?region_a=${regionA}&region_b=${regionB}`,
      { method: "POST" },
    ),
  query: (question: string, context?: QueryContext) =>
    apiFetch<QueryResponse>("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    }),
};

export { ApiError };
