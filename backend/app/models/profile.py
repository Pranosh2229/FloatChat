import datetime as dt

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Profile(Base):
    """
    A single ARGO profile — one float's water-column sample at one point in time.
    Spec §17 'Profile' entity. The spec lists pressure/temperature/salinity/QC as if they were
    scalar fields, but a real profile has many depth levels — modeled here as parallel arrays
    (same length, aligned by index), which is how xarray hands the data over during ingestion
    and how the frontend depth-profile chart wants to consume it (one profile -> one array of
    depth-indexed points), rather than a separate per-level table.
    """

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    float_id: Mapped[int] = mapped_column(ForeignKey("floats.id"), index=True)

    timestamp: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[str] = mapped_column(Geography("POINT", srid=4326))

    # Parallel arrays, one entry per depth level, aligned by index. Individual elements can be
    # None (a missing reading at that level, QC-flagged "9") even though the array itself isn't.
    pressure_dbar: Mapped[list[float]] = mapped_column(ARRAY(Float))
    temperature_c: Mapped[list[float | None]] = mapped_column(ARRAY(Float))
    salinity_psu: Mapped[list[float | None] | None] = mapped_column(ARRAY(Float), nullable=True)
    qc_temperature: Mapped[list[str]] = mapped_column(ARRAY(String(1)))
    qc_salinity: Mapped[list[str] | None] = mapped_column(ARRAY(String(1)), nullable=True)

    data_mode: Mapped[str] = mapped_column(String(1))
    source: Mapped[str] = mapped_column(String(64), default="argo_gdac")
