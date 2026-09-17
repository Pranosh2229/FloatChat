import datetime as dt

from pydantic import BaseModel


class EventSummary(BaseModel):
    id: int
    type: str
    region: str
    start_time: dt.datetime
    end_time: dt.datetime
    depth_min: float
    depth_max: float
    affected_float_ids: list[int]
    primary_float_id: int | None
    anomaly_count: int
    spatial_extent: dict
    confidence: float | None
    coverage: dict
    method: str

    model_config = {"from_attributes": True}


class EvidenceOut(BaseModel):
    id: int
    event_id: int | None
    float_ids: list[int]
    profile_ids: list[int]
    observation_ids: list[int]
    baseline_id: str
    calculation: dict
    source: str
    qc_summary: dict
    coverage: dict

    model_config = {"from_attributes": True}
