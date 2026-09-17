from pydantic import BaseModel


class AnomalyOut(BaseModel):
    variable: str
    depth_m: float
    observed_value: float
    expected_value: float
    anomaly_value: float
    baseline_id: str
    method: str


class ThermoclineOut(BaseModel):
    depth_m: float
    min_depth_m: float
    max_depth_m: float
    max_gradient_c_per_m: float
    method: str
    quality: str


class NearbyFloatOut(BaseModel):
    float_id: int
    wmo_id: str
    distance_km: float
    profile_id: int
    profile_timestamp: str
    thermocline: ThermoclineOut | None
    anomalies: list[AnomalyOut]


class SurfaceSubsurfaceOut(BaseModel):
    query_lat: float
    query_lon: float
    sst_observed_c: float
    sst_expected_c: float | None
    sst_anomaly_c: float | None
    sst_timestamp: str
    threshold_exceeded: bool
    baseline_id: str
    method: str
    nearby_floats: list[NearbyFloatOut]
