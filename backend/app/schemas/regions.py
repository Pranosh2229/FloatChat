from pydantic import BaseModel


class RegionInfo(BaseModel):
    key: str
    name: str
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


class RegionStats(BaseModel):
    key: str
    name: str
    float_count: int
    profile_count: int
    mean_surface_temperature_c: float | None
    mean_surface_salinity_psu: float | None


class CompareResponse(BaseModel):
    region_a: RegionStats
    region_b: RegionStats


class RegionAggregateStats(BaseModel):
    key: str
    name: str
    float_count: int
    profile_count: int
    event_count: int
    sst_point_count: int


class DashboardStats(BaseModel):
    """
    Mission-control overview across all 11 regions (REDESIGN_PLAN.md's Dashboard page) — real
    totals and a per-region breakdown, not a single hardcoded demo number.
    """

    total_regions: int
    total_floats: int
    total_profiles: int
    total_events: int
    total_sst_points: int
    regions: list[RegionAggregateStats]
    # The region with the most detected events right now — None only when every region has zero
    # events (e.g. before `scripts/detect_events.py` has ever been run), never a guess.
    most_active_region_key: str | None
