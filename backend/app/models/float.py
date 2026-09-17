import datetime as dt

from geoalchemy2 import Geography
from sqlalchemy import JSON, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ArgoFloat(Base):
    """An ARGO float. Spec §17 'Float' entity."""

    __tablename__ = "floats"

    id: Mapped[int] = mapped_column(primary_key=True)
    wmo_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)

    deployment_lat: Mapped[float] = mapped_column(Float)
    deployment_lon: Mapped[float] = mapped_column(Float)
    deployment_location: Mapped[str] = mapped_column(Geography("POINT", srid=4326))

    latest_lat: Mapped[float] = mapped_column(Float)
    latest_lon: Mapped[float] = mapped_column(Float)
    latest_location: Mapped[str] = mapped_column(Geography("POINT", srid=4326))
    latest_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    depth_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    depth_max: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ARGO data-mode convention: 'R' realtime, 'D' delayed-mode, 'A' adjusted.
    data_mode: Mapped[str] = mapped_column(String(1))

    float_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
