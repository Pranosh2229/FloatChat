from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Anomaly(Base):
    """Observed vs. expected at one depth on one profile. Spec §17 'Anomaly' entity."""

    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"), index=True)

    variable: Mapped[str] = mapped_column(String(32))  # "temperature" | "salinity"
    depth_m: Mapped[float] = mapped_column(Float)

    observed_value: Mapped[float] = mapped_column(Float)
    expected_value: Mapped[float] = mapped_column(Float)
    anomaly_value: Mapped[float] = mapped_column(Float)

    baseline_id: Mapped[str] = mapped_column(String(32))  # e.g. "WOA23"
    method: Mapped[str] = mapped_column(String(64))  # e.g. "seasonal_climatology"
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality: Mapped[str | None] = mapped_column(String(32), nullable=True)
