import datetime as dt

from pydantic import BaseModel


class ProfileDetail(BaseModel):
    id: int
    float_id: int
    timestamp: dt.datetime
    latitude: float
    longitude: float
    pressure_dbar: list[float]
    temperature_c: list[float | None]
    salinity_psu: list[float | None] | None
    qc_temperature: list[str]
    qc_salinity: list[str] | None
    data_mode: str
    source: str

    model_config = {"from_attributes": True}
