from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Evidence(Base):
    """
    Connects a conclusion back to the observations/calculation behind it. Spec §17 'Evidence'
    entity and §35 evidence graph. `event_id` is nullable so a single-anomaly answer (no
    clustered event yet) can still carry evidence, not just event-level conclusions.
    """

    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id"), nullable=True, index=True)

    float_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    profile_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    observation_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)

    baseline_id: Mapped[str] = mapped_column(String(32))
    calculation: Mapped[dict] = mapped_column(JSON)  # observed/expected/anomaly/method breakdown
    source: Mapped[str] = mapped_column(String(64))
    qc_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    coverage: Mapped[dict] = mapped_column(JSON, default=dict)
