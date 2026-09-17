import datetime as dt

from pydantic import BaseModel


class FloatSummary(BaseModel):
    id: int
    wmo_id: str
    latest_lat: float
    latest_lon: float
    latest_time: dt.datetime
    depth_min: float | None
    depth_max: float | None
    data_mode: str

    model_config = {"from_attributes": True}


class FloatDetail(FloatSummary):
    deployment_lat: float
    deployment_lon: float
    float_metadata: dict

    model_config = {"from_attributes": True}


class TrajectoryPoint(BaseModel):
    profile_id: int
    timestamp: dt.datetime
    latitude: float
    longitude: float


class TrajectoryResponse(BaseModel):
    float_id: int
    wmo_id: str
    points: list[TrajectoryPoint]
