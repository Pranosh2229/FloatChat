import datetime as dt

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SatelliteSST(Base):
    """
    A satellite sea-surface-temperature observation. Not in the spec's original §17 entity
    list — added to support the confirmed Surface->Subsurface investigation feature (Part 7),
    which needs real surface context to hand off to nearby ARGO profiles.
    """

    __tablename__ = "satellite_sst"

    id: Mapped[int] = mapped_column(primary_key=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[str] = mapped_column(Geography("POINT", srid=4326))
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), index=True)

    sst_celsius: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(64))  # e.g. "NOAA OISST v2.1"
