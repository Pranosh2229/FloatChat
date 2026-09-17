import datetime as dt

from sqlalchemy import JSON, DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Event(Base):
    """
    A spatio-temporal grouping of related anomalies. Spec §17 'Event' entity, spec §28's
    basic (non-ML) grouping — `type` is a simple rule-based label (e.g. "surface_warming",
    "subsurface_warming", "uncertain"), not an ML classification.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(32))
    region: Mapped[str] = mapped_column(String(64), index=True)

    start_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    depth_min: Mapped[float] = mapped_column(Float)
    depth_max: Mapped[float] = mapped_column(Float)

    affected_float_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    # The float whose anomalies contributed most (by total |anomaly_value|) to this event —
    # not an ML ranking, just "which real float best represents this event," for the Ask
    # feature's relevance-ranked highlighting (REDESIGN_PLAN.md Phase 0). Nullable so existing
    # rows / a cluster with no anomalies (shouldn't happen, but never assumed) stay valid.
    primary_float_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anomaly_count: Mapped[int] = mapped_column(Integer)

    # Bounding box rather than a full PostGIS polygon — sufficient for "where on the globe"
    # without the extra complexity of true concave-hull geometry for an MVP.
    spatial_extent: Mapped[dict] = mapped_column(JSON)

    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage: Mapped[dict] = mapped_column(JSON, default=dict)
    method: Mapped[str] = mapped_column(String(64))
